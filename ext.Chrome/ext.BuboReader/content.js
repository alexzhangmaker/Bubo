// content.js for BuboReader

console.log("BuboReader Content Script Loaded");

class BuboReaderCore {
    constructor() {
        this.currentSelector = null;
        this.isReaderActive = false;
        this.extractedTitle = "";
        this.currentScheme = 'light';
        this.schemes = {
            light: { bg: '#ffffff', fg: '#333333', title: '#000000' },
            dark: { bg: '#1a1a1a', fg: '#d1d1d1', title: '#ffffff' },
            sepia: { bg: '#f4ecd8', fg: '#5b4636', title: '#433422' }
        };
        this.init();
    }

    async init() {
        await this.loadSiteConfig();
        await this.loadSchemes();
        this.setupMessageListener();
        this.setupStorageListener();
        this.checkAutoEnable();
    }

    async loadSiteConfig() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'getSiteSelector',
                hostname: window.location.hostname
            });
            this.currentSelector = response.selector;
            console.log('BuboReader: Loaded selector:', this.currentSelector);
        } catch (e) { console.error('BuboReader: Failed to load selector', e); }
    }

    async checkAutoEnable() {
        const response = await chrome.runtime.sendMessage({ action: "getPatterns" });
        if (response && response.patterns) {
            const currentUrl = window.location.href;
            const isMatch = response.patterns.some(pattern => {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                return regex.test(currentUrl);
            });
            if (isMatch) this.injectFloatingToolbar();
        }
    }

    injectFloatingToolbar() {
        if (document.getElementById('buboreader-toolbar')) return;
        const container = document.createElement('div');
        container.id = 'buboreader-toolbar';
        container.style.cssText = "position:fixed; bottom:20px; right:20px; z-index:2147483647; background:#fff; border-radius:50%; box-shadow:0 2px 10px rgba(0,0,0,0.2); width:48px; height:48px; display:flex; align-items:center; justify-content:center; cursor:pointer;";
        container.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1a73e8" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
        `;
        container.onclick = () => this.toggleReaderMode();
        document.body.appendChild(container);
    }

    async loadSchemes() {
        const result = await chrome.storage.sync.get(['reader_schemes', 'reader_current_scheme']);
        if (result.reader_schemes) {
            this.schemes = { ...this.schemes, ...result.reader_schemes };
        }
        if (result.reader_current_scheme) {
            this.currentScheme = result.reader_current_scheme;
        }
    }

    setupStorageListener() {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync') {
                if (changes.reader_schemes) {
                    this.schemes = { ...this.schemes, ...changes.reader_schemes.newValue };
                    if (this.isReaderActive) this.applyScheme(this.currentScheme);
                }
                if (changes.reader_current_scheme) {
                    this.currentScheme = changes.reader_current_scheme.newValue;
                    if (this.isReaderActive) this.applyScheme(this.currentScheme);
                }
            }
        });
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "toggleReader") {
                this.toggleReaderMode();
            } else if (request.action === "detectSelector") {
                sendResponse({ selector: this.detectContentSelector() });
            } else if (request.action === "extractMetadata") {
                this.extractContent().then(res => sendResponse(res));
                return true; // async
            }
            return true;
        });
    }

    detectContentSelector() {
        const selectors = ['article', '.article-content', '.post-content', '.content', '#content'];
        for (const s of selectors) {
            const el = document.querySelector(s);
            if (el && el.textContent.length > 200) return s;
        }
        return null;
    }

    async extractContent() {
        // Preference 0: Standard Page Metadata
        const meta = {
            title: document.title,
            description: document.querySelector('meta[name="description"]')?.content ||
                document.querySelector('meta[property="og:description"]')?.content || "",
            image: document.querySelector('meta[property="og:image"]')?.content ||
                document.querySelector('meta[name="twitter:image"]')?.content || "",
            url: window.location.href
        };

        // Preference 1: Custom Selector (Crane style)
        if (this.currentSelector) {
            const el = document.querySelector(this.currentSelector);
            if (el) {
                const cleaned = this.cleanHTML(el.cloneNode(true));
                return { ...meta, content: cleaned.innerHTML, textContent: cleaned.textContent };
            }
        }

        // Preference 2: Readability.js (Crane fallback)
        if (typeof Readability !== 'undefined') {
            try {
                const clone = document.cloneNode(true);
                // Pre-clean readability clone if needed, but usually Readability handles unknown tags by stripping them or keeping them.
                // However, h-char might be preserved as it's not "unknown" in some contexts.
                const cleanedClone = this.cleanHTML(clone);
                const reader = new Readability(cleanedClone);
                const article = reader.parse();
                if (article) return article;
            } catch (e) { console.error('Readability failed', e); }
        }

        // Preference 3: Basic extraction (webNote style)
        const main = document.querySelector('article') || document.querySelector('main') || document.body;
        const cleanedMain = this.cleanHTML(main.cloneNode(true));
        return { title: document.title, content: cleanedMain.innerHTML, textContent: cleanedMain.textContent };
    }

    cleanHTML(node) {
        // Remove Xueqiu/Han.css custom typography tags that break reader mode layout
        const customTags = node.querySelectorAll('h-char, h-inner, h-cs');
        customTags.forEach(el => {
            const text = el.innerText;
            el.replaceWith(document.createTextNode(text));
        });
        return node;
    }

    async toggleReaderMode() {
        if (this.isReaderActive) {
            const reader = document.getElementById('buboreader-container');
            if (reader) reader.remove();
            document.body.style.overflow = '';
        } else {
            const article = await this.extractContent();
            this.showReaderUI(article);
        }
        this.isReaderActive = !this.isReaderActive;
    }

    showReaderUI(article) {
        let container = document.getElementById('buboreader-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'buboreader-container';
            container.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; z-index:2147483640; overflow-y:auto; font-family:serif; transition: background 0.3s, color 0.3s;";
            container.innerHTML = `
                <div style="max-width:800px; margin:0 auto; padding:60px 20px;">
                    <button id="bubo-close" style="position:fixed; top:20px; left:20px; background:none; border:none; cursor:pointer; font-size:24px; z-index:10;">✕</button>
                    <div id="bubo-toolbar-reader" style="position:fixed; top:20px; right:20px; display:flex; gap:8px; z-index:10;">
                        <button class="bubo-scheme-btn" data-scheme="light" style="width:32px; height:32px; border-radius:16px; border:1px solid #ddd; background:#fff; cursor:pointer; font-size:12px;">A</button>
                        <button class="bubo-scheme-btn" data-scheme="sepia" style="width:32px; height:32px; border-radius:16px; border:1px solid #ddd; background:#f4ecd8; cursor:pointer; font-size:12px; color:#5b4636;">A</button>
                        <button class="bubo-scheme-btn" data-scheme="dark" style="width:32px; height:32px; border-radius:16px; border:1px solid #444; background:#1a1a1a; cursor:pointer; font-size:12px; color:#fff;">A</button>
                        <button id="bubo-fullscreen" title="Toggle Fullscreen" style="width:32px; height:32px; border-radius:16px; border:1px solid #ddd; background:none; cursor:pointer; display:flex; align-items:center; justify-content:center; color:inherit; padding: 0;">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                            </svg>
                        </button>
                        <button id="bubo-collect" title="Collect to Bubo" style="width:32px; height:32px; border-radius:16px; border:1px solid #ddd; background:none; cursor:pointer; display:flex; align-items:center; justify-content:center; color:inherit; padding: 0; transition: all 0.3s ease;">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v13a2 2 0 0 1-2 2z"></path>
                                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                <polyline points="7 3 7 8 15 8"></polyline>
                            </svg>
                        </button>
                        <button id="bubo-epub" style="background:#1a73e8; color:#fff; border:none; padding:0 16px; border-radius:16px; height:32px; cursor:pointer; font-size:13px; font-weight:500;">Export EPUB</button>
                    </div>
                    <h1 id="bubo-title" style="font-size:36px; margin-bottom:30px; line-height:1.2; font-weight:700;"></h1>
                    <div id="bubo-content" style="font-size:20px; line-height:1.7; transition: color 0.3s;"></div>
                </div>
            `;
            document.body.appendChild(container);
            document.getElementById('bubo-close').onclick = () => this.toggleReaderMode();
            document.getElementById('bubo-fullscreen').onclick = () => this.toggleFullscreen();
            document.getElementById('bubo-collect').onclick = () => this.collectToBubo(article);
            document.getElementById('bubo-epub').onclick = () => this.exportEPUB(article);

            container.querySelectorAll('.bubo-scheme-btn').forEach(btn => {
                btn.onclick = () => {
                    const scheme = btn.dataset.scheme;
                    this.currentScheme = scheme;
                    this.applyScheme(scheme);
                    chrome.storage.sync.set({ reader_current_scheme: scheme });
                };
            });
        }

        document.getElementById('bubo-title').textContent = article.title;
        document.getElementById('bubo-content').innerHTML = article.content;
        this.applyScheme(this.currentScheme);
        document.body.style.overflow = 'hidden';

        // Add Note functionality (webNote style)
        document.addEventListener('mouseup', () => {
            const sel = window.getSelection();
            if (sel.toString().length > 5 && this.isReaderActive) {
                this.addNote(sel.toString(), article.title);
            }
        });
    }

    applyScheme(schemeName) {
        const config = this.schemes[schemeName] || this.schemes.light;
        const container = document.getElementById('buboreader-container');
        if (!container) return;

        container.style.backgroundColor = config.bg;
        container.style.color = config.fg;

        const title = document.getElementById('bubo-title');
        if (title) title.style.color = config.title || config.fg;

        const content = document.getElementById('bubo-content');
        if (content) content.style.color = config.fg;

        container.querySelectorAll('.bubo-scheme-btn').forEach(btn => {
            btn.style.outline = (btn.dataset.scheme === schemeName) ? '2px solid #1a73e8' : 'none';
            btn.style.outlineOffset = '2px';
        });
    }

    addNote(text, title) {
        chrome.runtime.sendMessage({ action: "addNote", text, title });
    }

    async exportEPUB(article) {
        // Send to Crane's native reader page for EPUB generation as it has the libs
        chrome.runtime.sendMessage({ action: 'openReader', url: window.location.href, content: article });
    }

    toggleFullscreen() {
        const container = document.getElementById('buboreader-container');
        if (!container) return;

        if (!document.fullscreenElement) {
            container.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    }

    async collectToBubo(article) {
        const btn = document.getElementById('bubo-collect');
        if (!btn || btn.disabled) return;

        btn.disabled = true;
        btn.style.opacity = '0.5';
        const originalContent = btn.innerHTML;
        btn.innerHTML = '<span style="font-size:10px;">...</span>';

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'collectUrl',
                article: {
                    url: window.location.href,
                    title: article.title,
                    description: article.description,
                    image: article.image
                }
            });

            if (response && response.success) {
                btn.style.backgroundColor = '#10b981';
                btn.style.color = '#fff';
                btn.style.borderColor = '#10b981';
                const successMsg = response.updated ? 'Updated' : 'Collected';
                btn.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span style="font-size:8px; margin-top:1px;">${successMsg}</span>
                    </div>
                `;
                setTimeout(() => {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    btn.style.backgroundColor = '';
                    btn.style.color = 'inherit';
                    btn.style.borderColor = '#ddd';
                    btn.innerHTML = originalContent;
                }, 3000);
            } else {
                throw new Error(response ? response.error : 'Unknown error');
            }
        } catch (e) {
            console.error('Collection failed:', e);
            btn.style.backgroundColor = '#ef4444';
            btn.style.color = '#fff';
            btn.style.borderColor = '#ef4444';
            btn.innerHTML = `<span title="${e.message}">✖</span>`;
            setTimeout(() => {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.backgroundColor = '';
                btn.style.color = 'inherit';
                btn.style.borderColor = '#ddd';
                btn.innerHTML = originalContent;
            }, 3000);
        }
    }
}

const buboReader = new BuboReaderCore();
