let selectedElement = null;
let isDragging = false;
// let isResizing = false; // REMOVED - Replaced by currentResizingInfo
let dragOffset = { x: 0, y: 0 };
let elementCounter = 0;

let currentResizingInfo = null; // { element, handlePosition, startX, startY, originalWidth, originalHeight, originalLeft, originalTop, originalRotation }

let selectionUIContainer = null;
let linkingPreviewLine = document.getElementById('linking-preview-line');
const historyStack = [];
const redoStack = [];
const MAX_HISTORY_STATES = 30;
const elementConfigs = {};
let propsContentArea = document.getElementById('props-content-area');
let canvasElement = document.getElementById('canvas');
let importFileInput = document.getElementById('import-file-input');
let undoButton = document.getElementById('undo-button');
let redoButton = document.getElementById('redo-button');

// --- Capture/Restore State & Undo/Redo ---
function captureState() {
    const state = { elements: [] };
    document.querySelectorAll('.wireframe-element').forEach(el => {
        const elState = {
            id: el.id, type: el.dataset.type,
            x: el.style.left, y: el.style.top,
            width: el.style.width, height: el.style.height,
            text: el.textContent.trim(),
            textAlign: el.style.textAlign || '',
            fontFamily: el.style.fontFamily || '', fontSize: el.style.fontSize || '',
            textColor: el.style.color || '', fillColor: el.style.backgroundColor || '',
            rotation: el.dataset.rotation || '0',
        };
        state.elements.push(elState);
    });
    if (historyStack.length >= MAX_HISTORY_STATES) { historyStack.shift(); }
    historyStack.push(JSON.stringify(state));
    redoStack.length = 0;
    updateUndoRedoButtonsState();
}

function restoreState(stateString) {
    if (!stateString) return;
    const stateData = JSON.parse(stateString);
    clearCanvas(true);
    stateData.elements.forEach(elState => {
        createWireframeElement(elState.type, {
            id: elState.id, x: parseFloat(elState.x), y: parseFloat(elState.y),
            width: parseFloat(elState.width), height: parseFloat(elState.height),
            text: elState.text, textAlign: elState.textAlign, fontFamily: elState.fontFamily,
            fontSize: elState.fontSize, textColor: elState.textColor, fillColor: elState.fillColor,
            rotation: parseFloat(elState.rotation)
        });
    });
    deselectAll(false);
    updatePropertiesPanel();
}

function undo() { if (historyStack.length > 1) { const currentState = historyStack.pop(); redoStack.push(currentState); const prevState = historyStack[historyStack.length - 1]; restoreState(prevState); } updateUndoRedoButtonsState(); }
function redo() { if (redoStack.length > 0) { const nextState = redoStack.pop(); historyStack.push(nextState); restoreState(nextState); } updateUndoRedoButtonsState(); }
function updateUndoRedoButtonsState() { if (undoButton && redoButton) { undoButton.disabled = historyStack.length <= 1; redoButton.disabled = redoStack.length === 0; } }

// --- Initialization & DOM References ---
function initAppDOMReferences() {
    propsContentArea = document.getElementById('props-content-area');
    canvasElement = document.getElementById('canvas');
    importFileInput = document.getElementById('import-file-input');
    undoButton = document.getElementById('undo-button');
    redoButton = document.getElementById('redo-button');
    linkingPreviewLine = document.getElementById('linking-preview-line');

    if (undoButton) undoButton.addEventListener('click', undo);
    if (redoButton) redoButton.addEventListener('click', redo);

    document.querySelectorAll('.element-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.target.dataset.type;
            createWireframeElement(type);
        });
    });

    if (canvasElement) {
        canvasElement.addEventListener('click', (e) => {
            if (e.target === e.currentTarget || e.target.classList.contains('static-arrow-visual') || e.target.tagName === 'svg') {
                deselectAll();
                updatePropertiesPanel();
            }
        });
    }
    if (importFileInput) { importFileInput.addEventListener('change', (event) => { const file = event.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (e_reader) => { importWireframe(e_reader.target.result); }; reader.readAsText(file); event.target.value = null; } }); }
}

function initApp() {
    initAppDOMReferences();
    updatePropertiesPanel();
    setTimeout(() => {
        captureState();
        updateUndoRedoButtonsState();
    }, 0);
}

Object.assign(elementConfigs, {
    button: { width: 100, height: 35, text: 'Botón', defaultFillColor: '#ecf0f1', defaultTextColor: '#2c3e50' }
});

// --- Geometric Helpers ---
function getElementRect(element) { if (!element || !element.style) return { left: 0, top: 0, width: 0, height: 0 }; return { left: parseFloat(element.style.left) || 0, top: parseFloat(element.style.top) || 0, width: parseFloat(element.style.width) || 0, height: parseFloat(element.style.height) || 0 }; }

// --- Selection UI & Resize Handle Logic ---
function createOrUpdateSelectionUI(element) {
    if (!element || !canvasElement) return;
    removeSelectionUI();
    selectionUIContainer = document.createElement('div');
    selectionUIContainer.id = `selection-ui-${element.id}`;
    selectionUIContainer.className = 'selection-box-container';
    canvasElement.appendChild(selectionUIContainer);

    const selectionBox = document.createElement('div');
    selectionBox.className = 'selection-box';
    selectionUIContainer.appendChild(selectionBox);

    const handlePositions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    handlePositions.forEach(pos => {
        const handle = document.createElement('div');
        handle.className = `resize-handle-anchor handle-${pos}`;
        handle.dataset.handlePosition = pos;
        handle.addEventListener('mousedown', onResizeHandleMouseDown);
        selectionUIContainer.appendChild(handle);
    });

    const rotationHandle = document.createElement('div');
    rotationHandle.className = 'rotation-handle-anchor';
    // rotationHandle.addEventListener('mousedown', onRotationHandleMouseDown); // For Phase 2
    selectionUIContainer.appendChild(rotationHandle);

    positionSelectionUI(element);
}

function positionSelectionUI(element) {
    if (!element || !selectionUIContainer) return;

    const selectionBox = selectionUIContainer.querySelector('.selection-box');
    const handles = selectionUIContainer.querySelectorAll('.resize-handle-anchor');
    const rotationHandle = selectionUIContainer.querySelector('.rotation-handle-anchor');

    if (!selectionBox) return;

    const rect = element.getBoundingClientRect();
    const canvasRect = canvasElement.getBoundingClientRect();

    selectionUIContainer.style.left = (rect.left - canvasRect.left) + 'px';
    selectionUIContainer.style.top = (rect.top - canvasRect.top) + 'px';
    selectionUIContainer.style.width = rect.width + 'px';
    selectionUIContainer.style.height = rect.height + 'px';
    selectionUIContainer.style.transform = element.style.transform;

    selectionBox.style.width = '100%';
    selectionBox.style.height = '100%';

    const handleSize = 10;
    const halfHandle = handleSize / 2;

    handles.forEach(handle => {
        const pos = handle.dataset.handlePosition;
        if (pos.includes('n')) handle.style.top = `-${halfHandle}px`;
        if (pos.includes('s')) handle.style.top = `calc(100% - ${halfHandle}px)`;
        if (pos.includes('w')) handle.style.left = `-${halfHandle}px`;
        if (pos.includes('e')) handle.style.left = `calc(100% - ${halfHandle}px)`;
        if (pos === 'n' || pos === 's') handle.style.left = `calc(50% - ${halfHandle}px)`;
        if (pos === 'e' || pos === 'w') handle.style.top = `calc(50% - ${halfHandle}px)`;
    });

    if (rotationHandle) {
        rotationHandle.style.left = `calc(50% - 6px)`;
        rotationHandle.style.top = `-${halfHandle + 15}px`;
    }
}

function removeSelectionUI() {
    if (selectionUIContainer) {
        selectionUIContainer.remove();
        selectionUIContainer = null;
    }
}

function onResizeHandleMouseDown(e) {
    e.stopPropagation();
    e.preventDefault();

    const handlePosition = e.target.dataset.handlePosition;
    if (!selectedElement) return;

    captureState();

    const initialMouseX = e.clientX;
    const initialMouseY = e.clientY;
    const elementStyle = window.getComputedStyle(selectedElement);
    const originalWidth = parseFloat(elementStyle.width);
    const originalHeight = parseFloat(elementStyle.height);
    const originalLeft = parseFloat(elementStyle.left);
    const originalTop = parseFloat(elementStyle.top);

    const transformMatrix = new DOMMatrixReadOnly(elementStyle.transform);
    const originalRotation = Math.atan2(transformMatrix.b, transformMatrix.a);

    currentResizingInfo = {
        element: selectedElement, handlePosition, initialMouseX, initialMouseY,
        originalWidth, originalHeight, originalLeft, originalTop, originalRotation
    };

    document.addEventListener('mousemove', onResizeHandleMouseMove);
    document.addEventListener('mouseup', onResizeHandleMouseUp);
}

function onResizeHandleMouseMove(e) {
    if (!currentResizingInfo) return;
    e.preventDefault();

    const { element, handlePosition, initialMouseX, initialMouseY, originalWidth, originalHeight, originalLeft, originalTop, originalRotation } = currentResizingInfo;

    let dx = e.clientX - initialMouseX;
    let dy = e.clientY - initialMouseY;

    const cos = Math.cos(-originalRotation);
    const sin = Math.sin(-originalRotation);
    const rotatedDx = dx * cos - dy * sin;
    const rotatedDy = dx * sin + dy * cos;

    let newWidth = originalWidth;
    let newHeight = originalHeight;
    let newLeft = originalLeft;
    let newTop = originalTop;

    if (handlePosition.includes('e')) newWidth = originalWidth + rotatedDx;
    if (handlePosition.includes('w')) {
        newWidth = originalWidth - rotatedDx;
        newLeft = originalLeft + (originalWidth - newWidth) * Math.cos(originalRotation) + (originalHeight - newHeight) * Math.sin(originalRotation); // This needs fixing
        newTop = originalTop + (originalWidth - newWidth) * Math.sin(originalRotation) - (originalHeight - newHeight) * Math.cos(originalRotation); // This needs fixing
    }
    if (handlePosition.includes('s')) newHeight = originalHeight + rotatedDy;
    if (handlePosition.includes('n')) {
        newHeight = originalHeight - rotatedDy;
        newTop = originalTop - (originalHeight - newHeight) * Math.cos(originalRotation) + (originalWidth - newWidth) * Math.sin(originalRotation); // This needs fixing
        newLeft = originalLeft + (originalHeight - newHeight) * Math.sin(originalRotation) + (originalWidth - newWidth) * Math.cos(originalRotation); // This needs fixing
    }

    // Corner cases (e.g., 'nw') would combine effects on newLeft, newTop, newWidth, newHeight
    // For NW: newWidth = originalWidth - rotatedDx; newHeight = originalHeight - rotatedDy;
    // The positional adjustment for NW, NE, SW, SE is the most complex part with rotation.
    // Let's simplify for now and focus on E, W, N, S working somewhat correctly.

    if (handlePosition === 'nw') {
        newWidth = originalWidth - rotatedDx;
        newHeight = originalHeight - rotatedDy;
        // Position update for NW is tricky, involves rotating the new top-left point back
        newLeft = originalLeft + dx; // Simplified, will be skewed
        newTop = originalTop + dy;   // Simplified, will be skewed
    } else if (handlePosition === 'ne') {
        newWidth = originalWidth + rotatedDx;
        newHeight = originalHeight - rotatedDy;
        newTop = originalTop + dy; // Simplified
    } else if (handlePosition === 'sw') {
        newWidth = originalWidth - rotatedDx;
        newHeight = originalHeight + rotatedDy;
        newLeft = originalLeft + dx; // Simplified
    } else if (handlePosition === 'se') {
        newWidth = originalWidth + rotatedDx;
        newHeight = originalHeight + rotatedDy;
        // No change to left/top for SE
    }


    newWidth = Math.max(10, newWidth);
    newHeight = Math.max(10, newHeight);

    element.style.width = newWidth + 'px';
    element.style.height = newHeight + 'px';
    element.style.left = newLeft + 'px';
    element.style.top = newTop + 'px';

    positionSelectionUI(element);
}

function onResizeHandleMouseUp(e) {
    if (!currentResizingInfo) return;
    e.preventDefault();
    positionSelectionUI(currentResizingInfo.element);
    document.removeEventListener('mousemove', onResizeHandleMouseMove);
    document.removeEventListener('mouseup', onResizeHandleMouseUp);
    currentResizingInfo = null;
    captureState();
}

// --- Element Creation ---
function createWireframeElement(type, loadedConfig = null) {
    if (!canvasElement) { console.error("Canvas element not found for createWireframeElement"); return; }
    const baseConfig = elementConfigs[type] || {};
    const config = { ...baseConfig, ...loadedConfig };
    elementCounter++;
    const element = document.createElement('div');
    element.className = `wireframe-element ${type}-element`;
    if (config.id) { element.id = config.id; const idNumPart = config.id.split('-')[1]; if (idNumPart) { const idNum = parseInt(idNumPart); if (idNum >= elementCounter) elementCounter = idNum + 1; } } else { element.id = `element-${elementCounter}`; }
    element.dataset.type = type;
    const w = parseFloat(config.width) || baseConfig.width || 100;
    const h = parseFloat(config.height) || baseConfig.height || 50;
    const x = config.x !== undefined ? parseFloat(config.x) : (Math.random() * ((canvasElement?.offsetWidth || 800) - w - 100) + 50);
    const y = config.y !== undefined ? parseFloat(config.y) : (Math.random() * ((canvasElement?.offsetHeight || 600) - h - 100) + 50);
    element.style.left = x + 'px';
    element.style.top = y + 'px';
    element.style.width = w + 'px';
    element.style.height = h + 'px';
    element.style.textAlign = config.textAlign || (type === 'button' ? 'center' : 'left');
    element.style.fontFamily = config.fontFamily || baseConfig.fontFamily || 'Arial, sans-serif';
    element.style.fontSize = config.fontSize || baseConfig.fontSize || '12px';
    element.style.color = config.textColor || baseConfig.defaultTextColor || '#2c3e50';
    element.style.backgroundColor = config.fillColor || baseConfig.defaultFillColor || 'rgba(200, 200, 200, 0.1)';
    const initialRotation = config.rotation !== undefined ? parseFloat(config.rotation) : 0;
    element.style.transform = `rotate(${initialRotation}deg)`;
    element.dataset.rotation = initialRotation;
    let textContent = config.text !== undefined ? config.text : (baseConfig.text || '');
    if (type === 'button') { element.textContent = textContent; }
    else { element.textContent = textContent; }
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '×';
    deleteBtn.onclick = (e_del) => { captureState(); e_del.stopPropagation(); const elToRemove = element; elToRemove.remove(); if(selectedElement === elToRemove) { selectedElement = null; updatePropertiesPanel(); } captureState(); };
    element.appendChild(deleteBtn);
    // No old single resize handle here.
    element.addEventListener('mousedown', startDrag);
    if (type === 'button') { element.addEventListener('dblclick', editText); }
    canvasElement.appendChild(element);
    if (!loadedConfig) { selectElement({ target: element, stopPropagation: () => {} }, false); updatePropertiesPanel(); captureState(); }
}

// --- Event Handlers (Drag, Select, Edit) ---
function startDrag(e_drag_start) {
    if (e_drag_start.target.classList.contains('resize-handle-anchor') || // Prevent drag if mousedown on new handles
        e_drag_start.target.classList.contains('rotation-handle-anchor') ||
        e_drag_start.target.classList.contains('input-field') ||
        e_drag_start.target.closest('.delete-btn')) return;

    const currentTargetElement = e_drag_start.target.closest('.wireframe-element');
    if (currentTargetElement) {
        captureState();
        selectedElement = currentTargetElement;
        isDragging = true;
        dragOffset.x = e_drag_start.clientX - currentTargetElement.offsetLeft;
        dragOffset.y = e_drag_start.clientY - currentTargetElement.offsetTop;
        selectElement(e_drag_start);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);
    }
}
function drag(e_drag_move) {
    if (!isDragging || !selectedElement) return;
    e_drag_move.preventDefault();
    let newX = e_drag_move.clientX - dragOffset.x;
    let newY = e_drag_move.clientY - dragOffset.y;
    selectedElement.style.left = newX + 'px';
    selectedElement.style.top = newY + 'px';
    if (selectionUIContainer && selectedElement) {
        positionSelectionUI(selectedElement);
    }
}
function stopDrag() {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
    if(selectedElement) {
        if (selectionUIContainer) positionSelectionUI(selectedElement);
        captureState();
    }
}

// Removed old startResize, resize, stopResize functions

function selectElement(e_select, shouldUpdatePanel = true) {
    const targetElement = e_select.target.closest('.wireframe-element');
    if (!targetElement) return;

    if (selectedElement !== targetElement) {
        deselectAll(false);
        selectedElement = targetElement;
        selectedElement.classList.add('selected');
        createOrUpdateSelectionUI(selectedElement);
    }
    // e_select.stopPropagation(); // This might prevent canvas click for deselect if handle is part of element
    if (shouldUpdatePanel) updatePropertiesPanel();
}

function deselectAll(capture = true) {
    if (selectedElement) {
        selectedElement.classList.remove('selected');
    }
    removeSelectionUI();
    selectedElement = null;
    if (capture) {
        updatePropertiesPanel();
    }
}

function editText(e_edit_text) {
    const element = e_edit_text.target.closest('.wireframe-element');
    if (!element || element.dataset.type !== 'button') return;
    captureState();
    let currentText = element.textContent.trim();
    let newTextVal = prompt('Editar texto del botón:', currentText);
    if (newTextVal !== null) { element.textContent = newTextVal; captureState(); }
    updatePropertiesPanel();
}

function updatePropertiesPanel() {
    if (!propsContentArea) return;
    if (!selectedElement) {
        propsContentArea.innerHTML = '<p>Selecciona un elemento.</p>';
        return;
    }
    const type = selectedElement.dataset.type;
    const config = elementConfigs[type] || {};
    let content = `<div class="prop-group">ID: ${selectedElement.id} (${type})</div>`;
    content += `<div class="prop-group"><label>X: ${parseFloat(selectedElement.style.left).toFixed(0)}px, Y: ${parseFloat(selectedElement.style.top).toFixed(0)}px</label></div>`;
    content += `<div class="prop-group"><label>Ancho: ${parseFloat(selectedElement.style.width).toFixed(0)}px, Alto: ${parseFloat(selectedElement.style.height).toFixed(0)}px</label></div>`;

    if (type === 'button') {
        content += `<div class="prop-group">
                        <label for="prop-text">Texto Botón:</label>
                        <input type="text" id="prop-text" value="${selectedElement.textContent.trim()}">
                    </div>`;
        content += `<h4>Estilo de Texto Botón</h4>`;
        content += `<div class="prop-group alignment-buttons">
                        <label>Alineación:</label>
                        <button data-align="left" class="${selectedElement.style.textAlign === 'left' || selectedElement.style.textAlign === '' ? 'active' : ''}">Izq</button>
                        <button data-align="center" class="${selectedElement.style.textAlign === 'center' ? 'active' : ''}">Cen</button>
                        <button data-align="right" class="${selectedElement.style.textAlign === 'right' ? 'active' : ''}">Der</button>
                    </div>`;
        content += `<div class="prop-group">
                        <label for="prop-font-family">Fuente:</label>
                        <select id="prop-font-family">
                            <option value="Arial, sans-serif">Arial</option>
                            <option value="Verdana, sans-serif">Verdana</option>
                            <option value="Georgia, serif">Georgia</option>
                            <option value="Comic Sans MS, cursive">Comic Sans</option>
                            <option value="monospace">Monospace</option>
                        </select>
                    </div>`;
        content += `<div class="prop-group">
                        <label for="prop-font-size">Tamaño Fuente (px):</label>
                        <input type="number" id="prop-font-size" value="${parseFloat(selectedElement.style.fontSize) || 12}" min="8" max="72">
                    </div>`;
        content += `<div class="prop-group">
                        <label for="prop-text-color">Color Texto:</label>
                        <input type="color" id="prop-text-color" value="${rgbToHex(selectedElement.style.color) || config.defaultTextColor || '#2c3e50'}">
                    </div>`;
        content += `<h4>Apariencia Botón</h4>`;
        content += `<div class="prop-group">
                        <label for="prop-fill-color">Color Relleno:</label>
                        <input type="color" id="prop-fill-color" value="${rgbToHex(selectedElement.style.backgroundColor) || config.defaultFillColor || '#ecf0f1'}">
                    </div>`;
    }
    if (selectedElement.dataset.rotation !== undefined) {
         content += `<h4>Transformación</h4>`;
         content += `<div class="prop-group">
                        <label for="prop-rotation">Rotación (grados):</label>
                        <input type="number" id="prop-rotation" value="${parseFloat(selectedElement.dataset.rotation).toFixed(1) || 0}" step="1">
                    </div>`;
    }
    propsContentArea.innerHTML = content;

    if (type === 'button') {
        const textInput = document.getElementById('prop-text');
        if (textInput) textInput.addEventListener('change', (e_prop_text) => { captureState(); selectedElement.textContent = e_prop_text.target.value; captureState(); });

        document.querySelectorAll('.alignment-buttons button').forEach(btn => {
            btn.addEventListener('click', (e_align) => {
                captureState();
                selectedElement.style.textAlign = e_align.target.dataset.align;
                updatePropertiesPanel(); // Refresh panel to update active class for alignment buttons
                captureState();
            });
        });
        const fontFamilySelect = document.getElementById('prop-font-family');
        if (fontFamilySelect) { fontFamilySelect.value = selectedElement.style.fontFamily || 'Arial, sans-serif'; fontFamilySelect.addEventListener('change', (e_font) => { captureState(); selectedElement.style.fontFamily = e_font.target.value; captureState(); updatePropertiesPanel(); });}
        const fontSizeInput = document.getElementById('prop-font-size');
        if (fontSizeInput) fontSizeInput.addEventListener('change', (e_fontsize) => { captureState(); selectedElement.style.fontSize = e_fontsize.target.value + 'px'; captureState(); });
        const textColorInput = document.getElementById('prop-text-color');
        if (textColorInput) textColorInput.addEventListener('input', (e_textcolor) => { captureState(); selectedElement.style.color = e_textcolor.target.value; captureState(); });
        const fillColorInput = document.getElementById('prop-fill-color');
        if (fillColorInput) fillColorInput.addEventListener('input', (e_fillcolor) => { captureState(); selectedElement.style.backgroundColor = e_fillcolor.target.value; captureState(); });
    }

    const rotationInput = document.getElementById('prop-rotation');
    if (rotationInput) {
        rotationInput.addEventListener('change', (e_rotation) => {
            captureState();
            const newRotation = parseFloat(e_rotation.target.value) || 0;
            selectedElement.style.transform = `rotate(${newRotation}deg)`;
            selectedElement.dataset.rotation = newRotation;
            positionSelectionUI(selectedElement); // Update selection UI after rotation
            captureState();
        });
    }
}
function rgbToHex(rgb) { if (!rgb || typeof rgb !== 'string') return '#000000'; if (rgb.startsWith('#')) return rgb; const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/); if (!match) return rgb; function hex(x) { return ("0" + parseInt(x).toString(16)).slice(-2); } return "#" + hex(match[1]) + hex(match[2]) + hex(match[3]); }

function clearCanvas(silent = false) { /* ... existing ... */ }
function exportWireframe() { /* ... existing ... */ }
function importWireframe(jsonData) { /* ... existing ... */ }
document.addEventListener('keydown', (e_keydown) => { /* ... existing ... */ });
document.addEventListener('DOMContentLoaded', initApp);
