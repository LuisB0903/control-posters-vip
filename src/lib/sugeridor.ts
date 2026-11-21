/**
 * Motor de sugerencias de colocación semanal.
 *
 * Orden de llenado:
 *  1. Taquilla (4): estrenos del cronograma en orden; si no hay póster → siguiente.
 *     Si no se completan, se rellena con películas marcadas como "taquilleras" que siguen en cartelera.
 *  2. Salas: sala exclusiva → póster de su película (aunque se repita en varias salas del mismo
 *     pasillo, mientras alcancen las piezas). Sala compartida → póster de la otra película.
 *     Sin póster → publicidad del cine.
 *  3. Zonas vigiladas, Lobby (2) y Gerencia (2): primero los pósters "propensos a robo", luego las
 *     películas próximas con mayor prioridad. Gerencia está físicamente en un pasillo (por defecto 1-3),
 *     así que cuenta para la regla de no repetir en ese pasillo. Los pósters propensos a robo no van a pasillos.
 *  4. Pasillos: películas próximas (no estrenadas ni en transmisión esta semana).
 *     Nunca se repite el mismo póster (ni otra versión de la misma película) en el mismo pasillo.
 *     Con "no repetir en ningún pasillo": primero publicidad del cine y, si aún falta, se repite
 *     pero siempre en pasillos distintos.
 *  5. Standees: grandes → taquilla (solo los del cronograma). Chicos → taquilla y el resto al lobby.
 */
import type {
  Asignacion,
  Categoria,
  ConfigGeneral,
  ItemLista,
  ListasSemana,
  Material,
  MovimientoSugerido,
  Pelicula,
  Pieza,
  ResultadoSugerencia,
  ResumenZona,
  RolCategoria,
  SalaSemana,
  Ubicacion,
} from '../types';
import { BODEGA, etiquetaUbic, mismaUbic, pasilloDeSala, zonaGestionada } from './ubicaciones';

export interface EntradaSugeridor {
  peliculas: Pelicula[];
  materiales: Material[];
  categorias: Categoria[];
  config: ConfigGeneral;
  listas: ListasSemana;
  salas: SalaSemana[];
  noRepetir: boolean;
}

type Pasillo = 'pasillo13' | 'pasillo410';
const PASILLOS: Pasillo[] = ['pasillo13', 'pasillo410'];
const TAQUILLA: Ubicacion = { tipo: 'taquilla', sala: null };
const LOBBY: Ubicacion = { tipo: 'lobby', sala: null };
const GERENCIA: Ubicacion = { tipo: 'gerencia', sala: null };

function idsActivos(lista: ItemLista[]): string[] {
  const r: string[] = [];
  for (const it of lista) if (it.activo && it.peliculaId && r.indexOf(it.peliculaId) < 0) r.push(it.peliculaId);
  return r;
}

export function generarSugerencia(e: EntradaSugeridor): ResultadoSugerencia {
  const cfg = e.config;
  const rolDe = new Map<string, RolCategoria>();
  for (const c of e.categorias) rolDe.set(c.id, c.rol);
  const rol = (m: Material): RolCategoria => rolDe.get(m.categoriaId) || 'ninguno';
  const pelMap = new Map<string, Pelicula>();
  for (const p of e.peliculas) pelMap.set(p.id, p);
  const tituloDe = (id: string) => (pelMap.get(id) ? pelMap.get(id)!.titulo : '¿?');

  const asignaciones: Asignacion[] = [];
  const avisos: string[] = [];
  const usadas = new Set<string>();
  const clave = (m: Material, n: number) => m.id + '#' + n;

  /* ── utilidades de piezas ── */
  function disponibles(m: Material): Pieza[] {
    return m.piezas.filter((p) => p.estado === 'activa' && !usadas.has(clave(m, p.n)));
  }
  function prioridadOrigen(p: Pieza, destino: Ubicacion): number {
    if (mismaUbic(p.ubic, destino)) return 0;
    if (p.ubic.tipo === 'bodega') return 1;
    return 2;
  }
  function materialesDe(peliculaId: string, roles: RolCategoria[]): Material[] {
    return e.materiales
      .filter((m) => m.peliculaId === peliculaId && roles.indexOf(rol(m)) >= 0)
      .sort((a, b) => b.version - a.version);
  }
  /** Pósters normales (no propensos a robo) de una película */
  function segurosDe(peliculaId: string): Material[] {
    return materialesDe(peliculaId, ['cartelera']).filter((m) => !m.propensoRobo);
  }
  function roboDe(peliculaId: string): Material[] {
    return materialesDe(peliculaId, ['cartelera']).filter((m) => !!m.propensoRobo);
  }
  function hayPieza(lista: Material[]): boolean {
    return lista.some((m) => disponibles(m).length > 0);
  }
  /** Toma la pieza de la versión más nueva disponible */
  function tomar(lista: Material[], destino: Ubicacion): { m: Material; p: Pieza; masNueva: number } | null {
    const masNueva = lista.length ? lista[0].version : 0;
    for (const m of lista) {
      const ds = disponibles(m).sort((a, b) => prioridadOrigen(a, destino) - prioridadOrigen(b, destino));
      if (ds.length) {
        usadas.add(clave(m, ds[0].n));
        return { m, p: ds[0], masNueva };
      }
    }
    return null;
  }
  const publicidades = e.materiales.filter((m) => rol(m) === 'publicidad');
  /** modo 'seguro' = sin propensos a robo (salas y pasillos); 'robo' = solo propensos; 'todas' = cualquiera, propensos primero */
  function tomarPublicidad(destino: Ubicacion, evitar: Set<string>, modo: 'seguro' | 'robo' | 'todas' = 'seguro') {
    const opciones = publicidades
      .filter((m) => !evitar.has(m.id))
      .filter((m) => (modo === 'seguro' ? !m.propensoRobo : modo === 'robo' ? !!m.propensoRobo : true))
      .map((m) => {
        const ds = disponibles(m).sort((a, b) => prioridadOrigen(a, destino) - prioridadOrigen(b, destino));
        return { m, p: ds[0] };
      })
      .filter((x) => !!x.p)
      .sort(
        (a, b) =>
          (modo === 'todas' ? Number(!!b.m.propensoRobo) - Number(!!a.m.propensoRobo) : 0) ||
          prioridadOrigen(a.p, destino) - prioridadOrigen(b.p, destino),
      );
    if (!opciones.length) return null;
    usadas.add(clave(opciones[0].m, opciones[0].p.n));
    return opciones[0];
  }

  function agregar(
    zona: Ubicacion,
    grupo: Asignacion['grupo'],
    r: { m: Material; p: Pieza; masNueva?: number } | null,
    tipo: Asignacion['tipo'],
    notas: string[],
    tituloVacio = '',
  ) {
    if (r && r.masNueva && r.m.version < r.masNueva) {
      notas.push('Se usa v' + r.m.version + ' porque no hay piezas libres de v' + r.masNueva);
    }
    asignaciones.push({
      zona,
      grupo,
      tipo: r ? tipo : 'vacio',
      materialId: r ? r.m.id : null,
      piezaN: r ? r.p.n : null,
      peliculaId: r ? r.m.peliculaId : null,
      titulo: r ? r.m.titulo : tituloVacio,
      version: r ? r.m.version : null,
      arte: r ? r.m.arte || null : null,
      imagenUrl: r ? r.m.imagenUrl : null,
      notas,
    });
  }

  /* ── 1. TAQUILLA ── */
  const garantia = idsActivos(e.listas.garantia);
  const enTaquilla: string[] = [];
  const capTaq = cfg.taquillaEspacios;
  for (const it of e.listas.estrenos) {
    if (enTaquilla.length >= capTaq) break;
    if (!it.activo) {
      avisos.push('Taquilla: "' + it.texto + '" se omitió (marcada como que no se exhibe).');
      continue;
    }
    if (!it.peliculaId) {
      avisos.push('Taquilla: "' + it.texto + '" no está en el inventario, se pasó a la siguiente.');
      continue;
    }
    if (enTaquilla.indexOf(it.peliculaId) >= 0) continue;
    const r = tomar(materialesDe(it.peliculaId, ['cartelera']), TAQUILLA);
    if (!r) {
      avisos.push('Taquilla: no hay póster disponible de "' + tituloDe(it.peliculaId) + '", se pasó a la siguiente.');
      continue;
    }
    const notas = ['Estreno de la semana'];
    if (garantia.indexOf(it.peliculaId) >= 0) notas.push('Colocar sello de Garantía Cinépolis');
    agregar(TAQUILLA, 'carteleras', r, 'pelicula', notas);
    enTaquilla.push(it.peliculaId);
  }
  if (enTaquilla.length < capTaq) {
    const enSalas = new Set<string>();
    for (const s of e.salas) for (const p of s.peliculas) enSalas.add(p);
    const rellenos = e.peliculas
      .filter((p) => p.taquillera && p.estado === 'cartelera' && enTaquilla.indexOf(p.id) < 0)
      .sort((a, b) => Number(enSalas.has(b.id)) - Number(enSalas.has(a.id)) || a.titulo.localeCompare(b.titulo));
    for (const p of rellenos) {
      if (enTaquilla.length >= capTaq) break;
      const r = tomar(materialesDe(p.id, ['cartelera']), TAQUILLA);
      if (!r) continue;
      const notas = ['Relleno: taquillera que continúa en cartelera'];
      if (garantia.indexOf(p.id) >= 0) notas.push('Colocar sello de Garantía Cinépolis');
      agregar(TAQUILLA, 'carteleras', r, 'pelicula', notas);
      enTaquilla.push(p.id);
    }
  }
  if (enTaquilla.length < capTaq) {
    const faltan = capTaq - enTaquilla.length;
    avisos.push('Taquilla: faltan ' + faltan + ' póster(es). Marca más películas como taquilleras o registra pósters.');
    for (let i = 0; i < faltan; i++) agregar(TAQUILLA, 'carteleras', null, 'vacio', ['Sin póster disponible'], 'Espacio vacío');
  }

  /* ── 2. SALAS ── */
  const puesto: Record<Pasillo, Set<string>> = { pasillo13: new Set(), pasillo410: new Set() };
  const salasDe = new Map<string, number[]>();
  const salasOrdenadas = e.salas.slice().sort((a, b) => a.sala - b.sala);
  for (const s of salasOrdenadas)
    for (const pid of s.peliculas) {
      const l = salasDe.get(pid) || [];
      if (l.indexOf(s.sala) < 0) l.push(s.sala);
      salasDe.set(pid, l);
    }
  const conPosterEnSala = new Set<string>();

  /** En sala se prefiere un póster normal; si solo hay propensos a robo, se usa y se avisa */
  function tomarParaSala(pid: string, zona: Ubicacion) {
    const r = tomar(segurosDe(pid), zona);
    if (r) return r;
    const rr = tomar(roboDe(pid), zona);
    if (rr) avisos.push(etiquetaUbic(zona) + ': solo hay pósters de "' + tituloDe(pid) + '" marcados como propensos a robo; se usa uno.');
    return rr;
  }

  /** Publicidad en sala: de preferencia una que no se repita en ese pasillo; si no hay, se permite repetir */
  function publicidadEnSala(zona: Ubicacion, notas: string[]) {
    const pas = pasilloDeSala(cfg, zona.sala || 0);
    const rp = tomarPublicidad(zona, puesto[pas]) || tomarPublicidad(zona, new Set());
    if (rp) {
      puesto[pas].add(rp.m.id);
      agregar(zona, 'carteleras', rp, 'publicidad', notas);
    } else {
      avisos.push(etiquetaUbic(zona) + ': no hay publicidad del cine disponible.');
      agregar(zona, 'carteleras', null, 'vacio', notas.concat('Sin publicidad del cine disponible'), 'Espacio vacío');
    }
  }

  /**
   * Reglas de salas:
   *  - Sala exclusiva (una sola película): lleva el póster de esa película. Si la película está sola en
   *    varias salas, se pone en todas mientras alcancen las piezas (aunque sea el mismo pasillo).
   *  - Sala compartida: lleva el póster de la OTRA película (la que no se repite en otras salas);
   *    si no hay de esa, se intenta con las demás; si no hay de ninguna, publicidad del cine.
   *  - Las salas exclusivas se surten primero para que la película repetida tenga póster donde está sola.
   */
  const exclusivas = salasOrdenadas.filter((s) => s.peliculas.length === 1);
  const compartidas = salasOrdenadas.filter((s) => s.peliculas.length > 1);

  for (const s of salasOrdenadas.filter((x) => x.peliculas.length === 0)) {
    publicidadEnSala({ tipo: 'sala', sala: s.sala }, ['Sala sin película asignada']);
  }

  for (const s of exclusivas) {
    const zona: Ubicacion = { tipo: 'sala', sala: s.sala };
    const pid = s.peliculas[0];
    const enSalas = salasDe.get(pid) || [];
    const notas: string[] = enSalas.length > 1 ? ['También está en sala(s) ' + enSalas.filter((n) => n !== s.sala).join(', ')] : [];
    const r = tomarParaSala(pid, zona);
    if (r) {
      conPosterEnSala.add(pid);
      agregar(zona, 'carteleras', r, 'pelicula', notas);
    } else {
      avisos.push(etiquetaUbic(zona) + ': no hay póster disponible de "' + tituloDe(pid) + '", se coloca publicidad del cine.');
      publicidadEnSala(zona, notas.concat('Sin póster de "' + tituloDe(pid) + '"'));
    }
  }

  for (const s of compartidas) {
    const zona: Ubicacion = { tipo: 'sala', sala: s.sala };
    // primero las películas que solo están en esta sala, luego las que aún no tienen póster en otra sala
    const orden = s.peliculas
      .map((pid, i) => ({ pid, i, salas: (salasDe.get(pid) || []).length, tiene: conPosterEnSala.has(pid) ? 1 : 0 }))
      .sort((a, b) => Number(a.salas > 1) - Number(b.salas > 1) || a.tiene - b.tiene || a.salas - b.salas || a.i - b.i)
      .map((x) => x.pid);
    const sinPoster: string[] = [];
    let colocada = false;
    for (const pid of orden) {
      const r = tomarParaSala(pid, zona);
      if (!r) {
        sinPoster.push(tituloDe(pid));
        continue;
      }
      const notas = ['Sala compartida con: ' + s.peliculas.filter((p) => p !== pid).map(tituloDe).join(', ')];
      if (sinPoster.length) notas.push('Sin póster de: ' + sinPoster.join(', '));
      conPosterEnSala.add(pid);
      agregar(zona, 'carteleras', r, 'pelicula', notas);
      colocada = true;
      break;
    }
    if (!colocada) {
      avisos.push(etiquetaUbic(zona) + ': no hay póster de ' + sinPoster.map((t) => '"' + t + '"').join(' ni ') + ', se coloca publicidad del cine.');
      publicidadEnSala(zona, ['Sala compartida', 'Sin póster de: ' + sinPoster.join(', ')]);
    }
  }

  /* ── candidatas para lobby y pasillos ── */
  const excluidas = new Set<string>(enTaquilla);
  for (const s of e.salas) for (const p of s.peliculas) excluidas.add(p);
  for (const id of idsActivos(e.listas.estrenos)) excluidas.add(id);
  const vip = idsActivos(e.listas.prioridadesVip);
  const apoyo = idsActivos(e.listas.apoyo);
  const lobbyPas = idsActivos(e.listas.lobbyPasillos);
  function prioridad(p: Pelicula): number {
    let i = vip.indexOf(p.id);
    if (i >= 0) return i;
    i = apoyo.indexOf(p.id);
    if (i >= 0) return 100 + i;
    i = lobbyPas.indexOf(p.id);
    if (i >= 0) return 200 + i;
    return 1000;
  }
  const candidatas = e.peliculas
    .filter((p) => p.estado === 'proximamente' && !excluidas.has(p.id))
    .sort(
      (a, b) =>
        prioridad(a) - prioridad(b) ||
        (a.fechaEstreno || '9999').localeCompare(b.fechaEstreno || '9999') ||
        a.titulo.localeCompare(b.titulo),
    );

  /* ── 3. ZONAS VIGILADAS: LOBBY Y GERENCIA ── */
  const pasGerencia: Pasillo | null = cfg.gerenciaPasillo === 'ninguno' ? null : cfg.gerenciaPasillo || 'pasillo13';
  const vigiladas = [
    { zona: LOBBY, cap: cfg.lobbyEspacios, puestos: new Set<string>() },
    { zona: GERENCIA, cap: cfg.gerenciaEspacios, puestos: new Set<string>() },
  ];
  function zonaVigiladaPara(id: string) {
    return vigiladas.filter(
      (v) =>
        v.puestos.size < v.cap &&
        !v.puestos.has(id) &&
        !(v.zona.tipo === 'gerencia' && pasGerencia && puesto[pasGerencia].has(id)),
    )[0];
  }
  function ponerEnVigilada(v: (typeof vigiladas)[number], id: string, r: { m: Material; p: Pieza; masNueva?: number }, tipo: Asignacion['tipo'], notas: string[]) {
    v.puestos.add(id);
    if (v.zona.tipo === 'gerencia' && pasGerencia) puesto[pasGerencia].add(id);
    agregar(v.zona, 'carteleras', r, tipo, notas);
  }

  // Pase A: pósters propensos a robo (película o publicidad)
  const roboSinLugar: string[] = [];
  for (const p of candidatas) {
    if (!hayPieza(roboDe(p.id))) continue;
    const v = zonaVigiladaPara(p.id);
    if (!v) {
      roboSinLugar.push(p.titulo);
      continue;
    }
    const r = tomar(roboDe(p.id), v.zona);
    if (r) ponerEnVigilada(v, p.id, r, 'pelicula', ['Propenso a robo: zona vigilada'].concat(prioridad(p) < 1000 ? ['Prioridad del cronograma'] : []));
  }
  for (const m of publicidades.filter((x) => x.propensoRobo)) {
    if (!disponibles(m).length) continue;
    const v = zonaVigiladaPara(m.id);
    if (!v) {
      roboSinLugar.push(m.titulo);
      continue;
    }
    const rp = tomarPublicidad(v.zona, new Set(Array.from(publicidades.map((x) => x.id)).filter((id) => id !== m.id)), 'robo');
    if (rp) ponerEnVigilada(v, m.id, rp, 'publicidad', ['Propenso a robo: zona vigilada']);
  }
  if (roboSinLugar.length)
    avisos.push(
      'Propensos a robo sin lugar en lobby ni gerencia (se quedan en bodega): ' + roboSinLugar.join(', ') + '.',
    );

  // Pase B: películas próximas por prioridad (pósters normales)
  for (const p of candidatas) {
    if (!vigiladas.some((v) => v.puestos.size < v.cap)) break;
    if (!hayPieza(segurosDe(p.id))) continue;
    const v = zonaVigiladaPara(p.id);
    if (!v) continue;
    const r = tomar(segurosDe(p.id), v.zona);
    if (r) ponerEnVigilada(v, p.id, r, 'pelicula', prioridad(p) < 1000 ? ['Prioridad del cronograma'] : []);
  }
  // Pase C: publicidad del cine
  for (const v of vigiladas) {
    while (v.puestos.size < v.cap) {
      const evitar = new Set<string>(v.puestos);
      if (v.zona.tipo === 'gerencia' && pasGerencia) puesto[pasGerencia].forEach((id) => evitar.add(id));
      const rp = tomarPublicidad(v.zona, evitar, 'todas');
      if (!rp) break;
      ponerEnVigilada(v, rp.m.id, rp, 'publicidad', ['Relleno con publicidad del cine']);
    }
    if (v.puestos.size < v.cap) avisos.push(etiquetaUbic(v.zona) + ': quedan ' + (v.cap - v.puestos.size) + ' espacio(s) vacío(s).');
  }

  /* ── 4. PASILLOS ── */
  const salas13 = cfg.pasillo13Salas.length;
  const salas410 = cfg.pasillo410Salas.length;
  // carteleras libres = total del pasillo − salas − gerencia (si está en ese pasillo)
  const cap: Record<Pasillo, number> = {
    pasillo13: Math.max(0, cfg.pasillo13Total - salas13 - (pasGerencia === 'pasillo13' ? cfg.gerenciaEspacios : 0)),
    pasillo410: Math.max(0, cfg.pasillo410Total - salas410 - (pasGerencia === 'pasillo410' ? cfg.gerenciaEspacios : 0)),
  };
  const cuenta: Record<Pasillo, number> = { pasillo13: 0, pasillo410: 0 };
  const libre = (z: Pasillo) => cap[z] - cuenta[z];
  const zonaDe = (z: Pasillo): Ubicacion => ({ tipo: z, sala: null });

  function colocarPelicula(p: Pelicula, z: Pasillo, nota: string | null): boolean {
    if (libre(z) <= 0 || puesto[z].has(p.id)) return false;
    const r = tomar(segurosDe(p.id), zonaDe(z));
    if (!r) return false;
    const notas: string[] = [];
    if (prioridad(p) < 1000) notas.push('Prioridad del cronograma');
    if (nota) notas.push(nota);
    agregar(zonaDe(z), 'carteleras', r, 'pelicula', notas);
    puesto[z].add(p.id);
    cuenta[z]++;
    return true;
  }

  // Pase 1: cada película en un pasillo (el que tenga más espacio libre proporcional)
  for (const p of candidatas) {
    if (!hayPieza(segurosDe(p.id))) continue;
    const orden = PASILLOS.slice().sort(
      (a, b) => (cap[b] ? libre(b) / cap[b] : -1) - (cap[a] ? libre(a) / cap[a] : -1),
    );
    for (const z of orden) if (colocarPelicula(p, z, null)) break;
  }
  function pase2(nota: string) {
    for (const p of candidatas)
      for (const z of PASILLOS) if (!puesto[z].has(p.id)) colocarPelicula(p, z, nota);
  }
  const pubEnAlguno = new Set<string>();
  PASILLOS.forEach((z) => puesto[z].forEach((id) => pubEnAlguno.add(id)));
  function rellenarPublicidad(permitirEntrePasillos: boolean) {
    for (const z of PASILLOS) {
      while (libre(z) > 0) {
        const evitar = new Set<string>(puesto[z]);
        if (!permitirEntrePasillos) pubEnAlguno.forEach((id) => evitar.add(id));
        const rp = tomarPublicidad(zonaDe(z), evitar);
        if (!rp) break;
        puesto[z].add(rp.m.id);
        pubEnAlguno.add(rp.m.id);
        cuenta[z]++;
        agregar(zonaDe(z), 'carteleras', rp, 'publicidad', ['Relleno con publicidad del cine']);
      }
    }
  }
  if (!e.noRepetir) {
    pase2('También está en el otro pasillo');
    rellenarPublicidad(true);
  } else {
    rellenarPublicidad(false);
    pase2('Se repite en el otro pasillo porque no alcanzó el material');
    rellenarPublicidad(true);
  }
  for (const z of PASILLOS) {
    if (libre(z) > 0)
      avisos.push(etiquetaUbic(zonaDe(z)) + ': quedan ' + libre(z) + ' cartelera(s) vacía(s) (no hay más pósters ni publicidad sin repetir).');
  }

  /* ── 5. STANDEES ── */
  const capGrandes = cfg.standeesGrandesTaquilla;
  let grandes = 0;
  const hechosGrandes = new Set<string>();
  for (const it of e.listas.standees) {
    if (grandes >= capGrandes) break;
    if (!it.activo || !it.peliculaId || hechosGrandes.has(it.peliculaId)) continue;
    const p = pelMap.get(it.peliculaId);
    if (!p || p.estado === 'salio') continue;
    const r = tomar(materialesDe(p.id, ['standee_grande']), TAQUILLA);
    if (!r) continue;
    hechosGrandes.add(p.id);
    grandes++;
    agregar(TAQUILLA, 'standees', r, 'pelicula', ['Standee grande (lista del cronograma)']);
  }

  const ordenChicos: string[] = [];
  const pushUnico = (id: string) => {
    if (ordenChicos.indexOf(id) < 0) ordenChicos.push(id);
  };
  idsActivos(e.listas.standees).forEach(pushUnico);
  idsActivos(e.listas.estrenos).forEach(pushUnico);
  e.peliculas.filter((p) => p.taquillera && p.estado === 'cartelera').forEach((p) => pushUnico(p.id));
  candidatas.forEach((p) => pushUnico(p.id));
  e.peliculas.filter((p) => p.estado !== 'salio').forEach((p) => pushUnico(p.id));

  let chicosTaq = 0;
  let chicosLobby = 0;
  const sinLimiteLobby = cfg.standeesChicosLobby <= 0;
  for (const id of ordenChicos) {
    const p = pelMap.get(id);
    if (!p || p.estado === 'salio') continue;
    let destino: Ubicacion | null = null;
    if (chicosTaq < cfg.standeesChicosTaquilla) destino = TAQUILLA;
    else if (sinLimiteLobby || chicosLobby < cfg.standeesChicosLobby) destino = LOBBY;
    if (!destino) break;
    const r = tomar(materialesDe(id, ['standee_chico']), destino);
    if (!r) continue;
    if (destino.tipo === 'taquilla') chicosTaq++;
    else chicosLobby++;
    agregar(destino, 'standees', r, 'pelicula', ['Standee pequeño']);
  }

  /* ── RESUMEN (totales; los usados se cuentan en recalcularResultado) ── */
  const resumen: ResumenZona[] = [
    { zona: TAQUILLA, usados: 0, total: capTaq },
    { zona: LOBBY, usados: 0, total: cfg.lobbyEspacios },
    { zona: GERENCIA, usados: 0, total: cfg.gerenciaEspacios },
    { zona: zonaDe('pasillo13'), usados: 0, total: cap.pasillo13 },
    { zona: zonaDe('pasillo410'), usados: 0, total: cap.pasillo410 },
    { zona: { tipo: 'sala', sala: null }, usados: 0, total: salasOrdenadas.length },
  ];

  return recalcularResultado({ asignaciones, movimientos: [], avisos, resumen }, e.materiales, e.categorias);
}

/**
 * Recalcula la hoja de movimientos y los conteos a partir de las asignaciones.
 * Se usa al generar la sugerencia y cada vez que un administrador cambia algo a mano.
 * Compara contra la ubicación ACTUAL de cada pieza en el inventario.
 */
export function recalcularResultado(r: ResultadoSugerencia, materiales: Material[], categorias: Categoria[]): ResultadoSugerencia {
  const rolDe = new Map<string, RolCategoria>();
  for (const c of categorias) rolDe.set(c.id, c.rol);
  const asignaciones = r.asignaciones;

  /* ── MOVIMIENTOS ── */
  const destinoDe = new Map<string, Ubicacion>();
  for (const a of asignaciones) if (a.materialId && a.piezaN !== null) destinoDe.set(a.materialId + '#' + a.piezaN, a.zona);
  const movimientos: MovimientoSugerido[] = [];
  for (const m of materiales) {
    if ((rolDe.get(m.categoriaId) || 'ninguno') === 'ninguno') continue;
    for (const p of m.piezas) {
      if (p.estado !== 'activa') continue;
      const dest = destinoDe.get(m.id + '#' + p.n) || (zonaGestionada(p.ubic) ? BODEGA : null);
      if (dest && !mismaUbic(dest, p.ubic)) {
        movimientos.push({
          materialId: m.id,
          piezaN: p.n,
          titulo: m.titulo,
          version: m.version,
          arte: m.arte || null,
          desde: p.ubic,
          hacia: dest,
        });
      }
    }
  }
  // primero los retiros a bodega, luego las colocaciones
  movimientos.sort((a, b) => Number(b.hacia.tipo === 'bodega') - Number(a.hacia.tipo === 'bodega'));

  /* ── RESUMEN ── */
  const usadosEn = (tipo: Ubicacion['tipo']) =>
    asignaciones.filter((a) => a.grupo === 'carteleras' && a.tipo !== 'vacio' && a.zona.tipo === tipo).length;
  const resumen = r.resumen.map((z) => ({ ...z, usados: usadosEn(z.zona.tipo) }));

  return { ...r, asignaciones, movimientos, resumen };
}

