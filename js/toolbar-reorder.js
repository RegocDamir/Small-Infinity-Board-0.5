(function () {
    'use strict';

    const STORAGE_KEY = 'tb-slot-order';
    const HOLD_MS = 1500;
    const MOVE_PX = 4;

    let holdTimer = null;
    let dragging = false;
    let dragEl = null;
    let dragStart = null;
    let indicator = null;
    let dropIndex = -1;
    let blockNextClick = false;

    function face() { return document.querySelector('.tb-front'); }
    function slots() { return [...face().querySelectorAll(':scope > .tb-slot')]; }

    function saveOrder() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slots().map(s => s.dataset.tbSlot)));
    }

    function loadOrder() {
        const f = face();
        let order;
        try { order = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return; }
        if (!Array.isArray(order)) return;
        order.forEach(function (id) {
            const el = f.querySelector(':scope > [data-tb-slot="' + id + '"]');
            if (el) f.appendChild(el);
        });
    }

    function getIndicator() {
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'tb-drop-indicator';
            face().appendChild(indicator);
        }
        return indicator;
    }

    function removeIndicator() {
        if (indicator) { indicator.remove(); indicator = null; }
    }

    function updateIndicator(clientX) {
        const f = face();
        const all = slots();
        if (!all.length) return;

        const fRect = f.getBoundingClientRect();
        let idx = all.length;

        for (let i = 0; i < all.length; i++) {
            const r = all[i].getBoundingClientRect();
            if (clientX < r.left + r.width / 2) { idx = i; break; }
        }
        dropIndex = idx;

        let x;
        if (idx === 0) {
            x = all[0].getBoundingClientRect().left - fRect.left;
        } else if (idx >= all.length) {
            x = all[all.length - 1].getBoundingClientRect().right - fRect.left;
        } else {
            const prev = all[idx - 1].getBoundingClientRect();
            const next = all[idx].getBoundingClientRect();
            x = (prev.right + next.left) / 2 - fRect.left;
        }

        const ind = getIndicator();
        ind.style.left = x + 'px';
    }

    function performDrop() {
        if (!dragEl || dropIndex < 0) return;
        const f = face();
        const all = slots();
        const currentIdx = all.indexOf(dragEl);
        if (currentIdx < 0) return;

        const others = all.filter(function (s) { return s !== dragEl; });
        const adj = dropIndex > currentIdx ? dropIndex - 1 : dropIndex;
        const ref = others[adj] || null;
        f.insertBefore(dragEl, ref);
        saveOrder();
    }

    function cleanup(doDropArg) {
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
        if (doDropArg) performDrop();
        if (dragEl) dragEl.classList.remove('tb-dragging-item');
        removeIndicator();
        document.body.style.cursor = '';
        dragEl = null;
        dragging = false;
        dropIndex = -1;
    }

    function onDocMove(e) {
        if (dragging) {
            updateIndicator(e.clientX);
            return;
        }
        // Still in hold phase — cancel if mouse moved too far
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        if (dx * dx + dy * dy > MOVE_PX * MOVE_PX) {
            cleanup(false);
            document.removeEventListener('mousemove', onDocMove);
            document.removeEventListener('mouseup', onDocUp);
        }
    }

    function onDocUp() {
        document.removeEventListener('mousemove', onDocMove);
        document.removeEventListener('mouseup', onDocUp);

        if (!dragging) {
            // Normal click — clear timer and let click fire normally
            cleanup(false);
            return;
        }

        cleanup(true);

        // Suppress the click that fires immediately after this mouseup
        blockNextClick = true;
        setTimeout(function () { blockNextClick = false; }, 300);
    }

    function onSlotDown(e) {
        if (e.button !== 0) return;
        const slotEl = e.target.closest('.tb-slot');
        if (!slotEl || 'tbFixed' in slotEl.dataset) return;

        dragEl = slotEl;
        dragStart = { x: e.clientX, y: e.clientY };

        document.addEventListener('mousemove', onDocMove);
        document.addEventListener('mouseup', onDocUp);

        holdTimer = setTimeout(function () {
            holdTimer = null;
            dragging = true;
            document.body.style.cursor = 'grabbing';
            slotEl.classList.add('tb-dragging-item');
            updateIndicator(dragStart.x);
        }, HOLD_MS);
    }

    function init() {
        loadOrder();

        face().addEventListener('mousedown', onSlotDown);

        // Capture-phase click suppressor after drag-release
        document.addEventListener('click', function (e) {
            if (blockNextClick) {
                blockNextClick = false;
                e.stopPropagation();
                e.preventDefault();
            }
        }, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
