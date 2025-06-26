document.addEventListener('DOMContentLoaded', () => {
    const elementsList = document.getElementById('elements-list');
    const canvas = document.getElementById('wireframe-canvas');
    const ctx = canvas.getContext('2d');

    const uiElements = [
        { id: 'button', name: 'Button', type: 'button' }, { id: 'rectangle', name: 'Rectangle', type: 'rect' },
        { id: 'text-label', name: 'Text Label', type: 'text' }, { id: 'image', name: 'Image Placeholder', type: 'image' },
        { id: 'paragraph', name: 'Paragraph', type: 'paragraph' }, { id: 'checkbox', name: 'Checkbox', type: 'checkbox' }
    ];

    uiElements.forEach(element => {
        const listItem = document.createElement('li');
        listItem.textContent = element.name;
        listItem.setAttribute('draggable', true);
        listItem.setAttribute('data-element-type', element.type);
        listItem.setAttribute('id', `el-${element.id}`);
        elementsList.appendChild(listItem);
    });

    canvas.width = 800; canvas.height = 600;
    let draggedElementType = null;

    let pages = [];
    let currentPageId = null;
    let nextPageIdCounter = 1;

    let connectorDrawingMode = false;
    let connectorStartPointInfo = null;
    const CONNECT_LINE_COLOR = '#333333';
    const CONNECT_LINE_WIDTH = 2;
    const ANCHOR_SIZE = 6;
    const ARROW_SIZE = 10;

    let selectedElement = null, primedElementForMove = null, isResizing = false;
    let lastClickTime = 0, lastClickedElement = null;
    const DOUBLE_CLICK_THRESHOLD = 400, RESIZE_HANDLE_SIZE = 8;

    function getCurrentPageData() {
        if (!currentPageId) return null;
        return pages.find(p => p.id === currentPageId);
    }

    function createNewPage(name) {
        const newPage = {
            id: `page-${nextPageIdCounter++}`,
            name: name || `Page ${nextPageIdCounter - 1}`,
            elements: [],
            connectors: []
        };
        pages.push(newPage);
        return newPage;
    }

    function initApp() {
        const loadedData = loadDataFromStorage(true);
        if (loadedData && loadedData.pages && loadedData.pages.length > 0) {
            pages = loadedData.pages;
            currentPageId = loadedData.currentPageId || pages[0].id;
            nextPageIdCounter = loadedData.nextPageIdCounter || pages.length + 1;
            pages.forEach(p => {
                if (p.connectorsData) {
                    p.connectors = p.connectorsData.map(cData => {
                        if (cData.fromElementId !== -1 && cData.toElementId !== -1 &&
                            p.elements[cData.fromElementId] && p.elements[cData.toElementId]) {
                            return {
                                fromElement: p.elements[cData.fromElementId],
                                fromAnchorType: cData.fromAnchorType,
                                toElement: p.elements[cData.toElementId],
                                toAnchorType: cData.toAnchorType
                            };
                        }
                        return null;
                    }).filter(c => c !== null);
                    delete p.connectorsData;
                } else if (!p.connectors) {
                    p.connectors = [];
                }
            });
        } else {
            const firstPage = createNewPage("Page 1");
            currentPageId = firstPage.id;
        }
        redrawCanvas();
        updatePropertiesPanel();
        updatePagesListUI();
    }

    function drawArrowhead(context, fromX, fromY, toX, toY, size) {
        const angle = Math.atan2(toY - fromY, toX - fromX);
        context.save(); context.beginPath(); context.translate(toX, toY); context.rotate(angle);
        context.moveTo(0, 0); context.lineTo(-size, -size / 2); context.lineTo(-size, size / 2);
        context.closePath(); context.fillStyle = CONNECT_LINE_COLOR; context.fill(); context.restore();
    }

    function redrawCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const page = getCurrentPageData();
        if (!page) return;
        page.elements.forEach(el => drawElement(ctx, el));
        page.connectors.forEach(connector => {
            const fromElement = page.elements.find(el => el === connector.fromElement);
            const toElement = page.elements.find(el => el === connector.toElement);
            if (fromElement && toElement) {
                const startCoords = getAnchorCoordinates(fromElement, connector.fromAnchorType);
                const endCoords = getAnchorCoordinates(toElement, connector.toAnchorType);
                if (startCoords && endCoords) {
                    ctx.beginPath(); ctx.moveTo(startCoords.x, startCoords.y); ctx.lineTo(endCoords.x, endCoords.y);
                    ctx.strokeStyle = CONNECT_LINE_COLOR; ctx.lineWidth = CONNECT_LINE_WIDTH; ctx.stroke();
                    drawArrowhead(ctx, startCoords.x, startCoords.y, endCoords.x, endCoords.y, ARROW_SIZE);
                }
            }
        });
    }

    function wrapText(context, text, x, y, maxWidth, lineHeight) {
        const words = text.split(' '); let line = ''; let currentY = y;
        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' '; const metrics = context.measureText(testLine); const testWidth = metrics.width;
            if (testWidth > maxWidth && n > 0) { context.fillText(line, x, currentY); line = words[n] + ' '; currentY += lineHeight; } else { line = testLine; }
        }
        context.fillText(line, x, currentY);
    }

    function drawElement(context, element) {
        const isSelected = element === selectedElement, isPrimedForMove = element === primedElementForMove;
        context.fillStyle = element.color || 'lightblue';
        if (isPrimedForMove) {
            context.save(); context.strokeStyle = 'green'; context.lineWidth = 3;
            Object.assign(context, {shadowColor: 'rgba(0,0,0,0.5)', shadowBlur: 5, shadowOffsetX: 2, shadowOffsetY: 2});
        } else { context.strokeStyle = isSelected ? 'blue' : 'black'; context.lineWidth = isSelected ? 2 : 1; }
        const elX = element.x, elY = element.y;
        const elWidth = element.width || (element.type === 'text' ? (ctx.measureText(element.text || '').width + 10) : 100);
        const elHeight = element.height || (element.type === 'text' ? 20 : (element.type === 'checkbox' ? 20 : 50));
        if (element.type === 'rect' || element.type === 'button') {
            context.fillRect(elX, elY, elWidth, elHeight); context.strokeRect(elX, elY, elWidth, elHeight);
            if (element.type === 'button') {
                const tempFill = context.fillStyle; context.fillStyle = isSelected ? 'blue' : 'black';
                context.font = element.font || `${element.fontSize || 14}px sans-serif`;
                Object.assign(context, {textAlign: 'center', textBaseline: 'middle'});
                context.fillText(element.text || 'Button', elX + elWidth / 2, elY + elHeight / 2);
                context.fillStyle = tempFill;
            }
        } else if (element.type === 'text' || element.type === 'paragraph') {
            const tempFill = context.fillStyle; context.fillStyle = isSelected ? 'blue' : 'black';
            context.font = element.font || `${element.fontSize || (element.type === 'paragraph' ? 14 : 16)}px sans-serif`;
            Object.assign(context, {textAlign: 'left', textBaseline: 'top'});
            const lineHeight = (element.fontSize || (element.type === 'paragraph' ? 14 : 16)) * 1.2;
            if (element.type === 'paragraph') wrapText(context, element.text || 'Paragraph...', elX + 2, elY + 2, elWidth - 4, lineHeight);
            else context.fillText(element.text || 'Text Label', elX, elY);
            context.fillStyle = tempFill;
        } else if (element.type === 'image') {
            context.strokeRect(elX, elY, elWidth, elHeight); context.beginPath();
            context.moveTo(elX, elY); context.lineTo(elX + elWidth, elY + elHeight);
            context.moveTo(elX + elWidth, elY); context.lineTo(elX, elY + elHeight);
            const tempStroke = context.strokeStyle; context.strokeStyle = isSelected ? 'blue' : 'grey'; context.stroke(); context.strokeStyle = tempStroke;
        } else if (element.type === 'checkbox') {
            const boxSize = Math.min(elWidth, elHeight, 20); context.strokeRect(elX, elY, boxSize, boxSize);
            if (element.checked) {
                context.beginPath(); context.moveTo(elX + boxSize*0.2, elY + boxSize*0.5); context.lineTo(elX + boxSize*0.4, elY + boxSize*0.7); context.lineTo(elX + boxSize*0.8, elY + boxSize*0.3);
                const tempStroke = context.strokeStyle; context.strokeStyle = isSelected ? 'blue' : 'black'; context.stroke(); context.strokeStyle = tempStroke;
            }
        }
        if (isPrimedForMove) context.restore();
        if (isSelected && ['rect', 'button', 'image', 'paragraph'].includes(element.type)) {
            const tempFill = context.fillStyle; context.fillStyle = 'blue';
            context.fillRect(elX + elWidth - RESIZE_HANDLE_SIZE / 2, elY + elHeight - RESIZE_HANDLE_SIZE / 2, RESIZE_HANDLE_SIZE, RESIZE_HANDLE_SIZE);
            context.fillStyle = tempFill;
        }
        if (isSelected && !activeTextEditor) {
            const tempFill = context.fillStyle; context.fillStyle = 'red';
            getElementAnchors(element).forEach(anchor => {
                const coords = getAnchorCoordinates(element, anchor.type);
                if(coords) { context.beginPath(); context.arc(coords.x, coords.y, ANCHOR_SIZE / 2, 0, 2 * Math.PI); context.fill(); }
            });
            context.fillStyle = tempFill;
        }

        // Draw link indicator if element is linked
        if (element.linkToPageId && pages.find(p => p.id === element.linkToPageId)) {
            const indicatorSize = 6;
            const padding = 3;
            context.save();
            context.fillStyle = 'purple'; // Or a specific link icon color
            // Draw a small filled circle in the top-right corner as a link indicator
            context.beginPath();
            context.arc(elX + elWidth - indicatorSize/2 - padding, elY + indicatorSize/2 + padding, indicatorSize/2, 0, 2 * Math.PI);
            context.fill();
            context.restore();
        }
    }

    function getElementAnchors(element) { return [ { type: 'top' }, { type: 'bottom' }, { type: 'left' }, { type: 'right' } ]; }
    function getAnchorCoordinates(element, anchorType) {
        if (!element) return null; const elX = element.x, elY = element.y;
        const elWidth = element.width || (element.type === 'text' ? (ctx.measureText(element.text || '').width + 10) : 100);
        const elHeight = element.height || (element.type === 'text' ? 20 : (element.type === 'checkbox' ? 20 : 50));
        switch (anchorType) {
            case 'top': return { x: elX + elWidth / 2, y: elY }; case 'bottom': return { x: elX + elWidth / 2, y: elY + elHeight };
            case 'left': return { x: elX, y: elY + elHeight / 2 }; case 'right': return { x: elX + elWidth, y: elY + elHeight / 2 };
            default: return null;
        }
    }
    elementsList.addEventListener('dragstart', (e) => { if (e.target.tagName==='LI') { draggedElementType = e.target.getAttribute('data-element-type'); e.dataTransfer.setData('text/plain', draggedElementType);}});
    elementsList.addEventListener('dragend', () => { draggedElementType = null;});
    canvas.addEventListener('dragover', (e) => { e.preventDefault();});
    canvas.addEventListener('drop', (e) => {
        e.preventDefault(); if (!draggedElementType) return; const page = getCurrentPageData(); if (!page) return;
        const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        const newEl = {type: draggedElementType, x: x-50, y: y-25, width:100, height:50, text:''};
        switch(draggedElementType){ case 'text': Object.assign(newEl, {text:'Text Label',width:120,height:20,fontSize:16,font:`16px sans-serif`}); break; case 'button': Object.assign(newEl, {text:'Button',fontSize:14,font:`14px sans-serif`}); break; case 'image': Object.assign(newEl, {width:150,height:100}); break; case 'paragraph': Object.assign(newEl, {text:'Paragraph...',width:200,height:80,fontSize:14,font:`14px sans-serif`}); break; case 'checkbox': Object.assign(newEl, {width:20,height:20,checked:false}); break; }
        page.elements.push(newEl); redrawCanvas(); draggedElementType = null;
    });

    function getClickedAnchorInfo(mouseX, mouseY) {
        const page = getCurrentPageData(); if (!page) return null;
        for (const el of page.elements) { for (const anchorDef of getElementAnchors(el)) { const pos = getAnchorCoordinates(el, anchorDef.type); if (pos && Math.sqrt(Math.pow(mouseX-pos.x,2)+Math.pow(mouseY-pos.y,2)) <= ANCHOR_SIZE+2) return {element:el,anchorType:anchorDef.type,x:pos.x,y:pos.y};}} return null;
    }
    canvas.addEventListener('mousedown', (e) => {
        if (activeTextEditor && e.target !== activeTextEditor.textarea) activeTextEditor.textarea.blur();
        const page = getCurrentPageData();
        if (!page) return;

        const r = canvas.getBoundingClientRect(), mouseX = e.clientX-r.left, mouseY = e.clientY-r.top, time = Date.now();

        // Determine if an element was clicked (used for Ctrl+Click link and normal selection)
        let elementUnderMouse = null;
        for (let i = page.elements.length - 1; i >= 0; i--) {
            const el = page.elements[i];
            const elWidth = el.width || (el.type === 'text' ? (ctx.measureText(el.text || '').width + 10) : 100);
            const elHeight = el.height || (el.type === 'text' ? 20 : (el.type === 'checkbox' ? 20 : 50));
            if (mouseX >= el.x && mouseX <= el.x + elWidth && mouseY >= el.y && mouseY <= el.y + elHeight) {
                elementUnderMouse = el;
                break;
            }
        }

        // Ctrl/Meta + Click for Link Navigation
        if ((e.ctrlKey || e.metaKey) && elementUnderMouse && elementUnderMouse.linkToPageId) {
            const targetPageExists = pages.find(p => p.id === elementUnderMouse.linkToPageId);
            if (targetPageExists) {
                currentPageId = elementUnderMouse.linkToPageId;
                selectedElement = null;
                primedElementForMove = null;
                connectorStartPointInfo = null; // Reset connector state too
                if (connectorDrawingMode) { // If in connector mode, turn it off
                    connectorDrawingMode = false;
                    connToolBtn.classList.remove('active');
                    canvas.style.cursor = 'default';
                }
                redrawCanvas();
                updatePropertiesPanel();
                updatePagesListUI();
                console.log(`Navigated via Ctrl/Meta+Click to page ID: ${currentPageId}`);
                e.preventDefault();
                return;
            } else {
                console.warn(`Ctrl/Meta+Click: Link target page ID ${elementUnderMouse.linkToPageId} not found.`);
            }
        }

        // If not Ctrl/Meta+Click navigation, proceed with other interactions
        if (connectorDrawingMode) {
            const anchor = getClickedAnchorInfo(mouseX, mouseY);
            if (anchor) {
                if (!connectorStartPointInfo) connectorStartPointInfo = anchor;
                else {
                    if(!(connectorStartPointInfo.element === anchor.element && connectorStartPointInfo.anchorType === anchor.anchorType)) {
                        page.connectors.push({fromElement:connectorStartPointInfo.element, fromAnchorType:connectorStartPointInfo.anchorType, toElement:anchor.element, toAnchorType:anchor.anchorType});
                    }
                    connectorStartPointInfo = null;
                }
            }
            redrawCanvas(); return;
        }

        if (primedElementForMove) {
            Object.assign(primedElementForMove, {x:mouseX,y:mouseY});
            selectedElement=primedElementForMove;
            primedElementForMove=null;
            redrawCanvas(); updatePropertiesPanel(); lastClickTime=0; lastClickedElement=null; return;
        }

        if (selectedElement && isOverResizeHandle(mouseX,mouseY,selectedElement)) {
            isResizing=true;primedElementForMove=null;return;
        }

        // Standard element selection / priming for move (uses elementUnderMouse found earlier)
        if(elementUnderMouse){
            if(selectedElement===elementUnderMouse&&(time-lastClickTime)<DOUBLE_CLICK_THRESHOLD) {
                primedElementForMove=elementUnderMouse;
            } else {
                if(selectedElement!==elementUnderMouse&&activeTextEditor) activeTextEditor.textarea.blur();
                selectedElement=elementUnderMouse;
                primedElementForMove=null;
            }
            lastClickTime=time;lastClickedElement=elementUnderMouse;
        } else {
            if(activeTextEditor) activeTextEditor.textarea.blur();
            selectedElement=null;primedElementForMove=null;lastClickedElement=null;
        }
        redrawCanvas();updatePropertiesPanel();
    });
    canvas.addEventListener('mousemove',(e)=>{ if(!isResizing)return;const r=canvas.getBoundingClientRect(),mX=e.clientX-r.left,mY=e.clientY-r.top;if(isResizing&&selectedElement){selectedElement.width=Math.max(RESIZE_HANDLE_SIZE*2,mX-selectedElement.x);selectedElement.height=Math.max(RESIZE_HANDLE_SIZE*2,mY-selectedElement.y);redrawCanvas();}});
    canvas.addEventListener('mouseup',()=>{ if(isResizing)isResizing=false;});
    canvas.addEventListener('mouseleave',()=>{ if(isResizing)isResizing=false;});

    let activeTextEditor = null;
    function createInPlaceEditor(el){ if(activeTextEditor)return;const ta=document.createElement('textarea');ta.id='inplace-editor';ta.value=el.text||'';const r=canvas.getBoundingClientRect(),w=el.width||(el.type==='text'?(ctx.measureText(el.text||'').width+20):100),h=el.height||(el.type==='paragraph'?80:(el.type==='text'?20:50));Object.assign(ta.style,{position:'absolute',left:`${r.left+el.x}px`,top:`${r.top+el.y}px`,width:`${w}px`,height:`${h}px`,font:el.font||`${el.fontSize||16}px sans-serif`,margin:'0',padding:'2px',border:'1px solid #007bff',boxSizing:'border-box',resize:'none',overflowWrap:'break-word'});if(el.type==='button')ta.style.textAlign='center';document.body.appendChild(ta);ta.focus();ta.select();activeTextEditor={element:el,textarea:ta};const fin=()=>{if(!activeTextEditor)return;activeTextEditor.element.text=activeTextEditor.textarea.value;document.body.removeChild(activeTextEditor.textarea);activeTextEditor=null;redrawCanvas();};ta.addEventListener('blur',fin);ta.addEventListener('keydown',(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();fin();}else if(e.key==='Escape'){document.body.removeChild(activeTextEditor.textarea);activeTextEditor=null;redrawCanvas();}});}

    canvas.addEventListener('dblclick',(event)=>{
        if (activeTextEditor || connectorDrawingMode) return;
        const page = getCurrentPageData();
        if (!page) return;

        // Dblclick link navigation is PRESERVED as per plan
        if (selectedElement && selectedElement.linkToPageId) {
            const targetPageExists = pages.find(p => p.id === selectedElement.linkToPageId);
            if (targetPageExists) {
                currentPageId = selectedElement.linkToPageId;
                selectedElement = null; primedElementForMove = null; connectorStartPointInfo = null;
                redrawCanvas(); updatePropertiesPanel(); updatePagesListUI();
                console.log(`Navigated via dblclick to page ID: ${currentPageId}`);
                return;
            } else {
                console.warn(`Dblclick link target page ID not found: ${selectedElement.linkToPageId}`);
            }
        }
        if(selectedElement&&['text','button','paragraph'].includes(selectedElement.type))createInPlaceEditor(selectedElement);
        else if(selectedElement&&selectedElement.type==='checkbox'){selectedElement.checked=!selectedElement.checked;redrawCanvas();}
    });

    document.addEventListener('keydown',(e)=>{
        if(activeTextEditor)return; const page = getCurrentPageData(); if (!page) return;
        if(selectedElement){ if(e.key==='Delete'||e.key==='Backspace'){ e.preventDefault(); const idx=page.elements.indexOf(selectedElement); if(idx>-1){ page.elements.splice(idx,1); page.connectors = page.connectors.filter(conn => conn.fromElement !== selectedElement && conn.toElement !== selectedElement); } selectedElement=null;primedElementForMove=null;redrawCanvas();updatePropertiesPanel(); } else if(e.ctrlKey&&e.key.toLowerCase()==='d'){ e.preventDefault();try{const nE=JSON.parse(JSON.stringify(selectedElement));nE.x+=10;nE.y+=10; page.elements.push(nE); primedElementForMove=null;selectedElement=nE; redrawCanvas();updatePropertiesPanel();}catch(err){console.error(err);}} else if(['rect','button','image','paragraph'].includes(selectedElement.type)&&!primedElementForMove){ const s=10;if(e.key==='+'||e.key==='='){selectedElement.width=(selectedElement.width||100)+s;selectedElement.height=(selectedElement.height||50)+s;redrawCanvas();e.preventDefault();}else if(e.key==='-'||e.key==='_'){selectedElement.width=Math.max(20,(selectedElement.width||100)-s);selectedElement.height=Math.max(20,(selectedElement.height||50)-s);redrawCanvas();e.preventDefault();}}}
    });
    const saveBtn=document.getElementById('save-button'),loadBtn=document.getElementById('load-button'),STORAGE_KEY='wireframeApp_MultiPage_v1';
    saveBtn.addEventListener('click',()=>{
        try{ const dataToSave = { pages: pages.map(page => ({ id: page.id, name: page.name, elements: page.elements, connectors: page.connectors.map(c => ({ fromElementId: page.elements.indexOf(c.fromElement), fromAnchorType: c.fromAnchorType, toElementId: page.elements.indexOf(c.toElement), toAnchorType: c.toAnchorType })).filter(c => c.fromElementId !== -1 && c.toElementId !== -1) })), currentPageId: currentPageId, nextPageIdCounter: nextPageIdCounter }; localStorage.setItem(STORAGE_KEY,JSON.stringify(dataToSave));alert('Saved!'); } catch(err){alert('Save failed: ' + err.message); console.error(err);}
    });
    function loadDataFromStorage(silent = false) {
        try{ const dataStr=localStorage.getItem(STORAGE_KEY); if(dataStr){ const data=JSON.parse(dataStr); if (data.pages && Array.isArray(data.pages)) {
            const loadedPages = data.pages.map(pData => { const newP = { id: pData.id, name: pData.name, elements: pData.elements || [], connectorsData: pData.connectors || [], connectors: [] }; return newP; });
            loadedPages.forEach(p => { if (p.connectorsData) { p.connectors = p.connectorsData.map(cData => { if (cData.fromElementId !== -1 && cData.toElementId !== -1 && p.elements[cData.fromElementId] && p.elements[cData.toElementId]) return { fromElement: p.elements[cData.fromElementId], fromAnchorType: cData.fromAnchorType, toElement: p.elements[cData.toElementId], toAnchorType: cData.toAnchorType }; return null; }).filter(c => c !== null); delete p.connectorsData; }});
            return { pages: loadedPages, currentPageId: data.currentPageId, nextPageIdCounter: data.nextPageIdCounter };
        }}catch(err){ if(!silent)alert('Load failed: ' + err.message); console.error(err); } return null;
    }
    loadBtn.addEventListener('click',() => {
        const loadedFullData = loadDataFromStorage(false);
        if (loadedFullData && loadedFullData.pages && loadedFullData.pages.length > 0) {
            pages = loadedFullData.pages;
            currentPageId = loadedFullData.currentPageId || pages[0].id;
            nextPageIdCounter = loadedFullData.nextPageIdCounter || pages.length + 1;
            selectedElement=null; redrawCanvas(); updatePropertiesPanel(); updatePagesListUI(); alert('Loaded!');
        } else if (localStorage.getItem(STORAGE_KEY)) { /* Data existed but parsing or processing failed */ }
        else { alert('No data found.');}
    });
    const propsContent=document.getElementById('properties-content');
    function updatePropertiesPanel(){
        propsContent.innerHTML='';if(!selectedElement){propsContent.innerHTML='<p>Select an element.</p>';return;}
        let html=`<label>Type:</label><p style="margin:0 0 10px 0">${selectedElement.type.charAt(0).toUpperCase()+selectedElement.type.slice(1)}</p>`;
        ['x','y','width','height'].forEach(p=>{if(selectedElement[p]!==undefined)html+=`<label>${p.charAt(0).toUpperCase()+p.slice(1)}:</label><p style="margin:0 0 10px 0">${selectedElement[p]}</p>`;});
        if(['rect','button'].includes(selectedElement.type)){html+=`<label for="el-color">Fill Color:</label><input type="color" id="el-color" value="${selectedElement.color||'#add8e6'}">`;}
        if(['text','button','paragraph'].includes(selectedElement.type)){let fS=parseInt(selectedElement.font,10);if(isNaN(fS))fS=(selectedElement.type==='button'||selectedElement.type==='paragraph')?14:16;selectedElement.fontSize=selectedElement.fontSize||fS;html+=`<label for="el-font-size">Font Size (px):</label><input type="number" id="el-font-size" value="${selectedElement.fontSize}" min="8" max="72">`;}
        const linkableTypes = ['rect', 'button', 'image', 'text', 'paragraph'];
        if (linkableTypes.includes(selectedElement.type)) {
            html += `<label for="element-link-select">Link to Page:</label><select id="element-link-select"><option value="">None</option>`;
            pages.forEach(page => {
                if (page.id !== currentPageId) {
                    html += `<option value="${page.id}" ${selectedElement.linkToPageId === page.id ? 'selected' : ''}>${page.name || `Page ${page.id.split('-')[1]}`}</option>`;
                }
            });
            html += `</select>`;
        }
        propsContent.innerHTML=html;
        const colorInput = propsContent.querySelector('#el-color');
        if(colorInput) colorInput.addEventListener('input',(e)=>{selectedElement.color=e.target.value;redrawCanvas();});
        const fontSizeInput = propsContent.querySelector('#el-font-size');
        if(fontSizeInput) fontSizeInput.addEventListener('input',(e)=>{const nS=parseInt(e.target.value,10);if(!isNaN(nS)&&nS>=8){selectedElement.fontSize=nS;selectedElement.font=`${nS}px sans-serif`;redrawCanvas();}});
        const linkSelect = propsContent.querySelector('#element-link-select');
        if (linkSelect) {
            linkSelect.addEventListener('change', (event) => {
                const targetPageId = event.target.value;
                if (targetPageId) selectedElement.linkToPageId = targetPageId;
                else delete selectedElement.linkToPageId;
            });
        }
    }
    const pagesListUI = document.getElementById('pages-list');
    const addPageButton = document.getElementById('add-page-button');
    function updatePagesListUI() {
        pagesListUI.innerHTML = ''; pages.forEach(page => {
            const pageItem = document.createElement('li');
            pageItem.setAttribute('data-page-id', page.id);
            if (page.id === currentPageId) pageItem.classList.add('active-page');

            const pageNameSpan = document.createElement('span');
            pageNameSpan.textContent = page.name || `Page ${page.id.split('-')[1]}`;
            pageNameSpan.style.cursor = 'pointer';
            pageNameSpan.addEventListener('click', () => {
                if (currentPageId === page.id) return;
                currentPageId = page.id;
                selectedElement = null; primedElementForMove = null; connectorStartPointInfo = null;
                redrawCanvas(); updatePropertiesPanel(); updatePagesListUI();
            });

            const renameButton = document.createElement('button');
            renameButton.textContent = 'Rename';
            renameButton.classList.add('page-action-button');
            renameButton.style.marginLeft = '10px';
            renameButton.style.fontSize = '0.8em';
            renameButton.style.padding = '2px 5px';
            renameButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const newName = prompt(`Enter new name for page "${page.name}":`, page.name);
                if (newName && newName.trim() !== "") {
                    page.name = newName.trim();
                    updatePagesListUI();
                    updatePropertiesPanel();
                }
            });

            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Delete';
            deleteButton.classList.add('page-action-button', 'page-delete-button');
            deleteButton.style.marginLeft = '5px';
            deleteButton.style.fontSize = '0.8em';
            deleteButton.style.padding = '2px 5px';
            deleteButton.style.backgroundColor = '#dc3545'; // Red color for delete
            deleteButton.style.color = 'white';


            if (pages.length <= 1) {
                deleteButton.disabled = true;
                deleteButton.style.opacity = '0.5';
                deleteButton.style.cursor = 'not-allowed';
            } else {
                deleteButton.disabled = false;
                deleteButton.style.opacity = '1';
                deleteButton.style.cursor = 'pointer';
            }

            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                if (pages.length <= 1) return; // Should be caught by disabled state, but double check
                handleDeletePage(page.id, page.name);
            });

            pageItem.appendChild(pageNameSpan);
            pageItem.appendChild(renameButton);
            pageItem.appendChild(deleteButton);
            pagesListUI.appendChild(pageItem);
        });
    }

    function handleDeletePage(pageIdToDelete, pageNameToConfirm) {
        if (!confirm(`Are you sure you want to delete page "${pageNameToConfirm || 'this page'}"? This cannot be undone.`)) {
            return;
        }
        const pageIndex = pages.findIndex(p => p.id === pageIdToDelete);
        if (pageIndex === -1) return;
        pages.splice(pageIndex, 1);
        pages.forEach(p => {
            p.elements.forEach(el => {
                if (el.linkToPageId === pageIdToDelete) delete el.linkToPageId;
            });
        });
        if (currentPageId === pageIdToDelete) {
            if (pages.length > 0) currentPageId = pages[0].id;
            else { const newDefaultPage = createNewPage("Page 1"); currentPageId = newDefaultPage.id; }
            selectedElement = null; primedElementForMove = null; connectorStartPointInfo = null;
        }
        updatePagesListUI(); redrawCanvas(); updatePropertiesPanel();
    }

    addPageButton.addEventListener('click', () => {
        const newPageName = prompt("Enter name for the new page:", `Page ${nextPageIdCounter}`); if (newPageName === null) return; const newPage = createNewPage(newPageName || `Page ${nextPageIdCounter -1}`); currentPageId = newPage.id; selectedElement = null; primedElementForMove = null; connectorStartPointInfo = null; redrawCanvas(); updatePropertiesPanel(); updatePagesListUI();
    });
    const connToolBtn=document.getElementById('connector-tool-button');
    connToolBtn.addEventListener('click',()=>{
        connectorDrawingMode=!connectorDrawingMode;connToolBtn.classList.toggle('active',connectorDrawingMode);if(connectorDrawingMode){selectedElement=null;primedElementForMove=null;redrawCanvas();updatePropertiesPanel();}else connectorStartPointInfo=null;canvas.style.cursor=connectorDrawingMode?'crosshair':'default';});
    const exportPngButton = document.getElementById('export-png-button');
    exportPngButton.addEventListener('click', () => {
        const tempSelected = selectedElement; const tempPrimed = primedElementForMove; const tempConnectorModeActive = connectorDrawingMode; const tempConnectorStart = connectorStartPointInfo;
        selectedElement = null; primedElementForMove = null; connectorDrawingMode = false; connectorStartPointInfo = null;
        redrawCanvas();
        try { const dataURL = canvas.toDataURL('image/png'); const link = document.createElement('a'); link.download = 'wireframe.png'; link.href = dataURL; document.body.appendChild(link); link.click(); document.body.removeChild(link);
        } catch (e) { console.error('Error exporting canvas:', e); alert('Could not export canvas.'); }
        selectedElement = tempSelected; primedElementForMove = tempPrimed; connectorDrawingMode = tempConnectorModeActive; connectorStartPointInfo = tempConnectorStart;
        connToolBtn.classList.toggle('active', connectorDrawingMode); canvas.style.cursor = connectorDrawingMode ? 'crosshair' : 'default';
        redrawCanvas();
    });
    initApp();
    console.log('Wireframing tool script fully loaded (Refined Page Mgmt - Step 2 Delete).');
});
