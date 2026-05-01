// Tear down any RAF loops + WebAudio graph attached to a media node's area.
// Safe to call on any element (no-op if nothing was attached).
function destroyMediaInArea(area) {
    if (!area) return;
    if (typeof area._trimCleanup === 'function') { try { area._trimCleanup(); } catch(e){} area._trimCleanup = null; }
    if (typeof area._analyserCleanup === 'function') { try { area._analyserCleanup(); } catch(e){} area._analyserCleanup = null; }
    area._trimState = null;
}

// Walk a node element, detach every media-related cleanup inside it.
function destroyMediaInNode(nodeEl) {
    if (!nodeEl) return;
    nodeEl.querySelectorAll('.node-video-area').forEach(destroyMediaInArea);
}

function loadVid(e, input) {
    const file = e.target.files[0]; if (!file) return;
    const isAudio = file.type.startsWith('audio/');
    const reader = new FileReader();
    reader.onload = ev => {
        const area = input.closest('.node-video-area');
        area.querySelector('.video-ph').style.display = 'none';
        destroyMediaInArea(area);
        area.querySelectorAll('video, audio, canvas, .media-trim').forEach(el => el.remove());
        area.classList.remove('has-audio', 'has-video');
        if (isAudio) {
            buildAudioUI(area, ev.target.result);
        } else {
            area.classList.add('has-video');
            const vid = document.createElement('video');
            vid.controls = false;
            vid.src = ev.target.result;
            vid.style.cursor = 'pointer';
            vid.addEventListener('mousedown', e => e.stopPropagation());
            vid.addEventListener('click', e => {
                e.stopPropagation();
                if (vid.paused) vid.play(); else vid.pause();
            });
            area.appendChild(vid);
            attachTrim(area, vid);
        }
        saveState();
    };
    reader.readAsDataURL(file);
}

let _audioCtx = null;
function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
}

function buildAudioUI(area, src, trimData) {
    area.classList.add('has-audio');
    const canvas = document.createElement('canvas');
    canvas.className = 'audio-waveform';
    const audio = document.createElement('audio');
    audio.className = 'audio-player';
    audio.controls = true;
    audio.src = src;
    canvas.addEventListener('mousedown', e => e.stopPropagation());
    canvas.addEventListener('click', e => {
        e.stopPropagation();
        if (audio.paused) audio.play(); else audio.pause();
    });
    audio.addEventListener('mousedown', e => e.stopPropagation());
    area.appendChild(canvas);
    area.appendChild(audio);
    setupAnalyser(area, src, canvas, audio);
    attachTrim(area, audio, trimData);
}

function attachTrim(area, media, trimData) {
    const state = {
        trimStart: (trimData && typeof trimData.trimStart === 'number') ? trimData.trimStart : 0,
        trimEnd: (trimData && typeof trimData.trimEnd === 'number') ? trimData.trimEnd : 0,
        cuts: (trimData && Array.isArray(trimData.cuts)) ? trimData.cuts.map(c => [c[0], c[1]]) : []
    };
    area._trimState = state;

    const bar = document.createElement('div');
    bar.className = 'media-trim';
    bar.innerHTML = `<div class="media-trim-track" tabindex="0" title="Double-click: add cut · Right-click cut: delete · I/O set trim in/out · X add cut at playhead"><div class="media-trim-playhead"></div></div>`;
    area.appendChild(bar);
    const track = bar.querySelector('.media-trim-track');
    const playhead = bar.querySelector('.media-trim-playhead');

    track.addEventListener('mousedown', e => e.stopPropagation());
    track.addEventListener('click', e => e.stopPropagation());

    const duration = () => (isFinite(media.duration) && media.duration > 0) ? media.duration : (state.trimEnd || 0);
    const pct = t => { const d = duration(); return d ? (Math.max(0, Math.min(d, t)) / d) * 100 : 0; };
    const timeFromX = x => {
        const r = track.getBoundingClientRect();
        const d = duration();
        return Math.max(0, Math.min(d, ((x - r.left) / r.width) * d));
    };

    function render() {
        [...track.querySelectorAll('.media-trim-cut, .media-trim-handle')].forEach(el => el.remove());
        const d = duration(); if (!d) return;
        const end = state.trimEnd || d;

        if (state.trimStart > 0) {
            const c = document.createElement('div');
            c.className = 'media-trim-cut';
            c.style.left = '0%';
            c.style.width = pct(state.trimStart) + '%';
            track.appendChild(c);
        }
        if (end < d) {
            const c = document.createElement('div');
            c.className = 'media-trim-cut';
            c.style.left = pct(end) + '%';
            c.style.width = (100 - pct(end)) + '%';
            track.appendChild(c);
        }
        state.cuts.forEach((cut, idx) => {
            const c = document.createElement('div');
            c.className = 'media-trim-cut';
            c.dataset.idx = idx;
            c.style.left = pct(cut[0]) + '%';
            c.style.width = Math.max(0, pct(cut[1]) - pct(cut[0])) + '%';
            c.title = 'Right-click to delete cut';
            c.addEventListener('contextmenu', e => {
                e.preventDefault();
                e.stopPropagation();
                state.cuts.splice(idx, 1);
                render();
                saveState();
            });
            c.addEventListener('mousedown', e => e.stopPropagation());
            track.appendChild(c);
        });

        const makeHandle = (t, role, idx) => {
            const h = document.createElement('div');
            h.className = 'media-trim-handle';
            h.dataset.role = role;
            if (idx !== undefined) h.dataset.idx = idx;
            h.style.left = pct(t) + '%';
            h.title = role;
            h.addEventListener('mousedown', ev => startDrag(ev, role, idx));
            track.appendChild(h);
        };
        makeHandle(state.trimStart, 'start');
        makeHandle(end, 'end');
        state.cuts.forEach((cut, idx) => {
            makeHandle(cut[0], 'cut-start', idx);
            makeHandle(cut[1], 'cut-end', idx);
        });
    }

    function startDrag(e, role, idx) {
        e.preventDefault();
        e.stopPropagation();
        const move = ev => {
            const t = timeFromX(ev.clientX);
            const d = duration();
            const end = state.trimEnd || d;
            if (role === 'start') state.trimStart = Math.min(t, end);
            else if (role === 'end') state.trimEnd = Math.max(t, state.trimStart);
            else if (role === 'cut-start') state.cuts[idx][0] = Math.max(0, Math.min(t, state.cuts[idx][1]));
            else if (role === 'cut-end') state.cuts[idx][1] = Math.min(d, Math.max(t, state.cuts[idx][0]));
            render();
            updatePlayhead();
        };
        const up = () => {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            state.cuts.sort((a, b) => a[0] - b[0]);
            render();
            saveState();
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    }

    function updatePlayhead() {
        playhead.style.left = pct(media.currentTime) + '%';
    }

    track.addEventListener('dblclick', e => {
        if (e.target !== track) return;
        e.stopPropagation();
        const t = timeFromX(e.clientX);
        const d = duration(); if (!d) return;
        const half = Math.max(0.2, Math.min(1.5, d / 40));
        const s = Math.max(0, t - half), en = Math.min(d, t + half);
        state.cuts.push([s, en]);
        state.cuts.sort((a, b) => a[0] - b[0]);
        render();
        saveState();
    });

    function skipIfNeeded() {
        const d = duration(); if (!d) return;
        const ct = media.currentTime;
        if (ct < state.trimStart - 0.02) { media.currentTime = state.trimStart; return; }
        const end = state.trimEnd || d;
        if (ct >= end - 0.02) { media.currentTime = state.trimStart; media.pause(); return; }
        for (const c of state.cuts) {
            if (ct >= c[0] - 0.02 && ct < c[1] - 0.02) { media.currentTime = c[1]; return; }
        }
    }

    let rafId = null;
    const tick = () => {
        skipIfNeeded();
        updatePlayhead();
        if (!media.paused && !media.ended) rafId = requestAnimationFrame(tick);
        else rafId = null;
    };
    const onPlay = () => { if (!rafId) rafId = requestAnimationFrame(tick); };
    const onTimeUpdate = () => { skipIfNeeded(); updatePlayhead(); };
    const onLoadedMeta = () => {
        if (!state.trimEnd || state.trimEnd > media.duration) state.trimEnd = media.duration;
        render();
        updatePlayhead();
    };
    media.addEventListener('play', onPlay);
    media.addEventListener('timeupdate', onTimeUpdate);
    media.addEventListener('seeked', updatePlayhead);
    media.addEventListener('loadedmetadata', onLoadedMeta);

    // Expose a cleanup hook so node deletion / media swap can kill this loop.
    area._trimCleanup = () => {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        media.removeEventListener('play', onPlay);
        media.removeEventListener('timeupdate', onTimeUpdate);
        media.removeEventListener('seeked', updatePlayhead);
        media.removeEventListener('loadedmetadata', onLoadedMeta);
        try { media.pause(); } catch(e){}
    };

    track.addEventListener('keydown', e => {
        const key = e.key.toLowerCase();
        if (key === 'i') { state.trimStart = media.currentTime; render(); saveState(); e.preventDefault(); }
        else if (key === 'o') { state.trimEnd = media.currentTime; render(); saveState(); e.preventDefault(); }
        else if (key === 'x') {
            const d = duration(); if (!d) return;
            const t = media.currentTime;
            const half = Math.max(0.2, Math.min(1.5, d / 40));
            state.cuts.push([Math.max(0, t - half), Math.min(d, t + half)]);
            state.cuts.sort((a, b) => a[0] - b[0]);
            render();
            saveState();
            e.preventDefault();
        }
    });

    if (media.readyState >= 1) {
        if (!state.trimEnd || state.trimEnd > media.duration) state.trimEnd = media.duration;
        render();
    }
}

async function setupAnalyser(area, src, canvas, audio) {
    // Precompute static peaks for the paused/idle view.
    try {
        const buf = await (await fetch(src)).arrayBuffer();
        const ctx = getAudioCtx();
        const audioBuf = await ctx.decodeAudioData(buf.slice(0));
        canvas._peaks = computePeaks(audioBuf, 90);
        drawStatic(canvas, audio);
    } catch (err) {
        console.warn('Audio decode failed', err);
    }

    let analyser = null, dataArr = null, rafId = null, source = null;

    const connect = () => {
        if (analyser) return;
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        try {
            source = ctx.createMediaElementSource(audio);
            analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.72;
            dataArr = new Uint8Array(analyser.frequencyBinCount);
            source.connect(analyser);
            analyser.connect(ctx.destination);
        } catch (e) { /* already connected */ }
    };

    const tick = () => {
        if (audio.paused || audio.ended) { rafId = null; drawStatic(canvas, audio); return; }
        drawLive(canvas, audio, analyser, dataArr);
        rafId = requestAnimationFrame(tick);
    };

    const onPlay = () => { connect(); if (!rafId) rafId = requestAnimationFrame(tick); };
    const onPause = () => drawStatic(canvas, audio);
    const onTimeUpdate = () => { if (audio.paused) drawStatic(canvas, audio); };
    const onSeeked = () => drawStatic(canvas, audio);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('seeked', onSeeked);

    let ro = null;
    if (window.ResizeObserver) {
        ro = new ResizeObserver(() => { if (audio.paused) drawStatic(canvas, audio); });
        ro.observe(canvas);
    }

    // Cleanup: cancel RAF, disconnect WebAudio graph, drop listeners + observer.
    if (area) area._analyserCleanup = () => {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        audio.removeEventListener('play', onPlay);
        audio.removeEventListener('pause', onPause);
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('seeked', onSeeked);
        if (ro) { try { ro.disconnect(); } catch(e){} }
        try { if (source) source.disconnect(); } catch(e){}
        try { if (analyser) analyser.disconnect(); } catch(e){}
        analyser = null; source = null; dataArr = null;
    };
}

function computePeaks(audioBuf, bars) {
    const chan = audioBuf.getChannelData(0);
    const step = Math.max(1, Math.floor(chan.length / bars));
    const peaks = new Array(bars);
    for (let i = 0; i < bars; i++) {
        let max = 0;
        const start = i * step;
        const end = Math.min(start + step, chan.length);
        for (let j = start; j < end; j++) {
            const v = Math.abs(chan[j]);
            if (v > max) max = v;
        }
        peaks[i] = max;
    }
    return peaks;
}

function sizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const H = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    return { W, H, dpr };
}

function drawStatic(canvas, audio) {
    const peaks = canvas._peaks; if (!peaks) return;
    const { W, H, dpr } = sizeCanvas(canvas);
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, W, H);
    const bars = peaks.length;
    const gap = Math.max(1, 2 * dpr);
    const barW = Math.max(1, (W - gap * (bars - 1)) / bars);
    const progress = (audio.duration > 0) ? audio.currentTime / audio.duration : 0;
    const playX = progress * W;
    const mid = H / 2;
    for (let i = 0; i < bars; i++) {
        const x = i * (barW + gap);
        const h = Math.max(2, peaks[i] * H * 0.9);
        const played = (x + barW / 2) < playX;
        g.fillStyle = played ? '#ff4a52' : 'rgba(192,57,63,0.38)';
        g.fillRect(x, mid - h / 2, barW, h);
    }
    if (playX > 0 && playX < W) {
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillRect(playX - dpr * 0.5, 0, dpr, H);
    }
}

function drawLive(canvas, audio, analyser, dataArr) {
    const { W, H, dpr } = sizeCanvas(canvas);
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, W, H);
    const mid = H / 2;
    if (!analyser || !dataArr) return;
    analyser.getByteFrequencyData(dataArr);
    // Skip the very top bins — they're usually silent at 44.1kHz audio.
    const bins = Math.floor(dataArr.length * 0.85);
    const gap = Math.max(1, dpr);
    const barW = Math.max(1, (W - gap * (bins - 1)) / bins);
    for (let i = 0; i < bins; i++) {
        const v = dataArr[i] / 255;
        const h = Math.max(2, v * H * 0.95);
        const x = i * (barW + gap);
        g.fillStyle = '#ff4a52';
        g.fillRect(x, mid - h / 2, barW, h);
    }
    const progress = (audio.duration > 0) ? audio.currentTime / audio.duration : 0;
    const playX = progress * W;
    if (playX > 0 && playX < W) {
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillRect(playX - dpr * 0.5, 0, dpr, H);
    }
}

function handleMalikKey(e, input) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMalik(input.nextElementSibling);
    }
}

const MALIK_PROVIDERS = {
    free:      { label: 'Free (Pollinations, no key)', needsKey: false },
    gemini:    { label: 'Google Gemini 2.5 Flash',     needsKey: true },
    groq:      { label: 'Groq Llama 3.3 70B',          needsKey: true,
                 defaultEndpoint: 'https://api.groq.com/openai/v1/chat/completions',
                 defaultModel: 'llama-3.3-70b-versatile' },
    openai:    { label: 'OpenAI GPT-4o-mini',          needsKey: true,
                 defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
                 defaultModel: 'gpt-4o-mini' },
    anthropic: { label: 'Anthropic Claude Sonnet',     needsKey: true },
    manus:     { label: 'Manus (agent, async)',        needsKey: true, needsModel: true,
                 defaultModel: 'manus-1.6' },
    custom:    { label: 'Custom (OpenAI-compatible)',  needsKey: true, needsEndpoint: true, needsModel: true }
};

function handleMalikProvider(sel) {
    const p = sel.value;
    localStorage.setItem('malik_provider', p);
    const cfg = MALIK_PROVIDERS[p] || MALIK_PROVIDERS.free;
    const area = sel.closest('.node-malik-area');
    const keyIn = area.querySelector('.malik-key');
    const epIn = area.querySelector('.malik-endpoint');
    const mdIn = area.querySelector('.malik-model');
    keyIn.style.display = cfg.needsKey ? '' : 'none';
    keyIn.value = localStorage.getItem('malik_key_' + p) || '';
    epIn.style.display = cfg.needsEndpoint ? '' : 'none';
    mdIn.style.display = cfg.needsModel ? '' : 'none';
    if (cfg.needsEndpoint) {
        epIn.value = localStorage.getItem('malik_endpoint_' + p) || cfg.defaultEndpoint || '';
    }
    if (cfg.needsModel) {
        mdIn.value = localStorage.getItem('malik_model_' + p) || cfg.defaultModel || '';
    }
}
