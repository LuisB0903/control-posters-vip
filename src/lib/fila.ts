/**
 * Fila de apartados por material.
 * Los primeros que lo apartaron, hasta completar las piezas que hay, quedan "Apartado #N" (en stock).
 * Los demás quedan "En fila #N": se les entrega solo si alguien de antes no lo recibe y gerencia los selecciona.
 */
import type { Apartado, Material } from "../types";

/** Orden de llegada: turno y, si no hay, fecha de creación */
export function ordenLlegada(a: Apartado, b: Apartado): number {
  const ta = typeof a.turno === "number" ? a.turno : Infinity;
  const tb = typeof b.turno === "number" ? b.turno : Infinity;
  if (ta !== tb) return ta - tb;
  const fa = a.creadoEn ? a.creadoEn.seconds : Infinity;
  const fb = b.creadoEn ? b.creadoEn.seconds : Infinity;
  if (fa !== fb) return fa - fb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Orden por fecha en que se apartó (el más antiguo primero), para listas generales */
export function ordenFecha(a: Apartado, b: Apartado): number {
  const fa = a.creadoEn ? a.creadoEn.seconds : Infinity;
  const fb = b.creadoEn ? b.creadoEn.seconds : Infinity;
  if (fa !== fb) return fa - fb;
  return ordenLlegada(a, b);
}

/** Piezas que cuentan para la fila: las que siguen activas y las que ya se entregaron */
export function stockDe(piezas: { estado: string }[]): number {
  return piezas.filter((p) => p.estado === "activa" || p.estado === "entregada")
    .length;
}

export interface Lugar {
  pos: number; // posición entre los que siguen contando (1 = primero)
  enStock: boolean;
  fila: number; // posición en la fila de espera (solo si no está en stock)
}

export function lugarEnFila(pos: number, stock: number): Lugar {
  return { pos, enStock: pos <= stock, fila: pos <= stock ? 0 : pos - stock };
}

/** Posición de cada apartado (que no sea "No entregado") de un material */
export function posicionesDeMaterial(
  apartados: Apartado[],
  m: Material | undefined,
): Map<string, Lugar> {
  const res = new Map<string, Lugar>();
  if (!m) return res;
  const stock = stockDe(m.piezas);
  apartados
    .filter((a) => a.materialId === m.id && a.estado !== "no_entregado")
    .sort(ordenLlegada)
    .forEach((a, i) => res.set(a.id, lugarEnFila(i + 1, stock)));
  return res;
}

/** Posiciones de todos los apartados, de todos los materiales */
export function posicionesTodas(
  apartados: Apartado[],
  materiales: Material[],
): Map<string, Lugar> {
  const res = new Map<string, Lugar>();
  const porMaterial = new Map<string, Apartado[]>();
  apartados.forEach((a) =>
    porMaterial.set(
      a.materialId,
      (porMaterial.get(a.materialId) || []).concat(a),
    ),
  );
  porMaterial.forEach((lista, mid) => {
    const m = materiales.find((x) => x.id === mid);
    posicionesDeMaterial(lista, m).forEach((v, k) => res.set(k, v));
  });
  return res;
}

/** Posición pública: turno menos los turnos anteriores que ya no cuentan */
export function posicionPublica(turno: number, fuera: number[]): number {
  return turno - fuera.filter((t) => t < turno).length;
}

/** Texto corto: "Apartado #2" o "En fila #3" */
export function textoLugar(l: Lugar): string {
  return l.enStock ? "Apartado #" + l.pos : "En fila #" + l.fila;
}
