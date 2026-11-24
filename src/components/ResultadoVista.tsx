import { createContext, useContext, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { Asignacion, ConfigGeneral, Material, Pieza, ResultadoSugerencia, RolCategoria, Ubicacion } from '../types';
import { useData } from '../context/DataContext';
import { Icono, Modal, Poster } from './ui';
import { etiquetaUbic, mismaUbic } from '../lib/ubicaciones';
import { etiquetaVersion } from '../lib/acciones';
import { contiene } from '../lib/texto';

interface Grupo {
  clave: string;
  titulo: string;
  sub?: string;
  items: Asignacion[];
}

function agrupar(r: ResultadoSugerencia): Grupo[] {
  const res = (pred: (a: Asignacion) => boolean) => r.asignaciones.filter(pred);
  const resumen = (tipo: Ubicacion['tipo']) => r.resumen.find((z) => z.zona.tipo === tipo);
  const sub = (tipo: Ubicacion['tipo']) => {
    const z = resumen(tipo);
    return z ? z.usados + ' de ' + z.total + ' carteleras' : undefined;
  };
  return [
    { clave: 'taquilla', titulo: 'Taquilla', sub: sub('taquilla'), items: res((a) => a.zona.tipo === 'taquilla' && a.grupo === 'carteleras') },
    { clave: 'taquilla-st', titulo: 'Standees en taquilla', items: res((a) => a.zona.tipo === 'taquilla' && a.grupo === 'standees') },
    { clave: 'lobby', titulo: 'Lobby', sub: sub('lobby'), items: res((a) => a.zona.tipo === 'lobby' && a.grupo === 'carteleras') },
    { clave: 'lobby-st', titulo: 'Standees en lobby', items: res((a) => a.zona.tipo === 'lobby' && a.grupo === 'standees') },
    { clave: 'gerencia', titulo: 'Gerencia (zona vigilada)', sub: sub('gerencia'), items: res((a) => a.zona.tipo === 'gerencia') },
    {
      clave: 'salas',
      titulo: 'Salas',
      items: res((a) => a.zona.tipo === 'sala').sort((a, b) => (a.zona.sala || 0) - (b.zona.sala || 0)),
    },
    { clave: 'p13', titulo: 'Pasillo 1-3', sub: sub('pasillo13'), items: res((a) => a.zona.tipo === 'pasillo13') },
    { clave: 'p410', titulo: 'Pasillo 4-10', sub: sub('pasillo410'), items: res((a) => a.zona.tipo === 'pasillo410') },
  ].filter((g) => g.items.length || g.clave === 'taquilla' || g.clave === 'p13' || g.clave === 'p410');
}

function Lugar({ a }: { a: Asignacion }) {
  return <>{a.zona.tipo === 'sala' ? 'Sala ' + a.zona.sala : etiquetaUbic(a.zona)}</>;
}

const lugarTexto = (u: Ubicacion) => (u.tipo === 'sala' ? 'Sala ' + u.sala : etiquetaUbic(u));
const esPasillo = (u: Ubicacion) => u.tipo === 'pasillo13' || u.tipo === 'pasillo410';

/* ════════════ Edición manual ════════════ */
interface Edicion {
  activa: boolean;
  abrir: (a: Asignacion | null, zona: Ubicacion, grupo: Asignacion['grupo']) => void;
}
const EdicionCtx = createContext<Edicion>({ activa: false, abrir: () => {} });

/** Envuelve una tarjeta: si la edición está activa, al tocarla se abre el selector de material */
function Editable({ a, className, style, children }: { a: Asignacion; className: string; style?: CSSProperties; children: ReactNode }) {
  const ed = useContext(EdicionCtx);
  if (!ed.activa)
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  const abrir = () => ed.abrir(a, a.zona, a.grupo);
  return (
    <div
      className={className + ' editable'}
      style={style}
      role="button"
      tabIndex={0}
      title="Toca para cambiar este material"
      onClick={abrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          abrir();
        }
      }}
    >
      <span className="btn-editar-slot" aria-hidden="true">
        <Icono n="edit" />
      </span>
      {children}
    </div>
  );
}

function BotonAgregar({ zona, grupo, texto, alto }: { zona: Ubicacion; grupo: Asignacion['grupo']; texto: string; alto?: number }) {
  const ed = useContext(EdicionCtx);
  if (!ed.activa) return null;
  return (
    <button className="zp-agregar" style={alto ? { minHeight: alto } : undefined} onClick={() => ed.abrir(null, zona, grupo)}>
      <Icono n="add_circle" className="ico-24" />
      <span className="chico negrita">{texto}</span>
    </button>
  );
}

function ChipManual({ a }: { a: Asignacion }) {
  return a.manual ? (
    <span className="chip chip-manual">
      <Icono n="edit" /> Manual
    </span>
  ) : null;
}

const TAQUILLA: Ubicacion = { tipo: 'taquilla', sala: null };
const LOBBY: Ubicacion = { tipo: 'lobby', sala: null };

/** Selector para cambiar (o agregar) el material de un espacio */
function ElegirMaterial({
  r,
  indice,
  zona: zonaInicial,
  grupo,
  onCerrar,
  onGuardar,
}: {
  r: ResultadoSugerencia;
  indice: number | null;
  zona: Ubicacion;
  grupo: Asignacion['grupo'];
  onCerrar: () => void;
  onGuardar: (asignaciones: Asignacion[]) => void;
}) {
  const d = useData();
  const [busqueda, setBusqueda] = useState('');
  const [zona, setZona] = useState<Ubicacion>(zonaInicial);
  const actual = indice !== null ? r.asignaciones[indice] : null;
  const rolDe = useMemo(() => new Map(d.categorias.map((c) => [c.id, c.rol] as [string, RolCategoria])), [d.categorias]);
  const rol = (m: Material): RolCategoria => rolDe.get(m.categoriaId) || 'ninguno';
  const roles: RolCategoria[] = grupo === 'carteleras' ? ['cartelera', 'publicidad'] : ['standee_grande', 'standee_chico'];

  // piezas que ya ocupa otro espacio en esta semana
  const ocupadas = useMemo(() => {
    const s = new Set<string>();
    r.asignaciones.forEach((a, i) => {
      if (i !== indice && a.materialId && a.piezaN !== null) s.add(a.materialId + '#' + a.piezaN);
    });
    return s;
  }, [r, indice]);

  // gerencia cuenta como parte del pasillo donde está físicamente
  const pasilloDe = (u: Ubicacion): string | null => (u.tipo === 'gerencia' ? d.config.gerenciaPasillo : esPasillo(u) ? u.tipo : null);
  const pasZona = grupo === 'carteleras' ? pasilloDe(zona) : null;
  const enMismoPasillo = useMemo(() => {
    const s = new Set<string>();
    if (!pasZona) return s;
    r.asignaciones.forEach((a, i) => {
      if (i === indice || a.grupo !== 'carteleras' || a.tipo === 'vacio') return;
      if (pasilloDe(a.zona) === pasZona) s.add(a.peliculaId || a.materialId || '');
    });
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, indice, pasZona]);

  const prioridad = (p: Pieza) => (mismaUbic(p.ubic, zona) ? 0 : p.ubic.tipo === 'bodega' ? 1 : 2);
  const ordenEstado = (o: { pel: { estado: string } | null }) =>
    !o.pel ? 2 : o.pel.estado === 'cartelera' ? 0 : o.pel.estado === 'proximamente' ? 1 : 3;

  const opciones = d.materiales
    .filter((m) => roles.indexOf(rol(m)) >= 0)
    .map((m) => {
      const activas = m.piezas.filter((p) => p.estado === 'activa');
      const libres = activas.filter((p) => !ocupadas.has(m.id + '#' + p.n)).sort((a, b) => prioridad(a) - prioridad(b));
      const pel = m.peliculaId ? d.peliculaPorId.get(m.peliculaId) || null : null;
      const esActual = !!actual && actual.materialId === m.id;
      const piezaActual = esActual && actual && actual.piezaN !== null ? activas.find((p) => p.n === actual.piezaN) : undefined;
      const pieza = piezaActual || libres[0] || null;
      return { m, pel, activas, pieza, esActual };
    })
    .filter((o) => o.activas.length > 0)
    .filter(
      (o) =>
        !busqueda.trim() ||
        contiene(o.m.titulo, busqueda) ||
        contiene(o.m.arte || '', busqueda) ||
        (!!o.pel && contiene(o.pel.tituloOriginal || '', busqueda)),
    )
    .sort(
      (a, b) =>
        Number(b.esActual) - Number(a.esActual) ||
        Number(!!b.pieza) - Number(!!a.pieza) ||
        ordenEstado(a) - ordenEstado(b) ||
        a.m.titulo.localeCompare(b.m.titulo) ||
        b.m.version - a.m.version,
    );

  const elegir = (o: (typeof opciones)[number]) => {
    if (!o.pieza) return;
    const notas = ['Cambio manual'];
    if (grupo === 'standees') notas.unshift(rol(o.m) === 'standee_grande' ? 'Standee grande' : 'Standee pequeño');
    if (o.m.propensoRobo) notas.push('Propenso a robo');
    const nueva: Asignacion = {
      zona,
      grupo,
      tipo: rol(o.m) === 'publicidad' ? 'publicidad' : 'pelicula',
      materialId: o.m.id,
      piezaN: o.pieza.n,
      peliculaId: o.m.peliculaId,
      titulo: o.m.titulo,
      version: o.m.version,
      arte: o.m.arte || null,
      imagenUrl: o.m.imagenUrl,
      notas,
      manual: true,
    };
    const lista = r.asignaciones.slice();
    if (indice === null) lista.push(nueva);
    else lista[indice] = nueva;
    onGuardar(lista);
  };

  const vaciar = () => {
    if (indice === null || !actual) return onCerrar();
    const lista = r.asignaciones.slice();
    // en pasillos y standees se quita el espacio; en taquilla, lobby, gerencia y salas queda vacío
    if (esPasillo(actual.zona) || grupo === 'standees') lista.splice(indice, 1);
    else
      lista[indice] = {
        zona: actual.zona,
        grupo,
        tipo: 'vacio',
        materialId: null,
        piezaN: null,
        peliculaId: null,
        titulo: 'Sin material',
        version: null,
        arte: null,
        imagenUrl: null,
        notas: ['Vaciado a mano'],
        manual: true,
      };
    onGuardar(lista);
  };

  const hayActual = !!actual && actual.tipo !== 'vacio';
  const quitarTexto = actual && (esPasillo(actual.zona) || grupo === 'standees') ? 'Quitar este espacio' : 'Dejar vacío';

  return (
    <Modal
      abierto
      ancho={620}
      titulo={(indice === null ? 'Agregar en ' : 'Cambiar · ') + lugarTexto(zona)}
      onCerrar={onCerrar}
      pie={
        <>
          {hayActual && (
            <button className="btn btn-peligro" onClick={vaciar} style={{ marginRight: 'auto' }}>
              <Icono n="remove_circle" /> {quitarTexto}
            </button>
          )}
          <button className="btn" onClick={onCerrar}>
            Cancelar
          </button>
        </>
      }
    >
      {hayActual && actual && (
        <p className="chico muted" style={{ marginTop: 0 }}>
          Ahora: <b>{actual.titulo}</b> {etiquetaVersion(actual.version, actual.arte)}
          {actual.piezaN ? ' · pieza #' + actual.piezaN : ''}
        </p>
      )}
      {grupo === 'standees' && (
        <div className="fila" style={{ gap: 6, marginBottom: 8 }}>
          {[TAQUILLA, LOBBY].map((z) => (
            <button key={z.tipo} className={'btn btn-chico' + (z.tipo === zona.tipo ? ' btn-vip' : '')} onClick={() => setZona(z)}>
              {etiquetaUbic(z)}
            </button>
          ))}
        </div>
      )}
      <label className="buscador">
        <Icono n="search" />
        <input autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar película, publicidad o arte…" />
      </label>
      <div className="elegir-lista">
        {opciones.length === 0 && <p className="muted chico">No hay material que coincida.</p>}
        {opciones.map((o) => {
          const avisos: string[] = [];
          if (o.m.propensoRobo && zona.tipo !== 'lobby' && zona.tipo !== 'gerencia') avisos.push('Propenso a robo');
          if (pasZona && enMismoPasillo.has(o.m.peliculaId || o.m.id)) avisos.push('Ya está en este pasillo');
          if (o.pel && o.pel.estado === 'salio') avisos.push('Salió de cartelera');
          const cat = d.categoriaPorId.get(o.m.categoriaId);
          const origen = !o.pieza
            ? 'Todas sus piezas ya están asignadas esta semana'
            : 'Pieza #' +
              o.pieza.n +
              ' · ' +
              (mismaUbic(o.pieza.ubic, zona) ? 'ya está aquí' : o.pieza.ubic.tipo === 'bodega' ? 'sale de bodega' : 'se mueve desde ' + etiquetaUbic(o.pieza.ubic));
          return (
            <button key={o.m.id} className={'elegir-item' + (o.esActual ? ' actual' : '')} disabled={!o.pieza} onClick={() => elegir(o)}>
              <span className="variante-mini">
                {o.m.imagenUrl ? (
                  <img src={o.m.imagenUrl} alt="" loading="lazy" />
                ) : (
                  <Icono n={grupo === 'standees' ? 'accessibility_new' : 'image'} />
                )}
              </span>
              <span className="elegir-cuerpo">
                <b>
                  {o.m.titulo} v{o.m.version}
                </b>
                <span className="chico">
                  <span className="muted">{cat ? cat.nombre : o.m.categoriaId}</span>
                  {o.m.arte && <span className="chip chip-oro">Arte: {o.m.arte}</span>}
                  {o.esActual && <span className="chip chip-verde">Actual</span>}
                  {o.pel && o.pel.estado === 'cartelera' && <span className="chip">En cartelera</span>}
                  {o.pel && o.pel.estado === 'proximamente' && <span className="chip chip-oro">Próximamente</span>}
                  {avisos.map((x) => (
                    <span key={x} className="chip chip-rojo">
                      {x}
                    </span>
                  ))}
                </span>
                <span className="chico muted">{origen}</span>
              </span>
              <Icono n={o.pieza ? 'chevron_right' : 'block'} />
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

/** Tarjeta de póster dentro de una zona (pasillos y salas) */
function PosterZona({ a, codigo }: { a: Asignacion; codigo: string }) {
  const d = useData();
  const m = a.materialId ? d.materialPorId.get(a.materialId) : null;
  const img = (m && m.imagenUrl) || a.imagenUrl;
  return (
    <Editable a={a} className={'zp ' + (a.tipo === 'publicidad' ? 'publicidad' : a.tipo === 'vacio' ? 'vacio' : '')}>
      <div className="poster-envoltura">
        <span className="zp-codigo">{codigo}</span>
        <Poster url={img} alt={a.titulo} />
        {a.version ? (
          <span className={'zp-version' + (a.tipo === 'publicidad' ? ' gris' : '')}>
            v{a.version}
            {a.piezaN ? ' #' + a.piezaN : ''}
          </span>
        ) : null}
      </div>
      <div className="zp-titulo" title={a.titulo + (a.arte ? ' · ' + a.arte : '')}>
        {a.titulo}
        {a.arte ? ' · ' + a.arte : ''}
      </div>
      <div className={'zp-sub' + (a.manual ? ' texto-oro' : '')} title={a.notas.join(' · ')}>
        {a.manual
          ? a.tipo === 'vacio'
            ? 'Vaciado a mano'
            : 'Cambio manual'
          : a.tipo === 'publicidad'
          ? 'Publicidad del cine'
          : a.tipo === 'vacio'
          ? 'Sin material'
          : a.notas[0] || 'Versión más nueva'}
      </div>
    </Editable>
  );
}

function ZonaPasillo({
  titulo,
  zona,
  items,
  total,
  regla,
}: {
  titulo: string;
  zona: Ubicacion;
  items: Asignacion[];
  total: number;
  regla: string;
}) {
  const [todos, setTodos] = useState(false);
  const visibles = todos ? items : items.slice(0, 5);
  const resto = items.length - visibles.length;
  const ids = items.filter((a) => a.tipo !== 'vacio').map((a) => a.peliculaId || a.materialId || '');
  const repetidos = ids.length !== new Set(ids).size;
  return (
    <div className="zona">
      <div className="zona-cab">
        <div>
          <h3>
            <Icono n="view_column" /> {titulo} ({items.length} de {total} carteleras)
          </h3>
          <p>{regla}</p>
        </div>
        {repetidos ? (
          <span className="chip chip-rojo">
            <Icono n="warning" /> Póster repetido
          </span>
        ) : (
          <span className="chip chip-verde">
            <Icono n="check" /> Sin duplicados
          </span>
        )}
      </div>
      <div className="zona-posters">
        {items.length === 0 && (
          <p className="muted" style={{ padding: '0 16px 6px' }}>
            Sin carteleras asignadas.
          </p>
        )}
        {visibles.map((a, i) => (
          <PosterZona key={i} a={a} codigo={'C-' + (i + 1 < 10 ? '0' : '') + (i + 1)} />
        ))}
        {resto > 0 && (
          <button className="zp-mas" onClick={() => setTodos(true)}>
            <Icono n="grid_view" className="ico-24" />
            <b>+{resto}</b>
            <span className="chico">carteleras más</span>
            <span className="chico negrita">Ver todas ({items.length}) →</span>
          </button>
        )}
        {todos && items.length > 5 && (
          <button className="zp-mas" onClick={() => setTodos(false)}>
            <Icono n="unfold_less" className="ico-24" />
            <span className="chico negrita">Mostrar menos</span>
          </button>
        )}
        {items.length < total && <BotonAgregar zona={zona} grupo="carteleras" texto={'Agregar cartelera (' + (total - items.length) + ' libre(s))'} />}
      </div>
    </div>
  );
}

export function ResultadoVista({ r, onEditar }: { r: ResultadoSugerencia; onEditar?: (asignaciones: Asignacion[]) => void }) {
  const d = useData();
  const [edit, setEdit] = useState<{ indice: number | null; zona: Ubicacion; grupo: Asignacion['grupo'] } | null>(null);
  const edicion: Edicion = {
    activa: !!onEditar,
    abrir: (a, zona, grupo) => setEdit({ indice: a ? r.asignaciones.indexOf(a) : null, zona, grupo }),
  };
  const cart = r.asignaciones.filter((a) => a.grupo === 'carteleras');
  const taquilla = cart.filter((a) => a.zona.tipo === 'taquilla');
  const lobby = cart.filter((a) => a.zona.tipo === 'lobby');
  const gerencia = cart.filter((a) => a.zona.tipo === 'gerencia');
  const vigiladas = lobby.concat(gerencia);
  const salas = cart.filter((a) => a.zona.tipo === 'sala').sort((a, b) => (a.zona.sala || 0) - (b.zona.sala || 0));
  const p13 = cart.filter((a) => a.zona.tipo === 'pasillo13');
  const p410 = cart.filter((a) => a.zona.tipo === 'pasillo410');
  const standees = r.asignaciones.filter((a) => a.grupo === 'standees');
  const total = (tipo: string) => {
    const z = r.resumen.find((x) => x.zona.tipo === tipo);
    return z ? z.total : 0;
  };
  const usados = (l: Asignacion[]) => l.filter((a) => a.tipo !== 'vacio').length;
  const manuales = r.asignaciones.filter((a) => a.manual).length;
  const notasDe = new Map<string, string[]>();
  r.asignaciones.forEach((a) => a.materialId && notasDe.set(a.materialId + '#' + a.piezaN, a.notas));
  const img = (a: Asignacion) => {
    const m = a.materialId ? d.materialPorId.get(a.materialId) : null;
    return (m && m.imagenUrl) || a.imagenUrl;
  };

  return (
    <EdicionCtx.Provider value={edicion}>
      <div className="seccion-titulo" style={{ marginTop: 0 }}>
        <div>
          <h2>Matriz de colocación por zonas</h2>
        </div>
        <div className="leyenda">
          <span>
            <i style={{ background: 'var(--rojo)' }} /> Taquilla ({usados(taquilla)})
          </span>
          <span>
            <i style={{ background: 'var(--oro)' }} /> Lobby y gerencia ({usados(vigiladas)})
          </span>
          <span>
            <i style={{ background: 'var(--verde)' }} /> Pasillos ({p13.length + p410.length})
          </span>
        </div>
      </div>

      {onEditar && (
        <div className="alerta" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Icono n="touch_app" className="texto-oro" />
          <span>
            <b className="negrita">¿Quieres cambiar algo?</b> Toca cualquier póster o standee para cambiarlo, dejarlo vacío o agregar uno
            nuevo. La hoja de movimientos se recalcula sola.
            {manuales > 0 && <span className="texto-oro"> Llevas {manuales} cambio(s) manual(es).</span>}
          </span>
        </div>
      )}

      {r.avisos.length > 0 && (
        <div className="alerta alerta-aviso">
          <strong>Avisos ({r.avisos.length})</strong>
          <ul>
            {r.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="matriz">
        <div className="zona">
          <div className="zona-cab">
            <div>
              <h3>
                <Icono n="local_activity" /> Taquilla principal
              </h3>
              <p>
                {usados(taquilla)} de {total('taquilla')} carteleras asignadas
              </p>
            </div>
            <span className="chip chip-rojo">Alta prioridad</span>
          </div>
          <div className="taq-grid">
            {taquilla.map((a, i) => (
              <Editable key={i} a={a} className={'taq-item' + (a.tipo === 'vacio' ? ' vacio' : '')}>
                <div className="poster-envoltura">
                  <Poster url={img(a)} alt={a.titulo} />
                </div>
                <div className="taq-cuerpo">
                  <div className="fila" style={{ gap: 4 }}>
                    {a.notas.some((n) => n.indexOf('Estreno') >= 0) && <span className="chip chip-oro">Estreno de la semana</span>}
                    {a.notas.some((n) => n.indexOf('taquillera') >= 0) && <span className="chip chip-azul">Taquillera</span>}
                    {a.notas.some((n) => n.indexOf('Garantía') >= 0) && <span className="chip chip-solido">Sello Garantía</span>}
                    <ChipManual a={a} />
                  </div>
                  <div className="taq-titulo">{a.titulo}</div>
                  <div className="chico muted">
                    {a.version ? 'Versión ' + etiquetaVersion(a.version, a.arte) + ' · Pieza #' + a.piezaN : a.notas.join(' · ')}
                  </div>
                  <div className="taq-pos">Taquilla #{i + 1}</div>
                </div>
              </Editable>
            ))}
            {taquilla.length < total('taquilla') && <BotonAgregar zona={TAQUILLA} grupo="carteleras" texto="Agregar en taquilla" alto={110} />}
          </div>
        </div>

        <div className="zona-col">
          <div className="zona">
            <div className="zona-cab">
              <div>
                <h3>
                  <Icono n="shield" /> Zonas vigiladas
                </h3>
                <p>
                  Lobby {usados(lobby)} de {total('lobby')} · Gerencia {usados(gerencia)} de {total('gerencia')}
                </p>
              </div>
              <span className="chip chip-oro">Antirrobo</span>
            </div>
            <div className="taq-grid">
              {vigiladas.length === 0 && !onEditar && <span className="muted chico">Sin asignaciones.</span>}
              {vigiladas.map((a, i) => (
                <Editable
                  key={i}
                  a={a}
                  className={'taq-item' + (a.tipo === 'vacio' ? ' vacio' : '')}
                  style={{ flexDirection: 'column', gap: 4 }}
                >
                  <span className="fila" style={{ gap: 4 }}>
                    <span className="chip">{a.zona.tipo === 'gerencia' ? 'Gerencia' : 'Lobby'}</span>
                    {a.notas.some((n) => n.indexOf('robo') >= 0) && (
                      <span className="chip chip-oro">
                        <Icono n="shield_lock" /> Propenso a robo
                      </span>
                    )}
                    <ChipManual a={a} />
                  </span>
                  <span className="caps texto-oro">
                    {a.tipo === 'publicidad'
                      ? 'Publicidad del cine'
                      : a.notas.filter((n) => n.indexOf('robo') < 0 && n !== 'Cambio manual')[0] || (a.manual ? 'Elegido a mano' : 'Próximo estreno')}
                  </span>
                  <span className="taq-titulo">
                    {a.titulo}
                    {a.version ? ' ' + etiquetaVersion(a.version, a.arte) : ''}
                  </span>
                  <span className="chico muted">{a.piezaN ? 'Pieza #' + a.piezaN : ''}</span>
                </Editable>
              ))}
              {lobby.length < total('lobby') && <BotonAgregar zona={LOBBY} grupo="carteleras" texto="Agregar en lobby" alto={90} />}
              {gerencia.length < total('gerencia') && (
                <BotonAgregar zona={{ tipo: 'gerencia', sala: null }} grupo="carteleras" texto="Agregar en gerencia" alto={90} />
              )}
            </div>
          </div>
          <div className="zona">
            <div className="zona-cab">
              <div>
                <h3>
                  <Icono n="accessibility_new" /> Standees
                </h3>
                <p>{standees.length} standee(s) asignado(s)</p>
              </div>
              {standees.length > 0 && <span className="chip chip-verde">OK</span>}
            </div>
            {standees.length === 0 && !onEditar ? (
              <p className="muted chico" style={{ padding: '0 16px 6px' }}>
                Sin standees para colocar.
              </p>
            ) : (
              <div className="mini-grid">
                {standees.map((a, i) => (
                  <Editable key={i} a={a} className="mini">
                    <Icono n={a.notas.some((n) => n.indexOf('grande') >= 0) ? 'accessibility_new' : 'view_in_ar'} />
                    <b title={a.titulo}>{a.titulo}</b>
                    <span className={a.manual ? 'texto-oro' : 'muted'}>
                      <Lugar a={a} /> · #{a.piezaN}
                      {a.manual ? ' · manual' : ''}
                    </span>
                  </Editable>
                ))}
                <BotonAgregar zona={TAQUILLA} grupo="standees" texto="Agregar standee" alto={90} />
              </div>
            )}
          </div>
        </div>
      </div>

      {salas.length > 0 && (
        <div className="zona" style={{ marginTop: 16 }}>
          <div className="zona-cab">
            <div>
              <h3>
                <Icono n="chair" /> Salas ({usados(salas)} de {salas.length})
              </h3>
              <p>Una cartelera por sala: su película o publicidad del cine</p>
            </div>
          </div>
          <div className="zona-posters">
            {salas.map((a, i) => (
              <PosterZona key={i} a={a} codigo={'SALA ' + a.zona.sala} />
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <ZonaPasillo
          titulo="Pasillo 1-3"
          zona={{ tipo: 'pasillo13', sala: null }}
          items={p13}
          total={total('pasillo13')}
          regla="Regla estricta: sin repetir póster en el pasillo · versión más nueva"
        />
      </div>
      <div style={{ marginTop: 16 }}>
        <ZonaPasillo
          titulo="Pasillo 4-10"
          zona={{ tipo: 'pasillo410', sala: null }}
          items={p410}
          total={total('pasillo410')}
          regla="Regla estricta: sin repetir póster en el pasillo · versión más nueva"
        />
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-cab">
          <div className="panel-titulo">
            <span className="icono-caja rojo">
              <Icono n="move_up" />
            </span>
            <div>
              <h3>Hoja de movimientos a realizar en piso</h3>
              <p>Primero se retira lo que sale y después se coloca lo nuevo.</p>
            </div>
          </div>
          <span className="chip">{r.movimientos.length} acción(es)</span>
        </div>
        {r.movimientos.length === 0 ? (
          <p className="muted">No hay que mover nada: todo ya está en su lugar.</p>
        ) : (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Paso</th>
                  <th>Operación</th>
                  <th>Póster y versión</th>
                  <th>Origen</th>
                  <th>Destino</th>
                  <th>Instrucción</th>
                </tr>
              </thead>
              <tbody>
                {r.movimientos.map((mv, i) => {
                  const retira = mv.hacia.tipo === 'bodega';
                  const notas = notasDe.get(mv.materialId + '#' + mv.piezaN) || [];
                  const especial = notas.filter((n) => n.indexOf('Garantía') >= 0 || n.indexOf('Se usa v') >= 0 || n === 'Cambio manual');
                  return (
                    <tr key={i}>
                      <td className="negrita">#{(i + 1 < 10 ? '0' : '') + (i + 1)}</td>
                      <td>
                        <span className={'op ' + (retira ? 'op-retirar' : 'op-colocar')}>
                          <Icono n={retira ? 'south' : 'north'} /> {retira ? 'Retirar' : 'Colocar'}
                        </span>
                      </td>
                      <td>
                        <div className="negrita">
                          {mv.titulo} {etiquetaVersion(mv.version, mv.arte)}
                        </div>
                        <div className="chico muted">Copia #{mv.piezaN}</div>
                      </td>
                      <td>{etiquetaUbic(mv.desde)}</td>
                      <td>
                        <span className={'destino' + (mv.hacia.tipo === 'taquilla' ? ' fuerte' : '')}>{etiquetaUbic(mv.hacia)}</span>
                      </td>
                      <td className="chico">
                        {especial.length ? (
                          <span className="texto-oro">{especial.join(' · ')}</span>
                        ) : retira ? (
                          <span className="muted">Guardar en bodega</span>
                        ) : (
                          <span className="muted">{notas[0] || '—'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {edit && onEditar && (
        <ElegirMaterial
          r={r}
          indice={edit.indice}
          zona={edit.zona}
          grupo={edit.grupo}
          onCerrar={() => setEdit(null)}
          onGuardar={(lista) => {
            onEditar(lista);
            setEdit(null);
          }}
        />
      )}
    </EdicionCtx.Provider>
  );
}

/** Hoja imprimible para el equipo que coloca los pósters */
export function HojaColocacion({
  r,
  semana,
  anio,
  config,
}: {
  r: ResultadoSugerencia;
  semana: number;
  anio: number;
  config: ConfigGeneral;
}) {
  const grupos = agrupar(r);
  return (
    <div className="hoja">
      <div className="hoja-cab">
        <div>
          <h1>Colocación de publicidad · Semana {semana}</h1>
          <div>{config.conjunto}</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '9pt' }}>
          Año {anio}
          <br />
          Impreso: {new Date().toLocaleString('es-MX')}
        </div>
      </div>
      {grupos
        .filter((g) => g.items.length)
        .map((g) => (
          <div key={g.clave}>
            <h2>
              {g.titulo} {g.sub ? '(' + g.sub + ')' : ''}
            </h2>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '18pt' }}></th>
                  <th>Material</th>
                  <th style={{ width: '50pt' }}>Pieza</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((a, i) => (
                  <tr key={i}>
                    <td>
                      <span className="casilla" />
                    </td>
                    <td>
                      {a.zona.tipo === 'sala' ? 'Sala ' + a.zona.sala + ': ' : ''}
                      <b>
                        {a.titulo}
                        {a.version ? ' ' + etiquetaVersion(a.version, a.arte) : ''}
                      </b>
                      {a.tipo === 'publicidad' ? ' (publicidad del cine)' : ''}
                    </td>
                    <td>{a.piezaN ? '#' + a.piezaN : '—'}</td>
                    <td style={{ fontSize: '9pt' }}>{a.notas.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      {r.movimientos.length > 0 && (
        <>
          <h2>Movimientos</h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: '18pt' }}></th>
                <th>Material</th>
                <th>Pieza</th>
                <th>Desde</th>
                <th>Hacia</th>
              </tr>
            </thead>
            <tbody>
              {r.movimientos.map((mv, i) => (
                <tr key={i}>
                  <td>
                    <span className="casilla" />
                  </td>
                  <td>
                    {mv.titulo} {etiquetaVersion(mv.version, mv.arte)}
                  </td>
                  <td>#{mv.piezaN}</td>
                  <td>{etiquetaUbic(mv.desde)}</td>
                  <td>
                    <b>{etiquetaUbic(mv.hacia)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {r.avisos.length > 0 && (
        <>
          <h2>Avisos</h2>
          <ul style={{ fontSize: '9.5pt' }}>
            {r.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
