import { runBot } from 'backend/Binance/bot';

let isJobRunning = false;

export async function cronRunBot() {
  if (isJobRunning) {
    console.warn('⏳ [cronRunBot] Already running — skipping');
    return;
  }

  isJobRunning = true;

  try {
    console.log('⏰ [cronRunBot] Starting runBot via CRON');
    await runBot(); 
    console.log('✅ [cronRunBot] Completed');
  } catch (err) {
    console.error('❌ [cronRunBot] Error:', err);
  } finally {
    isJobRunning = false;
  }
}
