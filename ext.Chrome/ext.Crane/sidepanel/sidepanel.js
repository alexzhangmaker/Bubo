class SidePanel {
    constructor() {
        this.siteSelectors = {};
        this.excludedSites=[] ;
        this.init();
    }

    async init() {
        await this.loadConfig();
        this.renderConfigList();
        await this.loadExcludedSites() ;
        this.setupEventListeners();
        this.getCurrentSiteInfo();
    }

    async loadConfig() {
        const result = await chrome.storage.local.get(['siteSelectors']);
        this.siteSelectors = result.siteSelectors || {};
    }

    async saveConfig() {
        await chrome.storage.local.set({ siteSelectors: this.siteSelectors });
    }

    renderConfigList() {
        const configList = document.getElementById('configList');
        
        if (Object.keys(this.siteSelectors).length === 0) {
            configList.innerHTML = '<div class="empty-state">暂无配置</div>';
            return;
        }

        configList.innerHTML = Object.entries(this.siteSelectors)
            .map(([domain, selector]) => `
                <div class="config-item">
                    <div class="config-info">
                        <div class="config-domain">${domain}</div>
                        <div class="config-selector">${selector}</div>
                    </div>
                    <div class="config-actions">
                        <button class="delete-btn" data-domain="${domain}">删除</button>
                    </div>
                </div>
            `).join('');
        
        // 添加删除事件监听
        configList.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const domain = e.target.dataset.domain;
                this.removeSelector(domain);
            });
        });
    }

    setupEventListeners() {
        document.getElementById('addSelector').addEventListener('click', () => {
            this.addSelector();
        });

        document.getElementById('detectSelector').addEventListener('click', () => {
            this.detectSelector();
        });

        document.getElementById('exportConfig').addEventListener('click', () => {
            this.exportConfig();
        });

        document.getElementById('importConfig').addEventListener('click', () => {
            this.importConfig();
        });

        document.getElementById('addExcludedSite').addEventListener('click', () => {
            this.addExcludedSite();
        });
    }

    async getCurrentSiteInfo() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url) {
                const url = new URL(tab.url);
                const hostname = url.hostname;
                
                const siteInfo = document.getElementById('currentSiteInfo');
                siteInfo.innerHTML = `
                    <div class="config-domain">${hostname}</div>
                    <div class="config-selector">${this.siteSelectors[this.getDomainKey(hostname)] || '未配置'}</div>
                `;
            }
        } catch (error) {
            console.error('获取当前网站信息失败:', error);
        }
    }

    getDomainKey(hostname) {
        // 从hostname中提取主域名
        const parts = hostname.split('.');
        if (parts.length > 2) {
            return parts.slice(-2).join('.');
        }
        return hostname;
    }

    addSelector() {
        const domain = document.getElementById('siteDomain').value.trim();
        const selector = document.getElementById('contentSelector').value.trim();
        
        if (!domain || !selector) {
            alert('请填写完整的域名和选择器');
            return;
        }

        this.siteSelectors[domain] = selector;
        this.saveConfig();
        this.renderConfigList();
        
        // 清空表单
        document.getElementById('siteDomain').value = '';
        document.getElementById('contentSelector').value = '';
        
        this.showMessage('配置已添加');
    }

    removeSelector(domain) {
        delete this.siteSelectors[domain];
        this.saveConfig();
        this.renderConfigList();
        this.showMessage('配置已删除');
    }

    async detectSelector() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // 向content script发送消息，请求检测选择器
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'detectSelector'
            });
            
            if (response && response.selector) {
                document.getElementById('contentSelector').value = response.selector;
                this.showMessage('选择器已检测');
            } else {
                this.showMessage('未检测到合适的选择器');
            }
        } catch (error) {
            console.error('检测选择器失败:', error);
            this.showMessage('检测失败，请刷新页面重试');
        }
    }

    exportConfig() {
        const dataStr = JSON.stringify(this.siteSelectors, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = 'smart-reader-config.json';
        link.click();
        
        this.showMessage('配置已导出');
    }

    importConfig() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const config = JSON.parse(event.target.result);
                    if (typeof config === 'object') {
                        this.siteSelectors = { ...this.siteSelectors, ...config };
                        this.saveConfig();
                        this.renderConfigList();
                        this.showMessage('配置已导入');
                    } else {
                        throw new Error('Invalid config format');
                    }
                } catch (error) {
                    this.showMessage('配置文件格式错误');
                }
            };
            
            reader.readAsText(file);
        };
        
        input.click();
    }

    showMessage(message) {
        // 简单的消息提示
        const existingMsg = document.querySelector('.sidepanel-message');
        if (existingMsg) {
            existingMsg.remove();
        }
        
        const msg = document.createElement('div');
        msg.className = 'sidepanel-message';
        msg.textContent = message;
        msg.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #48bb78;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
        `;
        
        document.body.appendChild(msg);
        
        setTimeout(() => {
            if (msg.parentNode) {
                msg.remove();
            }
        }, 2000);
    }

    async loadExcludedSites() {
        const result = await chrome.storage.local.get(['excludedSites']);
        this.excludedSites = result.excludedSites || [
            'localhost',
            '127.0.0.1',
            'google.com',
            'www.google.com',
            'baidu.com',
            'www.baidu.com'
        ];
    }
      
    async saveExcludedSites() {
        await chrome.storage.local.set({ excludedSites: this.excludedSites });
    }
      
    renderExcludedSites() {
        const listElement = document.getElementById('excludedSitesList');
        if (!listElement) return;
        
        if (this.excludedSites.length === 0) {
          listElement.innerHTML = '<div class="empty-state">暂无排除的网站</div>';
          return;
        }
        
        listElement.innerHTML = this.excludedSites.map(site => `
          <div class="excluded-site-item">
            <span>${site}</span>
            <button class="delete-btn" data-site="${site}">移除</button>
          </div>
        `).join('');
        
        // 添加删除事件
        listElement.querySelectorAll('.delete-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const site = e.target.dataset.site;
            this.removeExcludedSite(site);
          });
        });
      }
      
    addExcludedSite() {
        const siteInput = document.getElementById('excludeSite');
        const site = siteInput.value.trim().toLowerCase();
        
        if (site && !this.excludedSites.includes(site)) {
          this.excludedSites.push(site);
          this.saveExcludedSites();
          this.renderExcludedSites();
          siteInput.value = '';
        }
    }
      
    removeExcludedSite(site) {
        this.excludedSites = this.excludedSites.filter(s => s !== site);
        this.saveExcludedSites();
        this.renderExcludedSites();
    }
}

// 初始化侧边栏
document.addEventListener('DOMContentLoaded', () => {
    new SidePanel();
});