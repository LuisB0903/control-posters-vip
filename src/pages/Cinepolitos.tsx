import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  BotonTema,
  Cargando,
  Modal,
  Poster,
  useUI,
  Vacio,
} from "../components/ui";
import { aDate, fmtFecha } from "../lib/fechas";
import { contiene } from "../lib/texto";
import { errorTexto } from "../lib/utilidades";
import {
  CATEGORIAS_DEFAULT,
  CONFIG_DEFAULT,
  type AvisoEmpleado,
  type Categoria,
  type EstadoApartado,
} from "../types";

interface PosterPublico {
  id: string;
  categoriaId: string;
  peliculaId: string | null;
  titulo: string;
  version: number;
  imagenUrl: string | null;
  hasta: Date;
}

/** Página pública: los cinepolitos apartan pósters de películas que ya salieron de cartelera */
export default function Cinepolitos() {
  const { toast } = useUI();
  const [posters, setPosters] = useState<PosterPublico[] | null>(null);
  const [idTexto, setIdTexto] = useState("");
  const [empleado, setEmpleado] = useState<{
    id: string;
    nombre: string;
  } | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [errorId, setErrorId] = useState("");
  const [yaApartados, setYaApartados] = useState<Map<string, EstadoApartado>>(
    new Map(),
  );
  const [categorias, setCategorias] = useState<Categoria[]>(CATEGORIAS_DEFAULT);
  const [contacto, setContacto] = useState(CONFIG_DEFAULT.entregaContacto);
  const [aviso, setAviso] = useState<AvisoEmpleado | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState("");
  const [listo, setListo] = useState<string[] | null>(null);

  // categorías (Póster, Standee…) y quién entrega
  useEffect(() => {
    getDoc(doc(db, "config", "categorias"))
      .then((s) => {
        const l = s.exists() ? (s.data().lista as Categoria[]) : null;
        if (l && l.length) setCategorias(l);
      })
      .catch(() => {});
    getDoc(doc(db, "config", "publico"))
      .then((s) => {
        if (s.exists() && s.data().entregaContacto)
          setContacto(s.data().entregaContacto);
      })
      .catch(() => {});
  }, []);

  const nombreCat = (categoriaId: string) => {
    const c = categorias.find((x) => x.id === categoriaId);
    return c ? c.nombre : "Material";
  };
  const etiqueta = (p: PosterPublico) =>
    nombreCat(p.categoriaId) + " · " + p.titulo + " v" + p.version;

  useEffect(() => {
    const u = onSnapshot(
      query(
        collection(db, "materiales"),
        where("cinepolitos.activo", "==", true),
      ),
      (s) => {
        const ahora = Date.now();
        const lista: PosterPublico[] = [];
        s.docs.forEach((x) => {
          const m = x.data();
          const hasta = aDate(m.cinepolitos && m.cinepolitos.hasta);
          const quedan =
            Array.isArray(m.piezas) &&
            m.piezas.some((p: { estado: string }) => p.estado === "activa");
          if (hasta && hasta.getTime() > ahora && quedan)
            lista.push({
              id: x.id,
              categoriaId: m.categoriaId || "poster",
              peliculaId: m.peliculaId || null,
              titulo: m.titulo,
              version: m.version,
              imagenUrl: m.imagenUrl || null,
              hasta,
            });
        });
        lista.sort(
          (a, b) =>
            a.hasta.getTime() - b.hasta.getTime() ||
            a.titulo.localeCompare(b.titulo),
        );
        setPosters(lista);
      },
      (e) => {
        toast(errorTexto(e), "error");
        setPosters([]);
      },
    );
    return u;
  }, [toast]);

  // revisar cuáles ya apartó este empleado
  useEffect(() => {
    if (!empleado || !posters) return;
    let vivo = true;
    Promise.all(
      posters.map((p) =>
        getDoc(doc(db, "apartados", p.id + "_" + empleado.id))
          .then((s) =>
            s.exists()
              ? ([p.id, (s.data().estado || "apartado") as EstadoApartado] as [
                  string,
                  EstadoApartado,
                ])
              : null,
          )
          .catch(() => null),
      ),
    ).then((r) => {
      if (vivo)
        setYaApartados(
          new Map(r.filter((x): x is [string, EstadoApartado] => !!x)),
        );
    });
    return () => {
      vivo = false;
    };
  }, [empleado, posters]);

  const identificar = async (e: FormEvent) => {
    e.preventDefault();
    const id = idTexto.trim();
    setErrorId("");
    if (!/^\d{3,10}$/.test(id))
      return setErrorId("Escribe tu ID de empleado (solo números).");
    setVerificando(true);
    try {
      const s = await getDoc(doc(db, "empleados", id));
      if (!s.exists() || s.data().activo === false)
        setErrorId("No encontramos ese ID. Pregunta a tu supervisor.");
      else {
        setEmpleado({ id, nombre: s.data().nombre });
        getDoc(doc(db, "avisos", id))
          .then((a) =>
            setAviso(
              a.exists()
                ? ({ pendientes: a.data().pendientes || [] } as AvisoEmpleado)
                : null,
            ),
          )
          .catch(() => setAviso(null));
      }
    } catch (er) {
      setErrorId(errorTexto(er));
    } finally {
      setVerificando(false);
    }
  };

  const alternar = (p: PosterPublico) => {
    if (yaApartados.has(p.id)) return;
    if (!empleado) {
      toast("Primero escribe tu ID de empleado", "info");
      return;
    }
    const n = new Set(sel);
    if (n.has(p.id)) n.delete(p.id);
    else n.add(p.id);
    setSel(n);
  };

  const elegidos = (posters || []).filter((p) => sel.has(p.id));

  const apartar = async () => {
    if (!empleado) return;
    setEnviando(true);
    const ok: string[] = [];
    const okIds: string[] = [];
    const fallidos: string[] = [];
    await Promise.all(
      elegidos.map((p) =>
        setDoc(doc(db, "apartados", p.id + "_" + empleado.id), {
          materialId: p.id,
          peliculaId: p.peliculaId,
          titulo: p.titulo,
          version: p.version,
          empleadoId: empleado.id,
          empleadoNombre: empleado.nombre,
          creadoEn: serverTimestamp(),
          estado: "apartado",
        })
          .then(() => {
            ok.push(etiqueta(p));
            okIds.push(p.id);
          })
          .catch(() => fallidos.push(etiqueta(p))),
      ),
    );
    setEnviando(false);
    setConfirmando(false);
    setSel(new Set());
    const nuevo = new Map(yaApartados);
    okIds.forEach((id) => nuevo.set(id, "apartado"));
    setYaApartados(nuevo);
    if (fallidos.length)
      toast(
        "No se pudo apartar: " +
          fallidos.join(", ") +
          " (ya lo habías apartado o ya cerró)",
        "error",
      );
    if (ok.length) setListo(ok);
  };

  const visibles = useMemo(
    () => (posters || []).filter((p) => contiene(p.titulo, busca)),
    [posters, busca],
  );

  return (
    <div className="publico">
      <header className="publico-cab">
        <div className="publico-cab-in">
          <div
            className="marca-logo"
            style={{ width: 38, height: 38, fontSize: "1.1rem" }}
          >
            VIP
          </div>
          <div className="display" style={{ fontSize: "1.4rem" }}>
            Material para cinepolitos
          </div>
          <div style={{ marginLeft: "auto" }} className="fila">
            <BotonTema />
            <Link to="/admin" className="btn btn-chico btn-fantasma">
              Admin
            </Link>
          </div>
        </div>
      </header>

      <section className="publico-hero">
        <h1>Aparta pósters y standees 🎬</h1>
        <p className="muted" style={{ maxWidth: 640 }}>
          Este material (pósters, standees y más) es de películas que ya
          salieron de cartelera. Elige lo que quieras y apártalo con tu ID de
          empleado. Puedes apartar varios, pero <b>cada uno solo una vez</b> y{" "}
          <b>no se puede cancelar</b>. La gerencia decide a quién se entrega
          cuando hay más interesados que piezas.
        </p>
      </section>

      <div className="publico-cuerpo">
        <div className="tarjeta mb">
          {empleado ? (
            <div className="fila-entre">
              <div>
                <div className="muted chico">Apartando como</div>
                <div className="negrita">
                  {empleado.nombre} · ID {empleado.id}
                </div>
              </div>
              <button
                className="btn btn-chico"
                onClick={() => {
                  setEmpleado(null);
                  setSel(new Set());
                  setYaApartados(new Map());
                  setAviso(null);
                  setIdTexto("");
                }}
              >
                No soy yo
              </button>
            </div>
          ) : (
            <form className="fila" onSubmit={identificar}>
              <label className="campo" style={{ flex: 1, minWidth: 180 }}>
                <span>Tu ID de empleado</span>
                <input
                  inputMode="numeric"
                  value={idTexto}
                  onChange={(e) =>
                    setIdTexto(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Ej. 244689"
                />
              </label>
              <button
                className="btn btn-primario"
                style={{ alignSelf: "flex-end" }}
                disabled={verificando}
              >
                {verificando ? "Verificando…" : "Continuar"}
              </button>
              {errorId && (
                <div
                  className="alerta alerta-error"
                  style={{ width: "100%", margin: 0 }}
                >
                  {errorId}
                </div>
              )}
            </form>
          )}
        </div>

        {empleado && aviso && aviso.pendientes.length > 0 && (
          <div className="alerta alerta-aviso">
            <strong>
              🎉 Tienes{" "}
              {aviso.pendientes.length === 1
                ? "un material"
                : aviso.pendientes.length + " materiales"}{" "}
              por ser entregado{aviso.pendientes.length === 1 ? "" : "s"}
            </strong>
            <ul>
              {aviso.pendientes.map((x, i) => (
                <li key={i}>
                  <b>{x.categoria}</b>: {x.titulo} v{x.version}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 6 }}>
              Acércate con <b>{contacto}</b> para su entrega.
            </div>
          </div>
        )}

        {posters === null ? (
          <Cargando texto="Cargando material…" />
        ) : posters.length === 0 ? (
          <div className="tarjeta">
            <Vacio titulo="Por ahora no hay material disponible">
              Vuelve a revisar pronto.
            </Vacio>
          </div>
        ) : (
          <>
            {posters.length > 8 && (
              <input
                className="mb"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar película…"
                style={{ maxWidth: 340 }}
              />
            )}
            <div className="galeria-publica">
              {visibles.map((p) => {
                const ya = yaApartados.has(p.id);
                const estado = yaApartados.get(p.id);
                const marcado = sel.has(p.id);
                return (
                  <button
                    key={p.id}
                    className={
                      "tarjeta-poster" +
                      (marcado ? " sel" : "") +
                      (ya ? " ya" : "")
                    }
                    onClick={() => alternar(p)}
                  >
                    {marcado && <span className="marca-sel">✓</span>}
                    <Poster url={p.imagenUrl} alt={p.titulo} />
                    <div style={{ padding: "8px 2px 2px" }}>
                      <span
                        className="chip chip-azul"
                        style={{ marginBottom: 4 }}
                      >
                        {nombreCat(p.categoriaId)}
                      </span>
                      <div className="negrita" style={{ lineHeight: 1.2 }}>
                        {p.titulo}
                      </div>
                      <div className="muted chico">Versión {p.version}</div>
                      <div className="chico" style={{ marginTop: 4 }}>
                        {ya ? (
                          estado === "seleccionado" ? (
                            <span className="chip chip-acento">
                              ¡Por entregarte!
                            </span>
                          ) : estado === "entregado" ? (
                            <span className="chip chip-verde">
                              Ya se te entregó
                            </span>
                          ) : (
                            <span className="chip chip-verde">
                              Ya lo apartaste
                            </span>
                          )
                        ) : (
                          <span className="muted">
                            Entrega o desecho: {fmtFecha(p.hasta)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {elegidos.length > 0 && (
        <div className="barra-flotante">
          <div className="barra-flotante-in">
            <span>
              <b>{elegidos.length}</b> seleccionado(s)
            </span>
            <button
              className="btn btn-primario"
              onClick={() => setConfirmando(true)}
            >
              Apartar
            </button>
          </div>
        </div>
      )}

      <Modal
        abierto={confirmando}
        titulo="Confirmar apartado"
        onCerrar={() => setConfirmando(false)}
        ancho={460}
        pie={
          <>
            <button className="btn" onClick={() => setConfirmando(false)}>
              Regresar
            </button>
            <button
              className="btn btn-primario"
              onClick={apartar}
              disabled={enviando}
            >
              {enviando ? "Apartando…" : "Sí, apartar"}
            </button>
          </>
        }
      >
        <p>
          <b>{empleado ? empleado.nombre : ""}</b>, vas a apartar:
        </p>
        <ul>
          {elegidos.map((p) => (
            <li key={p.id}>
              <b>{nombreCat(p.categoriaId)}</b>: {p.titulo} v{p.version}{" "}
              <span className="muted chico">· {fmtFecha(p.hasta)}</span>
            </li>
          ))}
        </ul>
        <div className="alerta alerta-aviso">
          Un apartado no se puede cancelar.
        </div>
      </Modal>

      <Modal
        abierto={!!listo}
        titulo="¡Listo! 🎉"
        onCerrar={() => setListo(null)}
        ancho={420}
        pie={
          <button className="btn btn-primario" onClick={() => setListo(null)}>
            Entendido
          </button>
        }
      >
        <p>Apartaste:</p>
        <ul>{listo && listo.map((t) => <li key={t}>{t}</li>)}</ul>
        <p className="muted chico">
          Si se te selecciona, al poner tu ID en esta página verás el aviso para
          recogerlo con {contacto}. Recuerda la fecha de entrega o desecho de
          cada material.
        </p>
      </Modal>
    </div>
  );
}
