import type { Material, Pelicula, Categoria, Apartado } from "../types";
import { etiquetaUbic } from "./ubicaciones";
import { aDate } from "./fechas";

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

/**
 * Para cada película y categoría: si existe una versión más nueva con piezas activas,
 * avisa dónde están colocadas las piezas de versiones anteriores para cambiarlas.
 */
export function alertasVersiones(
  materiales: Material[],
  categorias: Categoria[],
): AlertaVersion[] {
  const nombreCat = new Map(
    categorias.map((c) => [c.id, c.nombre] as [string, string]),
  );
  const grupos = new Map<string, Material[]>();
  for (const m of materiales) {
    if (!m.peliculaId) continue;
    const k = m.peliculaId + "|" + m.categoriaId;
    const l = grupos.get(k) || [];
    l.push(m);
    grupos.set(k, l);
  }
  const res: AlertaVersion[] = [];
  grupos.forEach((lista) => {
    if (lista.length < 2) return;
    lista.sort((a, b) => b.version - a.version);
    const nueva = lista[0];
    const libresNueva = nueva.piezas.filter(
      (p) => p.estado === "activa",
    ).length;
    if (!libresNueva) return;
    for (const vieja of lista.slice(1)) {
      const colocadas = vieja.piezas.filter(
        (p) => p.estado === "activa" && p.ubic.tipo !== "bodega",
      );
      if (colocadas.length) {
        res.push({
          peliculaId: nueva.peliculaId,
          titulo: nueva.titulo,
          categoria: nombreCat.get(nueva.categoriaId) || nueva.categoriaId,
          nueva: nueva.version,
          vieja: vieja.version,
          lugares: colocadas.map(
            (p) => etiquetaUbic(p.ubic) + " (pieza #" + p.n + ")",
          ),
          materialViejo: vieja,
          piezasColocadas: colocadas.map((p) => p.n),
          imagenUrl: nueva.imagenUrl || vieja.imagenUrl,
        });
      }
    }
  });
  return res;
}

/** Materiales publicados para cinepolitos cuya fecha ya pasó y aún tienen piezas sin resolver */
export function materialesVencidos(materiales: Material[]): Material[] {
  const ahora = Date.now();
  return materiales.filter((m) => {
    if (!m.cinepolitos) return false;
    const hasta = aDate(m.cinepolitos.hasta);
    return (
      !!hasta &&
      hasta.getTime() <= ahora &&
      m.piezas.some((p) => p.estado === "activa")
    );
  });
}

export function apartadosPendientes(apartados: Apartado[]): Apartado[] {
  return apartados.filter((a) => a.estado === "apartado");
}

export function peliculaPorId(peliculas: Pelicula[]): Map<string, Pelicula> {
  return new Map(peliculas.map((p) => [p.id, p] as [string, Pelicula]));
}
