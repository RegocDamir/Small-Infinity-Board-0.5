// ═══════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════

let nodes = [];
let connections = [];
let texts = [];
let nid = 0, cid = 0, tid = 0;
let pan = { x: 0, y: 0 }, zoom = 1;
let addMode = null;
let zoomModeActive = false, zoomTarget = null;
let flipModeActive = false;
let draggingConn = false, connSrcId = null, connTempPath = null, connSrcDir = null;
let focusedStackId = null;
let kframeActive = false, kframeSnapshot = null;
let clickReady = false;
let ctxTarget = null;
let cameraPath = { points: [], speed: 120, turnWithPath: false, ramps: [], visible: true };

function normalizeCameraPath(path) {
    const base = path || {};
    return {
        points: Array.isArray(base.points) ? base.points : [],
        speed: Number.isFinite(parseFloat(base.speed)) ? parseFloat(base.speed) : 120,
        turnWithPath: !!base.turnWithPath,
        ramps: Array.isArray(base.ramps) ? base.ramps : [],
        visible: base.visible !== false
    };
}

// ---------- DB SETUP ----------
const DB_NAME = 'InfiniteCanvasDB';
let db;
const req = indexedDB.open(DB_NAME, 1);
req.onupgradeneeded = e => {
    db = e.target.result;
    if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
};
req.onsuccess = e => {
    db = e.target.result;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadState, { once: true });
    } else {
        loadState();
    }
};
// ═══════════════════════════════════════════════
//  UNDO / REDO
// ═══════════════════════════════════════════════
const MAX_HISTORY = 50;
let historyStack = [];
let histIdx = -1;
let _inUndoRedo = false;

function pushHistory(stateSnap) {
    const snap = JSON.parse(JSON.stringify(stateSnap));
    historyStack.splice(histIdx + 1); // truncate redo branch
    historyStack.push(snap);
    if (historyStack.length > MAX_HISTORY) historyStack.shift();
    histIdx = historyStack.length - 1;
}

function applyHistoryState(state) {
    _inUndoRedo = true;
    // Preserve camera — undo/redo should not move the viewport
    const savedPan = { ...pan };
    const savedZoom = zoom;

    // Preserve any HTML node whose source code is unchanged across the undo step.
    // The iframe (or textarea) keeps its live state — chart animations don't restart,
    // controller slider/input values don't revert. We deliberately ignore the `playing`
    // flag mismatch: pressing ▶/✎ doesn't push history, so the target snapshot's
    // playing flag is often stale; the user's intent is "don't touch the iframe unless
    // the code actually changed."
    const preserved = new Set();
    const nextById = new Map((state.nodes || []).map(n => [n.id, n]));
    nodes.forEach(curr => {
        if (curr.type !== 'html') return;
        const next = nextById.get(curr.id);
        if (!next || next.type !== 'html') return;
        if (curr.code !== next.code) return;
        preserved.add(curr.id);
    });

    // Clear current scene (preserved iframes stay)
    clearAllNodes(preserved);
    connections = [];
    nodes = [];
    // Restore
    restoreState(JSON.parse(JSON.stringify(state)), preserved);
    // Put camera back (restoreState overwrites pan/zoom)
    pan = savedPan;
    zoom = savedZoom;
    applyTransform();
    updateDotGrid();
    setZoomHud(zoom);
    saveState(true); // persist to DB without pushing history
    _inUndoRedo = false;
}

function undo() {
    if (histIdx <= 0) return;
    histIdx--;
    applyHistoryState(historyStack[histIdx]);
}

function redo() {
    if (histIdx >= historyStack.length - 1) return;
    histIdx++;
    applyHistoryState(historyStack[histIdx]);
}

document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'z' && e.ctrlKey && !e.shiftKey) { e.preventDefault(); undo(); }
    if (e.key.toLowerCase() === 'z' && e.ctrlKey && e.shiftKey) { e.preventDefault(); redo(); }
});

function saveState(skipHistory = false) {
    if (!db) return;
    nodes.forEach(n => {
        const el = document.getElementById('node-' + n.id);
        if (!el) return;

        // Save grouping hierarchy
        if (el.classList.contains('in-group')) {
            const groups = nodes.filter(gn => gn.type === 'container');
            let foundGroup = false;
            for (let g of groups) {
                if (n.parentId === g.id) {
                    n.parentId = g.id;
                    foundGroup = true;
                    break;
                }
            }
            if (!foundGroup) {
                n.parentId = null;
                el.classList.remove('in-group');
            }
        } else {
            n.parentId = null;
        }

        const titleInput = el.querySelector('.node-title');
        if (titleInput) n.title = titleInput.value;
        if (n.type === 'text') {
            const txt = el.querySelector('.node-text-input');
            if (txt) n.text = txt.value;
        } else if (n.type === 'image') {
            const img = el.querySelector('.node-img-area img');
            if (img && img.src) n.src = img.src;
        } else if (n.type === 'video') {
            const area = el.querySelector('.node-video-area');
            const vid = area?.querySelector('video');
            const aud = area?.querySelector('audio');
            if (vid && vid.src) { n.src = vid.src; n.mediaKind = 'video'; }
            else if (aud && aud.src) { n.src = aud.src; n.mediaKind = 'audio'; }
            if (area && area._trimState) {
                const t = area._trimState;
                n.trim = { trimStart: t.trimStart, trimEnd: t.trimEnd, cuts: t.cuts.map(c => [c[0], c[1]]) };
            }
        } else if (n.type === 'malik') {
            const chat = el.querySelector('.malik-chat');
            if (chat) n.chatHTML = chat.innerHTML;
        } else if (n.type === 'youtube') {
            const input = el.querySelector('.node-yt-input');
            if (input) n.ytUrl = input.value;
        } else if (n.type === 'html') {
            const code = el.querySelector('.node-html-code');
            if (code) n.code = code.value;
            const frame = el.querySelector('.node-html-frame');
            n.playing = !!(frame && frame.style.display === 'block');
        }
    });

    // Sync texts from DOM
    texts.forEach(t => {
        const el = document.getElementById('text-' + t.id);
        if (!el) return;
        t.x = parseFloat(el.style.left) || 0;
        t.y = parseFloat(el.style.top) || 0;
        t.z = parseFloat(el.dataset.z) || 0;
        const input = el.querySelector('.text-input');
        if (input) t.content = input.value;
        t.fontSize = parseFloat(el.dataset.fontSize) || 16;
        t.fontFamily = el.dataset.fontFamily || 'system-ui';
        t.color = el.dataset.color || '#000000';
        t.rotation = parseFloat(el.dataset.rotation) || 0;
        // Effects
        if (el.dataset.shadow) t.shadow = JSON.parse(el.dataset.shadow);
        if (el.dataset.drift) t.drift = JSON.parse(el.dataset.drift);
        if (el.dataset.slideUp) t.slideUp = el.dataset.slideUp === 'true';
    });

    const tbLogoEl = document.getElementById('tb-logo');
    let tbLogoData = null;
    if (tbLogoEl && tbLogoEl.classList.contains('has-logo')) {
        tbLogoData = tbLogoEl.style.backgroundImage;
    }

    const state = {
        nodes,
        connections: connections.map(c => ({ id: c.id, from: c.from, to: c.to })),
        texts,
        pan, zoom, nid, cid, tid,
        cameraPath,
        tbLogo: tbLogoData
    };

    if (!skipHistory && !_inUndoRedo) pushHistory(state);

    const tx = db.transaction('state', 'readwrite');
    tx.objectStore('state').put(state, 'canvas_data');
}

function restoreState(state, preservedIds) {
    const preserved = preservedIds instanceof Set ? preservedIds : new Set();
    nodes = state.nodes || [];
    texts = state.texts || [];
    pan = state.pan || { x: 0, y: 0 };
    zoom = state.zoom || 1;
    cameraPath = normalizeCameraPath(state.cameraPath);
    nid = state.nid || 0;
    cid = state.cid || 0;
    tid = state.tid || 0;

    if (state.tbLogo) {
        ['tb-logo', 'tb-logo-b'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.style.backgroundImage = state.tbLogo;
            el.style.borderColor = 'transparent';
            el.classList.add('has-logo');
        });
    }

    nodeSeqCounter = 0;
    _nodeNums.clear();
    nodes.forEach(n => _nodeNums.set(n.id, ++nodeSeqCounter));

    nodes.forEach(data => {
        if (preserved.has(data.id)) {
            // Iframe is alive — just sync position/size/title, skip mount + iframe rebuild.
            const el = document.getElementById('node-' + data.id);
            if (el) {
                if (typeof data.x === 'number') el.style.left = data.x + 'px';
                if (typeof data.y === 'number') el.style.top = data.y + 'px';
                if (data.w) el.style.width = data.w + 'px';
                if (data.h) el.style.height = data.h + 'px';
                const titleInput = el.querySelector('.node-title');
                if (titleInput && typeof data.title === 'string') titleInput.value = data.title;
            }
            return;
        }
        mountNode(data);
        const el = document.getElementById('node-' + data.id);
        if (!el) return;

        if (data.type === 'container') {
            el.classList.add('node-is-group');
        }
        if (data.parentId) {
            el.classList.add('in-group');
            el.style.zIndex = 5;
        }

        if (data.title) {
            const t = el.querySelector('.node-title');
            if (t) t.value = data.title;
        }
        if (data.type === 'text' && data.text) {
            const t = el.querySelector('.node-text-input');
            if (t) t.value = data.text;
        }
        if (data.type === 'image' && data.src) {
            const area = el.querySelector('.node-img-area');
            if (area) {
                let img = document.createElement('img');
                img.draggable = false;
                img.src = data.src;
                area.appendChild(img);
                area.querySelectorAll('span,svg').forEach(s => s.style.display = 'none');
            }
        }
        if (data.type === 'video' && data.src) {
            const area = el.querySelector('.node-video-area');
            if (area) {
                const ph = area.querySelector('.video-ph');
                if (ph) ph.style.display = 'none';
                if (data.mediaKind === 'audio') {
                    buildAudioUI(area, data.src, data.trim);
                } else {
                    area.classList.add('has-video');
                    const vid = document.createElement('video');
                    vid.controls = false;
                    vid.src = data.src;
                    vid.style.cursor = 'pointer';
                    vid.addEventListener('mousedown', e => e.stopPropagation());
                    vid.addEventListener('click', e => {
                        e.stopPropagation();
                        if (vid.paused) vid.play(); else vid.pause();
                    });
                    area.appendChild(vid);
                    attachTrim(area, vid, data.trim);
                }
            }
        }
        if (data.type === 'malik' && data.chatHTML) {
            const chat = el.querySelector('.malik-chat');
            if (chat) chat.innerHTML = data.chatHTML;
        }
        if (data.type === 'html') {
            const code = el.querySelector('.node-html-code');
            if (code && data.code) code.value = data.code;
            if (data.playing && typeof toggleHtmlPlay === 'function') {
                toggleHtmlPlay(data.id);
            }
        }
        if (data.type === 'youtube' && data.ytUrl) {
            const input = el.querySelector('.node-yt-input');
            if (input) { input.value = data.ytUrl; applyYtUrl(data.id, data.ytUrl); }
        }
    });

    // Restore texts
    if (state.texts) {
        state.texts.forEach(data => {
            if (typeof mountText === 'function') {
                mountText(data);
            }
        });
    }

    if (state.connections) {
        state.connections.forEach(c => addConnection(c.from, c.to, c.id));
    }

    applyTransform();
    updateDotGrid();
    setZoomHud(zoom);
    if (typeof renderCameraPath === 'function') renderCameraPath();
}

function loadState() {
    const tx = db.transaction('state', 'readonly');
    const req = tx.objectStore('state').get('canvas_data');
    req.onsuccess = () => {
        if (req.result && Object.keys(req.result).length > 0) {
            restoreState(req.result);
        } else {
            setupDefaultBoard();
        }
    };
}

function setupDefaultBoard() {
    createNode('text', 180, 110);
    createNode('image', 440, 110);
    createNode('video', 180, 400);
    saveState();
}

function newBoard() {
    if (!confirm('This will clear the current canvas. Make sure you have saved your work to a file if you want to keep it. Continue?')) return;
    // Clear current state
    clearAllNodes();
    nodes = [];
    connections = [];
    texts = [];
    cameraPath = { points: [], speed: 120, turnWithPath: false, ramps: [], visible: true };
    nid = 0; cid = 0;
    pan = { x: 0, y: 0 }; zoom = 1;

    // Reset UI
    const tbLogoEl = document.getElementById('tb-logo');
    if (tbLogoEl) {
        tbLogoEl.style.backgroundImage = '';
        tbLogoEl.style.borderColor = '';
        tbLogoEl.classList.remove('has-logo');
    }
    applyTransform();
    updateDotGrid();
    if (typeof renderCameraPath === 'function') renderCameraPath();

    // Add a single welcoming text node or just leave empty
    createNode('text', window.innerWidth / 2 - 100, window.innerHeight / 2 - 75);
    saveState();
    historyStack = []; histIdx = -1;
}

function exportToFile() {
    // Force a save to update all n.text, n.title, etc attributes in the nodes array
    saveState();

    // Re-read current state to ensure it's fresh
    const tx = db.transaction('state', 'readonly');
    const req = tx.objectStore('state').get('canvas_data');
    req.onsuccess = () => {
        const dataStr = JSON.stringify(req.result, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `infinite_canvas_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
}

function importFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = ev => {
        const file = ev.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const state = JSON.parse(e.target.result);
                if (!state.nodes) throw new Error('Invalid canvas file');

                // Clear current
                clearAllNodes();

                restoreState(state);
                saveState();
            } catch (err) {
                alert('Error loading file: ' + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

const wrap = document.getElementById('canvas-wrap');
const scene = document.getElementById('scene');
const svgEl = document.getElementById('connections');
const zoomHud = document.getElementById('zoom-hud');
const ctxMenu = document.getElementById('ctx-menu');

// Single source of truth for the zoom % readout.
function setZoomHud(z) {
    if (zoomHud) zoomHud.textContent = Math.round(z * 100) + '%';
}

// Wipe every node + connection from the DOM. Callers still reset `nodes`/`connections`
// arrays afterward as needed (we don't touch them here so the caller stays in control).
function clearAllNodes(preservedIds) {
    const preserved = preservedIds instanceof Set ? preservedIds : new Set();
    nodes.forEach(n => {
        if (preserved.has(n.id)) return;
        const el = document.getElementById('node-' + n.id);
        if (el) { destroyMediaInNode(el); el.remove(); }
        document.getElementById('stack-ear-' + n.id)?.remove();
    });
    connections.forEach(c => {
        document.getElementById('conn-group-' + c.id)?.remove();
        document.getElementById('conn-' + c.id)?.remove();
        c.pulses?.forEach(p => p.el?.remove());
    });
}

