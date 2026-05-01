// ═══════════════════════════════════════════
//  CONNECTIONS
// ═══════════════════════════════════════════
function initPorts(el) {
    el.querySelectorAll('.conn-port').forEach(port => {
        port.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            e.stopPropagation(); e.preventDefault();
            connSrcId = parseInt(port.dataset.nid);
            const dirClass = Array.from(port.classList).find(c => c.startsWith('port-'));
            connSrcDir = dirClass ? dirClass.split('-')[1] : null;
            draggingConn = true;
            document.body.classList.add('is-dragging');
            connTempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            connTempPath.classList.add('conn-line-temp');
            svgEl.appendChild(connTempPath);

            // Capture pointer so events keep firing across iframes / off-window.
            const captureEl = document.documentElement;
            const pid = e.pointerId;
            try { captureEl.setPointerCapture(pid); } catch (_) {}

            const mv = e2 => {
                if (!draggingConn || !connTempPath) return;
                const sp = nodeEdgePoint(connSrcId, connSrcDir || 'right');
                const mp = clientToScene(e2.clientX, e2.clientY);
                connTempPath.setAttribute('d', bezier(sp, mp, connSrcDir || 'right', null));
                nodes.forEach(n => {
                    if (n.id === connSrcId) return;
                    const nel = document.getElementById('node-' + n.id);
                    if (!nel) return;
                    const near = mp.x > n.x - 60 && mp.x < n.x + n.w + 60 && mp.y > n.y - 60 && mp.y < n.y + n.h + 60;
                    nel.classList.toggle('conn-target-glow', near);
                });
            };
            const up = e2 => {
                captureEl.removeEventListener('pointermove', mv);
                captureEl.removeEventListener('pointerup', up);
                captureEl.removeEventListener('pointercancel', up);
                try { captureEl.releasePointerCapture(pid); } catch (_) {}
                if (draggingConn) finishConnection(e2);
            };
            captureEl.addEventListener('pointermove', mv);
            captureEl.addEventListener('pointerup', up);
            captureEl.addEventListener('pointercancel', up);
        });
    });
}

function finishConnection(e) {
    const mp = clientToScene(e.clientX, e.clientY);
    const target = nodes.find(n => {
        if (n.id === connSrcId) return false;
        if (n.type === 'stack') return false; // stack nodes cannot be connected
        return mp.x > n.x - 60 && mp.x < n.x + n.w + 60 && mp.y > n.y - 60 && mp.y < n.y + n.h + 60;
    });
    if (target) {
        addConnection(connSrcId, target.id);
        saveState();
    }
    if (connTempPath) { connTempPath.remove(); connTempPath = null; }
    draggingConn = false; connSrcId = null;
    document.body.classList.remove('is-dragging');
    nodes.forEach(n => document.getElementById('node-' + n.id)?.classList.remove('conn-target-glow'));
}

function addConnection(fromId, toId, forceId = null) {
    if (connections.find(c => (c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId))) return;
    const id = forceId || ++cid;
    if (id > cid) cid = id;
    const conn = {
        id, from: fromId, to: toId, length: 0,
        pulses: [],
        nextPulse: Math.random() * 1000,
        burstsLeft: Math.floor(Math.random() * 3)
    };
    connections.push(conn);
    // Live data routing for HTML controller↔graph nodes.
    // Skip during undo/redo: preserved iframes already hold the latest payload, and
    // re-firing dc:update would cause charts to re-animate from zero on every undo.
    // Non-preserved (freshly mounted) iframes still receive data via dcOnGraphPlay
    // when their iframe load event fires.
    if (!_inUndoRedo) { try { dcOnConnectionAdded?.(conn); } catch(e) {} }

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('conn-group');
    g.id = 'conn-group-' + id;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('conn-line');
    path.id = 'conn-' + id;

    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.classList.add('conn-hitbox');
    hitPath.id = 'conn-hit-' + id;

    const btn = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    btn.classList.add('conn-del-btn');
    btn.id = 'conn-del-' + id;
    btn.innerHTML = `<circle r="8" fill="#ff4444" /><text x="0" y="3.5" font-size="11" fill="white" text-anchor="middle" font-weight="bold" style="pointer-events: none;">×</text>`;

    btn.addEventListener('mousedown', e => {
        e.stopPropagation();
        deleteConnection(id);
    });

    g.appendChild(path);
    g.appendChild(hitPath);
    g.appendChild(btn);
    svgEl.appendChild(g);

    updateConnPath(id);
}

function deleteConnection(id) {
    connections = connections.filter(c => {
        if (c.id === id) {
            document.getElementById('conn-group-' + id)?.remove();
            document.getElementById('conn-' + id)?.remove();
            c.pulses.forEach(p => p.el.remove());
            return false;
        }
        return true;
    });
    saveState();
}

function nodeEdgePoint(id, side) {
    const n = nodes.find(n => n.id === id);
    if (!n) return { x: 0, y: 0 };
    if (side === 'right') return { x: n.x + n.w, y: n.y + n.h / 2 };
    if (side === 'left') return { x: n.x, y: n.y + n.h / 2 };
    if (side === 'top') return { x: n.x + n.w / 2, y: n.y };
    if (side === 'bottom') return { x: n.x + n.w / 2, y: n.y + n.h };
    return { x: n.x + n.w, y: n.y + n.h / 2 };
}

function updateConnPath(id) {
    const c = connections.find(c => c.id === id);
    if (!c) return;
    const path = document.getElementById('conn-' + id);
    if (!path) return;
    const a = nodes.find(n => n.id === c.from), b = nodes.find(n => n.id === c.to);
    if (!a || !b) return;
    const acx = a.x + a.w / 2, acy = a.y + a.h / 2;
    const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
    const dx = bcx - acx, dy = bcy - acy;
    let fp, tp, dirA, dirB;
    if (Math.abs(dx) > Math.abs(dy)) {
        fp = dx > 0 ? { x: a.x + a.w, y: acy } : { x: a.x, y: acy };
        tp = dx > 0 ? { x: b.x, y: bcy } : { x: b.x + b.w, y: bcy };
        dirA = dx > 0 ? 'right' : 'left';
        dirB = dx > 0 ? 'left' : 'right';
    } else {
        fp = dy > 0 ? { x: acx, y: a.y + a.h } : { x: acx, y: a.y };
        tp = dy > 0 ? { x: bcx, y: b.y } : { x: bcx, y: b.y + b.h };
        dirA = dy > 0 ? 'bottom' : 'top';
        dirB = dy > 0 ? 'top' : 'bottom';
    }
    const d = bezier(fp, tp, dirA, dirB);
    path.setAttribute('d', d);
    c.length = path.getTotalLength();

    const hitPath = document.getElementById('conn-hit-' + id);
    if (hitPath) hitPath.setAttribute('d', d);

    const btn = document.getElementById('conn-del-' + id);
    if (btn && c.length > 0) {
        const pt = path.getPointAtLength(c.length / 2);
        const s = Math.max(1, 1.2 / zoom);
        btn.setAttribute('transform', `translate(${pt.x}, ${pt.y}) scale(${s})`);
    }
}

const SVG_OFFSET = 10000; // SVG top-left is at -10000,-10000 in scene space

function bezier(a, b, dirA, dirB) {
    // Shift into SVG coordinate space
    const ax = a.x + SVG_OFFSET, ay = a.y + SVG_OFFSET;
    const bx = b.x + SVG_OFFSET, by = b.y + SVG_OFFSET;

    const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
    // distance-based curve strength forces line to exit straight before curving
    const dist = Math.sqrt(dx * dx + dy * dy);
    const strength = Math.max(dist * 0.4, 80); // Min 80px straight projection

    let cp1x = ax, cp1y = ay;
    if (dirA === 'right') cp1x += strength;
    else if (dirA === 'left') cp1x -= strength;
    else if (dirA === 'bottom') cp1y += strength;
    else if (dirA === 'top') cp1y -= strength;

    let cp2x = bx, cp2y = by;
    if (dirB === 'left') cp2x -= strength;
    else if (dirB === 'right') cp2x += strength;
    else if (dirB === 'top') cp2y -= strength;
    else if (dirB === 'bottom') cp2y += strength;
    else if (!dirB) {
        // If dragging to cursor without target, loop naturally towards cursor
        if (dirA === 'right') cp2x -= strength;
        else if (dirA === 'left') cp2x += strength;
        else if (dirA === 'bottom') cp2y -= strength;
        else if (dirA === 'top') cp2y += strength;
    }

    return `M${ax}, ${ay} C${cp1x}, ${cp1y} ${cp2x}, ${cp2y} ${bx}, ${by}`;
}

function redrawConnections() {
    connections.forEach(c => updateConnPath(c.id));
}

