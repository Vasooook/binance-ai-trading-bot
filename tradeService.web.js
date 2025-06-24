// backend/Binance/tradeService.web.js

import { syncTrades } from 'backend/Binance/tradeSync';
import { runBot } from 'backend/Binance/bot';

let isJobRunning = false;

export async function syncAndRun() {
    if (isJobRunning) {
        return { status: 'busy' };
    }
    isJobRunning = true;
    try {
        console.log('🔄 [tradeService] syncTrades...');
        const acct = await syncTrades();

        console.log('🚀 [tradeService] runBot...');
        await runBot(acct);

        console.log('✅ [tradeService] done');
        return { status: 'ok' };
    } catch (err) {
        console.error('❌ [tradeService] error:', err);
        return { status: 'error', message: err.message };
    } finally {
        isJobRunning = false;
    }
}