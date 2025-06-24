# Binance AI Trading Bot 🤖📉  
**Advanced crypto futures trading bot powered by OpenAI + Binance API**  
**Backend: Wix Studio (Velo) + Proxy Server on Railway**

[![Wix Studio](https://img.shields.io/badge/Built%20with-Wix%20Studio-000?logo=wix&logoColor=white)](https://www.wix.com/studio)
[![Hosted on Railway](https://img.shields.io/badge/Server-Railway-7752FE?logo=railway)](https://railway.app)
[![OpenAI Integrated](https://img.shields.io/badge/AI%20Engine-OpenAI-black?logo=openai)](https://platform.openai.com/)
[![Binance Futures](https://img.shields.io/badge/API-Binance_Futures-F3BA2F?logo=binance)](https://binance-docs.github.io/apidocs/futures/en/)
[![JavaScript](https://img.shields.io/badge/Code-JavaScript-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Upwork Hire](https://img.shields.io/badge/Hire%20on-Upwork-brightgreen?logo=upwork)](https://www.upwork.com/freelancers/~017752a03bdc66874d)

---

## 💡 Overview

This bot executes automated crypto futures trades on **Binance** using a combination of technical market analysis, OpenAI-generated signals, and strict risk control logic.

> Originally developed on **Wix Studio** by request of a client.  
> You are free to fork and adapt this logic to your own needs and strategy.

The backend architecture is distributed:

- **Wix Studio (Velo)** — hosts risk logic, trading strategy parameters, and sync controller
- **Railway Proxy (Node.js)** — manages raw Binance API access and real-time data fetches

---

## ⚙️ Key Features

### 📊 Market Intelligence Engine
- Fetches live data from Binance USDT Futures (REST & WebSocket)
- Calculates RSI (14), EMA (9), ATR, deltaVolume, imbalance, spread%
- Tracks open interest, bid/ask liquidity, and liquidation levels

### 🧠 AI Signal Engine
- Aggregates full market snapshot and prompts OpenAI GPT
- Returns trade direction, volatility estimate, and confidence score
- Supports multi-timeframe signal analysis (`15m`, `1h`, `4h`, `1d`)

### 📈 Trading Logic Core
- Entry logic based on AI signal + market filter validation
- Smart SL/TP placement with position tracking
- Auto-removal of failed orders; recovery via `syncTrades()`

### 🔐 Risk Management
- Allocation per trade based on % of total balance
- Enforces min notional, max position limits, cooldowns
- Monitors deviation between open orders and real positions

---

## 🧱 Architecture

```plaintext
Wix Studio (.web.js)
   │
   ├── Config UI & User DB
   ├── Risk Logic & Signal Trigger
   ↓
Railway Proxy (Node.js)
   ├── Binance Market Data (REST/WS)
   ├── OpenAI Signal Generation
   ↓
Binance Futures API
   └── Order Execution, SL/TP, Position Sync
```

---

## 🛠 Tech Stack

| Tool            | Role                                      |
|-----------------|-------------------------------------------|
| **Wix Studio**  | Cloud backend, Velo `.web.js` functions   |
| **Railway**     | Secure proxy to Binance, bypasses limits |
| **OpenAI GPT**  | Trade signal generation engine            |
| **Binance API** | Execution layer for trades, positions     |
| **JavaScript**  | Logic for both Velo and proxy functions   |

---

## 📬 Contact

[![Email](https://img.shields.io/badge/Email-support@365jpg.art-blue?logo=gmail)](mailto:support@365jpg.art)
[![Website](https://img.shields.io/badge/Website-365jpg.art-orange?logo=googlechrome)](https://www.365jpg.art)
[![Telegram](https://img.shields.io/badge/Telegram-@studio365jpg-2CA5E0?logo=telegram)](https://t.me/studio365jpg)
[![Upwork](https://img.shields.io/badge/Upwork-Contact%20Me-brightgreen?logo=upwork)](https://www.upwork.com/freelancers/~017752a03bdc66874d)

---

## 🧠 Note

If you’re interested in adapting this bot to your own strategy,  
custom risk model, or exchange — **reach out, and we’ll build the best solution for your goals.**
