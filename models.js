// backend/Binance/models.js
import config from './config';

export function buildFilterPairsPrompt(marketData) {
    const header = [
        "You are a professional crypto screener AI.",
        "Your task is to rank and return the most promising trading pairs for swing trades.",
        "",
        "Do not waste time on pairs with inconsistent data or missing values.",
        "All pairs passed a base liquidity filter — now focus on structure, trend, and momentum.",
        "",
        "Selection criteria (balanced):",
        "- Strong 24h price change and volume",
        "- Clean trend structure (EMA, RSI)",
        "- Favorable funding rate (not extreme)",
        "- Indicators confirming sustained directional flow (imbalance, deltaVolume, tapeSpeed)",
        "",
        "Output ONLY a JSON array of symbols. Example: [\"BTCUSDT\",\"ETHUSDT\"]",
        "Do not use triple backticks or formatting — return only: [\"BTCUSDT\"]",
        "",
        "Market snapshot (one JSON per line):"
    ].join("\n");

    const body = marketData.map(d => JSON.stringify(d)).join("\n");
    return `${header}\n${body}`;
}

export function buildSignalPrompt(
    symbol,
    candles, 
    shortTermStats, 
    accountBalanceUSDT,
    openPositions,
    fundingRate,
    marketStats,
    marketData = [],
    marketContext = {}
) {
    const safe = (val, fallback = 0) =>
        (typeof val === 'number' && !isNaN(val) ? val : fallback);

    // Calculate base value for position: either risk percentage or minimum notional value
    const riskUsd = accountBalanceUSDT * config.riskPercent;
    const minNotional = config.minNotionalUSDT;
    const targetValue = Math.max(riskUsd, minNotional);
    const percentBal = (config.riskPercent * 100).toFixed(2);
    const feePct = config.feePct;

    const {
        bestBid,
        bestAsk,
        spreadPct,
        atr,
        openInterest,
        markPrice,
        liqPrice,
        nextFundingTs,
        rsi,
        ema,
        hourUTC,
        imbalance,
        deltaVolume,
        tapeSpeed,
        trendStrength,
        trendDirection,
        volatilityType
    } = marketStats;

    const header = [
        "📊 SYSTEM ROLE:",
        "You are a professional AI assistant for crypto swing trading.",
        "Your goal is to analyze market structure, momentum, and flow data, and produce a clear, high-conviction signal.",

        "",

        "📈 STRATEGY RULES:",
        "- This is a multi-timeframe swing strategy using 4h and 5m candles.",
        "- The 4h timeframe is used to determine the dominant trend, structure, and realistic profit targets.",
        "- The 5m timeframe is used for precise entry and stop placement at recent swing points.",
        "- Only generate a signal if the 4h and 5m timeframes are aligned in direction and structure.",
        "- Prioritize clean breakouts, trend continuation zones, or retests of key 4h levels confirmed by 5m structure.",
        "- Confirm signals using: EMA cross or slope, RSI (not overbought/oversold without trend), ATR, and flow metrics (tapeSpeed, deltaVolume, imbalance).",
        "- Avoid entries during low-volume chop, major news hours, or after high volatility spikes unless a clean reversion structure is visible.",
        "- Entry price should be the best realistic LIMIT level, not necessarily current market price. Choose optimal structure-based re-entry or retest level.",

        "",

        "📉 RISK MANAGEMENT:",
        `- Risk per trade: ${percentBal}% of account balance.`,
        `- Position value must be ≥ $${minNotional}.`,
        "- Entry must be at a clear and technically justified price, using a LIMIT order.",
        "- Stop-loss: must be based on 5m chart structure (e.g., last local swing high/low or small consolidation breakdown).",
        "- Take-profit: based on major structure or resistance/support from the 4h chart. Prioritize swing highs/lows, FVGs, EMA clusters, or clean 4h S/R zones.",
        "- The TP must be realistic and reachable under current volatility (use ATR × 2–4 on 4h).",
        "- The risk/reward ratio (TP–Entry / Entry–SL) must be at least 2:1. Reject all setups with lower R:R.",
        "- Analyze all provided timeframes. Only generate signals where the entry, stop-loss, and take-profit are validated by confluence across both 4h and 5m.",
        "- Confidence score must reflect the combined strength of structure, momentum, and multi-timeframe alignment (0–100).",

        "",

        "📌 REJECTION CRITERIA:",
        `- Reject trades if spreadPct > ${config.maxSpreadPct}% (for a 'stable' market).`,
        `  • For volatilityType 'calm', spread may be up to ${(config.maxSpreadPct * 1.2).toFixed(4)}%.`,
        `  • For volatilityType 'high', spread must be < ${(config.maxSpreadPct * 0.8).toFixed(4)}%.`,
        `  • For volatilityType 'explosive', spread must be < ${(config.maxSpreadPct * 0.5).toFixed(4)}%.`,
        "- Reject any trade if stop-loss or take-profit cannot be set at a logical, structurally significant level.",
        "- Reject any setup if volatilityType is 'explosive' and ATR is more than double the average of the last 10 bars.",
        "- Reject any signal if any major indicator (ATR, deltaVolume, tapeSpeed, imbalance, openInterest, etc.) is a statistical outlier compared to the previous 10 bars.",
        `- Reject if trendStrength < ${config.minTrendStrength} or if multi-timeframe confluence (trend, EMA, RSI) is absent.`,
        `- Reject trades if openInterest < ${config.minOpenInterest} contracts.`,
        `- Reject trades if deltaVolume < ${config.minDeltaVolumeDay} (day) or < ${config.minDeltaVolumeNight} (night).`,
        `- Reject trades if tapeSpeed < ${config.minTapeSpeedDay} (day) or < ${config.minTapeSpeedNight} (night).`,
        `- Reject if RSI > ${config.rsiOverbought} or < ${config.rsiOversold} unless fully supported by other strong factors.`,

        "",

        "🛠 OUTPUT FORMAT:",
        "Respond with a valid JSON object only. DO NOT explain or add commentary.",

        "Use this schema:",
        `{
  "symbol": "<string>",
  "entryPrice": <number>,
  "stopLoss": <number>,
  "takeProfits": [<number>, ...],
  "leverage": <int>,
  "positionSize": {
    "contracts": <int>,
    "valueUSDT": ${targetValue.toFixed(2)},
    "percentBalance": ${percentBal}
  },
  "fundingRatePct": ${safe(fundingRate)},
  "bestBid": ${safe(bestBid)},
  "bestAsk": ${safe(bestAsk)},
  "spreadPct": ${safe(spreadPct).toFixed(4)},
  "atr": ${safe(atr).toFixed(4)},
  "openInterest": ${safe(openInterest)},
  "markPrice": ${safe(markPrice)},
  "liqPrice": ${safe(liqPrice)},
  "rsi": ${safe(rsi)},
  "ema": ${safe(ema)},
  "hourUTC": ${safe(hourUTC)},
  "imbalance": ${safe(imbalance)},
  "deltaVolume": ${safe(deltaVolume)},
  "tapeSpeed": ${safe(tapeSpeed)},
  "trendStrength": ${safe(trendStrength)},
  "trendDirection": ${safe(trendDirection)},
  "volatilityType": "${volatilityType}",
  "shortTermATR": ${safe(shortTermStats.atr).toFixed(4)},
  "shortTermRSI": ${safe(shortTermStats.rsi).toFixed(2)},
  "shortTermTrendStrength": ${safe(shortTermStats.trendStrength)},
  "shortTermTrendDirection": ${safe(shortTermStats.trendDirection)},
  "maxLeverage": ${config.maxLeverage},
  "feePct": ${(feePct * 100).toFixed(2)},
  "confidenceScore": <int 0–100>
}`
    ].join("\n");

    const historyBlock = marketData.length ?
        [
            "",
            "📊 Historical metrics (oldest → newest):",
            JSON.stringify(marketData)
        ].join("\n") :
        "";

    const contextBlock = marketContext && Object.keys(marketContext).length ?
        [
            "",
            "🌐 Market context (macro, BTC/ETH trend):",
            JSON.stringify(marketContext)
        ].join("\n") :
        "";

    const shortBlock = [
        "",
        "⏱️ SHORT-TERM SNAPSHOT (5m):",
        JSON.stringify(shortTermStats)
    ].join("\n");

    const candleBlock = [
        "",
        "🕯️ Recent 4h candlestick data:",
        ...candles.map(c =>
            `{"time":"${c.time}","open":${safe(c.open)},"high":${safe(c.high)},"low":${safe(c.low)},"close":${safe(c.close)},"volume":${safe(c.volume)}}`
        )
    ].join("\n");

    return `${header}${historyBlock}${contextBlock}${shortBlock}${candleBlock}`;
}