document.addEventListener('DOMContentLoaded', () => {
    const bookmarksGrid = document.getElementById('bookmarks-grid');
    const collectionsList = document.getElementById('collections-list');
    const searchInput = document.getElementById('search-input');
    const addBookmarkBtn = document.getElementById('add-bookmark-btn');
    const modalContainer = document.getElementById('modal-container');
    const bookmarkForm = document.getElementById('bookmark-form');
    const cancelModal = document.getElementById('cancel-modal');
    const currentCollectionLabel = document.getElementById('current-collection-name');
    const newCollectionBtn = document.getElementById('new-collection-btn');

    let currentCollection = 'all';
    let searchQuery = '';

    // --- Data Fetching ---

    async function fetchCollections() {
        try {
            const response = await fetch('/api/collections');
            const data = await response.json();
            renderCollections(data);
            updateGlobalCounts(data);
        } catch (error) {
            console.error('Failed to fetch collections:', error);
        }
    }

    async function fetchBookmarks() {
        console.log('🔍 fetchBookmarks started');
        renderSkeletons();
        try {
            let url = `/api/urls?t=${Date.now()}&`;
            if (currentCollection !== 'all') url += `collection=${currentCollection}&`;
            if (searchQuery) url += `q=${encodeURIComponent(searchQuery)}&`;

            console.log('📡 Fetching:', url);
            const response = await fetch(url);
            const data = await response.json();
            console.log('✅ Data received:', data.length, 'items');
            renderBookmarks(data);
        } catch (error) {
            console.error('❌ Failed to fetch bookmarks:', error);
            bookmarksGrid.innerHTML = '<div class="loader">Error loading bookmarks.</div>';
        }
    }

    // --- Rendering ---

    function renderSkeletons() {
        bookmarksGrid.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const card = document.createElement('div');
            card.className = 'bookmark-card';
            card.innerHTML = `
                <div class="skeleton-header skeleton">
                    <div class="skeleton-icon skeleton"></div>
                    <div class="skeleton-host skeleton"></div>
                </div>
                <div class="skeleton-body">
                    <div class="skeleton-title skeleton"></div>
                    <div class="skeleton-desc skeleton"></div>
                    <div class="skeleton-desc-short skeleton"></div>
                </div>
            `;
            bookmarksGrid.appendChild(card);
        }
    }

    function renderCollections(data) {
        collectionsList.innerHTML = '';
        data.collections.forEach(col => {
            const btn = document.createElement('button');
            btn.className = `nav-item ${currentCollection == col.id ? 'active' : ''}`;
            btn.dataset.collection = col.id;
            btn.innerHTML = `
                <span class="icon">📁</span> ${col.name}
                <span class="count">${col.count}</span>
            `;
            btn.onclick = () => {
                currentCollection = col.id;
                currentCollectionLabel.textContent = col.name;
                updateActiveNavItem();
                fetchBookmarks();
            };
            collectionsList.appendChild(btn);
        });

        // Update modal collection select
        const select = document.getElementById('bookmark-collection');
        const options = ['<option value="">Unsorted</option>'];
        data.collections.forEach(col => {
            options.push(`<option value="${col.id}">${col.name}</option>`);
        });
        select.innerHTML = options.join('');
    }

    function updateGlobalCounts(data) {
        document.getElementById('count-all').textContent = data.totalCount;
        document.getElementById('count-unsorted').textContent = data.unsortedCount;
    }

    // --- UI Helpers ---

    function getDeterministicColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = Math.abs(hash) % 360;
        return `hsl(${h}, 70%, 65%)`;
    }

    function getGradient(str) {
        if (!str) return 'linear-gradient(135deg, #e2e8f0, #cbd5e1)';
        const c1 = getDeterministicColor(str);
        const hash = [...str].reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const h2 = (hash + 40) % 360;
        const c2 = `hsl(${h2}, 80%, 75%)`;
        return `linear-gradient(135deg, ${c1}, ${c2})`;
    }

    function renderBookmarks(bookmarks) {
        console.log('🎨 renderBookmarks called with', bookmarks?.length, 'items');
        if (!bookmarks || bookmarks.length === 0) {
            console.log('⚠️ No bookmarks to render');
            bookmarksGrid.innerHTML = '<div class="loader">No bookmarks found.</div>';
            return;
        }

        console.log('🧹 Clearing grid');
        bookmarksGrid.innerHTML = '';
        console.log('🔄 Starting loop');

        let successCount = 0;
        bookmarks.forEach((bm, index) => {
            if (index < 5) console.log(`🃏 Card ${index} start:`, bm.url);
            try {
                const card = document.createElement('div');
                card.className = 'bookmark-card';
                card.style.minHeight = '100px'; // Force visibility
                card.style.border = '1px solid #ccc';
                card.dataset.id = bm.id;
                if (index === 0) console.log('🃏 Card 0 className after set:', card.className);

                let domain = '';
                try {
                    domain = bm.url ? new URL(bm.url).hostname : '';
                } catch (e) {
                    domain = bm.url || '';
                }

                const title = bm.title || domain || 'Untitled';
                const description = bm.description || '';
                const dateStr = bm.created_at ? new Date(bm.created_at).toLocaleDateString() : 'Unknown date';

                // --- Card Header ---
                const cardHeader = document.createElement('div');
                cardHeader.className = 'card-header';

                const headerLeft = document.createElement('div');
                headerLeft.className = 'header-left';

                const favImg = document.createElement('img');
                favImg.className = 'site-icon';
                favImg.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
                favImg.onerror = () => { favImg.style.display = 'none'; };

                const domainSpan = document.createElement('span');
                domainSpan.className = 'host-name';
                domainSpan.textContent = domain;

                headerLeft.appendChild(favImg);
                headerLeft.appendChild(domainSpan);

                const headerRight = document.createElement('div');
                headerRight.className = 'header-right';

                const dateSpan = document.createElement('span');
                dateSpan.className = 'card-date';
                dateSpan.textContent = dateStr;

                const refreshBtn = document.createElement('button');
                refreshBtn.className = 'btn-refresh-meta';
                refreshBtn.title = 'Refresh Metadata';
                refreshBtn.textContent = '🔄';
                refreshBtn.onclick = (e) => {
                    e.stopPropagation();
                    refreshMetadata(bm.id);
                };

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn-delete';
                deleteBtn.title = 'Delete Bookmark';
                deleteBtn.textContent = '🗑️';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (confirm('Are you sure you want to delete this bookmark?')) {
                        deleteBookmark(bm.id);
                    }
                };

                headerRight.appendChild(dateSpan);
                headerRight.appendChild(refreshBtn);
                headerRight.appendChild(deleteBtn);

                cardHeader.appendChild(headerLeft);
                cardHeader.appendChild(headerRight);
                card.appendChild(cardHeader);

                // --- Card Body ---
                const cardBody = document.createElement('div');
                cardBody.className = 'card-body';

                const h3 = document.createElement('h3');
                h3.textContent = title;
                cardBody.appendChild(h3);

                if (description) {
                    const p = document.createElement('p');
                    p.textContent = description;
                    cardBody.appendChild(p);
                }

                card.appendChild(cardBody);

                card.onclick = () => window.open(bm.url, '_blank');

                bookmarksGrid.appendChild(card);
                successCount++;
            } catch (cardError) {
                console.error(`❌ Card ${index} error:`, cardError);
            }
        });
        console.log(`✅ Render finished. Successfully added ${successCount} cards.`);
        console.log('📊 Grid child count:', bookmarksGrid.children.length);
    }

    window.refreshMetadata = async (id) => {
        try {
            const response = await fetch(`/api/urls/${id}/refresh`, { method: 'POST' });
            const result = await response.json();

            if (response.ok) {
                if (!result.title || result.title === 'xueqiu.com') {
                    alert('⚠️ Server scraping failed (likely due to WAF). For this site, please open the link and use the Bubo extension to "Collect" it.');
                }
                fetchBookmarks();
            } else {
                alert('❌ Refresh failed: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Failed to refresh metadata:', error);
            alert('❌ Network error during refresh.');
        }
    };

    window.deleteBookmark = async (id) => {
        try {
            const response = await fetch(`/api/urls/${id}`, { method: 'DELETE' });
            if (response.ok) {
                fetchBookmarks();
                fetchCollections(); // Update counts
            } else {
                const result = await response.json();
                alert('❌ Delete failed: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Failed to delete bookmark:', error);
            alert('❌ Network error during delete.');
        }
    };

    function updateActiveNavItem() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.collection == currentCollection) {
                item.classList.add('active');
            }
        });
    }

    // --- Event Listeners ---

    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        fetchBookmarks();
    });

    document.querySelectorAll('.nav-item[data-collection]').forEach(item => {
        item.onclick = () => {
            currentCollection = item.dataset.collection;
            currentCollectionLabel.textContent = item.textContent.split('\n')[0].trim();
            updateActiveNavItem();
            fetchBookmarks();
        };
    });

    addBookmarkBtn.onclick = () => modalContainer.classList.remove('hidden');
    cancelModal.onclick = () => modalContainer.classList.add('hidden');

    bookmarkForm.onsubmit = async (e) => {
        e.preventDefault();
        const url = document.getElementById('bookmark-url').value;
        const collection_id = document.getElementById('bookmark-collection').value;

        try {
            const response = await fetch('/api/urls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, collection_id: collection_id || null })
            });

            if (response.ok) {
                modalContainer.classList.add('hidden');
                bookmarkForm.reset();
                fetchBookmarks();
                fetchCollections();
            }
        } catch (error) {
            console.error('Failed to add bookmark:', error);
        }
    };

    newCollectionBtn.onclick = async () => {
        const name = prompt('Collection name:');
        if (!name) return;

        try {
            const response = await fetch('/api/collections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });

            if (response.ok) {
                fetchCollections();
            }
        } catch (error) {
            console.error('Failed to create collection:', error);
        }
    };

    const refreshAllBtn = document.getElementById('refresh-all-btn');
    if (refreshAllBtn) {
        refreshAllBtn.onclick = async () => {
            refreshAllBtn.disabled = true;
            refreshAllBtn.textContent = 'Refreshing...';
            try {
                const response = await fetch('/api/urls/refresh-all', { method: 'POST' });
                if (response.ok) {
                    const result = await response.json();
                    alert(`Refreshed ${result.count} bookmarks.`);
                    fetchBookmarks();
                }
            } catch (error) {
                console.error('Failed to refresh all metadata:', error);
            } finally {
                refreshAllBtn.disabled = false;
                refreshAllBtn.textContent = '🔄 Refresh Missing Meta';
            }
        };
    }

    // --- Initial Load ---
    fetchCollections();
    fetchBookmarks();
});
