/**
 * Motor de sugerencias de colocación semanal.
 *
 * Orden de llenado:
 *  1. Taquilla (4): estrenos del cronograma en orden; si no hay póster → siguiente.
 *     Si no se completan, se rellena con películas marcadas como "taquilleras" que siguen en cartelera.
 *  2. Salas: sala exclusiva → póster de su película (aunque se repita en varias salas del mismo
 *     pasillo, mientras alcancen las piezas). Sala compartida → póster de la otra película.
 *     Sin póster → publicidad del cine.
 *  3. Lobby (2): películas próximas con mayor prioridad.
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
} from "../types";
import {
  BODEGA,
  etiquetaUbic,
  mismaUbic,
  pasilloDeSala,
  zonaGestionada,
} from "./ubicaciones";

export interface EntradaSugeridor {
  peliculas: Pelicula[];
  materiales: Material[];
  categorias: Categoria[];
  config: ConfigGeneral;
  listas: ListasSemana;
  salas: SalaSemana[];
  noRepetir: boolean;
}

type Pasillo = "pasillo13" | "pasillo410";
const PASILLOS: Pasillo[] = ["pasillo13", "pasillo410"];
const TAQUILLA: Ubicacion = { tipo: "taquilla", sala: null };
const LOBBY: Ubicacion = { tipo: "lobby", sala: null };

function idsActivos(lista: ItemLista[]): string[] {
  const r: string[] = [];
  for (const it of lista)
    if (it.activo && it.peliculaId && r.indexOf(it.peliculaId) < 0)
      r.push(it.peliculaId);
  return r;
}

export function generarSugerencia(e: EntradaSugeridor): ResultadoSugerencia {
  const cfg = e.config;
  const rolDe = new Map<string, RolCategoria>();
  for (const c of e.categorias) rolDe.set(c.id, c.rol);
  const rol = (m: Material): RolCategoria =>
    rolDe.get(m.categoriaId) || "ninguno";
  const pelMap = new Map<string, Pelicula>();
  for (const p of e.peliculas) pelMap.set(p.id, p);
  const tituloDe = (id: string) =>
    pelMap.get(id) ? pelMap.get(id)!.titulo : "¿?";

  const asignaciones: Asignacion[] = [];
  const avisos: string[] = [];
  const usadas = new Set<string>();
  const clave = (m: Material, n: number) => m.id + "#" + n;

  /* ── utilidades de piezas ── */
  function disponibles(m: Material): Pieza[] {
    return m.piezas.filter(
      (p) =>
        p.estado === "activa" &&
        p.ubic.tipo !== "gerencia" &&
        !usadas.has(clave(m, p.n)),
    );
  }
  function prioridadOrigen(p: Pieza, destino: Ubicacion): number {
    if (mismaUbic(p.ubic, destino)) return 0;
    if (p.ubic.tipo === "bodega") return 1;
    return 2;
  }
  function materialesDe(peliculaId: string, roles: RolCategoria[]): Material[] {
    return e.materiales
      .filter((m) => m.peliculaId === peliculaId && roles.indexOf(rol(m)) >= 0)
      .sort((a, b) => b.version - a.version);
  }
  function tieneDisponible(peliculaId: string, roles: RolCategoria[]): boolean {
    return materialesDe(peliculaId, roles).some(
      (m) => disponibles(m).length > 0,
    );
  }
  /** Toma la pieza de la versión más nueva disponible */
  function tomar(
    lista: Material[],
    destino: Ubicacion,
  ): { m: Material; p: Pieza; masNueva: number } | null {
    const masNueva = lista.length ? lista[0].version : 0;
    for (const m of lista) {
      const ds = disponibles(m).sort(
        (a, b) => prioridadOrigen(a, destino) - prioridadOrigen(b, destino),
      );
      if (ds.length) {
        usadas.add(clave(m, ds[0].n));
        return { m, p: ds[0], masNueva };
      }
    }
    return null;
  }
  const publicidades = e.materiales.filter((m) => rol(m) === "publicidad");
  function tomarPublicidad(destino: Ubicacion, evitar: Set<string>) {
    const opciones = publicidades
      .filter((m) => !evitar.has(m.id))
      .map((m) => {
        const ds = disponibles(m).sort(
          (a, b) => prioridadOrigen(a, destino) - prioridadOrigen(b, destino),
        );
        return { m, p: ds[0] };
      })
      .filter((x) => !!x.p)
      .sort(
        (a, b) => prioridadOrigen(a.p, destino) - prioridadOrigen(b.p, destino),
      );
    if (!opciones.length) return null;
    usadas.add(clave(opciones[0].m, opciones[0].p.n));
    return opciones[0];
  }

  function agregar(
    zona: Ubicacion,
    grupo: Asignacion["grupo"],
    r: { m: Material; p: Pieza; masNueva?: number } | null,
    tipo: Asignacion["tipo"],
    notas: string[],
    tituloVacio = "",
  ) {
    if (r && r.masNueva && r.m.version < r.masNueva) {
      notas.push(
        "Se usa v" +
          r.m.version +
          " porque no hay piezas libres de v" +
          r.masNueva,
      );
    }
    asignaciones.push({
      zona,
      grupo,
      tipo: r ? tipo : "vacio",
      materialId: r ? r.m.id : null,
      piezaN: r ? r.p.n : null,
      peliculaId: r ? r.m.peliculaId : null,
      titulo: r ? r.m.titulo : tituloVacio,
      version: r ? r.m.version : null,
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
      avisos.push(
        'Taquilla: "' +
          it.texto +
          '" se omitió (marcada como que no se exhibe).',
      );
      continue;
    }
    if (!it.peliculaId) {
      avisos.push(
        'Taquilla: "' +
          it.texto +
          '" no está en el inventario, se pasó a la siguiente.',
      );
      continue;
    }
    if (enTaquilla.indexOf(it.peliculaId) >= 0) continue;
    const r = tomar(materialesDe(it.peliculaId, ["cartelera"]), TAQUILLA);
    if (!r) {
      avisos.push(
        'Taquilla: no hay póster disponible de "' +
          tituloDe(it.peliculaId) +
          '", se pasó a la siguiente.',
      );
      continue;
    }
    const notas = ["Estreno de la semana"];
    if (garantia.indexOf(it.peliculaId) >= 0)
      notas.push("Colocar sello de Garantía Cinépolis");
    agregar(TAQUILLA, "carteleras", r, "pelicula", notas);
    enTaquilla.push(it.peliculaId);
  }
  if (enTaquilla.length < capTaq) {
    const enSalas = new Set<string>();
    for (const s of e.salas) for (const p of s.peliculas) enSalas.add(p);
    const rellenos = e.peliculas
      .filter(
        (p) =>
          p.taquillera &&
          p.estado === "cartelera" &&
          enTaquilla.indexOf(p.id) < 0,
      )
      .sort(
        (a, b) =>
          Number(enSalas.has(b.id)) - Number(enSalas.has(a.id)) ||
          a.titulo.localeCompare(b.titulo),
      );
    for (const p of rellenos) {
      if (enTaquilla.length >= capTaq) break;
      const r = tomar(materialesDe(p.id, ["cartelera"]), TAQUILLA);
      if (!r) continue;
      const notas = ["Relleno: taquillera que continúa en cartelera"];
      if (garantia.indexOf(p.id) >= 0)
        notas.push("Colocar sello de Garantía Cinépolis");
      agregar(TAQUILLA, "carteleras", r, "pelicula", notas);
      enTaquilla.push(p.id);
    }
  }
  if (enTaquilla.length < capTaq) {
    const faltan = capTaq - enTaquilla.length;
    avisos.push(
      "Taquilla: faltan " +
        faltan +
        " póster(es). Marca más películas como taquilleras o registra pósters.",
    );
    for (let i = 0; i < faltan; i++)
      agregar(
        TAQUILLA,
        "carteleras",
        null,
        "vacio",
        ["Sin póster disponible"],
        "Espacio vacío",
      );
  }

  /* ── 2. SALAS ── */
  const puesto: Record<Pasillo, Set<string>> = {
    pasillo13: new Set(),
    pasillo410: new Set(),
  };
  const salasDe = new Map<string, number[]>();
  const salasOrdenadas = e.salas.slice().sort((a, b) => a.sala - b.sala);
  for (const s of salasOrdenadas)
    for (const pid of s.peliculas) {
      const l = salasDe.get(pid) || [];
      if (l.indexOf(s.sala) < 0) l.push(s.sala);
      salasDe.set(pid, l);
    }
  const conPosterEnSala = new Set<string>();

  /** Publicidad en sala: de preferencia una que no se repita en ese pasillo; si no hay, se permite repetir */
  function publicidadEnSala(zona: Ubicacion, notas: string[]) {
    const pas = pasilloDeSala(cfg, zona.sala || 0);
    const rp =
      tomarPublicidad(zona, puesto[pas]) || tomarPublicidad(zona, new Set());
    if (rp) {
      puesto[pas].add(rp.m.id);
      agregar(zona, "carteleras", rp, "publicidad", notas);
    } else {
      avisos.push(
        etiquetaUbic(zona) + ": no hay publicidad del cine disponible.",
      );
      agregar(
        zona,
        "carteleras",
        null,
        "vacio",
        notas.concat("Sin publicidad del cine disponible"),
        "Espacio vacío",
      );
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
    publicidadEnSala({ tipo: "sala", sala: s.sala }, [
      "Sala sin película asignada",
    ]);
  }

  for (const s of exclusivas) {
    const zona: Ubicacion = { tipo: "sala", sala: s.sala };
    const pid = s.peliculas[0];
    const enSalas = salasDe.get(pid) || [];
    const notas: string[] =
      enSalas.length > 1
        ? [
            "También está en sala(s) " +
              enSalas.filter((n) => n !== s.sala).join(", "),
          ]
        : [];
    const r = tomar(materialesDe(pid, ["cartelera"]), zona);
    if (r) {
      conPosterEnSala.add(pid);
      agregar(zona, "carteleras", r, "pelicula", notas);
    } else {
      avisos.push(
        etiquetaUbic(zona) +
          ': no hay póster disponible de "' +
          tituloDe(pid) +
          '", se coloca publicidad del cine.',
      );
      publicidadEnSala(
        zona,
        notas.concat('Sin póster de "' + tituloDe(pid) + '"'),
      );
    }
  }

  for (const s of compartidas) {
    const zona: Ubicacion = { tipo: "sala", sala: s.sala };
    // primero las películas que solo están en esta sala, luego las que aún no tienen póster en otra sala
    const orden = s.peliculas
      .map((pid, i) => ({
        pid,
        i,
        salas: (salasDe.get(pid) || []).length,
        tiene: conPosterEnSala.has(pid) ? 1 : 0,
      }))
      .sort(
        (a, b) =>
          Number(a.salas > 1) - Number(b.salas > 1) ||
          a.tiene - b.tiene ||
          a.salas - b.salas ||
          a.i - b.i,
      )
      .map((x) => x.pid);
    const sinPoster: string[] = [];
    let colocada = false;
    for (const pid of orden) {
      const r = tomar(materialesDe(pid, ["cartelera"]), zona);
      if (!r) {
        sinPoster.push(tituloDe(pid));
        continue;
      }
      const notas = [
        "Sala compartida con: " +
          s.peliculas
            .filter((p) => p !== pid)
            .map(tituloDe)
            .join(", "),
      ];
      if (sinPoster.length)
        notas.push("Sin póster de: " + sinPoster.join(", "));
      conPosterEnSala.add(pid);
      agregar(zona, "carteleras", r, "pelicula", notas);
      colocada = true;
      break;
    }
    if (!colocada) {
      avisos.push(
        etiquetaUbic(zona) +
          ": no hay póster de " +
          sinPoster.map((t) => '"' + t + '"').join(" ni ") +
          ", se coloca publicidad del cine.",
      );
      publicidadEnSala(zona, [
        "Sala compartida",
        "Sin póster de: " + sinPoster.join(", "),
      ]);
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
    .filter((p) => p.estado === "proximamente" && !excluidas.has(p.id))
    .sort(
      (a, b) =>
        prioridad(a) - prioridad(b) ||
        (a.fechaEstreno || "9999").localeCompare(b.fechaEstreno || "9999") ||
        a.titulo.localeCompare(b.titulo),
    );

  /* ── 3. LOBBY ── */
  const enLobby = new Set<string>();
  for (const p of candidatas) {
    if (enLobby.size >= cfg.lobbyEspacios) break;
    const r = tomar(materialesDe(p.id, ["cartelera"]), LOBBY);
    if (!r) continue;
    agregar(
      LOBBY,
      "carteleras",
      r,
      "pelicula",
      prioridad(p) < 1000 ? ["Prioridad del cronograma"] : [],
    );
    enLobby.add(p.id);
  }
  while (enLobby.size < cfg.lobbyEspacios) {
    const rp = tomarPublicidad(LOBBY, enLobby);
    if (!rp) break;
    enLobby.add(rp.m.id);
    agregar(LOBBY, "carteleras", rp, "publicidad", [
      "Relleno con publicidad del cine",
    ]);
  }
  if (enLobby.size < cfg.lobbyEspacios)
    avisos.push(
      "Lobby: quedan " +
        (cfg.lobbyEspacios - enLobby.size) +
        " espacio(s) vacío(s).",
    );

  /* ── 4. PASILLOS ── */
  const salas13 = cfg.pasillo13Salas.length;
  const salas410 = cfg.pasillo410Salas.length;
  const cap: Record<Pasillo, number> = {
    pasillo13: Math.max(0, cfg.pasillo13Total - salas13),
    pasillo410: Math.max(0, cfg.pasillo410Total - salas410),
  };
  const cuenta: Record<Pasillo, number> = { pasillo13: 0, pasillo410: 0 };
  const libre = (z: Pasillo) => cap[z] - cuenta[z];
  const zonaDe = (z: Pasillo): Ubicacion => ({ tipo: z, sala: null });

  function colocarPelicula(
    p: Pelicula,
    z: Pasillo,
    nota: string | null,
  ): boolean {
    if (libre(z) <= 0 || puesto[z].has(p.id)) return false;
    const r = tomar(materialesDe(p.id, ["cartelera"]), zonaDe(z));
    if (!r) return false;
    const notas: string[] = [];
    if (prioridad(p) < 1000) notas.push("Prioridad del cronograma");
    if (nota) notas.push(nota);
    agregar(zonaDe(z), "carteleras", r, "pelicula", notas);
    puesto[z].add(p.id);
    cuenta[z]++;
    return true;
  }

  // Pase 1: cada película en un pasillo (el que tenga más espacio libre proporcional)
  for (const p of candidatas) {
    if (!tieneDisponible(p.id, ["cartelera"])) continue;
    const orden = PASILLOS.slice().sort(
      (a, b) =>
        (cap[b] ? libre(b) / cap[b] : -1) - (cap[a] ? libre(a) / cap[a] : -1),
    );
    for (const z of orden) if (colocarPelicula(p, z, null)) break;
  }
  function pase2(nota: string) {
    for (const p of candidatas)
      for (const z of PASILLOS)
        if (!puesto[z].has(p.id)) colocarPelicula(p, z, nota);
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
        agregar(zonaDe(z), "carteleras", rp, "publicidad", [
          "Relleno con publicidad del cine",
        ]);
      }
    }
  }
  if (!e.noRepetir) {
    pase2("También está en el otro pasillo");
    rellenarPublicidad(true);
  } else {
    rellenarPublicidad(false);
    pase2("Se repite en el otro pasillo porque no alcanzó el material");
    rellenarPublicidad(true);
  }
  for (const z of PASILLOS) {
    if (libre(z) > 0)
      avisos.push(
        etiquetaUbic(zonaDe(z)) +
          ": quedan " +
          libre(z) +
          " cartelera(s) vacía(s) (no hay más pósters ni publicidad sin repetir).",
      );
  }

  /* ── 5. STANDEES ── */
  const capGrandes = cfg.standeesGrandesTaquilla;
  let grandes = 0;
  const hechosGrandes = new Set<string>();
  for (const it of e.listas.standees) {
    if (grandes >= capGrandes) break;
    if (!it.activo || !it.peliculaId || hechosGrandes.has(it.peliculaId))
      continue;
    const p = pelMap.get(it.peliculaId);
    if (!p || p.estado === "salio") continue;
    const r = tomar(materialesDe(p.id, ["standee_grande"]), TAQUILLA);
    if (!r) continue;
    hechosGrandes.add(p.id);
    grandes++;
    agregar(TAQUILLA, "standees", r, "pelicula", [
      "Standee grande (lista del cronograma)",
    ]);
  }

  const ordenChicos: string[] = [];
  const pushUnico = (id: string) => {
    if (ordenChicos.indexOf(id) < 0) ordenChicos.push(id);
  };
  idsActivos(e.listas.standees).forEach(pushUnico);
  idsActivos(e.listas.estrenos).forEach(pushUnico);
  e.peliculas
    .filter((p) => p.taquillera && p.estado === "cartelera")
    .forEach((p) => pushUnico(p.id));
  candidatas.forEach((p) => pushUnico(p.id));
  e.peliculas
    .filter((p) => p.estado !== "salio")
    .forEach((p) => pushUnico(p.id));

  let chicosTaq = 0;
  let chicosLobby = 0;
  const sinLimiteLobby = cfg.standeesChicosLobby <= 0;
  for (const id of ordenChicos) {
    const p = pelMap.get(id);
    if (!p || p.estado === "salio") continue;
    let destino: Ubicacion | null = null;
    if (chicosTaq < cfg.standeesChicosTaquilla) destino = TAQUILLA;
    else if (sinLimiteLobby || chicosLobby < cfg.standeesChicosLobby)
      destino = LOBBY;
    if (!destino) break;
    const r = tomar(materialesDe(id, ["standee_chico"]), destino);
    if (!r) continue;
    if (destino.tipo === "taquilla") chicosTaq++;
    else chicosLobby++;
    agregar(destino, "standees", r, "pelicula", ["Standee pequeño"]);
  }

  /* ── MOVIMIENTOS ── */
  const destinoDe = new Map<string, Ubicacion>();
  for (const a of asignaciones)
    if (a.materialId && a.piezaN !== null)
      destinoDe.set(a.materialId + "#" + a.piezaN, a.zona);
  const movimientos: MovimientoSugerido[] = [];
  for (const m of e.materiales) {
    if (rol(m) === "ninguno") continue;
    for (const p of m.piezas) {
      if (p.estado !== "activa" || p.ubic.tipo === "gerencia") continue;
      const dest =
        destinoDe.get(m.id + "#" + p.n) ||
        (zonaGestionada(p.ubic) ? BODEGA : null);
      if (dest && !mismaUbic(dest, p.ubic)) {
        movimientos.push({
          materialId: m.id,
          piezaN: p.n,
          titulo: m.titulo,
          version: m.version,
          desde: p.ubic,
          hacia: dest,
        });
      }
    }
  }
  // primero los retiros a bodega, luego las colocaciones
  movimientos.sort(
    (a, b) =>
      Number(b.hacia.tipo === "bodega") - Number(a.hacia.tipo === "bodega"),
  );

  /* ── RESUMEN ── */
  const cuentaZona = (pred: (a: Asignacion) => boolean) =>
    asignaciones.filter(
      (a) => a.grupo === "carteleras" && a.tipo !== "vacio" && pred(a),
    ).length;
  const resumen: ResumenZona[] = [
    {
      zona: TAQUILLA,
      usados: cuentaZona((a) => a.zona.tipo === "taquilla"),
      total: capTaq,
    },
    {
      zona: LOBBY,
      usados: cuentaZona((a) => a.zona.tipo === "lobby"),
      total: cfg.lobbyEspacios,
    },
    {
      zona: zonaDe("pasillo13"),
      usados: cuenta.pasillo13,
      total: cap.pasillo13,
    },
    {
      zona: zonaDe("pasillo410"),
      usados: cuenta.pasillo410,
      total: cap.pasillo410,
    },
    {
      zona: { tipo: "sala", sala: null },
      usados: cuentaZona((a) => a.zona.tipo === "sala"),
      total: salasOrdenadas.length,
    },
  ];

  return { asignaciones, movimientos, avisos, resumen };
}
