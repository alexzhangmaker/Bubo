import {
    getAllFolders,
    addFolder,
    deleteFolder,
    getArticlesByFolder,
    addArticle,
    deleteArticle,
    updateFolderOrder,
    exportData
} from '../db.js';

const folderContainer = document.getElementById('folderContainer');
const addFolderBtn = document.getElementById('addFolderBtn');
const addFolderModal = document.getElementById('addFolderModal');
const folderNameInput = document.getElementById('folderNameInput');
const confirmFolderBtn = document.getElementById('confirmFolderBtn');
const cancelFolderBtn = document.getElementById('cancelFolderBtn');
const exportBtn = document.getElementById('exportBtn');
const statusText = document.getElementById('currentStatusText');

let draggedFolderId = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await renderFolders();
    updateStatus();
});

// Update Status Bar
const updateStatus = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.includes('finance.yahoo.com')) {
        statusText.textContent = 'Yahoo Finance Active';
        document.querySelector('.status-dot').style.backgroundColor = '#4caf50';
    } else {
        statusText.textContent = 'Browse Yahoo Finance';
        document.querySelector('.status-dot').style.backgroundColor = '#ff9800';
    }
};

// Rendering
const renderFolders = async () => {
    const folders = await getAllFolders();
    folderContainer.innerHTML = '';

    for (const folder of folders) {
        const folderEl = createFolderElement(folder);
        folderContainer.appendChild(folderEl);
    }
};

const createFolderElement = (folder) => {
    const div = document.createElement('div');
    div.className = 'folder';
    div.dataset.id = folder.id;
    div.draggable = true;

    div.innerHTML = `
        <div class="folder-header">
            <svg class="folder-toggle" viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
            </svg>
            <span class="folder-name">${folder.name}</span>
            <button class="add-article-btn" title="Save current page">
                 <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </button>
            <button class="delete-folder-btn" title="Delete folder">
                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
        </div>
        <div class="article-list" id="articles-${folder.id}"></div>
    `;

    // Toggle expansion
    div.querySelector('.folder-header').addEventListener('click', async (e) => {
        if (e.target.closest('button')) return;
        div.classList.toggle('expanded');
        if (div.classList.contains('expanded')) {
            await renderArticles(folder.id);
        }
    });

    // Add Article
    div.querySelector('.add-article-btn').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url?.includes('finance.yahoo.com')) {
            await addArticle(folder.id, tab.title, tab.url);
            if (div.classList.contains('expanded')) {
                await renderArticles(folder.id);
            } else {
                div.classList.add('expanded');
                await renderArticles(folder.id);
            }
        } else {
            alert('Please navigate to a Yahoo Finance article first.');
        }
    });

    // Delete Folder
    div.querySelector('.delete-folder-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Delete folder "${folder.name}" and all its articles?`)) {
            await deleteFolder(folder.id);
            await renderFolders();
        }
    });

    // Drag and Drop Events
    div.addEventListener('dragstart', (e) => {
        draggedFolderId = folder.id;
        div.classList.add('dragging');
    });

    div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
    });

    div.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggingElement = document.querySelector('.dragging');
        const applyAfter = getDragAfterElement(folderContainer, e.clientY);
        if (applyAfter == null) {
            folderContainer.appendChild(draggingElement);
        } else {
            folderContainer.insertBefore(draggingElement, applyAfter);
        }
    });

    div.addEventListener('drop', async (e) => {
        e.preventDefault();
        await saveNewOrder();
    });

    return div;
};

const renderArticles = async (folderId) => {
    const articles = await getArticlesByFolder(folderId);
    const list = document.getElementById(`articles-${folderId}`);
    list.innerHTML = '';

    articles.forEach(article => {
        const item = document.createElement('div');
        item.className = 'article-item';
        item.innerHTML = `
            <a href="${article.url}" target="_blank" class="article-link" title="${article.title}">${article.title}</a>
            <button class="delete-article-btn" title="Delete">
                 <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
        `;
        item.querySelector('.delete-article-btn').addEventListener('click', async () => {
            await deleteArticle(article.id);
            await renderArticles(folderId);
        });
        list.appendChild(item);
    });
};

// Drag and Drop Helper
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.folder:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

const saveNewOrder = async () => {
    const folderElements = [...folderContainer.querySelectorAll('.folder')];
    const promises = folderElements.map((el, index) => {
        return updateFolderOrder(parseInt(el.dataset.id), index);
    });
    await Promise.all(promises);
};

// Modal Logic
addFolderBtn.addEventListener('click', () => {
    addFolderModal.classList.add('active');
    folderNameInput.focus();
});

cancelFolderBtn.addEventListener('click', () => {
    addFolderModal.classList.remove('active');
    folderNameInput.value = '';
});

confirmFolderBtn.addEventListener('click', async () => {
    const name = folderNameInput.value.trim();
    if (name) {
        const folders = await getAllFolders();
        await addFolder(name, folders.length);
        addFolderModal.classList.remove('active');
        folderNameInput.value = '';
        await renderFolders();
    }
});

// Export Logic
exportBtn.addEventListener('click', async () => {
    const data = await exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `better_yahoo_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

// Tab context listener
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        updateStatus();
    }
});
chrome.tabs.onActivated.addListener(updateStatus);

// Message listener for background synchronization
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'refreshFolders') {
        renderFolders();
    }
});
