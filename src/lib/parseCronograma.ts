/**
 * Lee el texto (obtenido por OCR) del "Cronograma de Punto de Venta" y separa
 * las listas que importan para pósters y standees.
 */

export interface ListasTexto {
  estrenos: string[];
  prioridadesVip: string[];
  apoyo: string[];
  garantia: string[];
  lobbyPasillos: string[];
  standees: string[];
  banners: string[];
  cajasTaquilla: string[];
}

type Seccion = keyof ListasTexto | null;

function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Detecta si una línea es un encabezado de sección. Devuelve undefined si no lo es. */
function detectarEncabezado(lineaMayus: string, previa: string): Seccion | undefined {
  const l = lineaMayus.replace(/^[^A-Z0-9]+/, '');
  if (l.startsWith('STANDEES BASICOS')) return 'standees';
  if (l.startsWith('SEMANA DE ESTRENOS')) return 'estrenos';
  if (l.indexOf('TAQUILLA O CARTELERA') >= 0) return 'cajasTaquilla';
  if (l.indexOf('LOBBY Y PASILLOS') >= 0) return 'lobbyPasillos';
  if (l.indexOf('APOYO ESPECIAL') >= 0) return 'apoyo';
  if (l.startsWith('GARANTIA CINEPOLIS')) return 'garantia';
  if (l.startsWith('PRIORIDADES')) return 'prioridadesVip';
  if (l.startsWith('CINEPOLIS VIP') && previa.indexOf('PRIORIDADES') >= 0) return 'prioridadesVip';
  if (l === 'BANNERS') return 'banners';
  if (
    l.startsWith('MATERIAL IMPRESO') ||
    l.startsWith('MATERIAL DIGITAL') ||
    l.startsWith('CAJA DE LUZ JUNTO') ||
    /^ESPACIO \d/.test(l) ||
    l.startsWith('POSTERS - PROXIMAMENTE') ||
    l.startsWith('POSTERS PROXIMAMENTE') ||
    l.startsWith('COLOCACION EN CAJAS DE LUZ') ||
    l.startsWith('IMPORTANTE')
  )
    return null;
  return undefined;
}

/** Línea de instrucciones (todo en mayúsculas, varias palabras) */
function esInstruccion(linea: string): boolean {
  const letras = linea.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, '');
  if (letras.length < 3) return true;
  const mayus = letras.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, '').length;
  const palabras = linea.trim().split(/\s+/).length;
  return mayus / letras.length > 0.85 && palabras >= 3;
}

/** Corta fragmentos de encabezados en mayúsculas que el OCR pegó al final (columna vecina) */
function cortarColaMayus(linea: string): { texto: string; cola: string } {
  const toks = linea.split(/\s+/);
  for (let i = 1; i < toks.length; i++) {
    const limpio = toks[i].replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, '');
    if (limpio.length >= 4 && limpio === limpio.toUpperCase()) {
      const resto = toks.slice(i);
      const restoSinMinus = resto.every((t) => t === t.toUpperCase());
      const antesConMinus = toks.slice(0, i).some((t) => t !== t.toUpperCase());
      if (restoSinMinus && antesConMinus) {
        return { texto: toks.slice(0, i).join(' '), cola: resto.join(' ') };
      }
    }
  }
  return { texto: linea, cola: '' };
}

function limpiarItem(linea: string): { texto: string; numero: number | null } {
  let s = linea.trim();
  let numero: number | null = null;
  // "1.Título", "8B.Ramayana", "12 Título", "10. Título"
  const m = s.match(/^(\d{1,2})[A-Za-z]?\s*[.,)]\s*/) || s.match(/^(\d{1,2})\s+(?=[A-Za-zÁÉÍÓÚÑ¿¡])/);
  if (m) {
    numero = parseInt(m[1], 10);
    s = s.slice(m[0].length);
  }
  // viñetas y basura inicial del OCR
  s = s.replace(/^[\s+•*·\-–—|¿?¡!.,'"`~:;]+/, '');
  // basura de un solo carácter al final ("Banco á", "Magnolias W")
  s = s.replace(/\s+[^\s\d]$/, '');
  s = s.replace(/[\s.,;:|]+$/, '');
  return { texto: s.trim(), numero };
}

export function parseCronograma(texto: string): ListasTexto {
  const res: ListasTexto = {
    estrenos: [],
    prioridadesVip: [],
    apoyo: [],
    garantia: [],
    lobbyPasillos: [],
    standees: [],
    banners: [],
    cajasTaquilla: [],
  };
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let seccion: Seccion = null;
  let bannersPendiente = false;
  let ultimoNumero = 0;
  let previaMayus = '';

  for (const original of lineas) {
    const mayus = sinAcentos(original).toUpperCase();
    if (mayus.indexOf('CRONOGRAMA') >= 0 || mayus.indexOf('FILE:') >= 0) {
      previaMayus = mayus;
      continue;
    }

    const enc = detectarEncabezado(mayus, previaMayus);
    previaMayus = mayus;
    if (enc !== undefined) {
      if (enc === 'banners' && seccion === 'standees') {
        // el encabezado BANNERS apareció en la columna derecha: la lista sigue después
        bannersPendiente = true;
        continue;
      }
      seccion = enc;
      ultimoNumero = 0;
      bannersPendiente = false;
      continue;
    }
    if (!seccion) continue;

    const { texto: sinCola, cola } = cortarColaMayus(original);
    if (/BANNERS/i.test(cola)) bannersPendiente = true;
    if (esInstruccion(sinCola)) {
      if (/BANNERS/.test(mayus)) bannersPendiente = true;
      continue;
    }

    const { texto: item, numero } = limpiarItem(sinCola);
    if (!item || item.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '').length < 3) continue;

    // La numeración vuelve a 1 dentro de "standees" → empezó la lista de banners
    if (seccion === 'standees' && bannersPendiente && numero === 1 && ultimoNumero > 1) {
      seccion = 'banners';
      bannersPendiente = false;
    }
    if (numero !== null) ultimoNumero = numero;

    const lista = res[seccion];
    if (lista.indexOf(item) < 0) lista.push(item);
  }
  return res;
}

/** "Cronograma_VIP___SEM_46.pdf" → 46 */
export function semanaDeNombre(nombre: string): number | null {
  const m = nombre.match(/SEM[\s_-]*(\d{1,2})/i);
  return m ? parseInt(m[1], 10) : null;
}
