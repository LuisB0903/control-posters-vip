/** Utilidades de texto: normalización y comparación aproximada de títulos */

export function norm(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const VACIAS = new Set([
  'de', 'la', 'el', 'los', 'las', 'y', 'en', 'del', 'un', 'una', 'a', 'al',
  're', 'estreno', 'reestreno', 'the', 'of', '3d',
]);

function tokens(s: string): string[] {
  return norm(s)
    .split(' ')
    .filter((t) => t && !VACIAS.has(t));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
    }
    const t = prev;
    prev = cur;
    cur = t;
  }
  return prev[b.length];
}

function ratio(a: string, b: string): number {
  const m = Math.max(a.length, b.length);
  return m ? 1 - levenshtein(a, b) / m : 0;
}

/** Similitud 0..1 entre un texto leído (OCR) y un título del inventario */
export function similitud(texto: string, titulo: string): number {
  const na = norm(texto);
  const nb = norm(titulo);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = tokens(texto);
  const tb = tokens(titulo);
  const lev = ratio(na, nb);
  if (!tb.length || !ta.length) return lev;

  // tokens del título que aparecen (exactos o casi) en el texto
  let exactos = 0;
  let parecidos = 0;
  for (const t of tb) {
    if (ta.indexOf(t) >= 0) exactos++;
    else if (ta.some((x) => x.length > 2 && t.length > 2 && ratio(x, t) >= 0.75)) parecidos++;
  }
  const union = new Set(ta.concat(tb)).size;
  const contencion = (exactos + parecidos * 0.85) / tb.length;
  const jaccard = (exactos + parecidos * 0.85) / union;
  return Math.max(lev, contencion * 0.7 + jaccard * 0.3);
}

export const UMBRAL_COINCIDENCIA = 0.72;

export interface Titulable {
  id: string;
  titulo: string;
  tituloOriginal?: string | null;
}

/** Busca la película del inventario que mejor coincide con un texto */
export function mejorCoincidencia<T extends Titulable>(
  texto: string,
  lista: T[],
): { item: T; score: number } | null {
  let mejor: { item: T; score: number } | null = null;
  for (const it of lista) {
    let s = similitud(texto, it.titulo);
    if (it.tituloOriginal) s = Math.max(s, similitud(texto, it.tituloOriginal));
    if (!mejor || s > mejor.score) mejor = { item: it, score: s };
  }
  return mejor && mejor.score >= UMBRAL_COINCIDENCIA ? mejor : null;
}

export function contiene(texto: string, busqueda: string): boolean {
  const q = norm(busqueda);
  return !q || norm(texto).indexOf(q) >= 0;
}
