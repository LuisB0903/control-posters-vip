import { useEffect, useMemo, useState } from "react";
import { useData } from "../context/DataContext";
import { useQuien } from "../context/AuthContext";
import { Interruptor, Modal, Poster, useUI } from "./ui";
import {
  buscarPeliculas,
  IMG,
  postersDePelicula,
  urlGoogleImagenes,
  type TmdbPelicula,
} from "../lib/tmdb";
import { crearMaterial } from "../lib/acciones";
import { comprimirImagen, errorTexto } from "../lib/utilidades";
import { contiene } from "../lib/texto";
import {
  BODEGA,
  etiquetaUbic,
  opcionesUbic,
  ubicDeKey,
  ubicKey,
} from "../lib/ubicaciones";
import { fmtFecha } from "../lib/fechas";
import type { EstadoPelicula, Pelicula } from "../types";

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  peliculaInicial?: Pelicula | null;
}

export default function RegistrarMaterial({
  abierto,
  onCerrar,
  peliculaInicial,
}: Props) {
  const d = useData();
  const quien = useQuien();
  const { toast } = useUI();

  const [categoriaId, setCategoriaId] = useState("poster");
  const [busqueda, setBusqueda] = useState("");
  const [pelicula, setPelicula] = useState<Pelicula | null>(null);
  const [tmdbSel, setTmdbSel] = useState<TmdbPelicula | null>(null);
  const [manual, setManual] = useState(false);
  const [tituloLibre, setTituloLibre] = useState("");
  const [resultados, setResultados] = useState<TmdbPelicula[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [posters, setPosters] = useState<string[]>([]);
  const [cargandoPosters, setCargandoPosters] = useState(false);
  const [imagen, setImagen] = useState<string | null>(null);
  const [urlManual, setUrlManual] = useState("");
  const [version, setVersion] = useState(1);
  const [cantidad, setCantidad] = useState(1);
  const [ubic, setUbic] = useState(ubicKey(BODEGA));
  const [estadoNueva, setEstadoNueva] =
    useState<EstadoPelicula>("proximamente");
  const [notas, setNotas] = useState("");
  const [propensoRobo, setPropensoRobo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [avisoVersion, setAvisoVersion] = useState<string[] | null>(null);

  const categoria = d.categoriaPorId.get(categoriaId) || d.categorias[0];
  const esPublicidad = categoria && categoria.rol === "publicidad";

  // reiniciar al abrir
  useEffect(() => {
    if (!abierto) return;
    setCategoriaId(d.categorias[0] ? d.categorias[0].id : "poster");
    setBusqueda("");
    setPelicula(peliculaInicial || null);
    setTmdbSel(null);
    setManual(false);
    setTituloLibre("");
    setResultados([]);
    setPosters([]);
    setImagen(null);
    setUrlManual("");
    setCantidad(1);
    setUbic(ubicKey(BODEGA));
    setEstadoNueva("proximamente");
    setNotas("");
    setPropensoRobo(false);
    setError("");
    setAvisoVersion(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  // versión sugerida = la más alta registrada + 1
  useEffect(() => {
    if (!pelicula) {
      setVersion(1);
      return;
    }
    const max = d.materiales
      .filter(
        (m) => m.peliculaId === pelicula.id && m.categoriaId === categoriaId,
      )
      .reduce((a, m) => Math.max(a, m.version), 0);
    setVersion(max + 1);
  }, [pelicula, categoriaId, d.materiales]);

  // cargar pósters de TMDB de la película elegida
  useEffect(() => {
    const id = tmdbSel ? tmdbSel.id : pelicula && pelicula.tmdbId;
    setPosters([]);
    if (!id || !d.config.tmdbKey) return;
    setCargandoPosters(true);
    postersDePelicula(id, d.config.tmdbKey)
      .then((p) => setPosters(p))
      .catch((e) => toast(errorTexto(e), "error"))
      .finally(() => setCargandoPosters(false));
  }, [tmdbSel, pelicula, d.config.tmdbKey, toast]);

  const coincidenciasLocales = useMemo(
    () =>
      busqueda.trim().length >= 2
        ? d.peliculas
            .filter(
              (p) =>
                contiene(p.titulo, busqueda) ||
                contiene(p.tituloOriginal || "", busqueda),
            )
            .slice(0, 8)
        : [],
    [busqueda, d.peliculas],
  );

  const buscarTmdb = async () => {
    if (!d.config.tmdbKey) {
      toast("Primero guarda la clave de TMDB en Configuración", "error");
      return;
    }
    if (!busqueda.trim()) return;
    setBuscando(true);
    try {
      setResultados(await buscarPeliculas(busqueda.trim(), d.config.tmdbKey));
    } catch (e) {
      toast(errorTexto(e), "error");
    } finally {
      setBuscando(false);
    }
  };

  const elegirTmdb = (t: TmdbPelicula) => {
    const existente = d.peliculas.find((p) => p.tmdbId === t.id);
    if (existente) {
      setPelicula(existente);
      setTmdbSel(null);
      toast(
        "Esa película ya está registrada: se agregará como nueva versión",
        "info",
      );
    } else {
      setTmdbSel(t);
      setPelicula(null);
      setManual(false);
    }
    setImagen(t.poster ? IMG(t.poster) : null);
    setResultados([]);
  };

  const subirFoto = async (f: File | undefined) => {
    if (!f) return;
    try {
      setImagen(await comprimirImagen(f));
    } catch (e) {
      toast(errorTexto(e), "error");
    }
  };

  const tituloActual = pelicula
    ? pelicula.titulo
    : tmdbSel
      ? tmdbSel.titulo
      : manual || esPublicidad
        ? tituloLibre
        : busqueda;

  const guardar = async () => {
    setError("");
    if (!categoria) return setError("Elige una categoría");
    if (
      !esPublicidad &&
      !pelicula &&
      !tmdbSel &&
      !(manual && tituloLibre.trim())
    )
      return setError(
        "Elige una película registrada, búscala en TMDB o escribe el título manualmente.",
      );
    if (esPublicidad && !tituloLibre.trim())
      return setError("Escribe el nombre de la publicidad.");
    if (cantidad < 1) return setError("La cantidad debe ser al menos 1.");
    setGuardando(true);
    try {
      const anteriores = pelicula
        ? d.materiales.filter(
            (m) =>
              m.peliculaId === pelicula.id &&
              m.categoriaId === categoriaId &&
              m.version < version,
          )
        : [];
      await crearMaterial(quien, {
        peliculaExistente: esPublicidad ? null : pelicula,
        peliculaNueva:
          esPublicidad || pelicula
            ? null
            : tmdbSel
              ? {
                  titulo: tmdbSel.titulo,
                  tituloOriginal: tmdbSel.tituloOriginal,
                  tmdbId: tmdbSel.id,
                  fechaEstreno: tmdbSel.fecha,
                  posterUrl: tmdbSel.poster ? IMG(tmdbSel.poster) : imagen,
                  estado: estadoNueva,
                }
              : {
                  titulo: tituloLibre.trim(),
                  tituloOriginal: null,
                  tmdbId: null,
                  fechaEstreno: null,
                  posterUrl: imagen,
                  estado: estadoNueva,
                },
        tituloLibre,
        categoria,
        version,
        imagenUrl: imagen,
        cantidad,
        ubic: ubicDeKey(ubic),
        notas,
        propensoRobo,
      });
      toast(tituloActual + " v" + version + " registrado");
      // ¿hay versiones viejas colocadas? → alerta de cambio
      const lugares: string[] = [];
      anteriores.forEach((m) =>
        m.piezas
          .filter((p) => p.estado === "activa" && p.ubic.tipo !== "bodega")
          .forEach((p) =>
            lugares.push(
              "v" + m.version + " #" + p.n + " en " + etiquetaUbic(p.ubic),
            ),
          ),
      );
      if (lugares.length) setAvisoVersion(lugares);
      else onCerrar();
    } catch (e) {
      setError(errorTexto(e));
    } finally {
      setGuardando(false);
    }
  };

  if (avisoVersion) {
    return (
      <Modal
        abierto={abierto}
        titulo="🔁 Hay que cambiar pósters"
        onCerrar={onCerrar}
        pie={
          <button className="btn btn-primario" onClick={onCerrar}>
            Entendido
          </button>
        }
      >
        <p>
          Llegó la <b>v{version}</b> de <b>{tituloActual}</b>. Reemplaza las
          versiones anteriores que están colocadas:
        </p>
        <ul>
          {avisoVersion.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="muted chico">
          Este aviso también aparece en Inicio hasta que muevas las piezas
          viejas a bodega.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Registrar material"
      onCerrar={onCerrar}
      ancho={820}
      pie={
        <>
          <button className="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            className="btn btn-primario"
            onClick={guardar}
            disabled={guardando}
          >
            {guardando ? "Guardando…" : "Registrar"}
          </button>
        </>
      }
    >
      <div className="pila">
        <div className="rejilla rejilla-3">
          <label className="campo">
            <span>Categoría</span>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
            >
              {d.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Cantidad de piezas iguales</span>
            <input
              type="number"
              min={1}
              max={100}
              value={cantidad}
              onChange={(e) => setCantidad(parseInt(e.target.value, 10) || 1)}
            />
          </label>
          <label className="campo">
            <span>Ubicación inicial</span>
            <select value={ubic} onChange={(e) => setUbic(e.target.value)}>
              {opcionesUbic(d.config).map((o) => (
                <option key={o.key} value={o.key}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </label>
        </div>

        {esPublicidad ? (
          <label className="campo">
            <span>Nombre de la publicidad</span>
            <input
              value={tituloLibre}
              onChange={(e) => setTituloLibre(e.target.value)}
              placeholder="Ej. Club Cinépolis, Openbank…"
            />
          </label>
        ) : pelicula || tmdbSel ? (
          <div className="material fila-entre">
            <div className="fila">
              <Poster
                url={
                  pelicula
                    ? pelicula.posterUrl
                    : tmdbSel && tmdbSel.poster
                      ? IMG(tmdbSel.poster, "w185")
                      : null
                }
                alt={tituloActual}
                chico
              />
              <div>
                <div className="negrita">{tituloActual}</div>
                <div className="muted chico">
                  {pelicula
                    ? "Película ya registrada · se agrega una versión"
                    : "Película nueva (TMDB)"}
                  {tmdbSel && tmdbSel.fecha
                    ? " · estreno " +
                      fmtFecha(new Date(tmdbSel.fecha + "T12:00:00"))
                    : ""}
                </div>
              </div>
            </div>
            <button
              className="btn btn-chico"
              onClick={() => {
                setPelicula(null);
                setTmdbSel(null);
                setImagen(null);
              }}
            >
              Cambiar
            </button>
          </div>
        ) : manual ? (
          <div className="fila">
            <label className="campo" style={{ flex: 1 }}>
              <span>Título de la película (manual)</span>
              <input
                value={tituloLibre}
                onChange={(e) => setTituloLibre(e.target.value)}
              />
            </label>
            <button
              className="btn"
              style={{ alignSelf: "flex-end" }}
              onClick={() => setManual(false)}
            >
              Volver a buscar
            </button>
          </div>
        ) : (
          <div>
            <div className="fila">
              <label className="campo" style={{ flex: 1 }}>
                <span>Película</span>
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && buscarTmdb()}
                  placeholder="Escribe el título y busca…"
                  autoFocus
                />
              </label>
              <button
                className="btn btn-primario"
                style={{ alignSelf: "flex-end" }}
                onClick={buscarTmdb}
                disabled={buscando}
              >
                {buscando ? "Buscando…" : "Buscar en TMDB"}
              </button>
            </div>
            {coincidenciasLocales.length > 0 && (
              <div className="mt">
                <div className="etiqueta">Ya registradas</div>
                <div className="fila mt" style={{ marginTop: 6 }}>
                  {coincidenciasLocales.map((p) => (
                    <button
                      key={p.id}
                      className="btn btn-chico"
                      onClick={() => setPelicula(p)}
                    >
                      {p.titulo}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {resultados.length > 0 && (
              <div className="mt">
                <div className="etiqueta">Resultados de TMDB</div>
                <div className="galeria mt" style={{ marginTop: 6 }}>
                  {resultados.map((r) => (
                    <button
                      key={r.id}
                      className="galeria-item"
                      onClick={() => elegirTmdb(r)}
                    >
                      <Poster
                        url={r.poster ? IMG(r.poster, "w185") : null}
                        alt={r.titulo}
                      />
                      <small>
                        <b>{r.titulo}</b>
                        <br />
                        <span className="muted">
                          {r.fecha ? r.fecha.slice(0, 4) : "s/f"}
                        </span>
                      </small>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="fila mt">
              <span className="muted chico">¿No aparece?</span>
              <a
                className="btn btn-chico"
                href={urlGoogleImagenes(busqueda || "película")}
                target="_blank"
                rel="noreferrer"
              >
                Buscar en Google Imágenes ↗
              </a>
              <button
                className="btn btn-chico"
                onClick={() => {
                  setManual(true);
                  setTituloLibre(busqueda);
                }}
              >
                Escribir título manualmente
              </button>
            </div>
          </div>
        )}

        {!esPublicidad && !pelicula && (tmdbSel || manual) && (
          <label className="campo" style={{ maxWidth: 280 }}>
            <span>Estado de la película</span>
            <select
              value={estadoNueva}
              onChange={(e) => setEstadoNueva(e.target.value as EstadoPelicula)}
            >
              <option value="proximamente">Próximamente</option>
              <option value="cartelera">En cartelera</option>
            </select>
          </label>
        )}

        <div className="rejilla rejilla-3">
          <label className="campo">
            <span>Versión</span>
            <div className="fila" style={{ flexWrap: "nowrap" }}>
              <span className="negrita">v</span>
              <input
                type="number"
                min={1}
                value={version}
                onChange={(e) => setVersion(parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <small>Como viene en el paquete, ej. "La Nueva Focker v3"</small>
          </label>
          <label className="campo" style={{ gridColumn: "span 2" }}>
            <span>Notas (opcional)</span>
            <input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej. versión de personaje, tamaño especial…"
            />
          </label>
        </div>

        <div className="alerta" style={{ marginBottom: 0 }}>
          <Interruptor
            activo={propensoRobo}
            onCambio={setPropensoRobo}
            etiqueta={
              <span>
                <b className="negrita">Propenso a robo</b>
                <span className="muted chico">
                  {" "}
                  · el sugeridor solo lo coloca en lobby o gerencia (zonas
                  vigiladas)
                </span>
              </span>
            }
          />
        </div>

        <div>
          <div className="fila-entre">
            <div className="etiqueta">Imagen de esta versión</div>
            <div className="fila">
              {!esPublicidad && (
                <a
                  className="btn btn-chico"
                  href={urlGoogleImagenes(tituloActual || busqueda)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Imágenes ↗
                </a>
              )}
              <label className="btn btn-chico">
                Subir foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="oculto"
                  onChange={(e) =>
                    subirFoto(e.target.files ? e.target.files[0] : undefined)
                  }
                />
              </label>
            </div>
          </div>
          <div className="fila mt" style={{ marginTop: 8 }}>
            <input
              value={urlManual}
              onChange={(e) => setUrlManual(e.target.value)}
              placeholder="…o pega aquí el enlace de una imagen (clic derecho → Copiar dirección de imagen)"
            />
            <button
              className="btn"
              onClick={() => urlManual.trim() && setImagen(urlManual.trim())}
            >
              Usar
            </button>
          </div>
          {cargandoPosters && (
            <p className="muted chico">Cargando versiones de póster…</p>
          )}
          <div className="galeria mt">
            {imagen && posters.map((p) => IMG(p)).indexOf(imagen) < 0 && (
              <button className="galeria-item sel">
                <Poster url={imagen} alt="Elegida" />
                <small>Imagen elegida</small>
              </button>
            )}
            {posters.slice(0, 24).map((p) => (
              <button
                key={p}
                className={"galeria-item" + (imagen === IMG(p) ? " sel" : "")}
                onClick={() => setImagen(IMG(p))}
              >
                <Poster url={IMG(p, "w185")} alt="Póster" />
              </button>
            ))}
          </div>
          {!imagen && !posters.length && (
            <p className="muted chico">
              Sin imagen todavía. Puedes registrarlo así y agregarla después.
            </p>
          )}
        </div>

        {error && <div className="alerta alerta-error">{error}</div>}
      </div>
    </Modal>
  );
}
