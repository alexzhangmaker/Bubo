// background.js

chrome.runtime.onInstalled.addListener(() => {
    console.log("WebNote & Reader Mode Extension Installed");

    // Enable Side Panel to open on action click
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.error(error));

    // Initialize default pattern
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
});

// Listener for messages from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getPatterns") {
        chrome.storage.sync.get(['urlPatterns'], (result) => {
            sendResponse({ patterns: result.urlPatterns || [] });
        });
        return true; // Will respond asynchronously
    } else if (request.action === "open_side_panel") {
        chrome.sidePanel.open({ tabId: sender.tab.id });
    } else if (request.action === "getAuthToken") {
        chrome.identity.getAuthToken({ interactive: request.interactive || false }, (token) => {
            if (chrome.runtime.lastError) {
                console.error("Background Auth Error:", chrome.runtime.lastError);
                sendResponse({ error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ token: token });
            }
        });
        return true;
    } else if (request.action === "getGDConfig") {
        chrome.storage.sync.get(['gdFolderName'], (result) => {
            sendResponse({ gdFolderName: result.gdFolderName || 'WebNotes' });
        });
        return true;
    } else if (request.action === "clearAuthToken") {
        chrome.identity.removeCachedAuthToken({ token: request.token }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
});
