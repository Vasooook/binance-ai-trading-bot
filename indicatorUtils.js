// backend/Binance/indicatorUtils.js

export function calculateRSI(closes, period) {
    if (!Array.isArray(closes) || closes.length <= period) return null;

    const gains = [];
    const losses = [];
    for (let i = 1; i < closes.length; i++) {
        const delta = closes[i] - closes[i - 1];
        if (isNaN(delta)) return null;
        if (delta >= 0) gains.push(delta);
        else losses.push(Math.abs(delta));
    }

    const avgGain = gains.reduce((sum, v) => sum + v, 0) / period;
    const avgLoss = losses.reduce((sum, v) => sum + v, 0) / period;
    if (!isFinite(avgGain) || !isFinite(avgLoss)) return null;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    return isFinite(rsi) ? parseFloat(rsi.toFixed(2)) : null;
}

export function calculateEMA(closes, period) {
    if (!Array.isArray(closes) || closes.length < period) return null;

    const k = 2 / (period + 1);
    let ema = closes[0];
    for (let i = 1; i < closes.length; i++) {
        const price = closes[i];
        if (!isFinite(price)) return null;
        ema = price * k + ema * (1 - k);
    }
    return isFinite(ema) ? parseFloat(ema.toFixed(2)) : null;
}
