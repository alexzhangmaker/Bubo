(async function() {
  if (window.zenReaderExtracted) return;
  window.zenReaderExtracted = true;

  try {
      const documentClone = document.cloneNode(true);
      
      // 处理 Lazy Load 图片
      const images = documentClone.querySelectorAll('img');
      images.forEach(img => {
          const src = img.getAttribute('src');
          const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src');
          if (!src || src.startsWith('data:image/') || src.indexOf('blank') !== -1) {
              if (dataSrc) img.setAttribute('src', dataSrc);
          }
          if (dataSrc && dataSrc !== src) {
              img.setAttribute('src', dataSrc);
          }
          if (img.getAttribute('src') && !img.getAttribute('src').startsWith('http') && !img.getAttribute('src').startsWith('data:')) {
              try {
                 img.setAttribute('src', new URL(img.getAttribute('src'), window.location.href).href);
              } catch(e) {}
          }
      });

      let article = null;
      const hostname = window.location.hostname;
      
      // Priority 1: User Custom Rules 
      const storageRes = await new Promise(resolve => chrome.storage.sync.get(['zenUserRules'], resolve));
      const userRules = storageRes.zenUserRules || {};
      
      // Priority 2: Built-in Site Rules
      const defaultRules = window.ZenReaderDefaultRules || {};
      
      // 匹配机制: 检测 userRules，若没命中检测 defaultRules
      let activeRule = null;
      for (const domain in userRules) {
          if (hostname === domain || hostname.endsWith('.' + domain)) {
              activeRule = userRules[domain];
              break;
          }
      }
      if (!activeRule) {
          for (const domain in defaultRules) {
              if (hostname === domain || hostname.endsWith('.' + domain)) {
                  activeRule = defaultRules[domain];
                  break;
              }
          }
      }

      // Execute Override 根据 Schema 规则剥去外壳
      if (activeRule) {
          if (activeRule.exclude && Array.isArray(activeRule.exclude)) {
              activeRule.exclude.forEach(selector => {
                  const badEls = documentClone.querySelectorAll(selector);
                  badEls.forEach(el => el.remove());
              });
          }

          let extractedTitle = document.title;
          if (activeRule.titleSelector) {
              const tEl = documentClone.querySelector(activeRule.titleSelector);
              if (tEl) extractedTitle = tEl.textContent.trim();
          }

          let extractedContent = '';
          if (activeRule.contentSelector) {
              const cEl = documentClone.querySelector(activeRule.contentSelector);
              if (cEl) extractedContent = cEl.innerHTML;
          }

          if (extractedContent) {
              article = {
                  title: extractedTitle,
                  content: extractedContent,
                  byline: ''
              };
          }
      }

      // Priority 3: Fallback 使用兜底 Readability 方案
      if (!article) {
          // 这里是针对雪球的专项坏例硬编码修理挂载（即使没有命中特定 json 或 content 为空回退）
          // 确保在被扔进 Readability 算法前破坏干扰的作者区块
          if (hostname.includes('xueqiu.com')) {
              const xqAuthor = documentClone.querySelector('.article__bd__author');
              if (xqAuthor) xqAuthor.remove();
          }

          const reader = new Readability(documentClone);
          article = reader.parse();
      }

      // 发射提取后的数据给后台
      if (article) {
        article.sourceUrl = window.location.href;
        chrome.runtime.sendMessage({
          action: 'openReader',
          article: article
        });
      } else {
        alert("ZenReader: 无法从当前页面提取正文。");
      }
  } catch (err) {
      console.error(err);
      alert("ZenReader: 发生致命错误，提取失败。请查看控制台日志。");
  } finally {
      window.zenReaderExtracted = false;
  }
})();
