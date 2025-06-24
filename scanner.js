import config from './config';
import * as binance from './binanceApi';
import { chatCompletion } from './openaiApi';
import { buildFilterPairsPrompt, buildSignalPrompt } from './models';
import { getBidAskImbalance, getDeltaVolume, getTapeSpeed } from './tapeMetrics';
import { calculateRSI, calculateEMA } from './indicatorUtils';
import { items } from '@wix/data';

const hourUTC = new Date().getUTCHours();


function getVolatilityType({ atr, tapeSpeed, deltaVolume }) {
    const v = config.volatilityThresholds;
    if (atr > v.explosive && tapeSpeed > 2000 && deltaVolume > 1_500_000) return 'explosive';
    if (atr > v.high && tapeSpeed > 1000) return 'high';
    if (atr > v.stable) return 'stable';
    return 'calm';
}


function getAdaptiveFilters(category, isNight) {
  
    const baseVol = config.minVolume24h;
    const baseSpread = config.maxSpreadPct;
    const baseOI = config.minOpenInterest;
    const baseTape = isNight ? config.minTapeSpeedNight : config.minTapeSpeedDay;
    const baseDelta = isNight ? config.minDeltaVolumeNight : config.minDeltaVolumeDay;

    let volumeMult, spreadMult, oiMult, tapeMult, deltaMult;

    switch (category) {
    case 'calm':
        volumeMult = 0.8; 
        spreadMult = 1.2; 
        oiMult = 0.8;
        tapeMult = 0.8;
        deltaMult = 0.8;
        break;
    case 'stable':
        volumeMult = 1.0;
        spreadMult = 1.0;
        oiMult = 1.0;
        tapeMult = 1.0;
        deltaMult = 1.0;
        break;
    case 'high':
        volumeMult = 1.2;
        spreadMult = 0.8; 
        oiMult = 1.2;
        tapeMult = 1.2;
        deltaMult = 1.2;
        break;
    case 'explosive':
        volumeMult = 1.5;
        spreadMult = 0.5; 
        oiMult = 1.5;
        tapeMult = 1.5;
        deltaMult = 1.5;
        break;
    default:
        volumeMult = 1.0;
        spreadMult = 1.0;
        oiMult = 1.0;
        tapeMult = 1.0;
        deltaMult = 1.0;
    }

    return {
        minVolume24h: baseVol * volumeMult,
        maxSpreadPct: baseSpread * spreadMult,
        minOpenInterest: baseOI * oiMult,
        minTapeSpeed: baseTape * tapeMult,
        minDeltaVolume: baseDelta * deltaMult
    };
}

async function fetchWithRetry(fn, symbol, attempts = 3) {
    for (let i = 1; i <= attempts; i++) {
        try {
            return await fn(symbol);
        } catch (err) {
            console.warn(`⚠️ [${symbol}] fetch attempt ${i} failed:`, err.message);
            if (i < attempts) await new Promise(r => setTimeout(r, i * 200));
            else throw err;
        }
    }
}

async function batchFetchSpreadTrades(list, batchSize = 20, pauseMs = 200) {
    const pairs = [];
    for (let i = 0; i < list.length; i += batchSize) {
        const batch = list.slice(i, i + batchSize);
        const res = await Promise.all(
            batch.map(t =>
                fetchWithRetry(binance.getSpread, t.symbol)
                .then(spread =>
                    fetchWithRetry(binance.getAggTrades, t.symbol).then(trades => [spread, trades])
                )
                .catch(err => {
                    console.warn(`⚠️ batch error for ${t.symbol}:`, err.message);
                    return null;
                })
            )
        );
        pairs.push(...res);
        if (i + batchSize < list.length) await new Promise(r => setTimeout(r, pauseMs));
    }
    return pairs;
}

async function mapInBatches(items, fn, batchSize = 20, pauseMs = 200) {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const res = await Promise.all(
            batch.map(item =>
                fn(item).catch(err => {
                    console.warn(`⚠️ batch error for item ${item.symbol || item}:`, err);
                    return null;
                })
            )
        );
        results.push(...res);
        if (i + batchSize < items.length) await new Promise(r => setTimeout(r, pauseMs));
    }
    return results;
}

function getTrendMeta(candles) {
    if (!candles || candles.length < 2) {
        return { trendStrength: 0, trendDirection: 0 };
    }
    const up = candles.filter((c, i) => i > 0 && c.close > candles[i - 1].close).length;
    const down = candles.length - 1 - up;
    const trendStrength = +(Math.abs(up - down) / (candles.length - 1)).toFixed(2);
    let trendDirection = 0;
    if (trendStrength >= config.minTrendStrength) {
        trendDirection = up > down ? 1 : -1;
    }
    return { trendStrength, trendDirection };
}

export async function scanAndSignal() {
    console.log('🔍 [scanAndSignal] Start');

 
    const rsiPeriod = config.rsiPeriod ?? 14;
    const emaPeriod = config.emaPeriod ?? 9;

   
    let info;
    try {
        info = await binance.getExchangeInfoCached();
    } catch (err) {
        console.warn('⚠️ Failed to get exchangeInfo:', err.message);
        info = { symbols: [] };
    }

    
    let allTickers = [];
    try {
        allTickers = await binance.getFiltered24hrTickers();
    } catch (err) {
        console.warn('⚠️ Failed to get 24h tickers for volumes:', err.message);
    }
    const volumeMap = Object.fromEntries(
        allTickers.map(t => [t.symbol, parseFloat(t.quoteVolume) || 0])
    );

   
    const marketContext = {
        timestamp: new Date().toISOString(),
        totalOpenInterest: 0,
        topSymbols: []
    };
    const topByVolume = info.symbols
        .filter(s => s.status === 'TRADING' && s.symbol.endsWith('USDT'))
        .sort((a, b) => (volumeMap[b.symbol] || 0) - (volumeMap[a.symbol] || 0))
        .slice(0, 5);
    const oiList = await Promise.all(
        topByVolume.map(t =>
            binance.getOpenInterest(t.symbol).catch(() => ({ openInterest: 0 }))
        )
    );
    marketContext.totalOpenInterest = oiList.reduce(
        (sum, o) => sum + parseFloat(o.openInterest || 0),
        0
    );
    marketContext.topSymbols = topByVolume.map((t, i) => ({
        symbol: t.symbol,
        oi: parseFloat(oiList[i]?.openInterest || 0),
        volume: volumeMap[t.symbol] || 0
    }));

 
    const tradingSymbols = new Set(
        info.symbols
        .filter(s => s.status === 'TRADING' && s.symbol.endsWith('USDT'))
        .map(s => s.symbol)
    );
    console.log(`📈 Received ${tradingSymbols.size} active symbols`);

    
    const all = await binance.getFiltered24hrTickers();
    console.log(`📊 Total tickers: ${all.length}`);
    const preList = all
        .filter(t => !tradingSymbols.size || tradingSymbols.has(t.symbol))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, config.preFilterLimit);
    console.log(`🧪 Selected ${preList.length} tickers for analysis`);

  
    const initialData = await mapInBatches(
        preList,
        async t => {
                const fr = await fetchWithRetry(binance.getFundingRate, t.symbol).catch(() => 0);
                const kl = await fetchWithRetry(
                    s => binance.getKlines(s, config.candlesInterval, rsiPeriod + 1),
                    t.symbol
                ).catch(() => []);
                const closes = kl.map(k => +k[4]);

                const rsiRaw = closes.length ? calculateRSI(closes, rsiPeriod) : null;
                const emaRaw = closes.length ? calculateEMA(closes, emaPeriod) : null;

                return {
                    symbol: t.symbol,
                    volume24h: +t.quoteVolume,
                    changePct: +t.priceChangePercent,
                    fundingRate: fr,
                    rsi: typeof rsiRaw === 'number' && !isNaN(rsiRaw) ? +rsiRaw.toFixed(2) : null,
                    ema: typeof emaRaw === 'number' && !isNaN(emaRaw) ? +emaRaw.toFixed(2) : null
                };
            },
            config.rateBatchSize,
            config.rateBatchPauseMs
    );
    console.log('💸 Initial metrics collected');

    let symbols = [];
    try {
        const raw = await chatCompletion(
            buildFilterPairsPrompt(initialData),
            config.filterModel || 'gpt-4o-mini'
        );
        const arr = JSON.parse(raw.slice(raw.indexOf('[')));
        symbols = arr
            .filter(s => typeof s === 'string')
            .map(s => s.trim())
            .filter(s => /^[A-Z0-9]+USDT$/.test(s))
            .filter(s => {
                const isValid = tradingSymbols.has(s);
                if (!isValid) console.warn(`⚠️ AI suggested an invalid symbol: ${s}`);
                return isValid;
            });
        if (symbols.length) {
            console.log(`✅ AI selected (valid): ${symbols.join(', ')}`);
        }
    } catch (err) {
        console.error('❌ AI pair selection failed:', err);
    }
    if (!symbols.length) return [];

   
    const deepList = symbols
        .map(sym => preList.find(t => t.symbol === sym))
        .filter(Boolean);
    const spreadTrades = await batchFetchSpreadTrades(deepList, 20, 200);
    console.log('🔄 batch spread+trades fetched');

    const candidates = [];

    for (let i = 0; i < deepList.length; i++) {
        const t = deepList[i];
        const init = initialData.find(d => d.symbol === t.symbol) || {};
        const st = spreadTrades[i];
        if (!st) continue;

        const [spread, trades] = st;
        if (!spread?.bestBid || !spread?.bestAsk) continue;

       
        let imbalance = { imbalance: null },
            deltaVol = { deltaVolume: null },
            speed = { tapeSpeed: null };

        try {
            [imbalance, deltaVol, speed] = await Promise.all([
                getBidAskImbalance(t.symbol),
                getDeltaVolume(t.symbol, trades),
                getTapeSpeed(trades)
            ]);
        } catch {
            continue;
        }

        const openInterest = typeof init.openInterest === 'number' && isFinite(init.openInterest) ?
            init.openInterest :
            0;
        const volume24h = +t.quoteVolume || 0;
        const spreadPct = +spread.spreadPct || 0;

      
        const kl = await binance
            .getKlines(t.symbol, config.candlesInterval, config.candlesCount)
            .catch(() => []);
        if (!kl.length) continue;
        const closesF = kl.map(k => +k[4]);
        const rsi2 = calculateRSI(closesF, rsiPeriod);
        const ema2 = calculateEMA(closesF, emaPeriod);

       
        const candles = kl.map(k => ({
            high: +k[2],
            low: +k[3],
            close: +k[4]
        }));
        const trs = [];
        for (let j = 1; j < candles.length; j++) {
            const c = candles[j],
                p = candles[j - 1];
            trs.push(
                Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close))
            );
        }
        const atr = trs.slice(-config.atrPeriod).reduce((a, b) => a + b, 0) / config.atrPeriod;

        const trendMeta = getTrendMeta(candles);
        const volatilityType = getVolatilityType({
            atr: isFinite(atr) ? atr : 0,
            tapeSpeed: speed.tapeSpeed ?? 0,
            deltaVolume: deltaVol.deltaVolume ?? 0
        });

       
        if (
            rsi2 === null ||
            ema2 === null ||
            !isFinite(atr) ||
            deltaVol.deltaVolume === null ||
            speed.tapeSpeed === null ||
            imbalance.imbalance === null ||
            trendMeta.trendStrength < config.minTrendStrength
        ) {
            console.warn(`⚠️ [${t.symbol}] Skipped due to invalid primary metrics`, {
                rsi2,
                ema2,
                atr,
                deltaVolume: deltaVol.deltaVolume,
                tapeSpeed: speed.tapeSpeed,
                imbalance: imbalance.imbalance,
                trendStrength: trendMeta.trendStrength
            });
            continue;
        }

        
        const isNight = hourUTC < config.daySessionUTC[0] || hourUTC >= config.daySessionUTC[1];
        let adaptiveFilters = {
            minVolume24h: config.minVolume24h,
            maxSpreadPct: config.maxSpreadPct,
            minOpenInterest: config.minOpenInterest,
            minTapeSpeed: isNight ? config.minTapeSpeedNight : config.minTapeSpeedDay,
            minDeltaVolume: isNight ? config.minDeltaVolumeNight : config.minDeltaVolumeDay
        };
        if (config.useAdaptiveThresholds) {
            adaptiveFilters = getAdaptiveFilters(volatilityType, isNight);
        }

        
        const coreValid =
            volume24h >= adaptiveFilters.minVolume24h &&
            spreadPct <= adaptiveFilters.maxSpreadPct &&
            openInterest >= adaptiveFilters.minOpenInterest &&
            speed.tapeSpeed >= adaptiveFilters.minTapeSpeed &&
            deltaVol.deltaVolume >= adaptiveFilters.minDeltaVolume;

        const fallbackValid =
            volume24h >= adaptiveFilters.minVolume24h * config.fallbackOI &&
            deltaVol.deltaVolume >= adaptiveFilters.minDeltaVolume * config.fallbackDeltaVolumeMultiplier;

        const looseValid =
            config.allowLooseCandidates &&
            volume24h >= config.minVolume24h / 2 &&
            spreadPct <= config.maxSpreadPct * 2;

        if (!coreValid && !fallbackValid && !looseValid) {
            console.warn(`⚠️ [${t.symbol}] Skipped by adaptive filter`, {
                volume24h,
                spreadPct,
                openInterest,
                tapeSpeed: speed.tapeSpeed,
                deltaVolume: deltaVol.deltaVolume,
                adaptiveFilters
            });
            continue;
        }

        
        candidates.push({
            symbol: t.symbol,
            volume24h,
            changePct: +t.priceChangePercent,
            fundingRate: init.fundingRate || 0,
            rsi: +rsi2.toFixed(2),
            ema: +ema2.toFixed(2),
            spreadPct,
            imbalance: imbalance.imbalance,
            deltaVolume: deltaVol.deltaVolume,
            tapeSpeed: speed.tapeSpeed,
            atr,
            trendStrength: trendMeta.trendStrength,
            trendDirection: trendMeta.trendDirection,
            volatilityType
        });
    }

    
    const acct = await binance.getAccountInfo();
    const balance = +acct.totalWalletBalance;
    const openPositions = acct.positions.filter(p => +p.positionAmt).map(p => p.symbol);
    const signals = [];
    const savePromises = [];

    for (const symbol of symbols) {
        if (openPositions.includes(symbol)) continue;
        try {
           
            const [klines, spread, oi, premium, trades] = await Promise.all([
                binance.getKlines(symbol, config.candlesInterval, config.candlesCount),
                binance.getSpread(symbol),
                binance.getOpenInterest(symbol),
                binance.getPremiumIndex(symbol),
                binance.getAggTrades(symbol)
            ]);
            if (!spread.bestBid || !spread.bestAsk) continue;

            const candleBars = klines.map(k => ({
                time: new Date(k[0]).toISOString(),
                open: +k[1],
                high: +k[2],
                low: +k[3],
                close: +k[4],
                volume: +k[5]
            }));

            const trs2 = [];
            for (let i = 1; i < candleBars.length; i++) {
                const c = candleBars[i],
                    p = candleBars[i - 1];
                trs2.push(
                    Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close))
                );
            }
            const atr2 = trs2.slice(-config.atrPeriod).reduce((s, v) => s + v, 0) / config.atrPeriod;
            const closes2 = candleBars.map(c => c.close);
            const rsiFinal = calculateRSI(closes2, rsiPeriod);
            const emaFinal = calculateEMA(closes2, emaPeriod);
            const [imb2, dVol2, spd2] = await Promise.all([
                getBidAskImbalance(symbol),
                getDeltaVolume(symbol, trades),
                getTapeSpeed(trades)
            ]);

            
            const { marketData, marketContext: oldContext } = await getMarketSnapshot(symbol);
            const trendMeta2 = getTrendMeta(candleBars);
            const volatilityType2 = getVolatilityType({
                atr: atr2,
                tapeSpeed: spd2.tapeSpeed,
                deltaVolume: dVol2.deltaVolume
            });

            const marketStats = {
                bestBid: spread.bestBid ?? 0,
                bestAsk: spread.bestAsk ?? 0,
                spreadPct: spread.spreadPct ?? 0,
                atr: atr2 ?? 0,
                openInterest: +oi.openInterest ?? 0,
                markPrice: +premium.markPrice ?? 0,
                nextFundingTs: parseInt(premium.nextFundingTime, 10) ?? 0,
                rsi: typeof rsiFinal === 'number' && !isNaN(rsiFinal) ?
                    +rsiFinal.toFixed(2) :
                    null,
                ema: typeof emaFinal === 'number' && !isNaN(emaFinal) ?
                    +emaFinal.toFixed(2) :
                    null,
                hourUTC: new Date().getUTCHours(),
                imbalance: imb2.imbalance ?? 0,
                deltaVolume: dVol2.deltaVolume ?? 0,
                tapeSpeed: spd2.tapeSpeed ?? 0,
                trendStrength: trendMeta2.trendStrength ?? 0,
                trendDirection: trendMeta2.trendDirection ?? 0,
                volatilityType: volatilityType2 ?? 'unknown'
            };

           
            savePromises.push(
                saveMarketSnapshot(
                    symbol, {
                        timestamp: new Date().toISOString(),
                        openInterest: marketStats.openInterest,
                        deltaVolume: marketStats.deltaVolume,
                        tapeSpeed: marketStats.tapeSpeed,
                        imbalance: marketStats.imbalance,
                        rsi: marketStats.rsi,
                        ema: marketStats.ema
                    },
                    marketContext
                )
            );

            let shortTermStats = {};
            try {
               
                const shortKl = await binance.getKlines(symbol, '5m', config.candlesCount);
                const shortCloses = shortKl.map(k => +k[4]);
                const shortAtr = shortKl
                    .map((k, i, arr) => {
                        if (i === 0) return null;
                        const prev = arr[i - 1];
                        return Math.max(
                            +k[2] - +k[3],
                            Math.abs(+k[2] - +prev[4]),
                            Math.abs(+k[3] - +prev[4])
                        );
                    })
                    .filter(v => v !== null)
                    .slice(-config.atrPeriod)
                    .reduce((sum, v) => sum + v, 0) / config.atrPeriod;
                const shortRsi = calculateRSI(shortCloses, rsiPeriod);
                const shortTrend = getTrendMeta(
                    shortKl.map(k => ({ high: +k[2], low: +k[3], close: +k[4] }))
                );
                shortTermStats = {
                    interval: '5m',
                    atr: +shortAtr.toFixed(4),
                    rsi: +shortRsi.toFixed(2),
                    trendStrength: shortTrend.trendStrength,
                    trendDirection: shortTrend.trendDirection
                };
            } catch (err) {
                console.warn(`⚠️ [${symbol}] failed to get shortTermStats:`, err.message);
            }

         
            const rawReply = await chatCompletion(
                buildSignalPrompt(
                    symbol,
                    candleBars,
                    shortTermStats,
                    balance,
                    openPositions,
                    initialData.find(d => d.symbol === symbol)?.fundingRate || 0,
                    marketStats,
                    marketData,
                    oldContext
                ),
                config.openaiModel
            );

            let clean;
            try {
                clean = rawReply.slice(rawReply.indexOf('{')).replace(/```/g, '').trim();
                if (clean.endsWith('```')) clean = clean.slice(0, -3).trim();
            } catch (err) {
                console.error(`❌ [${symbol}] Error while cleaning rawReply:`, err.message);
                continue;
            }

            let parsed;
            try {
                parsed = JSON.parse(clean);
            } catch (err) {
                console.error(`❌ [${symbol}] JSON parse error:\n`, clean, '\nError:', err.message);
                continue;
            }

          
            if (
                typeof parsed.entryPrice !== 'number' ||
                typeof parsed.stopLoss !== 'number' ||
                !Array.isArray(parsed.takeProfits) ||
                parsed.takeProfits.length < 1 ||
                parsed.takeProfits.some(tp => typeof tp !== 'number') ||
                typeof parsed.positionSize?.valueUSDT !== 'number' ||
                typeof parsed.positionSize?.contracts !== 'number' ||
                typeof parsed.confidenceScore !== 'number'
            ) {
                console.warn(`⚠️ [${symbol}] Signal validation failed`, {
                    entryPrice: parsed.entryPrice,
                    stopLoss: parsed.stopLoss,
                    takeProfits: parsed.takeProfits,
                    positionSize: parsed.positionSize,
                    confidenceScore: parsed.confidenceScore
                });
                continue;
            }

            
            const minVal = config.minNotionalUSDT;
            if (parsed.positionSize.valueUSDT < minVal) {
                parsed.positionSize.valueUSDT = minVal;
                parsed.positionSize.contracts = Math.floor(minVal / parsed.entryPrice);
            }

           
            const metrics = [
                marketStats.rsi,
                marketStats.ema,
                marketStats.atr,
                marketStats.deltaVolume,
                marketStats.tapeSpeed,
                marketStats.imbalance,
                marketStats.trendStrength
            ];
            if (
                metrics.some(v => v === null || isNaN(v)) ||
                marketStats.trendStrength < config.minTrendStrength
            ) {
                console.warn(`⚠️ [${symbol}] Skipped due to invalid marketStats`);
                continue;
            }

            
            if (config.useAdaptiveThresholds) {
                const cat = marketStats.volatilityType;
                const thresholdMap = config.confidenceThresholds;
                const minConf = thresholdMap.medium; 
                if (parsed.confidenceScore < minConf) {
                    console.warn(`⚠️ [${symbol}] Skipped due to confidenceScore < ${minConf}`);
                    continue;
                }
            }

            signals.push(parsed);
        } catch {
            continue;
        }
    }

  
    await Promise.allSettled(savePromises);

    signals.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
    console.log('✅ Total signals (sorted):', signals.length);

    if (config.saveSnapshots) {
        await mapInBatches(
            signals,
            async signal => {
                const { marketData, marketContext: oldContext } = await getMarketSnapshot(signal.symbol);
                const newData = {
                    timestamp: new Date().toISOString(),
                    entryPrice: signal.entryPrice,
                    stopLoss: signal.stopLoss,
                    takeProfits: signal.takeProfits,
                    positionSize: signal.positionSize,
                    confidenceScore: signal.confidenceScore
                };
                marketData.push(newData);
                await saveMarketSnapshot(signal.symbol, marketData, oldContext);
            },
            config.rateBatchSize,
            config.rateBatchPauseMs
        );
    }

    return signals;
}

async function getMarketSnapshot(symbol) {
    try {
        const { items: found } = await items.query('MarketSnapshots').eq('symbol', symbol).limit(1).find();
        if (!found.length) return { marketData: [], marketContext: null };
        const entry = found[0];
        return {
            marketData: Array.isArray(entry.marketData) ? entry.marketData.slice(-10) : [],
            marketContext: typeof entry.marketContext === 'object' ? entry.marketContext : null
        };
    } catch (err) {
        console.error(`❌ Failed to load market snapshot for ${symbol}:`, err);
        return { marketData: [], marketContext: null };
    }
}

async function saveMarketSnapshot(symbol, snapshot, marketContext = null) {
    const collection = 'MarketSnapshots';
    const field = 'marketData';
    try {
        const { items: existing } = await items.query(collection).eq('symbol', symbol).limit(1).find();
        if (existing.length) {
            const current = existing[0];
            const existingData = Array.isArray(current[field]) ? current[field] : [];
            const updatedData = [...existingData.slice(-49), snapshot];
            await items.update(collection, {
                _id: current._id,
                symbol: current.symbol,
                [field]: updatedData,
                marketContext
            });
        } else {
            await items.insert(collection, {
                symbol,
                [field]: [snapshot],
                marketContext
            });
        }
    } catch (err) {
        console.error(`❌ Failed to save market snapshot for ${symbol}:`, err);
    }
}