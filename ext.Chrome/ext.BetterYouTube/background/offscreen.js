// Socket.io Client for Offscreen Document
import { io } from './socket.io.esm.min.js';

let socket;

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'CONNECT_SOCKET') {
        connect(msg.url);
    } else if (msg.type === 'SEND_SOCKET' && socket) {
        socket.emit(msg.event, msg.data);
    }
});

function connect(url) {
    if (socket) socket.disconnect();

    socket = io(url);

    socket.on('connect', () => {
        chrome.runtime.sendMessage({ type: 'SOCKET_STATUS', status: 'online' });
    });

    socket.on('disconnect', () => {
        chrome.runtime.sendMessage({ type: 'SOCKET_STATUS', status: 'offline' });
    });

    socket.on('command', (data) => {
        // Handle server commands (e.g., refresh, block content)
        chrome.runtime.sendMessage({ type: 'SERVER_COMMAND', data });
    });

    // Periodic status report
    setInterval(() => {
        if (socket.connected) {
            socket.emit('status_report', { timestamp: Date.now() });
        }
    }, 30000);
}
