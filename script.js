let selectedElement = null;
let isDragging = false;
let isResizing = false;
let dragOffset = { x: 0, y: 0 };
let elementCounter = 0;

let isConnectingMode = false;
let startConnectionElementInfo = null;
const connections = [];

let isLinkingStaticArrowHandle = null;
let linkingPreviewLine = document.getElementById('linking-preview-line'); // Initial assignment

const historyStack = [];
const redoStack = [];
const MAX_HISTORY_STATES = 30;


const elementConfigs = {}; // Populated at the end of the script
let propsContentArea = document.getElementById('props-content-area'); // Initial assignment
let canvasElement = document.getElementById('canvas');  // Initial assignment
let connectToolButton = document.getElementById('connect-tool'); // Initial assignment
let importFileInput = document.getElementById('import-file-input'); // Initial assignment
let undoButton = document.getElementById('undo-button'); // Initial assignment
let redoButton = document.getElementById('redo-button'); // Initial assignment


function captureState() {
    const state = {
        elements: [],
        connections: [] // For dynamic SVG connectors
    };
    document.querySelectorAll('.wireframe-element').forEach(el => {
        const elState = {
            id: el.id,
            type: el.dataset.type,
            x: el.style.left,
            y: el.style.top,
            width: el.style.width,
            height: el.style.height,
            text: '', // Default, will be overridden
            textAlign: el.style.textAlign || '',
            fontFamily: el.style.fontFamily || '',
            fontSize: el.style.fontSize || '',
            textColor: el.style.color || '',
            fillColor: el.style.backgroundColor || '',
            rotation: el.dataset.rotation || '0',
            connectsFromId: el.dataset.connectsFromId || null, // For static arrows
            connectsToId: el.dataset.connectsToId || null,   // For static arrows
            caption: el.dataset.caption || null // For image element's caption
        };

        if (el.dataset.type === 'input') {
            elState.text = el.querySelector('.input-field') ? el.querySelector('.input-field').value : '';
        } else if (el.dataset.type === 'image') {
            elState.text = el.dataset.caption || ''; // Store caption as 'text' for image
        } else if (el.dataset.type === 'arrow') {
            elState.text = ''; // Arrows don't have text content in this model
        } else {
             // For other elements, try to get textContent, avoiding complex HTML like SVG
            if (el.querySelector('svg')) { // like static arrow
                elState.text = '';
            } else {
                 elState.text = el.textContent.trim();
            }
        }
        state.elements.push(elState);
    });

    connections.forEach(conn => { // Dynamic SVG connections
        state.connections.push({
            fromId: conn.fromId,
            fromAnchorType: conn.fromAnchorType,
            toId: conn.toId,
            toAnchorType: conn.toAnchorType
        });
    });

    if (historyStack.length >= MAX_HISTORY_STATES) {
        historyStack.shift();
    }
    historyStack.push(JSON.stringify(state));
    redoStack.length = 0;
    updateUndoRedoButtonsState();
    // console.log("State captured. History size:", historyStack.length);
}

function restoreState(stateString) {
    if (!stateString) return;
    const stateData = JSON.parse(stateString);

    clearCanvas(true);

    stateData.elements.forEach(elState => {
        let textForCreate = elState.text;
        if (elState.type === 'image') { // For image, 'text' in elState is the caption
            // createWireframeElement for image expects caption in loadedConfig.caption
        }

        createWireframeElement(elState.type, {
            id: elState.id,
            x: parseFloat(elState.x),
            y: parseFloat(elState.y),
            width: parseFloat(elState.width),
            height: parseFloat(elState.height),
            text: textForCreate,
            textAlign: elState.textAlign,
            fontFamily: elState.fontFamily,
            fontSize: elState.fontSize,
            textColor: elState.textColor,
            fillColor: elState.fillColor,
            rotation: parseFloat(elState.rotation),
            connectsFromId: elState.connectsFromId,
            connectsToId: elState.connectsToId,
            caption: elState.type === 'image' ? elState.text : elState.caption // Use text as caption for image type
        });
    });

    if (stateData.connections) {
        stateData.connections.forEach(connData => {
            const fromEl = document.getElementById(connData.fromId);
            const toEl = document.getElementById(connData.toId);
            if (fromEl && toEl) {
                createConnection(fromEl, connData.fromAnchorType, toEl, connData.toAnchorType, true /* isRestoring */);
            }
        });
    }

    document.querySelectorAll('.arrow-element').forEach(arrow => {
        if (arrow.dataset.connectsFromId || arrow.dataset.connectsToId) {
            updateStaticArrowConnection(arrow);
        }
    });

    deselectAll(false); // Don't capture state during restore
    updatePropertiesPanel();
    // console.log("State restored.");
}


function undo() {
    if (historyStack.length > 1) {
        const currentState = historyStack.pop();
        redoStack.push(currentState);
        const prevState = historyStack[historyStack.length - 1];
        restoreState(prevState);
    }
    updateUndoRedoButtonsState();
}

function redo() {
    if (redoStack.length > 0) {
        const nextState = redoStack.pop();
        historyStack.push(nextState);
        restoreState(nextState);
    }
    updateUndoRedoButtonsState();
}

function updateUndoRedoButtonsState() {
    if (undoButton && redoButton) {
        undoButton.disabled = historyStack.length <= 1;
        redoButton.disabled = redoStack.length === 0;
    }
}

function initAppDOMReferences() {
    // Re-assign DOM element variables in case they were not available at initial script load time
    propsContentArea = document.getElementById('props-content-area');
    canvasElement = document.getElementById('canvas');
    connectToolButton = document.getElementById('connect-tool');
    importFileInput = document.getElementById('import-file-input');
    undoButton = document.getElementById('undo-button');
    redoButton = document.getElementById('redo-button');
    linkingPreviewLine = document.getElementById('linking-preview-line');

    // Attach listeners that depend on these elements
    if (undoButton) undoButton.addEventListener('click', undo);
    if (redoButton) redoButton.addEventListener('click', redo);

    document.querySelectorAll('.element-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.target.dataset.type;
            if (e.target.id !== 'connect-tool' && e.target.id !== 'add-page-button') {
                createWireframeElement(type);
            }
        });
    });

    if (connectToolButton) {
        connectToolButton.addEventListener('click', () => {
            isConnectingMode = !isConnectingMode;
            connectToolButton.classList.toggle('active', isConnectingMode);
            if (canvasElement) canvasElement.classList.toggle('connecting-mode', isConnectingMode);
            if (!isConnectingMode && startConnectionElementInfo) {
                if (startConnectionElementInfo.element) startConnectionElementInfo.element.classList.remove('connection-start');
                startConnectionElementInfo = null;
            }
        });
    }

    if (canvasElement) {
        canvasElement.addEventListener('click', (e) => {
            const targetElement = e.target.closest('.wireframe-element');
            const canvasRect = canvasElement.getBoundingClientRect();
            const mouseX = e.clientX - canvasRect.left;
            const mouseY = e.clientY - canvasRect.top;

            if (isConnectingMode) {
                if (targetElement) {
                    const closestAnchor = getClosestAnchorToPoint(targetElement, mouseX, mouseY);
                    if (!closestAnchor) {
                        if (startConnectionElementInfo && startConnectionElementInfo.element) {
                            startConnectionElementInfo.element.classList.remove('connection-start');
                            startConnectionElementInfo = null;
                        }
                        return;
                    }
                    if (!startConnectionElementInfo) {
                        startConnectionElementInfo = { element: targetElement, anchorType: closestAnchor.type };
                        targetElement.classList.add('connection-start');
                        e.stopPropagation();
                    } else if (startConnectionElementInfo.element !== targetElement) {
                        createConnection(startConnectionElementInfo.element, startConnectionElementInfo.anchorType, targetElement, closestAnchor.type);
                        if (startConnectionElementInfo.element) startConnectionElementInfo.element.classList.remove('connection-start');
                        startConnectionElementInfo = null;
                    } else { // Clicked same element again
                        if (startConnectionElementInfo.element) startConnectionElementInfo.element.classList.remove('connection-start');
                        startConnectionElementInfo = null;
                    }
                } else { // Clicked on canvas background
                    if (startConnectionElementInfo && startConnectionElementInfo.element) {
                        startConnectionElementInfo.element.classList.remove('connection-start');
                        startConnectionElementInfo = null;
                    }
                }
            } else { // Not connecting mode
                if (e.target === e.currentTarget) { // Clicked on canvas itself
                    deselectAll();
                    updatePropertiesPanel();
                }
            }
        });
    }


    if (importFileInput) {
        importFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e_reader) => { // Changed var name to avoid conflict
                    importWireframe(e_reader.target.result);
                };
                reader.readAsText(file);
                event.target.value = null;
            }
        });
    }

    const addPageBtn = document.getElementById('add-page-button');
    if (addPageBtn) {
        addPageBtn.addEventListener('click', () => {
            alert("La funcionalidad de múltiples páginas aún no está implementada en esta versión.");
        });
    }

}

function initApp() {
    initAppDOMReferences(); // Setup references and listeners that need DOM ready
    updatePropertiesPanel();
    // console.log('DOM-based Wireframing tool script loaded.');
    setTimeout(() => {
        captureState();
        updateUndoRedoButtonsState();
    }, 0);
}

Object.assign(elementConfigs, {
    button: { width: 100, height: 35, text: 'Botón', defaultFillColor: '#ecf0f1', defaultTextColor: '#2c3e50' },
    input: { width: 150, height: 30, text: '', placeholder: 'Escribe aquí...', defaultTextColor: '#2c3e50' },
    text: { width: 120, height: 25, text: 'Texto aquí', defaultTextColor: '#2c3e50' },
    image: { width: 120, height: 80, text: '🖼️', caption: '', defaultTextColor: '#2c3e50' },
    rectangle: { width: 100, height: 60, text: '', defaultFillColor: 'rgba(52, 152, 219, 0.1)' },
    circle: { width: 80, height: 80, text: '' , defaultFillColor: 'rgba(52, 152, 219, 0.1)'},
    arrow: { width: 100, height: 20, text: '' },
    menu: { width: 150, height: 100, text: '☰ Menú\n• Opción 1\n• Opción 2', defaultTextColor: '#2c3e50', defaultFillColor: '#ffffff' },
    tab: { width: 200, height: 30, text: 'Tab 1 | Tab 2 | Tab 3', defaultTextColor: '#2c3e50', defaultFillColor: '#ecf0f1' },
    breadcrumb: { width: 200, height: 25, text: 'Inicio > Página', defaultTextColor: '#2c3e50', defaultFillColor: 'transparent' },
    paragraph: { width: 150, height: 60, text: 'Párrafo de texto.', defaultTextColor: '#2c3e50', defaultFillColor: 'transparent'}
});


function getElementRect(element) {
    if (!element || !element.style) return { left: 0, top: 0, width: 0, height: 0 };
    return {
        left: parseFloat(element.style.left) || 0,
        top: parseFloat(element.style.top) || 0,
        width: parseFloat(element.style.width) || 0,
        height: parseFloat(element.style.height) || 0
    };
}

function getAnchorPointCoordinates(element, anchorType) {
    const rect = getElementRect(element);
    if(isNaN(rect.left) || isNaN(rect.top) || isNaN(rect.width) || isNaN(rect.height) ) return null;
    switch(anchorType) {
        case 'top': return { x: rect.left + rect.width / 2, y: rect.top };
        case 'bottom': return { x: rect.left + rect.width / 2, y: rect.top + rect.height };
        case 'left': return { x: rect.left, y: rect.top + rect.height / 2 };
        case 'right': return { x: rect.left + rect.width, y: rect.top + rect.height / 2 };
        default: return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}; // Default to center
    }
}

function getStaticArrowHandleAbsolutePosition(arrowElement, handleType) {
    const arrowRect = getElementRect(arrowElement);
    let angleDegrees = parseFloat(arrowElement.dataset.rotation) || 0;

    const arrowAngleRad = angleDegrees * Math.PI / 180;
    let localX = (handleType === 'start') ? 0 : arrowRect.width;
    let localY = arrowRect.height / 2;

    const pivotXLocal = 0;
    const pivotYLocal = arrowRect.height / 2;

    const translatedX = localX - pivotXLocal;
    const translatedY = localY - pivotYLocal;

    const rotatedXLocal = translatedX * Math.cos(arrowAngleRad) - translatedY * Math.sin(arrowAngleRad);
    const rotatedYLocal = translatedX * Math.sin(arrowAngleRad) + translatedY * Math.cos(arrowAngleRad);

    return {
        x: arrowRect.left + rotatedXLocal + pivotXLocal,
        y: arrowRect.top + rotatedYLocal + pivotYLocal
    };
}


function getClosestAnchorToPoint(element, mouseX, mouseY) {
    const anchorTypes = ['top', 'bottom', 'left', 'right'];
    let closestAnchor = null;
    let minDistance = Infinity;
    const clickThreshold = 25; // Max distance to consider an anchor "clicked"

    anchorTypes.forEach(type => {
        const point = getAnchorPointCoordinates(element, type);
        if (point) {
            const distance = Math.sqrt(Math.pow(point.x - mouseX, 2) + Math.pow(point.y - mouseY, 2));
            if (distance < minDistance && distance < clickThreshold) {
                minDistance = distance;
                closestAnchor = { type, x: point.x, y: point.y };
            }
        }
    });
    return closestAnchor;
}


function createWireframeElement(type, loadedConfig = null) {
    if (!canvasElement) { console.error("Canvas element not found for createWireframeElement"); return; }

    const baseConfig = elementConfigs[type] || {};
    const config = { ...baseConfig, ...loadedConfig }; // loadedConfig overrides baseConfig

    elementCounter++;
    const element = document.createElement('div');
    element.className = `wireframe-element ${type}-element`;

    if (config.id) {
        element.id = config.id;
        const idNumPart = config.id.split('-')[1];
        if (idNumPart) {
            const idNum = parseInt(idNumPart);
            if (idNum >= elementCounter) elementCounter = idNum + 1;
        }
    } else {
        element.id = `element-${elementCounter}`;
    }

    const defaultSize = type === 'arrow' ? { w:100, h:20 } : {w:100, h:50};
    const w = parseFloat(config.width) || baseConfig.width || defaultSize.w;
    const h = parseFloat(config.height) || baseConfig.height || defaultSize.h;

    const x = config.x !== undefined ? parseFloat(config.x) : (Math.random() * (canvasElement.offsetWidth - w - 100) + 50);
    const y = config.y !== undefined ? parseFloat(config.y) : (Math.random() * (canvasElement.offsetHeight - h - 100) + 50);

    element.style.left = x + 'px';
    element.style.top = y + 'px';
    element.style.width = w + 'px';
    element.style.height = h + 'px';
    element.dataset.type = type;

    element.style.textAlign = config.textAlign || (type === 'button' ? 'center' : 'left');
    element.style.fontFamily = config.fontFamily || baseConfig.fontFamily || 'Arial, sans-serif';
    element.style.fontSize = config.fontSize || baseConfig.fontSize || '12px';
    element.style.color = config.textColor || baseConfig.defaultTextColor || '#2c3e50';
    element.style.backgroundColor = config.fillColor || baseConfig.defaultFillColor || (type === 'rectangle' || type === 'circle' ? 'rgba(52, 152, 219, 0.1)' : 'transparent');

    const initialRotation = config.rotation !== undefined ? parseFloat(config.rotation) : 0;
    element.style.transform = `rotate(${initialRotation}deg)`;
    element.dataset.rotation = initialRotation;

    if (config.connectsFromId) element.dataset.connectsFromId = config.connectsFromId;
    if (config.connectsToId) element.dataset.connectsToId = config.connectsToId;
    if (config.caption) element.dataset.caption = config.caption; // Used for image


    let textContent = config.text !== undefined ? config.text : (baseConfig.text || '');

    if (type === 'arrow') {
        element.innerHTML = `<svg class="arrow-svg-static" preserveAspectRatio="none" viewBox="0 0 100 20"><line x1="0" y1="10" x2="90" y2="10" /><polygon points="85,5 100,10 85,15" /></svg>`;
        const handleStart = document.createElement('div'); handleStart.className = 'connection-handle start'; handleStart.dataset.handleType = 'start';
        handleStart.addEventListener('mousedown', onStaticArrowHandleMouseDown); element.appendChild(handleStart);
        const handleEnd = document.createElement('div'); handleEnd.className = 'connection-handle end'; handleEnd.dataset.handleType = 'end';
        handleEnd.addEventListener('mousedown', onStaticArrowHandleMouseDown); element.appendChild(handleEnd);
        if(loadedConfig) updateStaticArrowConnection(element);
    } else if (type === 'input') {
        const inputField = document.createElement('input'); inputField.className = 'input-field'; inputField.type = 'text';
        inputField.placeholder = config.placeholder || baseConfig.placeholder || '';
        inputField.value = textContent; // 'text' from config is the value for input
        if(element.style.color) inputField.style.color = element.style.color;
        inputField.addEventListener('mousedown', (e_input) => e_input.stopPropagation());
        inputField.addEventListener('click', (e_input) => e_input.stopPropagation());
        inputField.addEventListener('input', () => { captureState(); updatePropertiesPanel(); captureState(); });
        element.appendChild(inputField);
    } else if (type === 'circle') {
        element.style.borderRadius = '50%';
        element.textContent = textContent;
    } else if (type === 'image') {
        element.dataset.caption = config.caption || textContent || baseConfig.caption || '';
        const iconSpan = document.createElement('span');
        iconSpan.textContent = baseConfig.text || '🖼️'; // The visual icon, not the caption
        element.appendChild(iconSpan);
        if (element.dataset.caption) {
            const captionSpan = document.createElement('span'); captionSpan.className = 'caption';
            captionSpan.textContent = element.dataset.caption;
            if(element.style.color) captionSpan.style.color = element.style.color;
            element.appendChild(captionSpan);
        }
    } else { // General text elements like button, text, paragraph
        element.textContent = textContent;
        if (type === 'menu' || type === 'breadcrumb' || type === 'paragraph' || (type === 'text' && element.textContent.includes('\n'))) {
            element.style.whiteSpace = 'pre-line';
        }
        if (type === 'menu') { element.style.fontSize = '11px'; element.style.padding = '8px';}
        if (type === 'paragraph') { element.style.whiteSpace = 'pre-wrap'; element.style.alignItems = 'flex-start';}
    }

    const deleteBtn = document.createElement('button'); deleteBtn.className = 'delete-btn'; deleteBtn.innerHTML = '×';
    deleteBtn.onclick = (e_del) => {
        captureState();
        e_del.stopPropagation();
        const elToRemove = element;
        const idToRemove = elToRemove.id;
        elToRemove.remove();
        if(selectedElement === elToRemove) { deselectAll(false); updatePropertiesPanel(); } // Don't capture in deselectAll if already capturing

        connections.slice().reverse().forEach((conn) => {
            if (conn.fromId === idToRemove || conn.toId === idToRemove) {
                if (conn.arrowSvgElement) conn.arrowSvgElement.remove();
                connections.splice(connections.indexOf(conn), 1);
            }
        });
        document.querySelectorAll('.arrow-element').forEach(arrow => {
            let changed = false;
            if (arrow.dataset.connectsFromId === idToRemove) { delete arrow.dataset.connectsFromId; changed = true; }
            if (arrow.dataset.connectsToId === idToRemove) { delete arrow.dataset.connectsToId; changed = true; }
            if (changed) updateStaticArrowConnection(arrow);
        });
        captureState();
    };
    element.appendChild(deleteBtn);

    if (type !== 'arrow') {
        const resizeHandle = document.createElement('div'); resizeHandle.className = 'resize-handle';
        element.appendChild(resizeHandle); resizeHandle.addEventListener('mousedown', startResize);
    }
    element.addEventListener('mousedown', startDrag);
    element.addEventListener('dblclick', editText);
    canvasElement.appendChild(element);

    if (!loadedConfig) { // Only select, update panel and capture if it's a new element by user action
        selectElement({ target: element, stopPropagation: () => {} }, false);
        updatePropertiesPanel();
        captureState();
    }
}


function onStaticArrowHandleMouseDown(e_static_mouse) {
    captureState();
    e_static_mouse.stopPropagation();
    const arrowElement = e_static_mouse.target.closest('.arrow-element');
    const handleType = e_static_mouse.target.dataset.handleType;
    isLinkingStaticArrowHandle = { arrowElement, handleType, originalX: e_static_mouse.clientX, originalY: e_static_mouse.clientY };

    let initialPos;
    if (handleType === 'start') {
        initialPos = arrowElement.dataset.connectsFromId ?
            getAnchorPointCoordinates(document.getElementById(arrowElement.dataset.connectsFromId), 'right') : // Assuming right anchor for source
            getStaticArrowHandleAbsolutePosition(arrowElement, 'start');
    } else { // 'end'
        initialPos = arrowElement.dataset.connectsToId ?
            getAnchorPointCoordinates(document.getElementById(arrowElement.dataset.connectsToId), 'left') : // Assuming left anchor for target
            getStaticArrowHandleAbsolutePosition(arrowElement, 'end');
    }


    if (initialPos && linkingPreviewLine) {
        linkingPreviewLine.setAttribute('x1', initialPos.x);
        linkingPreviewLine.setAttribute('y1', initialPos.y);
        linkingPreviewLine.setAttribute('x2', initialPos.x);
        linkingPreviewLine.setAttribute('y2', initialPos.y);
        linkingPreviewLine.style.display = 'block';
    }

    if (canvasElement) canvasElement.classList.add('linking-arrow-handle');
    document.addEventListener('mousemove', onStaticArrowHandleMouseMove);
    document.addEventListener('mouseup', onStaticArrowHandleMouseUp);
}

function onStaticArrowHandleMouseMove(e_static_move) {
    if (!isLinkingStaticArrowHandle || !linkingPreviewLine || !canvasElement) return;
    const canvasRect = canvasElement.getBoundingClientRect();
    const mouseX = e_static_move.clientX - canvasRect.left;
    const mouseY = e_static_move.clientY - canvasRect.top;

    linkingPreviewLine.setAttribute('x2', mouseX);
    linkingPreviewLine.setAttribute('y2', mouseY);

    document.querySelectorAll('.wireframe-element:not(.arrow-element)').forEach(el => {
        el.classList.remove('highlight-connection-target'); // CSS needed for this class
        const elRect = el.getBoundingClientRect();
        if (e_static_move.clientX >= elRect.left && e_static_move.clientX <= elRect.right &&
            e_static_move.clientY >= elRect.top && e_static_move.clientY <= elRect.bottom) {
             el.classList.add('highlight-connection-target');
        }
    });
}

function onStaticArrowHandleMouseUp(e_static_up) {
    if (!isLinkingStaticArrowHandle) return;

    const { arrowElement, handleType } = isLinkingStaticArrowHandle;
    // Find the element under the mouse cursor, excluding the arrow itself or its handles
    let targetElement = null;
    const elementsUnderMouse = document.elementsFromPoint(e_static_up.clientX, e_static_up.clientY);
    for (let el of elementsUnderMouse) {
        if (el.classList.contains('wireframe-element') && !el.classList.contains('arrow-element') && !el.classList.contains('connection-handle')) {
            targetElement = el;
            break;
        }
    }


    if (targetElement) {
        if (handleType === 'start') {
            arrowElement.dataset.connectsFromId = targetElement.id;
        } else { // 'end'
            arrowElement.dataset.connectsToId = targetElement.id;
        }
    } else {
        // If dropped on canvas or invalid target, detach
        // For a free end, we'd ideally store its absolute coords and adjust arrow.
        // Simple version: just clear connection. Arrow might need manual repositioning.
        if (handleType === 'start') {
            delete arrowElement.dataset.connectsFromId;
        } else {
            delete arrowElement.dataset.connectsToId;
        }
    }

    updateStaticArrowConnection(arrowElement);

    if(linkingPreviewLine) linkingPreviewLine.style.display = 'none';
    if(canvasElement) canvasElement.classList.remove('linking-arrow-handle');
    document.querySelectorAll('.wireframe-element').forEach(el => el.classList.remove('highlight-connection-target'));
    document.removeEventListener('mousemove', onStaticArrowHandleMouseMove);
    document.removeEventListener('mouseup', onStaticArrowHandleMouseUp);
    isLinkingStaticArrowHandle = null;
    captureState();
}


function updateStaticArrowConnection(arrowElement) {
    if (!arrowElement) return;
    const fromId = arrowElement.dataset.connectsFromId;
    const toId = arrowElement.dataset.connectsToId;
    const fromElement = fromId ? document.getElementById(fromId) : null;
    const toElement = toId ? document.getElementById(toId) : null;

    let p1, p2;

    // Determine start point (p1)
    if (fromElement) {
        p1 = getAnchorPointCoordinates(fromElement, 'right'); // Default connection from right side of source
    } else { // Start is free floating
        // If free, its position is defined by arrowElement.style.left and half its height, adjusted for rotation=0
        const currentLeft = parseFloat(arrowElement.style.left) || 0;
        const currentTop = parseFloat(arrowElement.style.top) || 0;
        const currentHeight = parseFloat(arrowElement.style.height) || 0;
        p1 = { x: currentLeft, y: currentTop + currentHeight / 2 };
    }

    // Determine end point (p2)
    if (toElement) {
        p2 = getAnchorPointCoordinates(toElement, 'left'); // Default connection to left side of target
    } else { // End is free floating
        // If free, its position is defined by where the arrow visually ends at its current rotation and length
        // This requires knowing the arrow's current rotation and width (length)
        const currentLeft = parseFloat(arrowElement.style.left) || 0;
        const currentTop = parseFloat(arrowElement.style.top) || 0;
        const currentWidth = parseFloat(arrowElement.style.width) || 0;
        const currentHeight = parseFloat(arrowElement.style.height) || 0;
        const angleRad = (parseFloat(arrowElement.dataset.rotation) || 0) * Math.PI / 180;

        p2 = {
            x: currentLeft + currentWidth * Math.cos(angleRad),
            y: currentTop + currentHeight / 2 + currentWidth * Math.sin(angleRad) // y is arrow's mid-point + length projected on Y
        };
    }

    if (!p1 || !p2) return;


    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    arrowElement.style.left = p1.x + 'px';
    arrowElement.style.top = (p1.y - (parseFloat(arrowElement.style.height) || baseConfig.height || 20) / 2) + 'px';
    arrowElement.style.width = length + 'px';
    arrowElement.style.transform = `rotate(${angle}deg)`;
    arrowElement.dataset.rotation = angle.toFixed(2);

    if(selectedElement === arrowElement) { updatePropertiesPanel(); }
}

function updateStaticArrowConnectionsForElement(movedElement) {
    if (!movedElement || !movedElement.id) return;
    document.querySelectorAll('.arrow-element').forEach(arrow => {
        if (arrow.dataset.connectsFromId === movedElement.id || arrow.dataset.connectsToId === movedElement.id) {
            updateStaticArrowConnection(arrow);
        }
    });
}

function createConnection(fromElement, fromAnchorType, toElement, toAnchorType, isRestoring = false) {
    if (!fromElement || !toElement) return;
    if (!isRestoring) captureState();

    const connection = {
        fromId: fromElement.id,
        fromAnchorType: fromAnchorType,
        toId: toElement.id,
        toAnchorType: toAnchorType,
        arrowSvgElement: null
    };
    connections.push(connection);
    const svgArrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgArrow.classList.add('connector-arrow-svg');
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    const arrowhead = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    arrowhead.setAttribute("points", "0,0 -8,4 -8,-4");

    svgArrow.appendChild(line);
    svgArrow.appendChild(arrowhead);
    if (canvasElement) canvasElement.appendChild(svgArrow); // Check canvasElement exists
    connection.arrowSvgElement = svgArrow;

    updateConnectionArrow(connection);
    if (!isRestoring) captureState();
}

function updateConnectionArrow(connection) {
    const fromEl = document.getElementById(connection.fromId);
    const toEl = document.getElementById(connection.toId);

    if (!fromEl || !toEl || !connection.arrowSvgElement) {
      if (connection.arrowSvgElement) connection.arrowSvgElement.style.display = 'none';
      return;
    }
    connection.arrowSvgElement.style.display = '';


    const p1 = getAnchorPointCoordinates(fromEl, connection.fromAnchorType);
    const p2 = getAnchorPointCoordinates(toEl, connection.toAnchorType);

    if (!p1 || !p2) {
        connection.arrowSvgElement.style.display = 'none';
        return;
    }

    const line = connection.arrowSvgElement.querySelector('line');
    const arrowhead = connection.arrowSvgElement.querySelector('polygon');

    if (line) {
        line.setAttribute('x1', p1.x);
        line.setAttribute('y1', p1.y);
        line.setAttribute('x2', p2.x);
        line.setAttribute('y2', p2.y);
    }
    if (arrowhead) {
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        arrowhead.setAttribute('transform', `translate(${p2.x},${p2.y}) rotate(${angle * 180 / Math.PI})`);
    }

    if (canvasElement && connection.arrowSvgElement) {
        connection.arrowSvgElement.style.left = '0px';
        connection.arrowSvgElement.style.top = '0px';
        connection.arrowSvgElement.setAttribute('width', canvasElement.scrollWidth);
        connection.arrowSvgElement.setAttribute('height', canvasElement.scrollHeight);
    }
}

function updateAllConnections() {
    connections.forEach(updateConnectionArrow);
    document.querySelectorAll('.arrow-element').forEach(arrow => {
        if (arrow.dataset.connectsFromId || arrow.dataset.connectsToId) {
            updateStaticArrowConnection(arrow);
        }
    });
}

function startDrag(e_drag_start) {
    if (e_drag_start.target.classList.contains('resize-handle') ||
        e_drag_start.target.classList.contains('connection-handle') ||
        e_drag_start.target.classList.contains('input-field') ||
        e_drag_start.target.closest('.delete-btn')) return;

    const currentTargetElement = e_drag_start.target.closest('.wireframe-element');
    if (currentTargetElement) {
        captureState();
        selectedElement = currentTargetElement;
        isDragging = true;
        dragOffset.x = e_drag_start.clientX - selectedElement.offsetLeft;
        dragOffset.y = e_drag_start.clientY - selectedElement.offsetTop;

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

    updateAllConnections();
    updateStaticArrowConnectionsForElement(selectedElement);
}

function stopDrag() {
    if (!isDragging) return; // Avoid capturing state if no drag occurred
    isDragging = false;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
    if(selectedElement) {
        updateAllConnections();
        updateStaticArrowConnectionsForElement(selectedElement);
        captureState();
    }
}

function startResize(e_resize_start) {
    e_resize_start.stopPropagation();
    captureState();
    selectedElement = e_resize_start.target.closest('.wireframe-element');
    isResizing = true;
    dragOffset.x = e_resize_start.clientX;
    dragOffset.y = e_resize_start.clientY;
    dragOffset.width = parseFloat(selectedElement.style.width);
    dragOffset.height = parseFloat(selectedElement.style.height);

    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
}

function resize(e_resize_move) {
    if (!isResizing || !selectedElement) return;
    e_resize_move.preventDefault();
    let newWidth = dragOffset.width + (e_resize_move.clientX - dragOffset.x);
    let newHeight = dragOffset.height + (e_resize_move.clientY - dragOffset.y);

    selectedElement.style.width = Math.max(20, newWidth) + 'px';
    selectedElement.style.height = Math.max(20, newHeight) + 'px';

    updateAllConnections();
    updateStaticArrowConnectionsForElement(selectedElement);
    if(selectedElement.dataset.type === 'arrow') updateStaticArrowConnection(selectedElement);
}

function stopResize() {
    if(!isResizing) return;
    isResizing = false;
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', stopResize);
    if(selectedElement){
        updateAllConnections();
        updateStaticArrowConnectionsForElement(selectedElement);
        if(selectedElement.dataset.type === 'arrow') updateStaticArrowConnection(selectedElement);
        captureState();
        updatePropertiesPanel();
    }
}

function selectElement(e_select, shouldUpdatePanel = true) {
    const targetElement = e_select.target.closest('.wireframe-element');
    if (!targetElement) return;

    if (selectedElement !== targetElement) {
        // If there was a previously selected element, and it's different, capture state before changing selection
        if (selectedElement) {
            // This conditional capture might be too aggressive if just clicking around.
            // Consider if deselectAll should handle its own capture.
            // For now, assume a change in selection is a state change.
            // captureState();
        }
        deselectAll(false);
        selectedElement = targetElement;
        selectedElement.classList.add('selected');
    }
    e_select.stopPropagation();
    if (shouldUpdatePanel) updatePropertiesPanel();
}

function deselectAll(capture = true) {
    // Only capture if something *was* selected and is now being deselected by canvas click
    if (capture && selectedElement) {
        // captureState(); // This might be redundant if selectElement or other actions capture.
                        // Let's try without it here to avoid too many captures.
    }
    document.querySelectorAll('.wireframe-element.selected').forEach(el => {
        el.classList.remove('selected');
    });
    selectedElement = null;
    if (capture) updatePropertiesPanel();
}


function editText(e_edit_text) {
    const element = e_edit_text.target.closest('.wireframe-element');
    if (!element || (element.classList.contains('arrow-element'))) return;

    captureState();

    let currentText = '';
    const type = element.dataset.type;
    let newTextVal = null;

    if (type === 'input') {
        const inputField = element.querySelector('.input-field');
        currentText = inputField ? inputField.value : '';
        newTextVal = prompt('Editar valor:', currentText);
        if (newTextVal !== null && inputField) {
            inputField.value = newTextVal;
        }
    } else if (type === 'image') {
        currentText = element.dataset.caption || '';
        newTextVal = prompt('Editar pie de foto:', currentText);
        if (newTextVal !== null) {
            element.dataset.caption = newTextVal;
            let captionSpan = element.querySelector('.caption');
            if (!captionSpan && newTextVal.trim() !== "") {
                captionSpan = document.createElement('span');
                captionSpan.className = 'caption';
                element.appendChild(captionSpan);
            }
            if (captionSpan) {
                captionSpan.textContent = newTextVal;
                if (element.style.color) captionSpan.style.color = element.style.color;
                if (newTextVal.trim() === "") captionSpan.remove();
            }
        }
    } else {
        currentText = element.textContent.trim();
        newTextVal = prompt('Editar texto:', currentText);
        if (newTextVal !== null) {
            element.textContent = newTextVal;
            if (type === 'menu' || type === 'breadcrumb' || type === 'paragraph' || (type === 'text' && newTextVal.includes('\n'))) {
                element.style.whiteSpace = 'pre-line';
            } else if (type !== 'paragraph') { // Paragraphs should keep their wrap style
                element.style.whiteSpace = 'normal';
            }
        }
    }

    if (newTextVal !== null) {
        captureState();
    }
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

    if (type !== 'arrow' && type !== 'rectangle' && type !== 'circle') {
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
    }

    if (type === 'button' || type === 'rectangle' || type === 'circle') {
         content += `<h4>Apariencia</h4>`;
        content += `<div class="prop-group">
                        <label for="prop-fill-color">Color Relleno:</label>
                        <input type="color" id="prop-fill-color" value="${rgbToHex(selectedElement.style.backgroundColor) || config.defaultFillColor || '#ecf0f1'}">
                    </div>`;
    }

    if (type === 'arrow') {
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

    const textInput = document.getElementById('prop-text');
    if (textInput) textInput.addEventListener('change', (e_prop_text) => { captureState(); selectedElement.textContent = e_prop_text.target.value; if (type === 'menu' || type === 'breadcrumb' || type === 'paragraph' || (type === 'text' && e_prop_text.target.value.includes('\n'))) {selectedElement.style.whiteSpace = 'pre-line';} else if (type !== 'paragraph') {selectedElement.style.whiteSpace = 'normal';} captureState(); });

    const inputValueInput = document.getElementById('prop-input-value');
    if (inputValueInput) inputValueInput.addEventListener('change', (e_prop_input) => { captureState(); if(selectedElement.querySelector('.input-field')) selectedElement.querySelector('.input-field').value = e_prop_input.target.value; captureState(); });

    const captionInput = document.getElementById('prop-caption');
    if (captionInput) captionInput.addEventListener('change', (e_prop_caption) => {
        captureState();
        selectedElement.dataset.caption = e_prop_caption.target.value;
        let capSpan = selectedElement.querySelector('.caption');
        if (!capSpan && e_prop_caption.target.value.trim() !== "") { capSpan = document.createElement('span'); capSpan.className = 'caption'; selectedElement.appendChild(capSpan); }
        if (capSpan) { capSpan.textContent = e_prop_caption.target.value; if(selectedElement.style.color) capSpan.style.color = selectedElement.style.color; if(e_prop_caption.target.value.trim() === "") capSpan.remove(); }
        captureState();
    });

    document.querySelectorAll('.alignment-buttons button').forEach(btn => {
        btn.addEventListener('click', (e_align) => { captureState(); selectedElement.style.textAlign = e_align.target.dataset.align; document.querySelectorAll('.alignment-buttons button').forEach(b => b.classList.remove('active')); e_align.target.classList.add('active'); captureState(); });
    });

    const fontFamilySelect = document.getElementById('prop-font-family');
    if (fontFamilySelect) {
        fontFamilySelect.value = selectedElement.style.fontFamily || config.fontFamily || 'Arial, sans-serif';
        fontFamilySelect.addEventListener('change', (e_font) => { captureState(); selectedElement.style.fontFamily = e_font.target.value; captureState(); });
    }

    const fontSizeInput = document.getElementById('prop-font-size');
    if (fontSizeInput) fontSizeInput.addEventListener('change', (e_fontsize) => { captureState(); selectedElement.style.fontSize = e_fontsize.target.value + 'px'; captureState(); });

    const textColorInput = document.getElementById('prop-text-color');
    if (textColorInput) textColorInput.addEventListener('input', (e_textcolor) => { captureState(); selectedElement.style.color = e_textcolor.target.value; if(type==='image' && selectedElement.querySelector('.caption')) selectedElement.querySelector('.caption').style.color = e_textcolor.target.value; if(type==='input' && selectedElement.querySelector('.input-field')) selectedElement.querySelector('.input-field').style.color = e_textcolor.target.value; captureState(); });

    const fillColorInput = document.getElementById('prop-fill-color');
    if (fillColorInput) fillColorInput.addEventListener('input', (e_fillcolor) => { captureState(); selectedElement.style.backgroundColor = e_fillcolor.target.value; captureState(); });

    const rotationInput = document.getElementById('prop-rotation');
    if (rotationInput) rotationInput.addEventListener('change', (e_rotation) => {
        captureState();
        const newRotation = parseFloat(e_rotation.target.value) || 0;
        selectedElement.style.transform = `rotate(${newRotation}deg)`;
        selectedElement.dataset.rotation = newRotation;
        if(type === 'arrow') updateStaticArrowConnection(selectedElement);
        captureState();
    });

    const convertButton = document.getElementById('convert-to-paragraph');
    if (convertButton) convertButton.addEventListener('click', () => {
        if (selectedElement && selectedElement.dataset.type === 'text') {
            captureState();
            selectedElement.classList.remove('text-element');
            selectedElement.classList.add('paragraph-element');
            selectedElement.dataset.type = 'paragraph';
            selectedElement.style.height = 'auto';
            selectedElement.style.minHeight = '40px';
            selectedElement.style.whiteSpace = 'pre-wrap';
            selectedElement.style.alignItems = 'flex-start'; // typical for paragraph
            updatePropertiesPanel();
            captureState();
        }
    });
}

function rgbToHex(rgb) {
    if (!rgb || typeof rgb !== 'string') return '#000000'; // Default or if invalid
    if (rgb.startsWith('#')) return rgb;
    const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/);
    if (!match) return rgb;
    function hex(x) {
        return ("0" + parseInt(x).toString(16)).slice(-2);
    }
    return "#" + hex(match[1]) + hex(match[2]) + hex(match[3]);
}


function clearCanvas(silent = false) {
    if (!canvasElement) return;
    if (!silent) captureState();
    if (silent || confirm('¿Estás seguro de que quieres limpiar todo el canvas?')) {
        // Remove all .wireframe-element and .connector-arrow-svg children
        while (canvasElement.firstChild && !canvasElement.firstChild.id?.includes('linking-preview-svg')) {
             if(canvasElement.firstChild.classList?.contains('wireframe-element') || canvasElement.firstChild.classList?.contains('connector-arrow-svg')) {
                canvasElement.removeChild(canvasElement.firstChild);
             } else if (canvasElement.firstChild.nodeName === "svg" && !canvasElement.firstChild.id?.includes('linking-preview-svg')){ // other SVGs
                canvasElement.removeChild(canvasElement.firstChild);
             } else { // Should not happen if structure is correct, but as a fallback
                break;
             }
        }
        // Ensure linking-preview-svg is there (it might be removed if not handled carefully)
        if (!document.getElementById('linking-preview-svg')) {
             const previewSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
             previewSvg.id = "linking-preview-svg";
             Object.assign(previewSvg.style, {position:'absolute', top:'0', left:'0', width:'100%', height:'100%', pointerEvents:'none', zIndex:'99'});
             const previewLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
             previewLine.id = "linking-preview-line";
             previewLine.setAttribute('stroke', '#007bff'); previewLine.setAttribute('stroke-width', '1.5');
             previewLine.setAttribute('stroke-dasharray', '4,4'); previewLine.style.display = 'none';
             previewSvg.appendChild(previewLine);
             canvasElement.appendChild(previewSvg);
             linkingPreviewLine = previewLine;
        }


        connections.length = 0;
        selectedElement = null;
        elementCounter = 1; // Reset counter
        if (!silent) {
            updatePropertiesPanel();
            captureState();
        }
    }
}

function exportWireframe() {
    const stateToExport = {
        elements: [],
        connections: []
    };
    document.querySelectorAll('.wireframe-element').forEach(el => {
        const elState = {
            id: el.id,
            type: el.dataset.type,
            x: el.style.left,
            y: el.style.top,
            width: el.style.width,
            height: el.style.height,
            text: '', // Default
            textAlign: el.style.textAlign || '',
            fontFamily: el.style.fontFamily || '',
            fontSize: el.style.fontSize || '',
            textColor: el.style.color || '',
            fillColor: el.style.backgroundColor || '',
            rotation: el.dataset.rotation || '0',
            connectsFromId: el.dataset.connectsFromId || null,
            connectsToId: el.dataset.connectsToId || null,
            caption: el.dataset.caption || null
        };
         if (el.dataset.type === 'input') {
            elState.text = el.querySelector('.input-field') ? el.querySelector('.input-field').value : '';
        } else if (el.dataset.type === 'image') {
            elState.text = el.dataset.caption || ''; // For image, 'text' is the caption
        } else if (el.dataset.type !== 'arrow') { // Arrows have no text
            elState.text = el.textContent.trim();
        }
        stateToExport.elements.push(elState);
    });
    connections.forEach(conn => {
        stateToExport.connections.push({
            fromId: conn.fromId,
            fromAnchorType: conn.fromAnchorType,
            toId: conn.toId,
            toAnchorType: conn.toAnchorType
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
                createWireframeElement(elState.type, {
                    id: elState.id,
                    x: parseFloat(elState.x),
                    y: parseFloat(elState.y),
                    width: parseFloat(elState.width),
                    height: parseFloat(elState.height),
                    text: elState.text, // createWireframeElement handles based on type
                    textAlign: elState.textAlign,
                    fontFamily: elState.fontFamily,
                    fontSize: elState.fontSize,
                    textColor: elState.textColor,
                    fillColor: elState.fillColor,
                    rotation: parseFloat(elState.rotation),
                    connectsFromId: elState.connectsFromId,
                    connectsToId: elState.connectsToId,
                    caption: elState.caption // Explicitly pass caption
                });
            });
        }
        if (data.connections) {
            data.connections.forEach(connData => {
                const fromEl = document.getElementById(connData.fromId);
                const toEl = document.getElementById(connData.toId);
                if (fromEl && toEl) {
                    createConnection(fromEl, connData.fromAnchorType, toEl, connData.toAnchorType, true);
                }
            });
        }

        document.querySelectorAll('.arrow-element').forEach(arrow => {
            if (arrow.dataset.connectsFromId || arrow.dataset.connectsToId) {
                updateStaticArrowConnection(arrow);
            }
        });

        updateAllConnections();
        captureState();
        alert('Wireframe importado exitosamente!');
    } catch (error) {
        console.error("Error al importar:", error);
        alert('Error al importar el archivo JSON. Asegúrate de que el formato es correcto.');
    }
}


document.addEventListener('keydown', (e_keydown) => {
    const activeElTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : null;
    if (activeElTag === 'input' || activeElTag === 'textarea' || activeElTag === 'select') {
        if (e_keydown.key === 'Escape') document.activeElement.blur(); // Allow deselecting input with Escape
        else return; // Don't process shortcuts if typing in an input
    }

    if (selectedElement && (e_keydown.key === 'Delete' || e_keydown.key === 'Backspace')) {
        captureState();
        const idToRemove = selectedElement.id;
        const currentSelected = selectedElement; // Keep a reference
        selectedElement = null; // Deselect first
        currentSelected.remove(); // Then remove

        connections.slice().reverse().forEach((conn) => {
            if (conn.fromId === idToRemove || conn.toId === idToRemove) {
                if (conn.arrowSvgElement) conn.arrowSvgElement.remove();
                connections.splice(connections.indexOf(conn), 1);
            }
        });
         document.querySelectorAll('.arrow-element').forEach(arrow => {
            let changed = false;
            if (arrow.dataset.connectsFromId === idToRemove) { delete arrow.dataset.connectsFromId; changed = true; }
            if (arrow.dataset.connectsToId === idToRemove) { delete arrow.dataset.connectsToId; changed = true; }
            if (changed) updateStaticArrowConnection(arrow);
        });

        updatePropertiesPanel();
        captureState();
    } else if (e_keydown.ctrlKey || e_keydown.metaKey) { // Meta for Mac
        if (e_keydown.key === 'z') {
            e_keydown.preventDefault();
            undo();
        } else if (e_keydown.key === 'y') {
            e_keydown.preventDefault();
            redo();
        } else if (e_keydown.key === 'd' && selectedElement) {
            e_keydown.preventDefault();
            captureState();
            const oldRect = getElementRect(selectedElement);
            const type = selectedElement.dataset.type;
            const baseConfig = elementConfigs[type] || {};
            let textToDup;
            if (type === 'input') textToDup = selectedElement.querySelector('.input-field')?.value || '';
            else if (type === 'image') textToDup = selectedElement.dataset.caption || ''; // For image, text is caption
            else if (type === 'arrow') textToDup = '';
            else textToDup = selectedElement.textContent || '';


            const newConfig = {
                x: oldRect.left + 20,
                y: oldRect.top + 20,
                width: oldRect.width,
                height: oldRect.height,
                text: textToDup,
                textAlign: selectedElement.style.textAlign,
                fontFamily: selectedElement.style.fontFamily,
                fontSize: selectedElement.style.fontSize,
                textColor: selectedElement.style.color,
                fillColor: selectedElement.style.backgroundColor,
                rotation: parseFloat(selectedElement.dataset.rotation || '0'),
                caption: selectedElement.dataset.caption // Ensure caption is duplicated for images
            };
            createWireframeElement(type, newConfig);
        }
    }
});


document.addEventListener('DOMContentLoaded', initApp);
