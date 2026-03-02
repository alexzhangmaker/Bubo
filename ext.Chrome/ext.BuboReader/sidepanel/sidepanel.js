// sidepanel.js for BuboReader

document.addEventListener('DOMContentLoaded', () => {
    // --- UI State & Tab Management ---
    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const target = tab.dataset.tab;
            document.getElementById(`tab-${target}`).classList.add('active');

            // Show/Hide toolbar based on tab
            const toolbar = document.getElementById('notes-toolbar');
            toolbar.style.display = (target === 'notes') ? 'flex' : 'none';
        });
    });

    // --- Shared Context ---
    let currentTabId = null;
    let currentUrl = null;
    let currentNotes = [];
    let siteSelectors = {};
    let excludedSites = [];

    // --- Notes Management (from webNote) ---
    const notesList = document.getElementById('notes-list');
    const addNoteBtn = document.getElementById('add-note-btn');
    const searchBtn = document.getElementById('search-btn');
    const searchBar = document.getElementById('search-bar');
    const searchInput = document.getElementById('search-input');
    const accountBtn = document.getElementById('account-btn');
    const accountPanel = document.getElementById('account-panel');

    let searchQuery = '';
    let isSearchOpen = false;

    addNoteBtn.addEventListener('click', () => {
        const newNote = { id: Date.now(), title: 'Untitled Note', content: '', quote: '', date: Date.now() };
        currentNotes.unshift(newNote);
        saveNotes();
        renderNotes();
    });

    searchBtn.addEventListener('click', () => {
        isSearchOpen = !isSearchOpen;
        searchBar.style.display = isSearchOpen ? 'block' : 'none';
        if (isSearchOpen) searchInput.focus();
        else { searchQuery = ''; searchInput.value = ''; renderNotes(); }
    });

    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderNotes();
    });

    accountBtn.addEventListener('click', () => {
        const panel = document.getElementById('account-panel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    async function loadNotesForUrl(url) {
        if (!url) return;
        const storageKey = `notes_v2_${url}`;
        const result = await chrome.storage.local.get([storageKey]);
        currentNotes = result[storageKey] || [];
        renderNotes();
    }

    async function saveNotes() {
        if (!currentUrl) return;
        const storageKey = `notes_v2_${currentUrl}`;
        await chrome.storage.local.set({ [storageKey]: currentNotes });
    }

    function renderNotes() {
        notesList.innerHTML = '';
        const filteredNotes = currentNotes.filter(n =>
            (n.title && n.title.toLowerCase().includes(searchQuery)) ||
            (n.content && n.content.toLowerCase().includes(searchQuery)) ||
            (n.quote && n.quote.toLowerCase().includes(searchQuery))
        );

        if (filteredNotes.length === 0) {
            notesList.innerHTML = `<div style="color: #777; font-style: italic; text-align: center; margin-top: 50px;">No notes found.</div>`;
            return;
        }

        filteredNotes.forEach(note => {
            const card = document.createElement('div');
            card.className = 'note-card'; // We'll need sidepanel.css to support this
            card.style.cssText = "background: #fff; padding: 12px; border-radius: 8px; margin-bottom: 12px; border: 1px solid #ddd;";
            card.innerHTML = `
                <input type="text" value="${note.title}" style="width:100%; border:none; border-bottom:1px solid #eee; font-weight:500; margin-bottom:8px;">
                <div contenteditable="true" style="font-size:14px; min-height:40px;">${note.content}</div>
                ${note.quote ? `<blockquote style="font-size:12px; color:#666; border-left:2px solid #ddd; padding-left:8px; margin:8px 0; font-style:italic;">"${note.quote}"</blockquote>` : ''}
            `;
            // Add listeners for editing and saving
            const titleInput = card.querySelector('input');
            titleInput.oninput = (e) => { note.title = e.target.value; saveNotes(); };
            const contentDiv = card.querySelector('div');
            contentDiv.oninput = (e) => { note.content = e.target.innerText; saveNotes(); };

            notesList.appendChild(card);
        });
    }

    // --- Site Configuration (from Crane) ---
    const configList = document.getElementById('configList');
    const siteDomain = document.getElementById('siteDomain');
    const contentSelector = document.getElementById('contentSelector');
    const addSelectorBtn = document.getElementById('addSelector');
    const detectSelectorBtn = document.getElementById('detectSelector');

    async function loadCraneConfig() {
        const result = await chrome.storage.local.get(['siteSelectors', 'excludedSites']);
        siteSelectors = result.siteSelectors || {};
        excludedSites = result.excludedSites || [];
        renderConfigList();
        renderExcludedSites();
    }

    function renderConfigList() {
        configList.innerHTML = Object.entries(siteSelectors).map(([domain, selector]) => `
            <div class="config-item">
                <div class="config-info">
                    <div class="config-domain">${domain}</div>
                    <div class="config-selector">${selector}</div>
                </div>
                <button class="delete-btn" data-domain="${domain}">✕</button>
            </div>
        `).join('') || '<div style="font-size:12px; color:#999;">No custom selectors</div>';

        configList.querySelectorAll('.delete-btn').forEach(btn => {
            btn.onclick = () => {
                delete siteSelectors[btn.dataset.domain];
                chrome.storage.local.set({ siteSelectors });
                renderConfigList();
            };
        });
    }

    addSelectorBtn.onclick = () => {
        const domain = siteDomain.value.trim();
        const selector = contentSelector.value.trim();
        if (domain && selector) {
            siteSelectors[domain] = selector;
            chrome.storage.local.set({ siteSelectors });
            renderConfigList();
            siteDomain.value = ''; contentSelector.value = '';
        }
    };

    detectSelectorBtn.onclick = async () => {
        if (!currentTabId) return;
        try {
            const response = await chrome.tabs.sendMessage(currentTabId, { action: 'detectSelector' });
            if (response && response.selector) contentSelector.value = response.selector;
        } catch (e) { console.error(e); }
    };

    function renderExcludedSites() {
        const list = document.getElementById('excludedSitesList');
        list.innerHTML = excludedSites.map(site => `
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-bottom:4px; background:#fff; padding:4px 8px; border-radius:4px;">
                <span>${site}</span>
                <button class="delete-btn" data-site="${site}">✕</button>
            </div>
        `).join('');
        list.querySelectorAll('.delete-btn').forEach(btn => {
            btn.onclick = () => {
                excludedSites = excludedSites.filter(s => s !== btn.dataset.site);
                chrome.storage.local.set({ excludedSites });
                renderExcludedSites();
            };
        });
    }

    document.getElementById('addExcludedSite').onclick = () => {
        const site = document.getElementById('excludeSite').value.trim();
        if (site && !excludedSites.includes(site)) {
            excludedSites.push(site);
            chrome.storage.local.set({ excludedSites });
            renderExcludedSites();
            document.getElementById('excludeSite').value = '';
        }
    };

    // --- Collect to Bubo ---
    const collectBtn = document.getElementById('collect-to-bubo');
    collectBtn.onclick = async () => {
        if (!currentTabId) return;
        collectBtn.disabled = true;
        collectBtn.innerText = '⏳ Collecting...';

        try {
            // 1. Get metadata from Content Script
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error("No active tab");

            // We need to trigger the content script to extract everything
            const response = await chrome.tabs.sendMessage(tab.id, { action: "extractMetadata" });
            if (!response) throw new Error("Failed to get metadata from page");

            // 2. POST to Bubo Backend
            const backendUrl = 'http://localhost:6565/api/urls'; // Default port from .env
            const apiRes = await fetch(backendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: tab.url,
                    title: response.title,
                    description: response.description,
                    image: response.image
                })
            });

            if (apiRes.ok) {
                collectBtn.innerText = '✅ Collected!';
                setTimeout(() => {
                    collectBtn.disabled = false;
                    collectBtn.innerText = '📥 Collect to Bubo';
                }, 2000);
            } else {
                const err = await apiRes.json();
                alert('Failed to save: ' + (err.error || apiRes.statusText));
                collectBtn.disabled = false;
                collectBtn.innerText = '📥 Collect to Bubo';
            }
        } catch (e) {
            console.error(e);
            alert('Error: ' + e.message);
            collectBtn.disabled = false;
            collectBtn.innerText = '📥 Collect to Bubo';
        }
    };

    // --- Settings & Cloud (from webNote) ---
    const saveSettingsBtn = document.getElementById('save-settings');
    const statusSpan = document.getElementById('status');

    saveSettingsBtn.onclick = () => {
        const patterns = document.getElementById('patterns').value.split('\n').filter(p => p.trim());
        const fbDbUrl = document.getElementById('fb-db-url').value;
        const fbStorageBucket = document.getElementById('fb-storage-bucket').value;
        const font = document.getElementById('reader-font-select').value;
        const size = document.getElementById('reader-size-input').value + 'px';
        const defaultScheme = document.getElementById('reader-scheme-select').value;

        const schemes = {
            light: {
                bg: document.getElementById('color-light-bg').value,
                fg: document.getElementById('color-light-fg').value
            },
            dark: {
                bg: document.getElementById('color-dark-bg').value,
                fg: document.getElementById('color-dark-fg').value
            },
            sepia: {
                bg: document.getElementById('color-sepia-bg').value,
                fg: document.getElementById('color-sepia-fg').value
            }
        };

        chrome.storage.sync.set({
            urlPatterns: patterns,
            fbDbUrl,
            fbStorageBucket,
            'reader_font': font,
            'reader_font-size': size,
            'reader_current_scheme': defaultScheme,
            'reader_schemes': schemes
        }, () => {
            statusSpan.textContent = 'Saved!';
            setTimeout(() => statusSpan.textContent = '', 2000);
        });
    };

    async function loadSettings() {
        const result = await chrome.storage.sync.get([
            'urlPatterns', 'fbDbUrl', 'fbStorageBucket', 'reader_font',
            'reader_font-size', 'reader_current_scheme', 'reader_schemes'
        ]);
        if (result.urlPatterns) document.getElementById('patterns').value = result.urlPatterns.join('\n');
        document.getElementById('fb-db-url').value = result.fbDbUrl || '';
        document.getElementById('fb-storage-bucket').value = result.fbStorageBucket || '';
        if (result.reader_font) document.getElementById('reader-font-select').value = result.reader_font;
        if (result['reader_font-size']) document.getElementById('reader-size-input').value = result['reader_font-size'].replace('px', '');
        if (result.reader_current_scheme) document.getElementById('reader-scheme-select').value = result.reader_current_scheme;

        if (result.reader_schemes) {
            const s = result.reader_schemes;
            if (s.light) {
                document.getElementById('color-light-bg').value = s.light.bg;
                document.getElementById('color-light-fg').value = s.light.fg;
            }
            if (s.dark) {
                document.getElementById('color-dark-bg').value = s.dark.bg;
                document.getElementById('color-dark-fg').value = s.dark.fg;
            }
            if (s.sepia) {
                document.getElementById('color-sepia-bg').value = s.sepia.bg;
                document.getElementById('color-sepia-fg').value = s.sepia.fg;
            }
        }
    }

    // --- Context Updates ---
    async function updateContext(tabId, url) {
        currentTabId = tabId;
        currentUrl = url;
        if (url) {
            await loadNotesForUrl(url);
            const hostname = new URL(url).hostname;
            document.getElementById('currentSiteInfo').innerHTML = `
                <div style="font-weight:500;">${hostname}</div>
                <div style="font-size:12px; color:#666;">${siteSelectors[hostname] || 'No specific selector'}</div>
            `;
        }
    }

    // --- Initialization ---
    async function init() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) updateContext(tab.id, tab.url);

        await loadCraneConfig();
        await loadSettings();

        chrome.tabs.onActivated.addListener(async (activeInfo) => {
            const tab = await chrome.tabs.get(activeInfo.tabId);
            if (tab) updateContext(tab.id, tab.url);
        });

        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (tabId === currentTabId && changeInfo.status === 'complete') updateContext(tabId, tab.url);
        });

        // Listen for new notes from content.js
        chrome.runtime.onMessage.addListener((request, sender) => {
            if (request.action === 'addNote' && sender.tab && sender.tab.url === currentUrl) {
                const newNote = { id: Date.now(), title: request.title || 'New Note', content: '', quote: request.text, date: Date.now() };
                currentNotes.unshift(newNote);
                saveNotes();
                renderNotes();
            }
        });
    }

    init();
});
