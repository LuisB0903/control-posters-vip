import { useMemo, useState } from "react";
import { useData } from "../context/DataContext";
import { useQuien } from "../context/AuthContext";
import { Interruptor, Modal, Poster, useUI, Vacio } from "../components/ui";
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

  return (
    <div>
      <div className="cabecera">
        <div>
          <h1>Inventario</h1>
          <p>Películas, versiones y dónde está cada pieza.</p>
        </div>
        <div className="acciones">
          <button
            className="btn btn-primario"
            onClick={() => setRegistrar({ abierto: true, pelicula: null })}
          >
            + Registrar material
          </button>
        </div>
      </div>

      <div className="tarjeta mb">
        <div className="rejilla rejilla-4">
          <label className="campo">
            <span>Buscar</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Título…"
            />
          </label>
          <label className="campo">
            <span>Estado</span>
            <select
              value={fEstado}
              onChange={(e) =>
                setFEstado(e.target.value as "todos" | EstadoPelicula)
              }
            >
              <option value="todos">Todos</option>
              {ESTADOS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.t}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Categoría</span>
            <select value={fCat} onChange={(e) => setFCat(e.target.value)}>
              <option value="todas">Todas</option>
              {d.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Ubicación</span>
            <select value={fUbic} onChange={(e) => setFUbic(e.target.value)}>
              <option value="todas">Todas</option>
              {opcionesUbic(d.config).map((o) => (
                <option key={o.key} value={o.key}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt">
          <Interruptor
            activo={verInactivas}
            onCambio={setVerInactivas}
            etiqueta="Mostrar material entregado o desechado"
          />
        </div>
      </div>

      {grupos.length === 0 && sinPelicula.length === 0 && (
        <div className="tarjeta">
          <Vacio titulo="No hay material con esos filtros">
            Registra tu primer póster con el botón de arriba.
          </Vacio>
        </div>
      )}

      {grupos.map(({ p, mats }) => (
        <div className="tarjeta" key={p.id}>
          <div className="pelicula">
            <div className="pelicula-poster">
              <Poster
                url={p.posterUrl || (mats[0] && mats[0].imagenUrl)}
                alt={p.titulo}
              />
            </div>
            <div className="pelicula-cuerpo">
              <div className="fila-entre">
                <div>
                  <div className="pelicula-titulo">{p.titulo}</div>
                  <div className="muted chico">
                    {p.tituloOriginal && p.tituloOriginal !== p.titulo
                      ? p.tituloOriginal + " · "
                      : ""}
                    {p.fechaEstreno
                      ? "Estreno " +
                        fmtFecha(new Date(p.fechaEstreno + "T12:00:00"))
                      : "Sin fecha de estreno"}
                    {p.salioEn ? " · salió el " + fmtFecha(p.salioEn) : ""}
                  </div>
                </div>
                <div className="fila">
                  <select
                    className="compacto"
                    value={p.estado}
                    onChange={(e) =>
                      cambiarEstado(p, e.target.value as EstadoPelicula)
                    }
                    style={{ width: "auto" }}
                  >
                    {ESTADOS.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.t}
                      </option>
                    ))}
                  </select>
                  <Interruptor
                    activo={p.taquillera}
                    etiqueta="Taquillera"
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

              {mats.map((m) => (
                <MaterialFila
                  key={m.id}
                  m={m}
                  verInactivas={verInactivas}
                  onEditar={() => setEditando(m)}
                  ejecutar={ejecutar}
                />
              ))}

              <div className="fila mt">
                <button
                  className="btn btn-chico"
                  onClick={() => setRegistrar({ abierto: true, pelicula: p })}
                >
                  + Nueva versión / material
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
                      Eliminar película
                    </button>
                  )}
              </div>
            </div>
          </div>
        </div>
      ))}

      {sinPelicula.length > 0 && (
        <div className="tarjeta">
          <div className="pelicula-titulo">Publicidad del cine y otros</div>
          {sinPelicula.map((m) => (
            <MaterialFila
              key={m.id}
              m={m}
              verInactivas={verInactivas}
              onEditar={() => setEditando(m)}
              ejecutar={ejecutar}
            />
          ))}
        </div>
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

/* ───────── Un material con sus piezas ───────── */
function MaterialFila({
  m,
  verInactivas,
  onEditar,
  ejecutar,
}: {
  m: Material;
  verInactivas: boolean;
  onEditar: () => void;
  ejecutar: (f: () => Promise<unknown>, ok?: string) => void;
}) {
  const d = useData();
  const quien = useQuien();
  const { confirmar } = useUI();
  const [agregar, setAgregar] = useState(false);
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
  const opciones = opcionesUbic(d.config);

  return (
    <div className="material">
      <div className="material-cab">
        <Poster url={m.imagenUrl} alt={m.titulo} chico />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="fila">
            <span className="negrita">{nombreMaterial(m)}</span>
            <span className="chip">{cat ? cat.nombre : m.categoriaId}</span>
            {m.peliculaId && m.version < masNueva && (
              <span className="chip chip-rojo">Versión anterior</span>
            )}
            {publicado && (
              <span className="chip chip-verde">
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
          <div className="muted chico">
            {activas.length} pieza(s) activa(s) de {m.piezas.length}
            {m.notas ? " · " + m.notas : ""}
          </div>
        </div>
        <div className="fila">
          <button className="btn btn-chico" onClick={() => setAgregar(true)}>
            + Piezas
          </button>
          <button
            className="btn btn-chico"
            onClick={() =>
              ejecutar(
                () => publicarParaCinepolitos(quien, m, !publicado),
                publicado
                  ? "Retirado de la página de cinepolitos"
                  : "Publicado para cinepolitos",
              )
            }
            title="Mostrar u ocultar en la página de cinepolitos"
          >
            {publicado ? "Ocultar a cinepolitos" : "Publicar a cinepolitos"}
          </button>
          <button className="btn btn-chico" onClick={onEditar}>
            Editar
          </button>
          <button
            className="btn btn-chico btn-fantasma"
            title="Eliminar material"
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
            🗑
          </button>
        </div>
      </div>
      {piezas.length > 0 && (
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
