// openaiApi.js
import config from './config';
import { fetch } from 'wix-fetch';
import { getSecret } from 'backend/secrets.web';

let OPENAI_KEY;

async function loadKey() {
    if (!OPENAI_KEY) {
        OPENAI_KEY = await getSecret('OPENAI_KEY');
    }
}

export async function chatCompletion(prompt, model = config.openaiModel, options = {}) {
    await loadKey();

    const body = {
        model,
        messages: [{ role: 'user', content: prompt }],
        ...options
    };

    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_KEY}`
            },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            const data = await res.json();
            return data.choices[0].message.content;
        }

        const errorText = await res.text();

        const retryable = [500, 502, 503, 504].includes(res.status);

       

        if (!retryable || attempt === MAX_RETRIES) {
            throw new Error(`OpenAI API Error [${res.status}]: ${errorText}`);
        }

        const delay = 1000 * attempt; 
        await new Promise(r => setTimeout(r, delay));
    }
}
