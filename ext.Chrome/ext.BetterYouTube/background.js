// Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
    console.log('BetterYouTube Installed');
});

// Sidebar setup
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Offscreen Document for Socket.io
async function setupOffscreen() {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) return;

    await chrome.offscreen.createDocument({
        url: 'background/offscreen.html',
        reasons: ['EXTERNAL_MESSAGING'],
        justification: 'Socket.io bidirectional communication with server'
    });
}

// IndexedDB Access from Background
const DB_NAME = 'BetterYouTubeDB';
const SETTINGS_STORE = 'settings';
const HISTORY_STORE = 'history';
const CHANNELS_STORE = 'channels';
const PLAYLISTS_STORE = 'playlists';

async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 5); // Unified Version 5
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
                db.createObjectStore(SETTINGS_STORE);
            }
            if (!db.objectStoreNames.contains(HISTORY_STORE)) {
                db.createObjectStore(HISTORY_STORE, { keyPath: 'id', autoIncrement: true });
            }
            // Add sidepanel stores
            if (!db.objectStoreNames.contains('folders')) {
                db.createObjectStore('folders', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('videos')) {
                const store = db.createObjectStore('videos', { keyPath: 'id', autoIncrement: true });
                store.createIndex('folderId', 'folderId', { unique: false });
            }
            if (!db.objectStoreNames.contains(CHANNELS_STORE)) {
                db.createObjectStore(CHANNELS_STORE, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(PLAYLISTS_STORE)) {
                db.createObjectStore(PLAYLISTS_STORE, { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

async function getSettingsFromDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(SETTINGS_STORE, 'readonly');
        const store = transaction.objectStore(SETTINGS_STORE);
        const reqKeywords = store.get('keywords');
        const reqFilters = store.get('filters');

        transaction.oncomplete = () => {
            resolve({
                keywords: reqKeywords.result || [],
                filters: reqFilters.result || { adult: true, gambling: true, drugs: true }
            });
        };
        transaction.onerror = () => reject(transaction.error);
    });
}

async function logHistory(url, title) {
    if (!url || !url.includes('youtube.com/watch')) return;
    const db = await openDB();
    const historyItem = {
        url,
        title,
        timestamp: Date.now()
    };

    const transaction = db.transaction(HISTORY_STORE, 'readwrite');
    transaction.objectStore(HISTORY_STORE).add(historyItem);

    // Also notify socket if connected
    chrome.runtime.sendMessage({
        type: 'SEND_SOCKET',
        event: 'youtube_history',
        data: historyItem
    });
}

async function getUserIdentity() {
    try {
        const userInfo = await chrome.identity.getProfileUserInfo();
        return userInfo;
    } catch (e) {
        console.warn('Identity retrieval failed:', e);
        return { email: 'unknown', id: 'unknown' };
    }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'UPDATE_SERVER') {
        setupOffscreen().then(() => {
            chrome.runtime.sendMessage({ type: 'CONNECT_SOCKET', url: msg.url });
        });
    } else if (msg.type === 'SETTINGS_UPDATED') {
        chrome.tabs.query({ url: "https://www.youtube.com/*" }, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { type: 'RELOAD_SETTINGS' });
            });
        });
    } else if (msg.type === 'GET_SETTINGS') {
        getSettingsFromDB().then(sendResponse);
        return true;
    } else if (msg.type === 'OPEN_SIDEPANEL') {
        chrome.sidePanel.open({ windowId: sender.tab.windowId });
    } else if (msg.type === 'GET_IDENTITY') {
        getUserIdentity().then(sendResponse);
        return true;
    }
});

// Watch YouTube navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com/watch')) {
        logHistory(tab.url, tab.title);
    }
});
