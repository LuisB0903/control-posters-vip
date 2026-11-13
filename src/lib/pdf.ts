// Se usa la versión "legacy" de PDF.js porque es compatible con navegadores más antiguos.
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.js?url';
import type * as PdfJs from 'pdfjs-dist';

const pdfjsLib = pdfjsLegacy as unknown as typeof PdfJs;
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function abrirPdf(file: File) {
  const data = new Uint8Array(await file.arrayBuffer());
  return pdfjsLib.getDocument({ data }).promise;
}

/** Texto plano de todas las páginas (sirve para PDFs con texto, como el reporte de horarios) */
export async function textoDePdf(file: File): Promise<string> {
  const pdf = await abrirPdf(file);
  let texto = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const pagina = await pdf.getPage(i);
    const contenido = await pagina.getTextContent();
    const partes: string[] = [];
    for (const it of contenido.items as Array<{ str?: string }>) if (typeof it.str === 'string') partes.push(it.str);
    texto += partes.join(' ') + '\n';
  }
  return texto;
}

/** Dibuja una página del PDF en un canvas (para el OCR) */
export async function renderizarPagina(
  pdf: Awaited<ReturnType<typeof abrirPdf>>,
  numero: number,
  escala = 3,
): Promise<HTMLCanvasElement> {
  const pagina = await pdf.getPage(numero);
  const viewport = pagina.getViewport({ scale: escala });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pagina.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}
