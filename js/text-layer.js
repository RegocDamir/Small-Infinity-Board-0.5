// ═══════════════════════════════════════════════════════════════════════
//  TEXT LAYER
// ═══════════════════════════════════════════════════════════════════════

let selectedTextId = null;
const textDriftRunners = new Map();
let textDriftRaf = null;

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
        shadow: { enabled: false, angle: 45, distance: 8, blur: 14, opacity: 0.85, color: '#00d4ff' },
        drift: { enabled: false, direction: 'ltr', speed: 20 },
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
    if (!data || data.id == null) return;

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
            data.content = input.value;
            if (selectedTextId === data.id) {
                const contentInput = document.getElementById('tc-content');
                if (contentInput && contentInput.value !== input.value) contentInput.value = input.value;
            }
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
        startTextDrift(data.id);
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
    window.sidePanelSelectedNodeId = null;
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
    const captureEl = document.documentElement;
    const pid = e.pointerId;
    const startW = el.offsetWidth;
    const startH = el.offsetHeight;
    const rotation = ((data.rotation || 0) * Math.PI) / 180;
    const opposite = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' }[corner] || 'nw';
    const fixedLocal = textHandleLocal(opposite, startW, startH);
    const draggedLocal = textHandleLocal(corner, startW, startH);
    const fixedWorld = textLocalToScene(data.x, data.y, startW, startH, fixedLocal, rotation);
    const draggedWorld = textLocalToScene(data.x, data.y, startW, startH, draggedLocal, rotation);
    const pointerStart = clientToScene(e.clientX, e.clientY);
    const pointerOffset = {
        x: pointerStart.x - draggedWorld.x,
        y: pointerStart.y - draggedWorld.y
    };
    const startVec = {
        x: draggedLocal.x - fixedLocal.x,
        y: draggedLocal.y - fixedLocal.y
    };
    const startLenSq = Math.max(1, startVec.x * startVec.x + startVec.y * startVec.y);

    selectText(id, { editing: false });
    document.body.classList.add('is-dragging');
    try { captureEl.setPointerCapture(pid); } catch (_) {}

    const onPointerMove = (evt) => {
        const pointer = clientToScene(evt.clientX, evt.clientY);
        const targetWorld = {
            x: pointer.x - pointerOffset.x,
            y: pointer.y - pointerOffset.y
        };
        const targetVec = textSceneVectorToLocal({
            x: targetWorld.x - fixedWorld.x,
            y: targetWorld.y - fixedWorld.y
        }, rotation);
        const scale = Math.max(8 / startFontSize, (targetVec.x * startVec.x + targetVec.y * startVec.y) / startLenSq);
        let nextFontSize = Math.max(8, startFontSize * scale);
        for (let i = 0; i < 2; i++) {
            data.fontSize = nextFontSize;
            el.dataset.fontSize = data.fontSize;
            if (input) input.style.fontSize = data.fontSize + 'px';
            const measuredW = el.offsetWidth;
            const measuredH = el.offsetHeight;
            const measuredFixed = textHandleLocal(opposite, measuredW, measuredH);
            const measuredDragged = textHandleLocal(corner, measuredW, measuredH);
            const measuredVec = {
                x: measuredDragged.x - measuredFixed.x,
                y: measuredDragged.y - measuredFixed.y
            };
            const measuredLenSq = Math.max(1, measuredVec.x * measuredVec.x + measuredVec.y * measuredVec.y);
            const correction = Math.max(8 / nextFontSize, (targetVec.x * measuredVec.x + targetVec.y * measuredVec.y) / measuredLenSq);
            const correctedFontSize = Math.max(8, nextFontSize * correction);
            if (Math.abs(correctedFontSize - nextFontSize) < 0.05) break;
            nextFontSize = correctedFontSize;
        }
        data.fontSize = nextFontSize;
        el.dataset.fontSize = data.fontSize;
        if (input) input.style.fontSize = data.fontSize + 'px';

        const nextW = el.offsetWidth;
        const nextH = el.offsetHeight;
        const nextFixedLocal = textHandleLocal(opposite, nextW, nextH);
        const nextCenter = { x: nextW / 2, y: nextH / 2 };
        const fixedFromCenter = textRotateVector({
            x: nextFixedLocal.x - nextCenter.x,
            y: nextFixedLocal.y - nextCenter.y
        }, rotation);
        data.x = fixedWorld.x - nextCenter.x - fixedFromCenter.x;
        data.y = fixedWorld.y - nextCenter.y - fixedFromCenter.y;
        el.style.left = data.x + 'px';
        el.style.top  = data.y + 'px';
        updateTextControlsFromSelection();
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

function textHandleLocal(corner, w, h) {
    const o = 15;
    if (corner === 'nw') return { x: -o, y: -o };
    if (corner === 'ne') return { x: w + o, y: -o };
    if (corner === 'sw') return { x: -o, y: h + o };
    return { x: w + o, y: h + o };
}

function textRotateVector(v, rotation) {
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

function textSceneVectorToLocal(v, rotation) {
    return textRotateVector(v, -rotation);
}

function textLocalToScene(left, top, w, h, local, rotation) {
    const center = { x: w / 2, y: h / 2 };
    const rotated = textRotateVector({
        x: local.x - center.x,
        y: local.y - center.y
    }, rotation);
    return {
        x: left + center.x + rotated.x,
        y: top + center.y + rotated.y
    };
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
    const contentInput = document.getElementById('tc-content');
    const fontSelect = document.getElementById('tc-font');
    const colorPicker = document.getElementById('tc-color');
    const sizeSlider = document.getElementById('tc-size');
    const zSlider = document.getElementById('tc-z');
    const sizeDisplay = document.getElementById('tc-size-display');
    const zDisplay = document.getElementById('tc-z-display');
    const shadowCheck = document.getElementById('tc-shadow-check');
    const shadowColor = document.getElementById('tc-shadow-color');
    const shadowAngle = document.getElementById('tc-shadow-angle');
    const shadowDistance = document.getElementById('tc-shadow-distance');
    const shadowBlur = document.getElementById('tc-shadow-blur');
    const shadowOpacity = document.getElementById('tc-shadow-opacity');
    const driftCheck = document.getElementById('tc-drift-check');
    const driftSpeed = document.getElementById('tc-drift-speed');
    const shadowControls = document.getElementById('tc-shadow-controls');
    const driftControls = document.getElementById('tc-drift-controls');

    if (!text) {
        if (contentInput) contentInput.value = '';
        if (fontSelect) fontSelect.value = 'system-ui';
        if (colorPicker) colorPicker.value = '#000000';
        if (sizeSlider) { sizeSlider.value = '32'; syncSliderFill(sizeSlider); }
        if (sizeDisplay) sizeDisplay.textContent = '32';
        if (zSlider) zSlider.value = '0';
        if (zDisplay) zDisplay.textContent = '0';
        if (shadowCheck) shadowCheck.checked = false;
        if (shadowColor) shadowColor.value = '#00d4ff';
        if (shadowAngle) shadowAngle.value = '45';
        if (shadowDistance) shadowDistance.value = '8';
        if (shadowBlur) shadowBlur.value = '14';
        if (shadowOpacity) shadowOpacity.value = '0.85';
        if (driftCheck) driftCheck.checked = false;
        setDriftDirectionButtons('ltr');
        if (driftSpeed) driftSpeed.value = '20';
        if (shadowControls) shadowControls.classList.remove('tc-open');
        if (driftControls) driftControls.classList.remove('tc-open');
        return;
    }

    if (contentInput) contentInput.value = text.content || '';
    if (fontSelect) fontSelect.value = text.fontFamily || 'system-ui';
    if (colorPicker) colorPicker.value = text.color || '#000000';
    if (sizeSlider) { sizeSlider.value = text.fontSize || 32; syncSliderFill(sizeSlider); }
    if (sizeDisplay) sizeDisplay.textContent = Math.round(text.fontSize || 32);
    if (zSlider) zSlider.value = text.z || 0;
    if (zDisplay) zDisplay.textContent = text.z || 0;
    if (shadowCheck) shadowCheck.checked = !!text.shadow?.enabled;
    if (shadowColor) shadowColor.value = text.shadow?.color || '#00d4ff';
    if (shadowAngle) { shadowAngle.value = text.shadow?.angle ?? 45; syncSliderFill(shadowAngle); }
    if (shadowDistance) { shadowDistance.value = text.shadow?.distance ?? 8; syncSliderFill(shadowDistance); }
    if (shadowBlur) { shadowBlur.value = text.shadow?.blur ?? 14; syncSliderFill(shadowBlur); }
    if (shadowOpacity) { shadowOpacity.value = text.shadow?.opacity ?? 0.85; syncSliderFill(shadowOpacity); }
    if (driftCheck) driftCheck.checked = !!text.drift?.enabled;
    setDriftDirectionButtons(text.drift?.direction || 'ltr');
    if (driftSpeed) driftSpeed.value = text.drift?.speed ?? 20;
}

function applyTextContent(value) {
    const text = getSelectedText();
    if (!text) return;
    text.content = value;
    const el = document.getElementById('text-' + text.id);
    const input = el?.querySelector('.text-input');
    if (input) input.value = value;
    saveState();
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
            const sizeDisplay = document.getElementById('tc-size-display');
            if (sizeDisplay) sizeDisplay.textContent = Math.round(text.fontSize);
            break;
        case 'z':
            text.z = parseFloat(value);
            el.dataset.z = text.z;
            el.style.zIndex = text.z;
            el.style.transform = `rotateZ(${text.rotation || 0}deg) translateZ(${text.z * 100}px)`;
            const zDisplay = document.getElementById('tc-z-display');
            if (zDisplay) zDisplay.textContent = text.z;
            break;
    }

    saveState();
}

function toggleShadowPanel() {
    const controls = document.getElementById('tc-shadow-controls');
    if (!controls) return;
    const opening = !controls.classList.contains('tc-open');
    controls.classList.toggle('tc-open');
    if (opening) {
        ['tc-shadow-angle', 'tc-shadow-distance', 'tc-shadow-blur', 'tc-shadow-opacity'].forEach(id => {
            syncSliderFill(document.getElementById(id));
        });
    }
}


function toggleDriftPanel() {
    const controls = document.getElementById('tc-drift-controls');
    if (!controls) return;
    const opening = !controls.classList.contains('tc-open');
    controls.classList.toggle('tc-open');
    if (opening) syncSliderFill(document.getElementById('tc-drift-speed'));
}

document.addEventListener('click', function(e) {
    document.querySelectorAll('.tc-effect-controls').forEach(panel => {
        if (!panel.classList.contains('tc-open')) return;
        const group = panel.closest('.tc-effect-group');
        if (group && !group.contains(e.target)) panel.classList.remove('tc-open');
    });
});

function toggleEffectProp(prop, subroutine) {
    const text = getSelectedText();
    if (!text) return;

    if (prop === 'shadow') {
        const wasEnabled = !!text.shadow?.enabled;
        text.shadow = wasEnabled
            ? { angle: 45, distance: 8, blur: 14, opacity: 0.85, color: '#00d4ff', ...text.shadow }
            : { angle: 45, distance: 8, blur: 14, opacity: 0.85, color: '#00d4ff', enabled: false };
        text.shadow.enabled = !wasEnabled;
        const el = document.getElementById('text-' + text.id);
        const checkbox = document.getElementById('tc-shadow-check');
        if (checkbox) checkbox.checked = text.shadow.enabled;
        if (text.shadow.enabled) {
            el.dataset.shadow = JSON.stringify(text.shadow);
            applyShadowEffect(el, text.shadow);
        } else {
            delete el.dataset.shadow;
            el.style.textShadow = '';
            const input = el.querySelector('.text-input');
            if (input) {
                input.style.textShadow = '';
                input.style.filter = '';
            }
        }
    } else if (prop === 'drift') {
        text.drift = { direction: 'ltr', speed: 20, ...text.drift };
        text.drift.enabled = !text.drift.enabled;
        const el = document.getElementById('text-' + text.id);
        const checkbox = document.getElementById('tc-drift-check');
        if (checkbox) checkbox.checked = text.drift.enabled;
        if (text.drift.enabled) {
            el.dataset.drift = JSON.stringify(text.drift);
            startTextDrift(text.id);
        } else {
            delete el.dataset.drift;
            stopTextDrift(text.id);
        }
    }

    saveState();
}

function applyShadowEffect(el, shadowData) {
    if (!shadowData || !shadowData.enabled) {
        el.style.textShadow = '';
        const input = el.querySelector('.text-input');
        if (input) {
            input.style.textShadow = '';
            input.style.filter = '';
        }
        return;
    }
    const angle = shadowData.angle ?? 45;
    const distance = shadowData.distance ?? 8;
    const blur = shadowData.blur ?? 14;
    const opacity = shadowData.opacity ?? 0.85;
    const color = shadowData.color || '#00d4ff';

    const rad = angle * (Math.PI / 180);
    const offsetX = Math.cos(rad) * distance;
    const offsetY = Math.sin(rad) * distance;
    const rgb = hexToRgb(color);
    const shadowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity})`;

    const value = `${offsetX}px ${offsetY}px ${blur}px ${shadowColor}`;
    el.style.textShadow = '';
    const input = el.querySelector('.text-input');
    if (input) {
        input.style.textShadow = '';
        input.style.filter = `drop-shadow(${value})`;
    }
}

function startTextDrift(id) {
    const text = texts.find(t => t.id === id);
    const el = document.getElementById('text-' + id);
    if (!text || !el || !text.drift?.enabled) return;
    textDriftRunners.set(id, { last: performance.now() });
    el.dataset.drift = JSON.stringify(text.drift);
    if (!textDriftRaf) textDriftRaf = requestAnimationFrame(tickTextDrift);
}

function stopTextDrift(id) {
    textDriftRunners.delete(id);
    if (textDriftRunners.size === 0 && textDriftRaf) {
        cancelAnimationFrame(textDriftRaf);
        textDriftRaf = null;
    }
}

function tickTextDrift(now) {
    textDriftRunners.forEach((runner, id) => {
        const text = texts.find(t => t.id === id);
        const el = document.getElementById('text-' + id);
        if (!text || !el || !text.drift?.enabled) {
            stopTextDrift(id);
            return;
        }
        const dt = Math.min(0.05, (now - runner.last) / 1000);
        runner.last = now;
        const velocity = getTextDriftVelocity(text.drift);
        text.x += velocity.x * dt;
        text.y += velocity.y * dt;
        wrapTextDrift(text, el);
        el.style.left = text.x + 'px';
        el.style.top = text.y + 'px';
    });
    textDriftRaf = textDriftRunners.size ? requestAnimationFrame(tickTextDrift) : null;
}

function getTextDriftVelocity(drift) {
    const speed = Number(drift.speed || 20);
    const pxPerSecond = (window.innerWidth / 5) * (speed / 20) / Math.max(0.1, zoom / 0.85);
    if (drift.direction === 'rtl') return { x: -pxPerSecond, y: 0 };
    if (drift.direction === 'ttb') return { x: 0, y: pxPerSecond };
    if (drift.direction === 'btt') return { x: 0, y: -pxPerSecond };
    return { x: pxPerSecond, y: 0 };
}

function wrapTextDrift(text, el) {
    const w = el.offsetWidth || 1;
    const h = el.offsetHeight || 1;
    const left = (0 - pan.x) / zoom;
    const top = (0 - pan.y) / zoom;
    const right = (window.innerWidth - pan.x) / zoom;
    const bottom = (window.innerHeight - pan.y) / zoom;
    if (text.drift.direction === 'ltr' && text.x > right) text.x = left - w;
    if (text.drift.direction === 'rtl' && text.x + w < left) text.x = right;
    if (text.drift.direction === 'ttb' && text.y > bottom) text.y = top - h;
    if (text.drift.direction === 'btt' && text.y + h < top) text.y = bottom;
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

document.addEventListener('pointerdown', e => {
    ['tc-shadow-controls', 'tc-drift-controls'].forEach(id => {
        const controls = document.getElementById(id);
        if (!controls || !controls.classList.contains('tc-open')) return;
        const group = controls.closest('.tc-effect-group');
        if (group && !group.contains(e.target)) controls.classList.remove('tc-open');
    });
}, true);

document.addEventListener('keydown', e => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    if (e.target.matches('input,textarea,select')) return;
    if (selectedTextId === null) return;
    const el = document.getElementById('text-' + selectedTextId);
    if (!el || el.classList.contains('text-editing')) return;
    e.preventDefault();
    deleteText(selectedTextId);
});

function activateTextMode() {
    setAddMode('text-layer');
    clickReady = true;
}

function toggleSelectedTextDrift() {
    toggleEffectProp('drift');
}

// Effect updaters
function updateShadowAngle(value) {
    const text = getSelectedText();
    if (!text) return;
    text.shadow = text.shadow || {};
    text.shadow.angle = parseFloat(value);
    const el = document.getElementById('text-' + text.id);
    if (el) {
        el.dataset.shadow = JSON.stringify(text.shadow);
        applyShadowEffect(el, text.shadow);
    }
    saveState();
}

function updateShadowColor(value) {
    const text = getSelectedText();
    if (!text) return;
    text.shadow = text.shadow || {};
    text.shadow.color = value;
    const el = document.getElementById('text-' + text.id);
    if (el) {
        el.dataset.shadow = JSON.stringify(text.shadow);
        applyShadowEffect(el, text.shadow);
    }
    saveState();
}

function updateShadowDistance(value) {
    const text = getSelectedText();
    if (!text) return;
    text.shadow = text.shadow || {};
    text.shadow.distance = parseFloat(value);
    const el = document.getElementById('text-' + text.id);
    if (el) {
        el.dataset.shadow = JSON.stringify(text.shadow);
        applyShadowEffect(el, text.shadow);
    }
    saveState();
}

function updateShadowBlur(value) {
    const text = getSelectedText();
    if (!text) return;
    text.shadow = text.shadow || {};
    text.shadow.blur = parseFloat(value);
    const el = document.getElementById('text-' + text.id);
    if (el) {
        el.dataset.shadow = JSON.stringify(text.shadow);
        applyShadowEffect(el, text.shadow);
    }
    saveState();
}

function updateShadowOpacity(value) {
    const text = getSelectedText();
    if (!text) return;
    text.shadow = text.shadow || {};
    text.shadow.opacity = parseFloat(value);
    const el = document.getElementById('text-' + text.id);
    if (el) {
        el.dataset.shadow = JSON.stringify(text.shadow);
        applyShadowEffect(el, text.shadow);
    }
    saveState();
}

function updateDriftDirection(value) {
    const text = getSelectedText();
    if (!text) return;
    text.drift = text.drift || {};
    text.drift.direction = value;
    setDriftDirectionButtons(value);
    const el = document.getElementById('text-' + text.id);
    if (el) el.dataset.drift = JSON.stringify(text.drift);
    if (text.drift.enabled) startTextDrift(text.id);
    saveState();
}

function updateDriftSpeed(value) {
    const text = getSelectedText();
    if (!text) return;
    text.drift = text.drift || {};
    text.drift.speed = parseFloat(value);
    const el = document.getElementById('text-' + text.id);
    if (el) el.dataset.drift = JSON.stringify(text.drift);
    if (text.drift.enabled) startTextDrift(text.id);
    saveState();
}

function setDriftDirectionButtons(value) {
    document.querySelectorAll('input[name="tc-drift-direction"]').forEach(input => {
        input.checked = input.value === value;
    });
}


function syncSliderFill(slider) {
    if (!slider) return;
    const pct = (slider.value - slider.min) / (slider.max - slider.min) * 100;
    slider.style.setProperty('--fill', pct + '%');
}

function stepTextSize(delta) {
    const slider = document.getElementById('tc-size');
    if (!slider) return;
    const current = parseFloat(slider.value) || 32;
    const min = parseFloat(slider.min) || 8;
    const max = parseFloat(slider.max) || 200;
    const next = Math.max(min, Math.min(max, current + delta));
    slider.value = next;
    syncSliderFill(slider);
    applyTextProperty('fontSize', next);
}

(function () {
    function attachStepper(btnId, delta) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        let holdTimer = null;
        let holdInterval = null;

        function stop() {
            clearTimeout(holdTimer);
            clearInterval(holdInterval);
            holdTimer = holdInterval = null;
        }

        function start(e) {
            if (e.button !== undefined && e.button !== 0) return;
            e.preventDefault();
            stepTextSize(delta);
            holdTimer = setTimeout(() => {
                holdInterval = setInterval(() => stepTextSize(delta), 200);
            }, 500);
        }

        btn.addEventListener('mousedown', start);
        btn.addEventListener('mouseup', stop);
        btn.addEventListener('mouseleave', stop);
        btn.addEventListener('touchstart', start, { passive: false });
        btn.addEventListener('touchend', stop);
        btn.addEventListener('touchcancel', stop);
    }

    attachStepper('tc-size-down', -1);
    attachStepper('tc-size-up', 1);
})();

function nudgeSelectedTextZ(delta) {
    const text = getSelectedText();
    if (!text) return false;
    const next = (parseFloat(text.z) || 0) + delta;
    applyTextProperty('z', next);
    const zSlider = document.getElementById('tc-z');
    if (zSlider) zSlider.value = next;
    return true;
}
