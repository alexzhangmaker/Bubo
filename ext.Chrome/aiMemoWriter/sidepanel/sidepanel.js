// sidepanel.js for AIHelper
document.addEventListener('DOMContentLoaded', () => {
    const apiUrlInput = document.getElementById('api-url');
    const saveBtn = document.getElementById('save-btn');
    const status = document.getElementById('status');

    // Load existing config
    chrome.storage.local.get(['bubo_api_url'], (result) => {
        if (result.bubo_api_url) {
            apiUrlInput.value = result.bubo_api_url;
        }
    });

    saveBtn.onclick = () => {
        const url = apiUrlInput.value.trim().replace(/\/$/, ''); // Remove trailing slash
        chrome.storage.local.set({ bubo_api_url: url }, () => {
            status.innerText = '✅ Saved successfully';
            status.style.color = '#10b981';
            setTimeout(() => { status.innerText = ''; }, 3000);
        });
    };

    const homeBtn = document.getElementById('home-btn');
    homeBtn.onclick = () => {
        chrome.tabs.create({ url: 'http://localhost:3301/appMemoKeeper.html' });
    };

    const bookmarksBtn = document.getElementById('bookmarks-btn');
    bookmarksBtn.onclick = () => {
        chrome.tabs.create({ url: 'http://localhost:6565/bookmarks/index.html' });
    };
});
