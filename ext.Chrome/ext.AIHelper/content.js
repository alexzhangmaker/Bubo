/**
 * DeepSeek AIHelper Content Script
 * Injects a sticky toolbar and handles copy-to-save workflow.
 */

(function () {
    'use strict';

    let saveButton = null;
    let statusIndicator = null;
    let lastCopiedTime = 0;

    // Initialize the toolbar
    function initToolbar() {
        if (document.getElementById('ai-helper-toolbar')) return;

        const toolbar = document.createElement('div');
        toolbar.id = 'ai-helper-toolbar';
        toolbar.className = 'ai-helper-toolbar';

        const label = document.createElement('span');
        label.className = 'ai-helper-label';
        label.innerText = 'AI Helper';

        statusIndicator = document.createElement('div');
        statusIndicator.className = 'ai-helper-status';

        saveButton = document.createElement('button');
        saveButton.className = 'ai-helper-save-btn';
        saveButton.innerText = 'Save as MD';
        saveButton.disabled = true;
        saveButton.title = 'Copy AI content first to enable saving';

        saveButton.onclick = async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    saveAsMarkdown(text);
                    resetButton();
                } else {
                    alert('Clipboard is empty. Please copy AI content first.');
                }
            } catch (err) {
                console.error('Failed to read clipboard:', err);
                alert('Extension needs clipboard permission to function.');
            }
        };

        toolbar.appendChild(statusIndicator);
        toolbar.appendChild(label);
        toolbar.appendChild(saveButton);
        document.body.appendChild(toolbar);
    }

    // Function to download text as a file
    function saveAsMarkdown(content) {
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url;
        a.download = `deepseek-chat-${timestamp}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function enableButton() {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.title = 'Click to save copied content';
            if (statusIndicator) statusIndicator.classList.add('ready');
        }
    }

    function resetButton() {
        if (saveButton) {
            saveButton.disabled = true;
            if (statusIndicator) statusIndicator.classList.remove('ready');
        }
    }

    // Monitor clicks to detect "Copy" button clicks
    // DeepSeek selector identified in research: .ds-icon-button (specifically with SVG path M3.65169...)
    document.addEventListener('click', (e) => {
        // Find if the click or any parent is the copy button
        const target = e.target.closest('.ds-icon-button');
        if (!target) return;

        // Check for the specific copy icon path to be sure it's the copy button
        const svg = target.querySelector('svg');
        if (svg) {
            const path = svg.querySelector('path');
            // We use the partial path match identified in research
            if (path && path.getAttribute('d') && path.getAttribute('d').startsWith('M3.65169')) {
                console.log('AIHelper: Copy button detected!');
                // Wait a tiny bit for clipboard to be populated
                setTimeout(enableButton, 200);
            }
        }
    }, true);

    // Initial load
    initToolbar();

    // Check again if SPA navigation happens
    const observer = new MutationObserver((mutations) => {
        if (!document.getElementById('ai-helper-toolbar')) {
            initToolbar();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();
