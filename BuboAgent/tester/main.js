const chatContainer = document.getElementById('chat-container');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const actionButtons = document.querySelectorAll('.action-btn');

const AGENT_URL = 'http://localhost:6565/ask';

function appendMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const avatar = role === 'user' ? '👤' : '🤖';

    messageDiv.innerHTML = `
        <div class="avatar">${avatar}</div>
        <div class="content">${content}</div>
    `;

    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return messageDiv;
}

function showTyping() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message system typing-container';
    typingDiv.innerHTML = `
        <div class="avatar">🤖</div>
        <div class="content">
            <div class="typing">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        </div>
    `;
    chatContainer.appendChild(typingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return typingDiv;
}

async function sendMessage(message) {
    if (!message.trim()) return;

    appendMessage('user', message);
    userInput.value = '';

    const typingIndicator = showTyping();

    try {
        const response = await fetch(AGENT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message })
        });

        const data = await response.json();
        typingIndicator.remove();

        if (data.response) {
            appendMessage('system', data.response);
        } else if (data.error) {
            appendMessage('system', `❌ Error: ${data.error}`);
        }
    } catch (error) {
        typingIndicator.remove();
        appendMessage('system', `❌ Connection Error: Is the agent running on port 6565?`);
        console.error(error);
    }
}

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(userInput.value);
});

actionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const template = btn.getAttribute('data-template');
        let finalMessage = template;

        // Simple placeholder replacement for date
        if (template.includes('{日期}')) {
            const today = new Date().toISOString().split('T')[0];
            finalMessage = finalMessage.replace('{日期}', today);
        }

        userInput.value = finalMessage;
        userInput.focus();
    });
});

// Test Connection on load
async function checkStatus() {
    try {
        const res = await fetch('http://localhost:6565/health');
        const statusText = document.querySelector('.status-text');
        const indicator = document.querySelector('.status-indicator');

        if (res.ok) {
            statusText.innerText = 'Connected';
            indicator.className = 'status-indicator online';
        } else {
            throw new Error();
        }
    } catch (e) {
        const statusText = document.querySelector('.status-text');
        const indicator = document.querySelector('.status-indicator');
        statusText.innerText = 'Offline';
        indicator.className = 'status-indicator offline';
    }
}

checkStatus();
setInterval(checkStatus, 5000);
