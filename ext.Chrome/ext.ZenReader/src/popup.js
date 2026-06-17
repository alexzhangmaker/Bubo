document.getElementById('btn-zen').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && (tab.url.startsWith("http://") || tab.url.startsWith("https://"))) {
        chrome.runtime.sendMessage({ action: 'triggerZenScript', tabId: tab.id }, () => {
            window.close();
        });
    }
});

document.getElementById('btn-report').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        alert("已记录网页：" + tab.url + "\n非常感谢您的反馈！此操作未来可以对接您的后端错误收口，并自动完善 rules.js。");
    }
    window.close();
});

document.getElementById('btn-options').addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        window.open(chrome.runtime.getURL('src/options.html'));
    }
    window.close();
});
