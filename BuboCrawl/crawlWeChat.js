require('dotenv').config();
const { chromium } = require('playwright');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm'); 
const fs = require('fs');
const path = require('path');

const inputUrl = 'https://mp.weixin.qq.com/mp/wappoc_appmsgcaptcha?poc_token=HM6PD2qj1f-jP-ZueX6DOJKX8s0JiiRYxFrlVGRO&target_url=https%3A%2F%2Fmp.weixin.qq.com%2Fs%2FGiN0oZzE9CnNCHF8o0528Q';


const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// 1. 初始化 R2 客户端 (从环境变量中获取敏感配置以确保安全)
const r2Client = new S3Client({
  region: 'auto', // Cloudflare R2 必须写 'auto'
  endpoint: process.env.R2_ENDPOINT, 
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

// 在你的爬虫逻辑中，拿到 markdown 字符串后（假设变量名为 fileContent）：
async function uploadToR2(fileName, content) {
  try {
    const command = new PutObjectCommand({
      Bucket: 'markdown-articles', // 你刚才创建的桶名
      Key: fileName,               // 在 R2 中的文件名，比如 "wechat_article.md"
      Body: content,               // Markdown 文本内容
      ContentType: 'text/markdown'
    });
    
    await r2Client.send(command);
    console.log(`☁️ 成功上传到 Cloudflare R2: ${fileName}`);
  } catch (error) {
    console.error('上传到 R2 失败:', error);
  }
}


function cleanWeChatUrl(urlStr) {
  try {
    const urlObj = new URL(urlStr);
    const targetUrl = urlObj.searchParams.get('target_url');
    return targetUrl ? decodeURIComponent(targetUrl) : urlStr;
  } catch (e) {
    return urlStr;
  }
}

async function convertWeChatToMarkdown() {
  const targetUrl = cleanWeChatUrl(inputUrl);
  console.log(`目标真实链接: ${targetUrl}`);
  console.log('正在启动浏览器...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    console.log('正在打开微信文章页面并等待加载...');
    await page.goto(targetUrl, { waitUntil: 'networkidle' });

    const title = await page.locator('#activity-name').innerText();
    const cleanTitle = title.replace(/[\/\\:*?"<>|]/g, '').trim();
    console.log(`成功抓取文章: "${cleanTitle}"`);

    // 核心修复区域：DOM 预处理
    await page.evaluate(() => {
      // 1. 修复图片防盗链
      const imgs = document.querySelectorAll('#js_content img');
      imgs.forEach(img => {
        const realSrc = img.getAttribute('data-src');
        if (realSrc) img.setAttribute('src', realSrc);
      });

      // 2. 彻底清洗表格，把单元格内的换行符全部干掉
      const tableCells = document.querySelectorAll('#js_content th, #js_content td');
      tableCells.forEach(cell => {
        // 提取单元格内的纯文本（这会自动剥离掉复杂的嵌套标签比如 span），并将多余换行和空格替换为单空格
        let textContent = cell.innerText || cell.textContent || '';
        textContent = textContent.replace(/[\r\n]+/g, ' ').trim();
        // 重写单元格的 HTML 为极简纯文本
        cell.innerHTML = textContent;
      });
    });

    const contentHtml = await page.locator('#js_content').innerHTML();

    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      hr: '---'
    });
    
    turndownService.use(gfm);

    turndownService.addRule('wechat-img', {
      filter: 'img',
      replacement: function (content, node) {
        const src = node.getAttribute('data-src') || node.getAttribute('src') || '';
        const alt = node.getAttribute('alt') || 'image';
        return src ? `![${alt}](${src})\n` : '';
      }
    });

    console.log('正在转换 HTML 为 Markdown (包含表格解析)...');
    let markdown = turndownService.turndown(contentHtml);

    const fileContent = `# ${cleanTitle}\n\n> 原始链接: ${targetUrl}\n\n---\n\n${markdown}`;

    const fileName = `${cleanTitle || 'wechat_article'}.md`;
    fs.writeFileSync(path.join(__dirname, fileName), fileContent, 'utf8');
    
    console.log(`转换成功！标准表格已生成。文件保存为: ${fileName}`);

    // 在你之前脚本的 fs.writeFileSync 后面加上：
    await uploadToR2(fileName, fileContent);

  } catch (error) {
    console.error('转换过程中发生错误:', error);
  } finally {
    await browser.close();
  }
}

convertWeChatToMarkdown();

