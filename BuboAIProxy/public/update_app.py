import re

file_path = "/Users/zhangqing/Documents/GitHub/Bubo/BuboAIProxy/public/appNoteCards.html"

with open(file_path, "r") as f:
    content = f.read()

core_engine_code = """        // ==========================================
        // CORE ENGINE HERE
        // ==========================================
        class EventBus {
            constructor() { this.events = {}; }
            on(e, fn) { (this.events[e] = this.events[e] || []).push(fn); }
            off(e, fn) { if(this.events[e]) this.events[e] = this.events[e].filter(cb => cb !== fn); }
            emit(e, data) { if(this.events[e]) this.events[e].forEach(fn => fn(data)); }
        }

        const TaskEvents = {
            CREATED: 'task:created', UPDATED: 'task:updated',
            COMPLETED: 'task:completed', FAILED: 'task:failed',
            BULK_UPDATE: 'tasks:bulk-update'
        };
        const globalBus = new EventBus();

        class StorageService {
            constructor(dbName, version, stores) {
                this.dbName = dbName; this.version = version; this.stores = stores; this.db = null;
            }
            init() {
                return new Promise((res, rej) => {
                    const req = indexedDB.open(this.dbName, this.version);
                    req.onupgradeneeded = e => {
                        this.db = e.target.result;
                        Object.entries(this.stores).forEach(([name, cfg]) => {
                            if(!this.db.objectStoreNames.contains(name)) {
                                const store = this.db.createObjectStore(name, { keyPath: cfg.keyPath, autoIncrement: cfg.autoIncrement });
                                if(cfg.indices) cfg.indices.forEach(idx => store.createIndex(idx.name, idx.keyPath, {unique: idx.unique}));
                            }
                        });
                    };
                    req.onsuccess = e => { this.db = e.target.result; res(this.db); };
                    req.onerror = e => rej(e.target.error);
                });
            }
            _tx(store, mode) { return this.db.transaction(store, mode).objectStore(store); }
            put(store, item) { return new Promise((res, rej) => { const r = this._tx(store, 'readwrite').put(item); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);}); }
            get(store, key) { return new Promise((res, rej) => { const r = this._tx(store, 'readonly').get(key); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);}); }
            getAll(store) { return new Promise((res, rej) => { const r = this._tx(store, 'readonly').getAll(); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);}); }
            delete(store, key) { return new Promise((res, rej) => { const r = this._tx(store, 'readwrite').delete(key); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);}); }
        }

        class ApiProxy {
            async submitTask(command, params) {
                const res = await fetch('/api/request', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({command, params}) });
                if(!res.ok) throw new Error('API Error');
                return await res.json(); // { requestUUID }
            }
            async queryStatus(uuid) {
                const res = await fetch(`/api/status/${uuid}`);
                if(!res.ok) throw new Error('API Error');
                return (await res.json()).status;
            }
            async fetchResult(uuid) {
                const res = await fetch(`/api/result/${uuid}`);
                if(!res.ok) throw new Error('API Error');
                return await res.json();
            }
        }

        class TaskManager {
            constructor(storage, api, bus) { this.storage = storage; this.api = api; this.bus = bus; this.active = new Map(); }
            async init() { await this.recoverTasks(); }
            
            async createTask(businessType, command, input) {
                const { requestUUID } = await this.api.submitTask(command, input); 
                const task = {
                    id: Date.now() + Math.floor(Math.random()*1000), requestId: requestUUID, command, businessType, input,
                    status: 'pending', result: null, error: null, createdAt: Date.now(), updatedAt: Date.now(),
                    retryCount: 0, cfg: { interval: 2000, maxInterval: 10000, timeout: 300000, attempts: 0 }
                };
                await this.storage.put('tasks', task);
                this.bus.emit(TaskEvents.CREATED, task);
                this.startPolling(task.id);
                return task;
            }

            async save(task) { task.updatedAt = Date.now(); await this.storage.put('tasks', task); this.bus.emit(TaskEvents.UPDATED, task); }
            startPolling(id) { if(!this.active.has(id)) this._poll(id); }
            cancelPolling(id) { if(this.active.has(id)) { clearTimeout(this.active.get(id)); this.active.delete(id); } }

            async _poll(id) {
                const t = await this.storage.get('tasks', id);
                if(!t || ['completed', 'failed', 'cancelled'].includes(t.status)) return this.cancelPolling(id);
                if(Date.now() - t.createdAt > t.cfg.timeout) { t.status = 'failed'; t.error = 'Timeout'; await this.save(t); return this.bus.emit(TaskEvents.FAILED, t); }
                
                try {
                    t.cfg.attempts++;
                    const status = await this.api.queryStatus(t.requestId);
                    if(status !== t.status) { t.status = status; await this.save(t); }
                    if(status === 'completed' || status === 'failed') {
                        const data = await this.api.fetchResult(t.requestId);
                        t.result = data.result; t.error = data.error; t.status = status;
                        await this.save(t);
                        this.bus.emit(status === 'completed' ? TaskEvents.COMPLETED : TaskEvents.FAILED, t);
                        return this.cancelPolling(id);
                    }
                    t.cfg.interval = Math.min(t.cfg.interval * 1.5, t.cfg.maxInterval);
                    await this.save(t);
                    this.active.set(id, setTimeout(() => this._poll(id), t.cfg.interval));
                } catch(err) {
                    console.error('Poll error', err);
                    this.active.set(id, setTimeout(() => this._poll(id), t.cfg.interval));
                }
            }
            
            async recoverTasks() {
                const tasks = await this.storage.getAll('tasks');
                tasks.filter(t => ['pending', 'processing'].includes(t.status)).forEach(t => { t.cfg.interval = 2000; this.startPolling(t.id); });
                this.bus.emit(TaskEvents.BULK_UPDATE, tasks);
            }
        }

        const sysStorage = new StorageService('BuboSystemDB', 1, { 'tasks': { keyPath: 'id' } });
        const bizStorage = new StorageService('BuboCardDB', 1, { 
            'cards': { keyPath: 'id', autoIncrement: true }, 
            'reviews': { keyPath: 'id', autoIncrement: true } 
        });
        const apiProxy = new ApiProxy();
        const taskManager = new TaskManager(sysStorage, apiProxy, globalBus);"""

business_logic_code = """        // ==========================================
        // BUSINESS LOGIC HERE
        // ==========================================
        class CardService {
            constructor(storage) { this.storage = storage; }
            async getAllCards() { return await this.storage.getAll('cards') || []; }
            async getCard(id) { return await this.storage.get('cards', id); }
            async saveCard(c) {
                if(!c.createdAt) c.createdAt = Date.now();
                c.updatedAt = Date.now();
                return await this.storage.put('cards', c);
            }
            async deleteCard(id) { return await this.storage.delete('cards', id); }
            
            async saveReview(r) {
                r.timestamp = Date.now();
                return await this.storage.put('reviews', r);
            }
            async getReviews() { return await this.storage.getAll('reviews') || []; }

            async importData(jsonString) {
                try {
                    const data = JSON.parse(jsonString);
                    if(data.cards) {
                        for(const c of data.cards) await this.saveCard(c);
                    }
                    if(data.reviews) {
                        for(const r of data.reviews) await this.saveReview(r);
                    }
                    return true;
                } catch (e) {
                    console.error('Import failed', e);
                    return false;
                }
            }
            async exportData() {
                const cards = await this.getAllCards();
                const reviews = await this.getReviews();
                return JSON.stringify({ cards, reviews }, null, 2);
            }
        }
        const cardService = new CardService(bizStorage);"""

ui_logic_code = """        // ==========================================
        // UI LOGIC HERE
        // ==========================================
        const DOM = {
            viewContent: document.getElementById('view-content'),
            navBtns: document.querySelectorAll('.nav-btn'),
            exportBtn: document.getElementById('exportBtn'),
            importBtn: document.getElementById('importBtn'),
            activeBadge: document.getElementById('activeBadge')
        };

        const Views = {
            cards: {
                render: async () => {
                    const cards = await cardService.getAllCards();
                    let html = `<div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500">Card Library</h2>
                        <button onclick="App.editCard()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition"><i class="fas fa-plus mr-2"></i>New Card</button>
                    </div>`;
                    
                    if(cards.length === 0) {
                        html += `<div class="text-center py-16 text-gray-500 glass rounded-xl"><i class="fas fa-inbox text-4xl mb-3 text-gray-300"></i><p>No cards found. Create your first one!</p></div>`;
                    } else {
                        html += `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">`;
                        cards.forEach(c => {
                            html += `
                            <div class="glass rounded-xl p-5 hover:shadow-lg transition group relative">
                                <h3 class="font-bold text-lg mb-2 text-gray-800 dark:text-gray-100 pr-8 line-clamp-1">${c.title}</h3>
                                <p class="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">${c.content.substring(0, 100) || 'No content'}</p>
                                <div class="flex gap-2">
                                    ${(c.tags||[]).map(t => `<span class="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs px-2 py-1 rounded-full">${t}</span>`).join('')}
                                </div>
                                <div class="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition flex gap-2">
                                    <button onclick="App.editCard(${c.id})" class="text-blue-500 hover:text-blue-700 bg-white dark:bg-gray-800 rounded-full p-2 shadow-sm"><i class="fas fa-pen pt-0.5"></i></button>
                                    <button onclick="App.deleteCard(${c.id})" class="text-red-500 hover:text-red-700 bg-white dark:bg-gray-800 rounded-full p-2 shadow-sm"><i class="fas fa-trash pt-0.5"></i></button>
                                </div>
                            </div>`;
                        });
                        html += `</div>`;
                    }
                    DOM.viewContent.innerHTML = html;
                }
            },
            review: {
                render: async () => {
                    const cards = await cardService.getAllCards();
                    let html = `<div class="max-w-3xl mx-auto">
                        <div class="mb-6 flex justify-between items-center">
                            <h2 class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500">Review Session</h2>
                        </div>`;
                    
                    if(cards.length === 0) {
                        html += `<div class="text-center py-12 glass rounded-xl"><p class="text-gray-500">Add some cards to start reviewing.</p></div>`;
                    } else {
                        html += `
                        <div class="glass rounded-xl p-8 mb-6 relative overflow-hidden flex flex-col items-center justify-center min-h-[300px]">
                            <p class="text-gray-400 text-sm absolute top-4 left-4">Card 1 / ${cards.length}</p>
                            
                            <div id="flashcard" class="flip-card w-full h-64 mb-6 cursor-pointer" onclick="this.classList.toggle('flipped')">
                                <div class="flip-card-inner">
                                    <div class="flip-card-front glass rounded-xl flex items-center justify-center p-8 bg-blue-50 dark:bg-blue-900/10 border-2 border-blue-100 dark:border-blue-900/30">
                                        <h3 class="text-2xl font-bold text-center">${cards[0].title}</h3>
                                        <p class="absolute bottom-4 text-xs text-gray-400"><i class="fas fa-hand-pointer mr-1"></i>Click to reveal</p>
                                    </div>
                                    <div class="flip-card-back glass rounded-xl p-8 text-left overflow-y-auto bg-green-50 dark:bg-green-900/10 border-2 border-green-100 dark:border-green-900/30">
                                        <div class="prose dark:prose-invert max-w-none text-sm">${cards[0].content}</div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="flex gap-4 w-full">
                                <button onclick="App.startInteractiveReview(${cards[0].id})" class="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition shadow flex items-center justify-center gap-2">
                                    <i class="fas fa-robot text-lg"></i> AI Interactive Tutor
                                </button>
                                <button onclick="showToast('Review recorded!')" class="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition shadow flex items-center justify-center gap-2">
                                    <i class="fas fa-check text-lg"></i> Next Card
                                </button>
                            </div>
                        </div>`;
                    }
                    html += `</div>`;
                    DOM.viewContent.innerHTML = html;
                }
            },
            interactive: {
                render: async (cardId) => {
                    const card = await cardService.getCard(cardId);
                    DOM.viewContent.innerHTML = `
                    <div class="max-w-3xl mx-auto h-full flex flex-col">
                        <div class="flex items-center gap-4 mb-4">
                            <button onclick="App.navigate('review')" class="p-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                                <i class="fas fa-arrow-left"></i>
                            </button>
                            <h2 class="text-xl font-bold truncate">Interactive Map: ${card.title}</h2>
                        </div>
                        
                        <div class="flex-1 glass rounded-xl flex flex-col mb-4 overflow-hidden border border-purple-200 dark:border-purple-800/50 shadow-sm">
                            <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-4">
                                <div class="flex gap-3">
                                    <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-white shrink-0 shadow"><i class="fas fa-robot text-xs"></i></div>
                                    <div class="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[85%]">
                                        <p class="text-sm">Hi! Let's review <strong>${card.title}</strong>. What do you remember about this topic?</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="p-4 border-t border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50">
                                <div class="flex gap-2 relative">
                                    <textarea id="chat-input" rows="1" class="flex-1 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none max-h-32 text-sm transition" placeholder="Type what you remember..."></textarea>
                                    <button onclick="App.sendReviewAnswer(${card.id})" class="px-5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg font-medium shadow transition flex items-center justify-center shrink-0 group">
                                        <i class="fas fa-paper-plane group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>`;
                }
            },
            tasks: {
                render: async () => {
                    const tasks = await sysStorage.getAll('tasks') || [];
                    tasks.sort((a,b) => b.createdAt - a.createdAt);
                    
                    let html = `<div class="max-w-4xl mx-auto">
                        <h2 class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500 mb-6">Background Tasks</h2>
                        <div class="glass rounded-xl overflow-hidden shadow-sm">
                            <table class="w-full text-left border-collapse">
                                <thead>
                                    <tr class="bg-gray-100/50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
                                        <th class="p-4 font-medium">Task / Command</th>
                                        <th class="p-4 font-medium">Type</th>
                                        <th class="p-4 font-medium">Status</th>
                                        <th class="p-4 font-medium">Time (Attempts)</th>
                                        <th class="p-4 font-medium text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                    `;
                    
                    if(tasks.length === 0) {
                        html += `<tr><td colspan="5" class="p-8 text-center text-gray-500">No active or historical tasks.</td></tr>`;
                    } else {
                        const statusColors = {
                            pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                            processing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                            completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                            failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                            cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                        };
                        const statusIcons = {
                            pending: 'fa-clock', processing: 'fa-spinner fa-spin',
                            completed: 'fa-check-circle', failed: 'fa-exclamation-circle', cancelled: 'fa-ban'
                        };
                        
                        tasks.forEach(t => {
                            const date = new Date(t.createdAt).toLocaleString();
                            html += `
                            <tr class="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition text-sm">
                                <td class="p-4">
                                    <div class="font-medium truncate max-w-[200px]">${t.command}</div>
                                    <div class="text-xs text-gray-400 font-mono mt-0.5 truncate max-w-[200px]">${t.requestId}</div>
                                </td>
                                <td class="p-4"><span class="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 text-xs px-2 py-1 rounded font-medium">${t.businessType}</span></td>
                                <td class="p-4">
                                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[t.status]}">
                                        <i class="fas ${statusIcons[t.status]}"></i> ${t.status}
                                    </span>
                                </td>
                                <td class="p-4 text-gray-500 text-xs">
                                    <div>${date}</div>
                                    <div class="mt-0.5">${['pending', 'processing'].includes(t.status) ? `Checking in ${Math.round(t.cfg.interval/1000)}s` : `${t.cfg.attempts} attempts`}</div>
                                </td>
                                <td class="p-4 text-right">
                                    ${t.status === 'failed' ? `<button onclick="App.retryTask(${t.id})" class="text-blue-500 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded"><i class="fas fa-redo text-xs"></i> Retry</button>` : ''}
                                    ${t.status === 'completed' || t.status === 'failed' ? `<button onclick="App.deleteTask(${t.id})" class="text-red-500 hover:text-red-700 ml-2 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded"><i class="fas fa-trash text-xs"></i></button>` : ''}
                                </td>
                            </tr>`;
                        });
                    }
                    html += `</tbody></table></div></div>`;
                    DOM.viewContent.innerHTML = html;
                }
            }
        };

        const App = {
            async init() {
                try {
                    await sysStorage.init();
                    await bizStorage.init();
                    await taskManager.init();
                    
                    // Bind Nav
                    DOM.navBtns.forEach(btn => {
                        const view = btn.dataset.view;
                        if(view) btn.addEventListener('click', () => App.navigate(view));
                    });
                    
                    // Bind Global Events
                    globalBus.on(TaskEvents.CREATED, () => App.updateActiveTasksCount());
                    globalBus.on(TaskEvents.COMPLETED, (task) => {
                        App.updateActiveTasksCount();
                        showToast(`Task ${task.command} completed!`, 'success');
                        App.handleTaskCompleted(task);
                        if(AppState.currentView === 'tasks') App.navigate('tasks');
                    });
                    globalBus.on(TaskEvents.FAILED, (task) => {
                        App.updateActiveTasksCount();
                        showToast(`Task ${task.command} failed.`, 'error');
                        if(AppState.currentView === 'tasks') App.navigate('tasks');
                    });
                    globalBus.on(TaskEvents.BULK_UPDATE, () => App.updateActiveTasksCount());

                    // Data import/export
                    DOM.exportBtn.addEventListener('click', async () => {
                        const json = await cardService.exportData();
                        const blob = new Blob([json], {type: 'application/json'});
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = 'bubo_cards_export.json';
                        a.click(); URL.revokeObjectURL(url);
                    });
                    
                    DOM.importBtn.addEventListener('change', async (e) => {
                        const file = e.target.files[0];
                        if(!file) return;
                        const reader = new FileReader();
                        reader.onload = async (ev) => {
                            if(await cardService.importData(ev.target.result)) {
                                showToast('Data imported successfully!', 'success');
                                App.navigate(AppState.currentView);
                            } else showToast('Import failed. Invalid format.', 'error');
                        };
                        reader.readAsText(file);
                        e.target.value = '';
                    });

                    // Seed some dummy data if empty
                    const existing = await cardService.getAllCards();
                    if(existing.length === 0) {
                        await cardService.saveCard({
                            title: 'What is a Closure in JavaScript?',
                            content: 'A closure is the combination of a function bundled together (enclosed) with references to its surrounding state (the lexical environment).\n\nIn other words, a closure gives you access to an outer function\'s scope from an inner function. In JavaScript, closures are created every time a function is created, at function creation time.',
                            tags: ['JavaScript', 'Programming']
                        });
                        await cardService.saveCard({
                            title: 'Explain Event Delegation',
                            content: 'Event delegation is a technique involving adding event listeners to a parent element instead of adding them to the descendant elements.\n\nThe listener will fire whenever the event is triggered on the descendant elements due to event bubbling up the DOM. The benefits of this technique are:\n- Memory footprint goes down\n- No need to unbind/bind when adding/removing elements',
                            tags: ['JavaScript', 'DOM']
                        });
                    }
                    
                    this.navigate('cards');
                    this.updateActiveTasksCount();
                    showToast('Knowledge Card App Initialized', 'success');

                } catch(e) { console.error('App init failed', e); showToast('Initialization failed', 'error'); }
            },
            
            navigate(viewId) {
                AppState.currentView = viewId;
                DOM.navBtns.forEach(btn => {
                    if(btn.dataset.view === viewId) {
                        btn.classList.add('bg-blue-100', 'text-blue-700', 'dark:bg-blue-900/40', 'dark:text-blue-300');
                        btn.classList.remove('hover:bg-gray-200', 'dark:hover:bg-gray-800');
                    } else {
                        btn.classList.remove('bg-blue-100', 'text-blue-700', 'dark:bg-blue-900/40', 'dark:text-blue-300');
                        btn.classList.add('hover:bg-gray-200', 'dark:hover:bg-gray-800');
                    }
                });
                if(Views[viewId]) Views[viewId].render();
            },
            
            async updateActiveTasksCount() {
                const tasks = await sysStorage.getAll('tasks');
                const active = tasks.filter(t => ['pending', 'processing'].includes(t.status)).length;
                if(active > 0) { DOM.activeBadge.textContent = active; DOM.activeBadge.classList.remove('hidden'); }
                else DOM.activeBadge.classList.add('hidden');
            },

            // --- Form Handlers ---
            async editCard(id) {
                let card = id ? await cardService.getCard(id) : { title: '', content: '', tags: [] };
                DOM.viewContent.innerHTML = `
                <div class="max-w-2xl mx-auto glass rounded-xl p-8 shadow-sm">
                    <div class="flex items-center gap-4 mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
                        <button onclick="App.navigate('cards')" class="p-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        <h2 class="text-2xl font-bold">${id ? 'Edit Card' : 'New Card'}</h2>
                    </div>
                    <form id="cardForm" onsubmit="event.preventDefault(); App.saveCardData(${id || 'null'})" class="space-y-5">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title / Question</label>
                            <input type="text" id="cardTitle" value="${card.title || ''}" required class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 transition">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Content / Answer (Markdown supported)</label>
                            <textarea id="cardContent" required rows="8" class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 font-mono text-sm transition">${card.content || ''}</textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tags (Comma separated)</label>
                            <input type="text" id="cardTags" value="${(card.tags||[]).join(', ')}" class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 transition">
                        </div>
                        <div class="pt-4 flex justify-end gap-3">
                            <button type="button" onclick="App.navigate('cards')" class="px-5 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition font-medium">Cancel</button>
                            <button type="submit" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium shadow">Save Card</button>
                        </div>
                    </form>
                </div>`;
            },
            
            async saveCardData(id) {
                const title = document.getElementById('cardTitle').value.trim();
                const content = document.getElementById('cardContent').value.trim();
                const tags = document.getElementById('cardTags').value.split(',').map(t=>t.trim()).filter(t=>t);
                let card = id ? await cardService.getCard(id) : {};
                card = { ...card, title, content, tags };
                await cardService.saveCard(card);
                showToast('Card saved successfully!', 'success');
                this.navigate('cards');
            },

            async deleteCard(id) {
                if(confirm('Are you sure you want to delete this card?')) {
                    await cardService.deleteCard(id);
                    showToast('Card deleted.', 'success');
                    if(AppState.currentView === 'cards') this.navigate('cards');
                }
            },
            
            async deleteTask(id) {
                taskManager.cancelPolling(id);
                await sysStorage.delete('tasks', id);
                showToast('Task removed.');
                if(AppState.currentView === 'tasks') this.navigate('tasks');
                this.updateActiveTasksCount();
            },
            
            async retryTask(id) {
                await taskManager.retryTask(id);
                showToast('Task retry initiated', 'info');
                if(AppState.currentView === 'tasks') this.navigate('tasks');
                this.updateActiveTasksCount();
            },

            // --- Interactive Review Logic ---
            startInteractiveReview(cardId) {
                AppState.currentView = 'interactive';
                Views.interactive.render(cardId);
            },
            
            async sendReviewAnswer(cardId) {
                const inputEl = document.getElementById('chat-input');
                const answer = inputEl.value.trim();
                if(!answer) return;
                
                const chatContainer = document.getElementById('chat-messages');
                
                // Add User Message
                chatContainer.innerHTML += `
                <div class="flex gap-3 flex-row-reverse">
                    <div class="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[85%] shadow-sm">
                        <p class="text-sm">${answer}</p>
                    </div>
                </div>`;
                inputEl.value = '';
                
                // Show AI thinking state
                const thinkingId = 'thinking-' + Date.now();
                chatContainer.innerHTML += `
                <div id="${thinkingId}" class="flex gap-3">
                    <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-white shrink-0 shadow"><i class="fas fa-robot text-xs"></i></div>
                    <div class="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[85%] flex items-center gap-2 text-gray-400">
                        <div class="w-2 h-2 bg-purple-500 rounded-full animate-bounce"></div>
                        <div class="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                        <div class="w-2 h-2 bg-purple-300 rounded-full animate-bounce" style="animation-delay: 0.4s"></div>
                        <span class="text-xs ml-2">Evaluating using BuboAIProxy...</span>
                    </div>
                </div>`;
                chatContainer.scrollTop = chatContainer.scrollHeight;

                try {
                    // Send to BuboAIProxy - Using a generic mock command for testing structure
                    await taskManager.createTask('EvaluateAnswer', 'AIEvaluateCards', { cardId, answer });
                    
                    // The UI will be updated via EventBus when task completes
                    // We save the thinkingId in App state to swap it out
                    if(!this._activeChatTasks) this._activeChatTasks = {};
                    // Temporary workaround to map the latest task to the thinking bubble
                    // In a real app we'd map taskId -> thinkingId directly
                    const tasks = await sysStorage.getAll('tasks');
                    const latest = tasks.sort((a,b)=>b.createdAt-a.createdAt)[0];
                    this._activeChatTasks[latest.id] = thinkingId;

                } catch(e) {
                    console.error('Failed to submit review task', e);
                    document.getElementById(thinkingId).remove();
                    showToast('Failed to submit answer to AI', 'error');
                }
            },
            
            handleTaskCompleted(task) {
                if(task.businessType === 'EvaluateAnswer' && this._activeChatTasks && this._activeChatTasks[task.id]) {
                    const thinkingId = this._activeChatTasks[task.id];
                    const thinkingEl = document.getElementById(thinkingId);
                    if(thinkingEl) {
                        const aiResponse = typeof task.result === 'string' ? task.result : JSON.stringify(task.result, null, 2);
                        thinkingEl.innerHTML = `
                            <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-white shrink-0 shadow"><i class="fas fa-robot text-xs"></i></div>
                            <div class="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[85%]">
                                <p class="text-sm prose dark:prose-invert">Good effort! Based on the AI evaluation, here is the result:<br/><br/><code>${aiResponse}</code></p>
                            </div>
                        `;
                    }
                    delete this._activeChatTasks[task.id];
                }
            }
        };

        // Initialize App on DOM Content Loaded
        document.addEventListener('DOMContentLoaded', () => App.init());"""

content = content.replace("        // ==========================================\n        // CORE ENGINE HERE\n        // ==========================================", core_engine_code)
content = content.replace("        // ==========================================\n        // BUSINESS LOGIC HERE\n        // ==========================================", business_logic_code)
content = content.replace("        // ==========================================\n        // UI LOGIC HERE\n        // ==========================================", ui_logic_code)

with open(file_path, "w") as f:
    f.write(content)

print("Update complete.")
