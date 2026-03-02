// sidepanel.js

document.addEventListener('DOMContentLoaded', () => {
    const notesList = document.getElementById('notes-list');
    const settingsBtn = document.getElementById('settings-btn');
    const toggleReaderBtn = document.getElementById('toggle-reader-btn');
    const addNoteBtn = document.getElementById('add-note-btn');
    const searchBtn = document.getElementById('search-btn');
    const searchBar = document.getElementById('search-bar');
    const searchInput = document.getElementById('search-input');
    const accountBtn = document.getElementById('account-btn');
    const accountPanel = document.getElementById('account-panel');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfoDiv = document.getElementById('user-info');
    const userAvatarImg = document.getElementById('user-avatar');
    const userEmailDiv = document.getElementById('user-email');
    const userNameDiv = document.getElementById('user-name');
    const saveDriveBtn = document.getElementById('save-drive-btn');

    let currentTabId = null;
    let currentUrl = null;
    let searchQuery = '';
    let isSearchOpen = false;

    const settingsPanel = document.getElementById('settings-panel');
    const patternsArea = document.getElementById('patterns');
    const saveBtn = document.getElementById('save-settings');
    const statusSpan = document.getElementById('status');
    let isSettingsOpen = false;
    let isAccountOpen = false;
    let currentUser = null;

    // Toggle Reader Mode
    toggleReaderBtn.addEventListener('click', async () => {
        if (currentTabId) {
            try {
                // Send toggle without force, allowing it to swap states
                await chrome.tabs.sendMessage(currentTabId, { action: "toggleReader" });
            } catch (e) {
                console.log("Error toggling reader:", e);
            }
        }
    });

    // Add Note Manually
    addNoteBtn.addEventListener('click', () => {
        const newNote = {
            id: Date.now(),
            title: 'Untitled Note',
            content: '',
            quote: '',
            date: Date.now(),
            tags: []
        };
        currentNotes.unshift(newNote);
        saveNotes();
        renderNotes();
        // Optionally scroll to top or focus?
        notesList.scrollTop = 0;
    });

    // Toggle Search
    searchBtn.addEventListener('click', () => {
        isSearchOpen = !isSearchOpen;
        searchBar.style.display = isSearchOpen ? 'block' : 'none';
        if (isSearchOpen) {
            searchInput.focus();
        } else {
            searchQuery = '';
            searchInput.value = '';
            renderNotes();
        }
        // Ensure settings are closed when search opens
        if (isSearchOpen) {
            isSettingsOpen = false;
            settingsPanel.style.display = 'none';
        }
    });

    // Search Input
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderNotes();
    });

    // Theme Switchers
    const themes = ['light', 'sepia', 'dark'];
    themes.forEach(theme => {
        const btn = document.getElementById(`theme-${theme}-btn`);
        if (btn) {
            btn.addEventListener('click', async () => {
                if (currentTabId) {
                    try {
                        await chrome.tabs.sendMessage(currentTabId, { action: "setTheme", theme: theme });
                    } catch (e) {
                        console.log("Error setting theme:", e);
                    }
                }
            });
        }
    });

    // Toggle Settings panel
    settingsBtn.addEventListener('click', () => {
        isSettingsOpen = !isSettingsOpen;
        settingsPanel.style.display = isSettingsOpen ? 'block' : 'none';

        if (isSettingsOpen) {
            // Load settings
            chrome.storage.sync.get(['urlPatterns', 'fbApiKey', 'fbDbUrl', 'fbProjectId', 'fbStorageBucket', 'fbStoragePath', 'reader_font', 'reader_font-size', 'reader_max-width'], (result) => {
                if (result.urlPatterns) {
                    patternsArea.value = result.urlPatterns.join('\n');
                } else {
                    patternsArea.value = '';
                }
                document.getElementById('fb-api-key').value = result.fbApiKey || '';
                document.getElementById('fb-db-url').value = result.fbDbUrl || '';
                document.getElementById('fb-project-id').value = result.fbProjectId || '';
                document.getElementById('fb-storage-bucket').value = result.fbStorageBucket || '';
                document.getElementById('fb-storage-path').value = result.fbStoragePath || '';

                // Reader Appearance
                if (result.reader_font) document.getElementById('reader-font-select').value = result.reader_font;
                if (result.reader_font_size) document.getElementById('reader-size-input').value = result.reader_font_size.replace('px', '');
                if (result.reader_max_width) {
                    const width = result.reader_max_width.replace('px', '');
                    document.getElementById('reader-width-input').value = width;
                    document.getElementById('reader-width-value').textContent = width + 'px';
                }
                document.getElementById('gd-folder-name').value = result.gdFolderName || 'WebNotes';
            });
            // Ensure search and account are closed when settings open
            isSearchOpen = false;
            searchBar.style.display = 'none';
            isAccountOpen = false;
            accountPanel.style.display = 'none';
        }
    });

    // Reader Width Range Listener
    const readerWidthInput = document.getElementById('reader-width-input');
    const readerWidthValue = document.getElementById('reader-width-value');
    if (readerWidthInput && readerWidthValue) {
        readerWidthInput.addEventListener('input', (e) => {
            readerWidthValue.textContent = e.target.value + 'px';
        });
    }

    // Toggle Account panel
    accountBtn.addEventListener('click', () => {
        isAccountOpen = !isAccountOpen;
        accountPanel.style.display = isAccountOpen ? 'block' : 'none';

        if (isAccountOpen) {
            checkAuthStatus();
            // Ensure search and settings are closed when account opens
            isSearchOpen = false;
            searchBar.style.display = 'none';
            isSettingsOpen = false;
            settingsPanel.style.display = 'none';
        }
    });

    // Login Logic
    loginBtn.addEventListener('click', () => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError) {
                console.error("Login failed:", chrome.runtime.lastError);
                return;
            }
            fetchUserInfo(token);
        });
    });

    // Logout Logic
    logoutBtn.addEventListener('click', () => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
            if (token) {
                chrome.identity.removeCachedAuthToken({ token: token }, () => {
                    // Also revoke from Google servers
                    fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
                    currentUser = null;
                    updateAuthUI(null);
                });
            }
        });
    });

    function checkAuthStatus() {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
            if (token) {
                fetchUserInfo(token);
            } else {
                updateAuthUI(null);
            }
        });
    }

    async function fetchUserInfo(token) {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const user = await response.json();
            currentUser = user;
            updateAuthUI(user);
        } catch (error) {
            console.error("Error fetching user info:", error);
            updateAuthUI(null);
        }
    }

    function updateAuthUI(user) {
        if (user) {
            loginBtn.style.display = 'none';
            logoutBtn.style.display = 'block';
            userInfoDiv.style.display = 'block';
            userAvatarImg.src = user.picture || '';
            userEmailDiv.textContent = user.email;
            userNameDiv.textContent = user.name;
        } else {
            loginBtn.style.display = 'flex';
            logoutBtn.style.display = 'none';
            userInfoDiv.style.display = 'none';
            userAvatarImg.src = '';
            userEmailDiv.textContent = '';
            userNameDiv.textContent = '';
        }
    }

    // Save Settings
    saveBtn.addEventListener('click', () => {
        const patterns = patternsArea.value.split('\n').filter(s => s.trim() !== '');
        const fbApiKey = document.getElementById('fb-api-key').value;
        const fbDbUrl = document.getElementById('fb-db-url').value;
        const fbProjectId = document.getElementById('fb-project-id').value;
        const fbStorageBucket = document.getElementById('fb-storage-bucket').value;
        const fbStoragePath = document.getElementById('fb-storage-path').value;

        const readerFont = document.getElementById('reader-font-select').value;
        const readerSize = document.getElementById('reader-size-input').value + 'px';
        const readerWidth = document.getElementById('reader-width-input').value + 'px';

        chrome.storage.sync.set({
            urlPatterns: patterns,
            fbApiKey: fbApiKey,
            fbDbUrl: fbDbUrl,
            fbProjectId: fbProjectId,
            fbStorageBucket: fbStorageBucket,
            fbStoragePath: fbStoragePath,
            'reader_font': readerFont,
            'reader_font-size': readerSize,
            'reader_font-size': readerSize,
            'reader_max-width': readerWidth,
            gdFolderName: document.getElementById('gd-folder-name').value || 'WebNotes'
        }, () => {
            statusSpan.textContent = 'Saved!';
            setTimeout(() => {
                statusSpan.textContent = '';
            }, 1500);
        });
    });

    // Function to load notes for a specific URL
    // List of notes for current URL
    let currentNotes = [];

    // Load notes
    async function loadNotesForUrl(url) {
        if (!url) return;
        const storageKey = `notes_v2_${url}`; // New key for array format
        const result = await chrome.storage.local.get([storageKey]);
        currentNotes = result[storageKey] || [];
        renderNotes();
    }

    // Save notes
    async function saveNotes() {
        if (!currentUrl) return;
        const storageKey = `notes_v2_${currentUrl}`;
        await chrome.storage.local.set({ [storageKey]: currentNotes });
    }

    // Render logic
    function renderNotes() {
        notesList.innerHTML = '';

        // Filter notes based on search query
        const filteredNotes = currentNotes.filter(note => {
            const q = searchQuery.toLowerCase();
            return (note.title && note.title.toLowerCase().includes(q)) ||
                (note.content && note.content.toLowerCase().includes(q)) ||
                (note.quote && note.quote.toLowerCase().includes(q));
        });

        if (filteredNotes.length === 0) {
            notesList.innerHTML = `
                <div style="color: #777; font-style: italic; text-align: center; margin-top: 50px;">
                    ${searchQuery ? 'No matching notes found.' : 'Select text in Reader Mode or click + to add a note.'}
                </div>`;
            return;
        }

        filteredNotes.forEach((note) => {
            const card = document.createElement('div');
            card.className = 'note-card';
            if (note.anchorId) {
                card.dataset.anchorId = note.anchorId;
            }
            card.innerHTML = `
                <div class="note-header">
                    <input type="text" class="note-title-input" value="${note.title || 'Untitled'}" placeholder="Title">
                </div>
                <div class="note-body">
                    <div class="note-user-content" contenteditable="true">${note.content || ''}</div>
                    ${note.quote ? `<blockquote class="note-quote">"${note.quote}"</blockquote>` : ''}
                </div>
                <div class="note-footer">
                    <span class="note-date">${new Date(note.date).toLocaleDateString()}</span>
                    <div class="note-actions">
                         <button class="delete-btn" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
                                <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/>
                            </svg>
                         </button>
                    </div>
                </div>
            `;

            // Title Edit Listener
            const input = card.querySelector('.note-title-input');
            input.addEventListener('input', (e) => {
                note.title = e.target.value;
                saveNotes();
            });

            // Content Edit Listener
            const contentDiv = card.querySelector('.note-user-content');
            contentDiv.addEventListener('input', (e) => {
                note.content = e.target.innerText; // or innerHTML if we want rich text support later
                saveNotes();
            });

            // Delete Listener
            const deleteBtn = card.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', () => {
                currentNotes = currentNotes.filter(n => n.id !== note.id);
                saveNotes();
                renderNotes();
            });

            notesList.appendChild(card);
        });
    }

    // Message Listener for Adding Notes
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'addNote') {
            const newNote = {
                id: Date.now(),
                title: request.title || 'New Note',
                content: '',
                quote: request.text,
                date: Date.now(),
                tags: [],
                anchorId: request.anchorId
            };

            // Only add if we are on the same URL context? 
            // The side panel is updated when tab activates. 
            // We should check if the message matches the current context or just add it.
            // Since sidepanel is one instance, we should check if currentUrl matches sender.tab.url
            if (sender.tab && sender.tab.url === currentUrl) {
                currentNotes.unshift(newNote); // Add to top
                saveNotes();
                renderNotes();
            }
        } else if (request.action === 'highlightNote') {
            const anchorId = request.anchorId;
            const targetCard = notesList.querySelector(`.note-card[data-anchor-id="${anchorId}"]`);

            if (targetCard) {
                // Clear previous highlights
                notesList.querySelectorAll('.note-card').forEach(c => c.classList.remove('active-sync'));

                // Add highlight
                targetCard.classList.add('active-sync');

                // Scroll into view
                targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    });

    // Initialize: Get current tab and setup
    async function init() {
        checkAuthStatus();
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            updateContext(tab.id, tab.url);
        }
    }

    // Update context when tab changes
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab) {
            updateContext(tab.id, tab.url);
        }
    });

    // Update context when URL changes in the active tab (e.g. navigation)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (tabId === currentTabId && changeInfo.status === 'complete') {
            updateContext(tabId, tab.url);
        }
    });


    async function updateContext(tabId, url) {
        currentTabId = tabId;
        currentUrl = url; // Use full URL for uniqueness, or hostname for shared notes

        // Load notes
        if (url) {
            await loadNotesForUrl(url);
        } else {
            notesList.innerHTML = '';
        }

        // Reader Mode is now handled by content.js based on patterns.
        // The sidepanel no longer forces Reader Mode on every tab update.
        /*
        if (tabId && url && !url.startsWith('chrome://')) {
            try {
                chrome.tabs.sendMessage(tabId, { action: "toggleReader", force: true })
                    .catch(err => {
                        console.log("Could not send toggleReader message:", err);
                    });
            } catch (e) {
                console.log("Error sending message", e);
            }
        }
        */
    }

    init();
});
