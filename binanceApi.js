import { fetch } from 'wix-fetch';
import config from './config';

const PROXY_URL = '';

async function request(method, path, params = {}, signed = false) {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method, path, params, signed })
        });

        if (response.ok) {
            return response.json();
        }

        const text = await response.text();
       
        if (response.status === 502 && attempt < maxRetries) {
            console.warn(`⚠️ Proxy 502 on ${method} ${path}, retry ${attempt}/${maxRetries}`);
          
            await new Promise(r => setTimeout(r, attempt * 1000));
            continue;
        }

       
        console.error(`❌ Binance Proxy Error [${response.status}]: ${text}`);
        throw new Error(`Binance Proxy Error [${response.status}]: ${text}`);

    }
}

let _exchangeInfo = null;

export async function getExchangeInfoCached() {
    if (!_exchangeInfo) {
        _exchangeInfo = await request('GET', '/fapi/v1/exchangeInfo');
    }
    return _exchangeInfo;
}

export function resetExchangeInfoCache() {
    _exchangeInfo = null;
}

export async function getSymbolInfo(symbol) {
    const info = await getExchangeInfoCached();
    return info.symbols.find(s => s.symbol === symbol);
}

export async function getFiltered24hrTickers() {

    const all = await request('GET', '/fapi/v1/ticker/24hr');

    const filtered = all.filter(t =>
        /^[A-Z]{3,10}USDT$/.test(t.symbol) &&
        parseFloat(t.quoteVolume) >= config.minVolume24h &&
        parseFloat(t.priceChangePercent) >= config.changePctMin
    );

    return filtered.slice(0, 300);
}

export async function getOpenOrders(symbol) {
    const params = symbol ? { symbol } : {};
    return request('GET', '/fapi/v1/openOrders', params, true);
}

export const getKlines = (symbol, interval = config.candlesInterval, limit = config.candlesCount) =>
    request('GET', '/fapi/v1/klines', { symbol, interval, limit });

export async function getTickerPrice(symbol) {
    const res = await request('GET', '/fapi/v1/ticker/price', { symbol });
    return parseFloat(res.price);
}

export async function cancelOrder(symbol, orderId) {
    return request('DELETE', '/fapi/v1/order', { symbol, orderId }, true);
}

export const getAccountInfo = () => request('GET', '/fapi/v2/account', {}, true);

export const setLeverage = (symbol, leverage) =>
    request('POST', '/fapi/v1/leverage', { symbol, leverage }, true);

export const placeOrder = async (symbol, side, type, opts) => {
    const notional = opts.price * opts.quantity;
    if (notional < config.minNotionalUSDT) {
        console.warn(`⚠️ Order for ${symbol} skipped: Notional $${notional} < $${config.minNotionalUSDT}`);
        return { skipped: true, reason: 'Below minimum notional' };
    }
    return request('POST', '/fapi/v1/order', { symbol, side, type, ...opts }, true);
};

export async function getOrderStatus(symbol, orderId) {
    return request('GET', '/fapi/v1/order', { symbol, orderId }, true);
}

export async function getOpenInterest(symbol) {
    return request('GET', '/fapi/v1/openInterest', { symbol });
}

export async function getPremiumIndex(symbol) {
    return request('GET', '/fapi/v1/premiumIndex', { symbol });
}

export async function getFundingRate(symbol) {
    const idx = await getPremiumIndex(symbol);
    return parseFloat(idx.lastFundingRate);
}

export async function getOrderBook(symbol, limit = 5) {
    return request('GET', '/fapi/v1/depth', { symbol, limit });
}

export async function getSpread(symbol, limit = 5) {
    let book;
    try {
        book = await getOrderBook(symbol, limit) || {};
    } catch (err) {
        console.error(`❌ [${symbol}] getOrderBook error:`, err);
        return { bestBid: 0, bestAsk: 0, spreadPct: 0 };
    }
    const bids = Array.isArray(book.bids) ? book.bids : [];
    const asks = Array.isArray(book.asks) ? book.asks : [];
    const bestBid = bids[0]?.[0] ? parseFloat(bids[0][0]) : 0;
    const bestAsk = asks[0]?.[0] ? parseFloat(asks[0][0]) : 0;
    const spreadPct = bestBid && bestAsk ?
        ((bestAsk - bestBid) / ((bestAsk + bestBid) / 2)) * 100 :
        0;
    return { bestBid, bestAsk, spreadPct };
}

export async function getAggTrades(symbol, limit = 1000) {
    return request('GET', '/fapi/v1/aggTrades', { symbol, limit });
}

export async function cancelAllOrders(symbol) {
    return request('DELETE', '/fapi/v1/allOpenOrders', { symbol }, true);
}