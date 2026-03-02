class ReaderApp {
    constructor() {
        this.currentTheme = 'light';
        this.notes = [];
        this.highlights = [];
        this.isContentLoaded = false;
        this.currentFontSize = 18;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupHeaderEvents();
        this.setupTippy();
        this.loadContent();
        this.loadSavedData();
    }

    setupHeaderEvents() {
        const backBtn = document.getElementById('backBtn');
        const toggleSidebarBtn = document.getElementById('toggleSidebar');
        const sidebar = document.getElementById('readerSidebar');

        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.history.back();
            });
        }

        if (toggleSidebarBtn && sidebar) {
            toggleSidebarBtn.addEventListener('click', () => {
                sidebar.classList.toggle('noShow');
            });
        }
    }

    setupEventListeners() {
        // 字体大小设置
        const fontSizeSlider = document.getElementById('fontSize');
        const fontSizeValue = document.getElementById('fontSizeValue');
        
        if (fontSizeSlider && fontSizeValue) {
            fontSizeSlider.addEventListener('input', (e) => {
                const size = parseInt(e.target.value);
                this.currentFontSize = size;
                fontSizeValue.textContent = `${size}px`;
                const contentElement = document.getElementById('articleContent');
                if (contentElement) {
                    contentElement.style.fontSize = `${size}px`;
                }
                this.saveSetting('fontSize', size);
            });
        }

        // 字体族设置
        const fontFamilySelect = document.getElementById('fontFamily');
        if (fontFamilySelect) {
            fontFamilySelect.addEventListener('change', (e) => {
                const contentElement = document.getElementById('articleContent');
                if (contentElement) {
                    contentElement.style.fontFamily = e.target.value;
                }
                this.saveSetting('fontFamily', e.target.value);
            });
        }

        // 行高设置
        const lineHeightSlider = document.getElementById('lineHeight');
        const lineHeightValue = document.getElementById('lineHeightValue');
        
        if (lineHeightSlider && lineHeightValue) {
            lineHeightSlider.addEventListener('input', (e) => {
                const height = e.target.value;
                lineHeightValue.textContent = height;
                const contentElement = document.getElementById('articleContent');
                if (contentElement) {
                    contentElement.style.lineHeight = height;
                }
                this.saveSetting('lineHeight', height);
            });
        }

        // 内容宽度设置
        const contentWidthSlider = document.getElementById('contentWidth');
        const contentWidthValue = document.getElementById('contentWidthValue');
        
        if (contentWidthSlider && contentWidthValue) {
            contentWidthSlider.addEventListener('input', (e) => {
                const width = e.target.value;
                contentWidthValue.textContent = `${width}px`;
                const contentElement = document.querySelector('.article-main');
                if (contentElement) {
                    contentElement.style.maxWidth = `${width}px`;
                }
                this.saveSetting('contentWidth', width);
            });
        }

        // 主题切换
        const themeButtons = document.querySelectorAll('.theme-option');
        if (themeButtons.length > 0) {
            themeButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const theme = e.currentTarget.dataset.theme;
                    this.switchTheme(theme);
                    
                    // 更新按钮状态
                    themeButtons.forEach(b => b.classList.remove('active'));
                    e.currentTarget.classList.add('active');
                });
            });
        }

        // 工具按钮
        const highlightBtn = document.getElementById('highlight');
        if (highlightBtn) {
            highlightBtn.addEventListener('click', () => {
                this.toggleHighlight();
            });
        }

        const addNoteBtn = document.getElementById('addNote');
        if (addNoteBtn) {
            addNoteBtn.addEventListener('click', () => {
                this.addNote();
            });
        }

        const fontIncreaseBtn = document.getElementById('fontIncrease');
        if (fontIncreaseBtn) {
            fontIncreaseBtn.addEventListener('click', () => {
                this.adjustFontSize(1);
            });
        }

        const fontDecreaseBtn = document.getElementById('fontDecrease');
        if (fontDecreaseBtn) {
            fontDecreaseBtn.addEventListener('click', () => {
                this.adjustFontSize(-1);
            });
        }

        // 文本选择事件
        document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));

        // 键盘快捷键
        document.addEventListener('keydown', this.handleKeyboardShortcuts.bind(this));

        // 保存按钮
        const saveArticleBtn = document.getElementById('saveArticle');
        if (saveArticleBtn) {
            saveArticleBtn.addEventListener('click', () => {
                this.saveArticle();
            });
        }

        // 分享按钮
        const ePubArticleBtn = document.getElementById('saveePub');
        if (ePubArticleBtn) {
            ePubArticleBtn.addEventListener('click', async () => {
                //this.shareArticle();
                await this.exportToEPUB() ;
            });
        }

        // 分享按钮
        const shareArticleBtn = document.getElementById('shareArticle');
        if (shareArticleBtn) {
            shareArticleBtn.addEventListener('click', () => {
                this.shareArticle();
            });
        }
    }

    setupTippy() {
        if (typeof tippy !== 'undefined') {
            // 工具按钮提示
            const toolBtns = document.querySelectorAll('.tool-btn');
            if (toolBtns.length > 0) {
                tippy('.tool-btn', {
                    theme: 'smart-reader',
                    placement: 'left',
                    arrow: true,
                    delay: [100, 50]
                });
            }

            // 头部按钮提示
            const headerBtns = document.querySelectorAll('.header-btn');
            if (headerBtns.length > 0) {
                tippy('.header-btn', {
                    theme: 'smart-reader',
                    placement: 'bottom',
                    arrow: true
                });
            }

            // 设置项提示
            const fontSizeSlider = document.getElementById('fontSize');
            if (fontSizeSlider) {
                tippy('#fontSize', {
                    theme: 'smart-reader',
                    placement: 'top',
                    arrow: true,
                    content: '调整字体大小'
                });
            }

            const lineHeightSlider = document.getElementById('lineHeight');
            if (lineHeightSlider) {
                tippy('#lineHeight', {
                    theme: 'smart-reader',
                    placement: 'top',
                    arrow: true,
                    content: '调整行高'
                });
            }
        }
    }

    // 调整字体大小
    adjustFontSize(delta) {
        const newSize = Math.max(12, Math.min(30, this.currentFontSize + delta));
        this.currentFontSize = newSize;
        
        const contentElement = document.getElementById('articleContent');
        if (contentElement) {
            contentElement.style.fontSize = `${newSize}px`;
        }
        
        // 更新滑块值
        const fontSizeSlider = document.getElementById('fontSize');
        const fontSizeValue = document.getElementById('fontSizeValue');
        if (fontSizeSlider && fontSizeValue) {
            fontSizeSlider.value = newSize;
            fontSizeValue.textContent = `${newSize}px`;
        }
        
        this.saveSetting('fontSize', newSize);
        this.showNotification(`字体大小: ${newSize}px`);
    }

    loadContent() {
        // 先检查URL参数中的内容
        this.checkURLForContent();
        
        // 然后监听来自background script的消息
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'loadContent') {
                this.displayArticle(request.content, request.url);
                sendResponse({ success: true });
            }
            return true;
        });
    }

    checkURLForContent() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const contentParam = urlParams.get('content');
            
            if (contentParam) {
                // 先尝试直接解码，如果失败则使用备用方法
                let content;
                try {
                    content = JSON.parse(decodeURIComponent(contentParam));
                } catch (decodeError) {
                    console.warn('直接解码失败，尝试备用解码方法:', decodeError);
                    // 备用解码方法
                    content = JSON.parse(contentParam);
                }
                
                if (content) {
                    this.displayArticle(content, window.location.href);
                }
            }
        } catch (error) {
            console.error('解析URL内容失败:', error);
            this.showErrorMessage('加载内容失败，请返回原页面重试');
        }
    }

    displayArticle(article, url) {
        if (!article) {
            this.showErrorMessage('无法获取文章内容');
            return;
        }

        try {
            // 设置文章标题和元数据
            const titleElement = document.getElementById('articleTitle');
            const siteElement = document.getElementById('articleSite');
            const lengthElement = document.getElementById('articleLength');
            const wordCountElement = document.getElementById('wordCount');
            const contentElement = document.getElementById('articleContent');

            if (!titleElement || !siteElement || !lengthElement || !contentElement) {
                console.error('必要的DOM元素未找到');
                this.showErrorMessage('页面加载不完整，请刷新重试');
                return;
            }

            titleElement.textContent = article.title || '无标题';
            
            const siteName = article.siteName || (url ? new URL(url).hostname : '未知来源');
            siteElement.textContent = siteName;
            
            // 计算阅读时间和字数
            const textContent = article.textContent || 
                               (article.content ? this.stripHTML(article.content) : '');
            const wordCount = textContent.split(/\s+/).length;
            const readingTime = Math.max(1, Math.ceil(wordCount / 200));
            
            lengthElement.textContent = `约 ${readingTime} 分钟阅读`;
            if (wordCountElement) {
                wordCountElement.textContent = `${wordCount} 字`;
            }

            // 设置文章内容
            if (article.content) {
                contentElement.innerHTML = article.content;
            } else if (article.textContent) {
                contentElement.innerHTML = '';
                const paragraphs = article.textContent.split('\n\n');
                paragraphs.forEach(paragraph => {
                    if (paragraph.trim()) {
                        const p = document.createElement('p');
                        p.textContent = paragraph.trim();
                        contentElement.appendChild(p);
                    }
                });
            } else {
                contentElement.innerHTML = '<p>内容加载失败</p>';
            }

            this.isContentLoaded = true;

            // 应用保存的设置
            this.applySavedSettings();

            // 生成目录
            this.generateTOC();

            // 恢复之前的高亮
            this.restoreHighlights();

            console.log('文章加载完成');

        } catch (error) {
            console.error('显示文章内容失败:', error);
            this.showErrorMessage('处理内容时发生错误');
        }
    }

    // 生成目录
    generateTOC() {
        const headings = document.querySelectorAll('#articleContent h1, #articleContent h2, #articleContent h3');
        const tocContainer = document.getElementById('tocContainer');
        
        if (!tocContainer || headings.length === 0) {
            if (tocContainer) {
                tocContainer.innerHTML = '<div class="empty-toc">暂无目录</div>';
            }
            return;
        }

        let tocHTML = '';
        headings.forEach((heading, index) => {
            const level = parseInt(heading.tagName.substring(1));
            const indent = (level - 1) * 16;
            const id = `heading-${index}`;
            
            heading.id = id;
            
            tocHTML += `
                <div class="toc-item" style="padding-left: ${indent}px" data-target="${id}">
                    ${heading.textContent}
                </div>
            `;
        });

        tocContainer.innerHTML = tocHTML;

        // 添加目录点击事件
        tocContainer.querySelectorAll('.toc-item').forEach(item => {
            item.addEventListener('click', () => {
                const targetId = item.getAttribute('data-target');
                const targetElement = document.getElementById(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth' });
                    
                    // 高亮当前目录项
                    tocContainer.querySelectorAll('.toc-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                }
            });
        });

        // 监听滚动，自动高亮当前章节
        this.setupTOCScrollListener(headings, tocContainer);
    }

    setupTOCScrollListener(headings, tocContainer) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.id;
                    const tocItem = tocContainer.querySelector(`[data-target="${id}"]`);
                    if (tocItem) {
                        tocContainer.querySelectorAll('.toc-item').forEach(i => i.classList.remove('active'));
                        tocItem.classList.add('active');
                    }
                }
            });
        }, {
            rootMargin: '-20% 0px -60% 0px',
            threshold: 0
        });

        headings.forEach(heading => {
            observer.observe(heading);
        });
    }

    stripHTML(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    switchTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        this.currentTheme = theme;
        this.saveSetting('theme', theme);
        this.showNotification(`已切换到${this.getThemeName(theme)}主题`);
    }

    getThemeName(theme) {
        const themeNames = {
            'light': '浅色',
            'dark': '深色',
            'sepia': '护眼'
        };
        return themeNames[theme] || theme;
    }

    /**
     * 导出为ePub文件
     */
    async exportToEPUB() {
        if (!this.isContentLoaded) {
            this.showNotification('请等待内容加载完成');
            return;
        }

        const titleElement = document.getElementById('articleTitle');
        const contentElement = document.getElementById('articleContent');
        
        if (!titleElement || !contentElement) {
            this.showNotification('无法保存文章');
            return;
        }

        const articleTitle = titleElement.textContent;
        const articleContent = contentElement.innerHTML;
        /*
        const articleDataRaw = {
            title: articleTitle,
            content: articleContent,
            url: window.location.href,
        };
        */

         // 在函数开头定义这些变量
    const exportBtn = document.getElementById('exportEpub');
    const originalText = exportBtn.innerHTML;
        
        try {
            // 显示加载状态

            exportBtn.innerHTML = '生成中...';
            exportBtn.disabled = true;

            // 创建ePub生成器实例
            const epubGenerator = new EPUBGenerator();
            
            // 准备文章数据
            const articleData = {
                title: articleTitle || '未知标题',
                content: articleContent || '',
                url:"https://alexzhangmaker.github.io/",
                site: new URL("https://alexzhangmaker.github.io/").hostname
            };

            // 生成ePub文件
            const epubBlob = await epubGenerator.generateEPUB(articleData);
            
            // 询问用户是否发送到miReader
            const sendToDevice = confirm('ePub文件生成成功！是否发送到miReader电子书设备？\n\n点击"确定"发送到设备，点击"取消"下载到本地。');
            
            if (sendToDevice) {
                await this.sendToMiReaderDevice(epubBlob);
            } else {
                // 下载到本地
                this.downloadEPUB(epubBlob, articleData.title);
            }

        } catch (error) {
            console.error('导出ePub失败:', error);
            alert('导出ePub失败: ' + error.message);
        } finally {
            // 恢复按钮状态
            const exportBtn = document.getElementById('exportEpub');
            exportBtn.innerHTML = originalText;
            exportBtn.disabled = false;
        }
    }

    /**
     * 发送ePub到miReader设备
     */
    async sendToMiReaderDevice(epubBlob) {
        try {
            // 获取设备URL（可以从设置中读取或让用户输入）
            const deviceUrl = await this.getMiReaderDeviceUrl();
            
            if (!deviceUrl) {
                alert('未配置miReader设备地址');
                return;
            }

            const epubGenerator = new EPUBGenerator();
            const result = await epubGenerator.sendToMiReader(epubBlob, deviceUrl);
            
            alert(`已成功发送到miReader设备！\n\n文件: ${result.filename || '未知'}`);
            
        } catch (error) {
            console.error('发送到miReader失败:', error);
            alert('发送到miReader设备失败: ' + error.message);
        }
    }

    /**
     * 获取miReader设备URL
     */
    async getMiReaderDeviceUrl() {
        // 首先尝试从存储中获取保存的设备地址
        const settings = await chrome.storage.local.get(['miReaderDeviceUrl']);
        
        if (settings.miReaderDeviceUrl) {
            return settings.miReaderDeviceUrl;
        }

        // 如果没有保存的地址，提示用户输入
        const defaultUrl = 'http://192.168.1.100:8080/upload';
        const userUrl = prompt('请输入miReader设备的HTTP接口地址:', defaultUrl);
        
        if (userUrl) {
            // 保存用户输入的地址
            await this.saveSetting('miReaderDeviceUrl', userUrl);
            return userUrl;
        }
        
        return null;
    }

    /**
     * 下载ePub文件
     */
    downloadEPUB(epubBlob, title) {
        const url = URL.createObjectURL(epubBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.sanitizeFileName(title)}.epub`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert('ePub文件已下载完成！');
    }

    /**
     * 清理文件名中的非法字符
     */
    sanitizeFileName(name) {
        return name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
    }

    addNote() {
        const noteText = prompt('请输入笔记内容:');
        if (noteText && noteText.trim()) {
            const note = {
                id: Date.now(),
                text: noteText.trim(),
                timestamp: new Date().toLocaleString(),
                position: this.getScrollPosition()
            };
            
            this.notes.push(note);
            this.saveNotes();
            this.showNotification('笔记已添加');
        }
    }

    toggleHighlight() {
        const isHighlightMode = document.body.classList.toggle('highlight-mode');
        
        if (isHighlightMode) {
            this.enableTextHighlight();
            this.showNotification('高亮模式已开启，选择文本即可高亮');
        } else {
            this.disableTextHighlight();
            this.showNotification('高亮模式已关闭');
        }
        
        this.saveSetting('highlightMode', isHighlightMode);
    }

    enableTextHighlight() {
        const contentElement = document.getElementById('articleContent');
        if (contentElement) {
            contentElement.addEventListener('mouseup', this.handleTextSelection.bind(this));
        }
    }

    disableTextHighlight() {
        const contentElement = document.getElementById('articleContent');
        if (contentElement) {
            contentElement.removeEventListener('mouseup', this.handleTextSelection.bind(this));
        }
    }

    handleTextSelection(e) {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        if (selectedText.length > 0) {
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.className = 'text-highlight';
            span.style.backgroundColor = '#fef3c7';
            span.style.padding = '2px 0';
            span.setAttribute('data-highlight-id', Date.now());
            
            try {
                range.surroundContents(span);
                
                // 保存高亮信息
                const highlight = {
                    id: Date.now(),
                    text: selectedText,
                    timestamp: new Date().toLocaleString(),
                    elementId: span.getAttribute('data-highlight-id')
                };
                
                this.highlights.push(highlight);
                this.saveHighlights();
                
                this.showNotification('文本已高亮');
            } catch (error) {
                console.error('高亮文本失败:', error);
                this.showNotification('高亮失败，请选择连续的文本');
            }
            
            selection.removeAllRanges();
        }
    }

    handleSelectionChange() {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        // 可以在这里添加选中文本时的其他功能
        if (selectedText.length > 50) {
            // 自动显示一些操作按钮等
        }
    }

    handleKeyboardShortcuts(e) {
        // Ctrl + S: 保存文章
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            this.saveArticle();
        }
        
        // Ctrl + H: 切换高亮模式
        if (e.ctrlKey && e.key === 'h') {
            e.preventDefault();
            this.toggleHighlight();
        }
        
        // Ctrl + D: 切换主题
        if (e.ctrlKey && e.key === 'd') {
            e.preventDefault();
            this.toggleDarkMode();
        }

        // Ctrl + +: 增大字体
        if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
            e.preventDefault();
            this.adjustFontSize(1);
        }

        // Ctrl + -: 减小字体
        if (e.ctrlKey && e.key === '-') {
            e.preventDefault();
            this.adjustFontSize(-1);
        }
    }

    toggleDarkMode() {
        const currentTheme = document.body.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.switchTheme(newTheme);
        
        // 更新主题按钮状态
        const themeButtons = document.querySelectorAll('.theme-option');
        if (themeButtons.length > 0) {
            themeButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.theme === newTheme);
            });
        }
    }

    saveArticle() {
        if (!this.isContentLoaded) {
            this.showNotification('请等待内容加载完成');
            return;
        }

        const titleElement = document.getElementById('articleTitle');
        const contentElement = document.getElementById('articleContent');
        
        if (!titleElement || !contentElement) {
            this.showNotification('无法保存文章');
            return;
        }

        const articleTitle = titleElement.textContent;
        const articleContent = contentElement.innerHTML;
        
        const articleData = {
            title: articleTitle,
            content: articleContent,
            url: window.location.href,
            savedAt: new Date().toISOString(),
            notes: this.notes,
            highlights: this.highlights
        };
        
        chrome.storage.local.set({ 
            ['savedArticle_' + Date.now()]: articleData 
        }, () => {
            this.showNotification('文章已保存到本地存储');
        });
    }

    shareArticle() {
        const titleElement = document.getElementById('articleTitle');
        if (!titleElement) {
            this.showNotification('无法分享文章');
            return;
        }

        const articleTitle = titleElement.textContent;
        const articleUrl = window.location.href;
        
        if (navigator.share) {
            navigator.share({
                title: articleTitle,
                url: articleUrl
            }).catch(error => {
                console.log('分享取消或失败:', error);
            });
        } else {
            // 降级方案：复制到剪贴板
            navigator.clipboard.writeText(`${articleTitle} - ${articleUrl}`).then(() => {
                this.showNotification('链接已复制到剪贴板');
            }).catch(() => {
                prompt('请手动复制链接:', articleUrl);
            });
        }
    }

    showNotification(message, duration = 2000) {
        // 移除现有的通知
        const existingNotification = document.querySelector('.reader-notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        const notification = document.createElement('div');
        notification.className = 'reader-notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 10000;
            font-size: 14px;
            backdrop-filter: blur(10px);
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }
        }, duration);
    }

    showErrorMessage(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(220,53,69,0.9);
            color: white;
            padding: 20px 30px;
            border-radius: 8px;
            z-index: 10000;
            text-align: center;
            max-width: 300px;
            backdrop-filter: blur(10px);
        `;
        errorDiv.innerHTML = `
            <p style="margin-bottom: 15px;">${message}</p>
            <button onclick="this.parentNode.remove()" style="margin-top: 10px; padding: 8px 16px; background: white; border: none; border-radius: 4px; cursor: pointer; color: #333;">确定</button>
        `;
        document.body.appendChild(errorDiv);
    }

    getScrollPosition() {
        return {
            top: window.pageYOffset || document.documentElement.scrollTop,
            height: document.documentElement.scrollHeight
        };
    }

    saveSetting(key, value) {
        chrome.storage.local.set({ [key]: value });
    }

    saveNotes() {
        chrome.storage.local.set({ readerNotes: this.notes });
    }

    saveHighlights() {
        chrome.storage.local.set({ readerHighlights: this.highlights });
    }

    async loadSavedData() {
        try {
            const result = await chrome.storage.local.get([
                'fontSize', 'fontFamily', 'lineHeight', 'contentWidth', 'theme',
                'highlightMode', 'readerNotes', 'readerHighlights'
            ]);
            
            this.applySavedSettings(result);
            this.loadNotes(result.readerNotes);
            this.loadHighlights(result.readerHighlights);
            
        } catch (error) {
            console.error('加载保存的数据失败:', error);
        }
    }

    applySavedSettings(settings = null) {
        const applySettings = (result) => {
            // 字体设置
            if (result.fontSize) {
                this.currentFontSize = result.fontSize;
                const fontSizeSlider = document.getElementById('fontSize');
                const fontSizeValue = document.getElementById('fontSizeValue');
                const contentElement = document.getElementById('articleContent');
                
                if (fontSizeSlider && fontSizeValue && contentElement) {
                    fontSizeSlider.value = result.fontSize;
                    fontSizeValue.textContent = `${result.fontSize}px`;
                    contentElement.style.fontSize = `${result.fontSize}px`;
                }
            }

            if (result.fontFamily) {
                const fontFamilySelect = document.getElementById('fontFamily');
                const contentElement = document.getElementById('articleContent');
                
                if (fontFamilySelect && contentElement) {
                    fontFamilySelect.value = result.fontFamily;
                    contentElement.style.fontFamily = result.fontFamily;
                }
            }

            if (result.lineHeight) {
                const lineHeightSlider = document.getElementById('lineHeight');
                const lineHeightValue = document.getElementById('lineHeightValue');
                const contentElement = document.getElementById('articleContent');
                
                if (lineHeightSlider && lineHeightValue && contentElement) {
                    lineHeightSlider.value = result.lineHeight;
                    lineHeightValue.textContent = result.lineHeight;
                    contentElement.style.lineHeight = result.lineHeight;
                }
            }

            if (result.contentWidth) {
                const contentWidthSlider = document.getElementById('contentWidth');
                const contentWidthValue = document.getElementById('contentWidthValue');
                const contentElement = document.querySelector('.article-main');
                
                if (contentWidthSlider && contentWidthValue && contentElement) {
                    contentWidthSlider.value = result.contentWidth;
                    contentWidthValue.textContent = `${result.contentWidth}px`;
                    contentElement.style.maxWidth = `${result.contentWidth}px`;
                }
            }

            if (result.theme) {
                this.switchTheme(result.theme);
                const themeButtons = document.querySelectorAll('.theme-option');
                if (themeButtons.length > 0) {
                    themeButtons.forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.theme === result.theme);
                    });
                }
            }

            if (result.highlightMode) {
                document.body.classList.add('highlight-mode');
                this.enableTextHighlight();
            }
        };

        if (settings) {
            applySettings(settings);
        } else {
            chrome.storage.local.get([
                'fontSize', 'fontFamily', 'lineHeight', 'contentWidth', 'theme', 'highlightMode'
            ]).then(applySettings);
        }
    }

    loadNotes(notes) {
        if (notes && Array.isArray(notes)) {
            this.notes = notes;
        }
    }

    loadHighlights(highlights) {
        if (highlights && Array.isArray(highlights)) {
            this.highlights = highlights;
        }
    }

    restoreHighlights() {
        // 在实际实现中，这里会根据保存的高亮数据重新创建高亮
        console.log('恢复高亮:', this.highlights.length);
    }
}

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .text-highlight {
        background-color: #fef3c7 !important;
        transition: background-color 0.3s ease;
        padding: 2px 0;
    }
    
    .text-highlight:hover {
        background-color: #fde68a !important;
    }
    
    .highlight-mode {
        cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23f59e0b' d='M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7H15V9H21ZM18 12L15 9V12H18ZM12 15C13.1 15 14 15.9 14 17C14 18.1 13.1 19 12 19C10.9 19 10 18.1 10 17C10 15.9 10.9 15 12 15Z'/%3E%3C/svg%3E") 12 12, auto;
    }
    
    .empty-toc {
        text-align: center;
        color: #6b7280;
        padding: 20px;
        font-size: 14px;
    }
`;
document.head.appendChild(style);

// 初始化阅读器应用
document.addEventListener('DOMContentLoaded', () => {
    new ReaderApp();
    console.log('智能阅读器已初始化');
});