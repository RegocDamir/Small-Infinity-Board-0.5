// ═══════════════════════════════════════════
//  CREATE NODE
// ═══════════════════════════════════════════
function createNode(type, x, y) {
    const id = ++nid;
    const w = type === 'html' ? 340 : 210;
    const h = type === 'html' ? 280 : 170;
    const data = { id, type, x, y, w, h };
    nodes.push(data);
    mountNode(data);
    return id;
}

function mountNode(data) {
    const el = document.createElement('div');
    el.className = 'node';
    el.id = 'node-' + data.id;
    el.dataset.id = data.id;
    el.style.left = data.x + 'px';
    el.style.top = data.y + 'px';
    el.style.width = data.w + 'px';
    el.style.height = data.h + 'px';

    const label = { text: 'TEXT', image: 'IMAGE', video: 'VIDEO', malik: 'MALIK', container: 'GROUP', html: 'HTML' }[data.type] || 'NODE';

    el.innerHTML = `
    <div class="node-inner">
      <div class="node-header">
<input class="node-title" type="text" placeholder="${data.type === 'container' ? 'Group Title' : 'Untitled'}" onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" oninput="saveState(true)" onblur="saveState()">
<span style="display:flex;align-items:center;gap:5px;flex-shrink:0">
  ${data.type === 'html' ? `<button class="node-act-btn node-html-toggle" title="Run / Edit" onmousedown="event.stopPropagation()" onclick="event.stopPropagation();toggleHtmlPlay(${data.id})">▶</button>` : ''}
  <button class="node-act-btn" onmousedown="event.stopPropagation()" onclick="openCtx(event,${data.id})"><span class="dot-circle"></span><span class="dot-circle"></span><span class="dot-circle"></span></button>
</span>
      </div>
      <div class="node-body">
${nodeContent(data.type, data.id)}
      </div>
    </div>
    ${(data.type !== 'container' && data.type !== 'stack') ? `
    <div class="node-back-face">
      <svg width="52" height="52" viewBox="0 0 15 15" fill="none" style="opacity:0.22;color:#fff">
<path d="M1.5 3.5L7.5 8.5L1.5 13.5Z" fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-linejoin="round"/>
<path d="M13.5 3.5L7.5 8.5L13.5 13.5Z" fill="currentColor" opacity="0.45" stroke="currentColor" stroke-width="0.5" stroke-linejoin="round"/>
<line x1="7.5" y1="3" x2="7.5" y2="14" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 2" stroke-linecap="round"/>
      </svg>
    </div>
    <div class="node-corner-icons">
    <button class="node-corner-icon is-focus" title="Focus this node" onmousedown="event.stopPropagation()" ontouchstart="event.stopPropagation()" onclick="event.stopPropagation();toggleFocusOrb(${data.id})"><img src="icon-star.svg" alt="" draggable="false"></button>
  </div>
    <div class="conn-port port-right"  data-nid="${data.id}" data-side="right"></div>
    <div class="conn-port port-left"   data-nid="${data.id}" data-side="left"></div>
    <div class="conn-port port-top"    data-nid="${data.id}" data-side="top"></div>
    <div class="conn-port port-bottom" data-nid="${data.id}" data-side="bottom"></div>
    ` : ''}
    <div class="resize-handle edge-n"    data-nid="${data.id}" data-dir="n"></div>
    <div class="resize-handle edge-s"    data-nid="${data.id}" data-dir="s"></div>
    <div class="resize-handle edge-e"    data-nid="${data.id}" data-dir="e"></div>
    <div class="resize-handle edge-w"    data-nid="${data.id}" data-dir="w"></div>
    <div class="resize-handle corner-nw" data-nid="${data.id}" data-dir="nw"></div>
    <div class="resize-handle corner-ne" data-nid="${data.id}" data-dir="ne"></div>
    <div class="resize-handle corner-se" data-nid="${data.id}" data-dir="se"></div>
    <div class="resize-handle corner-sw" data-nid="${data.id}" data-dir="sw"></div>
  `;

    if (data.type === 'stack') el.classList.add('node-is-stack');
    if (data.flipped) el.classList.add('node-flipped');

    scene.appendChild(el);
    scene.appendChild(svgEl); // keep SVG last so lines paint above nodes

    // Satellite ear for stack nodes
    if (data.type === 'stack') {
        const ear = document.createElement('div');
        ear.className = 'stack-ear';
        ear.id = 'stack-ear-' + data.id;
        ear.dataset.nid = data.id;
        ear.innerHTML = `
          <div class="stack-ear-grab"></div>
          <button class="stack-ear-eject" title="Eject top node (Ctrl+E)" onmousedown="event.stopPropagation()" onclick="ejectOneFromStack(${data.id})">
            <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 2L13.5 9.5H2.5L8 2Z"/>
              <rect x="2.5" y="11.5" width="11" height="2" rx="1"/>
            </svg>
          </button>
        `;
        ear.style.left = (data.x + data.w + 10) + 'px';
        ear.style.top  = data.y + 'px';
        scene.insertBefore(ear, svgEl);
        updateEarScale(ear);
        makeEarDraggable(ear, el, data);
    }

    makeDraggable(el, data);
    if (data.type !== 'stack') initPorts(el);
    initResizeHandles(el, data);
}

function nodeContent(type, id) {
    if (type === 'text') return `<textarea class="node-text-input" placeholder="Type something..." onmousedown="event.stopPropagation()" oninput="saveState(true)" onblur="saveState()"></textarea>`;
    if (type === 'malik') {
        // one-time migration from legacy single-key storage
        const legacyKey = localStorage.getItem('malik_api_key');
        if (legacyKey && !localStorage.getItem('malik_key_gemini')) {
            localStorage.setItem('malik_key_gemini', legacyKey);
        }
        const savedProvider = localStorage.getItem('malik_provider') || 'free';
        const pCfg = MALIK_PROVIDERS[savedProvider] || MALIK_PROVIDERS.free;
        const savedKey = localStorage.getItem('malik_key_' + savedProvider) || '';
        const savedEndpoint = localStorage.getItem('malik_endpoint_' + savedProvider) || pCfg.defaultEndpoint || '';
        const savedModel = localStorage.getItem('malik_model_' + savedProvider) || pCfg.defaultModel || '';
        const opts = Object.entries(MALIK_PROVIDERS).map(([v, c]) =>
            `<option value="${v}"${v === savedProvider ? ' selected' : ''}>${c.label}</option>`
        ).join('');
        const showKey = pCfg.needsKey ? '' : 'display:none';
        const showEp = pCfg.needsEndpoint ? '' : 'display:none';
        const showMd = pCfg.needsModel ? '' : 'display:none';
        return `
    <div class="node-malik-area">
      <div class="malik-settings">
<select class="malik-provider" onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" onchange="handleMalikProvider(this)">${opts}</select>
<input type="password" class="malik-key" placeholder="API key" value="${savedKey}" style="${showKey}" onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" oninput="saveMalikField(this,'key')">
<input type="text" class="malik-endpoint" placeholder="Endpoint URL" value="${savedEndpoint}" style="${showEp}" onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" oninput="saveMalikField(this,'endpoint')">
<input type="text" class="malik-model" placeholder="Model / profile" value="${savedModel}" style="${showMd}" onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" oninput="saveMalikField(this,'model')">
      </div>
      <div class="malik-chat" id="chat-${id}">
<div class="malik-msg ai">Hi! I am Malik. Connect text nodes as context.</div>
      </div>
      <div class="malik-input-wrap">
<textarea class="malik-input" placeholder="Ask Malik..." onmousedown="event.stopPropagation()" onkeydown="handleMalikKey(event, this)"></textarea>
<button class="malik-btn" onmousedown="event.stopPropagation()" onclick="sendMalik(this)">▶</button>
      </div>
    </div>`;
    }
    if (type === 'image') return `
    <div class="node-img-area">
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
<rect x="2" y="3" width="18" height="16" rx="3" stroke="currentColor" stroke-width="1.4"/>
<circle cx="7" cy="8.5" r="2" fill="currentColor"/>
<path d="M2 15l5-4 4 3.5 3-2.5 6 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
      <span>right-click to upload</span>
      <input type="file" accept="image/*" onchange="loadImg(event,this)">
    </div>`;
    if (type === 'video') return `
    <div class="node-video-area">
      <div class="video-ph">
<svg width="26" height="26" viewBox="0 0 26 26" fill="none">
  <rect x="2" y="5" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.4"/>
  <path d="M18 10l6-3v12l-6-3V10z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
</svg>
<span>right-click to upload</span>
      </div>
      <input type="file" accept="video/*,audio/*" onchange="loadVid(event,this)">
    </div>`;
    if (type === 'html') return `
    <div class="node-html-area">
      <textarea class="node-html-code" placeholder="<!-- HTML / CSS / JS -->" onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" oninput="saveState(true)" onblur="saveState()"></textarea>
      <iframe class="node-html-frame" sandbox="allow-scripts allow-same-origin"></iframe>
    </div>`;
    if (type === 'container') return `<div class="node-container-area"></div>`;
    if (type === 'stack') return `
    <div class="node-stack-area" id="stack-area-${id}">
      <div class="stack-empty-hint">
<svg viewBox="0 0 514 511.58" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="nonzero" d="M289.035 13.017L353.246.121c4.784-.988 7.75 4.319 4.484 7.458l-27.629 26.492 23.196 23.479c2.223 2.166 3.47 4.044 3.398 6.058-.086 2.389-1.665 4.04-5.108 5.22l-1.277.399c-23.874 5.765-50.334 9.945-74.657 14.724-6.673 1.386-10.599-4.402-5.446-9.371l26.343-25.406-.878-.834c-5.589-5.311-15.591-14.818-20.813-21.172-2.451-2.985-3.569-5.349-3.099-7.509.555-2.556 2.727-3.936 6.768-4.538l10.507-2.104zm-58.498 40.866c17.63 22.167 35.604 44.276 52.981 66.618 3.654 4.646 5.104 10.372 4.485 15.839-.622 5.506-3.327 10.783-7.974 14.479-16.212 12.887-32.609 25.611-48.901 38.407a7.533 7.533 0 01-10.481-1.152l-71.751-87.695a7.537 7.537 0 011.06-10.603l50.125-39.401a21.78 21.78 0 0115.958-4.517c5.504.627 10.778 3.347 14.498 8.025zm41.114 75.878l-52.895-66.51a6.583 6.583 0 00-4.427-2.431 6.751 6.751 0 00-4.941 1.397L165.422 96.78l62.21 76.039 43.03-33.781a6.463 6.463 0 002.379-4.348c.192-1.699-.247-3.468-1.361-4.885l-.029-.044zm175.24 163.054l-65.323-52.62c-1.366-1.095-3.082-1.534-4.733-1.357a6.358 6.358 0 00-4.297 2.32l-34.824 43.474 73.993 62.372 36.151-45.107c1.106-1.379 1.549-3.106 1.372-4.765a6.408 6.408 0 00-2.339-4.317zm-55.868-64.32l65.293 52.595c4.612 3.719 7.287 8.975 7.876 14.449a21.508 21.508 0 01-4.61 15.783l-41.074 51.22a7.509 7.509 0 01-10.575.914l-85.377-71.951a7.524 7.524 0 01-1.15-10.574l39.408-49.198c3.709-4.606 8.963-7.274 14.428-7.858a21.477 21.477 0 0115.751 4.595l.03.025zM356.93 417.439l4.893-5.549.403-.424c9.106-10.306 14.818-16.799 24.505-29.592l-74.123-62.468c-10.918 13.902-23.151 29.112-36.584 42.61-37.99 38.176-84.724 62.664-137.072 10.57-37.409-37.226-35.291-72.583-16.496-103.982 16.433-27.45 45.816-51.218 71.67-70.269l-61.266-75.052c-7.061 5.228-12.488 9.37-17.432 13.323-6.247 4.993-12.338 10.169-20.479 17.244-76.264 66.254-91.975 144.156-71.85 208.853 9.144 29.402 25.651 56.123 47.201 77.817 21.571 21.715 48.168 38.397 77.469 47.701 64.456 20.468 142.341 5.174 209.161-70.782zm16.203 4.408l-4.893 5.549c-71.394 81.155-155.28 97.283-225.009 75.141-31.676-10.058-60.375-28.038-83.595-51.414-23.241-23.397-41.042-52.217-50.91-83.943-21.761-69.959-5.157-153.864 76.384-224.701 7.924-6.884 14.069-12.097 20.95-17.598 6.915-5.527 13.989-10.886 23.649-17.962 3.212-2.35 7.742-1.796 10.28 1.324l71.081 87.073a7.53 7.53 0 01-1.68 10.515c-26.122 18.962-57.707 43.222-74.031 70.492-15.341 25.627-16.893 54.663 14.196 85.599 43.577 43.365 83.3 22.153 115.805-10.509 14.611-14.681 27.918-31.682 39.572-46.574l.815-1.021a7.508 7.508 0 0110.574-.914l85.193 71.799a7.519 7.519 0 011.521 10.485c-12.736 17.159-18.879 24.148-29.55 36.229l-.352.43zm70.793-252.908l64.212-12.897c4.785-.987 7.751 4.32 4.484 7.459l-27.629 26.492 23.196 23.479c2.223 2.166 3.47 4.044 3.397 6.058-.085 2.388-1.664 4.04-5.107 5.22l-1.277.399c-23.874 5.765-50.334 9.945-74.657 14.724-6.673 1.386-10.599-4.402-5.446-9.371l26.343-25.406-.878-.834c-5.588-5.311-15.591-14.818-20.813-21.172-2.451-2.985-3.568-5.349-3.099-7.509.555-2.556 2.727-3.936 6.768-4.538l10.506-2.104z"/>
</svg>
drag nodes here
      </div>
    </div>`;
    return '';
}

function loadImg(e, input) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const area = input.closest('.node-img-area');
        let img = area.querySelector('img');
        if (!img) { img = document.createElement('img'); img.draggable = false; area.appendChild(img); }
        img.draggable = false;
        img.src = ev.target.result;
        area.querySelectorAll('span,svg').forEach(el => el.style.display = 'none');
        saveState();
    };
    reader.readAsDataURL(file);
}
// ═══════════════════════════════════════════
//  FOCUS ORB  (lower-left corner — fly node into viewport, camera zooms in
//  so content is legible; stays until dismissed; exits to a random non-
//  overlapping spot)
// ═══════════════════════════════════════════
const _focusOrbState = new Map(); // id -> {origX, origY, origW, origH, origPan, origZoom}

const easeOutBack    = t => { const c1 = 1.30, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeOutCubic   = t => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function toggleFocusOrb(id) {
    const data = nodes.find(n => n.id === id);
    if (!data) return;
    const el = document.getElementById('node-' + id);
    if (!el) return;
    const orb = el.querySelector('.node-corner-icon.is-focus');
    const saved = _focusOrbState.get(id);

    if (saved) {
        // Dismiss: exact reverse of entry — same duration, mirrored easing,
        // node returns to its original spot (it never actually moved on entry,
        // only the camera did).
        _focusOrbState.delete(id);
        orb?.classList.remove('active');
        animateFocus(data, el, saved.origX, saved.origY, saved.origPan.x, saved.origPan.y, saved.origZoom, 560, easeInOutCubic, () => {
            el.style.zIndex = data.parentId ? 5 : '';
            saveState();
        });
        return;
    }

    // Enter: pan + zoom the camera so this node fills ~88% of the viewport.
    // Camera zoom (not node size) means text genuinely enlarges — readable.
    const vw = window.innerWidth, vh = window.innerHeight;
    const newZoom = Math.min(vw * 0.88 / data.w, vh * 0.88 / data.h);
    const cx = data.x + data.w / 2, cy = data.y + data.h / 2;
    const newPanX = vw / 2 - cx * newZoom;
    const newPanY = vh / 2 - cy * newZoom;

    _focusOrbState.set(id, {
        origX: data.x, origY: data.y, origW: data.w, origH: data.h,
        origPan: { x: pan.x, y: pan.y }, origZoom: zoom,
    });
    orb?.classList.add('active');
    el.style.zIndex = 9999;

    // Node canvas position unchanged on enter; only the camera moves.
    animateFocus(data, el, data.x, data.y, newPanX, newPanY, newZoom, 560, easeOutBack);
}

// Pick a landing spot (node's original canvas size) that doesn't overlap other nodes.
function findNonOverlappingSpot(id, origX, origY, w, h) {
    const others = nodes.filter(n => n.id !== id && !_focusOrbState.has(n.id));
    const pad = 30;
    const overlaps = (x, y) => others.some(o =>
        !(x + w + pad <= o.x || x >= o.x + o.w + pad ||
          y + h + pad <= o.y || y >= o.y + o.h + pad)
    );
    const MIN_DIST = Math.max(w, h) * 1.2;
    const MAX_DIST = Math.max(w, h) * 5 + 800;
    let best = null, bestScore = Infinity;
    for (let i = 0; i < 100; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist  = MIN_DIST + Math.random() * (MAX_DIST - MIN_DIST);
        const x = origX + Math.cos(angle) * dist;
        const y = origY + Math.sin(angle) * dist;
        if (!overlaps(x, y)) return { x, y };
        let score = 0;
        for (const o of others) {
            const ox = Math.max(0, Math.min(x + w, o.x + o.w) - Math.max(x, o.x));
            const oy = Math.max(0, Math.min(y + h, o.y + o.h) - Math.max(y, o.y));
            score += ox * oy;
        }
        if (score < bestScore) { bestScore = score; best = { x, y }; }
    }
    return best || { x: origX + 500, y: origY + 500 };
}

// Eased animation of both node position and camera pan/zoom.
function animateFocus(data, el, toX, toY, toPanX, toPanY, toZoom, dur, easeFn, onDone) {
    easeFn = easeFn || easeOutCubic;
    const fromX = data.x, fromY = data.y;
    const fromPanX = pan.x, fromPanY = pan.y, fromZoom = zoom;
    const t0 = performance.now();
    (function step(now) {
        const t = Math.min((now - t0) / dur, 1);
        const e = easeFn(t);
        data.x = fromX + (toX - fromX) * e;
        data.y = fromY + (toY - fromY) * e;
        el.style.left = data.x + 'px';
        el.style.top  = data.y + 'px';
        if (data.type === 'stack') positionEar(data);
        pan.x = fromPanX + (toPanX - fromPanX) * e;
        pan.y = fromPanY + (toPanY - fromPanY) * e;
        zoom  = fromZoom + (toZoom - fromZoom) * e;
        applyTransform(); updateDotGrid(); setZoomHud(zoom); redrawConnections();
        if (t < 1) requestAnimationFrame(step);
        else {
            data.x = toX; data.y = toY;
            el.style.left = toX + 'px'; el.style.top = toY + 'px';
            pan.x = toPanX; pan.y = toPanY; zoom = toZoom;
            applyTransform(); updateDotGrid(); setZoomHud(zoom); redrawConnections();
            if (onDone) onDone();
        }
    })(performance.now());
}

// ═══════════════════════════════════════════
//  DRAG NODES
// ═══════════════════════════════════════════
function positionEar(data) {
    const ear = document.getElementById('stack-ear-' + data.id);
    if (ear) {
        ear.style.left = (data.x + data.w + 10) + 'px';
        ear.style.top  = data.y + 'px';
    }
}

// Keep ear z-index always in lock-step with its node
function syncEarZ(data, z) {
    const ear = document.getElementById('stack-ear-' + data.id);
    if (ear) ear.style.zIndex = z;
}

function setStackFocus(id) {
    document.querySelectorAll('.stack-ear.ear-focused').forEach(e => e.classList.remove('ear-focused'));
    focusedStackId = id;
    if (id !== null) {
        const ear = document.getElementById('stack-ear-' + id);
        if (ear) ear.classList.add('ear-focused');
    }
}

function makeEarDraggable(ear, nodeEl, data) {
    ear.querySelector('.stack-ear-grab').addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.stopPropagation(); e.preventDefault();
        setStackFocus(data.id);
        const sx = e.clientX, sy = e.clientY, sl = data.x, st = data.y;
        nodeEl.style.zIndex = 50;
        ear.style.zIndex = 51;
        document.body.classList.add('is-dragging');
        const captureEl = document.documentElement;
        const pid = e.pointerId;
        try { captureEl.setPointerCapture(pid); } catch (_) {}
        const mv = e2 => {
            const dx = (e2.clientX - sx) / zoom;
            const dy = (e2.clientY - sy) / zoom;
            data.x = sl + dx; data.y = st + dy;
            nodeEl.style.left = data.x + 'px'; nodeEl.style.top = data.y + 'px';
            positionEar(data);
            redrawConnections();
        };
        const up = () => {
            nodeEl.style.zIndex = '';
            ear.style.zIndex = '';
            document.body.classList.remove('is-dragging');
            captureEl.removeEventListener('pointermove', mv);
            captureEl.removeEventListener('pointerup', up);
            captureEl.removeEventListener('pointercancel', up);
            try { captureEl.releasePointerCapture(pid); } catch (_) {}
            saveState();
        };
        captureEl.addEventListener('pointermove', mv);
        captureEl.addEventListener('pointerup', up);
        captureEl.addEventListener('pointercancel', up);
    });
}

function makeDraggable(el, data) {
    el.addEventListener('pointerdown', e => {
        if (e.button !== 0) return; // left button only
        // Flipped node: any click flips back (but still allow ports)
        if (el.classList.contains('node-flipped') && !e.target.closest('.conn-port,.resize-handle')) {
            e.stopPropagation(); e.preventDefault(); flipNode(data, el); return;
        }
        if (e.target.closest('textarea,input,select,button,.conn-port,.resize-handle,video,.node-img-area,.node-video-area,.node-title')) return;
        if (flipModeActive) {
            if (data.type === 'stack' || data.type === 'container') return;
            e.stopPropagation(); e.preventDefault();
            flipModeActive = false;
            document.getElementById('btn-flip-frame').classList.remove('flip-active');
            flipNode(data, el); return;
        }
        if (zoomModeActive && !zoomTarget) { e.stopPropagation(); e.preventDefault(); zoomToNode(data); return; }
        e.stopPropagation(); e.preventDefault();
        const sx = e.clientX, sy = e.clientY, sl = data.x, st = data.y;
        if (data.type !== 'container') { el.style.zIndex = 50; syncEarZ(data, 50); }
        document.body.classList.add('is-dragging');

        // Capture the pointer so events keep firing even if cursor crosses an
        // iframe, video, audio, or leaves the window entirely.
        const captureEl = document.documentElement;
        const pid = e.pointerId;
        try { captureEl.setPointerCapture(pid); } catch (_) {}

        // Pre-fetch children if this is a group
        const children = data.type === 'container' ? nodes.filter(n => n.parentId === data.id) : [];
        const childStarts = children.map(c => ({ id: c.id, x: c.x, y: c.y }));

        const mv = e2 => {
            const dx = (e2.clientX - sx) / zoom;
            const dy = (e2.clientY - sy) / zoom;

            data.x = sl + dx;
            data.y = st + dy;
            el.style.left = data.x + 'px'; el.style.top = data.y + 'px';

            // Move satellite ear if this is a stack node
            if (data.type === 'stack') positionEar(data);

            // Move children
            children.forEach((c, i) => {
                c.x = childStarts[i].x + dx;
                c.y = childStarts[i].y + dy;
                const cel = document.getElementById('node-' + c.id);
                if (cel) { cel.style.left = c.x + 'px'; cel.style.top = c.y + 'px'; }
            });

            redrawConnections();
        };
        const up = () => {
            if (data.type !== 'container') {
                const restoreZ = data.parentId ? 5 : '';
                el.style.zIndex = restoreZ;
                syncEarZ(data, restoreZ);
            }
            document.body.classList.remove('is-dragging');
            captureEl.removeEventListener('pointermove', mv);
            captureEl.removeEventListener('pointerup', up);
            captureEl.removeEventListener('pointercancel', up);
            try { captureEl.releasePointerCapture(pid); } catch (_) {}

            // If dragged a regular node, check if we dropped it into/out of a group
            if (data.type !== 'container') {
                handleNodeDropOverlap(data);
                tryAbsorbIntoStack(data);
            }

            saveState();
        };
        captureEl.addEventListener('pointermove', mv);
        captureEl.addEventListener('pointerup', up);
        captureEl.addEventListener('pointercancel', up);
    });
}

function handleNodeDropOverlap(data) {
    const el = document.getElementById('node-' + data.id);
    const cx = data.x + data.w / 2;
    const cy = data.y + data.h / 2;

    // Find all potential groups it could be dropped into
    const groups = nodes.filter(n => n.type === 'container');
    let targetGroup = null;

    // Reverse iterate to find top-most group if overlapping
    for (let i = groups.length - 1; i >= 0; i--) {
        const g = groups[i];
        if (cx > g.x && cx < g.x + g.w && cy > g.y && cy < g.y + g.h) {
            targetGroup = g;
            break;
        }
    }

    if (targetGroup) {
        // Attach to group
        if (data.parentId !== targetGroup.id) {
            data.parentId = targetGroup.id;
            el.style.zIndex = 5; syncEarZ(data, 5);
            el.classList.add('in-group');

            // Simple anti-eclipse nudge
            const siblings = nodes.filter(n => n.parentId === targetGroup.id && n.id !== data.id);
            siblings.forEach(sib => {
                if (Math.abs(sib.x - data.x) < 20 && Math.abs(sib.y - data.y) < 20) {
                    data.x += 40;
                    data.y += 40;
                    el.style.left = data.x + 'px';
                    el.style.top = data.y + 'px';
                    redrawConnections();
                }
            });
        }
    } else {
        // Remove from group if dropped outside
        if (data.parentId) {
            data.parentId = null;
            el.style.zIndex = ''; syncEarZ(data, '');
            el.classList.remove('in-group');
        }
    }
}

// ═══════════════════════════════════════════
//  RESIZE
// ═══════════════════════════════════════════
function initResizeHandles(el, data) {
    el.querySelectorAll('.resize-handle').forEach(h => {
        h.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            e.stopPropagation(); e.preventDefault();
            const dir = h.dataset.dir;
            const sx = e.clientX, sy = e.clientY;
            const ox = data.x, oy = data.y, ow = data.w, oh = data.h;
            const MW = 120, MH = 90;
            // Keep ear locked above node during resize
            if (data.type === 'stack') { el.style.zIndex = 50; syncEarZ(data, 51); }
            document.body.classList.add('is-dragging');
            const captureEl = document.documentElement;
            const pid = e.pointerId;
            try { captureEl.setPointerCapture(pid); } catch (_) {}
            const mv = e2 => {
                const dx = (e2.clientX - sx) / zoom;
                const dy = (e2.clientY - sy) / zoom;
                let nx = ox, ny = oy, nw = ow, nh = oh;
                if (dir.includes('e')) nw = Math.max(MW, ow + dx);
                if (dir.includes('s')) nh = Math.max(MH, oh + dy);
                if (dir.includes('w')) { const nw2 = Math.max(MW, ow - dx); nx = ox + (ow - nw2); nw = nw2; }
                if (dir.includes('n')) { const nh2 = Math.max(MH, oh - dy); ny = oy + (oh - nh2); nh = nh2; }
                data.x = nx; data.y = ny; data.w = nw; data.h = nh;
                el.style.left = nx + 'px'; el.style.top = ny + 'px';
                el.style.width = nw + 'px'; el.style.height = nh + 'px';
                if (data.type === 'stack') positionEar(data);
                redrawConnections();
            };
            const up = () => {
                if (data.type === 'stack') { const rz = data.parentId ? 5 : ''; el.style.zIndex = rz; syncEarZ(data, rz); }
                document.body.classList.remove('is-dragging');
                captureEl.removeEventListener('pointermove', mv);
                captureEl.removeEventListener('pointerup', up);
                captureEl.removeEventListener('pointercancel', up);
                try { captureEl.releasePointerCapture(pid); } catch (_) {}
                saveState();
            };
            captureEl.addEventListener('pointermove', mv);
            captureEl.addEventListener('pointerup', up);
            captureEl.addEventListener('pointercancel', up);
        });
    });
}

