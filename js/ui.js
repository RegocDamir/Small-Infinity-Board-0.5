// ═══════════════════════════════════════════
//  PAN / ZOOM
// ═══════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
//  PAN / ZOOM & MULTI-SELECT
// ══════════════════════════════════════════════════════════════════════
let isPanning = false, panStart = { x: 0, y: 0 };
let selecting = false, selStart = { x: 0, y: 0 };
const selBox = document.getElementById('selection-box');

wrap.addEventListener('mousedown', e => {
    if (e.target.closest('.node,.node-inner,#toolbar,#ctx-menu')) return;
    if (addMode === 'text') return;
    // Middle click (button 1) while group add mode is active starts selection
    if (e.button === 1 && addMode === 'group') {
        selecting = true;
        selStart = { x: e.clientX, y: e.clientY };
        selBox.style.left = e.clientX + 'px';
        selBox.style.top = e.clientY + 'px';
        selBox.style.width = '0px';
        selBox.style.height = '0px';
        selBox.style.display = 'block';
        return;
    }
    if (e.button === 0) { // Only pan on left click
        isPanning = true;
        panStart = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        wrap.classList.add('panning');
    }
});

window.addEventListener('mousemove', e => {
    if (isPanning) {
        pan.x = e.clientX - panStart.x;
        pan.y = e.clientY - panStart.y;
        applyTransform(); updateDotGrid();
    }
    if (selecting) {
        const x = Math.min(e.clientX, selStart.x);
        const y = Math.min(e.clientY, selStart.y);
        const w = Math.abs(e.clientX - selStart.x);
        const h = Math.abs(e.clientY - selStart.y);
        selBox.style.left = x + 'px';
        selBox.style.top = y + 'px';
        selBox.style.width = w + 'px';
        selBox.style.height = h + 'px';
    }
    if (draggingConn && connTempPath) {
        const sp = nodeEdgePoint(connSrcId, connSrcDir || 'right');
        const mp = clientToScene(e.clientX, e.clientY); // SVG is in scene space
        connTempPath.setAttribute('d', bezier(sp, mp, connSrcDir || 'right', null));
        // highlight potential targets
        nodes.forEach(n => {
            if (n.id === connSrcId) return;
            const el = document.getElementById('node-' + n.id);
            if (!el) return;
            const near = mp.x > n.x - 60 && mp.x < n.x + n.w + 60 && mp.y > n.y - 60 && mp.y < n.y + n.h + 60;
            el.classList.toggle('conn-target-glow', near);
        });
    }
});

window.addEventListener('mouseup', e => {
    if (isPanning) {
        isPanning = false;
        wrap.classList.remove('panning');
        saveState();
    }
    if (selecting) {
        selecting = false;
        selBox.style.display = 'none';
        try {
            handleGroupSelection(selStart, { x: e.clientX, y: e.clientY });
        } catch (err) {
            console.error("Selection error:", err);
        }
    }
    if (draggingConn) finishConnection(e);
});

function handleGroupSelection(start, end) {
    // Convert to true scene coordinates
    const s1 = clientToScene(start.x, start.y);
    const s2 = clientToScene(end.x, end.y);

    const minX = Math.min(s1.x, s2.x);
    const maxX = Math.max(s1.x, s2.x);
    const minY = Math.min(s1.y, s2.y);
    const maxY = Math.max(s1.y, s2.y);

    // Avoid creating empty tiny groups accidentally
    if (maxX - minX < 20 || maxY - minY < 20) return;

    // Find nodes completely within this box
    const capturedNodes = nodes.filter(n => {
        // Ignore other group containers to prevent complex nesting for now
        if (n.type === 'container') return false;
        // Don't capture nodes already in a group initially to keep logic simple
        if (n.parentId) return false;

        const cx = n.x + n.w / 2;
        const cy = n.y + n.h / 2;
        // Capture if center is within bounds
        return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
    });

    if (capturedNodes.length > 0) {
        // Anti-eclipse: stagger captured nodes if they are exactly on top of each other
        for (let i = 0; i < capturedNodes.length; i++) {
            for (let j = i + 1; j < capturedNodes.length; j++) {
                const n1 = capturedNodes[i], n2 = capturedNodes[j];
                if (Math.abs(n1.x - n2.x) < 20 && Math.abs(n1.y - n2.y) < 20) {
                    n2.x += 40;
                    n2.y += 40;
                    const el2 = document.getElementById('node-' + n2.id);
                    if (el2) {
                        el2.style.left = n2.x + 'px';
                        el2.style.top = n2.y + 'px';
                    }
                }
            }
        }

        // Create Group Node bounds that tightly wrap children + padding
        const PAD = 40;
        let gx1 = Infinity, gy1 = Infinity, gx2 = -Infinity, gy2 = -Infinity;
        capturedNodes.forEach(n => {
            gx1 = Math.min(gx1, n.x);
            gy1 = Math.min(gy1, n.y);
            gx2 = Math.max(gx2, n.x + n.w);
            gy2 = Math.max(gy2, n.y + n.h);
        });

        const gw = (gx2 - gx1) + PAD * 2;
        const gh = (gy2 - gy1) + PAD * 2 + 30; // Extra padding for header

        const groupId = createNode('container', gx1 - PAD, gy1 - PAD - 30);
        const gNode = nodes.find(n => n.id === groupId);
        gNode.w = gw;
        gNode.h = gh;

        const gEl = document.getElementById('node-' + groupId);
        gEl.style.width = gw + 'px';
        gEl.style.height = gh + 'px';
        gEl.classList.add('node-is-group');

        // Parent them correctly visually and logically
        capturedNodes.forEach(cn => {
            cn.parentId = groupId;
            cn.rx = cn.x - gNode.x; // relative X
            cn.ry = cn.y - gNode.y; // relative Y

            const el = document.getElementById('node-' + cn.id);
            el.style.zIndex = 5; // Ensure children sit above parent (z-index 1 usually)
            el.classList.add('in-group');
        });

        // Update ALL connections after moving any staggered nodes
        redrawConnections();
        saveState();
    }

    setAddMode(null); // Turn off tool
}

wrap.addEventListener('wheel', e => {
    if (e.target.closest('.malik-chat, .malik-input, .node-text-input')) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.909;
    const nz = Math.min(Math.max(zoom * factor, 0.07), 5);
    pan.x = e.clientX - (e.clientX - pan.x) * (nz / zoom);
    pan.y = e.clientY - (e.clientY - pan.y) * (nz / zoom);
    zoom = nz;
    applyTransform(); updateDotGrid();
    setZoomHud(zoom);
    redrawConnections();
    clearTimeout(window.zoomSaveTimeout);
    window.zoomSaveTimeout = setTimeout(() => saveState(true), 500);
}, { passive: false });

// ── Ear zoom compensation ──────────────────────────────────────────
// The ear is a child of the scene and scales with it. Below zoom=0.4 we
// counter-scale each ear so it never shrinks smaller than its 40%-zoom size.
// transform-origin: 0% 0% anchors the top-left corner, so the gap to the
// node and the alignment with the node top are both preserved exactly.
function updateEarScale(ear) {
    const s = zoom < 0.4 ? 0.4 / zoom : 1;
    if (s > 1) {
        ear.style.transform       = `scale(${s.toFixed(5)})`;
        ear.style.transformOrigin = '0% 0%';
    } else {
        ear.style.transform       = '';
        ear.style.transformOrigin = '';
    }
}
function updateAllEarScales() {
    document.querySelectorAll('.stack-ear').forEach(updateEarScale);
}

function applyTransform() {
    scene.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
    document.documentElement.style.setProperty('--zoom-inv', zoom < 1 ? 1 / Math.pow(zoom, 0.6) : (zoom > 1 ? 1 / Math.pow(zoom, 0.6) : 1));
    document.documentElement.style.setProperty('--zoom', zoom);
    document.documentElement.style.setProperty('--ear-counter', zoom < 1 ? (1 / zoom).toFixed(5) : 1);
    updateAllEarScales();
}
function updateDotGrid() {
    // Scale the dot spacing deceptively. Less aggressive than before (0.65 vs 0.4) 
    // so they can come closer and reduce blending jumpiness.
    let deceptiveZoom = zoom;
    if (zoom < 1) deceptiveZoom = Math.pow(zoom, 0.65);

    const s = 32 * deceptiveZoom;
    const ox = ((pan.x % s) + s) % s, oy = ((pan.y % s) + s) % s;
    const gridEl = document.getElementById('dot-grid');

    gridEl.style.backgroundSize = `${s}px ${s}px`;
    gridEl.style.backgroundPosition = `${ox}px ${oy}px`;

    // Calculate opacity: 1.0 down to 0.4 zoom, then fade to 0.6 at 0.07 zoom
    let opacity = 1;
    if (zoom < 0.4) {
        // Map [0.07, 0.4] -> [0.6, 1.0]
        const factor = (zoom - 0.07) / (0.4 - 0.07);
        opacity = 0.6 + (0.4 * factor);
    }
    gridEl.style.opacity = Math.max(0.6, Math.min(1, opacity));

    // Adjust the dot radius size visually
    const dotSize = Math.max(1, 1.5 * deceptiveZoom);
    gridEl.style.backgroundImage = `radial-gradient(circle, var(--dot-color) ${dotSize}px, transparent ${dotSize}px)`;

    // ── Animate-mode tiled background: pan fully, zoom as parallax ──
    const animBg = document.getElementById('anim-bg');
    if (animBg) {
        const baseSize = 140;
        // Dampened zoom: power 0.3 means it barely scales compared to nodes
        const dampedZoom = Math.pow(zoom, 0.3);
        const tileSize = baseSize * dampedZoom;
        // Pan 1:1 with canvas, wrapped to tile size
        const abx = ((pan.x % tileSize) + tileSize) % tileSize;
        const aby = ((pan.y % tileSize) + tileSize) % tileSize;
        animBg.style.backgroundSize = `${tileSize}px`;
        animBg.style.backgroundPosition = `${abx}px ${aby}px`;
    }
}
function clientToScene(cx, cy) {
    const r = wrap.getBoundingClientRect();
    return { x: (cx - r.left - pan.x) / zoom, y: (cy - r.top - pan.y) / zoom };
}
function resetView() {
    if (nodes.length === 0) {
        pan = { x: 0, y: 0 }; zoom = 1;
    } else {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(n => {
            const el = document.getElementById('node-' + n.id);
            if (el && el.classList.contains('node-is-group')) { return; } // Optionally exclude groups if bounds get messy, but including them is fine.
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
            if ((n.x + n.w) > maxX) maxX = n.x + n.w;
            if ((n.y + n.h) > maxY) maxY = n.y + n.h;
        });

        // If minX is still Infinity, it means there are no valid nodes to frame
        if (minX === Infinity) {
            pan = { x: 0, y: 0 }; zoom = 1;
        } else {
            const padding = 120;
            const width = maxX - minX + padding * 2;
            const height = maxY - minY + padding * 2;
            const zoomX = window.innerWidth / width;
            const zoomY = window.innerHeight / height;
            zoom = Math.min(zoomX, zoomY, 2); // Cap zoom at 2x
            // Center the bounding box
            const cx = minX + (width - padding * 2) / 2;
            const cy = minY + (height - padding * 2) / 2;
            pan.x = window.innerWidth / 2 - cx * zoom;
            pan.y = window.innerHeight / 2 - cy * zoom;
        }
    }

    setZoomHud(zoom);
    applyTransform(); updateDotGrid();
    saveState();
}

// ———————————————————————————————————————————————————————————
//  ADD MODE
// ———————————————————————————————————————————————————————————
wrap.addEventListener('mousedown', e => {
    if (e.target.closest('.node,.node-inner,#toolbar,.text-item')) return;
    // Group tool is handled entirely by the middle-click drag system, not here
    if (addMode === 'group') return;
    if (e.button !== 0) return; // Non-group tools need left click
    clickReady = !!addMode;
});
wrap.addEventListener('mouseup', e => {
    // Deselect text when clicking on empty canvas
    if (!e.target.closest('.text-item,#toolbar,#side-panel')) {
        if (typeof deselectText === 'function') {
            deselectText();
        }
    }

    if (e.target.closest('.node,.node-inner,#toolbar,.text-item')) return;
    if (!addMode || !clickReady) return;
    // Group tool is handled entirely by the middle-click drag system
    if (addMode === 'group') return;
    if (e.button !== 0) return;

    clickReady = false;
    const pos = clientToScene(e.clientX, e.clientY);

    // Handle text placement separately
    if (addMode === 'text-layer') {
        if (typeof createText === 'function') {
            createText(pos.x, pos.y);
        }
    } else {
        const newId = createNode(addMode, pos.x - 100, pos.y - 75);

        // Allow newly placed node to be captured by group container
        const newNode = nodes.find(n => n.id === newId);
        if (newNode && newNode.type !== 'container') {
            handleNodeDropOverlap(newNode);
        }
    }

    // Deactivate after placing exactly one node
    setAddMode(null);
});

function setAddMode(type) {
    addMode = addMode === type ? null : type;
    document.querySelectorAll('.tb-btn').forEach(b => b.classList.remove('active'));
    if (addMode) {
        const btn = document.getElementById('btn-' + addMode);
        if (btn) btn.classList.add('active');
    }
    wrap.classList.toggle('adding', !!addMode);
}

// ═══════════════════════════════════════════
//  CONTEXT MENU
// ═══════════════════════════════════════════
function openCtx(e, id) {
    e.stopPropagation();
    ctxTarget = id;
    ctxMenu.style.display = 'block';
    // Clamp so the menu never overflows off-screen
    const mw = ctxMenu.offsetWidth, mh = ctxMenu.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    const cx = Math.min(e.clientX, vw - mw - 8);
    const cy = Math.min(e.clientY, vh - mh - 8);
    ctxMenu.style.left = cx + 'px';
    ctxMenu.style.top = cy + 'px';
}
document.addEventListener('click', e => { if (!e.target.closest('#ctx-menu')) ctxMenu.style.display = 'none'; });
document.addEventListener('contextmenu', e => {
    const tbLogo = e.target.closest('#tb-logo, #tb-logo-b');
    if (tbLogo) {
        e.preventDefault();
        e.stopPropagation();
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png';
        input.onchange = ev => {
            const file = ev.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e2 => {
                // Apply to both logo placeholders
                ['tb-logo', 'tb-logo-b'].forEach(id => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    el.style.backgroundImage = `url(${e2.target.result})`;
                    el.style.borderColor = 'transparent';
                    el.classList.add('has-logo');
                });
                saveState();
            };
            reader.readAsDataURL(file);
        };
        input.click();
        return;
    }


    const imgArea = e.target.closest('.node-img-area');
    if (imgArea) {
        e.preventDefault();
        e.stopPropagation();
        imgArea.querySelector('input[type=file]').click();
        return;
    }

    const vidArea = e.target.closest('.node-video-area');
    if (vidArea) {
        e.preventDefault();
        e.stopPropagation();
        vidArea.querySelector('input[type=file]').click();
        return;
    }

    const node = e.target.closest('.node');
    if (node) { e.preventDefault(); openCtx(e, parseInt(node.dataset.id)); }
});

function ctxDo(action) {
    ctxMenu.style.display = 'none';
    const data = nodes.find(n => n.id === ctxTarget); if (!data) return;
    if (action === 'delete') {
        const delEl = document.getElementById('node-' + ctxTarget);
        if (delEl) { destroyMediaInNode(delEl); delEl.remove(); }
        document.getElementById('stack-ear-' + ctxTarget)?.remove();

        // Ungroup children if container is deleted
        if (data.type === 'container') {
            nodes.forEach(n => {
                if (n.parentId === ctxTarget) {
                    n.parentId = null;
                    const childEl = document.getElementById('node-' + n.id);
                    if (childEl) {
                        childEl.classList.remove('in-group');
                        childEl.style.zIndex = '';
                    }
                }
            });
        }

        connections = connections.filter(c => {
            if (c.from === ctxTarget || c.to === ctxTarget) {
                document.getElementById('conn-group-' + c.id)?.remove();
                document.getElementById('conn-' + c.id)?.remove();
                c.pulses.forEach(p => p.el.remove());
                return false;
            }
            return true;
        });
        nodes = nodes.filter(n => n.id !== ctxTarget);
        saveState();
    } else if (action === 'duplicate') {
        const d2 = { ...data, id: ++nid, x: data.x + 22, y: data.y + 22 };
        nodes.push(d2); mountNode(d2);
        saveState();
    }
}

// ═══════════════════════════════════════════
//  TOOLBAR DRAG
// ═══════════════════════════════════════════

// --- K-FRAME -----------------------------------------------------------
function toggleKFrame() {
    const btn = document.getElementById('btn-kframe');
    if (!kframeActive) {
        kframeSnapshot = {
            nodes: nodes.map(d => ({ id: d.id, x: d.x, y: d.y, w: d.w, h: d.h })),
            connections: connections.map(c => ({ id: c.id, from: c.from, to: c.to, fromSide: c.fromSide, toSide: c.toSide }))
        };
        kframeActive = true;
        btn.classList.add('kframe-active');
    } else {
        kframeActive = false;
        btn.classList.remove('kframe-active');
        if (!kframeSnapshot) return;

        const targets = {};
        kframeSnapshot.nodes.forEach(s => { targets[s.id] = s; });

        // Per-node random timing
        const nodeTimings = {};
        nodes.forEach(d => {
            nodeTimings[d.id] = {
                delay:    200 + Math.random() * 600,  // 0.2s – 0.8s
                duration: 420 + Math.random() * 1080  // 0.42s – 1.5s
            };
        });

        // Capture current positions
        const from = nodes.map(d => {
            const el = document.getElementById('node-' + d.id);
            return {
                id: d.id,
                x: parseFloat(el ? el.style.left   : d.x) || d.x,
                y: parseFloat(el ? el.style.top    : d.y) || d.y,
                w: parseFloat(el ? el.style.width  : d.w) || d.w,
                h: parseFloat(el ? el.style.height : d.h) || d.h
            };
        });

        const globalStart = performance.now();
        const maxEnd = Math.max(...nodes.map(d => nodeTimings[d.id].delay + nodeTimings[d.id].duration));

        function animate(now) {
            const elapsed = now - globalStart;
            let allDone = true;

            from.forEach(cur => {
                const tgt = targets[cur.id];
                if (!tgt) return;
                const { delay, duration } = nodeTimings[cur.id];
                const localT = Math.min(Math.max((elapsed - delay) / duration, 0), 1);
                if (localT < 1) allDone = false;
                const e = 1 - Math.pow(1 - localT, 3); // ease-out cubic

                const el = document.getElementById('node-' + cur.id);
                if (!el) return;
                const nx = cur.x + (tgt.x - cur.x) * e;
                const ny = cur.y + (tgt.y - cur.y) * e;
                const nw = cur.w + (tgt.w - cur.w) * e;
                const nh = cur.h + (tgt.h - cur.h) * e;
                el.style.left   = nx + 'px';
                el.style.top    = ny + 'px';
                el.style.width  = nw + 'px';
                el.style.height = nh + 'px';
                const data = nodes.find(d => d.id === cur.id);
                if (data) { data.x = nx; data.y = ny; data.w = nw; data.h = nh; }
                positionEar(data || { id: cur.id, x: nx, y: ny, w: nw, h: nh });
            });
            redrawConnections();

            if (!allDone) {
                requestAnimationFrame(animate);
            } else {
                // Snap to exact targets and save
                kframeSnapshot.nodes.forEach(s => {
                    const data = nodes.find(d => d.id === s.id);
                    if (!data) return;
                    data.x = s.x; data.y = s.y; data.w = s.w; data.h = s.h;
                    const el = document.getElementById('node-' + s.id);
                    if (el) {
                        el.style.left   = s.x + 'px';
                        el.style.top    = s.y + 'px';
                        el.style.width  = s.w + 'px';
                        el.style.height = s.h + 'px';
                    }
                    positionEar(data);
                });
                redrawConnections();
                saveState();
                kframeSnapshot = null;
            }
        }
        requestAnimationFrame(animate);
    }
}

// ---- HTML NODE ----
// Cache last published data per controller node ID (number).
// Lets newly-connected graphs / freshly-played graphs snap to the
// controller's current state without waiting for the next user input.
const _dcCache = new Map();

// Bridge prelude injected at the top of every HTML iframe's <head>.
// Auto-detects role: presence of #dc-data ⇒ controller; otherwise graph.
// Shims window.parent._DC_DATA per-iframe via Proxy so each graph reads
// only ITS connected controller's data — eliminates global contamination.
function _dcBridge(nodeId) {
    return `<style>
html, body { scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,0.15) transparent !important; }
*       { scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,0.15) transparent !important; }
::-webkit-scrollbar          { width: 7px !important; height: 7px !important; }
::-webkit-scrollbar-track    { background: transparent !important; }
::-webkit-scrollbar-corner   { background: transparent !important; }
::-webkit-scrollbar-thumb    { background: rgba(255,255,255,0.15) !important; border-radius: 4px !important; border: none !important; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.28) !important; }
::-webkit-scrollbar-button   { display: none !important; width: 0 !important; height: 0 !important; }
</style>
<script>
(function(){
  const NODE_ID = ${nodeId};
  let _local = null;

  // Per-iframe shim of window.parent._DC_DATA — graph reads return THIS
  // iframe's data (set by parent broker), not a shared global.
  try {
    const realParent = window.parent;
    const parentProxy = new Proxy(realParent, {
      get(t, p) {
        if (p === '_DC_DATA') return _local;
        const v = t[p];
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set(t, p, v) {
        if (p === '_DC_DATA') { _local = v; return true; }
        t[p] = v; return true;
      }
    });
    Object.defineProperty(window, 'parent', { get: () => parentProxy, configurable: true });
  } catch(e) { console.warn('[dc-bridge] proxy install failed', e); }

  // Hooks called by parent broker
  window.__dcSetLocal = function(d){ _local = d; };
  window.__dcGetLocal = function(){ return _local; };
  window.__dcGetMyId  = function(){ return NODE_ID; };

  // Modern API for new chart code
  const _subs = [];
  window._DC = {
    get data(){ return _local; },
    onUpdate(cb){ _subs.push(cb); if (_local) try { cb(_local); } catch(e){} }
  };
  window.__dcFire = function(){
    _subs.forEach(cb => { try { cb(_local); } catch(e){} });
    try { window.dispatchEvent(new CustomEvent('dc:update', { detail: _local })); } catch(e){}
  };

  // Controller mode: watch #dc-data for value changes, forward to parent.
  function watchController(){
    const el = document.getElementById('dc-data');
    if (!el) return;
    let last = null;  // null forces first bcast to fire even if el already has value
    function bcast(){
      if (el.value === last) return;
      last = el.value;
      let parsed;
      try { parsed = JSON.parse(el.value); } catch(e){ return; }
      _local = parsed;
      try {
        window.parent.postMessage({ __dc:true, type:'data', from: NODE_ID, payload: parsed }, '*');
      } catch(e){}
    }
    el.addEventListener('input', bcast);
    el.addEventListener('change', bcast);
    setInterval(bcast, 80);  // catches script-driven .value mutations
    bcast();                 // initial fire
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchController);
  else watchController();
})();
<\/script>`;
}

// Inject the bridge into the user's HTML so it runs BEFORE user scripts.
function _wrapHtmlWithBridge(userCode, nodeId) {
    const bridge = _dcBridge(nodeId);
    if (/<head[^>]*>/i.test(userCode)) {
        return userCode.replace(/<head[^>]*>/i, m => m + bridge);
    }
    if (/<html[^>]*>/i.test(userCode)) {
        return userCode.replace(/<html[^>]*>/i, m => m + '<head>' + bridge + '</head>');
    }
    return '<!DOCTYPE html><html><head>' + bridge + '</head><body>' + userCode + '</body></html>';
}

// Deliver controller data to a single graph iframe (synchronous, no lag).
function _dcDeliver(graphNodeId, payload) {
    const targetEl = document.getElementById('node-' + graphNodeId);
    if (!targetEl) return;
    const iframe = targetEl.querySelector('.node-html-frame');
    if (!iframe || !iframe.contentWindow) return;
    const cw = iframe.contentWindow;
    try {
        if (typeof cw.__dcSetLocal === 'function') {
            cw.__dcSetLocal(payload);
            cw.__dcFire?.();
        } else {
            // Bridge not ready yet — postMessage fallback
            cw.postMessage({ __dc:true, type:'deliver', payload }, '*');
        }
    } catch(e) { console.warn('[dc] deliver failed', e); }
}

// Push cached controller data to all graphs connected to controllerId.
function _dcRoute(controllerId, payload) {
    const conns = (typeof connections !== 'undefined' ? connections : []).filter(
        c => c.from === controllerId || c.to === controllerId
    );
    conns.forEach(c => {
        const otherId = c.from === controllerId ? c.to : c.from;
        _dcDeliver(otherId, payload);
    });
    // Also dispatch on parent so legacy chart code listening for `dc:update`
    // on window.parent fires; their _DC_DATA reads now hit the per-iframe proxy.
    try { window.dispatchEvent(new CustomEvent('dc:update')); } catch(e){}
}

// Listen for controller broadcasts.
window.addEventListener('message', e => {
    const m = e.data;
    if (!m || !m.__dc || m.type !== 'data') return;
    const controllerId = m.from;
    if (typeof controllerId !== 'number') return;
    _dcCache.set(controllerId, m.payload);
    _dcRoute(controllerId, m.payload);
});

// Push cached data when a new connection forms (so graphs sync immediately).
function dcOnConnectionAdded(c) {
    if (_dcCache.has(c.from)) _dcDeliver(c.to, _dcCache.get(c.from));
    if (_dcCache.has(c.to))   _dcDeliver(c.from, _dcCache.get(c.to));
}

// Push cached data when a graph iframe (▶) loads, so it shows correct data on open.
function dcOnGraphPlay(graphId) {
    const conns = (typeof connections !== 'undefined' ? connections : []).filter(
        c => c.from === graphId || c.to === graphId
    );
    for (const c of conns) {
        const otherId = c.from === graphId ? c.to : c.from;
        if (_dcCache.has(otherId)) {
            _dcDeliver(graphId, _dcCache.get(otherId));
            break;
        }
    }
}

function toggleHtmlPlay(id) {
    const el = document.getElementById('node-' + id);
    if (!el) return;
    const code = el.querySelector('.node-html-code');
    const frame = el.querySelector('.node-html-frame');
    const btn = el.querySelector('.node-html-toggle');
    if (!code || !frame) return;
    const playing = frame.style.display === 'block';
    if (!playing) {
        frame.srcdoc = _wrapHtmlWithBridge(code.value, id);
        frame.style.display = 'block';
        code.style.display = 'none';
        if (btn) btn.textContent = '✎';
        frame.addEventListener('load', () => dcOnGraphPlay(id), { once: true });
    } else {
        frame.style.display = 'none';
        frame.srcdoc = '';
        code.style.display = 'block';
        if (btn) btn.textContent = '▶';
    }
}
// ---- END HTML NODE ----

function toggleFlipMode() {
    const btn = document.getElementById('btn-flip-frame');
    flipModeActive = !flipModeActive;
    btn.classList.toggle('flip-active', flipModeActive);
}

function flipNode(data, el) {
    const isLandscape = data.w >= data.h;
    const axis = isLandscape ? 'scaleX' : 'scaleY';
    const isFlipped = el.classList.contains('node-flipped');
    const dur = 150;
    const t0 = performance.now();
    (function phase1(now) {
        const t = Math.min((now - t0) / dur, 1);
        el.style.transform = `${axis}(${1 - t})`;
        if (t < 1) { requestAnimationFrame(phase1); return; }
        // midpoint: swap face
        el.classList.toggle('node-flipped', !isFlipped);
        data.flipped = !isFlipped || undefined;
        if (!data.flipped) delete data.flipped;
        const t1 = performance.now();
        (function phase2(now2) {
            const t2 = Math.min((now2 - t1) / dur, 1);
            el.style.transform = `${axis}(${t2})`;
            if (t2 < 1) { requestAnimationFrame(phase2); return; }
            el.style.transform = '';
            saveState();
        })(performance.now());
    })(performance.now());
}

function toggleCamZoom() {
    const btn = document.getElementById('btn-cam-zoom');
    if (!zoomModeActive) {
        zoomModeActive = true;
        btn.classList.add('zoom-active');
    } else {
        zoomModeActive = false;
        btn.classList.remove('zoom-active', 'zoom-zoomed');
        if (zoomTarget) animateZoomRestore();
    }
}

function zoomToNode(data) {
    const btn = document.getElementById('btn-cam-zoom');
    const vw = window.innerWidth, vh = window.innerHeight;
    const el = document.getElementById('node-' + data.id);
    if (!el) return;

    zoomTarget = {
        id: data.id,
        origX: data.x, origY: data.y, origW: data.w, origH: data.h,
        origPan: { x: pan.x, y: pan.y }, origZoom: zoom
    };

    // Node grows to fill 75% of viewport in canvas space (keep aspect ratio)
    const scale = Math.min(vw * 0.75 / data.w, vh * 0.75 / data.h);
    const newW = data.w * scale, newH = data.h * scale;
    const cx = data.x + data.w / 2, cy = data.y + data.h / 2;
    const newX = cx - newW / 2, newY = cy - newH / 2;

    // Camera zooms so node fills 80% on screen
    const newZoom = Math.min(vw * 0.80 / newW, vh * 0.80 / newH);
    const newPanX = vw / 2 - cx * newZoom;
    const newPanY = vh / 2 - cy * newZoom;

    el.style.zIndex = 9999;

    const fromX = data.x, fromY = data.y, fromW = data.w, fromH = data.h;
    const fromPanX = pan.x, fromPanY = pan.y, fromZoom = zoom;
    const dur = 600, t0 = performance.now();

    (function animate(now) {
        const t = Math.min((now - t0) / dur, 1);
        const e = 1 - Math.pow(1 - t, 3);
        data.x = fromX + (newX - fromX) * e;
        data.y = fromY + (newY - fromY) * e;
        data.w = fromW + (newW - fromW) * e;
        data.h = fromH + (newH - fromH) * e;
        el.style.left = data.x + 'px'; el.style.top = data.y + 'px';
        el.style.width = data.w + 'px'; el.style.height = data.h + 'px';
        if (data.type === 'stack') positionEar(data);
        pan.x = fromPanX + (newPanX - fromPanX) * e;
        pan.y = fromPanY + (newPanY - fromPanY) * e;
        zoom = fromZoom + (newZoom - fromZoom) * e;
        applyTransform(); redrawConnections();
        if (t < 1) { requestAnimationFrame(animate); }
        else {
            data.x = newX; data.y = newY; data.w = newW; data.h = newH;
            el.style.left = newX + 'px'; el.style.top = newY + 'px';
            el.style.width = newW + 'px'; el.style.height = newH + 'px';
            pan.x = newPanX; pan.y = newPanY; zoom = newZoom;
            applyTransform(); redrawConnections();
            btn.classList.remove('zoom-active');
            btn.classList.add('zoom-zoomed');
        }
    })(performance.now());
}

function animateZoomRestore() {
    const tgt = zoomTarget; zoomTarget = null;
    const data = nodes.find(d => d.id === tgt.id);
    const el = document.getElementById('node-' + tgt.id);
    if (!data || !el) return;

    const fromX = data.x, fromY = data.y, fromW = data.w, fromH = data.h;
    const fromPanX = pan.x, fromPanY = pan.y, fromZoom = zoom;
    const dur = 500, t0 = performance.now();

    (function animate(now) {
        const t = Math.min((now - t0) / dur, 1);
        const e = 1 - Math.pow(1 - t, 3);
        data.x = fromX + (tgt.origX - fromX) * e;
        data.y = fromY + (tgt.origY - fromY) * e;
        data.w = fromW + (tgt.origW - fromW) * e;
        data.h = fromH + (tgt.origH - fromH) * e;
        el.style.left = data.x + 'px'; el.style.top = data.y + 'px';
        el.style.width = data.w + 'px'; el.style.height = data.h + 'px';
        if (data.type === 'stack') positionEar(data);
        pan.x = fromPanX + (tgt.origPan.x - fromPanX) * e;
        pan.y = fromPanY + (tgt.origPan.y - fromPanY) * e;
        zoom = fromZoom + (tgt.origZoom - fromZoom) * e;
        applyTransform(); redrawConnections();
        if (t < 1) { requestAnimationFrame(animate); }
        else {
            data.x = tgt.origX; data.y = tgt.origY; data.w = tgt.origW; data.h = tgt.origH;
            el.style.left = tgt.origX + 'px'; el.style.top = tgt.origY + 'px';
            el.style.width = tgt.origW + 'px'; el.style.height = tgt.origH + 'px';
            el.style.zIndex = data.parentId ? 5 : '';
            pan.x = tgt.origPan.x; pan.y = tgt.origPan.y; zoom = tgt.origZoom;
            applyTransform(); redrawConnections();
            saveState();
        }
    })(performance.now());
}

const tb = document.getElementById('toolbar');
const tbHandle = document.getElementById('tb-drag-handle');
const tbHandleB = document.getElementById('tb-drag-handle-b');
let tbDrag = false, tbSX, tbSY, tbOL, tbOT;
function tbStartDrag(e) {
    const r = tb.getBoundingClientRect();
    tb.style.left = r.left + 'px';
    tb.style.top = r.top + 'px';
    tb.style.bottom = 'auto';
    tb.style.transform = 'none';
    tbDrag = true; tbSX = e.clientX; tbSY = e.clientY;
    tbOL = r.left; tbOT = r.top; e.preventDefault();
}
tbHandle.addEventListener('mousedown', tbStartDrag);
tbHandleB.addEventListener('mousedown', tbStartDrag);
document.addEventListener('mousemove', e => {
    if (!tbDrag) return;
    tb.style.left = (tbOL + e.clientX - tbSX) + 'px';
    tb.style.top = (tbOT + e.clientY - tbSY) + 'px';
    tb.style.bottom = 'auto'; tb.style.transform = 'none';
});
document.addEventListener('mouseup', () => { tbDrag = false; });

// ═══════════════════════════════════════════
//  KEYBOARD
// ═══════════════════════════════════════════
document.addEventListener('keydown', e => {
    if (e.target.matches('textarea,input')) return;
    if (e.key === 'Escape') {
        setAddMode(null); addMode = null;
        if (connTempPath) { connTempPath.remove(); connTempPath = null; }
        draggingConn = false; connSrcId = null;
        document.body.classList.remove('is-dragging');
        ctxMenu.style.display = 'none';
    }
    if (e.key === 'Home') resetView();
    if (e.ctrlKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (focusedStackId !== null) ejectOneFromStack(focusedStackId);
    }
});

document.addEventListener('mousedown', e => {
    if (!e.target.closest('.stack-ear')) setStackFocus(null);
});

// ═══════════════════════════════════════════
//  THEME TOGGLE
// ═══════════════════════════════════════════
function toggleTheme() {
    const b = document.body;
    if (b.classList.contains('anim-mode')) return;
    b.classList.toggle('light');
    const isLight = b.classList.contains('light');
    document.querySelectorAll('.theme-switch input[type="checkbox"]').forEach(cb => {
        cb.checked = isLight;
    });
}

// ═══════════════════════════════════════════════
//  ANIMATE MODE
// ═══════════════════════════════════════════════
function toggleAnimMode() {
    document.body.classList.toggle('anim-mode');
    // Clear any active add mode when switching faces
    setAddMode(null);
}

// Stack node absorption on drag-drop
function tryAbsorbIntoStack(data) {
    if (data.type === 'stack') return;
    // Only block if the node is genuinely inside a live stack's children list
    if (data.stackParentId) {
        const parent = nodes.find(n => n.id === data.stackParentId);
        if (parent?.stackChildren?.includes(data.id)) return;
        data.stackParentId = null; // stale reference — clear it
    }
    const stackNodes = nodes.filter(n => n.type === 'stack' && n.id !== data.id);
    for (const sn of stackNodes) {
        // Hit zone: stack body + ear satellite to the right (~50px wide, starts at sn.w + 10)
        const hitX2 = sn.x + sn.w + 60;
        const overlaps = (
            data.x < hitX2     && data.x + data.w > sn.x &&
            data.y < sn.y + sn.h && data.y + data.h > sn.y
        );
        if (overlaps) {
            absorbIntoStack(data, sn);
            return;
        }
    }
}

function absorbIntoStack(data, stackNode) {
    // Remove connections to/from this node
    connections = connections.filter(c => {
        if (c.from === data.id || c.to === data.id) {
            document.getElementById('conn-group-' + c.id)?.remove();
            c.pulses.forEach(p => p.el.remove());
            return false;
        }
        return true;
    });

    // Mark as absorbed
    data.stackParentId = stackNode.id;
    if (!stackNode.stackChildren) stackNode.stackChildren = [];
    stackNode.stackChildren.push(data.id);

    // Hide original node element
    const el = document.getElementById('node-' + data.id);
    if (el) el.style.display = 'none';

    // Render as card inside the stack
    renderStackCards(stackNode);
    saveState();
}

function renderStackCards(stackNode) {
    const area = document.getElementById('stack-area-' + stackNode.id);
    if (!area) return;
    area.innerHTML = '';
    const children = (stackNode.stackChildren || []).map(cid => nodes.find(n => n.id === cid)).filter(Boolean);
    if (children.length === 0) {
        area.innerHTML = `<div class="stack-empty-hint">
          <svg viewBox="0 0 514 511.58" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="nonzero" d="M289.035 13.017L353.246.121c4.784-.988 7.75 4.319 4.484 7.458l-27.629 26.492 23.196 23.479c2.223 2.166 3.47 4.044 3.398 6.058-.086 2.389-1.665 4.04-5.108 5.22l-1.277.399c-23.874 5.765-50.334 9.945-74.657 14.724-6.673 1.386-10.599-4.402-5.446-9.371l26.343-25.406-.878-.834c-5.589-5.311-15.591-14.818-20.813-21.172-2.451-2.985-3.569-5.349-3.099-7.509.555-2.556 2.727-3.936 6.768-4.538l10.507-2.104zm-58.498 40.866c17.63 22.167 35.604 44.276 52.981 66.618 3.654 4.646 5.104 10.372 4.485 15.839-.622 5.506-3.327 10.783-7.974 14.479-16.212 12.887-32.609 25.611-48.901 38.407a7.533 7.533 0 01-10.481-1.152l-71.751-87.695a7.537 7.537 0 011.06-10.603l50.125-39.401a21.78 21.78 0 0115.958-4.517c5.504.627 10.778 3.347 14.498 8.025zm41.114 75.878l-52.895-66.51a6.583 6.583 0 00-4.427-2.431 6.751 6.751 0 00-4.941 1.397L165.422 96.78l62.21 76.039 43.03-33.781a6.463 6.463 0 002.379-4.348c.192-1.699-.247-3.468-1.361-4.885l-.029-.044zm175.24 163.054l-65.323-52.62c-1.366-1.095-3.082-1.534-4.733-1.357a6.358 6.358 0 00-4.297 2.32l-34.824 43.474 73.993 62.372 36.151-45.107c1.106-1.379 1.549-3.106 1.372-4.765a6.408 6.408 0 00-2.339-4.317zm-55.868-64.32l65.293 52.595c4.612 3.719 7.287 8.975 7.876 14.449a21.508 21.508 0 01-4.61 15.783l-41.074 51.22a7.509 7.509 0 01-10.575.914l-85.377-71.951a7.524 7.524 0 01-1.15-10.574l39.408-49.198c3.709-4.606 8.963-7.274 14.428-7.858a21.477 21.477 0 0115.751 4.595l.03.025zM356.93 417.439l4.893-5.549.403-.424c9.106-10.306 14.818-16.799 24.505-29.592l-74.123-62.468c-10.918 13.902-23.151 29.112-36.584 42.61-37.99 38.176-84.724 62.664-137.072 10.57-37.409-37.226-35.291-72.583-16.496-103.982 16.433-27.45 45.816-51.218 71.67-70.269l-61.266-75.052c-7.061 5.228-12.488 9.37-17.432 13.323-6.247 4.993-12.338 10.169-20.479 17.244-76.264 66.254-91.975 144.156-71.85 208.853 9.144 29.402 25.651 56.123 47.201 77.817 21.571 21.715 48.168 38.397 77.469 47.701 64.456 20.468 142.341 5.174 209.161-70.782zm16.203 4.408l-4.893 5.549c-71.394 81.155-155.28 97.283-225.009 75.141-31.676-10.058-60.375-28.038-83.595-51.414-23.241-23.397-41.042-52.217-50.91-83.943-21.761-69.959-5.157-153.864 76.384-224.701 7.924-6.884 14.069-12.097 20.95-17.598 6.915-5.527 13.989-10.886 23.649-17.962 3.212-2.35 7.742-1.796 10.28 1.324l71.081 87.073a7.53 7.53 0 01-1.68 10.515c-26.122 18.962-57.707 43.222-74.031 70.492-15.341 25.627-16.893 54.663 14.196 85.599 43.577 43.365 83.3 22.153 115.805-10.509 14.611-14.681 27.918-31.682 39.572-46.574l.815-1.021a7.508 7.508 0 0110.574-.914l85.193 71.799a7.519 7.519 0 011.521 10.485c-12.736 17.159-18.879 24.148-29.55 36.229l-.352.43zm70.793-252.908l64.212-12.897c4.785-.987 7.751 4.32 4.484 7.459l-27.629 26.492 23.196 23.479c2.223 2.166 3.47 4.044 3.397 6.058-.085 2.388-1.664 4.04-5.107 5.22l-1.277.399c-23.874 5.765-50.334 9.945-74.657 14.724-6.673 1.386-10.599-4.402-5.446-9.371l26.343-25.406-.878-.834c-5.588-5.311-15.591-14.818-20.813-21.172-2.451-2.985-3.568-5.349-3.099-7.509.555-2.556 2.727-3.936 6.768-4.538l10.506-2.104z"/>
          </svg>
          drag nodes here
        </div>`;
        area.style.minHeight = '80px';
        return;
    }

    // Straight list — one card directly below the next
    children.forEach((child, i) => {
        const isLast = (i === children.length - 1);
        const card = document.createElement('div');
        card.className = 'stack-card';

        const titleEl = document.getElementById('node-' + child.id)?.querySelector('.node-title');
        const titleVal = titleEl?.value?.trim() || child.title?.trim() || 'Untitled';
        const bodyEl  = document.getElementById('node-' + child.id)?.querySelector('.node-text-input');
        const bodyVal = bodyEl ? bodyEl.value : child.text || '';

        card.innerHTML = `
          <div class="stack-card-header">
            <span>${titleVal}</span>
            <div class="stack-card-dots">
              <span class="dot-circle"></span>
              <span class="dot-circle"></span>
              <span class="dot-circle"></span>
            </div>
          </div>
          ${bodyVal ? `<div class="stack-card-content">${bodyVal}</div>` : ''}
        `;
        area.appendChild(card);
    });

    area.style.minHeight = '';
}

function ejectOneFromStack(stackId) {
    const stackNode = nodes.find(n => n.id === stackId);
    if (!stackNode?.stackChildren?.length) return;

    // Pop the top (last) child
    const childId = stackNode.stackChildren[stackNode.stackChildren.length - 1];
    const child = nodes.find(n => n.id === childId);
    if (!child) { stackNode.stackChildren.pop(); renderStackCards(stackNode); return; }

    // Detach from stack
    child.stackParentId = null;
    stackNode.stackChildren = stackNode.stackChildren.filter(id => id !== childId);
    renderStackCards(stackNode);

    const el = document.getElementById('node-' + childId);
    if (!el) { saveState(); return; }

    // ── coordinate helpers ────────────────────────────────────────────
    const jitter = () => (Math.random() - 0.5);
    // Viewport centre in canvas coords
    const vpCx = (window.innerWidth  / 2 - pan.x) / zoom;
    const vpCy = (window.innerHeight / 2 - pan.y) / zoom;

    // Start: right next to the ear, vertically centred on stack
    const startX = stackNode.x + stackNode.w + 55;
    const startY = stackNode.y + stackNode.h / 2 - child.h / 2;

    // ── Target "legible" dimensions for Phase 2 ───────────────────────
    // Aim for at least 420×280 visual px, capped at 72%×68% of viewport.
    // Canvas px = visual px / zoom, so the node truly stretches its edges.
    const minVisW = Math.min(420, window.innerWidth  * 0.6);
    const minVisH = Math.min(280, window.innerHeight * 0.5);
    const targetVisW = Math.min(window.innerWidth  * 0.72, Math.max(minVisW, child.w * zoom));
    const targetVisH = Math.min(window.innerHeight * 0.68, Math.max(minVisH, child.h * zoom));
    const targetW = targetVisW / zoom;
    const targetH = targetVisH / zoom;

    // Landing zone: viewport centre, using expanded target dimensions
    const landX = vpCx - targetW / 2 + jitter() * 80;
    const landY = vpCy - targetH / 2;

    // ── departure randomness ──────────────────────────────────────────
    const stackScreenX = pan.x + stackNode.x * zoom;
    const goRight = stackScreenX < window.innerWidth / 2;
    const margin  = 60;

    const r = Math.random();
    let finalX, finalY;

    if (r < 0.07) {
        // ~7 %: reverses — drifts BACK toward the stack side instead
        finalX = goRight
            ? (margin - child.w - pan.x) / zoom
            : (window.innerWidth - margin - pan.x) / zoom;
        finalY = landY + jitter() * (window.innerHeight * 0.4 / zoom);
    } else {
        const baseX = goRight
            ? (window.innerWidth - margin - pan.x) / zoom - child.w
            : (margin - pan.x) / zoom;
        const ySeed = Math.random();
        if (ySeed < 0.18) {
            // Near top of viewport
            finalX = baseX;
            finalY = (70 - pan.y) / zoom;
        } else if (ySeed < 0.36) {
            // Near bottom of viewport
            finalX = baseX;
            finalY = (window.innerHeight - 110 - pan.y) / zoom - child.h;
        } else if (ySeed < 0.52) {
            // Barely moves — short nudge from centre
            const nudge = (110 + Math.random() * 170) / zoom;
            finalX = landX + (goRight ? nudge : -nudge);
            finalY = landY + jitter() * (window.innerHeight * 0.18 / zoom);
        } else {
            // General scatter across visible vertical range
            finalX = baseX;
            finalY = landY + (jitter() * window.innerHeight * 0.55) / zoom;
        }
    }

    const departDur = 0.72 + Math.random() * 0.44; // 0.72 – 1.16 s

    // ── Phase 1: snap to start, invisible, small ─────────────────────
    el.style.transition = 'none';
    el.style.left       = startX + 'px';
    el.style.top        = startY + 'px';
    el.style.width      = (child.w * 0.62) + 'px';
    el.style.height     = (child.h * 0.62) + 'px';
    el.style.opacity    = '0';
    el.style.zIndex     = '60';
    el.style.display    = '';
    void el.getBoundingClientRect(); // flush

    // ── Phase 2: spring to centre, stretch to legible size ────────────
    const spring = 'cubic-bezier(0.34,1.28,0.64,1)';
    el.style.transition =
        `left 0.7s ${spring},` +
        `top  0.7s ${spring},` +
        `width 0.75s ${spring},` +
        `height 0.75s ${spring},` +
        `opacity 0.4s ease-out`;
    el.style.left    = landX + 'px';
    el.style.top     = landY + 'px';
    el.style.width   = targetW + 'px';
    el.style.height  = targetH + 'px';
    el.style.opacity = '1';
    child.x = landX; child.y = landY;

    // ── Phase 3: glide to resting spot, contract back to original size ─
    const stay = 3000 + Math.random() * 3000; // 3 – 6 s
    setTimeout(() => {
        const glide = 'cubic-bezier(0.4,0,0.6,1)';
        const sizeDur = (departDur * 0.88).toFixed(2);
        el.style.transition =
            `left ${departDur}s ${glide},` +
            `top  ${departDur}s ${glide},` +
            `width ${sizeDur}s ease-in-out,` +
            `height ${sizeDur}s ease-in-out`;
        el.style.left   = finalX + 'px';
        el.style.top    = finalY + 'px';
        el.style.width  = child.w + 'px';
        el.style.height = child.h + 'px';
        child.x = finalX; child.y = finalY;

        // Cleanup: only clear transition — no transform to snap back from
        setTimeout(() => {
            el.style.transition = '';
            el.style.zIndex     = '';
            saveState();
        }, Math.round(departDur * 1000) + 120);
    }, stay);
}

// ═══════════════════════════════════════════
//  INIT & ANIMATION
// ═══════════════════════════════════════════
updateDotGrid();
applyTransform();
// default nodes are generated via setTimeout inside loadState fallback
// if there's no stored progress found.

let lastTime = performance.now();
requestAnimationFrame(function animatePulses(time) {
    const dt = time - lastTime;
    lastTime = time;

    if (dt < 200) {
        connections.forEach(c => {
            const path = document.getElementById('conn-' + c.id);
            if (!path || !c.length) return;

            c.nextPulse -= dt;
            if (c.nextPulse <= 0) {
                const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
                pulse.setAttribute('rx', '4.6');
                pulse.setAttribute('ry', '1.3');
                pulse.classList.add('conn-pulse');
                // Prepend so it renders purely under all lines
                svgEl.prepend(pulse);

                c.pulses.push({ el: pulse, d: 0 });

                if (c.burstsLeft > 0) {
                    c.burstsLeft--;
                    c.nextPulse = Math.random() * 300 + 150; // Quick succession (150-450ms)
                } else {
                    c.burstsLeft = Math.floor(Math.random() * 3); // 0, 1, or 2 more in next burst
                    c.nextPulse = Math.random() * 4000 + 1500; // 1.5 - 5.5s pause
                }
            }

            const speed = 216; // Fast traversal (20% faster)
            for (let i = c.pulses.length - 1; i >= 0; i--) {
                const p = c.pulses[i];
                p.d += (speed * dt) / 1000;
                if (p.d >= c.length) {
                    p.el.remove();
                    c.pulses.splice(i, 1);
                } else {
                    try {
                        const pt = path.getPointAtLength(p.d);
                        let pt2 = path.getPointAtLength(Math.min(p.d + 1, c.length));
                        let angle;
                        if (pt2.x === pt.x && pt2.y === pt.y) {
                            pt2 = path.getPointAtLength(Math.max(p.d - 1, 0));
                            angle = Math.atan2(pt.y - pt2.y, pt.x - pt2.x) * (180 / Math.PI);
                        } else {
                            angle = Math.atan2(pt2.y - pt.y, pt2.x - pt.x) * (180 / Math.PI);
                        }
                        const easeInOutScale = Math.max(0, Math.min(1, p.d / 16, (c.length - p.d) / 16));
                        p.el.setAttribute('transform', `translate(${pt.x}, ${pt.y}) rotate(${angle}) scale(${easeInOutScale})`);
                    } catch (e) { }
                }
            }
        });
    }
    requestAnimationFrame(animatePulses);
});
