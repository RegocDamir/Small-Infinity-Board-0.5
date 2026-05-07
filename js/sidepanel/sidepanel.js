// ═══════════════════════════════════════════════════════════════════════
//  SIDE PANEL  +  TOOLBAR DOCKING
// ═══════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    const HOVER_REVEAL_PX = 14;
    const SNAP_ZONE_PX    = 120;
    const DRAG_THRESHOLD_PX = 4;
    const UNDOCK_HOLD_MS  = 1200;
    const UNDOCK_EASE_MS  = 80;

    let panel, tag, closeBtn;
    let tb;
    let isOpen = false;
    let isDocked = false;
    let isTucked = false;

    let dragActive = false;
    let dragMoved = false;
    let dragStartX = 0, dragStartY = 0;

    function init() {
        tb       = document.getElementById('toolbar');
        panel    = document.getElementById('side-panel');
        tag      = document.getElementById('side-panel-tag');
        closeBtn = document.getElementById('side-panel-close');

        if (!panel || !tag || !tb) return;

        tag.addEventListener('click', openPanel);
        closeBtn.addEventListener('click', closePanel);

        document.addEventListener('mousedown', e => {
            if (isOpen) return;
            if (e.clientX > HOVER_REVEAL_PX) return;
            if (!document.body.classList.contains('sp-tag-visible')) return;
            e.preventDefault();
            e.stopPropagation();
            openPanel();
        }, true);

        document.addEventListener('mousemove', e => {
            if (isOpen) return;
            const near = e.clientX <= HOVER_REVEAL_PX;
            document.body.classList.toggle('sp-tag-visible', near);
        });

        installToolbarDockHooks();
        installContextMenuItem();
        updateDockBtn();
        buildChartPicker();
    }

    // ---- CHART PICKER -------------------------------------------------
    const CHART_FILES = [
        'controller.html',
        '01-bar-vertical.html',
        '02-bar-horizontal.html',
        '03-pie.html',
        '04-donut.html',
        '05-line-growth.html',
        '07-radar.html',
        '09-progress.html',
        '14-comparison.html',
        '25-waffle.html',
        '28-radial-bar.html',
    ];
    const CHART_DIR = 'Data Gata Charts + Controller/Data Cat Design System (3)/node-charts/';
    const CHART_TIP_SESSION_KEY = 'sib-chart-picker-tip-seen';

    function prettifyChartName(filename) {
        return filename
            .replace(/\.html$/i, '')
            .replace(/^\d+-/, '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    function buildChartPicker() {
        const section = document.getElementById('cp-section');
        const toggle  = document.getElementById('cp-toggle');
        const list    = document.getElementById('cp-list');
        if (!section || !toggle || !list) return;

        const tip = document.createElement('div');
        tip.className = 'cp-session-tip';
        tip.textContent = 'Copy and paste in the HTML node, and press play.';
        section.insertBefore(tip, list);

        toggle.addEventListener('click', () => {
            const open = section.classList.toggle('cp-open');
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open) showChartTipOnce(section);
            else section.classList.remove('cp-show-tip');
        });

        if (location.protocol === 'file:') {
            const msg = document.createElement('div');
            msg.className = 'cp-empty';
            msg.textContent = 'Open SIB through a local server (e.g. VS Code Live Server) to load chart templates.';
            list.appendChild(msg);
            return;
        }

        const frag = document.createDocumentFragment();
        CHART_FILES.forEach(filename => {
            const row = document.createElement('div');
            row.className = 'cp-item';
            if (filename === 'controller.html') row.classList.add('cp-controller');

            const name = document.createElement('span');
            name.className = 'cp-item-name';
            name.textContent = prettifyChartName(filename);

            const btn = document.createElement('button');
            btn.className = 'cp-copy-btn';
            btn.textContent = 'Copy';
            btn.title = `Copy HTML source of ${name.textContent}`;
            btn.addEventListener('click', () => copyChart(filename, btn));

            row.appendChild(name);
            row.appendChild(btn);
            frag.appendChild(row);
        });
        list.appendChild(frag);
    }

    function showChartTipOnce(section) {
        if (sessionStorage.getItem(CHART_TIP_SESSION_KEY) === '1') return;
        section.classList.add('cp-show-tip');
        sessionStorage.setItem(CHART_TIP_SESSION_KEY, '1');
    }

    function stripDevInjections(html) {
        // Live Server appends a <!-- Code injected by live-server --> <script>…</script>
        // block before </body>. Strip it so the clipboard matches the source file.
        return html
            .replace(/\s*<!--\s*Code injected by live-server\s*-->[\s\S]*?<\/script>\s*/gi, '')
            .replace(/\s+<\/body>/i, '\n</body>');
    }

    async function copyChart(filename, btn) {
        if (btn.disabled) return;
        btn.disabled = true;
        const originalText = btn.textContent;
        try {
            const res = await fetch(encodeURI(CHART_DIR + filename));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const html = stripDevInjections(await res.text());
            await navigator.clipboard.writeText(html);
            btn.textContent = 'Copied';
            btn.classList.add('cp-copied');
        } catch (err) {
            console.error('Chart copy failed:', err);
            btn.textContent = 'Failed';
            btn.classList.add('cp-failed');
        } finally {
            setTimeout(() => {
                btn.textContent = originalText;
                btn.classList.remove('cp-copied', 'cp-failed');
                btn.disabled = false;
            }, 1000);
        }
    }

    function openPanel() {
        if (isOpen) return;
        isOpen = true;
        document.body.classList.add('sp-open');
        document.body.classList.remove('sp-tag-visible');
    }

    function closePanel() {
        if (!isOpen) return;
        isOpen = false;
        document.body.classList.remove('sp-open');
    }

    // ---- DOCK TOGGLE (button) -----------------------------------------
    function dockToggle() {
        if (isDocked) {
            undockToolbar();
        } else {
            if (!isOpen) openPanel();
            dockToolbar();
        }
    }

    // ---- TUCK TOGGLE (button) -----------------------------------------
    function tuckToggle() {
        if (!isDocked) return;
        isTucked = !isTucked;
        document.body.classList.toggle('sp-tb-tucked', isTucked);
        const btn = document.getElementById('btn-tuck-toggle');
        if (btn) btn.textContent = isTucked ? 'Untuck' : 'Tuck';
    }

    function updateDockBtn() {
        const btn = document.getElementById('btn-dock-toggle');
        if (btn) btn.textContent = isDocked ? 'Undock' : 'Dock';
    }

    // ---- TOOLBAR DOCKING ----------------------------------------------
    function installToolbarDockHooks() {
        let holdTimer = null;
        let dragStartedDocked = false;

        const handles = [
            document.getElementById('tb-drag-handle'),
            document.getElementById('tb-drag-handle-b')
        ].filter(Boolean);

        const onHandleDown = (e) => {
            dragActive = true;
            dragMoved = false;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            dragStartedDocked = isDocked;

            if (isDocked) {
                holdTimer = setTimeout(() => {
                    undockToolbar();
                    holdTimer = null;
                }, UNDOCK_HOLD_MS);
            }
        };

        handles.forEach(h => h.addEventListener('mousedown', onHandleDown));

        document.addEventListener('mousemove', e => {
            if (!dragActive) return;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            if (!dragMoved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
                dragMoved = true;
                if (isOpen && !isDocked) {
                    document.body.classList.add('sp-tb-dragging');
                }
            }
            if (!dragMoved) return;

        });

        document.addEventListener('mouseup', () => {
            const wasDragged = dragActive && dragMoved;
            dragActive = false;
            if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }

            document.body.classList.remove('sp-tb-dragging');

            if (!wasDragged) { dragStartedDocked = false; return; }
            if (!isOpen)     { dragStartedDocked = false; return; }
            if (isDocked)    { dragStartedDocked = false; return; }
            if (dragStartedDocked) { dragStartedDocked = false; return; }

            const tbRect    = tb.getBoundingClientRect();
            const panelRect = panel.getBoundingClientRect();
            if (isInSnapZone(tbRect, panelRect)) dockToolbar();
            dragStartedDocked = false;
        });
    }

    function isInSnapZone(tbRect, panelRect) {
        const zoneLeft   = panelRect.left;
        const zoneRight  = panelRect.left + SNAP_ZONE_PX;
        const zoneTop    = panelRect.bottom - SNAP_ZONE_PX;
        const zoneBottom = panelRect.bottom;
        const x = tbRect.left;
        const y = tbRect.bottom;
        return x >= zoneLeft - 30 && x <= zoneRight && y >= zoneTop && y <= zoneBottom + 30;
    }

    function dockToolbar() {
        if (isDocked) return;
        isDocked = true;
        tb.style.left = '';
        tb.style.top = '';
        tb.style.bottom = '';
        tb.style.transform = '';
        document.body.classList.add('sp-tb-docked');
        updateDockBtn();
    }

    function undockToolbar() {
        if (!isDocked) return;
        isDocked = false;
        isTucked = false;
        document.body.classList.add('sp-tb-undocking');
        document.body.classList.remove('sp-tb-docked', 'sp-tb-tucked');
        window.setTimeout(() => {
            document.body.classList.remove('sp-tb-undocking');
        }, UNDOCK_EASE_MS);
        tb.style.left = '';
        tb.style.top = '';
        tb.style.bottom = '';
        tb.style.transform = '';
        updateDockBtn();
        const tuckBtn = document.getElementById('btn-tuck-toggle');
        if (tuckBtn) tuckBtn.textContent = 'Tuck';
    }

    function installContextMenuItem() {
        const ctxMenu = document.getElementById('ctx-menu');
        if (!ctxMenu) return;

        const item = document.createElement('div');
        item.className = 'ctx-item';
        item.id = 'ctx-undock-tb';
        item.textContent = 'Undock toolbar';
        item.style.display = 'none';
        item.addEventListener('click', () => {
            undockToolbar();
            ctxMenu.style.display = 'none';
        });
        ctxMenu.insertBefore(item, ctxMenu.firstChild);

        document.addEventListener('contextmenu', e => {
            if (!isDocked) return;
            if (!e.target.closest('#toolbar')) return;
            e.preventDefault();
            e.stopPropagation();
            Array.from(ctxMenu.children).forEach(c => {
                c.style.display = (c.id === 'ctx-undock-tb') ? 'block' : 'none';
            });
            ctxMenu.style.display = 'block';
            const mw = ctxMenu.offsetWidth, mh = ctxMenu.offsetHeight;
            const vw = window.innerWidth,   vh = window.innerHeight;
            ctxMenu.style.left = Math.min(e.clientX, vw - mw - 8) + 'px';
            ctxMenu.style.top  = Math.min(e.clientY, vh - mh - 8) + 'px';
        }, true);

        document.addEventListener('click', e => {
            if (e.target.closest('#ctx-menu')) return;
            Array.from(ctxMenu.children).forEach(c => {
                if (c.id === 'ctx-undock-tb') c.style.display = 'none';
                else c.style.display = '';
            });
        });
    }

    window.SidePanel = { open: openPanel, close: closePanel, dock: dockToolbar, undock: undockToolbar, dockToggle, tuckToggle };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
