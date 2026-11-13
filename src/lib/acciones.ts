/**
 * Todas las escrituras a la base de datos pasan por aquí,
 * y cada una deja registro en "movimientos" con el administrador que la hizo.
 */
import {
  collection,
  doc,
  serverTimestamp,
  Timestamp,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  Apartado,
  Categoria,
  ConfigGeneral,
  Empleado,
  Entrega,
  EstadoPelicula,
  EstadoPieza,
  ItemEntrega,
  Material,
  Pelicula,
  Pieza,
  ResultadoSugerencia,
  Semana,
  Ubicacion,
} from '../types';
import { BODEGA, etiquetaUbic } from './ubicaciones';
import { sumarUnMes } from './fechas';

export interface Quien {
  uid: string;
  adminId: string;
  nombre: string;
}

const ESTADOS_PELI: Record<EstadoPelicula, string> = {
  proximamente: 'Próximamente',
  cartelera: 'En cartelera',
  salio: 'Salió de cartelera',
};

export function nombreMaterial(m: { titulo: string; version: number }): string {
  return m.titulo + ' v' + m.version;
}

function log(b: WriteBatch, q: Quien, accion: string, detalle: string) {
  b.set(doc(collection(db, 'movimientos')), {
    fecha: serverTimestamp(),
    adminUid: q.uid,
    adminId: q.adminId,
    adminNombre: q.nombre,
    accion,
    detalle,
  });
}

/** Ejecuta un batch en bloques (Firestore permite 500 operaciones por batch) */
async function enBloques(
  ops: ((b: WriteBatch) => void)[],
  q: Quien,
  accion: string,
  detalle: string,
) {
  const TAM = 400;
  for (let i = 0; i < ops.length || i === 0; i += TAM) {
    const b = writeBatch(db);
    ops.slice(i, i + TAM).forEach((f) => f(b));
    if (i === 0) log(b, q, accion, detalle);
    await b.commit();
    if (!ops.length) break;
  }
}

export async function registrarMovimiento(q: Quien, accion: string, detalle: string) {
  const b = writeBatch(db);
  log(b, q, accion, detalle);
  await b.commit();
}

/* ════════════ PELÍCULAS ════════════ */

export interface DatosPeliculaNueva {
  titulo: string;
  tituloOriginal: string | null;
  tmdbId: number | null;
  fechaEstreno: string | null;
  posterUrl: string | null;
  estado: EstadoPelicula;
}

export async function crearMaterial(
  q: Quien,
  datos: {
    peliculaExistente: Pelicula | null;
    peliculaNueva: DatosPeliculaNueva | null;
    tituloLibre: string;
    categoria: Categoria;
    version: number;
    imagenUrl: string | null;
    cantidad: number;
    ubic: Ubicacion;
    notas: string;
  },
): Promise<{ materialId: string; peliculaId: string | null }> {
  const b = writeBatch(db);
  let peliculaId: string | null = null;
  let titulo = datos.tituloLibre.trim();
  if (datos.peliculaExistente) {
    peliculaId = datos.peliculaExistente.id;
    titulo = datos.peliculaExistente.titulo;
  } else if (datos.peliculaNueva) {
    const ref = doc(collection(db, 'peliculas'));
    peliculaId = ref.id;
    titulo = datos.peliculaNueva.titulo.trim();
    b.set(ref, {
      titulo,
      tituloOriginal: datos.peliculaNueva.tituloOriginal,
      tmdbId: datos.peliculaNueva.tmdbId,
      fechaEstreno: datos.peliculaNueva.fechaEstreno,
      posterUrl: datos.peliculaNueva.posterUrl,
      estado: datos.peliculaNueva.estado,
      taquillera: false,
      salioEn: null,
      creadoEn: serverTimestamp(),
    });
  }
  const mref = doc(collection(db, 'materiales'));
  const piezas: Pieza[] = [];
  for (let i = 1; i <= datos.cantidad; i++) piezas.push({ n: i, ubic: datos.ubic, estado: 'activa', entregadaA: null });
  b.set(mref, {
    peliculaId,
    titulo,
    categoriaId: datos.categoria.id,
    version: datos.version,
    imagenUrl: datos.imagenUrl,
    piezas,
    cinepolitos: null,
    notas: datos.notas,
    creadoEn: serverTimestamp(),
    creadoPor: q.nombre,
  });
  log(
    b,
    q,
    'Registro de material',
    datos.categoria.nombre + ': ' + titulo + ' v' + datos.version + ' · ' + datos.cantidad + ' pieza(s) en ' + etiquetaUbic(datos.ubic),
  );
  await b.commit();
  return { materialId: mref.id, peliculaId };
}

export async function actualizarPelicula(q: Quien, p: Pelicula, cambios: Partial<Pelicula>, detalle: string) {
  const b = writeBatch(db);
  const limpio: Record<string, unknown> = {};
  Object.keys(cambios).forEach((k) => {
    if (k !== 'id') limpio[k] = (cambios as Record<string, unknown>)[k];
  });
  b.update(doc(db, 'peliculas', p.id), limpio);
  log(b, q, 'Película actualizada', p.titulo + ': ' + detalle);
  await b.commit();
}

/**
 * Cambia el estado de una película. Si pasa a "Salió de cartelera", todos sus materiales
 * se publican para los cinepolitos durante 1 mes exacto.
 */
export async function cambiarEstadoPelicula(
  q: Quien,
  p: Pelicula,
  estado: EstadoPelicula,
  materialesDePelicula: Material[],
) {
  const b = writeBatch(db);
  const cambios: Record<string, unknown> = { estado };
  if (estado === 'salio') {
    const desde = new Date();
    const hasta = sumarUnMes(desde);
    cambios.salioEn = Timestamp.fromDate(desde);
    materialesDePelicula
      .filter((m) => m.piezas.some((x) => x.estado === 'activa'))
      .forEach((m) =>
        b.update(doc(db, 'materiales', m.id), {
          cinepolitos: { activo: true, desde: Timestamp.fromDate(desde), hasta: Timestamp.fromDate(hasta) },
        }),
      );
  } else if (p.estado === 'salio') {
    cambios.salioEn = null;
    materialesDePelicula.forEach((m) => b.update(doc(db, 'materiales', m.id), { cinepolitos: null }));
  }
  b.update(doc(db, 'peliculas', p.id), cambios);
  log(b, q, 'Estado de película', p.titulo + ': ' + ESTADOS_PELI[p.estado] + ' → ' + ESTADOS_PELI[estado]);
  await b.commit();
}

export async function eliminarPelicula(q: Quien, p: Pelicula) {
  const b = writeBatch(db);
  b.delete(doc(db, 'peliculas', p.id));
  log(b, q, 'Película eliminada', p.titulo);
  await b.commit();
}

/* ════════════ MATERIALES Y PIEZAS ════════════ */

export async function moverPieza(q: Quien, m: Material, n: number, ubic: Ubicacion) {
  const anterior = m.piezas.find((p) => p.n === n);
  const piezas = m.piezas.map((p) => (p.n === n ? { ...p, ubic } : p));
  const b = writeBatch(db);
  b.update(doc(db, 'materiales', m.id), { piezas });
  log(b, q, 'Movimiento de pieza', nombreMaterial(m) + ' #' + n + ': ' + etiquetaUbic(anterior ? anterior.ubic : null) + ' → ' + etiquetaUbic(ubic));
  await b.commit();
}

export async function cambiarEstadoPieza(q: Quien, m: Material, n: number, estado: EstadoPieza) {
  const piezas = m.piezas.map((p) =>
    p.n === n ? { ...p, estado, ubic: estado === 'activa' ? p.ubic : BODEGA, entregadaA: estado === 'activa' ? null : p.entregadaA } : p,
  );
  const b = writeBatch(db);
  b.update(doc(db, 'materiales', m.id), { piezas });
  log(b, q, 'Estado de pieza', nombreMaterial(m) + ' #' + n + ' → ' + estado);
  await b.commit();
}

export async function agregarPiezas(q: Quien, m: Material, cantidad: number, ubic: Ubicacion) {
  const max = m.piezas.reduce((a, p) => Math.max(a, p.n), 0);
  const nuevas: Pieza[] = [];
  for (let i = 1; i <= cantidad; i++) nuevas.push({ n: max + i, ubic, estado: 'activa', entregadaA: null });
  const b = writeBatch(db);
  b.update(doc(db, 'materiales', m.id), { piezas: m.piezas.concat(nuevas) });
  log(b, q, 'Piezas agregadas', nombreMaterial(m) + ': +' + cantidad + ' en ' + etiquetaUbic(ubic));
  await b.commit();
}

export async function quitarPieza(q: Quien, m: Material, n: number) {
  const b = writeBatch(db);
  b.update(doc(db, 'materiales', m.id), { piezas: m.piezas.filter((p) => p.n !== n) });
  log(b, q, 'Pieza eliminada', nombreMaterial(m) + ' #' + n + ' (registro por error)');
  await b.commit();
}

export async function editarMaterial(
  q: Quien,
  m: Material,
  cambios: { version?: number; imagenUrl?: string | null; notas?: string; categoriaId?: string; titulo?: string },
) {
  const b = writeBatch(db);
  b.update(doc(db, 'materiales', m.id), cambios as Record<string, unknown>);
  log(b, q, 'Material editado', nombreMaterial(m) + ': ' + Object.keys(cambios).join(', '));
  await b.commit();
}

export async function eliminarMaterial(q: Quien, m: Material) {
  const b = writeBatch(db);
  b.delete(doc(db, 'materiales', m.id));
  log(b, q, 'Material eliminado', nombreMaterial(m));
  await b.commit();
}

export async function publicarParaCinepolitos(q: Quien, m: Material, activo: boolean) {
  const b = writeBatch(db);
  if (activo) {
    const desde = new Date();
    b.update(doc(db, 'materiales', m.id), {
      cinepolitos: { activo: true, desde: Timestamp.fromDate(desde), hasta: Timestamp.fromDate(sumarUnMes(desde)) },
    });
  } else {
    b.update(doc(db, 'materiales', m.id), { 'cinepolitos.activo': false });
  }
  log(b, q, activo ? 'Publicado para cinepolitos' : 'Retirado de cinepolitos', nombreMaterial(m));
  await b.commit();
}

/* ════════════ SEMANAS / SUGERIDOR ════════════ */

export async function guardarSemana(q: Quien, s: Omit<Semana, 'actualizadoEn' | 'aplicadaEn'>, mensaje: string) {
  const b = writeBatch(db);
  const { id, ...resto } = s;
  b.set(doc(db, 'semanas', id), { ...resto, actualizadoEn: serverTimestamp() }, { merge: true });
  log(b, q, 'Semana guardada', 'Semana ' + s.semana + ' de ' + s.anio + ': ' + mensaje);
  await b.commit();
}

/** Aplica la sugerencia: actualiza la ubicación de cada pieza y guarda la semana */
export async function aplicarSugerencia(
  q: Quien,
  s: Omit<Semana, 'actualizadoEn' | 'aplicadaEn'>,
  resultado: ResultadoSugerencia,
  materiales: Material[],
) {
  const porMaterial = new Map<string, Map<number, Ubicacion>>();
  for (const mv of resultado.movimientos) {
    const mm = porMaterial.get(mv.materialId) || new Map<number, Ubicacion>();
    mm.set(mv.piezaN, mv.hacia);
    porMaterial.set(mv.materialId, mm);
  }
  const ops: ((b: WriteBatch) => void)[] = [];
  porMaterial.forEach((cambios, materialId) => {
    const m = materiales.find((x) => x.id === materialId);
    if (!m) return;
    const piezas = m.piezas.map((p) => (p.estado === 'activa' && cambios.has(p.n) ? { ...p, ubic: cambios.get(p.n)! } : p));
    ops.push((b) => b.update(doc(db, 'materiales', m.id), { piezas }));
  });
  const { id, ...resto } = s;
  ops.push((b) =>
    b.set(doc(db, 'semanas', id), {
      ...resto,
      estado: 'aplicada',
      resultado,
      aplicadaPor: q.nombre,
      aplicadaEn: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
    }),
  );
  await enBloques(
    ops,
    q,
    'Sugerencia aplicada',
    'Semana ' + s.semana + ' de ' + s.anio + ': ' + resultado.movimientos.length + ' movimiento(s) de piezas',
  );
}

export async function marcarEnCartelera(q: Quien, peliculas: Pelicula[]) {
  if (!peliculas.length) return;
  const b = writeBatch(db);
  peliculas.forEach((p) => b.update(doc(db, 'peliculas', p.id), { estado: 'cartelera' }));
  log(b, q, 'Estado de película', peliculas.map((p) => p.titulo).join(', ') + ' → En cartelera');
  await b.commit();
}

/* ════════════ CINEPOLITOS: ENTREGAS ════════════ */

export async function entregarPosters(
  q: Quien,
  cfg: ConfigGeneral,
  empleado: { id: string; nombre: string },
  apartados: Apartado[],
  materiales: Material[],
  categorias: Categoria[],
): Promise<Omit<Entrega, 'fecha'> & { fecha: Date }> {
  const b = writeBatch(db);
  const items: ItemEntrega[] = [];
  const nombreCat = (id: string) => (categorias.find((c) => c.id === id) || { nombre: id }).nombre;
  const piezasLocales = new Map<string, Material['piezas']>();
  for (const a of apartados) {
    const m = materiales.find((x) => x.id === a.materialId);
    if (!m) throw new Error('No se encontró el material de "' + a.titulo + '"');
    const actuales = piezasLocales.get(m.id) || m.piezas;
    // pieza disponible: primero bodega
    const libres = actuales
      .filter((p) => p.estado === 'activa')
      .sort((x, y) => Number(y.ubic.tipo === 'bodega') - Number(x.ubic.tipo === 'bodega'));
    if (!libres.length) throw new Error('Ya no quedan piezas de "' + nombreMaterial(m) + '"');
    const pieza = libres[0];
    const piezas: Material['piezas'] = actuales.map((p) =>
      p.n === pieza.n ? { ...p, estado: 'entregada' as const, ubic: BODEGA, entregadaA: empleado.id } : p,
    );
    piezasLocales.set(m.id, piezas);
    b.update(doc(db, 'materiales', m.id), { piezas });
    b.update(doc(db, 'apartados', a.id), { estado: 'entregado' });
    items.push({ materialId: m.id, titulo: m.titulo, version: m.version, categoria: nombreCat(m.categoriaId), piezaN: pieza.n });
  }
  const ref = doc(collection(db, 'entregas'));
  const entrega = {
    empleadoId: empleado.id,
    empleadoNombre: empleado.nombre,
    items,
    adminId: q.adminId,
    adminNombre: q.nombre,
    conjunto: cfg.conjunto,
    gerenteNombre: cfg.gerenteNombre,
    gerenteCargo: cfg.gerenteCargo,
  };
  b.set(ref, { ...entrega, fecha: serverTimestamp() });
  log(b, q, 'Entrega a cinepolito', empleado.id + ' ' + empleado.nombre + ': ' + items.map(nombreMaterial).join(', '));
  await b.commit();
  return { id: ref.id, ...entrega, fecha: new Date() };
}

/** Desecha las piezas que quedan de un material y cierra sus apartados pendientes */
export async function desecharRestantes(q: Quien, m: Material, apartadosPendientes: Apartado[]) {
  const b = writeBatch(db);
  const piezas = m.piezas.map((p) => (p.estado === 'activa' ? { ...p, estado: 'desechada', ubic: BODEGA } : p));
  const cuantas = m.piezas.filter((p) => p.estado === 'activa').length;
  b.update(doc(db, 'materiales', m.id), {
    piezas,
    'cinepolitos.activo': false,
  });
  apartadosPendientes.forEach((a) => b.update(doc(db, 'apartados', a.id), { estado: 'no_entregado' }));
  log(b, q, 'Material desechado', nombreMaterial(m) + ': ' + cuantas + ' pieza(s) desechada(s), ' + apartadosPendientes.length + ' apartado(s) sin entregar');
  await b.commit();
}

export async function cambiarEstadoApartado(q: Quien, a: Apartado, estado: Apartado['estado']) {
  const b = writeBatch(db);
  b.update(doc(db, 'apartados', a.id), { estado });
  log(b, q, 'Apartado actualizado', a.empleadoId + ' · ' + a.titulo + ' v' + a.version + ' → ' + estado);
  await b.commit();
}

/* ════════════ EMPLEADOS ════════════ */

export async function importarEmpleados(
  q: Quien,
  nuevos: { id: string; nombre: string }[],
  desactivar: Empleado[],
) {
  const ops: ((b: WriteBatch) => void)[] = [];
  nuevos.forEach((e) => ops.push((b) => b.set(doc(db, 'empleados', e.id), { nombre: e.nombre, activo: true })));
  desactivar.forEach((e) => ops.push((b) => b.update(doc(db, 'empleados', e.id), { activo: false })));
  await enBloques(ops, q, 'Empleados importados', nuevos.length + ' importado(s), ' + desactivar.length + ' desactivado(s)');
}

export async function guardarEmpleado(q: Quien, e: Empleado, nuevo: boolean) {
  const b = writeBatch(db);
  b.set(doc(db, 'empleados', e.id), { nombre: e.nombre.trim().toUpperCase(), activo: e.activo });
  log(b, q, nuevo ? 'Empleado agregado' : 'Empleado editado', e.id + ' ' + e.nombre + (e.activo ? '' : ' (inactivo)'));
  await b.commit();
}

/* ════════════ CONFIGURACIÓN ════════════ */

export async function guardarConfig(q: Quien, cfg: ConfigGeneral, detalle: string) {
  const b = writeBatch(db);
  b.set(doc(db, 'config', 'general'), cfg);
  log(b, q, 'Configuración', detalle);
  await b.commit();
}

export async function guardarCategorias(q: Quien, lista: Categoria[]) {
  const b = writeBatch(db);
  b.set(doc(db, 'config', 'categorias'), { lista });
  log(b, q, 'Categorías de material', lista.map((c) => c.nombre).join(', '));
  await b.commit();
}

export async function cambiarAdminActivo(q: Quien, uid: string, adminId: string, activo: boolean) {
  const b = writeBatch(db);
  b.update(doc(db, 'admins', uid), { activo });
  log(b, q, activo ? 'Administrador activado' : 'Administrador desactivado', adminId);
  await b.commit();
}
