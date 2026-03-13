const DB_NAME = 'BetterYouTubeDB';
const DB_VERSION = 5; // Upgraded for playlists support
const STORES = {
    SETTINGS: 'settings',
    FOLDERS: 'folders',
    VIDEOS: 'videos',
    HISTORY: 'history',
    CHANNELS: 'channels',
    PLAYLISTS: 'playlists'
};

// --- Database Layer ---
let dbConnection = null;

async function openDB() {
    if (dbConnection) return dbConnection;

    return new Promise((resolve, reject) => {
        console.log(`Opening DB: ${DB_NAME} v${DB_VERSION}`);
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            console.log('DB Upgrade needed');
            const db = event.target.result;
            // Existing settings store
            if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
                console.log(`Creating store: ${STORES.SETTINGS}`);
                db.createObjectStore(STORES.SETTINGS);
            }
            // New folder store
            if (!db.objectStoreNames.contains(STORES.FOLDERS)) {
                console.log(`Creating store: ${STORES.FOLDERS}`);
                db.createObjectStore(STORES.FOLDERS, { keyPath: 'id', autoIncrement: true });
            }
            // New video store
            if (!db.objectStoreNames.contains(STORES.VIDEOS)) {
                console.log(`Creating store: ${STORES.VIDEOS}`);
                const store = db.createObjectStore(STORES.VIDEOS, { keyPath: 'id', autoIncrement: true });
                store.createIndex('folderId', 'folderId', { unique: false });
            }
            // New channel store
            if (!db.objectStoreNames.contains(STORES.CHANNELS)) {
                console.log(`Creating store: ${STORES.CHANNELS}`);
                db.createObjectStore(STORES.CHANNELS, { keyPath: 'id', autoIncrement: true });
            }
            // New playlist store
            if (!db.objectStoreNames.contains(STORES.PLAYLISTS)) {
                console.log(`Creating store: ${STORES.PLAYLISTS}`);
                db.createObjectStore(STORES.PLAYLISTS, { keyPath: 'id', autoIncrement: true });
            }
            // Sync with background stores
            if (!db.objectStoreNames.contains(STORES.HISTORY)) {
                console.log(`Creating store: ${STORES.HISTORY}`);
                db.createObjectStore(STORES.HISTORY, { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = (event) => {
            dbConnection = event.target.result;
            dbConnection.onversionchange = () => {
                dbConnection.close();
                dbConnection = null;
                console.log('DB connection closed due to version change');
                window.location.reload();
            };
            resolve(dbConnection);
        };

        request.onerror = (event) => {
            console.error('DB Open Error:', event.target.error);
            reject(event.target.error);
        };

        request.onblocked = () => {
            console.warn('DB Upgrade Blocked: Please close other tabs/instances of the extension.');
            alert('A database update is pending. Please close other BetterYouTube tabs or reload the extension.');
        };
    });
}

// DB Helpers
async function performTransaction(storeNames, mode, action) {
    const db = await openDB();
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];

    // Safety check: verify all stores exist
    for (const name of names) {
        if (!db.objectStoreNames.contains(name)) {
            console.error(`Store "${name}" not found in DB v${db.version}. Current stores:`, db.objectStoreNames);
            throw new Error(`Object store "${name}" not found. You may need to reset the extension database.`);
        }
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeNames, mode);
        const stores = Array.isArray(storeNames) ?
            storeNames.map(name => transaction.objectStore(name)) :
            transaction.objectStore(storeNames);

        const request = action(stores);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

const db = {
    get: (store, key) => performTransaction(store, 'readonly', s => s.get(key)),
    put: (store, value, key) => performTransaction(store, 'readwrite', s => key ? s.put(value, key) : s.put(value)),
    getAll: (store) => performTransaction(store, 'readonly', s => s.getAll()),
    delete: (store, key) => performTransaction(store, 'readwrite', s => s.delete(key)),
    getVideosInFolder: (folderId) => performTransaction(STORES.VIDEOS, 'readonly', s => s.index('folderId').getAll(folderId)),
};

// --- DOM Elements ---
const els = {
    folderList: document.getElementById('folder-list'),
    addCurrentBtn: document.getElementById('add-current-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    closeModal: document.querySelector('.close-modal'),
    userEmail: document.getElementById('user-email'),
    socketDot: document.getElementById('socket-status'),
    keywordInput: document.getElementById('keyword-input'),
    addKeywordBtn: document.getElementById('add-keyword'),
    keywordList: document.getElementById('keyword-list'),
    exportBtn: document.getElementById('export-json'),
    importTrigger: document.getElementById('import-trigger'),
    importInput: document.getElementById('import-json')
};

// --- UI Logic ---

// Modal Toggle
els.settingsBtn.onclick = () => els.settingsModal.classList.add('active');
els.closeModal.onclick = () => els.settingsModal.classList.remove('active');
window.onclick = (e) => { if (e.target === els.settingsModal) els.settingsModal.classList.remove('active'); };

// Initialization
async function init() {
    await ensureDefaultFolder();
    renderNavigator();
    loadSettings();
    updateIdentity();
}

async function ensureDefaultFolder() {
    const folders = await db.getAll(STORES.FOLDERS);
    if (folders.length === 0) {
        // Create default folder as expanded
        await db.put(STORES.FOLDERS, { name: 'My Favorites', order: 0, collapsed: false });
    }
}

// Rendering
async function renderNavigator() {
    const folders = await db.getAll(STORES.FOLDERS);
    const channels = await db.getAll(STORES.CHANNELS);
    const playlists = await db.getAll(STORES.PLAYLISTS);

    // Combine and sort by order
    const items = [
        ...folders.map(f => ({ ...f, type: 'folder' })),
        ...channels.map(c => ({ ...c, type: 'channel' })),
        ...playlists.map(p => ({ ...p, type: 'playlist' }))
    ];
    items.sort((a, b) => (a.order || 0) - (b.order || 0));

    els.folderList.innerHTML = '';

    if (items.length === 0) {
        els.folderList.innerHTML = `<div class="empty-state"><p>No collections yet. Click the icon below to add current content.</p></div>`;
        return;
    }

    for (const item of items) {
        try {
            if (item.type === 'folder') {
                const folderEl = createFolderUI(item);
                els.folderList.appendChild(folderEl);

                if (!item.collapsed) {
                    const videos = await db.getVideosInFolder(item.id);
                    const videoListEl = folderEl.querySelector('.video-list');
                    videos.forEach(video => {
                        videoListEl.appendChild(createVideoUI(video));
                    });
                }
            } else if (item.type === 'channel') {
                const channelEl = createChannelUI(item);
                els.folderList.appendChild(channelEl);
            } else if (item.type === 'playlist') {
                const playlistEl = createPlaylistUI(item);
                els.folderList.appendChild(playlistEl);
            }
        } catch (e) {
            console.error('Error rendering item:', item, e);
        }
    }
}

function createFolderUI(folder) {
    const div = document.createElement('div');
    div.className = `folder-item ${folder.collapsed ? 'collapsed' : ''}`;
    div.draggable = true;
    div.dataset.id = folder.id;

    div.innerHTML = `
        <div class="folder-header">
            <svg class="folder-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
            <span class="folder-title">${folder.name}</span>
            <div class="item-actions">
                <button class="icon-btn delete-folder" title="Delete Folder">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>
        <div class="video-list"></div>
    `;

    // Folder Interaction: Single open logic
    div.querySelector('.folder-header').onclick = async (e) => {
        if (e.target.closest('.item-actions')) return;

        const folders = await db.getAll(STORES.FOLDERS);
        const willBeExpanded = folder.collapsed; // If it was collapsed, it will now expand

        for (const f of folders) {
            if (f.id === folder.id) {
                f.collapsed = !willBeExpanded;
            } else if (willBeExpanded) {
                // If we are expanding one, collapse all others
                f.collapsed = true;
            }
            await db.put(STORES.FOLDERS, f);
        }
        renderNavigator();
    };

    // Delete Folder
    div.querySelector('.delete-folder').onclick = async () => {
        if (confirm(`Delete folder "${folder.name}" and all its videos?`)) {
            // Delete associated videos
            const videos = await db.getVideosInFolder(folder.id);
            for (const v of videos) await db.delete(STORES.VIDEOS, v.id);
            // Delete folder
            await db.delete(STORES.FOLDERS, folder.id);
            renderNavigator();
        }
    };

    // Drag and Drop
    div.ondragstart = (e) => {
        e.dataTransfer.setData('source-id', folder.id);
        e.dataTransfer.setData('source-type', 'folder');
        div.classList.add('dragging');
    };
    div.ondragend = () => div.classList.remove('dragging');
    div.ondragover = (e) => e.preventDefault();
    div.ondrop = async (e) => {
        e.preventDefault();
        const sourceId = parseInt(e.dataTransfer.getData('source-id'));
        const sourceType = e.dataTransfer.getData('source-type');

        if (sourceType === 'folder' && sourceId === folder.id) return;

        await reorderItems(sourceId, sourceType, folder.id, 'folder');
        renderNavigator();
    };

    return div;
}

function createVideoUI(video) {
    const div = document.createElement('div');
    div.className = 'video-item-wrapper';

    // Extract thumbnail
    const videoId = video.url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1];
    const thumbUrl = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : '';

    div.innerHTML = `
        <a class="video-item" href="${video.url}" target="_blank">
            <img class="video-thumbnail" src="${thumbUrl}" onerror="this.src='../icons/icon48.png'">
            <div class="video-title" title="${video.title}">${video.title}</div>
        </a>
        <div class="item-actions">
            <button class="icon-btn edit-video" title="Edit Title">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="icon-btn delete-video" title="Delete Bookmark">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
    `;

    // Edit Title
    div.querySelector('.edit-video').onclick = async () => {
        const newTitle = prompt('Edit title:', video.title);
        if (newTitle && newTitle.trim()) {
            video.title = newTitle.trim();
            await db.put(STORES.VIDEOS, video);
            renderNavigator();
        }
    };

    // Delete Video
    div.querySelector('.delete-video').onclick = async () => {
        if (confirm('Delete this bookmark?')) {
            await db.delete(STORES.VIDEOS, video.id);
            renderNavigator();
        }
    };

    return div;
}

function createChannelUI(channel) {
    const div = document.createElement('div');
    div.className = 'channel-item';
    div.draggable = true;
    div.dataset.id = channel.id;

    div.innerHTML = `
        <div class="channel-header">
            <svg class="channel-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08s5.97 1.09 6 3.08c-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
            <span class="channel-title">${channel.name}</span>
            <div class="item-actions">
                <button class="icon-btn delete-channel" title="Remove Channel">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>
    `;

    // Navigation
    div.querySelector('.channel-header').onclick = (e) => {
        if (e.target.closest('.item-actions')) return;
        window.open(channel.url, '_blank');
    };

    // Delete
    div.querySelector('.delete-channel').onclick = async () => {
        if (confirm(`Remove channel "${channel.name}"?`)) {
            await db.delete(STORES.CHANNELS, channel.id);
            renderNavigator();
        }
    };

    // Drag and Drop
    div.ondragstart = (e) => {
        e.dataTransfer.setData('source-id', channel.id);
        e.dataTransfer.setData('source-type', 'channel');
        div.classList.add('dragging');
    };
    div.ondragend = () => div.classList.remove('dragging');
    div.ondragover = (e) => e.preventDefault();
    div.ondrop = async (e) => {
        e.preventDefault();
        const sourceId = parseInt(e.dataTransfer.getData('source-id'));
        const sourceType = e.dataTransfer.getData('source-type');

        if (sourceType === 'channel' && sourceId === channel.id) return;

        await reorderItems(sourceId, sourceType, channel.id, 'channel');
        renderNavigator();
    };

    return div;
}

function createPlaylistUI(playlist) {
    const div = document.createElement('div');
    div.className = 'playlist-item';
    div.draggable = true;
    div.dataset.id = playlist.id;

    div.innerHTML = `
        <div class="playlist-header">
            <svg class="playlist-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-4V3h4v10zm-8-3H7V3h4v7zm-8 3h4V3H3v10zm0 8h16v-2H3v2zm0-4h16v-2H3v2z"/></svg>
            <span class="playlist-title">${playlist.name}</span>
            <div class="item-actions">
                <button class="icon-btn delete-playlist" title="Remove Playlist">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>
    `;

    // Navigation
    div.querySelector('.playlist-header').onclick = (e) => {
        if (e.target.closest('.item-actions')) return;
        window.open(playlist.url, '_blank');
    };

    // Delete
    div.querySelector('.delete-playlist').onclick = async () => {
        if (confirm(`Remove playlist "${playlist.name}"?`)) {
            await db.delete(STORES.PLAYLISTS, playlist.id);
            renderNavigator();
        }
    };

    // Drag and Drop
    div.ondragstart = (e) => {
        e.dataTransfer.setData('source-id', playlist.id);
        e.dataTransfer.setData('source-type', 'playlist');
        div.classList.add('dragging');
    };
    div.ondragend = () => div.classList.remove('dragging');
    div.ondragover = (e) => e.preventDefault();
    div.ondrop = async (e) => {
        e.preventDefault();
        const sourceId = parseInt(e.dataTransfer.getData('source-id'));
        const sourceType = e.dataTransfer.getData('source-type');

        if (sourceType === 'playlist' && sourceId === playlist.id) return;

        await reorderItems(sourceId, sourceType, playlist.id, 'playlist');
        renderNavigator();
    };

    return div;
}

async function reorderItems(sourceId, sourceType, targetId, targetType) {
    const folders = await db.getAll(STORES.FOLDERS);
    const channels = await db.getAll(STORES.CHANNELS);
    const playlists = await db.getAll(STORES.PLAYLISTS);

    let allItems = [
        ...folders.map(f => ({ ...f, type: 'folder' })),
        ...channels.map(c => ({ ...c, type: 'channel' })),
        ...playlists.map(p => ({ ...p, type: 'playlist' }))
    ];
    allItems.sort((a, b) => (a.order || 0) - (b.order || 0));

    const sourceIdx = allItems.findIndex(i => i.id === sourceId && i.type === sourceType);
    const targetIdx = allItems.findIndex(i => i.id === targetId && i.type === targetType);

    if (sourceIdx === -1 || targetIdx === -1) return;

    const [moved] = allItems.splice(sourceIdx, 1);
    allItems.splice(targetIdx, 0, moved);

    for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i];
        let store;
        switch (item.type) {
            case 'folder': store = STORES.FOLDERS; break;
            case 'channel': store = STORES.CHANNELS; break;
            case 'playlist': store = STORES.PLAYLISTS; break;
        }
        const updatedItem = { ...item };
        delete updatedItem.type;
        updatedItem.order = i;
        await db.put(store, updatedItem);
    }
}

// Add Current Video or Channel or Playlist
els.addCurrentBtn.onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const url = tab.url;
    const title = tab.title;

    // Detect if it's a playlist (url contains list=)
    const isPlaylist = url.includes('youtube.com/playlist?list=');

    // Detect if it's a channel
    const isChannel = url.includes('youtube.com/@') ||
        url.includes('youtube.com/channel/') ||
        url.includes('youtube.com/c/') ||
        url.includes('youtube.com/user/');

    const isVideo = url.includes('youtube.com/watch');

    if (isPlaylist) {
        const playlists = await db.getAll(STORES.PLAYLISTS);
        const listParam = new URL(url).searchParams.get('list');
        const simplifiedUrl = `https://www.youtube.com/playlist?list=${listParam}`;

        if (playlists.some(p => p.url.includes(listParam))) {
            alert('This playlist is already bookmarked!');
            return;
        }

        const folders = await db.getAll(STORES.FOLDERS);
        const channels = await db.getAll(STORES.CHANNELS);
        const maxOrder = [...folders, ...channels, ...playlists].reduce((max, i) => Math.max(max, i.order || 0), -1);

        await db.put(STORES.PLAYLISTS, {
            name: title.replace(' - YouTube', '').trim(),
            url: simplifiedUrl,
            order: maxOrder + 1
        });
        renderNavigator();
    } else if (isChannel) {
        const channels = await db.getAll(STORES.CHANNELS);
        if (channels.some(c => c.url === url)) {
            alert('This channel is already bookmarked!');
            return;
        }

        const folders = await db.getAll(STORES.FOLDERS);
        const playlists = await db.getAll(STORES.PLAYLISTS);
        const maxOrder = [...folders, ...channels, ...playlists].reduce((max, i) => Math.max(max, i.order || 0), -1);

        await db.put(STORES.CHANNELS, {
            name: title.replace(' - YouTube', '').trim(),
            url: url,
            order: maxOrder + 1
        });
        renderNavigator();
    } else if (isVideo) {
        const folders = await db.getAll(STORES.FOLDERS);

        // Find currently expanded folder
        let targetFolder = folders.find(f => !f.collapsed);

        if (!targetFolder) {
            targetFolder = folders[0];
            if (!targetFolder) {
                await ensureDefaultFolder();
                const newFolders = await db.getAll(STORES.FOLDERS);
                targetFolder = newFolders[0];
            }
            targetFolder.collapsed = false;
            await db.put(STORES.FOLDERS, targetFolder);
        }

        const existingVideos = await db.getVideosInFolder(targetFolder.id);
        if (existingVideos.some(v => v.url === url)) {
            alert('This video is already in the collection!');
            return;
        }

        await db.put(STORES.VIDEOS, {
            folderId: targetFolder.id,
            url: url,
            title: title,
            timestamp: Date.now()
        });

        renderNavigator();
    } else {
        alert('Please open a YouTube video, channel, or playlist page first!');
    }
};

// Create Folder
document.getElementById('create-folder-btn').onclick = async () => {
    const name = prompt('Enter folder name:', 'New Collection');
    if (name && name.trim()) {
        const folders = await db.getAll(STORES.FOLDERS);
        // If this is the first one being created, make it expanded
        const maxOrder = folders.reduce((max, f) => Math.max(max, f.order), -1);
        const shouldBeExpanded = folders.length === 0;

        await db.put(STORES.FOLDERS, {
            name: name.trim(),
            order: maxOrder + 1,
            collapsed: !shouldBeExpanded
        });
        renderNavigator();
    }
};

// --- Settings Logic ---
async function loadSettings() {
    const keywords = await db.get(STORES.SETTINGS, 'keywords') || [];
    els.keywordList.innerHTML = '';
    keywords.forEach(addTagToUI);

    const filters = await db.get(STORES.SETTINGS, 'filters') || { adult: true };
    document.getElementById('filter-adult').checked = filters.adult;
}

function addTagToUI(keyword) {
    const li = document.createElement('li');
    li.className = 'tag';
    li.innerHTML = `${keyword} <span class="remove">&times;</span>`;
    els.keywordList.appendChild(li);

    li.querySelector('.remove').onclick = async () => {
        const current = await db.get(STORES.SETTINGS, 'keywords') || [];
        await db.put(STORES.SETTINGS, current.filter(k => k !== keyword), 'keywords');
        li.remove();
        chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED' });
    };
}

els.addKeywordBtn.onclick = async () => {
    const val = els.keywordInput.value.trim();
    if (val) {
        const current = await db.get(STORES.SETTINGS, 'keywords') || [];
        if (!current.includes(val)) {
            current.push(val);
            await db.put(STORES.SETTINGS, current, 'keywords');
            addTagToUI(val);
            els.keywordInput.value = '';
            chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED' });
        }
    }
};

document.getElementById('filter-adult').onchange = async (e) => {
    const filters = await db.get(STORES.SETTINGS, 'filters') || {};
    filters.adult = e.target.checked;
    await db.put(STORES.SETTINGS, filters, 'filters');
    chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED' });
};

// Data Portability
els.exportBtn.onclick = async () => {
    const folders = await db.getAll(STORES.FOLDERS);
    const videos = await db.getAll(STORES.VIDEOS);
    const settings = {};
    const keys = ['keywords', 'filters', 'serverUrl'];
    for (const k of keys) settings[k] = await db.get(STORES.SETTINGS, k);

    const data = JSON.stringify({ folders, videos, settings }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `better_youtube_backup_${Date.now()}.json`;
    a.click();
};

els.importTrigger.onclick = () => els.importInput.click();
els.importInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
            const data = JSON.parse(event.target.result);
            // Clear and Restore
            const stores = [STORES.FOLDERS, STORES.VIDEOS, STORES.SETTINGS];
            for (const s of stores) {
                await performTransaction(s, 'readwrite', store => store.clear());
            }

            for (const f of data.folders || []) await db.put(STORES.FOLDERS, f);
            for (const v of data.videos || []) await db.put(STORES.VIDEOS, v);
            if (data.settings) {
                for (const [k, v] of Object.entries(data.settings)) await db.put(STORES.SETTINGS, v, k);
            }
            window.location.reload();
        };
        reader.readAsText(file);
    }
};

// Helper Identity
function updateIdentity() {
    chrome.runtime.sendMessage({ type: 'GET_IDENTITY' }, (info) => {
        if (info && info.email) els.userEmail.innerText = info.email;
    });
}

// Socket Status
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SOCKET_STATUS') {
        els.socketDot.className = `status-dot ${msg.status}`;
    }
});

init();
