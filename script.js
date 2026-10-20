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
let pagesText = []; // Guarda el texto extraído de cada página
let currentScale = 1.5; // Escala base para usuarios con baja visión
let currentPageIndex = 0;
let spanishVoice = null;

// Cargar automáticamente 'cuento.pdf' al iniciar
document.addEventListener('DOMContentLoaded', () => {
    initVoices();
    loadPDF('cuento.pdf');
});

// Inicializar y detectar voces de SpeechSynthesis de forma asíncrona
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

// Carga inicial y extracción del texto del PDF
async function loadPDF(pdfUrl) {
    loading.style.display = 'block';
    bookContainer.style.display = 'none';
    pagesText = [];

    try {
        currentPdf = await pdfjsLib.getDocument(pdfUrl).promise;
        const totalPages = currentPdf.numPages;

        // Extraer texto una sola vez para SpeechSynthesis y accesibilidad
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await currentPdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const textItems = textContent.items.map(item => item.str).join(' ');
            pagesText.push(textItems.trim() || `Página ${pageNum} sin texto accesible.`);
        }

        // Renderizar el contenido visual
        await renderBookPages();
        announceToScreenReader('Cuento cargado correctamente.');

    } catch (error) {
        console.error('Error al cargar cuento.pdf:', error);
        loading.innerText = 'Error al cargar "cuento.pdf". Asegúrate de que el archivo exista en la raíz del repositorio.';
        announceToScreenReader('Error al cargar el libro.');
    }
}

// Renderiza los canvas y reinicia St.PageFlip sin re-descargar el PDF
async function renderBookPages() {
    if (!currentPdf) return;

    loading.style.display = 'block';
    bookContainer.style.display = 'none';
    bookContainer.innerHTML = '';

    if (pageFlip) {
        pageFlip.destroy();
        pageFlip = null;
    }

    const totalPages = currentPdf.numPages;
    const firstPage = await currentPdf.getPage(1);
    const viewportInfo = firstPage.getViewport({ scale: currentScale });
    const pageWidth = viewportInfo.width;
    const pageHeight = viewportInfo.height;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await currentPdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: currentScale });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

        const pageDiv = document.createElement('div');
        pageDiv.className = 'page';
        pageDiv.setAttribute('role', 'region');
        pageDiv.setAttribute('aria-label', `Página ${pageNum}`);
        pageDiv.appendChild(canvas);

        bookContainer.appendChild(pageDiv);
    }

    bookContainer.style.display = 'block';

    pageFlip = new St.PageFlip(bookContainer, {
        width: pageWidth,
        height: pageHeight,
        size: "stretch",
        minWidth: 300,
        maxWidth: pageWidth * 1.5,
        minHeight: 400,
        maxHeight: pageHeight * 1.5,
        showCover: true,
        maxShadowOpacity: 0.5,
        usePortrait: true
    });

    const pages = document.querySelectorAll('.page');
    pageFlip.loadFromHTML(pages);

    // Mantiene la posición de la página actual tras redimensionar
    if (currentPageIndex > 0 && currentPageIndex < totalPages) {
        pageFlip.turnToPage(currentPageIndex);
    }

    // Evento al cambiar de página
    pageFlip.on('flip', (e) => {
        currentPageIndex = e.data;
        updatePageUI();
    });

    loading.style.display = 'none';
    updatePageUI();
}

// Actualizar indicador de páginas y anunciar al lector de pantalla
function updatePageUI() {
    const pageNumber = currentPageIndex + 1;
    const totalPages = pagesText.length;
    pageNumDisplay.innerText = `Página ${pageNumber} de ${totalPages}`;
    announceToScreenReader(`Página ${pageNumber} de ${totalPages}`);
}

// --- Controles de Navegación ---
prevBtn.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipPrev();
});

nextBtn.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipNext();
});

// --- Controles de Tamaño de Texto / Zoom (Baja Visión) ---
zoomInBtn.addEventListener('click', () => {
    currentScale += 0.25;
    applyZoom();
});

zoomOutBtn.addEventListener('click', () => {
    if (currentScale > 0.75) {
        currentScale -= 0.25;
        applyZoom();
    }
});

zoomResetBtn.addEventListener('click', () => {
    currentScale = 1.5;
    applyZoom();
});

function applyZoom() {
    stopSpeech();
    renderBookPages();
    announceToScreenReader(`Zoom ajustado al ${Math.round(currentScale * 100)}%`);
}

// --- Lectura en Voz Alta (Text-To-Speech en Español) ---
speakBtn.addEventListener('click', () => {
    stopSpeech(); // Detener cualquier lectura previa

    const textToRead = pagesText[currentPageIndex];
    if (!textToRead || textToRead.trim() === '') {
        announceToScreenReader('No hay texto legible en esta página.');
        return;
    }

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-ES';
    utterance.rate = 0.9;

    if (spanishVoice) {
        utterance.voice = spanishVoice;
    }

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

// --- Lector de Pantalla / Accesibilidad ARIA ---
function announceToScreenReader(message) {
    if (announcer) {
        announcer.textContent = message;
    }
}
