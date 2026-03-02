// toolYFinance.js

async function _getYahooCrumbAndCookies() {
    const response = await fetch('https://fc.yahoo.com', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
        }
    });
    const cookies = response.headers.get('set-cookie');
    const crumbResponse = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
            'Cookie': cookies
        }
    });
    const crumb = await crumbResponse.text();
    return { crumb, cookies };
}

async function _fetchYahooData(ticker, crumb, cookies) {
    let url = `https://query1.finance.yahoo.com/v7/finance/quote?&symbols=${ticker}&fields=currency,regularMarketChange,regularMarketChangePercent,regularMarketPrice,regularMarketTime,shortName,quoteType,fullExchangeName&formatted=false&region=US&lang=en-US`;

    const response = await fetch(`${url}&crumb=${crumb}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
            'Cookie': cookies
        }
    });

    if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 60;
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        return _fetchYahooData(ticker, crumb, cookies);
    }
    if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
    return response.json();
}

export async function API_FetchStockMeta(ticker) {
    const { crumb, cookies } = await _getYahooCrumbAndCookies();
    let mktData = await _fetchYahooData(ticker, crumb, cookies);
    if (!mktData.quoteResponse.result || mktData.quoteResponse.result.length === 0) {
        throw new Error(`Ticker ${ticker} not found`);
    }
    const yResult = mktData.quoteResponse.result[0];
    return {
        symbol: yResult.symbol,
        name: yResult.shortName || yResult.symbol,
        asset_type: yResult.quoteType,
        currency: yResult.currency,
        exchange: yResult.fullExchangeName,
        price: yResult.regularMarketPrice,
        change: yResult.regularMarketChange,
        percent: yResult.regularMarketChangePercent,
        updated: new Date(yResult.regularMarketTime * 1000).toLocaleString()
    };
}

export async function API_FetchQuote(ticker) {
    const { crumb, cookies } = await _getYahooCrumbAndCookies();
    let mktData = await _fetchYahooData(ticker, crumb, cookies);
    if (!mktData.quoteResponse.result || mktData.quoteResponse.result.length === 0) {
        throw new Error(`Ticker ${ticker} not found`);
    }
    const yResult = mktData.quoteResponse.result[0];
    return {
        symbol: yResult.symbol,
        price: yResult.regularMarketPrice,
        currency: yResult.currency,
        change: yResult.regularMarketChange,
        percent: yResult.regularMarketChangePercent
    };
}

export async function API_FetchExRate(from, to) {
    const { crumb, cookies } = await _getYahooCrumbAndCookies();
    let cCurrencyTicker = `${from}${to}=X`;
    let mktData = await _fetchYahooData(cCurrencyTicker, crumb, cookies);
    if (!mktData.quoteResponse.result || mktData.quoteResponse.result.length === 0) {
        throw new Error(`Exchange rate ${from}/${to} not found`);
    }
    return mktData.quoteResponse.result[0].regularMarketPrice;
}
