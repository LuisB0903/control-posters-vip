/** Comprime una foto (por ejemplo, tomada con el celular) para guardarla en la base de datos */
export function comprimirImagen(file: File, maxLado = 700, calidad = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error('No se pudo leer la imagen'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen no válido'));
      img.onload = () => {
        const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * escala);
        c.height = Math.round(img.height * escala);
        const ctx = c.getContext('2d');
        if (!ctx) return reject(new Error('No se pudo procesar la imagen'));
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', calidad));
      };
      img.src = String(lector.result);
    };
    lector.readAsDataURL(file);
  });
}

export function descargarCsv(nombre: string, filas: (string | number)[][]) {
  const csv = filas
    .map((f) => f.map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(','))
    .join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

export function errorTexto(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const code = err && err.code ? String(err.code) : '';
  if (code.indexOf('permission-denied') >= 0) return 'No tienes permiso para esta acción.';
  if (code.indexOf('invalid-credential') >= 0 || code.indexOf('wrong-password') >= 0 || code.indexOf('user-not-found') >= 0)
    return 'ID o contraseña incorrectos.';
  if (code.indexOf('email-already-in-use') >= 0) return 'Ese ID de administrador ya existe.';
  if (code.indexOf('weak-password') >= 0) return 'La contraseña debe tener al menos 6 caracteres.';
  if (code.indexOf('too-many-requests') >= 0) return 'Demasiados intentos. Espera unos minutos.';
  if (code.indexOf('unavailable') >= 0 || code.indexOf('network') >= 0) return 'Sin conexión. Revisa tu internet.';
  return err && err.message ? err.message : 'Ocurrió un error inesperado.';
}

export function plural(n: number, uno: string, varios: string): string {
  return n + ' ' + (n === 1 ? uno : varios);
}
