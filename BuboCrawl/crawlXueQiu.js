const { chromium } = require('playwright');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');
const fs = require('fs');
const path = require('path');

/**
 * 将雪球文章转换为 Markdown
 * @param {string} targetUrl 雪球文章的完整URL
 */
async function downloadXueqiuArticle(targetUrl) {
  console.log(`正在启动浏览器获取雪球文章...`);
  console.log(`目标链接: ${targetUrl}`);
  
  // 建议保持 headless: true，如果遇到雪球的反爬滑块验证码，可以改为 false 手动滑一下
  const browser = await chromium.launch({ headless: true });
  // 使用标准的桌面端 User-Agent，防止被重定向到需要下载App的移动端页面
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    console.log('正在打开雪球页面并等待加载...');
    await page.goto(targetUrl, { waitUntil: 'networkidle' });

    // 1. 获取标题 (雪球的长文标题通常是 h1，短文可能没有明显标题，就用页面 title 兜底)
    const title = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        if (h1 && h1.innerText) return h1.innerText;
        return document.title.split(' - ')[0]; // 使用网页标题截断作为兜底
    });
    const cleanTitle = title.replace(/[\/\\:*?"<>|]/g, '').trim();
    console.log(`成功抓取文章标题: "${cleanTitle}"`);

    // 2. DOM 预处理与清理
    await page.evaluate(() => {
      // 修复图片：雪球的图片可能会有懒加载 (data-original)，且可能是 '//' 开头的无协议链接
      const imgs = document.querySelectorAll('img');
      imgs.forEach(img => {
        let src = img.getAttribute('data-original') || img.getAttribute('src');
        if (src) {
          if (src.startsWith('//')) {
            src = 'https:' + src; // 补全 HTTPS
          }
          img.setAttribute('src', src);
        }
      });

      // 保留表格清洗逻辑，防止 Markdown 表格因换行符而错乱
      const tableCells = document.querySelectorAll('th, td');
      tableCells.forEach(cell => {
        let textContent = cell.innerText || cell.textContent || '';
        textContent = textContent.replace(/[\r\n]+/g, ' ').trim();
        cell.innerHTML = textContent;
      });
    });

    // 3. 提取文章内容 HTML
    // 兼容雪球的多种正文容器类名（长文、短动态等）
    const contentHtml = await page.evaluate(() => {
      const selectors = [
        '.article__bd__detail', // 长文主要内容
        '.edit-detail',         // 动态正文
        '.status-content',      // 另一种动态正文
        '.article-bd'           // 备用
      ];
      
      for (let s of selectors) {
        const el = document.querySelector(s);
        if (el) return el.innerHTML;
      }
      return null;
    });

    if (!contentHtml) {
      throw new Error("未能精准定位雪球页面的正文容器，页面结构可能已发生改变。");
    }

    // 4. 初始化 Turndown 解析器
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      hr: '---'
    });
    
    // 开启 GitHub 风格的 Markdown 支持（主要为了表格）
    turndownService.use(gfm);

    console.log('正在转换 HTML 为 Markdown...');
    let markdown = turndownService.turndown(contentHtml);

    // 拼接最终的 Markdown 内容
    const fileContent = `# ${cleanTitle}\n\n> 数据来源: 雪球网\n> 原始链接: ${targetUrl}\n\n---\n\n${markdown}`;

    // 保存文件
    const fileName = `${cleanTitle || 'xueqiu_article'}.md`;
    fs.writeFileSync(path.join(__dirname, fileName), fileContent, 'utf8');
    
    console.log(`✅ 转换成功！文件已保存为: ${fileName}`);

  } catch (error) {
    console.error('❌ 转换过程中发生错误:', error);
  } finally {
    await browser.close();
  }
}

// 执行函数：下载你提供的目标 URL
const xueqiuUrl = 'https://xueqiu.com/7056520289/390044601';
downloadXueqiuArticle(xueqiuUrl);