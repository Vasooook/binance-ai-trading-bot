import express from 'express';
import crypto from 'crypto';
import WebSocket from 'ws';
import fetch from 'node-fetch';
const app = express();

app.use(express.json());

// === Прокси для Binance REST ===
app.post('/api/binance', async (req, res) => {
  try {
    console.log('[Incoming]', JSON.stringify(req.body, null, 2));
    const { method, path, params = {}, signed = false } = req.body;

    const apiKey = process.env.API_KEY;
    const apiSecret = process.env.API_SECRET;

    let url = `https://fapi.binance.com${path}`;
    const headers = { 'X-MBX-APIKEY': apiKey };
    let fullQuery = '';

    if (signed) {
      params.timestamp = Date.now();
      const query = Object.entries(params)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
      const signature = crypto.createHmac('sha256', apiSecret).update(query).digest('hex');
      fullQuery = `${query}&signature=${signature}`;
      url += `?${fullQuery}`;
    } else if (Object.keys(params).length) {
      fullQuery = Object.entries(params)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
      url += `?${fullQuery}`;
    }

    console.log('[Proxy] URL:', url);
    const response = await fetch(url, { method, headers });

    const contentType = response.headers.get('content-type');
    let data;
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    console.log('[Proxy] Response status:', response.status);
    console.log('[Proxy] Response body:', data);

    res.status(response.status).json(data);
  } catch (err) {
    console.error('[Proxy Error]', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

// === HTTP‐эндпоинты Wix-приложения ===
const WIX_SITE = process.env.WIX_SITE; // e.g. "https://your-site.com"

let isBotRunning = false;

app.get('/_functions/runBot', async (req, res) => {
  if (isBotRunning) {
    console.warn('🔁 runBot already running — skipping new run');
    return res.status(429).send('runBot already running');
  }

  isBotRunning = true;
  try {
    await fetch(`${WIX_SITE}/_functions/runBot`);
    res.send('runBot OK');
  } catch (e) {
    console.error('runBot HTTP-error:', e);
    res.status(500).send('runBot ERROR');
  } finally {
    isBotRunning = false;
  }
});

app.get('/_functions/syncTrades', async (req, res) => {
  try {
    await fetch(`${WIX_SITE}/_functions/syncTrades`);
    res.send('syncTrades OK');
  } catch (e) {
    console.error('syncTrades HTTP-error:', e);
    res.status(500).send('syncTrades ERROR');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Binance proxy listening on port ${PORT}`);
  startUserDataStream();
});

// === WebSocket подписка на user data stream ===
async function startUserDataStream() {
  const restBase = 'https://fapi.binance.com';
  const apiKey = process.env.API_KEY;

  try {
    const resp = await fetch(`${restBase}/fapi/v1/listenKey`, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': apiKey }
    });
    const { listenKey } = await resp.json();

    const ws = new WebSocket(`wss://fstream.binance.com/ws/${listenKey}`);
    ws.on('open', () => console.log('🔌 WebSocket connected'));
    ws.on('error', err => console.error('🛑 WS error:', err));
    ws.on('close', () => {
      console.warn('⚠️ WS closed – reconnect in 5s');
      setTimeout(startUserDataStream, 5000);
    });

    ws.on('message', async data => {
      try {
        const msg = JSON.parse(data);
        if (msg.e === 'ORDER_TRADE_UPDATE' && msg.o?.X === 'FILLED') {
          console.log('🔔 ORDER_FILLED:', msg.o.s, msg.o.i);
          await fetch(`http://localhost:${PORT}/_functions/syncTrades`);
        }
      } catch (e) {
        console.error('WS message handler error:', e);
      }
    });

    setInterval(async () => {
      await fetch(`${restBase}/fapi/v1/listenKey`, {
        method: 'PUT',
        headers: { 'X-MBX-APIKEY': apiKey }
      });
      console.log('🔄 Keep-alive listenKey');
    }, 30 * 60 * 1000);

  } catch (err) {
    console.error('Failed to start user data stream:', err);
    setTimeout(startUserDataStream, 5000);
  }
}
