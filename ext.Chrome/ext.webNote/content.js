// content.js

console.log("WebNote Content Script Loaded");

// Check if current URL matches any pattern to auto-enable or show badge
// Real logic will happen when user triggers it or if we implement auto-load
chrome.runtime.sendMessage({ action: "getPatterns" }, (response) => {
    if (response && response.patterns) {
        const currentUrl = window.location.href;
        const isMatch = response.patterns.some(pattern => {
            // Simple wildcard to regex conversion for demo
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            return regex.test(currentUrl);
        });

        if (isMatch) {
            console.log("URL matches webnote pattern! Injecting floating toolbar.");
            injectFloatingToolbar();
        }
    }
});

function injectFloatingToolbar() {
    if (document.getElementById('webnote-floating-toolbar-container')) return;

    const container = document.createElement('div');
    container.id = 'webnote-floating-toolbar-container';
    container.innerHTML = `
        <button class="webnote-toolbar-btn" id="webnote-btn-reader" title="Enter Read Mode">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
        </button>
    `;
    document.body.appendChild(container);

    document.getElementById('webnote-btn-reader').addEventListener('click', () => {
        toggleReaderMode();
    });
}


// Listen for toggle command
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "toggleReader") {
        toggleReaderMode(request.force);
    } else if (request.action === "toggleSidebar") {
        toggleSidebar();
    }
});

let isReaderActive = false;
let isSidebarActive = false;
let extractedReaderTitle = "";

function toggleReaderMode(forceState) {
    // If forceState is provided and is a boolean:
    // - if true and already active, do nothing
    // - if false and already inactive, do nothing
    if (typeof forceState === 'boolean') {
        if (forceState && isReaderActive) return;
        if (!forceState && !isReaderActive) return;
    }

    if (isReaderActive) {
        document.body.classList.remove('webnote-reader-active');
        // Restore original
        const reader = document.getElementById('webnote-reader-container');
        if (reader) reader.style.display = 'none';
    } else {
        document.body.classList.add('webnote-reader-active');
        // Activate
        createOrShowReader();
    }
    isReaderActive = !isReaderActive;
}

function createOrShowReader() {
    let reader = document.getElementById('webnote-reader-container');
    if (!reader) {
        reader = document.createElement('div');
        reader.id = 'webnote-reader-container';
        reader.className = 'theme-light'; // default
        reader.innerHTML = `
      <div class="webnote-reader-vertical-bar">
        <!-- Close Button at the Top -->
        <button class="webnote-vertical-btn" id="webnote-close-reader" title="Exit Reader Mode">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>

        <!-- New Settings Button -->
        <button class="webnote-vertical-btn" id="webnote-btn-settings" title="Reader Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
        </button>

        <!-- Fullbox Button -->
        <button class="webnote-vertical-btn" id="webnote-btn-fullscreen" title="Full Screen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
            </svg>
        </button>

        <button class="webnote-vertical-btn" id="webnote-btn-sidepanel-inner" title="Toggle Side Panel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="15" y1="3" x2="15" y2="21"></line>
            </svg>
        </button>
        <button class="webnote-vertical-btn" id="webnote-btn-summary-inner" title="Write Summary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
        </button>

        <button class="webnote-vertical-btn" id="webnote-save-local" title="Save Local">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
        </button>
        
        <button class="webnote-vertical-btn" id="webnote-save-drive" title="Save to Google Drive">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19c0 1.66-1.34 3-3 3H6c-2.21 0-4-1.79-4-4 0-1.48.81-2.77 2.02-3.47C4.44 14.18 5.76 13 7 13c.27 0 .54.02.81.06C8.73 10.1 11.13 8 14 8c3.31 0 6 2.69 6 6 0 .34-.03.67-.08 1 1.25.7 2.08 1.99 2.08 3.47v.53z" />
            </svg>
        </button>

        <button class="webnote-vertical-btn" id="webnote-save-lib" title="Save to Lib">
            <svg width="24" height="24" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" fill-rule="evenodd" clip-rule="evenodd"><path fill="currentColor" d="M23.77 14.162c-.42-.41-1.31-.23-1.871-.23l-4.715.18c.56-.42-1.792-6.327-3.554-10.23l-.12-.42a6.8 6.8 0 0 1 3.053-.692c0 1.222 2.433 6.637 3.284 8.529c0 .08.92 2.302 1 2.382a.36.36 0 0 0 .491 0c.2-.2-.72-2.802-.69-2.722c-3.004-7.808-3.004-9.1-3.724-9.21c-1.001-.14-2.793.701-3.654 1.152s-.2 1.24.14 2.532c.08.23.05.09-.28.09a9 9 0 0 0-1.562.19c-.21-1-.61-1.14-1.21-1.21a11.3 11.3 0 0 0-2.253.06a3 3 0 0 0-.77.09c.15-1.292 0-1.873-1.112-2.283a5.63 5.63 0 0 0-3.674-.11c-.62.22-.91.55-1 1.531c-.05.531.05 10.15.4 11.142q-.824.16-1.622.42c-.8.28.07 2.002.48 2.813c.571 1.111 0 .5 2.343.49a4.4 4.4 0 0 0-.46 2.133c.1 1 .92 1.781 2.682 1.36c1.261-.38.8-1.891.74-2.782c0-.12-.1-.58-.15-.78c1.472-.07 2.854-.15 4.886-.351c1.07-.11 2.172 0 3.253-.06c.88 0 1.952-.24 3.353-.4a20 20 0 0 0 0 2.692c-.06.63.18 1.061 1.001 1.321a2 2 0 0 0 2.313-.55c.38-.62.14-2.763 0-3.473c.616.25 1.305.25 1.922 0a2.6 2.6 0 0 0 1-1.692c.02-.37.631-1.362.08-1.912M7.235 5.373a8 8 0 0 1 2.162 0q.396.034.78.13c.091 0 .321 0 .281.08c-.26.41.53 8.419.53 8.419a.39.39 0 0 0 .611-.27c.15-.871.12-6.067.1-6.487c-.08-1.081-.16-1.001 1.252-.921q.148.015.29.06c.086.36.123.73.11 1.101c.2 1.462 0 2.172.33 4.405l.17 1.421c.08.33-.09.82.33.78c.491.14.521-.2.431-4.934c.19.54.41 1.06.651 1.581c1.572 3.494 1.391 3.314 1.491 3.374a83 83 0 0 0-10.01.35c-.01-.13.44-8.709.49-9.089M2.639 4.162c.19-2.172 3.494-.47 3.584-.51c.05.62.027 1.246-.07 1.861c-.06.901-.17 5.276 0 7.658c0 .48-.09.9-.1 1.341a26.5 26.5 0 0 0-3.504.31c-.14-.58.05-8.338.09-10.66m2.603 16.406c0 .1-.06.45-.16.47c-.33.081-.672.081-1.001 0c-1.001-.3-.24-2.151-.48-2.432c1.861 0 1.61-.09 1.641 0c-.18.16.17.4 0 1.962m14.625 0c-.08.19-1.111.19-1.412.06c0-.1-.13-.68-.45-2.933a13 13 0 0 1 2.002 0q-.167 1.442-.14 2.893zm2.642-4.815c-.19.781-.27 1.182-1 1.002c-2.133-.511-4.585 0-6.707.35c-1.282.2-2.733.06-4.074.22c-1.342.16-2.923.33-4.385.44c-.26 0-4.885.33-5.005.1s-.17-1.691-.58-1.941c2.552-.751 5.245-.48 8.007-.671c3.094-.21 6.167 0 8.74 0c3.433 0 3.493-.24 5.004-.07c.01.25.01.52 0 .59z"/><path fill="#0c6fff" d="M4.671 10.448h-.42a1.8 1.8 0 0 0-.39.07c-.31.08-.57.21-.891.29a.3.3 0 0 0-.29.3a.31.31 0 0 0 .28.311a4.4 4.4 0 0 0 1.12.2a2.3 2.3 0 0 0 .641-.08c.31-.06.601-.18.911-.23a.33.33 0 0 0 .35-.31a.34.34 0 0 0-.31-.36a5.7 5.7 0 0 0-1-.19m4.514-.001h-.44a2 2 0 0 0-.42.07c-.341.08-.621.21-1.002.29a.31.31 0 0 0 0 .611q.594.173 1.211.2a2.6 2.6 0 0 0 .691-.08c.33-.06.64-.18 1.001-.23a.35.35 0 0 0 0-.69a6.5 6.5 0 0 0-1.041-.17m8.278-1.823q-.16.042-.31.11a1.6 1.6 0 0 0-.28.17c-.21.16-.36.35-.581.511a.28.28 0 0 0-.12.36c.05.16.2.26.31.22c.314.01.628-.027.931-.11q.243-.086.45-.24c.22-.15.401-.33.621-.47a.31.31 0 0 0 .15-.4a.32.32 0 0 0-.36-.25a3.2 3.2 0 0 0-.81.1"/></g></svg>
        </button>
      </div>

      <div class="webnote-reader-content-container">
        <div class="webnote-reader-content">
            <!-- Content will be injected here -->
        </div>
      </div>
    `;
        document.body.appendChild(reader);
        document.getElementById('webnote-close-reader').addEventListener('click', () => toggleReaderMode());
        document.getElementById('webnote-btn-sidepanel-inner').addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: "open_side_panel" });
        });
        document.getElementById('webnote-btn-summary-inner').addEventListener('click', () => {
            toggleSummaryEditor();
        });
        document.getElementById('webnote-btn-fullscreen').addEventListener('click', () => {
            toggleFullScreen();
        });
        document.getElementById('webnote-btn-settings').addEventListener('click', () => {
            showReaderSettings();
        });
    }

    // Apply saved settings before showing
    applySavedReaderSettings(reader);

    reader.style.display = 'block';

    // Ensure buttons have active listeners every time reader is shown/re-shown
    document.getElementById('webnote-save-drive').onclick = () => {
        console.log("Google Drive button clicked");
        showExportModal('drive');
    };
    document.getElementById('webnote-save-local').onclick = () => {
        console.log("Local save button clicked");
        showExportModal('local');
    };
    document.getElementById('webnote-save-lib').onclick = () => {
        console.log("Library save button clicked");
        showExportModal('lib');
    };

    const contentDiv = reader.querySelector('.webnote-reader-content');
    const containerDiv = reader.querySelector('.webnote-reader-content-container');
    containerDiv.innerHTML = ''; // Clear previous

    // extraction logic
    extractedReaderTitle = document.querySelector('h1')?.innerText || document.title;
    // Basic cleanup - remove excessive whitespace and newlines
    extractedReaderTitle = extractedReaderTitle.trim().replace(/\s+/g, ' ');
    if (extractedReaderTitle.length > 200) {
        extractedReaderTitle = extractedReaderTitle.substring(0, 200) + '...';
    }

    let title = extractedReaderTitle;
    let contentNode = document.querySelector('article') || document.querySelector('#js_content') || document.querySelector('main');
    if (!contentNode) {
        const divs = document.getElementsByTagName('div');
        let maxPCount = 0;
        let bestDiv = null;
        for (let div of divs) {
            const pCount = div.getElementsByTagName('p').length;
            if (pCount > maxPCount) {
                maxPCount = pCount;
                bestDiv = div;
            }
        }
        contentNode = bestDiv || document.body;
    }
    const clone = contentNode.cloneNode(true);

    // --- Cleaning Logic ---
    const NOISE_SELECTORS = [
        '#js_pc_qr_code', '.qr_code_pc_outer', '.rich_media_tool', '#js_cmt_area',
        '.rich_media_area_extra', '.rich_media_extra', '#js_profile_qrcode',
        '#js_v_praise', '.reward_area', '#js_bottom_ad_area',
        '.rich_media_footer_content', '#js_view_source', '.original_area_primary',
        'script', 'style', 'noscript', 'iframe', 'svg', 'button', 'canvas'
    ];
    NOISE_SELECTORS.forEach(selector => {
        clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    // Remove hidden elements
    clone.querySelectorAll('*').forEach(el => {
        const style = el.getAttribute('style') || '';
        if (style.includes('display: none') || style.includes('visibility: hidden')) {
            el.remove();
        }
    });

    clone.querySelectorAll('#webnote-reader-container, #webnote-sidebar, #webnote-floating-toolbar-container').forEach(el => el.remove());

    // --- Pagination / Paper Cards Logic ---
    // Extract sections starting with H1 or H2
    const sections = [];
    let currentSection = document.createElement('div');
    currentSection.className = 'webnote-reader-content';

    // Prepend title as a header if not present
    const normalizedTitle = title.replace(/\s+/g, '');
    const cloneText = clone.innerText || "";
    const normalizedCloneText = cloneText.substring(0, 500).replace(/\s+/g, '');
    const shouldPrependTitle = !normalizedCloneText.includes(normalizedTitle);
    if (shouldPrependTitle) {
        const titleH1 = document.createElement('h1');
        titleH1.textContent = title;
        currentSection.appendChild(titleH1);
    }

    Array.from(clone.childNodes).forEach(node => {
        if (node.nodeType === 1 && (node.tagName === 'H1' || node.tagName === 'H2')) {
            if (currentSection.childNodes.length > 0) {
                sections.push(currentSection);
                currentSection = document.createElement('div');
                currentSection.className = 'webnote-reader-content';
            }
        }
        currentSection.appendChild(node.cloneNode(true));
    });
    if (currentSection.childNodes.length > 0) sections.push(currentSection);

    // Create Paper Cards
    sections.forEach(sec => {
        const card = document.createElement('div');
        card.className = 'webnote-page-card';
        card.appendChild(sec);
        containerDiv.appendChild(card);
    });

    // Setup scroll sync (optional but useful)
    setupScrollSync(containerDiv);
}

function toggleFullScreen() {
    const reader = document.getElementById('webnote-reader-container');
    if (!document.fullscreenElement) {
        reader.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable full-screen mode: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}

let settingsModal = null;
function showReaderSettings() {
    if (!settingsModal) {
        settingsModal = document.createElement('div');
        settingsModal.id = 'webnote-settings-modal-overlay';
        settingsModal.innerHTML = `
            <div class="webnote-settings-modal">
                <div class="webnote-settings-modal-header">
                    <h3>Reader Settings</h3>
                    <button id="webnote-close-settings">✕</button>
                </div>
                <div class="webnote-settings-modal-body">
                    <div class="settings-group">
                        <label>Display Theme</label>
                        <div class="theme-preview-grid">
                            <div class="theme-preview-item theme-light" data-schema="light" style="background:#ecedef; border: 1px solid #ddd;" title="Light"></div>
                            <div class="theme-preview-item theme-sepia" data-schema="sepia" style="background:#e5dac1;" title="Sepia"></div>
                            <div class="theme-preview-item theme-dark" data-schema="dark" style="background:#1a1a1a;" title="Dark"></div>
                            <div class="theme-preview-item theme-paper" data-schema="paper" style="background:#f0f0f0;" title="Paper"></div>
                        </div>
                    </div>

                    <div class="settings-group">
                        <label>Font Family</label>
                        <div class="settings-row">
                            <button class="webnote-modal-btn" data-font="sans-serif">Sans Serif</button>
                            <button class="webnote-modal-btn" data-font="serif">Serif</button>
                            <button class="webnote-modal-btn" data-font="monospace">Mono</button>
                        </div>
                    </div>

                    <div class="settings-group">
                        <label>Font Size</label>
                        <div class="settings-row">
                            <button class="webnote-modal-btn font-size-btn" data-change="-2">A-</button>
                            <button class="webnote-modal-btn font-size-btn" data-change="2">A+</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(settingsModal);

        document.getElementById('webnote-close-settings').addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });

        // Theme switching
        const themeItems = settingsModal.querySelectorAll('.theme-preview-item');
        themeItems.forEach(item => {
            item.addEventListener('click', () => {
                const schema = item.dataset.schema;
                const reader = document.getElementById('webnote-reader-container');
                reader.className = `theme-${schema}`;
                chrome.storage.local.set({ 'reader_schema': schema });
                themeItems.forEach(t => t.classList.remove('active'));
                item.classList.add('active');
            });
        });

        // Font switching
        const fontBtns = settingsModal.querySelectorAll('.webnote-modal-btn[data-font]');
        fontBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const font = btn.dataset.font;
                const reader = document.getElementById('webnote-reader-container');
                reader.style.setProperty('--reader-font', font === 'serif' ? 'Georgia, serif' : font === 'monospace' ? 'monospace' : 'system-ui, sans-serif');
                chrome.storage.sync.set({ 'reader_font': font });
                fontBtns.forEach(f => f.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Font size
        const sizeBtns = settingsModal.querySelectorAll('.font-size-btn');
        sizeBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                const change = parseInt(btn.dataset.change);
                const reader = document.getElementById('webnote-reader-container');
                let currentSize = parseInt(getComputedStyle(reader).getPropertyValue('--reader-font-size')) || 18;
                let newSize = Math.max(12, Math.min(32, currentSize + change));
                reader.style.setProperty('--reader-font-size', `${newSize}px`);
                chrome.storage.sync.set({ 'reader_font-size': `${newSize}px` });
            });
        });
    }

    settingsModal.style.display = 'flex';
}

async function applySavedReaderSettings(reader) {
    const keys = ['reader_font', 'reader_font-size', 'reader_max-width'];
    const syncSettings = await chrome.storage.sync.get(keys);
    const localSettings = await chrome.storage.local.get(['reader_schema']);

    if (syncSettings.reader_font) {
        reader.style.setProperty('--reader-font', syncSettings.reader_font);
    }
    if (syncSettings['reader_font-size']) {
        reader.style.setProperty('--reader-font-size', syncSettings['reader_font-size']);
    }
    if (syncSettings['reader_max-width']) {
        reader.style.setProperty('--reader-max-width', syncSettings['reader_max-width']);
    }

    if (localSettings.reader_schema) {
        reader.className = `theme-${localSettings.reader_schema}`;
        const activeDot = reader.querySelector(`.webnote-schema-dot[data-schema="${localSettings.reader_schema}"]`);
        if (activeDot) {
            reader.querySelectorAll('.webnote-schema-dot').forEach(d => d.classList.remove('active'));
            activeDot.classList.add('active');
        }
    } else {
        const lightDot = reader.querySelector('.webnote-schema-dot[data-schema="light"]');
        if (lightDot) lightDot.classList.add('active');
    }
}

// Watch for storage changes to update appearance in real-time
chrome.storage.onChanged.addListener((changes, area) => {
    const reader = document.getElementById('webnote-reader-container');
    if (!reader) return;

    if (area === 'sync') {
        if (changes.reader_font) reader.style.setProperty('--reader-font', changes.reader_font.newValue);
        if (changes['reader_font-size']) reader.style.setProperty('--reader-font-size', changes['reader_font-size'].newValue);
        if (changes['reader_max-width']) reader.style.setProperty('--reader-max-width', changes['reader_max-width'].newValue);
    }
});

function setTheme(themeName) {
    const reader = document.getElementById('webnote-reader-container');
    if (reader) {
        reader.className = `theme-${themeName}`;
    }
}

// listen for theme changes
chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'setTheme') {
        setTheme(request.theme);
    }
});

function toggleSidebar() {
    let sidebar = document.getElementById('webnote-sidebar');
    if (!sidebar) {
        sidebar = document.createElement('div');
        sidebar.id = 'webnote-sidebar';
        sidebar.innerHTML = `
      <div class="webnote-sidebar-header">
        <h2>Notes</h2>
        <button id="webnote-close-sidebar">X</button>
      </div>
      <textarea id="webnote-note-area" placeholder="Type your notes here..."></textarea>
    `;
        document.body.appendChild(sidebar);

        document.getElementById('webnote-close-sidebar').addEventListener('click', () => {
            sidebar.style.display = 'none';
            isSidebarActive = false;
        });

        const textarea = sidebar.querySelector('#webnote-note-area');
        // Load saved note
        const storageKey = 'note_' + window.location.href;
        const saved = localStorage.getItem(storageKey);
        if (saved) textarea.value = saved;

        // Save on input
        textarea.addEventListener('input', (e) => {
            localStorage.setItem(storageKey, e.target.value);
        });
    }

    if (isSidebarActive) {
        sidebar.style.display = 'none';
    } else {
        sidebar.style.display = 'flex';
    }
    isSidebarActive = !isSidebarActive;
}

// --- Highlighting & Floating Toolbar ---

let floatingToolbar = null;

function createFloatingToolbar() {
    if (floatingToolbar) return;

    floatingToolbar = document.createElement('div');
    floatingToolbar.id = 'webnote-floating-toolbar';
    floatingToolbar.innerText = 'Add to Notes';
    document.body.appendChild(floatingToolbar);

    floatingToolbar.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent losing selection
        addToNotes();
    });
}

document.addEventListener('mouseup', (e) => {
    // Only work if Reader Mode is active? Or general? 
    // Requirement says "When reading mode is enabled", but let's make it general or check class
    if (!document.body.classList.contains('webnote-reader-active')) return;

    setTimeout(() => {
        const selection = window.getSelection();
        if (selection.toString().trim().length > 0) {
            showToolbar(selection);
        } else {
            hideToolbar();
        }
    }, 10);
});

function showToolbar(selection) {
    if (!selection || !selection.rangeCount) return;
    if (!floatingToolbar) createFloatingToolbar();

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (rect.width === 0 || rect.height === 0) return;

    // Use fixed positioning in Reader Mode to avoid coordinate issues with scrolled containers
    const isReader = document.body.classList.contains('webnote-reader-active');

    if (isReader) {
        floatingToolbar.style.position = 'fixed';
        const top = rect.top - 45;
        const left = rect.left + (rect.width / 2);
        floatingToolbar.style.top = `${top}px`;
        floatingToolbar.style.left = `${left}px`;
    } else {
        floatingToolbar.style.position = 'absolute';
        const top = rect.top + window.scrollY - 45;
        const left = rect.left + window.scrollX + (rect.width / 2);
        floatingToolbar.style.top = `${top}px`;
        floatingToolbar.style.left = `${left}px`;
    }

    floatingToolbar.style.display = 'block';
    floatingToolbar.style.zIndex = '2147483647'; // Max priority
}

function hideToolbar() {
    if (floatingToolbar) {
        floatingToolbar.style.display = 'none';
    }
}

function addToNotes() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.toString().trim().length === 0) return;

    const text = selection.toString();
    const range = selection.getRangeAt(0);
    const anchorId = 'webnote-anchor-' + Date.now();

    try {
        const mark = document.createElement('mark');
        mark.className = 'webnote-highlight';
        mark.id = anchorId;
        mark.dataset.anchorId = anchorId;

        // Use surroundContents if possible for cleaner structure, otherwise fallback
        try {
            range.surroundContents(mark);
        } catch (err) {
            // Fallback for complex ranges (spanning mixed nodes)
            mark.textContent = text;
            range.deleteContents();
            range.insertNode(mark);
        }

        if (scrollObserver) {
            scrollObserver.observe(mark);
        }
    } catch (e) {
        console.error("Highlighting error:", e);
    }

    chrome.runtime.sendMessage({
        action: "addNote",
        text: text,
        title: extractedReaderTitle || document.title,
        anchorId: anchorId
    });

    hideToolbar();
    if (selection.removeAllRanges) selection.removeAllRanges();
}

// --- Summary Editor (BlockNote/Tiptap) ---

let summaryEditor = null;
let summaryContainer = null;
let isSummaryEditorOpen = false;

async function toggleSummaryEditor() {
    if (!summaryContainer) {
        createSummaryEditor();
    }

    if (isSummaryEditorOpen) {
        summaryContainer.style.display = 'none';
    } else {
        summaryContainer.style.display = 'block';
        // Focus the editor if possible
    }
    isSummaryEditorOpen = !isSummaryEditorOpen;
}

function createSummaryEditor() {
    summaryContainer = document.createElement('div');
    summaryContainer.id = 'webnote-summary-editor-container';
    summaryContainer.innerHTML = `
        <div class="webnote-summary-header">
            <h3>Summary Note</h3>
            <div class="webnote-summary-actions">
                <button id="webnote-sync-summary" title="Sync to Cloud">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#000000" d="M12 4.5a4.5 4.5 0 0 0-4.495 4.285a.75.75 0 0 1-.75.715H6.5a3 3 0 1 0 0 6h3.576a6.554 6.554 0 0 0-.057 1.5H6.5a4.5 4.5 0 0 1-.42-8.98a6.001 6.001 0 0 1 11.84 0a4.5 4.5 0 0 1 4.053 4.973a6.534 6.534 0 0 0-1.8-1.857A3 3 0 0 0 17.5 9.5h-.256a.75.75 0 0 1-.749-.715A4.5 4.5 0 0 0 12 4.5ZM16.5 22a5.5 5.5 0 1 0 0-11a5.5 5.5 0 0 0 0 11Zm2-7a2.496 2.496 0 0 0-2-1c-.74 0-1.405.321-1.864.834a.5.5 0 0 1-.745-.668A3.493 3.493 0 0 1 16.5 13c.98 0 1.865.403 2.5 1.05v-.55a.5.5 0 0 1 1 0v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h1ZM13 17.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-1c.456.608 1.183 1 2 1c.74 0 1.405-.321 1.863-.834a.5.5 0 0 1 .746.668A3.493 3.493 0 0 1 16.5 20a3.49 3.49 0 0 1-2.5-1.05v.55a.5.5 0 0 1-1 0v-2Z"/></svg>
                </button>
                <button id="webnote-close-summary-editor">✕</button>
            </div>
        </div>
        <div id="webnote-summary-editor"></div>
    `;
    document.body.appendChild(summaryContainer);

    document.getElementById('webnote-close-summary-editor').addEventListener('click', () => {
        toggleSummaryEditor();
    });

    document.getElementById('webnote-sync-summary').addEventListener('click', () => {
        syncSummaryToCloud();
    });

    // Inject dynamic styles to ensure they override BlockNote defaults
    const style = document.createElement('style');
    style.id = 'webnote-summary-styles';
    style.textContent = `
        #webnote-summary-editor .bn-editor,
        #webnote-summary-editor .ProseMirror,
        #webnote-summary-editor [contenteditable="true"] {
            font-size: 12px !important;
            line-height: 1.3 !important;
            padding: 8px !important;
        }

        /* Override BlockNote internal heading variables */
        #webnote-summary-editor [data-level="1"] { --level: 1.3em !important; --prev-level: 1.3em !important; }
        #webnote-summary-editor [data-level="2"] { --level: 1.2em !important; --prev-level: 1.2em !important; }
        #webnote-summary-editor [data-level="3"] { --level: 1.1em !important; --prev-level: 1.1em !important; }
        
        /* Fallback for standard tags if used */
        #webnote-summary-editor .ProseMirror h1, #webnote-summary-editor .bn-editor h1 { font-size: 1.3em !important; margin: 0.2em 0 !important; }
        #webnote-summary-editor .ProseMirror h2, #webnote-summary-editor .bn-editor h2 { font-size: 1.2em !important; margin: 0.2em 0 !important; }
        #webnote-summary-editor .ProseMirror h3, #webnote-summary-editor .bn-editor h3 { font-size: 1.1em !important; margin: 0.2em 0 !important; }
    `;
    summaryContainer.appendChild(style);

    const editorElement = document.getElementById('webnote-summary-editor');

    // Initialize BlockNote (version 0.8.5 style)
    if (window.BlockNoteEditor) {
        try {
            summaryEditor = new window.BlockNoteEditor({
                parentElement: editorElement,
                onEditorContentChange: (editor) => {
                    const blocks = editor.topLevelBlocks;

                    // Auto-update title from first H1
                    const firstH1 = blocks.find(b => b.type === 'heading' && b.props?.level === 1);
                    if (firstH1) {
                        const titleText = (firstH1.content || []).map(c => (typeof c === 'string' ? c : c.text)).join('') || 'Summary Note';
                        summaryContainer.querySelector('h3').textContent = titleText;
                    }

                    const storageKey = 'summary_' + window.location.href;
                    chrome.storage.local.set({ [storageKey]: blocks });
                }
            });

            // Force font size on the editor element after a short delay
            setTimeout(() => {
                const pmEditor = editorElement.querySelector('.ProseMirror');
                if (pmEditor) {
                    pmEditor.style.fontSize = '12px';
                    pmEditor.style.lineHeight = '1.3';
                }
            }, 100);

            // Load saved summary if any
            const storageKey = 'summary_' + window.location.href;
            chrome.storage.local.get([storageKey], (result) => {
                if (result[storageKey] && summaryEditor) {
                    try {
                        summaryEditor.replaceBlocks(summaryEditor.topLevelBlocks, result[storageKey]);
                    } catch (e) {
                        console.error("Failed to load summary blocks:", e);
                    }
                }
            });
        } catch (e) {
            console.error("Error creating BlockNote editor:", e);
            editorElement.innerHTML = `<p style="padding: 20px; color: red;">Error initializing editor: ${e.message}</p>`;
        }
    } else {
        editorElement.innerHTML = '<p style="padding: 20px; color: red;">Error: Editor library not loaded.</p>';
    }
}

// --- Scroll Synchronization ---

let scrollObserver = null;

function setupScrollSync(container) {
    if (scrollObserver) scrollObserver.disconnect();

    scrollObserver = new IntersectionObserver((entries) => {
        // Find the triggered entry that is closest to the top of the viewport
        const visibleAnchors = entries
            .filter(entry => entry.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visibleAnchors.length > 0) {
            const anchorId = visibleAnchors[0].target.dataset.anchorId;
            if (anchorId) {
                chrome.runtime.sendMessage({
                    action: "highlightNote",
                    anchorId: anchorId
                });
            }
        }
    }, {
        root: null, // Use viewport
        rootMargin: '-10% 0px -70% 0px', // Trigger when in the top region
        threshold: 0
    });

    // Observe all highlights
    const highlights = container.querySelectorAll('.webnote-highlight');
    highlights.forEach(h => scrollObserver.observe(h));
}

// --- Firebase Synchronization ---

async function syncSummaryToCloud() {
    const syncBtn = document.getElementById('webnote-sync-summary');
    if (!syncBtn) return;

    const originalContent = syncBtn.innerHTML;
    syncBtn.innerHTML = '...'; // Simple loading state
    syncBtn.disabled = true;

    try {
        // Request token from background script (since chrome.identity is unavailable here)
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getAuthToken', interactive: false }, (res) => {
                resolve(res || {});
            });
        });

        if (response.error || !response.token) {
            alert('Please sign in to your Google Account in the Sidepanel first.');
            return;
        }
        const token = response.token;

        const settings = await chrome.storage.sync.get(['fbApiKey', 'fbDbUrl', 'fbProjectId', 'fbStorageBucket', 'fbStoragePath']);
        if (!settings.fbDbUrl) {
            alert('Please configure Firebase RTDB URL in Sidepanel Settings first.');
            return;
        }

        const blocks = summaryEditor.topLevelBlocks;
        const noteTitle = summaryContainer.querySelector('h3').textContent;
        const pageUrl = window.location.href;

        // Create a unique but consistent ID for the URL
        const urlHash = btoa(pageUrl).replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '');

        // 1. Sync Summary to RTDB (Real-time Database)
        const rtdbUrl = `${settings.fbDbUrl.replace(/\/$/, '')}/summaries/${urlHash}.json`;
        // Note: auth parameter depends on setup, but using API key as auth is common for simple REST tests
        // Real implementation might need a proper token or public access for demo.

        await fetch(rtdbUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                title: noteTitle,
                url: pageUrl,
                content: blocks,
                updatedAt: Date.now()
            })
        });

        // 2. Sync Reader Content + Inline Notes as Markdown to Firebase Storage
        const markdown = await generatePageMarkdown();
        let storageBucket = settings.fbStorageBucket || `${settings.fbProjectId}.appspot.com`;
        // Sanitize bucket: remove gs:// and trailing slashes
        storageBucket = storageBucket.replace(/^gs:\/\//, '').replace(/\/$/, '');

        const storagePath = (settings.fbStoragePath || 'webnotes').replace(/^\//, '').replace(/\/$/, '');
        const fileName = `${urlHash}.md`;
        const fullPath = encodeURIComponent(`${storagePath}/${fileName}`);

        const storageUrl = `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o?uploadType=media&name=${fullPath}`;

        console.log("Syncing to Storage:", storageUrl);
        const markdownBlob = new Blob([markdown], { type: 'text/markdown; charset=utf-8' });

        const storageRes = await fetch(storageUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: markdownBlob
        });

        if (!storageRes.ok) {
            const errorText = await storageRes.text();
            console.error("Storage Sync Error Response:", errorText);
            throw new Error(`Storage error: ${storageRes.status}`);
        }

        alert('Synced successfully!');
    } catch (e) {
        console.error('Sync failed:', e);
        alert('Sync failed: ' + e.message);
    } finally {
        syncBtn.innerHTML = originalContent;
        syncBtn.disabled = false;
    }
}

async function saveToLibrary(customTitle, tags) {
    const saveBtn = document.getElementById('webnote-save-lib');
    if (!saveBtn) return;

    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    try {
        // Request token relay
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getAuthToken', interactive: false }, (res) => {
                resolve(res || {});
            });
        });

        if (response.error || !response.token) {
            alert('Please sign in to your Google Account in the Sidepanel first.');
            return;
        }
        const token = response.token;

        const settings = await chrome.storage.sync.get(['fbApiKey', 'fbProjectId', 'fbStorageBucket', 'fbStoragePath']);
        if (!settings.fbProjectId && !settings.fbStorageBucket) {
            alert('Please configure Firebase Project ID or Storage Bucket in Sidepanel Settings first.');
            return;
        }

        const markdown = await generatePageMarkdown(customTitle);
        const pageUrl = window.location.href;
        const urlHash = btoa(pageUrl).replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '');

        let storageBucket = settings.fbStorageBucket || `${settings.fbProjectId}.appspot.com`;
        // Sanitize bucket: remove gs:// and trailing slashes
        storageBucket = storageBucket.replace(/^gs:\/\//, '').replace(/\/$/, '');

        const storagePath = (settings.fbStoragePath || 'webnotes').replace(/^\//, '').replace(/\/$/, '');
        const fileName = `${urlHash}.md`;
        const fullPath = encodeURIComponent(`${storagePath}/${fileName}`);

        const storageUrl = `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o?uploadType=media&name=${fullPath}`;

        console.log("Saving to Library (Storage):", storageUrl);
        const markdownBlob = new Blob([markdown], { type: 'text/markdown; charset=utf-8' });

        const res = await fetch(storageUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: markdownBlob
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error?.message || 'Firestore request failed');
        }

        const decodedPath = decodeURIComponent(fullPath);
        await logExportDigest({ firebaseStorageUri: `gs://${storageBucket}/${decodedPath}` }, customTitle, tags);

        alert('Saved to Library successfully!');
    } catch (e) {
        console.error('Save to Lib failed:', e);
        alert('Save failed: ' + e.message);
    } finally {
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
}

async function generatePageMarkdown(titleOverride) {
    const readerSections = document.querySelectorAll('.webnote-reader-content');
    if (readerSections.length === 0) return '';

    const title = titleOverride || getReaderTitle();
    let md = `# ${title}\n\nURL: ${window.location.href}\n\n`;

    // 1. Fetch Notes from storage to correlate with highlights
    const storageKey = `notes_v2_${window.location.href}`;
    const storageData = await chrome.storage.local.get([storageKey]);
    const notesArray = storageData[storageKey] || [];
    const notesMap = {};
    notesArray.forEach(n => {
        if (n.anchorId) notesMap[n.anchorId] = n;
    });

    // Add Summary if exists
    if (window.BlockNoteEditor && summaryEditor) {
        try {
            let summaryMd = "";
            if (summaryEditor.blocksToMarkdown) {
                summaryMd = await summaryEditor.blocksToMarkdown(summaryEditor.topLevelBlocks);
            } else {
                summaryMd = summaryEditor.topLevelBlocks.map(b => (b.content || []).map(c => c.text).join('')).join('\n\n');
            }

            if (summaryMd.trim()) {
                md += `<details>\n<summary><b>Summary Note (Click to expand)</b></summary>\n\n${summaryMd}\n\n</details>\n\n`;
            }
        } catch (e) {
            console.warn("Could not convert summary blocks to markdown:", e);
        }
    }

    md += `## Content\n\n`;

    const footnoteEntries = [];
    const usedAnchorIds = new Set();

    // Process all Reader Content sections (cards)
    readerSections.forEach((section, index) => {
        const clone = section.cloneNode(true);

        // 2. Process Highlights (convert to footnote syntax [^n])
        clone.querySelectorAll('.webnote-highlight').forEach(el => {
            const text = el.textContent;
            const anchorId = el.dataset.anchorId;
            const note = notesMap[anchorId];

            if (note && !usedAnchorIds.has(anchorId)) {
                usedAnchorIds.add(anchorId);
                const footnoteIndex = footnoteEntries.length + 1;
                footnoteEntries.push({
                    index: footnoteIndex,
                    anchorId: anchorId,
                    content: note.content || '',
                    quote: text
                });

                const marker = document.createTextNode(`${text}[^${footnoteIndex}]`);
                el.parentNode.replaceChild(marker, el);
            } else {
                const marker = document.createTextNode(text);
                el.parentNode.replaceChild(marker, el);
            }
        });

        // 3. Convert the processed clone to Markdown
        md += convertNodeToMarkdown(clone);

        if (index < readerSections.length - 1) {
            md += "\n\n---\n\n"; // Divider between cards
        }
    });

    // 4. Append Footnotes at the bottom
    if (footnoteEntries.length > 0) {
        md += `\n\n---\n\n## Notes\n\n`;
        footnoteEntries.forEach(entry => {
            const noteText = entry.content.trim() || "(No comment)";
            md += `[^${entry.index}]: **笔记**：${noteText}\n`;
        });
    }

    return md.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Helper to recursively convert DOM nodes to Markdown
 */
function convertNodeToMarkdown(node) {
    if (node.nodeType === 3) { // TEXT_NODE
        return node.textContent;
    }
    if (node.nodeType !== 1) return ""; // Ignore other types

    const tag = node.tagName.toLowerCase();

    // Ignore technical or interactive tags
    const IGNORE_TAGS = ['script', 'style', 'noscript', 'iframe', 'svg', 'head', 'meta', 'button', 'canvas'];
    if (IGNORE_TAGS.includes(tag)) return "";
    let childrenMd = "";
    for (let child of node.childNodes) {
        childrenMd += convertNodeToMarkdown(child);
    }

    switch (tag) {
        case 'h1': return `\n# ${childrenMd.trim()}\n\n`;
        case 'h2': return `\n## ${childrenMd.trim()}\n\n`;
        case 'h3': return `\n### ${childrenMd.trim()}\n\n`;
        case 'h4': return `\n#### ${childrenMd.trim()}\n\n`;
        case 'h5': return `\n##### ${childrenMd.trim()}\n\n`;
        case 'h6': return `\n###### ${childrenMd.trim()}\n\n`;
        case 'p': return `\n\n${childrenMd.trim()}\n\n`;
        case 'br': return `\n`;
        case 'strong': case 'b': return `**${childrenMd}**`;
        case 'em': case 'i': return `*${childrenMd}*`;
        case 'ul': return `\n${childrenMd}\n`;
        case 'ol': return `\n${childrenMd}\n`;
        case 'li': return `\n- ${childrenMd.trim()}`;
        case 'blockquote': return `\n> ${childrenMd.trim().replace(/\n/g, '\n> ')}\n\n`;
        case 'code': return `\`${childrenMd}\``;
        case 'pre': return `\n\`\`\`\n${childrenMd}\n\`\`\`\n`;
        case 'hr': return `\n---\n`;
        case 'a':
            const href = node.getAttribute('href') || '';
            const aTitle = node.getAttribute('title') || '';
            return `[${childrenMd}](${href}${aTitle ? ` "${aTitle}"` : ''})`;
        case 'img':
            const alt = node.getAttribute('alt') || '';
            const src = node.getAttribute('src') || '';
            return `![${alt}](${src})`;
        default:
            // For other containers (div, section, cards), just return children
            // but add a newline if it's a block-level-like element in our context
            if (['div', 'section', 'article'].includes(tag)) {
                return `\n${childrenMd}\n`;
            }
            return childrenMd;
    }
}

async function downloadLocalMarkdown(customTitle, tags) {
    const saveBtn = document.getElementById('webnote-save-local');
    if (!saveBtn) return;

    const originalContent = saveBtn.innerHTML;
    saveBtn.innerHTML = '...'; // Simple loading state
    saveBtn.disabled = true;

    try {
        const markdown = await generatePageMarkdown(customTitle);
        const blob = new Blob([markdown], { type: 'text/markdown; charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        // Sanitize filename
        const title = customTitle || getReaderTitle();
        const safeTitle = title.replace(/[\\/:*?"<>|]/g, '-').substring(0, 100);

        a.href = url;
        a.download = `${safeTitle}.md`;
        document.body.appendChild(a);
        a.click();

        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        await logExportDigest({ localPath: `${safeTitle}.md` }, customTitle, tags);
    } catch (e) {
        console.error('Local save failed:', e);
        alert('Failed to save locally: ' + e.message);
    } finally {
        saveBtn.innerHTML = originalContent;
        saveBtn.disabled = false;
    }
}

async function saveToGoogleDrive(customTitle, tags) {
    const saveBtn = document.getElementById('webnote-save-drive');
    if (!saveBtn) return;

    const originalContent = saveBtn.innerHTML;
    saveBtn.innerHTML = '...'; // Simple loading state
    saveBtn.disabled = true;

    try {
        // 1. Get Auth Token via background relay
        let authResponse = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getAuthToken', interactive: true }, (res) => {
                resolve(res || {});
            });
        });

        if (authResponse.error || !authResponse.token) {
            alert('Please sign in to your Google Account first.');
            return;
        }
        let token = authResponse.token;

        // 2. Get Folder Config via background relay
        const configResponse = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getGDConfig' }, (res) => {
                resolve(res || { gdFolderName: 'WebNotes' });
            });
        });
        const folderName = configResponse.gdFolderName;

        try {
            // 3. Find or Create Folder
            let folderId = await findGDFolder(token, folderName);
            if (!folderId) {
                folderId = await createGDFolder(token, folderName);
            }

            // 4. Prepare content (Markdown)
            const markdown = await generatePageMarkdown(customTitle);
            const title = customTitle || getReaderTitle();
            const fileName = `${title.replace(/[/\\?%*:|"<>]/g, '-')}.md`;

            // 5. Upload file
            const fileResult = await uploadToGD(token, folderId, fileName, markdown);

            await logExportDigest({ googleDriveId: fileResult.id }, customTitle, tags);

            alert('Saved to Google Drive successfully!');
        } catch (error) {
            if (error.status === 403) {
                console.error("403 Forbidden Error details:", error.details);
                const reason = error.details?.error?.errors?.[0]?.reason;
                const message = error.details?.error?.message || "";

                console.warn(`403 Forbidden detected. Reason: ${reason}. Message: ${message}`);

                await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ action: 'clearAuthToken', token: token }, resolve);
                });

                if (reason === 'accessNotConfigured') {
                    alert("Google Drive API is not enabled. Please enable it in the Google Cloud Console for this Project ID.");
                } else if (reason === 'insufficientPermissions' || message.includes('scope')) {
                    alert("Insufficient permissions. Please click the button again to re-authenticate and approve Google Drive access.");
                } else {
                    alert(`Permission error (403): ${message}. Please click again to retry.`);
                }
            } else {
                throw error;
            }
        }
    } catch (e) {
        console.error('Google Drive save failed:', e);
        alert('Save to Drive failed: ' + (e.message || 'Unknown error'));
    } finally {
        saveBtn.innerHTML = originalContent;
        saveBtn.disabled = false;
    }
}

async function findGDFolder(token, name) {
    const query = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        const err = new Error(`Drive API Error: ${response.status}`);
        err.status = response.status;
        err.details = details;
        throw err;
    }
    const data = await response.json();
    return data.files && data.files.length > 0 ? data.files[0].id : null;
}

async function createGDFolder(token, name) {
    const response = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: name,
            mimeType: 'application/vnd.google-apps.folder'
        })
    });
    if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        const err = new Error(`Drive API Error: ${response.status}`);
        err.status = response.status;
        err.details = details;
        throw err;
    }
    const data = await response.json();
    return data.id;
}

async function uploadToGD(token, folderId, name, content) {
    const metadata = {
        name: name,
        parents: [folderId]
    };
    const file = new Blob([content], { type: 'text/markdown; charset=utf-8' });
    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', file);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
    });
    if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        const err = new Error(`Drive API Error: ${response.status}`);
        err.status = response.status;
        err.details = details;
        throw err;
    }
    return await response.json();
}

function getReaderTitle() {
    if (extractedReaderTitle) return extractedReaderTitle;
    return document.title;
}

function generateShortId() {
    return Math.random().toString(36).substring(2, 9);
}

async function logExportDigest(contentURI, customTitle, tags) {
    try {
        const settings = await chrome.storage.sync.get(['fbDbUrl']);
        if (!settings.fbDbUrl) {
            console.warn("Firebase DB URL not set, skipping digest logging.");
            return;
        }

        const shortId = generateShortId();
        const host = window.location.host;
        const digest = {
            source: window.location.href,
            title: customTitle || getReaderTitle(),
            tags: tags || [],
            timestamp: new Date().toISOString(),
            contentURI: contentURI,
            host: host
        };

        const dbBaseUrl = settings.fbDbUrl.replace(/\/$/, '');
        const rtdbUrl = `${dbBaseUrl}/echoWebDigests/${shortId}.json`;

        // Get Auth Token
        const authResponse = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getAuthToken', interactive: false }, (res) => {
                resolve(res || {});
            });
        });

        const headers = {
            'Content-Type': 'application/json'
        };

        if (authResponse.token) {
            headers['Authorization'] = `Bearer ${authResponse.token}`;
        }

        // 1. Save the Document Digest
        await fetch(rtdbUrl, {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify(digest)
        });

        // 2. Manage Virtual Folder (echoWebDigestFolders)
        const foldersUrl = `${dbBaseUrl}/echoWebDigestFolders.json`;
        // Search for existing folder by host
        const searchUrl = `${foldersUrl}?orderBy="host"&equalTo="${host}"`;
        let existingFolders = {};
        try {
            const searchRes = await fetch(searchUrl, { headers: headers });
            existingFolders = await searchRes.json();

            // Firebase returns an object with "error" key if index is missing
            if (existingFolders && existingFolders.error) {
                console.warn("RTDB Search failed (missing index), falling back to local filter:", existingFolders.error);
                const allFoldersRes = await fetch(foldersUrl, { headers: headers });
                const allFolders = await allFoldersRes.json();
                existingFolders = {};
                if (allFolders && typeof allFolders === 'object') {
                    // Filter locally
                    for (const key in allFolders) {
                        if (allFolders[key] && allFolders[key].host === host) {
                            existingFolders[key] = allFolders[key];
                            break;
                        }
                    }
                }
            }
        } catch (searchErr) {
            console.warn("Folder search failed, skipping folder management:", searchErr);
            return;
        }

        if (existingFolders && Object.keys(existingFolders).length > 0 && !existingFolders.error) {
            // Update existing folder: add note key to documentKeys array
            const folderKey = Object.keys(existingFolders)[0];
            const folderData = existingFolders[folderKey];
            const documentKeys = folderData.documentKeys || [];

            if (!documentKeys.includes(shortId)) {
                documentKeys.push(shortId);
                await fetch(`${dbBaseUrl}/echoWebDigestFolders/${folderKey}/documentKeys.json`, {
                    method: 'PUT',
                    headers: headers,
                    body: JSON.stringify(documentKeys)
                });
            }
        } else {
            // Create new folder for this host
            const folderShortId = generateShortId();
            const newFolder = {
                title: host,
                host: host,
                documentKeys: [shortId],
                category: "Auto-generated"
            };
            await fetch(`${dbBaseUrl}/echoWebDigestFolders/${folderShortId}.json`, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify(newFolder)
            });
        }

        console.log("Export digest and folder managed successfully:", shortId);
    } catch (e) {
        console.error("Failed to manage export digest/folder:", e);
    }
}

async function showExportModal(exportType) {
    // 1. Create Modal Overlay
    const overlay = document.createElement('div');
    overlay.id = 'webnote-export-modal-overlay';

    // 2. Pre-fill Title logic
    const defaultTitle = getReaderTitle();

    overlay.innerHTML = `
        <div class="webnote-export-modal">
            <h3>Export Note</h3>
            <div class="webnote-export-field">
                <label for="export-title">Title</label>
                <input type="text" id="export-title" value="${defaultTitle.replace(/"/g, '&quot;')}" placeholder="Enter title...">
            </div>
            <div class="webnote-export-field">
                <label for="export-tags">Tags (comma separated)</label>
                <input type="text" id="export-tags" placeholder="e.g. Finance, Tech, AI">
            </div>
            <div class="webnote-export-actions">
                <button id="export-cancel" class="webnote-export-btn-secondary">Cancel</button>
                <button id="export-save" class="webnote-export-btn-primary">Save</button>
            </div>
        </div>
        <style>
            #webnote-export-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 2147483647;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            .webnote-export-modal {
                background: white;
                padding: 24px;
                border-radius: 12px;
                width: 400px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                color: #333;
            }
            .webnote-export-modal h3 {
                margin: 0 0 16px 0;
                font-size: 1.25rem;
                font-weight: 600;
            }
            .webnote-export-field {
                margin-bottom: 16px;
            }
            .webnote-export-field label {
                display: block;
                margin-bottom: 6px;
                font-size: 0.875rem;
                font-weight: 500;
                color: #666;
            }
            .webnote-export-field input {
                width: 100%;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 6px;
                font-size: 1rem;
                box-sizing: border-box;
            }
            .webnote-export-field input:focus {
                border-color: #007bff;
                outline: none;
                box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
            }
            .webnote-export-actions {
                display: flex;
                justify-content: flex-end;
                gap: 12px;
                margin-top: 24px;
            }
            .webnote-export-btn-primary {
                background: #007bff;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 500;
            }
            .webnote-export-btn-secondary {
                background: #f8f9fa;
                color: #333;
                border: 1px solid #ddd;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 500;
            }
            .webnote-export-btn-primary:hover { background: #0069d9; }
            .webnote-export-btn-secondary:hover { background: #e2e6ea; }
        </style>
    `;

    document.body.appendChild(overlay);

    // 3. Button Listeners
    document.getElementById('export-cancel').onclick = () => overlay.remove();
    document.getElementById('export-save').onclick = async () => {
        const customTitle = document.getElementById('export-title').value;
        const tagsInput = document.getElementById('export-tags').value;
        const tags = tagsInput.split(',').map(t => t.trim()).filter(t => t !== "");

        overlay.remove();

        // 4. Trigger actual export
        if (exportType === 'local') {
            await downloadLocalMarkdown(customTitle, tags);
        } else if (exportType === 'drive') {
            await saveToGoogleDrive(customTitle, tags);
        } else if (exportType === 'lib') {
            await saveToLibrary(customTitle, tags);
        }
    };
}
