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

export function idSemana(anio: number, semana: number): string {
  return anio + '-' + (semana < 10 ? '0' : '') + semana;
}
