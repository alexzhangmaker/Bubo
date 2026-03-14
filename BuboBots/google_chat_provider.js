const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const commands = require('./commands');

class GoogleChatProvider {
    constructor() {
        this.keyFilePath = process.env.GOOGLE_CHAT_KEY_FILE ? path.resolve(process.env.GOOGLE_CHAT_KEY_FILE) : null;
        this.auth = null;
        this.chat = null;
    }

    async init() {
        if (!this.keyFilePath || !fs.existsSync(this.keyFilePath)) {
            console.warn(`[GoogleChat] Service account key file not found at ${this.keyFilePath}. Bot outgoing messages will fail.`);
            return;
        }

        const auth = new google.auth.GoogleAuth({
            keyFile: this.keyFilePath,
            scopes: ['https://www.googleapis.com/auth/chat.bot'],
        });

        this.auth = await auth.getClient();
        this.chat = google.chat({ version: 'v1', auth: this.auth });
        console.log('[GoogleChat] Provider initialized with service account.');
    }

    /**
     * Handles incoming message from Google Chat Webhook
     */
    async handleEvent(event) {
        console.log('[GoogleChat] Received event:', event.type);

        if (event.type === 'ADDED_TO_SPACE') {
            return { text: 'Thanks for adding me! Type /help to see what I can do.' };
        }

        if (event.type === 'MESSAGE' && event.message.text) {
            const userText = event.message.text;
            const replyText = await commands.handleCommand(userText);
            
            if (replyText) {
                return { text: replyText };
            }
        }

        return null;
    }

    /**
     * Proactive message sending (e.g. for scheduler)
     * @param {string} spaceName - Format: spaces/XXXXXXXXXXXX
     * @param {string} text - Message content
     */
    async sendMessage(spaceName, text) {
        if (!this.chat) throw new Error('Google Chat provider not initialized');
        
        try {
            await this.chat.spaces.messages.create({
                parent: spaceName,
                requestBody: { text }
            });
            console.log(`[GoogleChat] Message sent to ${spaceName}`);
        } catch (err) {
            console.error('[GoogleChat] Failed to send message:', err.message);
            throw err;
        }
    }
}

module.exports = new GoogleChatProvider();
