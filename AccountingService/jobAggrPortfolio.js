const cron = require('node-cron');

const ACCOUNTING_API = 'http://localhost:3008/api/portfolio';
const MKT_API = 'http://localhost:3009/api';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runPortfolioAggregation() {
    console.log(`[${new Date().toLocaleString()}] Starting Portfolio Aggregation Job...`);

    try {
        // 1. Trigger aggregation
        const aggRes = await fetch(`${ACCOUNTING_API}/aggregate`, { method: 'POST' });
        const { requestId } = await aggRes.json();
        console.log(`Aggregation triggered. Request ID: ${requestId}`);

        // 2. Poll for status
        let status = 'pending';
        while (status === 'pending') {
            await sleep(2000);
            const statusRes = await fetch(`${ACCOUNTING_API}/status/${requestId}`);
            const statusData = await statusRes.json();
            status = statusData.status;
            if (status === 'failed') throw new Error(`Aggregation failed: ${statusData.error}`);
        }
        console.log('Aggregation completed successfully.');

        // 3. Fetch aggregated data
        const dataRes = await fetch(`${ACCOUNTING_API}/data`);
        const portfolio = await dataRes.json();
        console.log(`Fetched ${portfolio.length} aggregated tickers.`);

        // 4. Enrich with Market Data and Exchange Rates
        const updates = [];
        for (const item of portfolio) {
            try {
                // Get Quote
                let mktRes = await fetch(`${MKT_API}/market`);
                let mktData = await mktRes.json();
                let tickerInfo = mktData.find(m => m.ticker === item.ticker);

                // If ticker not found, fetch it on demand from MktService
                if (!tickerInfo) {
                    console.log(`Ticker ${item.ticker} not found in MktService. Fetching on demand...`);
                    const fetchReq = await fetch(`${MKT_API}/market/fetch/${item.ticker}`, { method: 'POST' });
                    if (fetchReq.ok) {
                        // Refresh market data
                        mktRes = await fetch(`${MKT_API}/market`);
                        mktData = await mktRes.json();
                        tickerInfo = mktData.find(m => m.ticker === item.ticker);
                    } else {
                        console.warn(`Could not fetch data for ${item.ticker} from MktService.`);
                    }
                }

                const quoteTTM = tickerInfo ? tickerInfo.QuoteTTM : 0;

                // Get Exchange Rate to CNY
                let exRate = 1;
                if (item.currency !== 'CNY') {
                    const exRes = await fetch(`${MKT_API}/exrate/${item.currency}/CNY`);
                    const exData = await exRes.json();
                    exRate = exData.rate || 1;
                }

                // Calculations
                const totalCostInCNY = item.shares * item.costPerShare * exRate;
                const earningInPercent = item.costPerShare > 0 
                    ? ((quoteTTM / item.costPerShare) - 1) * 100 
                    : 0;

                updates.push({
                    ticker: item.ticker,
                    totalCostInCNY,
                    exchangeRate: exRate,
                    quoteTTM,
                    earningInPercent
                });
                console.log(`Processed ${item.ticker}: Quote=${quoteTTM}, ExRate=${exRate}`);
            } catch (err) {
                console.error(`Error enriching ${item.ticker}:`, err.message);
            }
        }

        // 5. Update AccountingService
        const updateRes = await fetch(`${ACCOUNTING_API}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        const updateResult = await updateRes.json();
        console.log(`Portfolio enrichment complete: ${updateResult.message}`);
        console.log(`[${new Date().toLocaleString()}] Portfolio Aggregation Job finished.`);

    } catch (err) {
        console.error('Portfolio Aggregation Job failed:', err.message);
    }
}

// Schedule: 8:00 AM every day (Bangkok Time)
cron.schedule('0 8 * * *', () => {
    runPortfolioAggregation();
}, {
    scheduled: true,
    timezone: "Asia/Bangkok"
});

console.log('Portfolio Aggregation Job scheduled for 08:00 AM (Asia/Bangkok)');

// For testing: 
// runPortfolioAggregation();
