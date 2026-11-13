import { useEffect, useState, type ChangeEvent } from "react";
import { useData } from "../context/DataContext";
import { useQuien } from "../context/AuthContext";
import { useUI } from "../components/ui";
import { guardarCategorias, guardarConfig } from "../lib/acciones";
import { probarClave } from "../lib/tmdb";
import { errorTexto } from "../lib/utilidades";
import type { Categoria, ConfigGeneral, RolCategoria } from "../types";

const ROLES: { id: RolCategoria; t: string }[] = [
  {
    id: "cartelera",
    t: "Póster de película (taquilla, salas, lobby y pasillos)",
  },
  { id: "publicidad", t: "Publicidad del cine (relleno)" },
  { id: "standee_grande", t: "Standee grande (taquilla)" },
  { id: "standee_chico", t: "Standee pequeño (taquilla y lobby)" },
  { id: "ninguno", t: "Solo inventario (el sugeridor no lo mueve)" },
];

const aLista = (s: string) =>
  s
    .split(/[,\s]+/)
    .map((x) => parseInt(x, 10))
    .filter((n) => !isNaN(n) && n > 0);

export default function Configuracion() {
  const d = useData();
  const quien = useQuien();
  const { toast } = useUI();
  const [c, setC] = useState<ConfigGeneral>(d.config);
  const [salas13, setSalas13] = useState(d.config.pasillo13Salas.join(", "));
  const [salas410, setSalas410] = useState(d.config.pasillo410Salas.join(", "));
  const [cats, setCats] = useState<Categoria[]>(d.categorias);
  const [probando, setProbando] = useState(false);

  useEffect(() => {
    setC(d.config);
    setSalas13(d.config.pasillo13Salas.join(", "));
    setSalas410(d.config.pasillo410Salas.join(", "));
  }, [d.config]);
  useEffect(() => setCats(d.categorias), [d.categorias]);

  const num = (k: keyof ConfigGeneral) => (e: ChangeEvent<HTMLInputElement>) =>
    setC({ ...c, [k]: Math.max(0, parseInt(e.target.value, 10) || 0) });

  const guardar = (detalle: string) =>
    guardarConfig(
      quien,
      {
        ...c,
        pasillo13Salas: aLista(salas13),
        pasillo410Salas: aLista(salas410),
      },
      detalle,
    )
      .then(() => toast("Configuración guardada"))
      .catch((e) => toast(errorTexto(e), "error"));

  const probar = async () => {
    setProbando(true);
    try {
      await probarClave(c.tmdbKey.trim());
      toast("¡La clave de TMDB funciona!");
    } catch (e) {
      toast(errorTexto(e), "error");
    } finally {
      setProbando(false);
    }
  };

  const usadas = new Set(d.materiales.map((m) => m.categoriaId));

  return (
    <div>
      <div className="cabecera">
        <div>
          <h1>Configuración</h1>
          <p>
            Datos del conjunto, espacios físicos, búsqueda de pósters y
            categorías.
          </p>
        </div>
      </div>

      <div className="rejilla rejilla-2" style={{ alignItems: "start" }}>
        <div className="tarjeta" style={{ marginTop: 0 }}>
          <h3>Conjunto y constancia de entrega</h3>
          <div className="pila">
            <label className="campo">
              <span>Nombre del conjunto</span>
              <input
                value={c.conjunto}
                onChange={(e) => setC({ ...c, conjunto: e.target.value })}
              />
            </label>
            <label className="campo">
              <span>Nombre de quien firma</span>
              <input
                value={c.gerenteNombre}
                onChange={(e) => setC({ ...c, gerenteNombre: e.target.value })}
                placeholder="Nombre de la Gerente General"
              />
            </label>
            <label className="campo">
              <span>Cargo</span>
              <input
                value={c.gerenteCargo}
                onChange={(e) => setC({ ...c, gerenteCargo: e.target.value })}
              />
            </label>
            <button
              className="btn btn-primario"
              onClick={() => guardar("Datos del conjunto")}
            >
              Guardar
            </button>
          </div>

          <h3 className="mt">Búsqueda de pósters (TMDB)</h3>
          <div className="pila">
            <label className="campo">
              <span>Clave de API o token de lectura</span>
              <input
                type="password"
                value={c.tmdbKey}
                onChange={(e) => setC({ ...c, tmdbKey: e.target.value })}
              />
              <small>
                En themoviedb.org → Configuración → API. Revisa la guía, paso 4.
              </small>
            </label>
            <div className="fila">
              <button
                className="btn"
                onClick={probar}
                disabled={!c.tmdbKey || probando}
              >
                {probando ? "Probando…" : "Probar"}
              </button>
              <button
                className="btn btn-primario"
                onClick={() => guardar("Clave de TMDB actualizada")}
              >
                Guardar clave
              </button>
            </div>
          </div>
        </div>

        <div className="tarjeta" style={{ marginTop: 0 }}>
          <h3>Espacios físicos</h3>
          <div className="rejilla rejilla-2">
            <label className="campo">
              <span>Carteleras pasillo 1-3</span>
              <input
                type="number"
                value={c.pasillo13Total}
                onChange={num("pasillo13Total")}
              />
              <small>Total, contando las de salas</small>
            </label>
            <label className="campo">
              <span>Salas del pasillo 1-3</span>
              <input
                value={salas13}
                onChange={(e) => setSalas13(e.target.value)}
              />
            </label>
            <label className="campo">
              <span>Carteleras pasillo 4-10</span>
              <input
                type="number"
                value={c.pasillo410Total}
                onChange={num("pasillo410Total")}
              />
            </label>
            <label className="campo">
              <span>Salas del pasillo 4-10</span>
              <input
                value={salas410}
                onChange={(e) => setSalas410(e.target.value)}
              />
            </label>
            <label className="campo">
              <span>Taquilla</span>
              <input
                type="number"
                value={c.taquillaEspacios}
                onChange={num("taquillaEspacios")}
              />
            </label>
            <label className="campo">
              <span>Lobby</span>
              <input
                type="number"
                value={c.lobbyEspacios}
                onChange={num("lobbyEspacios")}
              />
            </label>
            <label className="campo">
              <span>Gerencia</span>
              <input
                type="number"
                value={c.gerenciaEspacios}
                onChange={num("gerenciaEspacios")}
              />
              <small>Se controla a mano, el sugeridor no la toca</small>
            </label>
            <label className="campo">
              <span>Standees grandes en taquilla</span>
              <input
                type="number"
                value={c.standeesGrandesTaquilla}
                onChange={num("standeesGrandesTaquilla")}
              />
            </label>
            <label className="campo">
              <span>Standees pequeños en taquilla</span>
              <input
                type="number"
                value={c.standeesChicosTaquilla}
                onChange={num("standeesChicosTaquilla")}
              />
            </label>
            <label className="campo">
              <span>Standees pequeños en lobby</span>
              <input
                type="number"
                value={c.standeesChicosLobby}
                onChange={num("standeesChicosLobby")}
              />
              <small>0 = todos los restantes</small>
            </label>
          </div>
          <p className="muted chico">
            Carteleras libres para pósters: pasillo 1-3 ={" "}
            {Math.max(0, c.pasillo13Total - aLista(salas13).length)}, pasillo
            4-10 = {Math.max(0, c.pasillo410Total - aLista(salas410).length)}.
          </p>
          <button
            className="btn btn-primario mt"
            onClick={() => guardar("Espacios físicos")}
          >
            Guardar espacios
          </button>
        </div>
      </div>

      <div className="tarjeta">
        <div className="tarjeta-cab">
          <h3>Categorías de material</h3>
          <button
            className="btn btn-chico"
            onClick={() =>
              setCats(
                cats.concat({
                  id: "cat_" + Date.now().toString(36),
                  nombre: "",
                  rol: "ninguno",
                }),
              )
            }
          >
            + Agregar categoría
          </button>
        </div>
        <p className="muted chico" style={{ marginTop: 0 }}>
          El "uso" le dice al sugeridor dónde puede colocar ese material.
        </p>
        <div className="pila">
          {cats.map((cat, i) => (
            <div key={cat.id} className="fila" style={{ flexWrap: "nowrap" }}>
              <input
                value={cat.nombre}
                placeholder="Nombre de la categoría"
                onChange={(e) => {
                  const n = cats.slice();
                  n[i] = { ...cat, nombre: e.target.value };
                  setCats(n);
                }}
              />
              <select
                value={cat.rol}
                onChange={(e) => {
                  const n = cats.slice();
                  n[i] = { ...cat, rol: e.target.value as RolCategoria };
                  setCats(n);
                }}
              >
                {ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.t}
                  </option>
                ))}
              </select>
              <button
                className="btn-icono"
                disabled={usadas.has(cat.id)}
                title={
                  usadas.has(cat.id) ? "Tiene material registrado" : "Quitar"
                }
                onClick={() => setCats(cats.filter((x) => x.id !== cat.id))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          className="btn btn-primario mt"
          onClick={() => {
            if (cats.some((x) => !x.nombre.trim()))
              return toast("Todas las categorías necesitan nombre", "error");
            guardarCategorias(
              quien,
              cats.map((x) => ({ ...x, nombre: x.nombre.trim() })),
            )
              .then(() => toast("Categorías guardadas"))
              .catch((e) => toast(errorTexto(e), "error"));
          }}
        >
          Guardar categorías
        </button>
      </div>
    </div>
  );
}
