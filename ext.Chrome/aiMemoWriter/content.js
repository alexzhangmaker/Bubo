/**
 * DeepSeek AIHelper Content Script
 * Injects a sticky toolbar and handles copy-to-save workflow with Modal UI.
 */

(function () {
    'use strict';

    let saveButton = null;
    let statusIndicator = null;
    let currentModal = null;

    // Initialize the toolbar
    function initToolbar() {
        if (document.getElementById('ai-helper-toolbar')) return;

        const toolbar = document.createElement('div');
        toolbar.id = 'ai-helper-toolbar';
        toolbar.className = 'ai-helper-toolbar';

        statusIndicator = document.createElement('div');
        statusIndicator.className = 'ai-helper-status ready'; // Always green now

        const label = document.createElement('span');
        label.className = 'ai-helper-label';
        label.innerText = 'aiMemoWriter';

        saveButton = document.createElement('button');
        saveButton.className = 'ai-helper-save-btn';
        saveButton.innerText = 'Save as MD';
        saveButton.disabled = false; // Always enabled

        saveButton.onclick = () => openEditModal();

        toolbar.appendChild(statusIndicator);
        toolbar.appendChild(label);
        toolbar.appendChild(saveButton);
        document.body.appendChild(toolbar);
    }

    async function openEditModal() {
        if (currentModal) return;

        let clipboardContent = "";
        try {
            clipboardContent = await navigator.clipboard.readText();
        } catch (e) {
            console.error('Failed to read clipboard', e);
        }

        const overlay = document.createElement('div');
        overlay.className = 'ai-modal-overlay';
        currentModal = overlay;

        const now = new Date();
        const defaultTitle = `DeepSeek Chat ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

        overlay.innerHTML = `
            <div class="ai-modal">
                <h3>Save to BuboMemoMgr</h3>
                <div class="field">
                    <label>Title</label>
                    <input type="text" id="ai-title" value="${defaultTitle}">
                </div>
                <div class="field">
                    <label>Tags (comma separated)</label>
                    <input type="text" id="ai-tags" placeholder="ai, research, deepseek">
                </div>
                <div class="field">
                    <label>Content Preview</label>
                    <div class="preview">${clipboardContent || '<i>Clipboard is empty! Copy something first.</i>'}</div>
                </div>
                <div class="ai-modal-actions">
                    <button class="ai-btn-cancel" id="ai-cancel">Cancel</button>
                    <button class="ai-btn-confirm" id="ai-confirm" ${!clipboardContent ? 'disabled' : ''}>Confirm Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('ai-cancel').onclick = () => {
            overlay.remove();
            currentModal = null;
        };

        document.getElementById('ai-confirm').onclick = async () => {
            const title = document.getElementById('ai-title').value;
            const tags = document.getElementById('ai-tags').value;
            const confirmBtn = document.getElementById('ai-confirm');

            confirmBtn.disabled = true;
            confirmBtn.innerText = 'Saving...';

            try {
                const success = await submitToBubo(title, tags, clipboardContent);
                if (success) {
                    overlay.remove();
                    currentModal = null;
                    showToast('Successfully saved to cloud!');
                } else {
                    confirmBtn.disabled = false;
                    confirmBtn.innerText = 'Confirm Save';
                }
            } catch (e) {
                alert('Failed to save: ' + e.message);
                confirmBtn.disabled = false;
                confirmBtn.innerText = 'Confirm Save';
            }
        };
    }

    async function submitToBubo(title, tags, content) {
        const result = await chrome.storage.local.get(['bubo_api_url']);
        const apiUrl = result.bubo_api_url;

        if (!apiUrl) {
            alert('Please configure BuboMemoMgr API URL in the extension side panel.');
            return false;
        }

        // Create a pseudo-Markdown file content
        const fullContent = `---\ntitle: ${title}\ntags: ${tags}\ndate: ${new Date().toISOString()}\n---\n\n${content}`;
        const blob = new Blob([fullContent], { type: 'text/markdown' });
        const fileName = `${title.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_')}.md`;

        const formData = new FormData();
        formData.append('file', blob, fileName);
        formData.append('title', title);
        formData.append('tags', tags);

        try {
            const response = await fetch(`${apiUrl}/api/file`, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                return true;
            } else {
                const errData = await response.json();
                throw new Error(errData.error || 'Server responded with error');
            }
        } catch (e) {
            console.error('Upload error:', e);
            throw e;
        }
    }

    function showToast(msg) {
        const toast = document.createElement('div');
        toast.style.cssText = "position:fixed; bottom:80px; right:20px; background:#10b981; color:white; padding:10px 20px; border-radius:10px; z-index:2147483647; font-size:14px; box-shadow:0 4px 12px rgba(0,0,0,0.2); transition: opacity 0.5s;";
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    // Initial load
    initToolbar();

    // Check again if SPA navigation happens
    const observer = new MutationObserver(() => {
        if (!document.getElementById('ai-helper-toolbar')) {
            initToolbar();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();
