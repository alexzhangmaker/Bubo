// background.js for BuboReader

chrome.runtime.onInstalled.addListener(() => {
    console.log('BuboReader 已安装');

    // Initialize Crane-style site selectors
    chrome.storage.local.get(['siteSelectors']).then(result => {
        if (!result.siteSelectors) {
            chrome.storage.local.set({
                siteSelectors: {
                    'xueqiu.com': '.article__bd__content',
                    'zhihu.com': '.RichText',
                    'jianshu.com': '.article',
                    'juejin.cn': '.article-content'
                }
            });
        }
    });

    // Initialize webNote-style URL patterns
    chrome.storage.sync.get(['urlPatterns'], (result) => {
        if (!result.urlPatterns) {
            chrome.storage.sync.set({
                urlPatterns: [
                    '*://*.medium.com/*',
                    '*://dev.to/*',
                    '*://*.wikipedia.org/*'
                ]
            });
        }
    });

    // Enable Side Panel
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.error(error));
});

// Handle toolbar button click
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
});

// Unified Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // --- Crane Logic: Open Reader Tab ---
    if (request.action === 'openReader') {
        openReaderTab(request.url, request.content);
        sendResponse({ success: true });
    }
    // --- Crane Logic: Get Site Selector ---
    else if (request.action === 'getSiteSelector') {
        getSiteSelector(request.hostname).then(selector => {
            sendResponse({ selector });
        });
        return true; // async
    }
    // --- webNote Logic: Get URL Patterns ---
    else if (request.action === "getPatterns") {
        chrome.storage.sync.get(['urlPatterns'], (result) => {
            sendResponse({ patterns: result.urlPatterns || [] });
        });
        return true; // async
    }
    // --- webNote Logic: Open Side Panel ---
    else if (request.action === "open_side_panel") {
        chrome.sidePanel.open({ tabId: sender.tab.id });
    }
    // --- webNote Logic: Auth & Drive ---
    else if (request.action === "getAuthToken") {
        chrome.identity.getAuthToken({ interactive: request.interactive || false }, (token) => {
            if (chrome.runtime.lastError) {
                console.error("Background Auth Error:", chrome.runtime.lastError);
                sendResponse({ error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ token: token });
            }
        });
        return true; // async
    }
    else if (request.action === "getGDConfig") {
        chrome.storage.sync.get(['gdFolderName'], (result) => {
            sendResponse({ gdFolderName: result.gdFolderName || 'WebNotes' });
        });
        return true;
    }
    else if (request.action === "clearAuthToken") {
        chrome.identity.removeCachedAuthToken({ token: request.token }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
    // --- Bubo Logic: Collect URL ---
    else if (request.action === "collectUrl") {
        collectUrlToBubo(request.article).then(result => {
            sendResponse(result);
        }).catch(err => {
            sendResponse({ success: false, error: err.message });
        });
        return true; // async
    }
    return true;
});

async function collectUrlToBubo(article) {
    const backendUrl = 'http://localhost:6565/api/urls';
    try {
        const response = await fetch(backendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: article.url,
                title: article.title,
                description: article.description,
                image: article.image
            })
        });

        if (response.ok) {
            return { success: true };
        } else {
            const err = await response.json();
            throw new Error(err.error || response.statusText);
        }
    } catch (e) {
        console.error('Bubo Collection Failed:', e);
        throw e;
    }
}

async function openReaderTab(url, content) {
    try {
        const encodedContent = encodeURIComponent(JSON.stringify(content));
        const readerUrl = chrome.runtime.getURL('readability/reader.html') + `?content=${encodedContent}&url=${encodeURIComponent(url)}`;

        await chrome.tabs.create({
            url: readerUrl,
            active: true
        });
    } catch (error) {
        console.error('打开阅读器失败:', error);
        chrome.tabs.create({ url: url, active: true });
    }
}

async function getSiteSelector(hostname) {
    const result = await chrome.storage.local.get(['siteSelectors']);
    const siteSelectors = result.siteSelectors || {};
    for (const [domain, selector] of Object.entries(siteSelectors)) {
        if (hostname.includes(domain)) return selector;
    }
    return null;
}
