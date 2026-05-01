// ═══════════════════════════════════════════════════════════════════════
//  TEXT LAYER
// ═══════════════════════════════════════════════════════════════════════

let selectedTextId = null;

function createText(x, y, z = 0) {
    const id = tid++;
    const data = {
        id,
        content: 'Text',
        x, y, z,
        fontSize: 32,
        fontFamily: 'system-ui',
        color: '#000000',
        rotation: 0,
        shadow: { enabled: false, angle: 45, distance: 4, blur: 8, opacity: 0.3, color: '#000000' },
        drift: { enabled: false, direction: 0, speed: 1 },
        randomWriteOn: { enabled: false, duration: 1 },
        slideUp: { enabled: false, duration: 0.5 }
    };
    texts.push(data);
    mountText(data);
    const el = document.getElementById('text-' + id);
    if (el) {
        const bounds = el.getBoundingClientRect();
        data.x = x - (bounds.width / zoom) / 2;
        data.y = y - (bounds.height / zoom) / 2;
        el.style.left = data.x + 'px';
        el.style.top = data.y + 'px';
    }
    selectText(id, { editing: true, placeCaretAtEnd: true });
    saveState();
    return id;
}

function mountText(data) {
    if (!data || !data.id) return;

    const scene = document.getElementById('scene');
    if (!scene) return;

    let el = document.getElementById('text-' + data.id);
    if (!el) {
        el = document.createElement('div');
        el.id = 'text-' + data.id;
        el.className = 'text-item';
        scene.appendChild(el);

        // Input for content
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'text-input';
        input.addEventListener('input', () => {
            saveState();
        });
        el.appendChild(input);

        // Selection chrome (handles + rotation knob)
        const chrome = document.createElement('div');
        chrome.className = 'text-chrome';
        chrome.innerHTML = `
            <div class="text-handle text-handle-n"></div>
            <div class="text-handle text-handle-e"></div>
            <div class="text-handle text-handle-s"></div>
            <div class="text-handle text-handle-w"></div>
            <div class="text-handle text-handle-ne"></div>
            <div class="text-handle text-handle-se"></div>
            <div class="text-handle text-handle-sw"></div>
            <div class="text-handle text-handle-nw"></div>
            <div class="text-rotate-knob"></div>
        `;
        el.appendChild(chrome);

        el.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.stopPropagation();

            if (e.target.closest('.text-rotate-knob')) {
                startRotateDrag(data.id, e);
                return;
            }
            if (e.target.classList.contains('text-handle')) {
                const cls = e.target.className;
                let corner = 'se';
                if (cls.includes('text-handle-nw')) corner = 'nw';
                else if (cls.includes('text-handle-ne')) corner = 'ne';
                else if (cls.includes('text-handle-sw')) corner = 'sw';
                else if (cls.includes('text-handle-se')) corner = 'se';
                startResizeDrag(data.id, e, corner);
                return;
            }

            const inputEl = e.target.closest('.text-input');
            const isSelected = selectedTextId === data.id;
            const isEditing = el.classList.contains('text-editing');
            if (inputEl && isSelected && isEditing) return;

            e.preventDefault();
            startTextDrag(data.id, e, {
                enterEditOnClick: !!inputEl && isSelected,
            });
        });

        el.addEventListener('dblclick', (e) => {
            const inputEl = e.target.closest('.text-input');
            if (!inputEl) return;
            e.stopPropagation();
            e.preventDefault();
            selectText(data.id, { editing: true, placeCaretAtEnd: true });
        });
    }

    // Apply data to DOM
    el.style.left = data.x + 'px';
    el.style.top = data.y + 'px';
    el.style.transform = `rotateZ(${data.rotation || 0}deg)`;
    el.dataset.z = data.z || 0;
    el.dataset.fontSize = data.fontSize || 16;
    el.dataset.fontFamily = data.fontFamily || 'system-ui';
    el.dataset.color = data.color || '#000000';
    el.dataset.rotation = data.rotation || 0;

    if (data.shadow && data.shadow.enabled) {
        el.dataset.shadow = JSON.stringify(data.shadow);
        applyShadowEffect(el, data.shadow);
    }
    if (data.drift && data.drift.enabled) {
        el.dataset.drift = JSON.stringify(data.drift);
    }
    if (data.randomWriteOn && data.randomWriteOn.enabled) {
        el.dataset.randomWriteOn = 'true';
    }
    if (data.slideUp && data.slideUp.enabled) {
        el.dataset.slideUp = 'true';
    }

    const input = el.querySelector('.text-input');
    if (input) {
        input.value = data.content || 'Text';
        input.style.fontSize = (data.fontSize || 16) + 'px';
        input.style.fontFamily = data.fontFamily || 'system-ui';
        input.style.color = data.color || '#000000';
        input.readOnly = !el.classList.contains('text-editing');
    }

    // Z-index from z value (3D depth)
    el.style.zIndex = data.z || 0;
    el.style.transform += ` translateZ(${(data.z || 0) * 100}px)`;
}

function selectText(id, options = {}) {
    const { editing = false, placeCaretAtEnd = false } = options;

    if (selectedTextId !== null) {
        const prevEl = document.getElementById('text-' + selectedTextId);
        if (prevEl) {
            prevEl.classList.remove('text-selected');
            prevEl.classList.remove('text-editing');
            const prevInput = prevEl.querySelector('.text-input');
            if (prevInput) {
                prevInput.readOnly = true;
                prevInput.blur();
            }
        }
    }

    selectedTextId = id;
    const el = document.getElementById('text-' + id);
    if (el) {
        el.classList.add('text-selected');
        setTextEditing(id, editing, { placeCaretAtEnd });
    }

    updateTextControlsFromSelection();
}

function deselectText() {
    if (selectedTextId !== null) {
        const el = document.getElementById('text-' + selectedTextId);
        if (el) {
            el.classList.remove('text-selected');
            el.classList.remove('text-editing');
            const input = el.querySelector('.text-input');
            if (input) {
                input.readOnly = true;
                input.blur();
            }
        }
    }
    selectedTextId = null;
}

function getSelectedText() {
    if (selectedTextId === null) return null;
    return texts.find(t => t.id === selectedTextId);
}

function setTextEditing(id, editing, options = {}) {
    const { placeCaretAtEnd = false } = options;
    const el = document.getElementById('text-' + id);
    if (!el) return;

    const input = el.querySelector('.text-input');
    el.classList.toggle('text-editing', !!editing);
    if (input) {
        input.readOnly = !editing;
        if (editing) {
            input.focus();
            if (placeCaretAtEnd) {
                const len = input.value.length;
                try { input.setSelectionRange(len, len); } catch (_) {}
            }
        } else {
            input.blur();
        }
    }
}

function startTextDrag(id, e, options = {}) {
    const el = document.getElementById('text-' + id);
    if (!el) return;

    const data = texts.find(t => t.id === id);
    if (!data) return;

    const { enterEditOnClick = false } = options;
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = data.x;
    const startTop = data.y;
    const captureEl = document.documentElement;
    const pid = e.pointerId;
    let moved = false;
    const dragThreshold = 4;

    selectText(id, { editing: false });
    document.body.classList.add('is-dragging');
    try { captureEl.setPointerCapture(pid); } catch (_) {}

    const onPointerMove = (evt) => {
        const dx = evt.clientX - startX;
        const dy = evt.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < dragThreshold) return;
        moved = true;
        data.x = startLeft + dx / zoom;
        data.y = startTop + dy / zoom;
        el.style.left = data.x + 'px';
        el.style.top = data.y + 'px';
    };

    const onPointerUp = () => {
        document.body.classList.remove('is-dragging');
        captureEl.removeEventListener('pointermove', onPointerMove);
        captureEl.removeEventListener('pointerup', onPointerUp);
        captureEl.removeEventListener('pointercancel', onPointerUp);
        try { captureEl.releasePointerCapture(pid); } catch (_) {}
        if (!moved && enterEditOnClick) {
            setTextEditing(id, true, { placeCaretAtEnd: true });
        }
        saveState();
    };

    captureEl.addEventListener('pointermove', onPointerMove);
    captureEl.addEventListener('pointerup', onPointerUp);
    captureEl.addEventListener('pointercancel', onPointerUp);
}

function startResizeDrag(id, e, corner) {
    e.preventDefault();
    const el = document.getElementById('text-' + id);
    if (!el) return;

    const data = texts.find(t => t.id === id);
    if (!data) return;

    const input = el.querySelector('.text-input');
    const startFontSize = data.fontSize || 32;
    const startCx = e.clientX;
    const startCy = e.clientY;
    const signX = (corner === 'nw' || corner === 'sw') ? -1 : 1;
    const signY = (corner === 'nw' || corner === 'ne') ? -1 : 1;
    const captureEl = document.documentElement;
    const pid = e.pointerId;

    const startW = el.offsetWidth / zoom;
    const startH = el.offsetHeight / zoom;
    const anchorX = data.x + (signX < 0 ? startW : 0);
    const anchorY = data.y + (signY < 0 ? startH : 0);
    selectText(id, { editing: false });
    document.body.classList.add('is-dragging');
    try { captureEl.setPointerCapture(pid); } catch (_) {}

    const onPointerMove = (evt) => {
        const dx = (evt.clientX - startCx) / zoom;
        const dy = (evt.clientY - startCy) / zoom;
        const delta = signX * dx + signY * dy;
        data.fontSize = Math.max(8, startFontSize + delta * 0.4);
        if (input) input.style.fontSize = data.fontSize + 'px';

        const r = data.fontSize / startFontSize;
        data.x = signX < 0 ? anchorX - startW * r : anchorX;
        data.y = signY < 0 ? anchorY - startH * r : anchorY;
        el.style.left = data.x + 'px';
        el.style.top  = data.y + 'px';
    };

    const onPointerUp = () => {
        document.body.classList.remove('is-dragging');
        captureEl.removeEventListener('pointermove', onPointerMove);
        captureEl.removeEventListener('pointerup', onPointerUp);
        captureEl.removeEventListener('pointercancel', onPointerUp);
        try { captureEl.releasePointerCapture(pid); } catch (_) {}
        saveState();
    };

    captureEl.addEventListener('pointermove', onPointerMove);
    captureEl.addEventListener('pointerup', onPointerUp);
    captureEl.addEventListener('pointercancel', onPointerUp);
}

function startRotateDrag(id, e) {
    e.preventDefault();
    const el = document.getElementById('text-' + id);
    if (!el) return;

    const data = texts.find(t => t.id === id);
    if (!data) return;

    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    const startRotation = data.rotation || 0;
    const captureEl = document.documentElement;
    const pid = e.pointerId;
    selectText(id, { editing: false });
    document.body.classList.add('is-dragging');
    try { captureEl.setPointerCapture(pid); } catch (_) {}

    const onPointerMove = (evt) => {
        const angle = Math.atan2(evt.clientY - centerY, evt.clientX - centerX) * (180 / Math.PI);
        data.rotation = (startRotation + (angle - startAngle)) % 360;
        el.dataset.rotation = data.rotation;
        el.style.transform = `rotateZ(${data.rotation}deg) translateZ(${(data.z || 0) * 100}px)`;
    };

    const onPointerUp = () => {
        document.body.classList.remove('is-dragging');
        captureEl.removeEventListener('pointermove', onPointerMove);
        captureEl.removeEventListener('pointerup', onPointerUp);
        captureEl.removeEventListener('pointercancel', onPointerUp);
        try { captureEl.releasePointerCapture(pid); } catch (_) {}
        saveState();
    };

    captureEl.addEventListener('pointermove', onPointerMove);
    captureEl.addEventListener('pointerup', onPointerUp);
    captureEl.addEventListener('pointercancel', onPointerUp);
}

function updateTextControlsFromSelection() {
    const text = getSelectedText();
    const fontSelect = document.getElementById('tc-font');
    const colorPicker = document.getElementById('tc-color');
    const sizeSlider = document.getElementById('tc-size');
    const zSlider = document.getElementById('tc-z');

    if (!text) {
        if (fontSelect) fontSelect.value = 'system-ui';
        if (colorPicker) colorPicker.value = '#000000';
        if (sizeSlider) sizeSlider.value = '32';
        if (zSlider) zSlider.value = '0';
        return;
    }

    if (fontSelect) fontSelect.value = text.fontFamily || 'system-ui';
    if (colorPicker) colorPicker.value = text.color || '#000000';
    if (sizeSlider) sizeSlider.value = text.fontSize || 32;
    if (zSlider) zSlider.value = text.z || 0;
}

function applyTextProperty(prop, value) {
    const text = getSelectedText();
    if (!text) return;

    const el = document.getElementById('text-' + text.id);
    if (!el) return;

    switch (prop) {
        case 'fontFamily':
            text.fontFamily = value;
            el.dataset.fontFamily = value;
            const input = el.querySelector('.text-input');
            if (input) input.style.fontFamily = value;
            break;
        case 'color':
            text.color = value;
            el.dataset.color = value;
            const inp2 = el.querySelector('.text-input');
            if (inp2) inp2.style.color = value;
            break;
        case 'fontSize':
            text.fontSize = parseFloat(value);
            el.dataset.fontSize = text.fontSize;
            const inp3 = el.querySelector('.text-input');
            if (inp3) inp3.style.fontSize = text.fontSize + 'px';
            break;
        case 'z':
            text.z = parseFloat(value);
            el.dataset.z = text.z;
            el.style.zIndex = text.z;
            el.style.transform = `rotateZ(${text.rotation || 0}deg) translateZ(${text.z * 100}px)`;
            break;
    }

    saveState();
}

function toggleEffectProp(prop, subroutine) {
    const text = getSelectedText();
    if (!text) return;

    if (prop === 'shadow') {
        text.shadow = text.shadow || {};
        text.shadow.enabled = !text.shadow.enabled;
        const el = document.getElementById('text-' + text.id);
        const controls = document.getElementById('tc-shadow-controls');
        const checkbox = document.getElementById('tc-shadow-check');
        if (controls) controls.style.display = text.shadow.enabled ? 'flex' : 'none';
        if (checkbox) checkbox.checked = text.shadow.enabled;
        if (text.shadow.enabled) {
            el.dataset.shadow = JSON.stringify(text.shadow);
            applyShadowEffect(el, text.shadow);
        } else {
            delete el.dataset.shadow;
            el.style.textShadow = '';
        }
    } else if (prop === 'drift') {
        text.drift = text.drift || {};
        text.drift.enabled = !text.drift.enabled;
        const el = document.getElementById('text-' + text.id);
        const controls = document.getElementById('tc-drift-controls');
        const checkbox = document.getElementById('tc-drift-check');
        if (controls) controls.style.display = text.drift.enabled ? 'flex' : 'none';
        if (checkbox) checkbox.checked = text.drift.enabled;
        if (text.drift.enabled) {
            el.dataset.drift = JSON.stringify(text.drift);
            applyDriftEffect(el, text.drift);
        } else {
            delete el.dataset.drift;
            el.style.animation = '';
        }
    } else if (prop === 'randomWriteOn') {
        text.randomWriteOn = text.randomWriteOn || {};
        text.randomWriteOn.enabled = !text.randomWriteOn.enabled;
        const el = document.getElementById('text-' + text.id);
        const controls = document.getElementById('tc-random-controls');
        const checkbox = document.getElementById('tc-random-write-check');
        if (controls) controls.style.display = text.randomWriteOn.enabled ? 'flex' : 'none';
        if (checkbox) checkbox.checked = text.randomWriteOn.enabled;
        el.dataset.randomWriteOn = text.randomWriteOn.enabled ? 'true' : 'false';
    } else if (prop === 'slideUp') {
        text.slideUp = text.slideUp || {};
        text.slideUp.enabled = !text.slideUp.enabled;
        const el = document.getElementById('text-' + text.id);
        const checkbox = document.getElementById('tc-slide-up-check');
        if (checkbox) checkbox.checked = text.slideUp.enabled;
        if (text.slideUp.enabled) {
            el.dataset.slideUp = 'true';
            el.classList.add('text-slide-up');
        } else {
            el.dataset.slideUp = 'false';
            el.classList.remove('text-slide-up');
        }
    }

    saveState();
}

function applyShadowEffect(el, shadowData) {
    if (!shadowData || !shadowData.enabled) {
        el.style.textShadow = '';
        return;
    }
    const angle = shadowData.angle || 45;
    const distance = shadowData.distance || 4;
    const blur = shadowData.blur || 8;
    const opacity = shadowData.opacity || 0.3;
    const color = shadowData.color || '#000000';

    const rad = angle * (Math.PI / 180);
    const offsetX = Math.cos(rad) * distance;
    const offsetY = Math.sin(rad) * distance;
    const rgb = hexToRgb(color);
    const shadowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity})`;

    el.style.textShadow = `${offsetX}px ${offsetY}px ${blur}px ${shadowColor}`;
}

function applyDriftEffect(el, driftData) {
    if (!driftData || !driftData.enabled) {
        el.style.animation = '';
        return;
    }
    const direction = driftData.direction || 0;
    const speed = driftData.speed || 1;
    const duration = (10 / speed);

    const rad = direction * (Math.PI / 180);
    const endX = Math.cos(rad) * 200;
    const endY = Math.sin(rad) * 200;

    const keyframes = `
        @keyframes drift-${el.id} {
            0% { transform: translate(0, 0); opacity: 1; }
            100% { transform: translate(${endX}px, ${endY}px); opacity: 0; }
        }
    `;

    let styleSheet = document.getElementById('drift-styles');
    if (!styleSheet) {
        styleSheet = document.createElement('style');
        styleSheet.id = 'drift-styles';
        document.head.appendChild(styleSheet);
    }
    styleSheet.textContent += keyframes;

    el.style.animation = `drift-${el.id} ${duration}s ease-out forwards`;
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

function deleteText(id) {
    const el = document.getElementById('text-' + id);
    if (el) el.remove();
    const idx = texts.findIndex(t => t.id === id);
    if (idx !== -1) texts.splice(idx, 1);
    if (selectedTextId === id) selectedTextId = null;
    saveState();
}

document.addEventListener('keydown', e => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    if (selectedTextId === null) return;
    const el = document.getElementById('text-' + selectedTextId);
    if (!el || el.classList.contains('text-editing')) return;
    e.preventDefault();
    deleteText(selectedTextId);
});

function activateTextMode() {
    setAddMode('text-layer');
}

// Effect updaters
function updateShadowAngle(value) {
    const text = getSelectedText();
    if (!text) return;
    text.shadow = text.shadow || {};
    text.shadow.angle = parseFloat(value);
    const el = document.getElementById('text-' + text.id);
    if (el) applyShadowEffect(el, text.shadow);
    saveState();
}

function updateShadowDistance(value) {
    const text = getSelectedText();
    if (!text) return;
    text.shadow = text.shadow || {};
    text.shadow.distance = parseFloat(value);
    const el = document.getElementById('text-' + text.id);
    if (el) applyShadowEffect(el, text.shadow);
    saveState();
}

function updateShadowBlur(value) {
    const text = getSelectedText();
    if (!text) return;
    text.shadow = text.shadow || {};
    text.shadow.blur = parseFloat(value);
    const el = document.getElementById('text-' + text.id);
    if (el) applyShadowEffect(el, text.shadow);
    saveState();
}

function updateShadowOpacity(value) {
    const text = getSelectedText();
    if (!text) return;
    text.shadow = text.shadow || {};
    text.shadow.opacity = parseFloat(value);
    const el = document.getElementById('text-' + text.id);
    if (el) applyShadowEffect(el, text.shadow);
    saveState();
}

function updateDriftDirection(value) {
    const text = getSelectedText();
    if (!text) return;
    text.drift = text.drift || {};
    text.drift.direction = parseFloat(value);
    saveState();
}

function updateDriftSpeed(value) {
    const text = getSelectedText();
    if (!text) return;
    text.drift = text.drift || {};
    text.drift.speed = parseFloat(value);
    saveState();
}

function updateRandomWriteDuration(value) {
    const text = getSelectedText();
    if (!text) return;
    text.randomWriteOn = text.randomWriteOn || {};
    text.randomWriteOn.duration = parseFloat(value);
    saveState();
}
