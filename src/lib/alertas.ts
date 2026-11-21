import type { Material, Pelicula, Categoria, Apartado, Pieza } from '../types';
import { etiquetaUbic } from './ubicaciones';
import { aDate } from './fechas';

export interface AlertaVersion {
  peliculaId: string | null;
  titulo: string;
  categoria: string;
  nueva: number;
  vieja: number;
  lugares: string[];
  materialViejo: Material;
  piezasColocadas: number[];
  imagenUrl: string | null;
}

export interface EstadoVersion {
  /** número de la versión más nueva registrada de esa película y categoría */
  masNueva: number;
  /** este material es de una versión anterior a la más nueva */
  esVieja: boolean;
  /** piezas de versiones más nuevas que están libres en bodega para reemplazar */
  libresNuevas: number;
  /** piezas de este material colocadas fuera de bodega */
  colocadas: Pieza[];
  /** colocadas que SÍ se pueden reemplazar (hay pieza nueva libre para cada una) */
  aCambiar: Pieza[];
}

const activa = (p: Pieza) => p.estado === 'activa';

/**
 * ¿Hay que cambiar este material por una versión más nueva?
 * Solo se pide el cambio si existe una pieza de una versión MAYOR libre en bodega.
 * Dos materiales con el mismo número de versión (distinto arte) no se consideran viejos entre sí.
 * Las piezas nuevas libres se reparten primero a las versiones más viejas.
 */
export function estadoVersion(m: Material, materiales: Material[]): EstadoVersion {
  const vacio: EstadoVersion = { masNueva: m.version, esVieja: false, libresNuevas: 0, colocadas: [], aCambiar: [] };
  if (!m.peliculaId) return vacio;
  const grupo = materiales.filter((x) => x.peliculaId === m.peliculaId && x.categoriaId === m.categoriaId);
  const masNueva = grupo.reduce((a, x) => Math.max(a, x.version), 0);
  const colocadas = m.piezas.filter((p) => activa(p) && p.ubic.tipo !== 'bodega');
  if (m.version >= masNueva) return { ...vacio, masNueva, colocadas };
  const libresNuevas = grupo
    .filter((x) => x.version > m.version)
    .reduce((a, x) => a + x.piezas.filter((p) => activa(p) && p.ubic.tipo === 'bodega').length, 0);
  // piezas colocadas de versiones más viejas que esta (se atienden antes)
  const antes = grupo
    .filter((x) => x.version < m.version)
    .reduce((a, x) => a + x.piezas.filter((p) => activa(p) && p.ubic.tipo !== 'bodega').length, 0);
  const alcanzan = Math.max(0, libresNuevas - antes);
  return { masNueva, esVieja: true, libresNuevas, colocadas, aCambiar: colocadas.slice(0, alcanzan) };
}

/**
 * Para cada material de versión anterior que sigue colocado y que SÍ tiene reemplazo libre
 * en bodega, avisa dónde están las piezas que hay que cambiar.
 */
export function alertasVersiones(materiales: Material[], categorias: Categoria[]): AlertaVersion[] {
  const nombreCat = new Map(categorias.map((c) => [c.id, c.nombre] as [string, string]));
  const res: AlertaVersion[] = [];
  for (const m of materiales) {
    const ev = estadoVersion(m, materiales);
    if (!ev.esVieja || !ev.aCambiar.length) continue;
    const nueva = materiales.find(
      (x) => x.peliculaId === m.peliculaId && x.categoriaId === m.categoriaId && x.version === ev.masNueva,
    );
    res.push({
      peliculaId: m.peliculaId,
      titulo: m.titulo,
      categoria: nombreCat.get(m.categoriaId) || m.categoriaId,
      nueva: ev.masNueva,
      vieja: m.version,
      lugares: ev.aCambiar.map((p) => etiquetaUbic(p.ubic) + ' (pieza #' + p.n + ')'),
      materialViejo: m,
      piezasColocadas: ev.aCambiar.map((p) => p.n),
      imagenUrl: (nueva && nueva.imagenUrl) || m.imagenUrl,
    });
  }
  return res;
}

/** Materiales publicados para cinepolitos cuya fecha ya pasó y aún tienen piezas sin resolver */
export function materialesVencidos(materiales: Material[]): Material[] {
  const ahora = Date.now();
  return materiales.filter((m) => {
    if (!m.cinepolitos) return false;
    const hasta = aDate(m.cinepolitos.hasta);
    return !!hasta && hasta.getTime() <= ahora && m.piezas.some((p) => p.estado === 'activa');
  });
}

export function apartadosPendientes(apartados: Apartado[]): Apartado[] {
  return apartados.filter((a) => a.estado === 'apartado');
}

export function peliculaPorId(peliculas: Pelicula[]): Map<string, Pelicula> {
  return new Map(peliculas.map((p) => [p.id, p] as [string, Pelicula]));
}
