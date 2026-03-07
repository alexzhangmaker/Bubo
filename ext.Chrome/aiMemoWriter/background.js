// background.js for AIHelper
chrome.runtime.onInstalled.addListener(() => {
    // Open the side panel when the extension icon is clicked
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.error(error));
});

// Fallback for some Chrome versions or edge cases
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
});
