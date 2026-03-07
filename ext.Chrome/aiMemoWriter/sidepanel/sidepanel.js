// sidepanel.js for aiMemoWriter
document.addEventListener('DOMContentLoaded', () => {
    // Nav Elements
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    const header = document.getElementById('app-header');

    // Home & Bookmarks Elements
    const openHomeBtn = document.getElementById('open-home-btn');
    const openBookmarksBtn = document.getElementById('open-bookmarks-btn');

    // Memo Elements
    const memoTitle = document.getElementById('memo-title');
    const memoTags = document.getElementById('memo-tags');
    const memoContent = document.getElementById('memo-content');
    const saveMemoBtn = document.getElementById('save-memo-btn');
    const memoStatus = document.getElementById('memo-status');

    // Settings Elements
    const apiUrlInput = document.getElementById('api-url');
    const saveConfigBtn = document.getElementById('save-config-btn');
    const configStatus = document.getElementById('config-status');

    // --- Navigation ---
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetViewId = item.getAttribute('data-view');
            switchView(targetViewId);
        });
    });

    function switchView(viewId) {
        // Update Nav UI
        navItems.forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-view') === viewId);
        });

        // Update Content UI
        views.forEach(view => {
            view.classList.toggle('active', view.id === viewId);
        });

        // Update Header
        const viewNames = {
            'view-home': 'Home',
            'view-bookmarks': 'Bookmarks',
            'view-memo': 'Write Memo',
            'view-settings': 'Settings'
        };
        header.innerText = `aiMemoWriter - ${viewNames[viewId] || ''}`;
    }

    // --- Load Config ---
    chrome.storage.local.get(['bubo_api_url'], (result) => {
        if (result.bubo_api_url) {
            apiUrlInput.value = result.bubo_api_url;
        }
    });

    // --- Actions ---

    // Open External Tabs
    openHomeBtn.onclick = () => {
        chrome.tabs.create({ url: 'http://localhost:3301/appMemoKeeper.html' });
    };

    openBookmarksBtn.onclick = () => {
        chrome.tabs.create({ url: 'http://localhost:6565/bookmarks/index.html' });
    };

    // Save Configuration
    saveConfigBtn.onclick = () => {
        const url = apiUrlInput.value.trim().replace(/\/$/, '');
        chrome.storage.local.set({ bubo_api_url: url }, () => {
            configStatus.innerText = '✅ Settings Saved';
            configStatus.style.color = '#10b981';
            setTimeout(() => { configStatus.innerText = ''; }, 3000);
        });
    };

    // Save Memo
    saveMemoBtn.onclick = async () => {
        const title = memoTitle.value.trim();
        const tags = memoTags.value.trim();
        const content = memoContent.value.trim();

        if (!content) {
            showStatus(memoStatus, '❌ Content is empty!', '#ef4444');
            return;
        }

        saveMemoBtn.disabled = true;
        showStatus(memoStatus, '⏳ Saving...', '#6366f1');

        try {
            const success = await submitToBubo(title, tags, content);
            if (success) {
                showStatus(memoStatus, '✅ Memo Saved!', '#10b981');
                // Clear form
                memoTitle.value = '';
                memoTags.value = '';
                memoContent.value = '';
            }
        } catch (e) {
            showStatus(memoStatus, `❌ Error: ${e.message}`, '#ef4444');
        } finally {
            saveMemoBtn.disabled = false;
        }
    };

    async function submitToBubo(title, tags, content) {
        const result = await chrome.storage.local.get(['bubo_api_url']);
        const apiUrl = result.bubo_api_url;

        if (!apiUrl) {
            throw new Error('API URL not configured in Settings');
        }

        const finalTitle = title || `Manual Memo ${new Date().toLocaleString()}`;
        const fileName = `${finalTitle.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_')}.md`;

        const fullMarkdown = `---\ntitle: ${finalTitle}\ntags: ${tags}\ndate: ${new Date().toISOString()}\n---\n\n${content}`;
        const blob = new Blob([fullMarkdown], { type: 'text/markdown' });

        const formData = new FormData();
        formData.append('file', blob, fileName);
        formData.append('title', finalTitle);
        formData.append('tags', tags);

        const response = await fetch(`${apiUrl}/api/file`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Server error');
        }
        return true;
    }

    function showStatus(elem, msg, color) {
        elem.innerText = msg;
        elem.style.color = color;
        if (msg.includes('✅') || msg.includes('❌')) {
            setTimeout(() => { elem.innerText = ''; }, 3000);
        }
    }

    // Set initial header title
    switchView('view-memo');
});
