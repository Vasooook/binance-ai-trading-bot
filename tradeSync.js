// backend/Binance/syncTrades.js
import { getOpenOrders, cancelAllOrders, getAccountInfo, getOrderStatus } from './binanceApi';
import { items } from '@wix/data';

export async function updateOrderStatuses() {
    console.log('🔄 Updating order statuses from the database...');
    try {
        const { items: openTrades } = await items.query('Trades')
            .hasSome('status', 'OPEN', 'FILLED')
            .find();

        for (const trade of openTrades) {
            const { _id, symbol, orderId } = trade;
            if (!symbol || !orderId) continue;

            try {
                const statusResp = await getOrderStatus(symbol, orderId);
                const newStatus = statusResp?.status;
                if (!newStatus || newStatus === trade.status) continue;

                const fullRecord = await items.get('Trades', _id);
                await items.update('Trades', {
                    ...fullRecord,
                    status: newStatus
                });

                console.log(`🔁 [${symbol}] Status updated: ${trade.status} → ${newStatus}`);
            } catch (err) {
                console.warn(`⚠️ [${symbol}] Error updating status:`, err.message);
            }
        }
    } catch (err) {
        console.error('❌ Error getting trades from the database:', err.message);
    }
}

export async function syncTrades() {
    console.log('🚀 [syncTrades] Start syncing trades...');

    let acct;
    try {
        console.log('📡 Getting account data...');
        acct = await getAccountInfo();
        console.log('✅ Account data received');
    } catch (err) {
        console.error('❌ [syncTrades] getAccountInfo failed:', err);
        return;
    }

    const openPositions = acct.positions.filter(p => +p.positionAmt !== 0);
    const openSymbols = openPositions.map(p => p.symbol);
    console.log(`📊 Open positions: ${openSymbols.join(', ') || 'none'}`);

    let allOrders = [];
    try {
        allOrders = await getOpenOrders();
    } catch (err) {
        console.error('❌ Error getting all orders:', err);
        return;
    }

    const groupedOrders = {};
    for (const order of allOrders) {
        if (!order.symbol) continue;
        if (!groupedOrders[order.symbol]) groupedOrders[order.symbol] = [];
        groupedOrders[order.symbol].push(order);
    }

    const symbolsWithOrders = Object.keys(groupedOrders);
    for (const symbol of symbolsWithOrders) {
        const orders = groupedOrders[symbol];
        const hasOpenPosition = openSymbols.includes(symbol);
        if (hasOpenPosition) continue;

        try {
            await cancelAllOrders(symbol);
            console.log(`🧹 Canceled ${orders.length} orders for ${symbol} (no position)`);
        } catch (err) {
            console.error(`❌ Error canceling orders for ${symbol}:`, err.message);
        }
    }

    try {
        const { items: openTrades } = await items.query('Trades')
            .hasSome('status', 'OPEN', 'FILLED')
            .find();

        for (const trade of openTrades) {
            const { _id, symbol, stopOrderId, takeOrderIds = [] } = trade;
            if (!symbol) continue;

            let closedBy = null;

            if (stopOrderId) {
                try {
                    const stopStatus = await getOrderStatus(symbol, stopOrderId);
                    if (stopStatus.status === 'FILLED') closedBy = 'CLOSED_SL';
                } catch (err) {
                    console.warn(`⚠️ [${symbol}] Error checking SL:`, err.message);
                }
            }

            for (const tpId of takeOrderIds) {
                try {
                    const tpStatus = await getOrderStatus(symbol, tpId);
                    if (tpStatus.status === 'FILLED') closedBy = 'CLOSED_TP';
                } catch (err) {
                    console.warn(`⚠️ [${symbol}] Error checking TP:`, err.message);
                }
            }

            if (closedBy) {
                const fullRecord = await items.get('Trades', _id);
                await items.update('Trades', {
                    ...fullRecord,
                    status: closedBy
                });
                console.log(`✅ [${symbol}] Status updated: ${closedBy}`);
            }
        }
    } catch (err) {
        console.error('❌ Error updating closed orders:', err.message);
    }

    await updateOrderStatuses();
    console.log('✅ Synchronization complete');
    return acct;
}

async function updateTradeStatus(trade, newStatus, closedBy) {
    if (trade.status === newStatus) return;

    trade.status = newStatus;
    trade.closedBy = closedBy;
    await trade.save();
}