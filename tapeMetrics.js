// backend/Binance/tapeMetrics.js
import { getOrderBook } from './binanceApi';

export async function getBidAskImbalance(symbol, depthLimit = 5) {
  try {
    const book = await getOrderBook(symbol, depthLimit);
    if (!book || !Array.isArray(book.bids) || !Array.isArray(book.asks)) return { imbalance: null };

    const bidVolume = book.bids.slice(0, depthLimit).reduce((sum, [_, qty]) => sum + parseFloat(qty || 0), 0);
    const askVolume = book.asks.slice(0, depthLimit).reduce((sum, [_, qty]) => sum + parseFloat(qty || 0), 0);

    const total = bidVolume + askVolume;
    if (total === 0) return { imbalance: 0 };

    const imbalance = (bidVolume - askVolume) / total;
    return { imbalance: isFinite(imbalance) ? +imbalance.toFixed(4) : null };
  } catch (err) {
    console.warn(`⚠️ [${symbol}] getBidAskImbalance error:`, err.message);
    return { imbalance: null };
  }
}

export async function getDeltaVolume(symbol, trades, lookbackMs = 60000, now = Date.now()) {
  try {
    const cutoff = now - lookbackMs;
    const filtered = trades.filter(t => t.T >= cutoff);
    const buyVol = filtered.filter(t => t.m === false).reduce((sum, t) => sum + parseFloat(t.q || 0), 0);
    const sellVol = filtered.filter(t => t.m === true).reduce((sum, t) => sum + parseFloat(t.q || 0), 0);
    const delta = buyVol - sellVol;
    return {
      deltaVolume: isFinite(delta) ? +delta.toFixed(2) : null,
      buyVol: isFinite(buyVol) ? +buyVol.toFixed(2) : null,
      sellVol: isFinite(sellVol) ? +sellVol.toFixed(2) : null
    };
  } catch (err) {
    console.warn(`⚠️ [${symbol}] getDeltaVolume error:`, err.message);
    return { deltaVolume: null, buyVol: null, sellVol: null };
  }
}

export async function getTapeSpeed(trades, lookbackMs = 60000, now = Date.now()) {
  try {
    const cutoff = now - lookbackMs;
    const count = trades.filter(t => t.T >= cutoff).length;
    const speed = count / (lookbackMs / 1000);
    return {
      tapeSpeed: isFinite(speed) ? +speed.toFixed(2) : null,
      tradeCount: count
    };
  } catch (err) {
    console.warn(`⚠️ getTapeSpeed error:`, err.message);
    return { tapeSpeed: null, tradeCount: null };
  }
}
