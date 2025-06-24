# Binance AI Trading Bot 🤖📉  
**Advanced crypto futures trading bot powered by OpenAI + Binance API**  
**Backend: Wix Studio (Velo) + Proxy Server on Railway**

[![Wix Studio](https://img.shields.io/badge/Built%20with-Wix%20Studio-000?logo=wix&logoColor=white)](https://www.wix.com/studio)  
[![Hosted on Railway](https://img.shields.io/badge/Server-Railway-7752FE?logo=railway)](https://railway.app)  
[![OpenAI Integrated](https://img.shields.io/badge/AI%20Engine-OpenAI-black?logo=openai)](https://platform.openai.com/)  
[![Upwork Hire](https://img.shields.io/badge/Available%20on-Upwork-brightgreen?logo=upwork)](https://www.upwork.com/freelancers/~017752a03bdc66874d)

---

## 💡 Overview

This bot executes crypto futures trades on Binance using a powerful combination of market metrics, OpenAI signals, and dynamic position management.

All backend logic is distributed between:

- **Wix Studio (Velo)** — risk management logic, signal evaluation triggers, config UI  
- **Railway Proxy (Node.js)** — real-time Binance API access without regional or CORS restrictions

---

## ⚙️ Key Features

### 📊 Market Intelligence
- Live data from Binance Futures (USDT-margined pairs)
- Calculates RSI, EMA, ATR, volume delta, tape imbalance
- Tracks bid/ask spread, funding rates, liquidation zones

### 🧠 AI Signal Engine
- Sends full market snapshot to OpenAI for evaluation
- Receives trade direction, confidence score, expected volatility
- Supports multi-timeframe evaluation (15m, 1h, 4h, 1d)

### 📈 Trading Logic
- Fully autonomous entry, SL, TP placement via Futures API
- Strict risk allocation (% of balance, notional check)
- Cancels invalid orders, re-syncs state after error

### 🔐 Control & Monitoring
- Executes via `syncTrades()` heartbeat logic
- Detects divergence between open positions and orders
- Built-in execution audit with automatic correction

---

## 🛠 Tech Stack

- **Wix Studio** — backend logic and database control
- **Railway** — live proxy server for Binance API
- **Binance Futures API** — real market execution
- **OpenAI GPT** — signal generation based on prompt + market metrics
- **Node.js / JavaScript** — server logic and signal prep

---

## 📬 Contact

- 📧 Email: [support@365jpg.art](mailto:support@365jpg.art)  
- 🌐 Website: [365jpg.art](https://www.365jpg.art)  
- 💼 Upwork: [Hire me](https://www.upwork.com/freelancers/~017752a03bdc66874d)  
- 💬 Telegram: [@studio365jpg](https://t.me/studio365jpg)
