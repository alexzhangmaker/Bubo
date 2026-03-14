const TelegramBot = require('node-telegram-bot-api');
const commands = require('./commands');

class TelegramProvider {
    constructor() {
        this.token = process.env.TELEGRAM_BOT_TOKEN;
        this.bot = null;
    }

    async init() {
        if (!this.token) {
            console.warn('[Telegram] No TELEGRAM_BOT_TOKEN found in .env. Telegram bot will not start.');
            return;
        }

        try {
            // Create a bot that uses 'polling' to fetch new updates
            this.bot = new TelegramBot(this.token, { polling: true });

            console.log('[Telegram] Provider initialized with Long Polling.');

            // Listen for any kind of message. There are different kinds of
            // messages.
            this.bot.on('message', (msg) => {
                const chatId = msg.chat.id;
                const userText = msg.text;

                if (!userText) return;

                console.log(`[Telegram] Received message from ${chatId}: ${userText}`);

                // handleCommand is now async
                commands.handleCommand(userText).then(replyText => {
                    if (replyText) {
                        this.bot.sendMessage(chatId, replyText);
                    }
                }).catch(err => console.error('[Telegram] Command Error:', err));
            });

            this.bot.on('polling_error', (error) => {
                console.error('[Telegram] Polling error:', error.code);
            });

        } catch (err) {
            console.error('[Telegram] Initialization failed:', err.message);
        }
    }

    async sendMessage(chatId, text) {
        if (!this.bot) throw new Error('Telegram bot not initialized');
        try {
            await this.bot.sendMessage(chatId, text);
            console.log(`[Telegram] Message sent to ${chatId}`);
        } catch (err) {
            console.error('[Telegram] Failed to send message:', err.message);
            throw err;
        }
    }
}

module.exports = new TelegramProvider();
