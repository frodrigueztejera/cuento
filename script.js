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

// Cargar automáticamente 'cuento.pdf' al iniciar
document.addEventListener('DOMContentLoaded', () => {
    loadPDF('cuento.pdf');
});

async function loadPDF(pdfUrl) {
    loading.style.display = 'block';
    bookContainer.style.display = 'none';
    bookContainer.innerHTML = '';
    pagesText = [];

    if (pageFlip) {
        pageFlip.destroy();
        pageFlip = null;
    }

    try {
        currentPdf = await pdfjsLib.getDocument(pdfUrl).promise;
        const totalPages = currentPdf.numPages;

        const firstPage = await currentPdf.getPage(1);
        const viewportInfo = firstPage.getViewport({ scale: currentScale });
        const pageWidth = viewportInfo.width;
        const pageHeight = viewportInfo.height;

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await currentPdf.getPage(pageNum);
            
            // Extraer texto para la lectura en voz alta y para el lector de pantalla
            const textContent = await page.getTextContent();
            const textItems = textContent.items.map(item => item.str).join(' ');
            pagesText.push(textItems || `Página ${pageNum} sin texto accesible.`);

            // Renderizado visual en canvas
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

        // Evento al cambiar de página
        pageFlip.on('flip', (e) => {
            currentPageIndex = e.data;
            updatePageUI();
        });

        loading.style.display = 'none';
        updatePageUI();
        announceToScreenReader('Cuento cargado correctamente.');

    } catch (error) {
        console.error('Error al cargar cuento.pdf:', error);
        loading.innerText = 'Error al cargar "cuento.pdf". Asegúrate de que el archivo exista en la raíz del repositorio.';
        announceToScreenReader('Error al cargar el libro.');
    }
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
    reloadPDFWithNewScale();
});

zoomOutBtn.addEventListener('click', () => {
    if (currentScale > 0.75) {
        currentScale -= 0.25;
        reloadPDFWithNewScale();
    }
});

zoomResetBtn.addEventListener('click', () => {
    currentScale = 1.5;
    reloadPDFWithNewScale();
});

function reloadPDFWithNewScale() {
    stopSpeech();
    loadPDF('cuento.pdf');
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
    utterance.lang = 'es-ES'; // O 'es-MX'
    utterance.rate = 0.9;     // Velocidad ligeramente reducida para mejor comprensión

    // Intentar asignar una voz en español disponible
    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(voice => voice.lang.startsWith('es'));
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
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
}

// --- Lector de Pantalla / Accesibilidad ARIA ---
function announceToScreenReader(message) {
    announcer.textContent = message;
}
