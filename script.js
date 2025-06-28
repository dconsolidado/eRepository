let selectedElement = null;
let isDragging = false;
let isResizing = false;
let dragOffset = { x: 0, y: 0 };
let elementCounter = 0;

// New state variable for dragging arrow handles
let currentDraggingArrowHandle = null; // { arrowDiv, handleType, originalMouseX, originalMouseY }
// Variables for 'Conectar Elementos' tool (now removed, keep for potential future use or delete)
// let isConnectingMode = false;
// let startConnectionElementInfo = null;
// const connections = []; // Stores dynamic SVG connectors

let linkingPreviewLine = document.getElementById('linking-preview-line');

const historyStack = [];
const redoStack = [];
const MAX_HISTORY_STATES = 30;

const elementConfigs = {};
let propsContentArea = document.getElementById('props-content-area');
let canvasElement = document.getElementById('canvas');
let connectToolButton = document.getElementById('connect-tool');
let importFileInput = document.getElementById('import-file-input');
let undoButton = document.getElementById('undo-button');
let redoButton = document.getElementById('redo-button');

// --- Capture/Restore State & Undo/Redo ---
function captureState() {
    const state = { elements: [] /*, connections: [] */ }; // Removed 'connections' for dynamic connectors
    document.querySelectorAll('.wireframe-element').forEach(el => {
        const elState = {
            id: el.id, type: el.dataset.type,
            x: el.style.left, y: el.style.top,
            width: el.style.width, height: el.style.height,
            text: '', textAlign: el.style.textAlign || '',
            fontFamily: el.style.fontFamily || '', fontSize: el.style.fontSize || '',
            textColor: el.style.color || '', fillColor: el.style.backgroundColor || '',
            rotation: el.dataset.rotation || '0',
            connectsFromId: el.dataset.connectsFromId || null,
            connectsToId: el.dataset.connectsToId || null,
            connectsFromAnchor: el.dataset.connectsFromAnchor || null,
            connectsToAnchor: el.dataset.connectsToAnchor || null,
            caption: el.dataset.caption || null
        };
        if (el.dataset.type === 'input') { elState.text = el.querySelector('.input-field') ? el.querySelector('.input-field').value : ''; }
        else if (el.dataset.type === 'image') { elState.text = el.dataset.caption || ''; }
        else if (el.dataset.type === 'arrow') {
            elState.text = '';
            elState.startX = el.dataset.startX; elState.startY = el.dataset.startY;
            elState.endX = el.dataset.endX; elState.endY = el.dataset.endY;
        }
        else { if (el.querySelector('svg')) { elState.text = ''; } else { elState.text = el.textContent.trim(); } }
        state.elements.push(elState);
    });
    connections.forEach(conn => { state.connections.push({ fromId: conn.fromId, fromAnchorType: conn.fromAnchorType, toId: conn.toId, toAnchorType: conn.toAnchorType }); });
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
            rotation: parseFloat(elState.rotation),
            connectsFromId: elState.connectsFromId, connectsToId: elState.connectsToId,
            connectsFromAnchor: elState.connectsFromAnchor, connectsToAnchor: elState.connectsToAnchor,
            caption: elState.type === 'image' ? elState.text : elState.caption,
            startX: elState.startX, startY: elState.startY, endX: elState.endX, endY: elState.endY
        });
    });
    if (stateData.connections) { /* ... existing connection restore ... */ }
    document.querySelectorAll('.arrow-element').forEach(arrowDiv => updateStaticArrowSVGRepresentation(arrowDiv));
    deselectAll(false);
    updatePropertiesPanel();
}
function undo() { /* ... existing ... */ }
function redo() { /* ... existing ... */ }
function updateUndoRedoButtonsState() { /* ... existing ... */ }

// --- Initialization & DOM References ---
function initAppDOMReferences() { /* ... existing ... */ }
function initApp() { /* ... existing ... */ }
Object.assign(elementConfigs, { /* ... existing ... */ });

// --- Geometric Helpers & Anchor Logic ---
function getElementRect(element) { /* ... existing ... */ }
function getAnchorPointCoordinates(element, anchorType) { /* ... existing ... */ }
function getClosestAnchorToPoint(element, mouseX, mouseY, threshold = 25) {
    const anchorTypes = ['top', 'bottom', 'left', 'right', 'center'];
    let closest = null;
    let minDistance = Infinity;
    const elRect = element.getBoundingClientRect(); // Use client rect for mouse interaction
    const canvasRect = canvasElement.getBoundingClientRect();

    anchorTypes.forEach(type => {
        const point = getAnchorPointCoordinates(element, type); // Gets model coordinates
        if (point) {
            // Convert model coords to screen coords for distance check if needed, or ensure mouseX/Y are canvas coords
            const distance = Math.sqrt(Math.pow(point.x - mouseX, 2) + Math.pow(point.y - mouseY, 2));
            if (distance < minDistance && distance < threshold) {
                minDistance = distance;
                closest = { element, type, x: point.x, y: point.y };
            }
        }
    });
    return closest;
}


// --- Arrow Handle Logic (Creation, Positioning, Dragging) ---
function getArrowEndpointCoordinates(arrowDivElement, handleType) { /* ... existing ... */ }

function onArrowHandleMouseDown(e) {
    e.stopPropagation();
    captureState(); // Capture state before starting drag
    const handle = e.target;
    const arrowId = handle.dataset.arrowId;
    const arrowDiv = document.getElementById(arrowId);
    const handleType = handle.dataset.handleType;

    if (!arrowDiv) return;

    currentDraggingArrowHandle = {
        arrowDiv: arrowDiv,
        handleType: handleType,
        originalMouseX: e.clientX,
        originalMouseY: e.clientY
    };

    const otherHandleType = (handleType === 'start') ? 'end' : 'start';
    const fixedPoint = getArrowEndpointCoordinates(arrowDiv, otherHandleType);

    if (linkingPreviewLine && fixedPoint) {
        linkingPreviewLine.setAttribute('x1', fixedPoint.x);
        linkingPreviewLine.setAttribute('y1', fixedPoint.y);
        linkingPreviewLine.setAttribute('x2', fixedPoint.x); // Initially, line is zero length
        linkingPreviewLine.setAttribute('y2', fixedPoint.y);
        linkingPreviewLine.style.stroke = '#2980b9'; // Distinct color for arrow handle dragging
        linkingPreviewLine.style.display = 'block';
    }

    document.addEventListener('mousemove', onArrowHandleMouseMove);
    document.addEventListener('mouseup', onArrowHandleMouseUp);
}

function onArrowHandleMouseMove(e) {
    if (!currentDraggingArrowHandle || !linkingPreviewLine || !canvasElement) return;
    e.preventDefault();

    const canvasRect = canvasElement.getBoundingClientRect();
    const mouseX = e.clientX - canvasRect.left;
    const mouseY = e.clientY - canvasRect.top;

    linkingPreviewLine.setAttribute('x2', mouseX);
    linkingPreviewLine.setAttribute('y2', mouseY);

    // Snap logic
    currentDraggingArrowHandle.snapTarget = null; // Reset snap target
    document.querySelectorAll('.wireframe-element:not(.arrow-element):not(.arrow-handle)').forEach(el => {
        el.classList.remove('highlight-connection-target');
        const closestAnchorInfo = getClosestAnchorToPoint(el, mouseX, mouseY);
        if (closestAnchorInfo) {
            el.classList.add('highlight-connection-target');
            linkingPreviewLine.setAttribute('x2', closestAnchorInfo.x);
            linkingPreviewLine.setAttribute('y2', closestAnchorInfo.y);
            currentDraggingArrowHandle.snapTarget = closestAnchorInfo; // Store {element, type, x, y}
        }
    });
}

function onArrowHandleMouseUp(e) {
    if (!currentDraggingArrowHandle || !linkingPreviewLine) return;

    const { arrowDiv, handleType, snapTarget } = currentDraggingArrowHandle;
    const canvasRect = canvasElement.getBoundingClientRect();
    const finalMouseX = e.clientX - canvasRect.left;
    const finalMouseY = e.clientY - canvasRect.top;

    if (snapTarget) { // Snapped to an element
        if (handleType === 'start') {
            arrowDiv.dataset.connectsFromId = snapTarget.element.id;
            arrowDiv.dataset.connectsFromAnchor = snapTarget.type;
            delete arrowDiv.dataset.startX; delete arrowDiv.dataset.startY;
        } else { // 'end' handle
            arrowDiv.dataset.connectsToId = snapTarget.element.id;
            arrowDiv.dataset.connectsToAnchor = snapTarget.type;
            delete arrowDiv.dataset.endX; delete arrowDiv.dataset.endY;
        }
    } else { // Free-floating end
        if (handleType === 'start') {
            arrowDiv.dataset.startX = finalMouseX;
            arrowDiv.dataset.startY = finalMouseY;
            delete arrowDiv.dataset.connectsFromId; delete arrowDiv.dataset.connectsFromAnchor;
        } else { // 'end' handle
            arrowDiv.dataset.endX = finalMouseX;
            arrowDiv.dataset.endY = finalMouseY;
            delete arrowDiv.dataset.connectsToId; delete arrowDiv.dataset.connectsToAnchor;
        }
    }

    updateStaticArrowSVGRepresentation(arrowDiv);
    showArrowHandles(arrowDiv); // Reposition handles based on new arrow geometry

    linkingPreviewLine.style.display = 'none';
    document.querySelectorAll('.highlight-connection-target').forEach(el => el.classList.remove('highlight-connection-target'));
    document.removeEventListener('mousemove', onArrowHandleMouseMove);
    document.removeEventListener('mouseup', onArrowHandleMouseUp);
    currentDraggingArrowHandle = null;
    captureState(); // Capture state after drag ends
}


function showArrowHandles(arrowDivElement) {
    if (!arrowDivElement || arrowDivElement.dataset.type !== 'arrow' || !canvasElement) return;
    hideAllArrowHandles();

    const startCoords = getArrowEndpointCoordinates(arrowDivElement, 'start');
    const endCoords = getArrowEndpointCoordinates(arrowDivElement, 'end');

    if (!startCoords || !endCoords) return;

    ['start', 'end'].forEach(type => {
        let handle = document.getElementById(`arrow-handle-${type}-${arrowDivElement.id}`);
        if (!handle) {
            handle = document.createElement('div');
            handle.id = `arrow-handle-${type}-${arrowDivElement.id}`;
            handle.className = 'arrow-handle';
            handle.classList.add(type);
            handle.dataset.handleType = type;
            handle.dataset.arrowId = arrowDivElement.id;
            handle.addEventListener('mousedown', onArrowHandleMouseDown); // Attach drag listener
            canvasElement.appendChild(handle);
        }
        const coords = (type === 'start') ? startCoords : endCoords;
        handle.style.left = (coords.x - 5) + 'px';
        handle.style.top = (coords.y - 5) + 'px';
        handle.style.display = 'block';
        handle.style.zIndex = '30';
    });
}

function hideArrowHandles(arrowDivElement, remove = false) { // Added 'remove' parameter
    if (!arrowDivElement || arrowDivElement.dataset.type !== 'arrow') return;
    ['start', 'end'].forEach(type => {
        const handle = document.getElementById(`arrow-handle-${type}-${arrowDivElement.id}`);
        if (handle) {
            if (remove) {
                handle.remove();
            } else {
                handle.style.display = 'none';
            }
        }
    });
}

function hideAllArrowHandles(remove = false) { // Added 'remove' parameter
    document.querySelectorAll('.arrow-handle').forEach(h => {
        if (remove) {
            h.remove();
        } else {
            h.style.display = 'none';
        }
    });
}

// --- Element Creation & SVG Visuals ---
function createWireframeElement(type, loadedConfig = null) {
    // ... (previous content of createWireframeElement, up to element creation)
    if (!canvasElement) { console.error("Canvas element not found for createWireframeElement"); return; }

    const baseConfig = elementConfigs[type] || {};
    const config = { ...baseConfig, ...loadedConfig };

    elementCounter++;
    const element = document.createElement('div'); // ALL elements are DIVs logically
    element.className = `wireframe-element ${type}-element`;

    if (config.id) { element.id = config.id; /* ... idnum logic ... */ } else { element.id = `element-${elementCounter}`; }
    element.dataset.type = type;

    const defaultH = baseConfig.height || 50;
    const w = parseFloat(config.width) || baseConfig.width || 100;
    const h = parseFloat(config.height) || defaultH;
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
    element.style.backgroundColor = config.fillColor || baseConfig.defaultFillColor || (type === 'rectangle' || type === 'circle' ? 'rgba(52, 152, 219, 0.1)' : 'transparent');

    const initialRotation = config.rotation !== undefined ? parseFloat(config.rotation) : 0;
    if (type !== 'arrow') {
        element.style.transform = `rotate(${initialRotation}deg)`;
    }
    element.dataset.rotation = initialRotation;

    if (config.connectsFromId) element.dataset.connectsFromId = config.connectsFromId;
    if (config.connectsToId) element.dataset.connectsToId = config.connectsToId;
    if (config.connectsFromAnchor) element.dataset.connectsFromAnchor = config.connectsFromAnchor;
    if (config.connectsToAnchor) element.dataset.connectsToAnchor = config.connectsToAnchor;
    if (config.caption) element.dataset.caption = config.caption;

    let textContent = config.text !== undefined ? config.text : (baseConfig.text || '');

    if (type === 'arrow') {
        element.style.border = '1px dashed transparent';
        element.style.background = 'transparent';
        element.dataset.startX = String(config.startX !== undefined ? config.startX : x);
        element.dataset.startY = String(config.startY !== undefined ? config.startY : y + (h/2));
        element.dataset.endX = String(config.endX !== undefined ? config.endX : x + w);
        element.dataset.endY = String(config.endY !== undefined ? config.endY : y + (h/2));
        element.style.left = element.dataset.startX + 'px';
        element.style.top = element.dataset.startY + 'px';
        element.style.width = '10px';
        element.style.height = '10px';
        element.innerHTML = '';
        updateStaticArrowSVGRepresentation(element);
    } else if (type === 'input') {
        const inputField = document.createElement('input'); inputField.className = 'input-field'; inputField.type = 'text';
        inputField.placeholder = config.placeholder || baseConfig.placeholder || '';
        inputField.value = textContent;
        if(element.style.color) inputField.style.color = element.style.color;
        inputField.addEventListener('mousedown', (e_input) => e_input.stopPropagation());
        inputField.addEventListener('click', (e_input) => e_input.stopPropagation());
        inputField.addEventListener('input', () => { captureState(); updatePropertiesPanel(); captureState(); });
        element.appendChild(inputField);
    } else if (type === 'circle') { element.style.borderRadius = '50%'; element.textContent = textContent; }
    else if (type === 'image') {
        element.dataset.caption = config.caption || textContent || baseConfig.caption || '';
        const iconSpan = document.createElement('span');
        iconSpan.textContent = baseConfig.text || '🖼️';
        element.appendChild(iconSpan);
        if (element.dataset.caption) {
            const captionSpan = document.createElement('span'); captionSpan.className = 'caption';
            captionSpan.textContent = element.dataset.caption;
            if(element.style.color) captionSpan.style.color = element.style.color;
            element.appendChild(captionSpan);
        }
    } else {
        element.textContent = textContent;
        if (type === 'menu' || type === 'breadcrumb' || type === 'paragraph' || (type === 'text' && element.textContent.includes('\n'))) {
            element.style.whiteSpace = 'pre-line';
        }
        if (type === 'menu') { element.style.fontSize = '11px'; element.style.padding = '8px';}
        if (type === 'paragraph') { element.style.whiteSpace = 'pre-wrap'; element.style.alignItems = 'flex-start';}
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '×';
    deleteBtn.onclick = (e_del) => {
        captureState();
        e_del.stopPropagation();
        const elToRemove = element;
        const idToRemove = elToRemove.id;

        if (elToRemove.dataset.type === 'arrow') {
            const svgVisualId = elToRemove.dataset.svgVisualId;
            if (svgVisualId) document.getElementById(svgVisualId)?.remove();
            hideArrowHandles(elToRemove, true); // Remove handles from DOM
        }

        elToRemove.remove();
        if(selectedElement === elToRemove) {
            selectedElement = null;
            updatePropertiesPanel();
        }

        connections.slice().reverse().forEach((conn) => {
            if (conn.fromId === idToRemove || conn.toId === idToRemove) {
                if (conn.arrowSvgElement) conn.arrowSvgElement.remove();
                connections.splice(connections.indexOf(conn), 1);
            }
        });
        document.querySelectorAll('.wireframe-element[data-type="arrow"]').forEach(arrowDiv => {
            let changed = false;
            if (arrowDiv.dataset.connectsFromId === idToRemove) { delete arrowDiv.dataset.connectsFromId; changed = true; }
            if (arrowDiv.dataset.connectsToId === idToRemove) { delete arrowDiv.dataset.connectsToId; changed = true; }
            if (changed) updateStaticArrowSVGRepresentation(arrowDiv);
        });
        captureState();
    };
    element.appendChild(deleteBtn);

    if (type !== 'arrow') {
        const resizeHandle = document.createElement('div'); resizeHandle.className = 'resize-handle';
        element.appendChild(resizeHandle); resizeHandle.addEventListener('mousedown', startResize);
    }

    element.addEventListener('mousedown', startDrag);
    if (type !== 'arrow') {
        element.addEventListener('dblclick', editText);
    }
    canvasElement.appendChild(element);

    if (!loadedConfig) {
        selectElement({ target: element, stopPropagation: () => {} }, false);
        updatePropertiesPanel();
        captureState();
    }
}
function updateStaticArrowSVGRepresentation(arrowDivElement) { /* ... existing ... */ }

// --- Event Handlers (Drag, Resize, Select, Edit) ---
function updateStaticArrowConnectionsForElement(movedElement) {
    if (!movedElement || !movedElement.id) return;
    document.querySelectorAll('.wireframe-element[data-type="arrow"]').forEach(arrowDiv => {
        const isConnectedToMoved = arrowDiv.dataset.connectsFromId === movedElement.id || arrowDiv.dataset.connectsToId === movedElement.id;
        if (isConnectedToMoved) {
            updateStaticArrowSVGRepresentation(arrowDiv);
            // If the arrow itself is selected, its handles also need to be updated.
            if (selectedElement === arrowDiv) {
                showArrowHandles(arrowDiv);
            }
        }
    });
}

function createConnection(fromElement, fromAnchorType, toElement, toAnchorType, isRestoring = false) { /* ... dynamic SVG connectors: existing ... */ }
function updateConnectionArrow(connection) {  /* ... dynamic SVG connectors: existing ... */ }

function updateAllConnections() {
    // Update dynamic SVG connectors
    connections.forEach(updateConnectionArrow);

    // Update all static arrows (new SVG-based ones)
    document.querySelectorAll('.wireframe-element[data-type="arrow"]').forEach(arrowDiv => {
        updateStaticArrowSVGRepresentation(arrowDiv);
        // If the arrow is selected, its handles might need repositioning if its endpoints changed
        // (e.g. due to a connected element moving, which might not be `movedElement` if this is a global refresh)
        if (selectedElement === arrowDiv) {
            showArrowHandles(arrowDiv);
        }
    });
}


function startDrag(e_drag_start) {
    if (e_drag_start.target.classList.contains('resize-handle') ||
        e_drag_start.target.classList.contains('connection-handle') || // old static arrow handles
        e_drag_start.target.classList.contains('arrow-handle') || // new static arrow handles
        e_drag_start.target.classList.contains('input-field') ||
        e_drag_start.target.closest('.delete-btn')) return;

    const currentTargetElement = e_drag_start.target.closest('.wireframe-element');
    if (currentTargetElement) {
        captureState();
        selectedElement = currentTargetElement; // Set selectedElement here
        isDragging = true;
        // For DIV elements, calculate offset from their own top/left.
        // For SVG arrows, their top/left in the DOM isn't what we drag by.
        // We'll handle arrow dragging differently if direct SVG dragging is ever implemented.
        // For now, arrows are primarily manipulated by their handles.
        // If an arrow DIV itself is made draggable, this needs adjustment.
        dragOffset.x = e_drag_start.clientX - currentTargetElement.offsetLeft;
        dragOffset.y = e_drag_start.clientY - currentTargetElement.offsetTop;

        selectElement(e_drag_start); // Call selectElement which now correctly handles arrow selection & handles

        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);
    }
}
function drag(e_drag_move) {
    if (!isDragging || !selectedElement || selectedElement.dataset.type === 'arrow') return; // Don't drag arrow DIVs directly for now
    e_drag_move.preventDefault();
    let newX = e_drag_move.clientX - dragOffset.x;
    let newY = e_drag_move.clientY - dragOffset.y;
    selectedElement.style.left = newX + 'px';
    selectedElement.style.top = newY + 'px';
    updateStaticArrowConnectionsForElement(selectedElement); // Update arrows connected TO this element
    updateAllConnections(); // Update dynamic connectors
}
function stopDrag() {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
    if(selectedElement && selectedElement.dataset.type !== 'arrow') {
        updateStaticArrowConnectionsForElement(selectedElement);
        updateAllConnections();
        captureState();
    } else if (selectedElement && selectedElement.dataset.type === 'arrow') {
        // If we allowed dragging arrow DIVs, capture state here. For now, no action.
    }
}

function startResize(e_resize_start) { /* ... existing ... */ }
function resize(e_resize_move) { /* ... existing, ensure updateStaticArrowConnectionsForElement and updateAllConnections are called ... */ }
function stopResize() { /* ... existing, ensure updateStaticArrowConnectionsForElement and updateAllConnections are called, and captureState ... */ }

function selectElement(e_select, shouldUpdatePanel = true) { /* ... existing ... */ }
function deselectAll(capture = true) { /* ... existing ... */ }
function editText(e_edit_text) { /* ... existing ... */ }
function updatePropertiesPanel() {
    if (!propsContentArea) return;
    if (!selectedElement) {
        propsContentArea.innerHTML = '<p>Selecciona un elemento.</p>';
        return;
    }

    const type = selectedElement.dataset.type;
    const config = elementConfigs[type] || {}; // Base config for defaults
    let content = `<div class="prop-group">ID: ${selectedElement.id} (${type})</div>`;

    if (type !== 'arrow') { // Standard properties for DIV elements
        content += `<div class="prop-group"><label>X: ${parseFloat(selectedElement.style.left).toFixed(0)}px, Y: ${parseFloat(selectedElement.style.top).toFixed(0)}px</label></div>`;
        content += `<div class="prop-group"><label>Ancho: ${parseFloat(selectedElement.style.width).toFixed(0)}px, Alto: ${parseFloat(selectedElement.style.height).toFixed(0)}px</label></div>`;
    }

    // Text Content / Value / Caption
    if (type === 'button' || type === 'text' || type === 'paragraph' || type === 'menu' || type === 'tab' || type === 'breadcrumb') {
        content += `<div class="prop-group">
                        <label for="prop-text">Texto:</label>
                        <input type="text" id="prop-text" value="${selectedElement.textContent.trim()}">
                    </div>`;
    }
    if (type === 'input') {
        const inputField = selectedElement.querySelector('.input-field');
        content += `<div class="prop-group">
                        <label for="prop-input-value">Valor:</label>
                        <input type="text" id="prop-input-value" value="${inputField ? inputField.value : ''}">
                    </div>`;
    }
     if (type === 'image') {
        content += `<div class="prop-group">
                        <label for="prop-caption">Pie de foto:</label>
                        <input type="text" id="prop-caption" value="${selectedElement.dataset.caption || ''}">
                    </div>`;
    }

    // Text Styling (for elements that typically have text)
    if (type !== 'arrow' && type !== 'rectangle' && type !== 'circle' && type !== 'image') {
        content += `<h4>Estilo de Texto</h4>`;
        content += `<div class="prop-group alignment-buttons">
                        <label>Alineación:</label>
                        <button data-align="left" class="${selectedElement.style.textAlign === 'left' ? 'active' : ''}">Izq</button>
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
    } else if (type === 'image') { // Specific text styling for image caption
         content += `<h4>Estilo Pie de Foto</h4>`;
         content += `<div class="prop-group">
                        <label for="prop-text-color">Color Pie de Foto:</label>
                        <input type="color" id="prop-text-color" value="${rgbToHex(selectedElement.style.color) || config.defaultTextColor || '#2c3e50'}">
                    </div>`;
    }


    // Fill Color (for button, rectangle, circle)
    if (type === 'button' || type === 'rectangle' || type === 'circle') {
         content += `<h4>Apariencia</h4>`;
        content += `<div class="prop-group">
                        <label for="prop-fill-color">Color Relleno:</label>
                        <input type="color" id="prop-fill-color" value="${rgbToHex(selectedElement.style.backgroundColor) || config.defaultFillColor || '#ecf0f1'}">
                    </div>`;
    }

    // Arrow specific properties
    if (type === 'arrow') {
        content += `<h4>Propiedades de Flecha</h4>`;
        const startPointInfo = selectedElement.dataset.connectsFromId
            ? `Conectado a: ${selectedElement.dataset.connectsFromId} (${selectedElement.dataset.connectsFromAnchor || 'auto'})`
            : `Libre (${parseFloat(selectedElement.dataset.startX || '0').toFixed(0)}, ${parseFloat(selectedElement.dataset.startY || '0').toFixed(0)})`;
        content += `<div class="prop-group"><label>Inicio:</label> <span class="prop-value-display">${startPointInfo}</span></div>`;

        const endPointInfo = selectedElement.dataset.connectsToId
            ? `Conectado a: ${selectedElement.dataset.connectsToId} (${selectedElement.dataset.connectsToAnchor || 'auto'})`
            : `Libre (${parseFloat(selectedElement.dataset.endX || '0').toFixed(0)}, ${parseFloat(selectedElement.dataset.endY || '0').toFixed(0)})`;
        content += `<div class="prop-group"><label>Fin:</label> <span class="prop-value-display">${endPointInfo}</span></div>`;

        // TODO: Add controls for line color, thickness for static arrows.
        // The old 'rotation' input is removed for arrows as it's now handle-driven.
    } else if (selectedElement.dataset.rotation !== undefined) { // Rotation for non-arrow DIVs
         content += `<h4>Transformación</h4>`;
         content += `<div class="prop-group">
                        <label for="prop-rotation">Rotación (grados):</label>
                        <input type="number" id="prop-rotation" value="${parseFloat(selectedElement.dataset.rotation).toFixed(1) || 0}" step="1">
                    </div>`;
    }


    if (type === 'text') {
        content += `<div class="prop-group"><button id="convert-to-paragraph">Convertir a Párrafo</button></div>`;
    }

    propsContentArea.innerHTML = content;

    // Add event listeners for property changes
    const textInput = document.getElementById('prop-text');
    if (textInput) textInput.addEventListener('change', (e_prop_text) => { /* ... existing ... */ });

    const inputValueInput = document.getElementById('prop-input-value');
    if (inputValueInput) inputValueInput.addEventListener('change', (e_prop_input) => { /* ... existing ... */ });

    const captionInput = document.getElementById('prop-caption');
    if (captionInput) captionInput.addEventListener('change', (e_prop_caption) => { /* ... existing ... */ });

    document.querySelectorAll('.alignment-buttons button').forEach(btn => { /* ... existing ... */ });

    const fontFamilySelect = document.getElementById('prop-font-family');
    if (fontFamilySelect) { /* ... existing ... */ }

    const fontSizeInput = document.getElementById('prop-font-size');
    if (fontSizeInput) fontSizeInput.addEventListener('change', (e_fontsize) => { /* ... existing ... */ });

    const textColorInput = document.getElementById('prop-text-color');
    if (textColorInput) textColorInput.addEventListener('input', (e_textcolor) => { /* ... existing ... */ });

    const fillColorInput = document.getElementById('prop-fill-color');
    if (fillColorInput) fillColorInput.addEventListener('input', (e_fillcolor) => { /* ... existing ... */ });

    const rotationInput = document.getElementById('prop-rotation');
    if (rotationInput && selectedElement.dataset.type !== 'arrow') { // Only attach if not new arrow
        rotationInput.addEventListener('change', (e_rotation) => {
            captureState();
            const newRotation = parseFloat(e_rotation.target.value) || 0;
            selectedElement.style.transform = `rotate(${newRotation}deg)`;
            selectedElement.dataset.rotation = newRotation;
            // Note: old updateStaticArrowConnection is not relevant for new arrows
            captureState();
        });
    }

    const convertButton = document.getElementById('convert-to-paragraph');
    if (convertButton) { /* ... existing ... */ }
}
function rgbToHex(rgb) { /* ... existing ... */ }
function clearCanvas(silent = false) {
    if (!canvasElement) return;
    if (!silent) captureState();
    if (silent || confirm('¿Estás seguro de que quieres limpiar todo el canvas?')) {
        // Remove all elements, dynamic connectors, static arrow visuals, and handles
        canvasElement.querySelectorAll('.wireframe-element, .connector-arrow-svg, .static-arrow-visual, .arrow-handle').forEach(el => el.remove());

        // Re-add linking preview SVG if it was part of canvas innerHTML (it should be persistent)
        if (!document.getElementById('linking-preview-svg')) {
             const previewSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
             previewSvg.id = "linking-preview-svg";
             Object.assign(previewSvg.style, {position:'absolute', top:'0', left:'0', width:'100%', height:'100%', pointerEvents:'none', zIndex:'99'});
             const lineForPreview = document.createElementNS("http://www.w3.org/2000/svg", "line"); // Renamed to avoid conflict
             lineForPreview.id = "linking-preview-line";
             lineForPreview.setAttribute('stroke', '#007bff');
             lineForPreview.setAttribute('stroke-width', '1.5');
             lineForPreview.setAttribute('stroke-dasharray', '4,4');
             lineForPreview.style.display = 'none';
             previewSvg.appendChild(lineForPreview);
             canvasElement.appendChild(previewSvg);
             linkingPreviewLine = lineForPreview;
        }

        connections.length = 0;
        selectedElement = null;
        elementCounter = 1;
        if (!silent) {
            updatePropertiesPanel();
            captureState();
        }
    }
}

function exportWireframe() {
    const stateToExport = { elements: [], connections: [] };
    document.querySelectorAll('.wireframe-element').forEach(el => {
        const elState = {
            id: el.id, type: el.dataset.type,
            x: el.style.left, y: el.style.top,
            width: el.style.width, height: el.style.height,
            text: '', textAlign: el.style.textAlign || '',
            fontFamily: el.style.fontFamily || '', fontSize: el.style.fontSize || '',
            textColor: el.style.color || '', fillColor: el.style.backgroundColor || '',
            rotation: el.dataset.rotation || '0',
            connectsFromId: el.dataset.connectsFromId || null,
            connectsToId: el.dataset.connectsToId || null,
            connectsFromAnchor: el.dataset.connectsFromAnchor || null,
            connectsToAnchor: el.dataset.connectsToAnchor || null,
            caption: el.dataset.caption || null
        };
        if (el.dataset.type === 'input') { elState.text = el.querySelector('.input-field') ? el.querySelector('.input-field').value : ''; }
        else if (el.dataset.type === 'image') { elState.text = el.dataset.caption || ''; }
        else if (el.dataset.type === 'arrow') {
            elState.text = '';
            elState.startX = el.dataset.startX; elState.startY = el.dataset.startY;
            elState.endX = el.dataset.endX; elState.endY = el.dataset.endY;
            // Rotation for arrow DIV is not used for rendering, but save it if present
            elState.rotation = el.dataset.rotation || '0';
        }
        else { elState.text = el.textContent.trim(); }
        stateToExport.elements.push(elState);
    });
    connections.forEach(conn => {
        stateToExport.connections.push({
            fromId: conn.fromId, fromAnchorType: conn.fromAnchorType,
            toId: conn.toId, toAnchorType: conn.toAnchorType
        });
    });

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(stateToExport, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "wireframe_export.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function importWireframe(jsonData) {
    try {
        const data = JSON.parse(jsonData);
        captureState();
        clearCanvas(true);

        if (data.elements) {
            data.elements.forEach(elState => {
                // Ensure all necessary fields for arrows are passed in loadedConfig
                const loadedConfig = {
                    id: elState.id,
                    x: parseFloat(elState.x), y: parseFloat(elState.y),
                    width: parseFloat(elState.width), height: parseFloat(elState.height),
                    text: elState.text,
                    textAlign: elState.textAlign, fontFamily: elState.fontFamily,
                    fontSize: elState.fontSize, textColor: elState.textColor,
                    fillColor: elState.fillColor, rotation: parseFloat(elState.rotation),
                    connectsFromId: elState.connectsFromId, connectsToId: elState.connectsToId,
                    connectsFromAnchor: elState.connectsFromAnchor, connectsToAnchor: elState.connectsToAnchor,
                    caption: elState.caption
                };
                if (elState.type === 'arrow') {
                    loadedConfig.startX = elState.startX;
                    loadedConfig.startY = elState.startY;
                    loadedConfig.endX = elState.endX;
                    loadedConfig.endY = elState.endY;
                }
                createWireframeElement(elState.type, loadedConfig);
            });
        }
        if (data.connections) { // Restore dynamic SVG connections
            data.connections.forEach(connData => {
                const fromEl = document.getElementById(connData.fromId);
                const toEl = document.getElementById(connData.toId);
                if (fromEl && toEl) {
                    createConnection(fromEl, connData.fromAnchorType, toEl, connData.toAnchorType, true);
                }
            });
        }

        // After all elements are created, explicitly update static arrow visuals
        // as their connected elements might not have existed when the arrow was first created.
        document.querySelectorAll('.wireframe-element[data-type="arrow"]').forEach(arrowDiv => {
             updateStaticArrowSVGRepresentation(arrowDiv);
        });

        updateAllConnections(); // Refreshes dynamic and static arrows again (might be redundant for static but safe)
        captureState();
        alert('Wireframe importado exitosamente!');
    } catch (error) {
        console.error("Error al importar:", error);
        alert('Error al importar el archivo JSON. Asegúrate de que el formato es correcto.');
    }
}
document.addEventListener('keydown', (e_keydown) => { /* ... existing ... */ });
document.addEventListener('DOMContentLoaded', initApp);

// (Ensure all placeholder `/* ... existing ... */` are filled with the previous full script content)
// The main changes are:
// - `currentDraggingArrowHandle` global variable.
// - `onArrowHandleMouseDown`, `onArrowHandleMouseMove`, `onArrowHandleMouseUp` functions.
// - `showArrowHandles` now adds the mousedown listener.
// - `updateStaticArrowConnectionsForElement` and `updateAllConnections` also update handles if the arrow is selected.
// - `getClosestAnchorToPoint` now has a threshold parameter.
// - `captureState` and `restoreState` are updated for new arrow data attributes.
