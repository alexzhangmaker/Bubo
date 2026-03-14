/**
 * Bot Commands Registry
 */

const db = require('./db');

const handlers = {
    'echo': async (args) => {
        return `Echo: ${args.join(' ')}`;
    },
    'alert': async (args) => {
        if (args.length < 3) return "Usage: /alert [ticker] [quote1] [quote2]\n(Quotes can be absolute values like 250 or relative like +5% or -10%)";
        
        const ticker = args[0].toUpperCase();
        let q1Str = args[1];
        let q2Str = args[2];

        // Check if either argument needs the current market price
        let currentPrice = null;
        if (q1Str.includes('%') || q2Str.includes('%')) {
            try {
                // We use dynamic import for the ES module tool
                const path = require('path');
                const modulePath = path.join(__dirname, 'toolYFinance.js');
                const yFinance = require(modulePath); // Since BuboBots is CJS, let's just await import if needed. Wait, in BuboBots it's an ES Module so we need dynamic import.
                const yfMod = await import(`file://${modulePath}`);
                
                const data = await yfMod.API_FetchQuote(ticker);
                currentPrice = data.price;
            } catch (err) {
                return `Failed to fetch current price for ${ticker}: ${err.message}`;
            }
        }

        const parseQuote = (qStr) => {
            if (qStr.endsWith('%')) {
                const percent = parseFloat(qStr.slice(0, -1));
                if (isNaN(percent)) throw new Error(`Invalid percentage: ${qStr}`);
                return currentPrice * (1 + (percent / 100));
            } else {
                const val = parseFloat(qStr);
                if (isNaN(val)) throw new Error(`Invalid numeric value: ${qStr}`);
                return val;
            }
        };

        let quote1, quote2;
        try {
            quote1 = parseQuote(q1Str);
            quote2 = parseQuote(q2Str);
        } catch (e) {
            return e.message;
        }

        const quoteMax = Math.max(quote1, quote2);
        const quoteMin = Math.min(quote1, quote2);

        try {
            await db.addTicker(ticker, quoteMax, quoteMin);
            const priceContext = currentPrice !== null ? ` (Calculated from current price ${currentPrice})` : '';
            return `✅ Tracking ${ticker} established${priceContext}.\nMax (Sell): >= ${quoteMax.toFixed(2)}\nMin (Buy): <= ${quoteMin.toFixed(2)}`;
        } catch (err) {
            return `Failed to update ticker: ${err.message}`;
        }
    },
    'alerts': async () => {
        try {
            const tickers = await db.getTickers();
            if (!tickers || tickers.length === 0) {
                return "<i>List is empty. No tickers are currently being tracked. Use /alert to add one.</i>";
            }

            let response = "<b>📊 Currently Tracked Tickers 📊</b>\n\n";
            for (const t of tickers) {
                const max = t.quoteMax !== null ? `<b>&gt;= ${t.quoteMax.toFixed(2)}</b>` : 'N/A';
                const min = t.quoteMin !== null ? `<b>&lt;= ${t.quoteMin.toFixed(2)}</b>` : 'N/A';
                response += `• <b>${t.ticker}</b>\n  ↳ Sell (Max): ${max}\n  ↳ Buy (Min): ${min}\n\n`;
            }
            return response.trim();
        } catch (err) {
            return `<b>Failed to fetch alerts:</b> ${err.message}`;
        }
    },
    'help': async () => {
        return "<b>Available commands:</b>\n/echo [msg]\n/alert [ticker] [quote1] [quote2]\n/alerts\n/help";
    }
};

async function handleCommand(message) {
    if (!message.startsWith('/')) return null;
    
    const parts = message.slice(1).trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (handlers[command]) {
        return await handlers[command](args);
    }
    
    return `Unknown command: ${command}. Try /help.`;
}

module.exports = {
    handleCommand
};
