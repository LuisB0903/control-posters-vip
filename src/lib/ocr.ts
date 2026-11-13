import { createWorker } from 'tesseract.js';
import { abrirPdf, renderizarPagina } from './pdf';

/**
 * Las listas del cronograma vienen como IMÁGENES dentro del PDF,
 * así que se "leen" con OCR (Tesseract, en español) directamente en el navegador.
 * La primera vez descarga el idioma español (~2 MB); después queda en caché.
 */
export async function leerCronograma(
  file: File,
  progreso: (mensaje: string, porcentaje: number) => void,
): Promise<string> {
  progreso('Abriendo PDF…', 0);
  const pdf = await abrirPdf(file);
  const maxPaginas = Math.min(pdf.numPages, 5);
  let paginaActual = 1;

  progreso('Preparando lector de texto (OCR)…', 0.02);
  const worker = await createWorker('spa', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        progreso(
          'Leyendo página ' + paginaActual + ' de ' + maxPaginas + '…',
          (paginaActual - 1 + m.progress) / maxPaginas,
        );
      }
    },
  });

  let texto = '';
  try {
    for (let i = 1; i <= maxPaginas; i++) {
      paginaActual = i;
      progreso('Preparando página ' + i + ' de ' + maxPaginas + '…', (i - 1) / maxPaginas);
      const canvas = await renderizarPagina(pdf, i, 3);
      const { data } = await worker.recognize(canvas);
      texto += '\n' + data.text;
      // Las listas de pósters terminan antes de "MATERIAL DIGITAL"
      if (/LOBBY\s+Y\s+PASILLOS/i.test(texto) && /MATERIAL\s+(IMPRESO|DIGITAL)/i.test(data.text)) break;
    }
  } finally {
    await worker.terminate();
  }
  progreso('Listo', 1);
  return texto;
}
