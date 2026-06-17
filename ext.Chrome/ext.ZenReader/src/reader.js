document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['zenReaderArticle'], (result) => {
        const article = result.zenReaderArticle;
        if (article) {
            window.articleContext = article;
            document.title = article.title + ' - ZenReader';
            document.getElementById('article-title').textContent = article.title;
            
            if (article.byline) {
                document.getElementById('article-byline').textContent = article.byline;
            }
            if (article.sourceUrl) {
                const link = document.createElement('a');
                link.href = article.sourceUrl;
                link.textContent = '查看原文';
                link.style.marginLeft = '15px';
                link.style.color = 'var(--zen-link)';
                document.getElementById('article-byline').appendChild(link);
            }

            const contentDiv = document.getElementById('article-content');
            contentDiv.innerHTML = article.content || '';

            processDOM(contentDiv);
            generateTOC(contentDiv);
            
            // 可选：阅读后清空存储释放空间
            // chrome.storage.local.remove('zenReaderArticle');
        } else {
            document.getElementById('article-title').textContent = "未找到文章内容";
            document.getElementById('article-content').textContent = "请尝试在页面重新点击 ZenReader 图标提取内容。";
        }
    });
});

function processDOM(container) {
    // 处理图片容器居中
    const images = container.querySelectorAll('img');
    images.forEach(img => {
        if (img.parentElement && img.parentElement.tagName.toLowerCase() !== 'figure' && !img.parentElement.classList.contains('img-wrapper')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'img-wrapper';
            img.parentNode.insertBefore(wrapper, img);
            wrapper.appendChild(img);
        }
    });

    // 处理表格产生水平滚动条以适配移动端
    const tables = container.querySelectorAll('table');
    tables.forEach(table => {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-wrapper';
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
    });
}

function generateTOC(container) {
    const headings = container.querySelectorAll('h2, h3');
    const tocNav = document.getElementById('toc');
    const tocList = document.createElement('ul');
    
    if (headings.length === 0) {
        tocNav.innerHTML = '<span style="font-size:14px;color:#888;">无目录项</span>';
        return;
    }

    let currentL2List = tocList;

    headings.forEach((heading, index) => {
        const anchorId = `zen-heading-${index}`;
        heading.id = anchorId;

        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#${anchorId}`;
        a.textContent = heading.textContent;
        li.appendChild(a);

        if (heading.tagName.toLowerCase() === 'h2') {
            tocList.appendChild(li);
            currentL2List = document.createElement('ul');
            li.appendChild(currentL2List);
        } else if (heading.tagName.toLowerCase() === 'h3') {
            currentL2List.appendChild(li);
        }
    });

    tocNav.appendChild(tocList);
}

// ==========================================
// 生产力模块逻辑 (Markdown / AI)
// ==========================================

function getTurndownService() {
    const turndownService = new window.TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced'
    });
    // Add GFM table support
    if (typeof window.turndownPluginGfm !== 'undefined') {
        const gfm = window.turndownPluginGfm.gfm;
        turndownService.use(gfm);
    }
    return turndownService;
}

document.getElementById('btn-extract-tables').addEventListener('click', () => {
    const contentDiv = document.getElementById('article-content');
    const tables = contentDiv.querySelectorAll('table');
    if (tables.length === 0) {
        alert("文章中没有找到表格！");
        return;
    }
    
    const turndownService = getTurndownService();
    let mdOutput = '';
    tables.forEach((table, index) => {
        mdOutput += `### 提取的表格 ${index + 1}\n\n`;
        mdOutput += turndownService.turndown(table.outerHTML);
        mdOutput += '\n\n';
    });
    
    document.getElementById('ai-output').value = mdOutput;
});

document.getElementById('btn-summary').addEventListener('click', () => {
    chrome.storage.sync.get(['zenAIKey', 'zenAIBase', 'zenAIModel'], async (res) => {
        if (!res.zenAIKey) {
            alert('需配置API: 请先在扩展菜单点击 "设置自定义规则" -> "AI 总结助手配置" 中输入您的 OpenAI API Key');
            return;
        }

        const btn = document.getElementById('btn-summary');
        btn.textContent = '请求生成中...';
        btn.disabled = true;

        try {
            const turndownService = getTurndownService();
            const fullMarkdown = turndownService.turndown(window.articleContext.content || '');
            // Limit text size approx 10k tokens (~20k chars)
            const contentTruncated = fullMarkdown.substring(0, 20000);

            const prompt = `你是一个金融分析师。请为以下文章生成 3 个核心要点总结，并提取文中提到的关键财务数据。请使用 Markdown 格式输出。\n\n文章内容：\n${contentTruncated}`;

            let url = res.zenAIBase || 'https://api.openai.com/v1/chat/completions';
            const model = res.zenAIModel || 'gpt-4o-mini';

            // 自动补全常见的 API 路径错误
            if (url.endsWith('/v1')) {
                url += '/chat/completions';
            } else if (url.endsWith('/v1/')) {
                url += 'chat/completions';
            }

            // 打印调试信息到控制台 (F12)
            const maskedKey = res.zenAIKey.substring(0, 6) + '...' + res.zenAIKey.substring(res.zenAIKey.length - 4);
            console.log(`[ZenReader] 请求地址: ${url}`);
            console.log(`[ZenReader] 使用模型: ${model}`);
            console.log(`[ZenReader] API Key: ${maskedKey}`);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${res.zenAIKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'user', content: prompt }
                    ]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API 请求失败 (状态码: ${response.status}): ${errorText.substring(0, 100)}`);
            }

            const responseText = await response.text();
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                throw new Error(`解析 JSON 失败: ${responseText.substring(0, 100)}`);
            }

            if (data.choices && data.choices[0]) {
                document.getElementById('ai-output').value = data.choices[0].message.content;
            } else if (data.error) {
                document.getElementById('ai-output').value = 'AI 接口报错: ' + data.error.message;
            } else {
                document.getElementById('ai-output').value = '未知相应格式: ' + JSON.stringify(data);
            }
        } catch (err) {
            console.error(err);
            document.getElementById('ai-output').value = '请求出错: ' + err.message;
        } finally {
            btn.textContent = 'AI 一键总结';
            btn.disabled = false;
        }
    });
});

document.getElementById('btn-export-md').addEventListener('click', () => {
    if (!window.articleContext) return;
    
    // 弹窗确认文件名
    let safeTitle = window.articleContext.title.replace(/[\\/:"*?<>|]+/g, '_').substring(0, 50);
    let defaultFileName = `${new Date().toISOString().slice(0,10)}_${safeTitle}.md`;
    let fileName = prompt("请输入要保存的文件名：", defaultFileName);
    if (!fileName) return; // 用户取消下载
    if (!fileName.endsWith('.md')) fileName += '.md';

    const turndownService = getTurndownService();
    const articleMarkdown = turndownService.turndown(window.articleContext.content || '');
    
    const aiNotes = document.getElementById('ai-output').value.trim();
    
    // Markdown 模板生成
    const mdContent = `---
Title: ${window.articleContext.title}
Source: ${window.articleContext.sourceUrl}
Date: ${new Date().toISOString().slice(0,10)}
Category: Reading Notes
---

# 核心总结/辅助笔记
${aiNotes || '无附加笔记'}

# 原文内容
${articleMarkdown}

---
*Generated by ZenReader Extension*
`;

    // 触发系统级的下载存至默认下载路径 (Manifest 中需赋予 downloads 权限)
    const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    chrome.downloads.download({
        url: url,
        filename: "ZenReader/" + fileName,
        saveAs: false
    });
});

document.getElementById('btn-delete-bookmark').addEventListener('click', () => {
    if (!window.articleContext || !window.articleContext.sourceUrl) {
        alert('无法获取当前文档 URL');
        return;
    }

    if (!confirm('确定要删除该文档的书签吗？')) return;

    chrome.storage.sync.get(['zenWorkerUrl'], async (res) => {
        if (!res.zenWorkerUrl) {
            alert('未配置书签服务 URL，请在设置中配置。');
            return;
        }

        const btn = document.getElementById('btn-delete-bookmark');
        const originalText = btn.textContent;
        btn.textContent = '删除中...';
        btn.disabled = true;

        try {
            let baseUrl = res.zenWorkerUrl;
            if (baseUrl.endsWith('/')) {
                baseUrl = baseUrl.slice(0, -1);
            }
            
            const sourceUrl = window.articleContext.sourceUrl;
            const sourceTitle = window.articleContext.title;
            console.log("[ZenReader] 正在请求删除 URL:", sourceUrl, "Title:", sourceTitle);

            const deleteUrl = `${baseUrl}/deleteBookmark?url=${encodeURIComponent(sourceUrl)}&title=${encodeURIComponent(sourceTitle || "")}`;
            const response = await fetch(deleteUrl, { method: 'DELETE' });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`请求失败 (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            if (data.success) {
                if (data.affected > 0) {
                    alert(`书签删除成功！(共删除 ${data.affected} 条记录)`);
                } else {
                    alert(`未找到匹配书签。\n\n当前页面 URL:\n${sourceUrl}\n\n请检查管理后台中的 URL 是否与此完全一致（包括参数）。`);
                }
            } else {
                alert('书签删除失败: ' + (data.error || '未知错误'));
            }
        } catch (err) {
            console.error(err);
            alert('删除出错: ' + err.message);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
});

document.getElementById('btn-create-card').addEventListener('click', () => {
    // 检查是否有摘要内容
    const summary = document.getElementById('ai-output').value.trim();
    if (!summary) {
        alert('请先使用 AI 生成摘要或在输出框中输入内容后再创建卡片。');
        return;
    }

    // 预填标题
    if (window.articleContext) {
        document.getElementById('card-title').value = window.articleContext.title;
    }
    
    // 显示弹窗
    document.getElementById('card-modal').style.display = 'flex';
});

// 关闭弹窗逻辑
document.getElementById('close-modal').addEventListener('click', () => {
    document.getElementById('card-modal').style.display = 'none';
});

// 保存卡片逻辑
document.getElementById('btn-save-card').addEventListener('click', () => {
    const title = document.getElementById('card-title').value.trim();
    const tags = document.getElementById('card-tags').value.trim();
    const summary = document.getElementById('ai-output').value.trim();
    const sourceUrl = window.articleContext ? window.articleContext.sourceUrl : null;

    if (!title) {
        alert('请输入卡片标题！');
        return;
    }

    chrome.storage.sync.get(['zenWorkerUrl'], async (res) => {
        if (!res.zenWorkerUrl) {
            alert('请先在设置中配置 Worker URL。');
            return;
        }

        const btn = document.getElementById('btn-save-card');
        btn.textContent = '保存中...';
        btn.disabled = true;

        try {
            let baseUrl = res.zenWorkerUrl;
            if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

            const response = await fetch(`${baseUrl}/createCard`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    tags,
                    summary,
                    source_url: sourceUrl
                })
            });

            if (!response.ok) throw new Error('网络响应不正常');
            
            const result = await response.json();
            if (result.success) {
                alert('知识卡片创建成功！');
                document.getElementById('card-modal').style.display = 'none';
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            alert('创建失败: ' + err.message);
        } finally {
            btn.textContent = '确认保存到知识库';
            btn.disabled = false;
        }
    });
});
