/// <reference types="vite/client" />

declare module 'pdfjs-dist/legacy/build/pdf';
declare module 'pdfjs-dist/legacy/build/pdf.worker.min.js?url' {
  const url: string;
  export default url;
}
