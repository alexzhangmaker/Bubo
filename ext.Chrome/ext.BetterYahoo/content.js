(function () {
    console.log('BetterYahoo content script loaded');

    // --- Toolbar Creation ---
    const toolbar = document.createElement('div');
    toolbar.className = 'better-yahoo-toolbar';
    toolbar.id = 'betterYahooToolbar';

    // Drag Handle
    const handle = document.createElement('div');
    handle.className = 'better-yahoo-drag-handle';
    toolbar.appendChild(handle);

    // Bookmark Button
    const bookmarkBtn = document.createElement('button');
    bookmarkBtn.className = 'better-yahoo-btn';
    bookmarkBtn.title = 'Bookmark to BetterYahoo';
    bookmarkBtn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>`;
    bookmarkBtn.onclick = () => {
        chrome.runtime.sendMessage({
            action: 'saveArticle',
            title: document.title,
            url: window.location.href
        }, (response) => {
            if (response?.success) {
                bookmarkBtn.style.color = '#7c4dff';
                setTimeout(() => bookmarkBtn.style.color = '', 2000);
            }
        });
    };
    toolbar.appendChild(bookmarkBtn);

    // Save as Markdown Button
    const saveMdBtn = document.createElement('button');
    saveMdBtn.className = 'better-yahoo-btn';
    saveMdBtn.title = 'Save as Markdown';
    saveMdBtn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`;
    saveMdBtn.onclick = handleSaveMarkdown;
    toolbar.appendChild(saveMdBtn);

    document.body.appendChild(toolbar);

    // --- Dragging Logic ---
    let isDragging = false;
    let offset = { x: 0, y: 0 };

    toolbar.onmousedown = (e) => {
        if (e.target.closest('button')) return;
        isDragging = true;
        offset = {
            x: e.clientX - toolbar.getBoundingClientRect().left,
            y: e.clientY - toolbar.getBoundingClientRect().top
        };
        toolbar.style.transition = 'none';
    };

    document.onmousemove = (e) => {
        if (!isDragging) return;
        const x = e.clientX - offset.x;
        const y = e.clientY - offset.y;
        toolbar.style.left = x + 'px';
        toolbar.style.top = y + 'px';
        toolbar.style.right = 'auto'; // Disable right anchoring
    };

    document.onmouseup = () => {
        isDragging = false;
        toolbar.style.transition = 'transform 0.2s ease';
    };

    // --- Markdown Extraction ---
    async function handleSaveMarkdown() {
        const url = window.location.href;
        const title = document.querySelector('h1')?.innerText || document.title || 'Yahoo_Finance_Transcript';

        // Root container for transcript
        const root = document.querySelector('.transcriptContainer');

        if (!root && !document.querySelector('.yf-181x49c') && !document.querySelector('.caas-body')) {
            alert('Could not find transcript content. The layout might have changed.');
            return;
        }

        let markdown = `# ${title}\n\n`;
        markdown += `Source: ${url}\n\n---\n\n`;

        const blocks = [];
        if (root) {
            const heading = root.querySelector('.heading');
            const lead = root.querySelector('.lead');
            if (heading) blocks.push(heading);
            if (lead) blocks.push(lead);

            const itemsContainer = root.querySelector('.items') || root;
            const items = Array.from(itemsContainer.querySelectorAll('.item'));
            if (items.length > 0) {
                blocks.push(...items);
            } else if (itemsContainer !== root) {
                blocks.push(...Array.from(itemsContainer.children));
            }
        } else {
            // Fallback for other layouts
            const container = document.querySelector('.yf-181x49c') || document.querySelector('.caas-body');
            if (container) blocks.push(...Array.from(container.children));
        }

        blocks.forEach(block => {
            const headline = block.querySelector('.headline');
            const speakerInfo = headline?.querySelector('.speakerInfo');

            // Time: headline > p (direct child)
            const timeEl = headline?.querySelector(':scope > p');
            const time = timeEl?.innerText.trim() || '';

            // Name: speakerInfo > span (direct child) or any span if structure varies
            const nameEl = speakerInfo?.querySelector(':scope > span');
            const name = nameEl?.innerText.trim() || '';

            // Role: speakerInfo > speakerDesc
            const roleEl = speakerInfo?.querySelector('.speakerDesc');
            const role = roleEl?.innerText.trim() || '';

            // Content: block > p (direct children)
            const contentParagraphs = Array.from(block.querySelectorAll(':scope > p, :scope > [data-testid="typography"]'));

            let blockMarkdown = '';
            if (name) {
                // Formatting: time name[role]:
                const speakerHeader = `${time ? time + ' ' : ''}${name}${role ? '[' + role + ']' : ''}:`;
                blockMarkdown += `### ${speakerHeader}\n`;
            }

            const textParts = [];
            contentParagraphs.forEach(p => {
                const text = p.innerText.trim();
                // Avoid re-adding the time, name, or role if they already appear in the header
                if (text && text !== time && text !== name && text !== role) {
                    textParts.push(text);
                }
            });

            if (textParts.length > 0) {
                blockMarkdown += textParts.join('\n\n') + '\n\n';
            } else if (!name && block.innerText.trim()) {
                // Fallback for non-speaker blocks (like heading/lead)
                const fallbackText = block.innerText.trim();
                blockMarkdown += fallbackText + '\n\n';
            }

            markdown += blockMarkdown;
        });

        // Filename from URL
        let filename = 'transcript.md';
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/');
            const lastPart = pathParts[pathParts.length - 1];
            if (lastPart && lastPart.endsWith('.html')) {
                filename = lastPart.replace('.html', '.md');
            } else if (lastPart) {
                filename = lastPart + '.md';
            }
        } catch (e) {
            filename = title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.md';
        }

        downloadFile(markdown, filename);
    }

    function downloadFile(content, filename) {
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

})();
