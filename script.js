// Configuramos la ruta del worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Elementos del DOM
const bookContainer = document.getElementById('flip-book');
const loading = document.getElementById('loading');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const readAloudBtn = document.getElementById('read-aloud-btn');
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const announcer = document.getElementById('screen-reader-announcer');

let pageFlip = null;
let currentZoom = 1.0;
let pdfTextContent = []; // Almacena el texto extraído de las páginas para síntesis de voz

// Nombre del archivo alojado en la raíz del repositorio
const PDF_URL = './cuento.pdf';

// Función para anunciar mensajes al lector de pantalla
function announce(message) {
    if (announcer) {
        announcer.textContent = message;
    }
}

// Cargar automáticamente cuento.pdf al iniciar la página
document.addEventListener('DOMContentLoaded', () => {
    announce("Iniciando carga del cuento...");
    loadPDF(PDF_URL);
});

async function loadPDF(url) {
    loading.style.display = 'block';
    bookContainer.style.display = 'none';
    bookContainer.innerHTML = '';
    pdfTextContent = [];

    if (pageFlip) {
        pageFlip.destroy();
        pageFlip = null;
    }

    try {
        // Carga del archivo cuento.pdf desde el repositorio
        const pdf = await pdfjsLib.getDocument(url).promise;
        const totalPages = pdf.numPages;
        
        const firstPage = await pdf.getPage(1);
        const viewportInfo = firstPage.getViewport({ scale: 1.5 });
        const pageWidth = viewportInfo.width;
        const pageHeight = viewportInfo.height;

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            
            // Extraer texto para la voz en alto / accesibilidad
            const textPageContent = await page.getTextContent();
            const pageText = textPageContent.items.map(item => item.str).join(' ');
            pdfTextContent.push(pageText);

            // Renderizar canvas
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            
            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.appendChild(canvas);
            
            bookContainer.appendChild(pageDiv);
        }

        bookContainer.style.display = 'block';
        
        // Inicializar PageFlip
        pageFlip = new St.PageFlip(bookContainer, {
            width: pageWidth,
            height: pageHeight,
            size: "stretch",
            minWidth: 315,
            maxWidth: pageWidth,
            minHeight: 420,
            maxHeight: pageHeight,
            showCover: true,
            maxShadowOpacity: 0.5,
            usePortrait: true
        });

        const pages = document.querySelectorAll('.page');
        pageFlip.loadFromHTML(pages);
        
        // Notificar cambios de página al lector de pantalla
        pageFlip.on('flip', (e) => {
            const pageNum = e.data + 1;
            announce(`Página ${pageNum} de ${totalPages}`);
        });

        loading.style.display = 'none';
        announce("El cuento ha finalizado de cargarse con éxito.");
        
    } catch (error) {
        console.error('Error al cargar el PDF:', error);
        loading.innerText = 'Error al cargar el cuento. Asegúrate de tener el archivo "cuento.pdf" en el repositorio.';
        announce("Ocurrió un error al cargar el cuento.");
    }
}

// -------------------------------------------------------------
// NAVEGACIÓN (Página anterior / Siguiente)
// -------------------------------------------------------------
prevBtn.addEventListener('click', () => {
    if (pageFlip) {
        pageFlip.flipPrev();
    }
});

nextBtn.addEventListener('click', () => {
    if (pageFlip) {
        pageFlip.flipNext();
    }
});

// -------------------------------------------------------------
// LECTURA EN VOZ ALTA (Text-To-Speech en Español)
// -------------------------------------------------------------
readAloudBtn.addEventListener('click', () => {
    if (!('speechSynthesis' in window)) {
        alert("Tu navegador no soporta la lectura en voz alta.");
        return;
    }

    // Cancelar si ya hay una lectura en curso
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        readAloudBtn.innerText = "🔊 Leer en voz alta";
        announce("Lectura en voz alta pausada.");
        return;
    }

    if (!pageFlip) return;

    const currentPageIndex = pageFlip.getCurrentPageIndex();
    const textToRead = pdfTextContent[currentPageIndex];

    if (!textToRead || textToRead.trim() === '') {
        announce("No hay texto para leer en esta página.");
        return;
    }

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-ES'; // Configuración de idioma español
    utterance.rate = 0.9;      // Velocidad ligeramente moderada para mejor comprensión

    utterance.onstart = () => {
        readAloudBtn.innerText = "⏹️ Detener Lectura";
        announce(`Iniciando lectura en voz alta de la página ${currentPageIndex + 1}`);
    };

    utterance.onend = () => {
        readAloudBtn.innerText = "🔊 Leer en voz alta";
        announce("Lectura finalizada.");
    };

    window.speechSynthesis.speak(utterance);
});

// -------------------------------------------------------------
// AGRANDAR / ACHICAR TEXTO E INTERFAZ
// -------------------------------------------------------------
zoomInBtn.addEventListener('click', () => {
    if (currentZoom < 1.6) {
        currentZoom += 0.15;
        document.documentElement.style.setProperty('--zoom-factor', currentZoom);
        announce("Tamaño de texto e interfaz aumentado.");
    }
});

zoomOutBtn.addEventListener('click', () => {
    if (currentZoom > 0.8) {
        currentZoom -= 0.15;
        document.documentElement.style.setProperty('--zoom-factor', currentZoom);
        announce("Tamaño de texto e interfaz disminuido.");
    }
});
