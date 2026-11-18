import type { ConfigGeneral, Ubicacion, ZonaTipo } from "../types";

export const BODEGA: Ubicacion = { tipo: "bodega", sala: null };

const ETIQUETAS: Record<ZonaTipo, string> = {
  bodega: "Bodega",
  taquilla: "Taquilla",
  lobby: "Lobby",
  gerencia: "Gerencia",
  pasillo13: "Pasillo 1-3",
  pasillo410: "Pasillo 4-10",
  sala: "Sala",
};

export function etiquetaUbic(u: Ubicacion | null | undefined): string {
  if (!u) return "—";
  if (u.tipo === "sala") return "Sala " + (u.sala ?? "?");
  return ETIQUETAS[u.tipo] || u.tipo;
}

export function mismaUbic(a: Ubicacion, b: Ubicacion): boolean {
  return a.tipo === b.tipo && (a.tipo !== "sala" || a.sala === b.sala);
}

export function ubicKey(u: Ubicacion): string {
  return u.tipo === "sala" ? "sala:" + u.sala : u.tipo;
}

export function ubicDeKey(k: string): Ubicacion {
  if (k.indexOf("sala:") === 0)
    return { tipo: "sala", sala: parseInt(k.slice(5), 10) };
  return { tipo: k as ZonaTipo, sala: null };
}

export function todasLasSalas(cfg: ConfigGeneral): number[] {
  const s = cfg.pasillo13Salas.concat(cfg.pasillo410Salas);
  return s.filter((n, i) => s.indexOf(n) === i).sort((a, b) => a - b);
}

export function pasilloDeSala(
  cfg: ConfigGeneral,
  sala: number,
): "pasillo13" | "pasillo410" {
  return cfg.pasillo13Salas.indexOf(sala) >= 0 ? "pasillo13" : "pasillo410";
}

export function opcionesUbic(
  cfg: ConfigGeneral,
): { key: string; etiqueta: string }[] {
  const fijas: ZonaTipo[] = [
    "bodega",
    "taquilla",
    "lobby",
    "gerencia",
    "pasillo13",
    "pasillo410",
  ];
  return fijas
    .map((t) => ({ key: t as string, etiqueta: ETIQUETAS[t] }))
    .concat(
      todasLasSalas(cfg).map((n) => ({
        key: "sala:" + n,
        etiqueta: "Sala " + n,
      })),
    );
}

/** Zonas que el sugeridor administra (lo que no se sugiere aquí se regresa a bodega) */
export function zonaGestionada(u: Ubicacion): boolean {
  return (
    u.tipo === "taquilla" ||
    u.tipo === "lobby" ||
    u.tipo === "gerencia" ||
    u.tipo === "pasillo13" ||
    u.tipo === "pasillo410" ||
    u.tipo === "sala"
  );
}

/** Orden para mostrar zonas */
export function ordenZona(u: Ubicacion): number {
  const base: Record<ZonaTipo, number> = {
    taquilla: 0,
    lobby: 1,
    sala: 2,
    pasillo13: 100,
    pasillo410: 101,
    gerencia: 102,
    bodega: 103,
  };
  return base[u.tipo] + (u.tipo === "sala" ? (u.sala || 0) / 100 : 0);
}
