import type { Timestamp } from 'firebase/firestore';

type FechaLike = Date | Timestamp | null | undefined | { seconds: number };

export function aDate(f: FechaLike): Date | null {
  if (!f) return null;
  if (f instanceof Date) return f;
  if (typeof (f as Timestamp).toDate === 'function') return (f as Timestamp).toDate();
  if (typeof (f as { seconds: number }).seconds === 'number') return new Date((f as { seconds: number }).seconds * 1000);
  return null;
}

/** Un mes exacto después (31 ene → 28/29 feb) */
export function sumarUnMes(d: Date): Date {
  const r = new Date(d.getTime());
  const dia = r.getDate();
  r.setMonth(r.getMonth() + 1);
  if (r.getDate() !== dia) r.setDate(0);
  return r;
}

const fmtLargo = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtCorto = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtHora = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function fmtFecha(f: FechaLike, largo = false): string {
  const d = aDate(f);
  if (!d) return '—';
  return (largo ? fmtLargo : fmtCorto).format(d);
}

export function fmtFechaHora(f: FechaLike): string {
  const d = aDate(f);
  return d ? fmtHora.format(d) : '—';
}

export function vencido(f: FechaLike): boolean {
  const d = aDate(f);
  return !!d && d.getTime() <= Date.now();
}

/** Número de semana ISO */
export function semanaISO(d: Date): { anio: number; semana: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((t.getTime() - inicio.getTime()) / 86400000 + 1) / 7);
  return { anio: t.getUTCFullYear(), semana };
}

/** Semanas ISO que tiene un año (52 o 53) */
export function semanasDelAnio(anio: number): number {
  return semanaISO(new Date(anio, 11, 28)).semana;
}

/**
 * Semana "de trabajo" actual: la semana cambia el día y hora configurados.
 * Ej. martes 20:00 → hasta el martes a las 7:59 p.m. se sigue mostrando la semana anterior.
 */
export function semanaActual(cfg: { cambioSemanaDia?: number; cambioSemanaHora?: number }, ahora: Date = new Date()) {
  const dia = Math.min(7, Math.max(1, cfg.cambioSemanaDia || 1));
  const hora = Math.min(23, Math.max(0, cfg.cambioSemanaHora || 0));
  const desfaseMs = ((dia - 1) * 24 + hora) * 3600000;
  return semanaISO(new Date(ahora.getTime() - desfaseMs));
}

export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function idSemana(anio: number, semana: number): string {
  return anio + '-' + (semana < 10 ? '0' : '') + semana;
}
