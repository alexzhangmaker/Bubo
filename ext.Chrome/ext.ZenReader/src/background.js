// 取消直接的 onClicked 逻辑，因为启用了 popup.html。现在通过收到消息的方式执行
// chrome.action.onClicked.addListener 是不可用的如果 manifest.json 设定了 default_popup

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'enter-zen-mode' && tab) {
    if (tab.url.startsWith("http://") || tab.url.startsWith("https://")) {
      executeZenReader(tab.id);
    }
  }
});

function executeZenReader(tabId) {
  // Combine into a single call for better reliability in MV3
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['libs/Readability.js', 'src/defaultRules.js', 'src/content_script.js']
  }).catch(err => {
    console.error("ZenReader injection failed:", err);
  });
}

// Handle messages from internal (popup/content) and external (web console)
function handleMessages(message, sender, sendResponse) {
  if (message.action === 'openReader') {
    // Save the article data to local storage so reader.html can access it
    chrome.storage.local.set({ zenReaderArticle: message.article }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/reader.html') });
    });
  } else if (message.action === 'triggerZenScript') {
    // 当 popup 上的 "进入阅读模式" 被点击时，向当前 tab 注入相关抓取脚本
    executeZenReader(message.tabId);
  } else if (message.action === 'fetchMetadata') {
    // 专门为管理后台提供的 CORS-Free 抓取服务
    const isXueqiu = message.url.includes('xueqiu.com');
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
    };
    
    if (isXueqiu) {
      headers['Referer'] = 'https://xueqiu.com/';
    }

    fetch(message.url, { headers })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.text();
      })
      .then(html => {
        // 扩展正则匹配，支持更多的 meta 标签写法
        const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["'](.*?)["']/i) ||
                        html.match(/<meta[^>]*content=["'](.*?)["'][^>]*property=["']og:title["']/i) ||
                        html.match(/<meta[^>]*name=["']title["'][^>]*content=["'](.*?)["']/i);
        
        const titleTagMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
        
        let title = "";
        if (ogMatch && ogMatch[1]) {
          title = ogMatch[1];
        } else if (titleTagMatch && titleTagMatch[1]) {
          title = titleTagMatch[1];
        }
        
        if (!title) {
          console.warn("Could not find title for:", message.url);
          // 如果实在找不到，尝试从正文里搜寻
          const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
          if (h1Match) title = h1Match[1].replace(/<[^>]*>/g, '');
        }

        // 清洗 HTML 实体和多余空格
        title = title.replace(/&quot;/g, '"')
                     .replace(/&amp;/g, '&')
                     .replace(/&lt;/g, '<')
                     .replace(/&gt;/g, '>')
                     .replace(/&#39;/g, "'")
                     .replace(/\s+/g, ' ')
                     .trim();
        
        console.log(`Successfully fetched title for ${message.url}: ${title}`);
        sendResponse({ success: true, title: title });
      })
      .catch(err => {
        console.error(`Fetch failed for ${message.url}:`, err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // 异步响应
  }
}

chrome.runtime.onMessage.addListener(handleMessages);
chrome.runtime.onMessageExternal.addListener(handleMessages);
