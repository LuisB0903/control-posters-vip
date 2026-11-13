/**
 * Lee el reporte semanal de horarios (PDF del sistema) y obtiene ID + nombre.
 * Cada empleado aparece como "244689 LEAL IÑIGUEZ NAYELI TERESA 08:30 AM - …"
 */
export interface EmpleadoLeido {
  id: string;
  nombre: string;
}

const PARADAS =
  '\\d{1,2}:\\d{2}\\s*[AP]\\.?\\s*M|\\b\\d{6}\\b|DESCANSO|VACACIONES|INCAPACIDAD|FALTA|PERMISO|BAJA|\\d{4}-\\d{2}-\\d{2}|PS\\s+Nombre|$';

export function parseEmpleados(texto: string): EmpleadoLeido[] {
  const plano = texto.replace(/\s+/g, ' ');
  const re = new RegExp(
    '\\b(\\d{6})\\s+([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ.\' -]*?)\\s*(?=' + PARADAS + ')',
    'g',
  );
  const vistos = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(plano))) {
    const id = m[1];
    const nombre = m[2].replace(/\s+/g, ' ').trim();
    if (nombre.split(' ').length >= 2 && !vistos.has(id)) vistos.set(id, nombre);
  }
  return Array.from(vistos.entries()).map(([id, nombre]) => ({ id, nombre }));
}
