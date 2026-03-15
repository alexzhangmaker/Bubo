const db = require('./db');
const ai = require('./ai_clients');

async function processQueue() {
    try {
        const pending = await db.getPendingRequests();
        if (pending.length === 0) return;

        for (const req of pending) {
            console.log(`Processing request ${req.uuid} (${req.command})...`);
            await db.updateRequestStatus(req.uuid, 'processing');

            const cmdConfig = await db.getCommandConfig(req.command);
            if (!cmdConfig) {
                await db.updateRequestStatus(req.uuid, 'failed', null, 'Command not found in dictionary');
                continue;
            }

            const params = JSON.parse(req.params || '{}');
            let prompt = cmdConfig.prompt_template;
            
            // Basic parameter substitution
            for (const key in params) {
                prompt = prompt.replace(`{{${key}}}`, params[key]);
            }

            let result;
            if (cmdConfig.model === 'gemini') {
                result = await ai.callGemini(prompt, process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL);
            } else if (cmdConfig.model === 'deepseek') {
                result = await ai.callDeepSeek(prompt, process.env.DEEPSEEK_API_KEY, process.env.DEEPSEEK_API_URL, process.env.DEEPSEEK_MODEL);
            } else {
                await db.updateRequestStatus(req.uuid, 'failed', null, `Unsupported model: ${cmdConfig.model}`);
                continue;
            }

            if (result.success) {
                // Here you can add specialized validation logic based on req.command if needed
                await db.updateRequestStatus(req.uuid, 'completed', { text: result.text });
                console.log(`Request ${req.uuid} completed.`);
            } else {
                await db.updateRequestStatus(req.uuid, 'failed', null, JSON.stringify(result.error));
                console.log(`Request ${req.uuid} failed.`);
            }
        }
    } catch (err) {
        console.error('Error in dispatcher:', err);
    }
}

function startDispatcher(intervalMs = 5000) {
    console.log(`AI Proxy Dispatcher started with interval ${intervalMs}ms`);
    setInterval(processQueue, intervalMs);
}

module.exports = {
    startDispatcher
};
