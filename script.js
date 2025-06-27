document.addEventListener('DOMContentLoaded', () => {
    const elementsList = document.getElementById('elements-list');
    const canvas = document.getElementById('wireframe-canvas');
    const ctx = canvas.getContext('2d');

    // Basic UI elements definition
    const uiElements = [
        { id: 'button', name: 'Button', type: 'button', defaultWidth: 100, defaultHeight: 40, text: 'Button' },
        { id: 'rectangle', name: 'Rectangle', type: 'rect', defaultWidth: 120, defaultHeight: 70 },
        { id: 'text-label', name: 'Text Label', type: 'text', defaultWidth: 100, defaultHeight: 20, text: 'Text Label' },
        { id: 'image', name: 'Image Placeholder', type: 'image', defaultWidth: 150, defaultHeight: 100 },
        { id: 'paragraph', name: 'Paragraph', type: 'paragraph', defaultWidth: 200, defaultHeight: 80, text: 'Paragraph text...' },
        { id: 'checkbox', name: 'Checkbox', type: 'checkbox', defaultWidth: 20, defaultHeight: 20, checked: false }
    ];

    // Populate sidebar elements
    uiElements.forEach(element => {
        const listItem = document.createElement('li');
        listItem.textContent = element.name;
        listItem.setAttribute('draggable', true);
        listItem.setAttribute('data-element-type', element.type);
        listItem.setAttribute('data-default-width', element.defaultWidth);
        listItem.setAttribute('data-default-height', element.defaultHeight);
        listItem.setAttribute('data-default-text', element.text || '');
         if (element.type === 'checkbox') {
            listItem.setAttribute('data-default-checked', element.checked);
        }
        elementsList.appendChild(listItem);
    });

    canvas.width = 800;
    canvas.height = 600;

    let draggedElementType = null;
    let draggedElementDefaultWidth = 100;
    let draggedElementDefaultHeight = 50;
    let draggedElementDefaultText = '';
    let draggedElementDefaultChecked = false;

    const canvasElements = []; // Simple array for elements on this single canvas

    // --- Drawing Functions ---
    function redrawCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        canvasElements.forEach(el => {
            drawElement(ctx, el);
        });
    }

    function drawElement(context, element) {
        context.fillStyle = element.color || 'lightblue';
        context.strokeStyle = 'black';
        context.lineWidth = 1;

        const elX = element.x;
        const elY = element.y;
        const elWidth = element.width;
        const elHeight = element.height;

        if (element.type === 'rect' || element.type === 'button' || element.type === 'image') {
            context.fillRect(elX, elY, elWidth, elHeight);
            context.strokeRect(elX, elY, elWidth, elHeight);
            if (element.type === 'button' && element.text) {
                context.fillStyle = 'black';
                context.font = '14px sans-serif';
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.fillText(element.text, elX + elWidth / 2, elY + elHeight / 2);
            }
            if (element.type === 'image') { // Simple X for image placeholder
                context.beginPath();
                context.moveTo(elX, elY);
                context.lineTo(elX + elWidth, elY + elHeight);
                context.moveTo(elX + elWidth, elY);
                context.lineTo(elX, elY + elHeight);
                context.strokeStyle = 'grey';
                context.stroke();
            }
        } else if (element.type === 'text' || element.type === 'paragraph') {
            context.fillStyle = 'black';
            context.font = element.font || '16px sans-serif';
            context.textAlign = 'left';
            context.textBaseline = 'top';
            if (element.type === 'paragraph' && element.text) {
                 // Basic wrapText (simplified)
                const words = element.text.split(' '); let line = ''; let currentY = elY + 2; const lineHeight = 18;
                for (let n = 0; n < words.length; n++) {
                    const testLine = line + words[n] + ' '; const metrics = context.measureText(testLine);
                    if (metrics.width > elWidth - 4 && n > 0) { context.fillText(line, elX + 2, currentY); line = words[n] + ' '; currentY += lineHeight; } else { line = testLine; }
                }
                context.fillText(line, elX + 2, currentY);
            } else if (element.text) {
                context.fillText(element.text, elX, elY);
            }
        } else if (element.type === 'checkbox') {
            context.strokeRect(elX, elY, elWidth, elHeight);
            if (element.checked) {
                context.beginPath();
                context.moveTo(elX + elWidth * 0.2, elY + elHeight * 0.5);
                context.lineTo(elX + elWidth * 0.4, elY + elHeight * 0.7);
                context.lineTo(elX + elWidth * 0.8, elY + elHeight * 0.3);
                context.strokeStyle = 'black';
                context.stroke();
            }
        }
    }

    // --- Drag and Drop Event Handlers (Sidebar to Canvas) ---
    elementsList.addEventListener('dragstart', (e) => {
        if (e.target.tagName==='LI') {
            draggedElementType = e.target.getAttribute('data-element-type');
            draggedElementDefaultWidth = parseInt(e.target.getAttribute('data-default-width'), 10);
            draggedElementDefaultHeight = parseInt(e.target.getAttribute('data-default-height'), 10);
            draggedElementDefaultText = e.target.getAttribute('data-default-text');
            if (draggedElementType === 'checkbox') {
                draggedElementDefaultChecked = e.target.getAttribute('data-default-checked') === 'true';
            }
            e.dataTransfer.setData('text/plain', draggedElementType);
        }
    });
    elementsList.addEventListener('dragend', () => {
        draggedElementType = null;
    });
    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!draggedElementType) return;

        const r = canvas.getBoundingClientRect();
        const x = e.clientX - r.left - (draggedElementDefaultWidth / 2); // Adjust to drop center
        const y = e.clientY - r.top - (draggedElementDefaultHeight / 2); // Adjust to drop center

        const newEl = {
            type: draggedElementType,
            x: x,
            y: y,
            width: draggedElementDefaultWidth,
            height: draggedElementDefaultHeight,
            text: draggedElementDefaultText
        };
        if (newEl.type === 'checkbox') {
            newEl.checked = draggedElementDefaultChecked;
        }

        canvasElements.push(newEl);
        redrawCanvas();
        draggedElementType = null;
    });

    redrawCanvas(); // Initial draw
    console.log('Simplified Wireframing tool script loaded. Keyboard shortcuts are disabled.');
});
