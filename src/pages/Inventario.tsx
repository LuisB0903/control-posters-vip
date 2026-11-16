import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useData } from "../context/DataContext";
import { useQuien } from "../context/AuthContext";
import {
  Encabezado,
  Icono,
  Interruptor,
  Modal,
  Poster,
  useUI,
  Vacio,
} from "../components/ui";
import RegistrarMaterial from "../components/RegistrarMaterial";
import {
  actualizarPelicula,
  agregarPiezas,
  cambiarEstadoPelicula,
  cambiarEstadoPieza,
  editarMaterial,
  eliminarMaterial,
  eliminarPelicula,
  moverPieza,
  nombreMaterial,
  publicarParaCinepolitos,
  quitarPieza,
} from "../lib/acciones";
import {
  BODEGA,
  etiquetaUbic,
  opcionesUbic,
  ubicDeKey,
  ubicKey,
} from "../lib/ubicaciones";
import { contiene } from "../lib/texto";
import { fmtFecha, sumarUnMes, vencido } from "../lib/fechas";
import { comprimirImagen, errorTexto } from "../lib/utilidades";
import type { EstadoPelicula, EstadoPieza, Material, Pelicula } from "../types";

const ESTADOS: { id: EstadoPelicula; t: string }[] = [
  { id: "proximamente", t: "Próximamente" },
  { id: "cartelera", t: "En cartelera" },
  { id: "salio", t: "Salió de cartelera" },
];

export default function Inventario() {
  const d = useData();
  const quien = useQuien();
  const { toast, confirmar } = useUI();
  const [registrar, setRegistrar] = useState<{
    abierto: boolean;
    pelicula: Pelicula | null;
  }>({ abierto: false, pelicula: null });
  const [q, setQ] = useState("");
  const [fEstado, setFEstado] = useState<"todos" | EstadoPelicula>("todos");
  const [fCat, setFCat] = useState("todas");
  const [fUbic, setFUbic] = useState("todas");
  const [verInactivas, setVerInactivas] = useState(false);
  const [editando, setEditando] = useState<Material | null>(null);
  const [params, setParams] = useSearchParams();

  // Inicio → "Registrar material" abre la ventana directamente
  useEffect(() => {
    if (params.get("registrar") === "1") {
      setRegistrar({ abierto: true, pelicula: null });
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ejecutar = async (f: () => Promise<unknown>, ok?: string) => {
    try {
      await f();
      if (ok) toast(ok);
    } catch (e) {
      toast(errorTexto(e), "error");
    }
  };

  // el material ya entregado o desechado por completo se oculta (sale del inventario)
  const filtraMaterial = (m: Material) =>
    (verInactivas ||
      m.piezas.length === 0 ||
      m.piezas.some((p) => p.estado === "activa")) &&
    (fCat === "todas" || m.categoriaId === fCat) &&
    (fUbic === "todas" ||
      m.piezas.some((p) => p.estado === "activa" && ubicKey(p.ubic) === fUbic));

  const grupos = useMemo(() => {
    const lista = d.peliculas
      .filter((p) => fEstado === "todos" || p.estado === fEstado)
      .filter((p) => contiene(p.titulo + " " + (p.tituloOriginal || ""), q))
      .map((p) => ({
        p,
        mats: d.materiales
          .filter((m) => m.peliculaId === p.id && filtraMaterial(m))
          .sort(
            (a, b) =>
              a.categoriaId.localeCompare(b.categoriaId) ||
              b.version - a.version,
          ),
      }))
      .filter(
        (g) =>
          g.mats.length ||
          (fCat === "todas" &&
            fUbic === "todas" &&
            !d.materiales.some((m) => m.peliculaId === g.p.id)),
      );
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.peliculas, d.materiales, q, fEstado, fCat, fUbic, verInactivas]);

  const sinPelicula = d.materiales
    .filter((m) => !m.peliculaId && filtraMaterial(m) && contiene(m.titulo, q))
    .sort((a, b) => a.titulo.localeCompare(b.titulo));

  const cambiarEstado = async (p: Pelicula, estado: EstadoPelicula) => {
    const mats = d.materiales.filter((m) => m.peliculaId === p.id);
    if (estado === "salio") {
      const hasta = sumarUnMes(new Date());
      const ok = await confirmar({
        titulo: 'Marcar como "Salió de cartelera"',
        mensaje: (
          <>
            <p>
              Los {mats.length} material(es) de <b>{p.titulo}</b> se publicarán
              en la página de cinepolitos para que los aparten.
            </p>
            <p>
              Fecha de entrega o desecho: <b>{fmtFecha(hasta, true)}</b> (un mes
              exacto).
            </p>
          </>
        ),
        aceptar: "Publicar para cinepolitos",
      });
      if (!ok) return;
    } else if (p.estado === "salio") {
      const ok = await confirmar({
        titulo:
          "Regresar a " +
          (estado === "cartelera" ? "cartelera" : "próximamente"),
        mensaje:
          "Sus materiales dejarán de mostrarse a los cinepolitos. Los apartados ya hechos se conservan.",
      });
      if (!ok) return;
    }
    ejecutar(
      () => cambiarEstadoPelicula(quien, p, estado, mats),
      "Estado actualizado",
    );
  };

  const totalActivas = d.materiales.reduce(
    (a, m) => a + m.piezas.filter((x) => x.estado === "activa").length,
    0,
  );

  return (
    <div>
      <Encabezado
        eyebrow={
          <>
            <span className="chip chip-oro chip-caps">
              Catálogo operativo VIP
            </span>
            <span className="chip chip-verde">
              <span className="punto" /> {totalActivas} piezas en piso y bodega
            </span>
          </>
        }
        titulo="Inventario de pósters y material POP"
        descripcion={
          "Control de versiones, standees y ubicaciones físicas en " +
          d.config.conjunto +
          "."
        }
        acciones={
          <button
            className="btn btn-primario"
            onClick={() => setRegistrar({ abierto: true, pelicula: null })}
          >
            <Icono n="add_circle" /> Registrar material
          </button>
        }
      >
        <div className="barra-filtros">
          <div className="buscador">
            <Icono n="search" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por título en español o título original…"
            />
          </div>
          <select
            value={fEstado}
            onChange={(e) =>
              setFEstado(e.target.value as "todos" | EstadoPelicula)
            }
          >
            <option value="todos">Estado: todos</option>
            {ESTADOS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.t}
              </option>
            ))}
          </select>
          <select value={fCat} onChange={(e) => setFCat(e.target.value)}>
            <option value="todas">Categoría: todas</option>
            {d.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <select value={fUbic} onChange={(e) => setFUbic(e.target.value)}>
            <option value="todas">Ubicación: todas</option>
            {opcionesUbic(d.config).map((o) => (
              <option key={o.key} value={o.key}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="filtros-pie">
          <Interruptor
            activo={verInactivas}
            onCambio={setVerInactivas}
            etiqueta="Mostrar material entregado o desechado (oculto por defecto)"
          />
          <span>
            Mostrando <b>{grupos.length}</b> película(s) y{" "}
            <b>{sinPelicula.length}</b> campaña(s)
          </span>
        </div>
      </Encabezado>

      {grupos.length === 0 && sinPelicula.length === 0 && (
        <div className="tarjeta">
          <Vacio titulo="No hay material con esos filtros" icono="search_off">
            Registra tu primer póster con el botón de arriba.
          </Vacio>
        </div>
      )}

      {grupos.map(({ p, mats }) => {
        const arte = p.posterUrl || (mats[0] && mats[0].imagenUrl) || null;
        const estreno = p.fechaEstreno
          ? new Date(p.fechaEstreno + "T12:00:00")
          : null;
        const diasEstreno = estreno
          ? Math.ceil((estreno.getTime() - Date.now()) / 86400000)
          : null;
        const abiertos = d.apartados.filter(
          (a) =>
            a.peliculaId === p.id &&
            (a.estado === "apartado" || a.estado === "seleccionado"),
        ).length;
        const publicadoHasta = mats
          .map((m) =>
            m.cinepolitos && m.cinepolitos.activo ? m.cinepolitos.hasta : null,
          )
          .filter((x) => !!x)[0];
        return (
          <article className="peli" key={p.id}>
            <div className="peli-arte">
              {arte && arte.indexOf("data:") !== 0 && (
                <div
                  className="peli-arte-fondo"
                  style={{ backgroundImage: 'url("' + arte + '")' }}
                />
              )}
              <span
                className={"peli-etiqueta chip chip-caps estado-" + p.estado}
              >
                {p.estado === "proximamente"
                  ? "Próximo estreno"
                  : p.estado === "cartelera"
                    ? "En exhibición"
                    : "Corrida finalizada"}
              </span>
              <div className="poster-envoltura">
                <Poster url={arte} alt={p.titulo} />
              </div>
              <div className="peli-arte-pie">
                <span>
                  {p.tmdbId ? "TMDB #" + p.tmdbId : "Registro manual"}
                </span>
                {abiertos > 0 ? (
                  <span className="texto-oro">
                    <Icono n="bookmark" className="ico-14" /> {abiertos}{" "}
                    solicitud(es)
                  </span>
                ) : p.taquillera ? (
                  <span className="texto-oro">
                    <Icono n="star" className="ico-14" /> Taquillera
                  </span>
                ) : estreno ? (
                  <span className="texto-verde">
                    <Icono n="event" className="ico-14" /> {fmtFecha(estreno)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="peli-info">
              <div className="peli-cab">
                <div style={{ minWidth: 0 }}>
                  <div className="peli-titulo">{p.titulo}</div>
                  {p.tituloOriginal && p.tituloOriginal !== p.titulo && (
                    <div className="peli-original">
                      (Original: {p.tituloOriginal})
                    </div>
                  )}
                </div>
                <div className="peli-controles">
                  <select
                    className={"select-estado chip estado-" + p.estado}
                    value={p.estado}
                    onChange={(e) =>
                      cambiarEstado(p, e.target.value as EstadoPelicula)
                    }
                  >
                    {ESTADOS.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.t}
                      </option>
                    ))}
                  </select>
                  <Interruptor
                    activo={p.taquillera}
                    etiqueta={<span className="caps muted">Taquillera</span>}
                    onCambio={(v) =>
                      ejecutar(() =>
                        actualizarPelicula(
                          quien,
                          p,
                          { taquillera: v },
                          v ? "marcada como taquillera" : "ya no es taquillera",
                        ),
                      )
                    }
                  />
                </div>
              </div>

              <div className="peli-meta">
                {estreno && (
                  <span>
                    <Icono n="calendar_month" className="ico-16" /> Estreno:{" "}
                    <b className="negrita">{fmtFecha(estreno)}</b>
                  </span>
                )}
                {p.estado === "proximamente" &&
                  diasEstreno !== null &&
                  diasEstreno > 0 && (
                    <span className="texto-verde">
                      {diasEstreno} día(s) para el lanzamiento
                    </span>
                  )}
                {p.estado === "cartelera" && (
                  <span className="texto-verde">
                    <span className="punto latido" /> En exhibición
                  </span>
                )}
                {p.salioEn && (
                  <span>Fin de temporada: {fmtFecha(p.salioEn)}</span>
                )}
                {publicadoHasta && (
                  <span className="texto-oro">
                    <Icono n="public" className="ico-16" /> Publicado en
                    cinepolitos hasta {fmtFecha(publicadoHasta)}
                  </span>
                )}
              </div>

              <div className="peli-seccion">
                <span className="caps">Variantes y copias físicas</span>
                {abiertos > 0 && (
                  <span className="caps texto-verde">
                    {abiertos} apartado(s) de empleados
                  </span>
                )}
              </div>

              {mats.length === 0 && (
                <p className="muted chico">Sin material registrado.</p>
              )}
              {mats.map((m) => (
                <MaterialFila
                  key={m.id}
                  m={m}
                  verInactivas={verInactivas}
                  onEditar={() => setEditando(m)}
                  ejecutar={ejecutar}
                />
              ))}

              <div className="peli-pie">
                <button
                  className="btn btn-chico btn-fantasma"
                  onClick={() => setRegistrar({ abierto: true, pelicula: p })}
                >
                  <Icono n="add" /> Nueva versión o material
                </button>
                {mats.length === 0 &&
                  d.materiales.every((m) => m.peliculaId !== p.id) && (
                    <button
                      className="btn btn-chico btn-fantasma"
                      onClick={async () => {
                        if (
                          await confirmar({
                            titulo: "Eliminar película",
                            mensaje:
                              '¿Eliminar "' +
                              p.titulo +
                              '"? No tiene material.',
                            peligro: true,
                            aceptar: "Eliminar",
                          })
                        )
                          ejecutar(
                            () => eliminarPelicula(quien, p),
                            "Película eliminada",
                          );
                      }}
                    >
                      <Icono n="delete" /> Eliminar película
                    </button>
                  )}
              </div>
            </div>
          </article>
        );
      })}

      {sinPelicula.length > 0 && (
        <>
          <div className="seccion-titulo">
            <div className="panel-titulo">
              <span className="icono-caja oro">
                <Icono n="campaign" />
              </span>
              <div>
                <h2 style={{ margin: 0 }}>Publicidad del cine y campañas</h2>
                <p>
                  Material corporativo sin película: rellena carteleras cuando
                  no hay póster.
                </p>
              </div>
            </div>
            <button
              className="btn btn-chico"
              onClick={() => setRegistrar({ abierto: true, pelicula: null })}
            >
              <Icono n="add" /> Nueva campaña
            </button>
          </div>
          <div className="campanas">
            {sinPelicula.map((m) => (
              <div className="campana" key={m.id}>
                <MaterialFila
                  m={m}
                  verInactivas={verInactivas}
                  onEditar={() => setEditando(m)}
                  ejecutar={ejecutar}
                  campana
                />
              </div>
            ))}
          </div>
        </>
      )}

      <RegistrarMaterial
        abierto={registrar.abierto}
        peliculaInicial={registrar.pelicula}
        onCerrar={() => setRegistrar({ abierto: false, pelicula: null })}
      />
      {editando && (
        <EditarMaterial m={editando} onCerrar={() => setEditando(null)} />
      )}
    </div>
  );
}

const ICONO_ROL: Record<string, string> = {
  cartelera: "image",
  publicidad: "campaign",
  standee_grande: "accessibility_new",
  standee_chico: "view_in_ar",
  ninguno: "flag",
};

/** "Pasillo 1-3 (#1, #2), Bodega (#3)" */
function resumenUbicaciones(
  m: Material,
): { lugar: string; piezas: number[] }[] {
  const mapa = new Map<string, number[]>();
  m.piezas
    .filter((p) => p.estado === "activa")
    .sort((a, b) => a.n - b.n)
    .forEach((p) => {
      const k = etiquetaUbic(p.ubic);
      mapa.set(k, (mapa.get(k) || []).concat(p.n));
    });
  return Array.from(mapa.entries())
    .map(([lugar, piezas]) => ({ lugar, piezas }))
    .sort(
      (a, b) => Number(a.lugar === "Bodega") - Number(b.lugar === "Bodega"),
    );
}

/* ───────── Un material (variante) con sus piezas ───────── */
function MaterialFila({
  m,
  verInactivas,
  onEditar,
  ejecutar,
  campana,
}: {
  m: Material;
  verInactivas: boolean;
  onEditar: () => void;
  ejecutar: (f: () => Promise<unknown>, ok?: string) => void;
  campana?: boolean;
}) {
  const d = useData();
  const quien = useQuien();
  const { confirmar } = useUI();
  const [agregar, setAgregar] = useState(false);
  const [verPiezas, setVerPiezas] = useState(false);
  const cat = d.categoriaPorId.get(m.categoriaId);
  const activas = m.piezas.filter((p) => p.estado === "activa");
  const piezas = verInactivas ? m.piezas : activas;
  const pub = m.cinepolitos;
  const publicado = !!pub && pub.activo && !vencido(pub.hasta);
  const apartados = d.apartados.filter(
    (a) =>
      a.materialId === m.id &&
      (a.estado === "apartado" || a.estado === "seleccionado"),
  ).length;
  const masNueva = d.materiales
    .filter(
      (x) =>
        x.peliculaId &&
        x.peliculaId === m.peliculaId &&
        x.categoriaId === m.categoriaId,
    )
    .reduce((a, x) => Math.max(a, x.version), 0);
  const esVieja = !!m.peliculaId && m.version < masNueva;
  const colocadasViejas = esVieja
    ? activas.filter((p) => p.ubic.tipo !== "bodega")
    : [];
  const opciones = opcionesUbic(d.config);
  const ubic = resumenUbicaciones(m);
  const enUso = activas.filter((p) => p.ubic.tipo !== "bodega").length;

  return (
    <div className={campana ? "" : "variante" + (esVieja ? " vieja" : "")}>
      <div className="variante-fila">
        <span className="variante-icono">
          <Icono
            n={
              esVieja
                ? "warning"
                : ICONO_ROL[cat ? cat.rol : "ninguno"] || "image"
            }
          />
        </span>
        <div className="variante-cuerpo">
          {campana && (
            <div className="fila-entre" style={{ marginBottom: 2 }}>
              <span className="caps texto-oro">
                {cat ? cat.nombre : "Campaña"}
              </span>
              <span className="caps muted">{enUso} pieza(s) en uso</span>
            </div>
          )}
          <div className="variante-titulo">
            {campana
              ? m.titulo + " v" + m.version
              : nombreMaterial(m) +
                " (" +
                (cat ? cat.nombre : m.categoriaId) +
                ")"}
            {!campana && m.peliculaId && !esVieja && masNueva > 1 && (
              <span className="chip chip-verde">Versión más reciente</span>
            )}
            {esVieja && (
              <span className="chip chip-rojo">Versión anterior (cambiar)</span>
            )}
            {publicado && (
              <span className="chip chip-oro">
                Cinepolitos hasta {fmtFecha(pub!.hasta)}
              </span>
            )}
            {pub && pub.activo && vencido(pub.hasta) && (
              <span className="chip chip-rojo">
                Venció {fmtFecha(pub.hasta)}
              </span>
            )}
            {apartados > 0 && (
              <span className="chip chip-morado">{apartados} apartado(s)</span>
            )}
          </div>
          <div className="variante-sub">
            <span className="texto-verde negrita">
              {activas.length} pieza(s) activa(s)
            </span>
            {m.piezas.length !== activas.length && (
              <span> de {m.piezas.length}</span>
            )}
            {ubic.length > 0 && (
              <>
                {" · "}Ubicaciones:{" "}
                {ubic.map((u, i) => (
                  <span key={u.lugar}>
                    {i > 0 ? ", " : ""}
                    <b className={u.lugar === "Bodega" ? "muted" : ""}>
                      {u.lugar}
                    </b>{" "}
                    (#{u.piezas.join(", #")})
                  </span>
                ))}
              </>
            )}
            {m.notas ? " · " + m.notas : ""}
          </div>
          {colocadasViejas.length > 0 && (
            <div className="variante-aviso">
              <Icono n="warning" className="ico-16" />
              <span>
                Copia #{colocadasViejas.map((p) => p.n).join(", #")} sigue
                montada en{" "}
                <b>
                  {Array.from(
                    new Set(colocadasViejas.map((p) => etiquetaUbic(p.ubic))),
                  ).join(", ")}
                </b>
                . Reemplazar por v{masNueva}.
              </span>
            </div>
          )}
        </div>
        <div className="variante-acciones">
          {piezas.length > 0 && (
            <button
              className="btn btn-chico btn-vip"
              onClick={() => setVerPiezas(!verPiezas)}
            >
              <Icono n={verPiezas ? "expand_less" : "location_on"} />{" "}
              {verPiezas ? "Ocultar" : "Ver piezas"} ({piezas.length})
            </button>
          )}
          <button
            className="btn-icono chico"
            title="Agregar piezas"
            onClick={() => setAgregar(true)}
          >
            <Icono n="add_box" />
          </button>
          <button
            className="btn-icono chico"
            title={
              publicado ? "Ocultar a cinepolitos" : "Publicar a cinepolitos"
            }
            onClick={() =>
              ejecutar(
                () => publicarParaCinepolitos(quien, m, !publicado),
                publicado
                  ? "Retirado de la página de cinepolitos"
                  : "Publicado para cinepolitos",
              )
            }
          >
            <Icono
              n={publicado ? "public_off" : "public"}
              className={publicado ? "texto-oro" : ""}
            />
          </button>
          <button className="btn-icono chico" title="Editar" onClick={onEditar}>
            <Icono n="edit" />
          </button>
          <button
            className="btn-icono chico"
            title="Eliminar material (registro por error)"
            onClick={async () => {
              if (
                await confirmar({
                  titulo: "Eliminar material",
                  mensaje:
                    '¿Eliminar "' +
                    nombreMaterial(m) +
                    '" y sus ' +
                    m.piezas.length +
                    " pieza(s)? Úsalo solo si se registró por error.",
                  peligro: true,
                  aceptar: "Eliminar",
                })
              )
                ejecutar(
                  () => eliminarMaterial(quien, m),
                  "Material eliminado",
                );
            }}
          >
            <Icono n="delete" />
          </button>
        </div>
      </div>
      {verPiezas && piezas.length > 0 && (
        <div className="piezas">
          {piezas
            .slice()
            .sort((a, b) => a.n - b.n)
            .map((p) => (
              <div
                key={p.n}
                className={"pieza" + (p.estado !== "activa" ? " inactiva" : "")}
              >
                <span className="pieza-n">#{p.n}</span>
                {p.estado === "activa" ? (
                  <select
                    className="compacto"
                    value={ubicKey(p.ubic)}
                    onChange={(e) =>
                      ejecutar(
                        () =>
                          moverPieza(quien, m, p.n, ubicDeKey(e.target.value)),
                        "Ubicación actualizada",
                      )
                    }
                  >
                    {opciones.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.etiqueta}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="chico" style={{ flex: 1 }}>
                    {p.estado === "entregada"
                      ? "Entregada a " + p.entregadaA
                      : "Desechada"}
                  </span>
                )}
                <select
                  className="compacto"
                  style={{ width: "auto" }}
                  value=""
                  onChange={async (e) => {
                    const v = e.target.value;
                    if (v === "quitar") {
                      if (
                        await confirmar({
                          titulo: "Quitar pieza",
                          mensaje:
                            "¿Quitar la pieza #" +
                            p.n +
                            "? (solo si se registró por error)",
                          peligro: true,
                        })
                      )
                        ejecutar(
                          () => quitarPieza(quien, m, p.n),
                          "Pieza quitada",
                        );
                    } else if (v)
                      ejecutar(
                        () =>
                          cambiarEstadoPieza(quien, m, p.n, v as EstadoPieza),
                        "Pieza actualizada",
                      );
                  }}
                  title="Más opciones"
                >
                  <option value="">⋯</option>
                  {p.estado !== "activa" && (
                    <option value="activa">Reactivar</option>
                  )}
                  {p.estado !== "desechada" && (
                    <option value="desechada">Marcar desechada</option>
                  )}
                  <option value="quitar">Quitar (error)</option>
                </select>
              </div>
            ))}
        </div>
      )}
      {agregar && <AgregarPiezas m={m} onCerrar={() => setAgregar(false)} />}
    </div>
  );
}

function AgregarPiezas({ m, onCerrar }: { m: Material; onCerrar: () => void }) {
  const d = useData();
  const quien = useQuien();
  const { toast } = useUI();
  const [n, setN] = useState(1);
  const [u, setU] = useState(ubicKey(BODEGA));
  return (
    <Modal
      abierto
      titulo={"Agregar piezas · " + nombreMaterial(m)}
      onCerrar={onCerrar}
      ancho={420}
      pie={
        <>
          <button className="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            className="btn btn-primario"
            onClick={() =>
              agregarPiezas(quien, m, n, ubicDeKey(u))
                .then(() => {
                  toast(n + " pieza(s) agregada(s)");
                  onCerrar();
                })
                .catch((e) => toast(errorTexto(e), "error"))
            }
          >
            Agregar
          </button>
        </>
      }
    >
      <div className="rejilla rejilla-2">
        <label className="campo">
          <span>Cantidad</span>
          <input
            type="number"
            min={1}
            value={n}
            onChange={(e) =>
              setN(Math.max(1, parseInt(e.target.value, 10) || 1))
            }
          />
        </label>
        <label className="campo">
          <span>Ubicación</span>
          <select value={u} onChange={(e) => setU(e.target.value)}>
            {opcionesUbic(d.config).map((o) => (
              <option key={o.key} value={o.key}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted chico">
        Las piezas nuevas quedan en {etiquetaUbic(ubicDeKey(u))}.
      </p>
    </Modal>
  );
}

function EditarMaterial({
  m,
  onCerrar,
}: {
  m: Material;
  onCerrar: () => void;
}) {
  const d = useData();
  const quien = useQuien();
  const { toast } = useUI();
  const [version, setVersion] = useState(m.version);
  const [imagen, setImagen] = useState(m.imagenUrl || "");
  const [notas, setNotas] = useState(m.notas);
  const [cat, setCat] = useState(m.categoriaId);
  const [titulo, setTitulo] = useState(m.titulo);

  const guardar = () =>
    editarMaterial(quien, m, {
      version,
      imagenUrl: imagen.trim() || null,
      notas,
      categoriaId: cat,
      ...(m.peliculaId ? {} : { titulo: titulo.trim() }),
    })
      .then(() => {
        toast("Material actualizado");
        onCerrar();
      })
      .catch((e) => toast(errorTexto(e), "error"));

  return (
    <Modal
      abierto
      titulo={"Editar · " + nombreMaterial(m)}
      onCerrar={onCerrar}
      pie={
        <>
          <button className="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="btn btn-primario" onClick={guardar}>
            Guardar
          </button>
        </>
      }
    >
      <div className="pila">
        {!m.peliculaId && (
          <label className="campo">
            <span>Nombre</span>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </label>
        )}
        <div className="rejilla rejilla-2">
          <label className="campo">
            <span>Versión</span>
            <input
              type="number"
              min={1}
              value={version}
              onChange={(e) => setVersion(parseInt(e.target.value, 10) || 1)}
            />
          </label>
          <label className="campo">
            <span>Categoría</span>
            <select value={cat} onChange={(e) => setCat(e.target.value)}>
              {d.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="campo">
          <span>Enlace de imagen</span>
          <input
            value={imagen.indexOf("data:") === 0 ? "(foto subida)" : imagen}
            onChange={(e) => setImagen(e.target.value)}
          />
        </label>
        <label className="btn btn-chico" style={{ alignSelf: "flex-start" }}>
          Subir otra foto
          <input
            type="file"
            accept="image/*"
            className="oculto"
            onChange={(e) => {
              const f = e.target.files ? e.target.files[0] : undefined;
              if (f)
                comprimirImagen(f)
                  .then(setImagen)
                  .catch((er) => toast(errorTexto(er), "error"));
            }}
          />
        </label>
        {imagen && (
          <div style={{ width: 120 }}>
            <Poster url={imagen} alt={m.titulo} />
          </div>
        )}
        <label className="campo">
          <span>Notas</span>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}
