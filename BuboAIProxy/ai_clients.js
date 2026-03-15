const axios = require('axios');

async function callGemini(prompt, apiKey, model = 'gemini-1.5-pro') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const data = {
        contents: [{ parts: [{ text: prompt }] }]
    };

    try {
        const response = await axios.post(url, data);
        const text = response.data.candidates[0].content.parts[0].text;
        return { success: true, text };
    } catch (error) {
        return { success: false, error: error.response ? error.response.data : error.message };
    }
}

async function callDeepSeek(prompt, apiKey, apiUrl = 'https://api.deepseek.com/v1', model = 'deepseek-chat') {
    const url = `${apiUrl}/chat/completions`;
    const data = {
        model: model,
        messages: [{ role: 'user', content: prompt }]
    };

    try {
        const response = await axios.post(url, data, {
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
        });
        const text = response.data.choices[0].message.content;
        return { success: true, text };
    } catch (error) {
        return { success: false, error: error.response ? error.response.data : error.message };
    }
}

module.exports = {
    callGemini,
    callDeepSeek
};
