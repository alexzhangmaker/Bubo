const DB_NAME = 'BetterYahooDB';
const DB_VERSION = 1;
const STORE_FOLDERS = 'folders';
const STORE_ARTICLES = 'articles';

export const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
                const folderStore = db.createObjectStore(STORE_FOLDERS, { keyPath: 'id', autoIncrement: true });
                folderStore.createIndex('order', 'order', { unique: false });
            }
            if (!db.objectStoreNames.contains(STORE_ARTICLES)) {
                const articleStore = db.createObjectStore(STORE_ARTICLES, { keyPath: 'id', autoIncrement: true });
                articleStore.createIndex('folderId', 'folderId', { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const getAllFolders = async () => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_FOLDERS, 'readonly');
        const store = transaction.objectStore(STORE_FOLDERS);
        const index = store.index('order');
        const request = index.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const addFolder = async (name, order) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_FOLDERS, 'readwrite');
        const store = transaction.objectStore(STORE_FOLDERS);
        const request = store.add({ name, order });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const updateFolderOrder = async (folderId, newOrder) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_FOLDERS, 'readwrite');
        const store = transaction.objectStore(STORE_FOLDERS);
        const getRequest = store.get(folderId);

        getRequest.onsuccess = () => {
            const data = getRequest.result;
            data.order = newOrder;
            store.put(data);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
};

export const deleteFolder = async (id) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_FOLDERS, STORE_ARTICLES], 'readwrite');
        transaction.objectStore(STORE_FOLDERS).delete(id);

        // Also delete articles in this folder
        const articleStore = transaction.objectStore(STORE_ARTICLES);
        const index = articleStore.index('folderId');
        const request = index.openCursor(IDBKeyRange.only(id));
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
};

export const getArticlesByFolder = async (folderId) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_ARTICLES, 'readonly');
        const store = transaction.objectStore(STORE_ARTICLES);
        const index = store.index('folderId');
        const request = index.getAll(IDBKeyRange.only(folderId));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const addArticle = async (folderId, title, url) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_ARTICLES, 'readwrite');
        const store = transaction.objectStore(STORE_ARTICLES);
        const request = store.add({ folderId, title, url, timestamp: Date.now() });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const deleteArticle = async (id) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_ARTICLES, 'readwrite');
        transaction.objectStore(STORE_ARTICLES).delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
};

export const exportData = async () => {
    const folders = await getAllFolders();
    const articlesPromises = folders.map(f => getArticlesByFolder(f.id));
    const articlesByFolder = await Promise.all(articlesPromises);

    const data = folders.map((f, i) => ({
        ...f,
        articles: articlesByFolder[i]
    }));

    return JSON.stringify(data, null, 2);
};
