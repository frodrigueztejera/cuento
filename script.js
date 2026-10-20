pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Elementos DOM
const bookContainer = document.getElementById('flip-book');
const loading = document.getElementById('loading');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const zoomResetBtn = document.getElementById('zoom-reset-btn');
const speakBtn = document.getElementById('speak-btn');
const stopBtn = document.getElementById('stop-btn');
const pageNumDisplay = document.getElementById('page-num-display');
const announcer = document.getElementById('screen-reader-announcer');

let pageFlip = null;
let currentPdf = null;
let pagesText = [];
let currentScale = 1.5;
let currentPageIndex = 0;
let spanishVoice = null;
let activeRenderTasks = []; // Para cancelar tareas previas de PDF.js si el usuario cambia zoom rápido

document.addEventListener('DOMContentLoaded', () => {
    initVoices();
    loadPDF('cuento.pdf');
});

function initVoices() {
    if ('speechSynthesis' in window) {
        const updateVoices = () => {
            const voices = window.speechSynthesis.getVoices();
            spanishVoice = voices.find(voice => voice.lang.startsWith('es')) || null;
        };
        window.speechSynthesis.onvoiceschanged = updateVoices;
        updateVoices();
    }
}

// Carga inicial: Extrae el texto e inicia el primer renderizado
async function loadPDF(pdfUrl) {
    loading.style.display = 'block';
    bookContainer.style.display = 'none';
    pagesText = [];

    try {
        currentPdf = await pdfjsLib.getDocument(pdfUrl).promise;
        const totalPages = currentPdf.numPages;

        // Extraer texto en paralelo para mayor rapidez
        const textPromises = [];
        for (let i = 1; i <= totalPages; i++) {
            textPromises.push(
                currentPdf.getPage(i).then(async (page) => {
                    const textContent = await page.getTextContent();
                    return textContent.items.map(item => item.str).join(' ').trim() || `Página ${i} sin texto accesible.`;
                })
            );
        }
        pagesText = await Promise.all(textPromises);

        // Renderizar páginas con el zoom inicial
        await renderAllPagesFast();
        announceToScreenReader('Cuento cargado correctamente.');

    } catch (error) {
        console.error('Error al cargar el PDF:', error);
        loading.innerText = 'Error al cargar el archivo PDF. Asegúrate de que exista en la raíz del proyecto.';
        announceToScreenReader('Error al cargar el libro.');
    }
}

// Recrea los divs y canvas limpios en el DOM para evitar errores tras el destroy() de St.PageFlip
function rebuildBookDOM(totalPages) {
    bookContainer.innerHTML = '';
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page';
        pageDiv.setAttribute('role', 'region');
        pageDiv.setAttribute('aria-label', `Página ${pageNum}`);
        
        const canvas = document.createElement('canvas');
        canvas.id = `pdf-canvas-${pageNum}`;
        pageDiv.appendChild(canvas);
        
        bookContainer.appendChild(pageDiv);
    }
}

// Proceso rápido de zoom / renderizado
async function renderAllPagesFast() {
    if (!currentPdf) return;

    loading.style.display = 'block';

    // 1. Cancelar cualquier renderizado de PDF.js previo que siga en curso
    activeRenderTasks.forEach(task => task && task.cancel && task.cancel());
    activeRenderTasks = [];

    // 2. Destruir la instancia de PageFlip previa si existe
    if (pageFlip) {
        pageFlip.destroy();
        pageFlip = null;
    }

    const totalPages = currentPdf.numPages;

    // 3. Reconstruir los canvas limpios en el DOM (soluciona el bloqueo de carga)
    rebuildBookDOM(totalPages);

    const firstPage = await currentPdf.getPage(1);
    const viewportInfo = firstPage.getViewport({ scale: currentScale });

    // 4. Renderizar INMEDIATAMENTE solo la página que el usuario está viendo actualmente
    const priorityPageNum = currentPageIndex + 1;
    await renderSingleCanvas(priorityPageNum);

    // 5. Inicializar nuevamente St.PageFlip con las nuevas dimensiones de la escala
    bookContainer.style.display = 'block';

    pageFlip = new St.PageFlip(bookContainer, {
        width: viewportInfo.width,
        height: viewportInfo.height,
        size: "stretch",
        minWidth: 300,
        maxWidth: viewportInfo.width * 1.5,
        minHeight: 400,
        maxHeight: viewportInfo.height * 1.5,
        showCover: true,
        maxShadowOpacity: 0.5,
        usePortrait: true
    });

    pageFlip.loadFromHTML(document.querySelectorAll('.page'));

    // Restaurar la página donde estaba el usuario antes del zoom
    if (currentPageIndex > 0 && currentPageIndex < totalPages) {
        pageFlip.turnToPage(currentPageIndex);
    }

    pageFlip.on('flip', (e) => {
        currentPageIndex = e.data;
        updatePageUI();
        // Cargar inmediatamente la nueva página si el usuario pasa de hoja
        renderSingleCanvas(currentPageIndex + 1);
    });

    loading.style.display = 'none';
    updatePageUI();

    // 6. Renderizar en segundo plano el resto de páginas sin congelar la pantalla
    renderRemainingPagesBackground(priorityPageNum, totalPages);
}

// Dibuja individualmente sobre el canvas de una página
async function renderSingleCanvas(pageNum) {
    const canvas = document.getElementById(`pdf-canvas-${pageNum}`);
    if (!canvas) return;

    try {
        const page = await currentPdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: currentScale });
        const context = canvas.getContext('2d');

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderTask = page.render({ canvasContext: context, viewport: viewport });
        activeRenderTasks.push(renderTask);
        await renderTask.promise;
    } catch (err) {
        // Ignorar cancelaciones intencionales al cambiar de zoom rápido
        if (err.name !== 'RenderingCancelledException') {
            console.error(`Error al renderizar la página ${pageNum}:`, err);
        }
    }
}

// Procesa el resto de páginas asíncronamente
function renderRemainingPagesBackground(skipPageNum, totalPages) {
    const queue = [];
    for (let i = 1; i <= totalPages; i++) {
        if (i !== skipPageNum) queue.push(i);
    }

    function processNext() {
        if (queue.length === 0) return;
        const pageNum = queue.shift();
        renderSingleCanvas(pageNum).then(() => {
            if ('requestIdleCallback' in window) {
                requestIdleCallback(processNext);
            } else {
                setTimeout(processNext, 10);
            }
        });
    }

    processNext();
}

function updatePageUI() {
    const pageNumber = currentPageIndex + 1;
    const totalPages = pagesText.length;
    pageNumDisplay.innerText = `Página ${pageNumber} de ${totalPages}`;
    announceToScreenReader(`Página ${pageNumber} de ${totalPages}`);
}

// --- Controles de Navegación ---
prevBtn.addEventListener('click', () => { if (pageFlip) pageFlip.flipPrev(); });
nextBtn.addEventListener('click', () => { if (pageFlip) pageFlip.flipNext(); });

// --- Controles de Zoom ---
zoomInBtn.addEventListener('click', () => {
    currentScale += 0.25;
    applyZoomFast();
});

zoomOutBtn.addEventListener('click', () => {
    if (currentScale > 0.75) {
        currentScale -= 0.25;
        applyZoomFast();
    }
});

zoomResetBtn.addEventListener('click', () => {
    currentScale = 1.5;
    applyZoomFast();
});

function applyZoomFast() {
    stopSpeech();
    renderAllPagesFast();
    announceToScreenReader(`Zoom ajustado al ${Math.round(currentScale * 100)}%`);
}

// --- Lectura en Voz Alta ---
speakBtn.addEventListener('click', () => {
    stopSpeech();
    const textToRead = pagesText[currentPageIndex];
    if (!textToRead || textToRead.trim() === '') {
        announceToScreenReader('No hay texto legible en esta página.');
        return;
    }

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-ES';
    utterance.rate = 0.9;
    if (spanishVoice) utterance.voice = spanishVoice;

    window.speechSynthesis.speak(utterance);
    announceToScreenReader('Iniciando lectura en voz alta.');
});

stopBtn.addEventListener('click', () => {
    stopSpeech();
    announceToScreenReader('Lectura cancelada.');
});

function stopSpeech() {
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
}

function announceToScreenReader(message) {
    if (announcer) announcer.textContent = message;
}
