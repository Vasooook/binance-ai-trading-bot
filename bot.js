// backend/Binance/bot.js
import { scanAndSignal } from './scanner';
import * as binance from './binanceApi';
import { items } from '@wix/data';
import config from './config';
import { resetExchangeInfoCache } from './binanceApi';
import { syncTrades } from './tradeSync';

export let externalRunBlocked = false;

export function setExternalRunBlocked(value) {
    externalRunBlocked = value;
}

function roundToStep(value, step) {
    const precision = Math.floor(Math.log10(1 / parseFloat(step)));
    return parseFloat(parseFloat(value).toFixed(precision));
}

export async function runBot(acct) {
    if (externalRunBlocked) {
        console.warn('⛔ runBot called externally but is blocked — exiting.');
        return;
    }

    if (!acct) {
    try {
        acct = await syncTrades();
        if (!acct) {
            console.error('❌ [runBot] syncTrades did not return an account');
            return;
        }
    } catch (err) {
        console.error('❌ [runBot] syncTrades failed:', err);
        return;
    }
}

    try {

       
        console.log('🔄 [runBot] Start');

        const openPositions = acct.positions.filter(p => +p.positionAmt !== 0);
        const openSymbols = openPositions.map(p => p.symbol);
        let slotsLeft = (config.maxPositions || 5) - openSymbols.length;
        if (slotsLeft <= 0) return;

        let balance = parseFloat(acct.availableBalance);

        const signals = await scanAndSignal().catch(err => {
            console.error('❌ [runBot] scanAndSignal error:', err);
            return [];
        });

        for (const s of signals) {
            if (slotsLeft <= 0) break;
            if (openSymbols.includes(s.symbol)) continue;

            if (
                typeof s.entryPrice !== 'number' ||
                typeof s.stopLoss !== 'number' ||
                !Array.isArray(s.takeProfits) ||
                s.takeProfits.length < 1 ||
                typeof s.takeProfits[0] !== 'number'
            ) {
                
                continue;
            }

            await binance.setLeverage(s.symbol, s.leverage);
            const riskAmt = balance * config.riskPercent;
            const targetUSDT = Math.max(riskAmt, config.minNotionalUSDT);
            const rawQty = (targetUSDT * s.leverage) / s.entryPrice;

            const info = await binance.getSymbolInfo(s.symbol);
            const lotFilter = info.filters.find(f => f.filterType === 'LOT_SIZE');
            const priceFilter = info.filters.find(f => f.filterType === 'PRICE_FILTER');
            const stepSize = parseFloat(lotFilter.stepSize);
            const tickSize = parseFloat(priceFilter.tickSize);

            const qty = roundToStep(rawQty, stepSize);
            if (qty <= 0) continue;

            const side = s.entryPrice < s.takeProfits[0] ? 'BUY' : 'SELL';

            let entry;
            try {
                entry = await binance.placeOrder(
                    s.symbol,
                    side,
                    'MARKET', { quantity: qty }
                );
            } catch (err) {
                
                continue;
            }

            const avgPrice = parseFloat(entry.avgFilledPrice ?? s.entryPrice);
            if (!avgPrice) continue;

            const slPrice = roundToStep(s.stopLoss, tickSize);
            const tpPrice = roundToStep(s.takeProfits[0], tickSize);

            let stopOrder, tpOrder;
            const maxRetries = 3;
            let retries = 0;
            let success = false;

            while (retries < maxRetries && !success) {
                try {
                    stopOrder = await binance.placeOrder(
                        s.symbol,
                        side === 'BUY' ? 'SELL' : 'BUY',
                        'STOP_MARKET', {
                            stopPrice: slPrice,
                            quantity: qty,
                            reduceOnly: true
                        }
                    );

                    tpOrder = await binance.placeOrder(
                        s.symbol,
                        side === 'BUY' ? 'SELL' : 'BUY',
                        'TAKE_PROFIT_MARKET', {
                            stopPrice: tpPrice,
                            quantity: qty,
                            reduceOnly: true
                        }
                    );

                    const stopStatus = await binance.getOrderStatus(s.symbol, stopOrder.orderId);
                    const tpStatus = await binance.getOrderStatus(s.symbol, tpOrder.orderId);

                    if (stopStatus.status === 'NEW' && tpStatus.status === 'NEW') {
                        success = true;
                    } else {
                      
                        retries++;
                        await new Promise(r => setTimeout(r, 1500));
                    }

                } catch (err) {
                    
                    retries++;
                    await new Promise(r => setTimeout(r, 1500));
                }
            }

            if (!success) {
                
                await binance.placeOrder(
                    s.symbol,
                    side === 'BUY' ? 'SELL' : 'BUY',
                    'MARKET', {
                        quantity: qty,
                        reduceOnly: true
                    }
                );
                continue;
            }

            const newTrade = await items.insert('Trades', {
                symbol: s.symbol,
                side,
                orderId: entry.orderId,
                entryPrice: avgPrice,
                stopLoss: slPrice,
                takeProfits: [tpPrice],
                leverage: s.leverage,
                positionSize: {
                    contracts: qty,
                    valueUSDT: qty * avgPrice,
                    percentBalance: config.riskPercent * 100
                },
                status: 'OPEN',
                timestamp: new Date()
            });

            await items.update('Trades', {
                ...newTrade,
                stopOrderId: stopOrder.orderId,
                takeOrderIds: [tpOrder.orderId]
            });

            slotsLeft--;
            openSymbols.push(s.symbol);
            balance -= qty * avgPrice / s.leverage;
        }

        resetExchangeInfoCache();
        
        console.log('📊 [runBot] Completed.');
    } catch (e) {
        console.error('❌ [runBot] error:', e.message, '\nStack:', e.stack);
    }
}
