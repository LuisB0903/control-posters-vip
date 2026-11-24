import { useEffect, useState, type ChangeEvent } from 'react';
import { useData } from '../context/DataContext';
import { useQuien } from '../context/AuthContext';
import { CabPagina, CampoClave, Icono, useUI } from '../components/ui';
import { guardarCategorias, guardarConfig } from '../lib/acciones';
import { probarClave } from '../lib/tmdb';
import { errorTexto } from '../lib/utilidades';
import { DIAS_SEMANA, semanaActual } from '../lib/fechas';
import type { Categoria, ConfigGeneral, RolCategoria } from '../types';

const ROLES: { id: RolCategoria; t: string }[] = [
  { id: 'cartelera', t: 'Póster de película (taquilla, salas, lobby y pasillos)' },
  { id: 'publicidad', t: 'Publicidad del cine (relleno)' },
  { id: 'standee_grande', t: 'Standee grande (taquilla)' },
  { id: 'standee_chico', t: 'Standee pequeño (taquilla y lobby)' },
  { id: 'ninguno', t: 'Solo inventario (el sugeridor no lo mueve)' },
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
  const [salas13, setSalas13] = useState(d.config.pasillo13Salas.join(', '));
  const [salas410, setSalas410] = useState(d.config.pasillo410Salas.join(', '));
  const [cats, setCats] = useState<Categoria[]>(d.categorias);
  const [probando, setProbando] = useState(false);

  useEffect(() => {
    setC(d.config);
    setSalas13(d.config.pasillo13Salas.join(', '));
    setSalas410(d.config.pasillo410Salas.join(', '));
  }, [d.config]);
  useEffect(() => setCats(d.categorias), [d.categorias]);

  const num = (k: keyof ConfigGeneral) => (e: ChangeEvent<HTMLInputElement>) =>
    setC({ ...c, [k]: Math.max(0, parseInt(e.target.value, 10) || 0) });

  const guardar = (detalle: string) =>
    guardarConfig(quien, { ...c, pasillo13Salas: aLista(salas13), pasillo410Salas: aLista(salas410) }, detalle)
      .then(() => toast('Configuración guardada'))
      .catch((e) => toast(errorTexto(e), 'error'));

  const probar = async () => {
    setProbando(true);
    try {
      await probarClave(c.tmdbKey.trim());
      toast('¡La clave de TMDB funciona!');
    } catch (e) {
      toast(errorTexto(e), 'error');
    } finally {
      setProbando(false);
    }
  };

  const usadas = new Set(d.materiales.map((m) => m.categoriaId));

  const libres13 = Math.max(0, c.pasillo13Total - aLista(salas13).length - ((c.gerenciaPasillo || 'pasillo13') === 'pasillo13' ? c.gerenciaEspacios : 0));
  const libres410 = Math.max(0, c.pasillo410Total - aLista(salas410).length - (c.gerenciaPasillo === 'pasillo410' ? c.gerenciaEspacios : 0));
  const semanaConfig = semanaActual(c);

  return (
    <div>
      <CabPagina titulo="Configuración" desc="Datos del conjunto, espacios físicos, búsqueda de pósters y categorías. Cada sección se guarda por separado." />

      <div className="ajustes">
        {/* ── Conjunto ── */}
        <section className="ajustes-seccion">
          <div className="ajustes-intro">
            <h2>Conjunto y constancia</h2>
            <p>Nombre del cine y quién firma la constancia de entrega a los cinepolitos.</p>
          </div>
          <div className="ajustes-cuerpo">
            <div className="ajustes-campos">
              <label className="campo ancho-completo">
                <span>Nombre del conjunto</span>
                <input value={c.conjunto} onChange={(e) => setC({ ...c, conjunto: e.target.value })} />
              </label>
              <label className="campo">
                <span>Nombre de quien firma</span>
                <input value={c.gerenteNombre} onChange={(e) => setC({ ...c, gerenteNombre: e.target.value })} placeholder="Nombre de la Gerente General" />
              </label>
              <label className="campo">
                <span>Cargo</span>
                <input value={c.gerenteCargo} onChange={(e) => setC({ ...c, gerenteCargo: e.target.value })} />
              </label>
              <label className="campo ancho-completo">
                <span>Quién entrega el material a los cinepolitos</span>
                <input value={c.entregaContacto} onChange={(e) => setC({ ...c, entregaContacto: e.target.value })} />
                <small>Aparece en el aviso del portal: "Acércate con … para su entrega".</small>
              </label>
            </div>
            <div className="ajustes-pie">
              <button className="btn btn-primario" onClick={() => guardar('Datos del conjunto')}>
                Guardar datos del conjunto
              </button>
            </div>
          </div>
        </section>

        {/* ── Espacios ── */}
        <section className="ajustes-seccion">
          <div className="ajustes-intro">
            <h2>Espacios físicos</h2>
            <p>Cuántas carteleras y standees caben en cada zona. El sugeridor nunca coloca más de lo que hay aquí.</p>
            <dl className="cifras cifras-compactas cifras-columna">
              <div className={libres13 ? 'cifra-ok' : 'cifra-alerta'}>
                <dt>Pasillo 1-3</dt>
                <dd>
                  {libres13} <small>libres</small>
                </dd>
              </div>
              <div className={libres410 ? 'cifra-ok' : 'cifra-alerta'}>
                <dt>Pasillo 4-10</dt>
                <dd>
                  {libres410} <small>libres</small>
                </dd>
              </div>
            </dl>
          </div>
          <div className="ajustes-cuerpo">
            <h3 className="ajustes-grupo">Pasillos</h3>
            <div className="ajustes-campos">
              <label className="campo">
                <span>Carteleras pasillo 1-3</span>
                <input type="number" min={0} value={c.pasillo13Total} onChange={num('pasillo13Total')} />
                <small>Total, contando las de salas</small>
              </label>
              <label className="campo">
                <span>Salas del pasillo 1-3</span>
                <input value={salas13} onChange={(e) => setSalas13(e.target.value)} />
                <small>Separadas por coma</small>
              </label>
              <label className="campo">
                <span>Carteleras pasillo 4-10</span>
                <input type="number" min={0} value={c.pasillo410Total} onChange={num('pasillo410Total')} />
              </label>
              <label className="campo">
                <span>Salas del pasillo 4-10</span>
                <input value={salas410} onChange={(e) => setSalas410(e.target.value)} />
              </label>
            </div>
            <h3 className="ajustes-grupo">Zonas</h3>
            <div className="ajustes-campos ajustes-campos-3">
              <label className="campo">
                <span>Taquilla</span>
                <input type="number" min={0} value={c.taquillaEspacios} onChange={num('taquillaEspacios')} />
              </label>
              <label className="campo">
                <span>Lobby</span>
                <input type="number" min={0} value={c.lobbyEspacios} onChange={num('lobbyEspacios')} />
                <small>Zona vigilada</small>
              </label>
              <label className="campo">
                <span>Gerencia</span>
                <input type="number" min={0} value={c.gerenciaEspacios} onChange={num('gerenciaEspacios')} />
                <small>Vigilada por cámara</small>
              </label>
              <label className="campo ancho-completo">
                <span>Gerencia está físicamente en</span>
                <select
                  value={c.gerenciaPasillo || 'pasillo13'}
                  onChange={(e) => setC({ ...c, gerenciaPasillo: e.target.value as ConfigGeneral['gerenciaPasillo'] })}
                >
                  <option value="pasillo13">Pasillo 1-3</option>
                  <option value="pasillo410">Pasillo 4-10</option>
                  <option value="ninguno">Fuera de los pasillos</option>
                </select>
                <small>Cuenta dentro del total de ese pasillo y no se repite póster con él.</small>
              </label>
            </div>
            <h3 className="ajustes-grupo">Standees</h3>
            <div className="ajustes-campos ajustes-campos-3">
              <label className="campo">
                <span>Grandes en taquilla</span>
                <input type="number" min={0} value={c.standeesGrandesTaquilla} onChange={num('standeesGrandesTaquilla')} />
              </label>
              <label className="campo">
                <span>Pequeños en taquilla</span>
                <input type="number" min={0} value={c.standeesChicosTaquilla} onChange={num('standeesChicosTaquilla')} />
              </label>
              <label className="campo">
                <span>Pequeños en lobby</span>
                <input type="number" min={0} value={c.standeesChicosLobby} onChange={num('standeesChicosLobby')} />
                <small>0 = todos los restantes</small>
              </label>
            </div>
            <p className="ajustes-nota">
              <Icono n="shield" /> Lobby y gerencia son zonas vigiladas: ahí van los pósters marcados como propensos a robo.
            </p>
            <div className="ajustes-pie">
              <button className="btn btn-primario" onClick={() => guardar('Espacios físicos')}>
                Guardar espacios
              </button>
            </div>
          </div>
        </section>

        {/* ── Cambio de semana ── */}
        <section className="ajustes-seccion">
          <div className="ajustes-intro">
            <h2>Cambio de semana</h2>
            <p>Día y hora en que el panel pasa a la semana siguiente. Hasta entonces se sigue mostrando la anterior.</p>
          </div>
          <div className="ajustes-cuerpo">
            <div className="ajustes-campos">
              <label className="campo">
                <span>Día</span>
                <select value={c.cambioSemanaDia || 1} onChange={(e) => setC({ ...c, cambioSemanaDia: parseInt(e.target.value, 10) })}>
                  {DIAS_SEMANA.map((dia, i) => (
                    <option key={dia} value={i + 1}>
                      {dia}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Hora</span>
                <select value={c.cambioSemanaHora || 0} onChange={(e) => setC({ ...c, cambioSemanaHora: parseInt(e.target.value, 10) })}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {(h % 12 === 0 ? 12 : h % 12) + ':00 ' + (h < 12 ? 'a.m.' : 'p.m.')}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="ajustes-nota">
              <Icono n="event_repeat" /> Con esta configuración, ahora mismo es la <b>semana {semanaConfig.semana}</b> de {semanaConfig.anio}.
            </p>
            <div className="ajustes-pie">
              <button
                className="btn btn-primario"
                onClick={() => guardar('Cambio de semana: ' + DIAS_SEMANA[(c.cambioSemanaDia || 1) - 1] + ' ' + (c.cambioSemanaHora || 0) + ':00')}
              >
                Guardar cambio de semana
              </button>
            </div>
          </div>
        </section>

        {/* ── TMDB ── */}
        <section className="ajustes-seccion">
          <div className="ajustes-intro">
            <h2>Búsqueda de pósters</h2>
            <p>Clave de The Movie Database (TMDB) para buscar películas y su arte al registrar material.</p>
          </div>
          <div className="ajustes-cuerpo">
            <label className="campo">
              <span>Clave de API o token de lectura</span>
              <CampoClave value={c.tmdbKey} onChange={(v) => setC({ ...c, tmdbKey: v })} autoComplete="off" />
              <small>En themoviedb.org → Configuración → API. Revisa la guía, paso 4.</small>
            </label>
            <div className="ajustes-pie">
              <button className="btn" onClick={probar} disabled={!c.tmdbKey || probando}>
                <Icono n="network_check" /> {probando ? 'Probando…' : 'Probar clave'}
              </button>
              <button className="btn btn-primario" onClick={() => guardar('Clave de TMDB actualizada')}>
                Guardar clave
              </button>
            </div>
          </div>
        </section>

        {/* ── Categorías ── */}
        <section className="ajustes-seccion">
          <div className="ajustes-intro">
            <h2>Categorías de material</h2>
            <p>El uso le dice al sugeridor dónde puede colocar cada tipo de material. Las que ya tienen material no se pueden quitar.</p>
          </div>
          <div className="ajustes-cuerpo">
            <ul className="lista-categorias">
              {cats.map((cat, i) => (
                <li key={cat.id}>
                  <label className="campo">
                    <span className="solo-lector">Nombre de la categoría</span>
                    <input
                      value={cat.nombre}
                      placeholder="Nombre de la categoría"
                      onChange={(e) => {
                        const n = cats.slice();
                        n[i] = { ...cat, nombre: e.target.value };
                        setCats(n);
                      }}
                    />
                  </label>
                  <label className="campo">
                    <span className="solo-lector">Uso en el sugeridor</span>
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
                  </label>
                  {usadas.has(cat.id) ? (
                    <span className="categoria-usada" title="Tiene material registrado: no se puede quitar">
                      <Icono n="lock" />
                    </span>
                  ) : (
                    <button
                      className="btn-icono"
                      aria-label={'Quitar categoría ' + (cat.nombre || 'sin nombre')}
                      title="Quitar"
                      onClick={() => setCats(cats.filter((x) => x.id !== cat.id))}
                    >
                      <Icono n="close" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="ajustes-pie">
              <button className="btn" onClick={() => setCats(cats.concat({ id: 'cat_' + Date.now().toString(36), nombre: '', rol: 'ninguno' }))}>
                <Icono n="add" /> Agregar categoría
              </button>
              <button
                className="btn btn-primario"
                onClick={() => {
                  if (cats.some((x) => !x.nombre.trim())) return toast('Todas las categorías necesitan nombre', 'error');
                  guardarCategorias(quien, cats.map((x) => ({ ...x, nombre: x.nombre.trim() })))
                    .then(() => toast('Categorías guardadas'))
                    .catch((e) => toast(errorTexto(e), 'error'));
                }}
              >
                Guardar categorías
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
