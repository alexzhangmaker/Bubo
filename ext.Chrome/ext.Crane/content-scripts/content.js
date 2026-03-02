class SmartReaderToolbar {
  constructor() {
    this.toolbar = null;
    this.isVisible = true;
    this.observer = null;
    this.currentSelector = null;
    this.shouldInitialize = this.shouldRunOnCurrentPage();
    
    //this.excludedSites=[] ;
  }

  // 检查是否应该在当前页面运行
  async shouldRunOnCurrentPage() {
    const hostname = window.location.hostname;
    
    // 从存储中获取排除列表
    const result = await chrome.storage.local.get(['excludedSites']);
    const excludedSites = result.excludedSites || [
      'localhost',
      '127.0.0.1',
      'google.com',
      'www.google.com',
      'baidu.com',
      'www.baidu.com'
    ];
    
    // 检查是否在排除列表中
    const isExcluded = excludedSites.some(excludedSite => 
      hostname === excludedSite || hostname.endsWith('.' + excludedSite)
    );
    
    if (isExcluded) {
      console.log('智能阅读助手: 在排除的网站上禁用', hostname);
      return false;
    }
    
    let bSpecial = this.isSpecialPage() ;
    if(bSpecial){
      return !bSpecial ;
    }
    
    //return !this.isSpecialPage();
    this.init() ;
  }

  // 检查特殊页面
  isSpecialPage() {
    // 检查是否是浏览器内部页面
    if (window.location.protocol === 'chrome:') {
      return true;
    }
    
    // 检查是否是扩展页面
    if (window.location.href.startsWith('chrome-extension://')) {
      return true;
    }
    
    // 检查是否是空白页或新标签页
    if (window.location.href === 'about:blank' || 
        window.location.href === 'chrome://newtab/' ||
        window.location.href === 'about:newtab') {
      return true;
    }
    
    return false;
  }

  async init() {
     if (!this.shouldInitialize) {
      return;
    }
    
    await this.loadSiteSelector();
    this.createToolbar();
    this.injectTippy();
    this.setupMutationObserver();
    this.setupMessageListener();
  }

  // 加载网站特定的选择器配置
  async loadSiteSelector() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getSiteSelector',
        hostname: window.location.hostname
      });
      
      this.currentSelector = response.selector;
      console.log('加载的选择器配置:', this.currentSelector);
    } catch (error) {
      console.error('加载选择器配置失败:', error);
    }
  }

  createToolbar() {
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'smart-reader-toolbar';
    
    const buttons = [
      {
        icon: this.getHomeIcon(),
        tooltip: '主页',
        action: () => this.goHome()
      },
      {
        icon: this.getReaderIcon(),
        tooltip: '阅读模式',
        action: () => this.activateReader()
      },
      {
        icon: this.getBookmarkIcon(),
        tooltip: '添加书签',
        action: () => this.addBookmark()
      },
      {
        icon: this.getRemoveIcon(),
        tooltip: '不再监控',
        action: () => this.removeWatching()
      },
      { type: 'divider' },
      {
        icon: this.getSettingsIcon(),
        tooltip: '设置',
        action: () => this.openSettings()
      }
    ];

    buttons.forEach(buttonConfig => {
      if (buttonConfig.type === 'divider') {
        const divider = document.createElement('div');
        divider.className = 'toolbar-divider';
        this.toolbar.appendChild(divider);
      } else {
        const button = document.createElement('button');
        button.className = 'toolbar-btn';
        button.innerHTML = buttonConfig.icon;
        button.setAttribute('data-tippy-content', buttonConfig.tooltip);
        button.addEventListener('click', buttonConfig.action);
        this.toolbar.appendChild(button);
      }
    });

    document.body.appendChild(this.toolbar);
  }

  // 图标方法
  getHomeIcon() {
    return `
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="currentColor"/>
      </svg>
    `;
  }

  getReaderIcon() {
    return `
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z" fill="currentColor"/>
      </svg>
    `;
  }

  getBookmarkIcon() {
    return `
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z" fill="currentColor"/>
      </svg>
    `;
  }

  getSettingsIcon() {
    return `
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" fill="currentColor"/>
      </svg>
    `;
  }

  getRemoveIcon(){
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="none" stroke="#000000" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h8m-4 9a9 9 0 1 1 0-18a9 9 0 0 1 0 18Z"/></svg>
    ` ;
  }

  injectTippy() {
    if (typeof tippy !== 'undefined') {
      tippy('[data-tippy-content]', {
        theme: 'smart-reader',
        placement: 'right',
        arrow: true,
        delay: [100, 50]
      });
    } else {
      // 如果 tippy 未加载，使用原生 title 属性
      document.querySelectorAll('.toolbar-btn').forEach(btn => {
        const tooltip = btn.getAttribute('data-tippy-content');
        if (tooltip) {
          btn.setAttribute('title', tooltip);
        }
      });
    }
  }

  // 设置 MutationObserver 来监听动态内容
  setupMutationObserver() {
    if (!this.currentSelector) return;

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // 检查新增的节点是否包含目标元素
              if (node.matches && node.matches(this.currentSelector)) {
                console.log('检测到目标元素出现:', this.currentSelector);
                return;
              }
              
              // 检查新增节点的子节点
              const targetElement = node.querySelector && node.querySelector(this.currentSelector);
              if (targetElement) {
                console.log('检测到目标元素在子节点中出现:', this.currentSelector);
                return;
              }
            }
          }
        }
      }
    });

    // 开始观察
    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('MutationObserver 已启动，监听选择器:', this.currentSelector);
  }

  // 使用配置的选择器提取内容
  async extractContentWithSelector() {
    if (this.currentSelector) {
      console.log('尝试使用配置的选择器:', this.currentSelector);
      
      const element = document.querySelector(this.currentSelector);
      if (element) {
        console.log('找到目标元素，内容长度:', element.innerHTML.length);
        return {
          title: this.getArticleTitle(),
          content: element.outerHTML,
          textContent: element.textContent,
          excerpt: element.textContent.substring(0, 200) + '...',
          siteName: window.location.hostname,
          length: element.textContent.length
        };
      } else {
        console.log('配置的选择器未找到元素:', this.currentSelector);
      }
    }
    
    // 回退到 Readability
    return await this.parseWithReadability();
  }

  getArticleTitle() {
    return document.title || 
           document.querySelector('h1')?.textContent || 
           '无标题';
  }

  async parseWithReadability() {
    return new Promise((resolve) => {
      try {
        if (typeof Readability === 'undefined') {
          resolve(this.getFallbackContent());
          return;
        }

        // 创建文档副本进行处理
        const documentClone = document.cloneNode(true);
        
        // 清理可能干扰的元素
        this.cleanDocument(documentClone);
        
        // 使用 Readability 解析
        const readability = new Readability(documentClone);
        const article = readability.parse();
        
        resolve(article || this.getFallbackContent());
      } catch (error) {
        console.error('Readability 解析错误:', error);
        resolve(this.getFallbackContent());
      }
    });
  }

  getFallbackContent() {
    // 简单的备选内容提取
    const title = this.getArticleTitle();
    const content = this.extractMainContent();
    
    return {
      title: title,
      content: content,
      textContent: this.stripHTML(content),
      excerpt: '使用简化模式提取的内容',
      siteName: window.location.hostname,
      length: content.length
    };
  }

  extractMainContent() {
    // 尝试找到主要内容区域
    const contentSelectors = [
      'article',
      'main',
      '.post-content',
      '.entry-content',
      '.article-content',
      '.content',
      '#content'
    ];
    
    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element.innerHTML;
      }
    }
    
    // 如果没有找到特定元素，使用 body 内容但清理不需要的元素
    const body = document.body.cloneNode(true);
    this.cleanDocument(body);
    return body.innerHTML;
  }

  stripHTML(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  cleanDocument(doc) {
    // 移除可能干扰阅读的元素
    const selectors = [
      'script', 'style', 'nav', 'header', 'footer', 
      '.ad', '.advertisement', '.popup', '.modal',
      '.navbar', '.header', '.footer', '.sidebar',
      'iframe', 'object', 'embed'
    ];
    
    selectors.forEach(selector => {
      const elements = doc.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    });
  }

  async activateReader() {
    try {
      this.showLoadingMessage('正在准备阅读模式...');

      // 等待可能的内容加载
      await this.waitForContent();

      const article = await this.extractContentWithSelector();
      
      if (!article || !article.content) {
        throw new Error('无法提取页面内容');
      }

      console.log('内容提取完成:', {
        title: article.title,
        contentLength: article.content.length,
        method: this.currentSelector ? '配置选择器' : 'Readability'
      });

      this.sendToReader(article);

    } catch (error) {
      console.error('激活阅读模式失败:', error);
      this.showErrorMessage('激活阅读模式失败: ' + error.message);
    }
  }

  // 等待内容加载
  waitForContent() {
    return new Promise((resolve) => {
      if (this.currentSelector) {
        // 如果已经存在目标元素，立即返回
        const element = document.querySelector(this.currentSelector);
        if (element && element.textContent && element.textContent.length > 100) {
          console.log('目标元素已存在，无需等待');
          resolve();
          return;
        }

        // 设置超时
        const timeout = setTimeout(() => {
          console.log('等待内容加载超时');
          resolve();
        }, 5000);

        // 使用 MutationObserver 等待目标元素出现
        const observer = new MutationObserver((mutations, obs) => {
          const targetElement = document.querySelector(this.currentSelector);
          if (targetElement && targetElement.textContent && targetElement.textContent.length > 100) {
            clearTimeout(timeout);
            obs.disconnect();
            console.log('检测到目标元素加载完成');
            resolve();
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      } else {
        // 没有配置选择器，直接继续
        resolve();
      }
    });
  }

  // 检测选择器功能（供侧边栏调用）
  detectContentSelector() {
    // 简单的选择器检测逻辑
    const contentSelectors = [
      'article',
      '.article-content',
      '.post-content',
      '.content',
      '.entry-content',
      '.main-content',
      '[class*="content"]',
      '[class*="article"]'
    ];

    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent && element.textContent.length > 200) {
        return selector;
      }
    }

    return null;
  }

  // 消息监听（供侧边栏调用）
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'detectSelector') {
        const selector = this.detectContentSelector();
        sendResponse({ selector });
        return true;
      }
    });
  }

  sendToReader(article) {
    chrome.runtime.sendMessage({
      action: 'openReader',
      url: window.location.href,
      content: article
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('发送消息失败:', chrome.runtime.lastError);
        this.showErrorMessage('打开阅读器失败: ' + chrome.runtime.lastError.message);
      } else {
        this.showLoadingMessage('正在打开阅读器...');
        setTimeout(() => this.removeExistingMessages(), 1000);
      }
    });
  }

  showLoadingMessage(message) {
    this.removeExistingMessages();
    
    const loadingMsg = document.createElement('div');
    loadingMsg.id = 'smart-reader-loading';
    loadingMsg.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 15px 25px;
      border-radius: 8px;
      z-index: 10001;
      font-size: 14px;
      backdrop-filter: blur(10px);
    `;
    loadingMsg.textContent = message;
    document.body.appendChild(loadingMsg);
  }

  showErrorMessage(message) {
    this.removeExistingMessages();
    
    const errorMsg = document.createElement('div');
    errorMsg.id = 'smart-reader-error';
    errorMsg.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(220,53,69,0.9);
      color: white;
      padding: 15px 25px;
      border-radius: 8px;
      z-index: 10001;
      font-size: 14px;
      max-width: 300px;
      text-align: center;
      backdrop-filter: blur(10px);
    `;
    errorMsg.textContent = message;
    document.body.appendChild(errorMsg);
    
    setTimeout(() => {
      this.removeExistingMessages();
    }, 5000);
  }

  removeExistingMessages() {
    const loadingMsg = document.getElementById('smart-reader-loading');
    const errorMsg = document.getElementById('smart-reader-error');
    
    if (loadingMsg) loadingMsg.remove();
    if (errorMsg) errorMsg.remove();
  }

  goHome() {
    window.location.href = 'https://www.google.com';
  }

  addBookmark() {
    const title = document.title;
    const url = window.location.href;
    
    if (window.confirm(`添加书签: "${title}"?`)) {
      this.showLoadingMessage('书签已添加');
      setTimeout(() => this.removeExistingMessages(), 1000);
    }
  }

  /*
  async loadExcludedSites() {
    const result = await chrome.storage.local.get(['excludedSites']);
    this.excludedSites = result.excludedSites || [
        'localhost',
        '127.0.0.1',
        'google.com',
        'www.google.com',
        'baidu.com',
        'www.baidu.com'
    ];
  }
  */
  async removeWatching(){
    console.log('removeWatching');
    let result = await chrome.storage.local.get(['excludedSites']);
    let excludedSites = result.excludedSites || [] ;
    const currentDomain = window.location.hostname;
    console.log(currentDomain);
    if (excludedSites.includes(currentDomain)!=true) {
      excludedSites.push(currentDomain);
      await chrome.storage.local.set({ excludedSites: excludedSites });
    }
  }

  openSettings() {
    chrome.sidePanel.open();
  }
}

// 初始化
function initializeToolbar() {
  try {
    const toolbar = new SmartReaderToolbar();
    console.log('智能阅读助手工具栏已初始化');
  } catch (error) {
    console.error('初始化工具栏失败:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeToolbar);
} else {
  initializeToolbar();
}