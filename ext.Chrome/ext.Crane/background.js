chrome.runtime.onInstalled.addListener(() => {
  console.log('智能阅读助手已安装');
  
  // 初始化默认配置
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
});

// 处理侧边栏打开
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// 处理从content script发来的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openReader') {
    openReaderTab(request.url, request.content);
    sendResponse({ success: true });
  } else if (request.action === 'getSiteSelector') {
    getSiteSelector(request.hostname).then(selector => {
      sendResponse({ selector });
    });
    return true;
  }
  return true;
});

async function openReaderTab(url, content) {
  try {
    const encodedContent = encodeURIComponent(JSON.stringify(content));
    const readerUrl = chrome.runtime.getURL('readability/reader.html') + `?content=${encodedContent}&url=${encodeURIComponent(url)}`;
    
    const readerTab = await chrome.tabs.create({
      url: readerUrl,
      active: true
    });

    console.log('阅读器标签页已创建:', readerTab.id);

  } catch (error) {
    console.error('打开阅读器失败:', error);
    chrome.tabs.create({
      url: url,
      active: true
    });
  }
}

async function getSiteSelector(hostname) {
  const result = await chrome.storage.local.get(['siteSelectors']);
  const siteSelectors = result.siteSelectors || {};
  
  // 查找匹配的域名配置
  for (const [domain, selector] of Object.entries(siteSelectors)) {
    if (hostname.includes(domain)) {
      return selector;
    }
  }
  
  return null;
}


// 在 background.js 中添加动态控制
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    checkIfShouldInject(tabId, tab.url);
  }
});

async function checkIfShouldInject(tabId, url) {
  try {
    const shouldInject = await shouldInjectContentScript(url);
    
    if (!shouldInject) {
      // 如果不需要注入，可以在这里执行其他逻辑
      console.log('不在该页面注入内容脚本:', url);
    }
  } catch (error) {
    console.error('检查注入状态失败:', error);
  }
}

async function shouldInjectContentScript(url) {
  const excludedUrls = [
    'https://localhost',
    'http://localhost',
    'https://127.0.0.1',
    'http://127.0.0.1',
    'https://www.google.com',
    'https://google.com',
    'https://baidu.com',
    'https://www.baidu.com',
    'chrome://',
    'https://chrome.google.com/webstore'
  ];
  
  return !excludedUrls.some(excludedUrl => url.startsWith(excludedUrl));
}