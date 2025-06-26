document.addEventListener('DOMContentLoaded', () => {
    const elementsList = document.getElementById('elements-list');
    const canvas = document.getElementById('wireframe-canvas');
    const ctx = canvas.getContext('2d');

    // Define basic UI elements
    const uiElements = [
        { id: 'button', name: 'Button', type: 'button' },
        { id: 'rectangle', name: 'Rectangle', type: 'rect' },
        { id: 'text-label', name: 'Text Label', type: 'text' }
    ];

    // Populate elements in the sidebar
    uiElements.forEach(element => {
        const listItem = document.createElement('li');
        listItem.textContent = element.name;
        listItem.setAttribute('draggable', true);
        listItem.setAttribute('data-element-type', element.type);
        listItem.setAttribute('id', `el-${element.id}`); // Assign an ID for potential styling or specific dragging
        elementsList.appendChild(listItem);
    });

    // Set initial canvas size (can be made dynamic later)
    canvas.width = 800;
    canvas.height = 600;

    // Simple drawing example (will be replaced by actual element rendering)
    // ctx.fillStyle = '#f0f0f0'; // Initial canvas color set by CSS or below
    // ctx.fillRect(0, 0, canvas.width, canvas.height);


    let draggedElementType = null;
    const canvasElements = []; // To store elements dropped on the canvas

    // --- Drawing Functions ---
    function redrawCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas
        ctx.fillStyle = '#FFFFFF'; // Canvas background
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        canvasElements.forEach(el => {
            drawElement(ctx, el);
        });
    }

    function drawElement(context, element) {
        context.fillStyle = element.color || 'lightblue'; // Default color
        context.strokeStyle = 'black';
        context.lineWidth = 1;

        if (element.type === 'rect' || element.type === 'button') {
            context.fillRect(element.x, element.y, element.width || 100, element.height || 50);
            context.strokeRect(element.x, element.y, element.width || 100, element.height || 50);
            if (element.type === 'button') {
                context.fillStyle = 'black';
                context.font = '14px sans-serif';
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.fillText(element.text || 'Button', element.x + (element.width || 100) / 2, element.y + (element.height || 50) / 2);
            }
        } else if (element.type === 'text') {
            context.fillStyle = 'black';
            context.font = element.font || '16px sans-serif';
            context.textAlign = 'left';
            context.textBaseline = 'top';
            context.fillText(element.text || 'Text Label', element.x, element.y);
        }
    }

    // --- Drag and Drop Event Handlers ---

    // For sidebar elements
    elementsList.addEventListener('dragstart', (event) => {
        if (event.target.tagName === 'LI') {
            draggedElementType = event.target.getAttribute('data-element-type');
            event.dataTransfer.setData('text/plain', draggedElementType); // Required for Firefox
            console.log('Dragging:', draggedElementType);
        }
    });

    elementsList.addEventListener('dragend', () => {
        draggedElementType = null; // Clear after drag operation
    });

    // For canvas area
    canvas.addEventListener('dragover', (event) => {
        event.preventDefault(); // Allow dropping
        // console.log('Dragging over canvas'); // Can be spammy
    });

    canvas.addEventListener('drop', (event) => {
        event.preventDefault();
        if (draggedElementType) {
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            console.log(`Dropping ${draggedElementType} at x:${x}, y:${y}`);

            const newElement = {
                type: draggedElementType,
                x: x - 50, // Offset to center the element roughly under cursor
                y: y - 25,
                width: 100,
                height: 50,
                text: draggedElementType === 'text' ? 'Text Label' : (draggedElementType === 'button' ? 'Button' : '')
            };

            if (draggedElementType === 'text') {
                newElement.width = 120; // Default width for text might be different
                newElement.height = 20; // Default height for text
            }


            canvasElements.push(newElement);
            redrawCanvas();
            draggedElementType = null; // Reset
        }
    });

    // Initial draw
    redrawCanvas();

    // --- Selection and Basic Properties ---
    let selectedElement = null;

    canvas.addEventListener('mousedown', (event) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // Check if an element is clicked
        selectedElement = null; // Deselect previous
        for (let i = canvasElements.length - 1; i >= 0; i--) {
            const el = canvasElements[i];
            const elWidth = el.width || (el.type === 'text' ? (ctx.measureText(el.text || '').width) : 100); // Approximate width for text if not set
            const elHeight = el.height || (el.type === 'text' ? 20 : 50); // Approximate height

            if (mouseX >= el.x && mouseX <= el.x + elWidth &&
                mouseY >= el.y && mouseY <= el.y + elHeight) {
                selectedElement = el;
                console.log('Selected:', selectedElement);
                // Highlight selected element (optional, can be done in drawElement)
                break;
            }
        }
        redrawCanvas(); // Redraw to show selection (if visual feedback is added)
    });

    // Basic text editing for selected text/button elements on double-click
    canvas.addEventListener('dblclick', (event) => {
        if (selectedElement && (selectedElement.type === 'text' || selectedElement.type === 'button')) {
            const newText = prompt(`Enter new text for ${selectedElement.type}:`, selectedElement.text);
            if (newText !== null) {
                selectedElement.text = newText;
                redrawCanvas();
            }
        }
    });

    // Placeholder for resizing logic (more complex, will be basic for now)
    // For a true resize, you'd typically add resize handles and manage drag events on those.
    // A very simple version: if an element is selected, maybe a key press could resize it.
    // This is a very basic example. Proper resize handles are a lot more work.
    // We might also want to add a visual indication of the selected element in drawElement.
    // For example, drawing a border around the selectedElement.
    // Modify drawElement:
    // if (element === selectedElement) {
    //     context.strokeStyle = 'red'; // Or some other highlight color
    //     context.lineWidth = 2;
    // } else {
    //     context.strokeStyle = 'black';
    //     context.lineWidth = 1;
    // }
    // ... then strokeRect ...
    // Remember to reset strokeStyle and lineWidth if you change them.

    document.addEventListener('keydown', (event) => {
        if (selectedElement && (selectedElement.type === 'rect' || selectedElement.type === 'button')) { // Resizing for text might need different logic
            const step = 10; // Resize step
            if (event.key === '+' || event.key === '=') { // Increase size
                selectedElement.width = (selectedElement.width || 100) + step;
                selectedElement.height = (selectedElement.height || 50) + step;
                redrawCanvas();
                event.preventDefault();
            } else if (event.key === '-' || event.key === '_') { // Decrease size
                selectedElement.width = Math.max(20, (selectedElement.width || 100) - step);
                selectedElement.height = Math.max(20, (selectedElement.height || 50) - step);
                redrawCanvas();
                event.preventDefault();
            }
        }
    });

    // --- Save and Load ---
    const saveButton = document.getElementById('save-button');
    const loadButton = document.getElementById('load-button');
    const WIREFRAME_STORAGE_KEY = 'wireframeAppData';

    saveButton.addEventListener('click', () => {
        try {
            const dataToSave = {
                elements: canvasElements,
                // You could add canvas dimensions or other settings here if needed
            };
            localStorage.setItem(WIREFRAME_STORAGE_KEY, JSON.stringify(dataToSave));
            alert('Wireframe saved!');
            console.log('Wireframe saved:', dataToSave);
        } catch (error) {
            console.error('Error saving to local storage:', error);
            alert('Error saving wireframe. Storage might be full or unavailable.');
        }
    });

    loadButton.addEventListener('click', () => {
        loadDataFromStorage();
    });

    function loadDataFromStorage() {
        try {
            const savedData = localStorage.getItem(WIREFRAME_STORAGE_KEY);
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                // Clear existing elements before loading
                canvasElements.length = 0;
                // Push loaded elements into canvasElements
                // It's important to re-assign to canvasElements if it was const, or clear and push.
                // If canvasElements was `let`, you could do `canvasElements = parsedData.elements || [];`
                if (parsedData.elements && Array.isArray(parsedData.elements)) {
                    parsedData.elements.forEach(el => canvasElements.push(el));
                }

                selectedElement = null; // Clear selection
                redrawCanvas();
                alert('Wireframe loaded!');
                console.log('Wireframe loaded:', parsedData);
            } else {
                alert('No saved wireframe found.');
            }
        } catch (error) {
            console.error('Error loading from local storage:', error);
            alert('Error loading wireframe.');
        }
    }

    // Attempt to load data when the script first runs
    loadDataFromStorage();


    console.log('Wireframing tool script loaded with D&D, selection, basic properties, and Save/Load.');
});
