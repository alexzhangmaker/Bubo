import { addArticle, getAllFolders, addFolder } from './db.js';

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onInstalled.addListener(() => {
  console.log('BetterYahoo extension installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openSidepanel') {
    chrome.sidePanel.open({ windowId: sender.tab.windowId });
    return true;
  }

  if (message.action === 'saveArticle') {
    handleSaveArticle(message, sender).then(res => sendResponse(res));
    return true; // Keep message channel open for async response
  }
});

async function handleSaveArticle(message, sender) {
  try {
    let folders = await getAllFolders();
    let targetFolder;

    if (folders.length === 0) {
      const newFolderId = await addFolder('Quick Saves', 0);
      targetFolder = { id: newFolderId };
    } else {
      targetFolder = folders[0]; // Save to the first folder by default
    }

    await addArticle(targetFolder.id, message.title, message.url);

    // Notify sidepanel if open
    chrome.runtime.sendMessage({ action: 'refreshFolders' }).catch(() => { });

    // Open side panel to show progress
    await chrome.sidePanel.open({ windowId: sender.tab.windowId });

    return { success: true };
  } catch (error) {
    console.error('Error saving article:', error);
    return { success: false, error: error.message };
  }
}
