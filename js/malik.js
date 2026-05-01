
function saveMalikField(input, kind) {
    const area = input.closest('.node-malik-area');
    const provider = area.querySelector('.malik-provider').value;
    if (kind === 'key') localStorage.setItem('malik_key_' + provider, input.value.trim());
    else if (kind === 'endpoint') localStorage.setItem('malik_endpoint_' + provider, input.value.trim());
    else if (kind === 'model') localStorage.setItem('malik_model_' + provider, input.value.trim());
}

function gatherMalikContext(area) {
    const nodeId = parseInt(area.closest('.node').dataset.id);
    let contextText = '';
    const imageParts = [];
    const inConns = connections.filter(c => c.to === nodeId || c.from === nodeId);
    for (const c of inConns) {
        const targetId = c.to === nodeId ? c.from : c.to;
        const srcNode = document.getElementById('node-' + targetId);
        if (!srcNode) continue;
        const txt = srcNode.querySelector('.node-text-input');
        if (txt && txt.value) contextText += txt.value + '\n\n';
        const img = srcNode.querySelector('.node-img-area img');
        if (img && img.src) {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                canvas.getContext('2d').drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                imageParts.push({
                    base64: dataUrl.split(',')[1],
                    dataUrl,
                    mimeType: 'image/jpeg'
                });
            } catch (e) {
                console.error('Failed to extract image context:', e);
            }
        }
    }
    return { contextText, imageParts };
}

async function callPollinations(prompt) {
    const res = await fetch('https://text.pollinations.ai/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'openai', messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'Pollinations error');
    if (!data.choices?.[0]) throw new Error('Unexpected response');
    return data.choices[0].message.content;
}

async function callGemini(key, prompt, imageParts) {
    const parts = [
        ...imageParts.map(ip => ({ inlineData: { data: ip.base64, mimeType: ip.mimeType } })),
        { text: prompt }
    ];
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.candidates?.[0]) throw new Error('Unexpected response');
    return data.candidates[0].content.parts[0].text;
}

async function callAnthropic(key, prompt, imageParts) {
    const content = [
        ...imageParts.map(ip => ({
            type: 'image',
            source: { type: 'base64', media_type: ip.mimeType, data: ip.base64 }
        })),
        { type: 'text', text: prompt }
    ];
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            messages: [{ role: 'user', content }]
        })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.content?.[0]) throw new Error('Unexpected response');
    return data.content.map(c => c.text || '').join('');
}

async function callManus(key, prompt, profile, loading) {
    const createRes = await fetch('https://api.manus.ai/v2/task.create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-manus-api-key': key },
        body: JSON.stringify({
            message: { content: [{ type: 'text', text: prompt }] },
            agent_profile: profile || 'manus-1.6'
        })
    });
    const createData = await createRes.json();
    if (createData.error) throw new Error(createData.error.message || JSON.stringify(createData.error));
    if (!createData.task_id) throw new Error('Manus: no task_id returned');
    const taskId = createData.task_id;
    if (loading) loading.textContent = 'Manus agent working...';

    const deadline = Date.now() + 5 * 60 * 1000;
    let lastSeenLen = 0;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 3000));
        const listRes = await fetch(`https://api.manus.ai/v2/task.listMessages?task_id=${encodeURIComponent(taskId)}&order=desc&limit=50`, {
            headers: { 'x-manus-api-key': key }
        });
        const listData = await listRes.json();
        const events = listData.messages || listData.events || listData.data || [];
        const statusEv = events.find(e => e && e.type === 'status_update');
        const status = statusEv?.status_update?.agent_status;
        if (loading && events.length !== lastSeenLen) {
            lastSeenLen = events.length;
            loading.textContent = `Manus agent working (${status || 'running'})...`;
        }
        if (status === 'stopped') {
            const assistantEv = events.find(e => e && e.type === 'assistant_message');
            const am = assistantEv?.assistant_message || assistantEv;
            const txt = am?.text
                || am?.content?.find?.(c => c?.type === 'text')?.text
                || (Array.isArray(am?.content) ? am.content.map(c => c?.text || '').join('') : null);
            if (txt) return txt;
            return 'Manus task finished. View at: ' + (createData.task_url || taskId);
        }
        if (status === 'error') throw new Error('Manus agent reported error');
    }
    throw new Error('Manus task timed out after 5 minutes. Task URL: ' + (createData.task_url || taskId));
}

async function callOpenAICompat(endpoint, key, model, prompt, imageParts) {
    const userContent = imageParts.length
        ? [
            ...imageParts.map(ip => ({ type: 'image_url', image_url: { url: ip.dataUrl } })),
            { type: 'text', text: prompt }
          ]
        : prompt;
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + key
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: userContent }]
        })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    if (!data.choices?.[0]) throw new Error('Unexpected response');
    return data.choices[0].message.content;
}

async function sendMalik(btn) {
    const area = btn.closest('.node-malik-area');
    const input = area.querySelector('.malik-input');
    const chat = area.querySelector('.malik-chat');
    const provider = area.querySelector('.malik-provider').value;
    const key = (area.querySelector('.malik-key').value || '').trim();
    const endpoint = (area.querySelector('.malik-endpoint').value || '').trim();
    const model = (area.querySelector('.malik-model').value || '').trim();
    const prompt = input.value.trim();
    if (!prompt) return;

    appendMsg(chat, 'user', prompt);
    input.value = '';
    const loading = appendMsg(chat, 'ai', 'Thinking...');

    const { contextText, imageParts } = gatherMalikContext(area);
    const finalPrompt = contextText
        ? `Context from connected text nodes:\n${contextText}\n\nUser: ${prompt}`
        : prompt;

    const cfg = MALIK_PROVIDERS[provider] || MALIK_PROVIDERS.free;

    try {
        let text;
        if (provider === 'free' || (cfg.needsKey && !key)) {
            loading.textContent = 'Thinking (Free Keyless Mode)...';
            text = await callPollinations(finalPrompt);
        } else if (provider === 'gemini') {
            text = await callGemini(key, finalPrompt, imageParts);
        } else if (provider === 'anthropic') {
            text = await callAnthropic(key, finalPrompt, imageParts);
        } else if (provider === 'manus') {
            text = await callManus(key, finalPrompt, model || cfg.defaultModel, loading);
        } else {
            const ep = endpoint || cfg.defaultEndpoint;
            const mdl = model || cfg.defaultModel;
            if (!ep || !mdl) throw new Error('Endpoint and model are required');
            text = await callOpenAICompat(ep, key, mdl, finalPrompt, imageParts);
        }
        loading.remove();
        appendMsg(chat, 'ai', text);
    } catch (err) {
        loading.remove();
        appendMsg(chat, 'error', 'Error: ' + (err.message || err));
    }
}

function appendMsg(chat, type, text) {
    const div = document.createElement('div');
    div.className = 'malik-msg ' + type;
    div.textContent = text;
    chat.appendChild(div);
    setTimeout(() => chat.scrollTop = chat.scrollHeight, 10);
    saveState();
    return div;
}

