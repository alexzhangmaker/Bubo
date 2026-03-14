module.exports.getTaskFunction = function() {
    return async function() {
        try {
            // Load DB to get tracked tickers
            const db = require('../db');
            const tickers = await db.getTickers();
            
            if (!tickers || tickers.length === 0) {
                return "No tickers are currently being tracked.";
            }

            // Dynamically import the ES module
            const yFinance = await import('../toolYFinance.js');
            
            let alerts = [];
            
            for (const t of tickers) {
                try {
                    const data = await yFinance.API_FetchQuote(t.ticker);
                    const price = data.price;
                    
                    if (t.quoteMax !== null && price >= t.quoteMax) {
                        alerts.push(`🔴 SELL ALERT: ${t.ticker} is at ${price} ${data.currency} (>= ${t.quoteMax})`);
                    } else if (t.quoteMin !== null && price <= t.quoteMin) {
                        alerts.push(`🟢 BUY ALERT: ${t.ticker} is at ${price} ${data.currency} (<= ${t.quoteMin})`);
                    }
                } catch (err) {
                    console.error(`[yFinanceTask] Failed quote for ${t.ticker}:`, err.message);
                }
            }

            if (alerts.length > 0) {
                return `🔔 **Stock Price Alerts** 🔔\n\n${alerts.join('\n')}`;
            } else {
                return `📊 Checked ${tickers.length} tickers. No price thresholds met.`;
            }
        } catch (err) {
            return `Task failed: ${err.message}`;
        }
    };
};
