document.addEventListener('DOMContentLoaded', () => {
    loadRules();
    loadAIConfig();
    loadWorkerConfig();
});

document.getElementById('btn-save-ai').addEventListener('click', () => {
    const key = document.getElementById('apiKey').value.trim();
    const base = document.getElementById('apiBase').value.trim() || 'https://api.openai.com/v1/chat/completions';
    chrome.storage.sync.set({ 
        zenAIKey: key, 
        zenAIBase: base,
        zenAIModel: document.getElementById('apiModel').value.trim() || 'gpt-4o-mini'
    }, () => {
        alert('AI 配置已保存！');
    });
});

function loadAIConfig() {
    chrome.storage.sync.get(['zenAIKey', 'zenAIBase', 'zenAIModel'], (res) => {
        if (res.zenAIKey) document.getElementById('apiKey').value = res.zenAIKey;
        if (res.zenAIBase) document.getElementById('apiBase').value = res.zenAIBase;
        document.getElementById('apiModel').value = res.zenAIModel || 'gpt-4o-mini';
    });
}

document.getElementById('btn-save-worker').addEventListener('click', () => {
    let url = document.getElementById('workerUrl').value.trim();
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    chrome.storage.sync.set({ 
        zenWorkerUrl: url
    }, () => {
        alert('书签服务配置已保存！');
        document.getElementById('workerUrl').value = url; // 显示归一化后的结果
    });
});

function loadWorkerConfig() {
    chrome.storage.sync.get(['zenWorkerUrl'], (res) => {
        if (res.zenWorkerUrl) document.getElementById('workerUrl').value = res.zenWorkerUrl;
    });
}

document.getElementById('btn-save').addEventListener('click', () => {
    const domain = document.getElementById('domain').value.trim();
    if (!domain) return alert('域名不能为空！');

    const rule = {
        domain: domain,
        titleSelector: document.getElementById('titleSel').value.trim(),
        contentSelector: document.getElementById('contentSel').value.trim(),
        exclude: document.getElementById('excludeSel').value.split(',').map(s => s.trim()).filter(s => s)
    };

    chrome.storage.sync.get(['zenUserRules'], (res) => {
        const rules = res.zenUserRules || {};
        rules[domain] = rule;
        chrome.storage.sync.set({ zenUserRules: rules }, () => {
            alert('自定义规则应用成功！');
            loadRules(); // 刷新列表
        });
    });
});

function loadRules() {
    const list = document.getElementById('rules-list');
    list.innerHTML = '<h3 style="margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">目前在效的用户自定义规则：</h3>';
    
    chrome.storage.sync.get(['zenUserRules'], (res) => {
        const rules = res.zenUserRules || {};
        const entries = Object.entries(rules);
        
        if (entries.length === 0) {
            list.innerHTML += '<p style="color:#aaa; font-size:14px;">暂无用户配置规则。只激活 defaultRules.js 兜底。</p>';
        }

        for (const [domain, rule] of entries) {
            const item = document.createElement('div');
            item.className = 'rule-item';
            
            const info = document.createElement('div');
            info.innerHTML = `
                <strong style="color: #8c1616; font-size: 16px;">${domain}</strong>
                <div class="rule-code">
                    ${rule.titleSelector ? '<strong>Title:</strong> ' + rule.titleSelector + '<br>' : ''}
                    ${rule.contentSelector ? '<strong>Content:</strong> ' + rule.contentSelector + '<br>' : ''}
                    ${rule.exclude && rule.exclude.length ? '<strong>Exclude:</strong> ' + rule.exclude.join(', ') : ''}
                </div>
            `;
            
            const delBtn = document.createElement('button');
            delBtn.textContent = '删除';
            delBtn.onclick = () => {
                delete rules[domain];
                chrome.storage.sync.set({ zenUserRules: rules }, loadRules);
            };
            
            item.appendChild(info);
            item.appendChild(delBtn);
            list.appendChild(item);
        }
    });
}
