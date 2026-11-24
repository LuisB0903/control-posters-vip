import { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useQuien } from '../context/AuthContext';
import {
  BotonFiltros,
  Buscador,
  CabPagina,
  EstadoApartado,
  Icono,
  Interruptor,
  Pestanas,
  PieFiltros,
  Pildoras,
  Poster,
  useUI,
  Vacio,
} from '../components/ui';
import HojaEntrega from '../components/HojaEntrega';
import { cambiarEstadoApartado, desecharRestantes, entregarPosters, marcarSeleccionados, nombreMaterial, resolverCategoria } from '../lib/acciones';
import { aDate, fmtFecha, fmtFechaHora, vencido } from '../lib/fechas';
import { contiene } from '../lib/texto';
import { posicionesDeMaterial, posicionesTodas, textoLugar, type Lugar } from '../lib/fila';
import { descargarCsv, errorTexto } from '../lib/utilidades';
import type { Apartado, EstadoApartado as TipoEstado, Material } from '../types';

type Tab = 'apartados' | 'entregar' | 'posters' | 'historial';
type FiltroEstado = 'todos' | 'abiertos' | TipoEstado;

const ESTADO_TXT: Record<TipoEstado, string> = {
  apartado: 'Apartado',
  seleccionado: 'Seleccionado',
  entregado: 'Entregado',
  no_entregado: 'No entregado',
};
/** Apartados que siguen abiertos (aún se pueden entregar) */
const abierto = (a: Apartado) => a.estado === 'apartado' || a.estado === 'seleccionado';

const iniciales = (n: string) =>
  n
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('');

export default function Apartados() {
  const d = useData();
  const [tab, setTab] = useState<Tab>('apartados');
  const [empleadoEntrega, setEmpleadoEntrega] = useState('');
  const abiertos = d.apartados.filter(abierto).length;
  const porEntregar = new Set(d.apartados.filter((a) => a.estado === 'seleccionado').map((a) => a.empleadoId)).size;
  const publicados = d.materiales.filter((m) => m.cinepolitos && m.piezas.some((p) => p.estado === 'activa')).length;
  return (
    <div>
      <CabPagina titulo="Apartados y entregas" desc="Material que apartaron los cinepolitos, entregas con constancia y desecho." />
      <Pestanas<Tab>
        valor={tab}
        onCambio={setTab}
        opciones={[
          { id: 'apartados', etiqueta: 'Apartados', cuenta: abiertos },
          { id: 'entregar', etiqueta: 'Entregar', cuenta: porEntregar },
          { id: 'posters', etiqueta: 'Por material', cuenta: publicados },
          { id: 'historial', etiqueta: 'Entregas realizadas' },
        ]}
      />
      {tab === 'apartados' && <ListaApartados />}
      {tab === 'entregar' && <Entregar inicial={empleadoEntrega} />}
      {tab === 'posters' && (
        <PorPoster
          irAEntregar={(id) => {
            setEmpleadoEntrega(id);
            setTab('entregar');
          }}
        />
      )}
      {tab === 'historial' && <Historial />}
    </div>
  );
}

/** Lugar en la fila: "Apartado #2" (alcanza pieza) o "En fila #3" */
function ChipLugar({ a, l }: { a: Apartado; l: Lugar | undefined }) {
  if (a.estado === 'no_entregado' || !l) return <span className="muted">—</span>;
  if (a.estado === 'entregado')
    return (
      <span className="lugar lugar-cerrado">
        <Icono n="task_alt" /> #{l.pos}
      </span>
    );
  return l.enStock ? (
    <span className="lugar lugar-stock" title={'Turno ' + l.pos + ': alcanza pieza'}>
      <Icono n="inventory_2" /> {textoLugar(l)}
    </span>
  ) : (
    <span className="lugar lugar-fila" title={'Turno ' + l.pos + ': ya no alcanza pieza'}>
      <Icono n="hourglass_top" /> {textoLugar(l)}
    </span>
  );
}

function claseFila(a: Apartado, l: Lugar | undefined): string {
  if (!l || (a.estado !== 'apartado' && a.estado !== 'seleccionado')) return '';
  return l.enStock ? 'fila-stock' : 'fila-espera';
}

/* ───────── Lista con filtros ───────── */
function ListaApartados() {
  const d = useData();
  const quien = useQuien();
  const { toast, confirmar, imprimir } = useUI();

  /** ¿Existe una entrega real (con constancia) de este apartado? */
  const tieneEntrega = (a: Apartado) =>
    d.entregas.some((e) => e.empleadoId === a.empleadoId && e.items.some((i) => i.materialId === a.materialId));

  const cambiarEstado = async (a: Apartado, estado: TipoEstado) => {
    if (estado !== 'entregado') {
      return cambiarEstadoApartado(quien, a, estado, d.apartados, nombreCat)
        .then(() => toast('Apartado actualizado'))
        .catch((er) => toast(errorTexto(er), 'error'));
    }
    // "Entregado" = entrega completa: registra la entrega, saca la pieza del inventario y genera la constancia
    const ok = await confirmar({
      titulo: 'Entregar ' + nombreCat(a.materialId).toLowerCase(),
      mensaje: (
        <>
          Se registrará la entrega de <b>{a.titulo} v{a.version}</b> a <b>{a.empleadoNombre}</b> (ID {a.empleadoId}), la pieza saldrá
          del inventario y se abrirá la constancia para firmar.
        </>
      ),
      aceptar: 'Entregar e imprimir',
    });
    if (!ok) return;
    try {
      const e = await entregarPosters(
        quien,
        d.config,
        { id: a.empleadoId, nombre: a.empleadoNombre },
        [a],
        d.materiales,
        d.categorias,
        d.apartados,
      );
      toast('Entrega registrada');
      imprimir(
        <HojaEntrega
          conjunto={e.conjunto}
          fecha={e.fecha}
          empleadoId={e.empleadoId}
          empleadoNombre={e.empleadoNombre}
          items={e.items}
          gerenteNombre={e.gerenteNombre}
          gerenteCargo={e.gerenteCargo}
          folio={e.id}
        />,
      );
    } catch (er) {
      toast(errorTexto(er), 'error');
    }
  };
  const [q, setQ] = useState('');
  const [fMaterial, setFMaterial] = useState('todos');
  const [fEstado, setFEstado] = useState<FiltroEstado>('abiertos');
  const nombreCat = resolverCategoria(d.materiales, d.categorias);
  const [fVigencia, setFVigencia] = useState<'todas' | 'vigentes' | 'vencidas'>('todas');
  const [agrupar, setAgrupar] = useState<'ninguno' | 'empleado' | 'poster'>('ninguno');
  const [verFiltros, setVerFiltros] = useState(false);
  const lugares = useMemo(() => posicionesTodas(d.apartados, d.materiales), [d.apartados, d.materiales]);

  const hastaDe = (a: Apartado) => {
    const m = d.materialPorId.get(a.materialId);
    return m && m.cinepolitos ? m.cinepolitos.hasta : null;
  };

  const filtrados = d.apartados.filter((a) => {
    if (fEstado === 'abiertos' ? !abierto(a) : fEstado !== 'todos' && a.estado !== fEstado) return false;
    if (fMaterial !== 'todos' && a.materialId !== fMaterial) return false;
    if (fVigencia !== 'todas') {
      const v = vencido(hastaDe(a));
      if (fVigencia === 'vigentes' ? v : !v) return false;
    }
    return contiene(a.empleadoId + ' ' + a.empleadoNombre + ' ' + a.titulo + ' ' + nombreCat(a.materialId), q);
  });

  const materialesConApartados = useMemo(() => {
    const ids = new Set(d.apartados.map((a) => a.materialId));
    return d.materiales.filter((m) => ids.has(m.id)).sort((a, b) => a.titulo.localeCompare(b.titulo));
  }, [d.apartados, d.materiales]);

  const grupos: { clave: string; titulo: string; items: Apartado[] }[] = [];
  if (agrupar === 'ninguno') grupos.push({ clave: 'todos', titulo: '', items: filtrados });
  else {
    const mapa = new Map<string, { clave: string; titulo: string; items: Apartado[] }>();
    filtrados.forEach((a) => {
      const k = agrupar === 'empleado' ? a.empleadoId : a.materialId;
      const t = agrupar === 'empleado' ? a.empleadoNombre + ' (' + a.empleadoId + ')' : nombreCat(a.materialId) + ': ' + a.titulo + ' v' + a.version;
      const g = mapa.get(k) || { clave: k, titulo: t, items: [] };
      g.items.push(a);
      mapa.set(k, g);
    });
    mapa.forEach((g) => grupos.push(g));
    grupos.sort((a, b) => a.titulo.localeCompare(b.titulo));
  }

  const exportar = () =>
    descargarCsv(
      'apartados.csv',
      [['Fecha', 'ID empleado', 'Nombre', 'Tipo', 'Material', 'Versión', 'Estado', 'Fecha límite']].concat(
        filtrados.map((a) => [
          fmtFechaHora(a.creadoEn),
          a.empleadoId,
          a.empleadoNombre,
          nombreCat(a.materialId),
          a.titulo,
          'v' + a.version,
          ESTADO_TXT[a.estado],
          fmtFecha(hastaDe(a)),
        ]),
      ),
    );

  const cuenta = (f: FiltroEstado) =>
    d.apartados.filter((a) => (f === 'abiertos' ? abierto(a) : f === 'todos' ? true : a.estado === f)).length;
  const activos = (fMaterial !== 'todos' ? 1 : 0) + (fVigencia !== 'todas' ? 1 : 0);
  const limpiar = () => {
    setQ('');
    setFMaterial('todos');
    setFVigencia('todas');
    setFEstado('abiertos');
  };

  return (
    <div>
      <div className="barra-busqueda">
        <div className="barra-busqueda-fila">
          <Buscador valor={q} onCambio={setQ} placeholder="ID, nombre o película" />
          <BotonFiltros abierto={verFiltros} activos={activos} onClick={() => setVerFiltros(!verFiltros)} />
        </div>
        <Pildoras<FiltroEstado>
          etiqueta="Estado del apartado"
          valor={fEstado}
          onCambio={setFEstado}
          opciones={[
            { id: 'abiertos', texto: 'Pendientes', cuenta: cuenta('abiertos') },
            { id: 'apartado', texto: 'Apartados', cuenta: cuenta('apartado') },
            { id: 'seleccionado', texto: 'Por recoger', cuenta: cuenta('seleccionado') },
            { id: 'entregado', texto: 'Entregados', cuenta: cuenta('entregado') },
            { id: 'no_entregado', texto: 'No entregados', cuenta: cuenta('no_entregado') },
            { id: 'todos', texto: 'Todos', cuenta: cuenta('todos') },
          ]}
        />
        <div className={'filtros-extra' + (verFiltros ? ' abierto' : '')}>
          <label className="campo">
            <span>Material</span>
            <select value={fMaterial} onChange={(e) => setFMaterial(e.target.value)}>
              <option value="todos">Todos</option>
              {materialesConApartados.map((m) => (
                <option key={m.id} value={m.id}>
                  {nombreCat(m.id)}: {nombreMaterial(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Fecha límite</span>
            <select value={fVigencia} onChange={(e) => setFVigencia(e.target.value as 'todas' | 'vigentes' | 'vencidas')}>
              <option value="todas">Todas</option>
              <option value="vigentes">Vigentes</option>
              <option value="vencidas">Ya vencidas</option>
            </select>
          </label>
          <label className="campo">
            <span>Agrupar por</span>
            <select value={agrupar} onChange={(e) => setAgrupar(e.target.value as 'ninguno' | 'empleado' | 'poster')}>
              <option value="ninguno">Sin agrupar</option>
              <option value="empleado">Cinepolito</option>
              <option value="poster">Material</option>
            </select>
          </label>
        </div>
        <PieFiltros activos={activos + (q ? 1 : 0) + (fEstado !== 'abiertos' ? 1 : 0)} onLimpiar={limpiar}>
          <b>{filtrados.length}</b> resultado(s)
          <button type="button" className="enlace-boton" onClick={exportar} disabled={!filtrados.length}>
            <Icono n="download" /> CSV
          </button>
        </PieFiltros>
      </div>

      {filtrados.length === 0 ? (
        <div className="tarjeta">
          <Vacio titulo="Sin apartados con esos filtros" icono="bookmark">
            Cambia el estado o limpia los filtros para ver más.
          </Vacio>
        </div>
      ) : (
        grupos.map((g) => (
          <section key={g.clave} className="grupo-lista">
            {g.titulo && (
              <h2 className="grupo-titulo">
                {g.titulo} <span>{g.items.length}</span>
              </h2>
            )}
            <div className="tabla-envoltura tarjetas-movil">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Cinepolito</th>
                    <th>Lugar</th>
                    <th>Apartado el</th>
                    <th>Fecha límite</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((a) => {
                    const m = d.materialPorId.get(a.materialId);
                    const venc = vencido(hastaDe(a));
                    const cerrado = a.estado === 'entregado' && tieneEntrega(a);
                    return (
                      <tr key={a.id} className={claseFila(a, lugares.get(a.id))}>
                        <td className="celda-principal">
                          <span className="celda-material">
                            <span className="celda-poster">
                              <Poster url={m ? m.imagenUrl : null} alt={a.titulo} chico />
                            </span>
                            <span>
                              <b>
                                {a.titulo} v{a.version}
                              </b>
                              <small>{nombreCat(a.materialId)}</small>
                            </span>
                          </span>
                        </td>
                        <td data-etiqueta="Cinepolito">
                          <span className="celda-persona">
                            <b>{a.empleadoNombre}</b>
                            <small>ID {a.empleadoId}</small>
                          </span>
                        </td>
                        <td data-etiqueta="Lugar">
                          <ChipLugar a={a} l={lugares.get(a.id)} />
                        </td>
                        <td data-etiqueta="Apartado el" className="celda-fecha">
                          {fmtFechaHora(a.creadoEn)}
                        </td>
                        <td data-etiqueta="Fecha límite" className={'celda-fecha' + (venc && abierto(a) ? ' texto-rojo negrita' : '')}>
                          {fmtFecha(hastaDe(a))}
                          {venc && abierto(a) && ' (vencida)'}
                        </td>
                        <td data-etiqueta="Estado">
                          <select
                            className={'select-estado-ap estado-sel-' + a.estado}
                            value={a.estado}
                            disabled={cerrado}
                            aria-label={'Estado del apartado de ' + a.empleadoNombre}
                            title={cerrado ? 'Ya se entregó (ver Entregas realizadas)' : ''}
                            onChange={(e) => cambiarEstado(a, e.target.value as TipoEstado)}
                          >
                            {(Object.keys(ESTADO_TXT) as TipoEstado[]).map((k) => (
                              <option key={k} value={k}>
                                {ESTADO_TXT[k]}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}

/* ───────── Entregar a un cinepolito ───────── */
function Entregar({ inicial }: { inicial: string }) {
  const d = useData();
  const quien = useQuien();
  const { toast, confirmar, imprimir } = useUI();
  const [empleadoId, setEmpleadoId] = useState(inicial);
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [ocupado, setOcupado] = useState(false);

  const nombreCat = resolverCategoria(d.materiales, d.categorias);
  const conPendientes = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; n: number; sel: number }>();
    d.apartados.filter(abierto).forEach((a) => {
      const v = m.get(a.empleadoId) || { id: a.empleadoId, nombre: a.empleadoNombre, n: 0, sel: 0 };
      v.n++;
      if (a.estado === 'seleccionado') v.sel++;
      m.set(a.empleadoId, v);
    });
    return Array.from(m.values()).sort((a, b) => b.sel - a.sel || a.nombre.localeCompare(b.nombre));
  }, [d.apartados]);

  const empleado = conPendientes.find((e) => e.id === empleadoId) || null;
  const pendientes = d.apartados
    .filter((a) => a.empleadoId === empleadoId && abierto(a))
    .sort((a, b) => Number(b.estado === 'seleccionado') - Number(a.estado === 'seleccionado'));
  const elegidos = pendientes.filter((a) => sel[a.id]);
  const porSeleccionar = elegidos.filter((a) => a.estado === 'apartado');

  // al elegir a un cinepolito, se marcan de una vez los que ya están "Seleccionado"
  useEffect(() => {
    const inicial: Record<string, boolean> = {};
    d.apartados.filter((a) => a.empleadoId === empleadoId && a.estado === 'seleccionado').forEach((a) => (inicial[a.id] = true));
    setSel(inicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleadoId]);

  const lugaresE = useMemo(() => posicionesTodas(d.apartados, d.materiales), [d.apartados, d.materiales]);
  const disponibles = (m: Material | undefined) => (m ? m.piezas.filter((p) => p.estado === 'activa').length : 0);
  const interesados = (materialId: string) => d.apartados.filter((a) => a.materialId === materialId && abierto(a)).length;
  const seleccionadosDe = (materialId: string) =>
    d.apartados.filter((a) => a.materialId === materialId && a.estado === 'seleccionado').length;

  const seleccionar = async () => {
    if (!empleado || !porSeleccionar.length) return;
    const ok = await confirmar({
      titulo: 'Marcar como seleccionado',
      mensaje: (
        <>
          <b>{empleado.nombre}</b> verá en la página de cinepolitos que tiene por recoger:{' '}
          {porSeleccionar.map((a) => nombreCat(a.materialId) + ' · ' + a.titulo + ' v' + a.version).join(', ')}.
        </>
      ),
      aceptar: 'Marcar seleccionado',
    });
    if (!ok) return;
    setOcupado(true);
    try {
      await marcarSeleccionados(quien, porSeleccionar, d.apartados, nombreCat);
      toast('Listo: se le avisará al poner su ID');
    } catch (er) {
      toast(errorTexto(er), 'error');
    } finally {
      setOcupado(false);
    }
  };

  const entregar = async () => {
    if (!empleado || !elegidos.length) return;
    const ok = await confirmar({
      titulo: 'Entregar ' + elegidos.length + ' póster(es)',
      mensaje: (
        <>
          A <b>{empleado.nombre}</b> (ID {empleado.id}): {elegidos.map((a) => a.titulo + ' v' + a.version).join(', ')}. Se generará la
          constancia para firmar.
        </>
      ),
      aceptar: 'Entregar e imprimir',
    });
    if (!ok) return;
    setOcupado(true);
    try {
      const e = await entregarPosters(quien, d.config, { id: empleado.id, nombre: empleado.nombre }, elegidos, d.materiales, d.categorias, d.apartados);
      toast('Entrega registrada');
      setSel({});
      imprimir(
        <HojaEntrega
          conjunto={e.conjunto}
          fecha={e.fecha}
          empleadoId={e.empleadoId}
          empleadoNombre={e.empleadoNombre}
          items={e.items}
          gerenteNombre={e.gerenteNombre}
          gerenteCargo={e.gerenteCargo}
          folio={e.id}
        />,
      );
    } catch (er) {
      toast(errorTexto(er), 'error');
    } finally {
      setOcupado(false);
    }
  };

  const visiblesPersonas = conPendientes.filter((e) => contiene(e.id + ' ' + e.nombre, busca));

  return (
    <div className={'entregar' + (empleado ? ' con-detalle' : '')}>
      <section className="entregar-personas bloque">
        <div className="bloque-cab">
          <h2>Cinepolitos con apartados</h2>
          <span className="bloque-desc">{conPendientes.length} persona(s)</span>
        </div>
        {conPendientes.length > 0 && <Buscador valor={busca} onCambio={setBusca} placeholder="Buscar ID o nombre" />}
        {conPendientes.length === 0 ? (
          <div className="bloque-vacio">
            <Icono n="task_alt" />
            <div>
              <strong>Nada por entregar</strong>
              <span>No hay apartados pendientes.</span>
            </div>
          </div>
        ) : (
          <ul className="lista-personas">
            {visiblesPersonas.map((e) => (
              <li key={e.id}>
                <button type="button" className={'persona' + (e.id === empleadoId ? ' activa' : '')} aria-current={e.id === empleadoId} onClick={() => setEmpleadoId(e.id)}>
                  <span className="persona-avatar" aria-hidden="true">
                    {iniciales(e.nombre)}
                  </span>
                  <span className="persona-datos">
                    <b>{e.nombre}</b>
                    <small>
                      ID {e.id} · {e.n} apartado(s)
                    </small>
                  </span>
                  {e.sel > 0 && <span className="estado-chip estado-chip-seleccionado">{e.sel} por recoger</span>}
                  <Icono n="chevron_right" className="persona-flecha" />
                </button>
              </li>
            ))}
            {visiblesPersonas.length === 0 && <li className="muted chico">Nadie coincide con "{busca}".</li>}
          </ul>
        )}
      </section>

      <section className="entregar-detalle bloque">
        {!empleado ? (
          <Vacio titulo="Elige a un cinepolito" icono="person_search">
            Verás su material apartado para avisarle o entregárselo.
          </Vacio>
        ) : (
          <>
            <button type="button" className="enlace-boton entregar-volver" onClick={() => setEmpleadoId('')}>
              <Icono n="arrow_back" /> Todos los cinepolitos
            </button>
            <div className="entregar-cab">
              <span className="persona-avatar grande" aria-hidden="true">
                {iniciales(empleado.nombre)}
              </span>
              <div>
                <h2>{empleado.nombre}</h2>
                <p>
                  ID {empleado.id} · marca el material para avisarle o entregárselo
                </p>
              </div>
            </div>
            <ul className="items-entrega">
              {pendientes.map((a) => {
                const m = d.materialPorId.get(a.materialId);
                const libres = disponibles(m);
                const otros = interesados(a.materialId);
                const yaSel = seleccionadosDe(a.materialId);
                return (
                  <li key={a.id}>
                    <label className={'item-entrega' + (sel[a.id] ? ' marcado' : '') + (!libres ? ' sin-piezas' : '')}>
                      <input
                        type="checkbox"
                        disabled={!libres}
                        checked={!!sel[a.id]}
                        onChange={(e) => setSel({ ...sel, [a.id]: e.target.checked })}
                      />
                      <span className="item-entrega-check" aria-hidden="true">
                        <Icono n="check" />
                      </span>
                      <span className="item-entrega-poster">
                        <Poster url={m ? m.imagenUrl : null} alt={a.titulo} chico />
                      </span>
                      <span className="item-entrega-cuerpo">
                        <b>
                          {a.titulo} v{a.version}
                        </b>
                        <small>{nombreCat(a.materialId)}</small>
                        <span className="item-entrega-estados">
                          <EstadoApartado estado={a.estado} />
                          <ChipLugar a={a} l={lugaresE.get(a.id)} />
                        </span>
                        <small className="item-entrega-meta">
                          {libres ? libres + ' pieza(s)' : 'Sin piezas'} · {otros} interesado(s) · {yaSel} seleccionado(s) · límite{' '}
                          {fmtFecha(m && m.cinepolitos ? m.cinepolitos.hasta : null)}
                        </small>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="entregar-ayuda">
              <b>Avisar</b> marca el material como seleccionado: {empleado.nombre.split(' ')[0]} verá un aviso al poner su ID para recogerlo con{' '}
              {d.config.entregaContacto}. Al <b>entregar</b>, la pieza sale del inventario y queda en el historial.
            </p>
            {!d.config.gerenteNombre && (
              <p className="entregar-ayuda">Captura el nombre de la Gerente General en Configuración para que aparezca en la constancia.</p>
            )}
            <div className="barra-acciones-fija">
              <button className="btn" disabled={!porSeleccionar.length || ocupado} onClick={seleccionar}>
                <Icono n="notifications" /> Avisar{porSeleccionar.length ? ' (' + porSeleccionar.length + ')' : ''}
              </button>
              <button className="btn btn-primario" disabled={!elegidos.length || ocupado} onClick={entregar}>
                <Icono n="print" /> {ocupado ? 'Registrando…' : 'Entregar' + (elegidos.length ? ' ' + elegidos.length : '') + ' e imprimir'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/* ───────── Vista por material ───────── */
function PorPoster({ irAEntregar }: { irAEntregar: (empleadoId: string) => void }) {
  const d = useData();
  const quien = useQuien();
  const { toast, confirmar } = useUI();
  const [verCerrados, setVerCerrados] = useState(false);

  const lista = d.materiales
    .filter((m) => m.cinepolitos)
    .filter((m) => verCerrados || m.piezas.some((p) => p.estado === 'activa'))
    .sort((a, b) => {
      const ha = aDate(a.cinepolitos!.hasta);
      const hb = aDate(b.cinepolitos!.hasta);
      return (ha ? ha.getTime() : 0) - (hb ? hb.getTime() : 0);
    });

  const nombreCat = resolverCategoria(d.materiales, d.categorias);
  const desechar = async (m: Material) => {
    const pend = d.apartados.filter((a) => a.materialId === m.id && abierto(a));
    const ok = await confirmar({
      titulo: 'Desechar ' + nombreMaterial(m),
      mensaje: (
        <>
          Se marcarán como desechadas las {m.piezas.filter((p) => p.estado === 'activa').length} pieza(s) que quedan
          {pend.length ? ' y ' + pend.length + ' apartado(s) quedarán como "No entregado"' : ''}. Se retira de la página de cinepolitos.
        </>
      ),
      aceptar: 'Desechar',
      peligro: true,
    });
    if (!ok) return;
    desecharRestantes(quien, m, pend, d.apartados, nombreCat)
      .then(() => toast('Material desechado'))
      .catch((e) => toast(errorTexto(e), 'error'));
  };

  return (
    <div>
      <div className="barra-busqueda barra-busqueda-simple">
        <Interruptor activo={verCerrados} onCambio={setVerCerrados} etiqueta="Mostrar también los cerrados (sin piezas)" />
        <span className="leyenda">
          <span>
            <i className="turno-muestra en-stock" /> Alcanza pieza
          </span>
          <span>
            <i className="turno-muestra" /> En fila
          </span>
        </span>
      </div>
      {lista.length === 0 ? (
        <div className="tarjeta">
          <Vacio titulo="No hay material publicado para cinepolitos" icono="local_activity">
            Marca una película como "Salió de cartelera" en Inventario para publicarla.
          </Vacio>
        </div>
      ) : (
        <div className="materiales-fila">
          {lista.map((m) => {
            const aps = d.apartados.filter((a) => a.materialId === m.id);
            const lugaresM = posicionesDeMaterial(d.apartados, m);
            const pend = aps.filter((a) => a.estado === 'apartado');
            const selec = aps.filter((a) => a.estado === 'seleccionado');
            const libres = m.piezas.filter((p) => p.estado === 'activa').length;
            const venc = vencido(m.cinepolitos!.hasta);
            return (
              <article className="material-fila" key={m.id}>
                <span className="material-fila-poster">
                  <Poster url={m.imagenUrl} alt={m.titulo} />
                </span>
                <div className="material-fila-cuerpo">
                  <div className="material-fila-cab">
                    <div style={{ minWidth: 0 }}>
                      <h3>{nombreMaterial(m)}</h3>
                      <p>
                        {nombreCat(m.id)}
                        {!m.cinepolitos!.activo && ' · oculto a cinepolitos'}
                      </p>
                    </div>
                    {libres > 0 && (
                      <button className="btn btn-chico btn-peligro" onClick={() => desechar(m)}>
                        <Icono n="delete_sweep" /> Desechar restantes
                      </button>
                    )}
                  </div>
                  <dl className="material-fila-datos">
                    <div className={venc ? 'dato-alerta' : ''}>
                      <dt>{venc ? 'Venció' : 'Entrega o desecho'}</dt>
                      <dd>{fmtFecha(m.cinepolitos!.hasta, true)}</dd>
                    </div>
                    <div>
                      <dt>Piezas</dt>
                      <dd>{libres}</dd>
                    </div>
                    <div>
                      <dt>Apartados</dt>
                      <dd>{pend.length}</dd>
                    </div>
                    <div className={selec.length > libres ? 'dato-alerta' : ''}>
                      <dt>Seleccionados</dt>
                      <dd>
                        {selec.length}
                        {selec.length > libres ? ' (más que piezas)' : ''}
                      </dd>
                    </div>
                  </dl>
                  {aps.length > 0 && (
                    <div className="turnos" aria-label="Orden de llegada">
                      {aps.map((a) => {
                        const l = lugaresM.get(a.id);
                        const stock = !!l && l.enStock && abierto(a);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            className={'turno turno-' + a.estado + (stock ? ' en-stock' : '')}
                            disabled={!abierto(a)}
                            title={(l ? textoLugar(l) + ' · ' : '') + ESTADO_TXT[a.estado] + (abierto(a) ? ' · toca para avisar o entregar' : '')}
                            onClick={() => abierto(a) && irAEntregar(a.empleadoId)}
                          >
                            {l && <span className="turno-n">#{l.pos}</span>}
                            <span className="turno-nombre">{a.empleadoNombre.split(' ').slice(-2).join(' ')}</span>
                            <span className="turno-estado">{ESTADO_TXT[a.estado]}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ───────── Historial ───────── */
function Historial() {
  const d = useData();
  const { imprimir } = useUI();
  const [q, setQ] = useState('');
  const lista = d.entregas.filter((e) => contiene(e.empleadoId + ' ' + e.empleadoNombre + ' ' + e.items.map((i) => i.titulo).join(' '), q));
  return (
    <div>
      <div className="barra-busqueda">
        <div className="barra-busqueda-fila">
          <Buscador valor={q} onCambio={setQ} placeholder="Cinepolito o película" />
        </div>
        <PieFiltros activos={q ? 1 : 0} onLimpiar={() => setQ('')}>
          <b>{lista.length}</b> entrega(s)
        </PieFiltros>
      </div>
      {lista.length === 0 ? (
        <div className="tarjeta">
          <Vacio titulo={q ? 'Ninguna entrega coincide' : 'Aún no hay entregas'} icono="receipt_long">
            {q ? 'Prueba con otro nombre o película.' : 'Las entregas con constancia aparecerán aquí.'}
          </Vacio>
        </div>
      ) : (
        <div className="tabla-envoltura tarjetas-movil">
          <table className="tabla">
            <thead>
              <tr>
                <th>Cinepolito</th>
                <th>Material</th>
                <th>Fecha</th>
                <th>Entregó</th>
                <th>
                  <span className="solo-lector">Constancia</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id}>
                  <td className="celda-principal">
                    <span className="celda-persona">
                      <b>{e.empleadoNombre}</b>
                      <small>ID {e.empleadoId}</small>
                    </span>
                  </td>
                  <td data-etiqueta="Material">{e.items.map((i) => i.titulo + ' v' + i.version).join(', ')}</td>
                  <td data-etiqueta="Fecha" className="celda-fecha">
                    {fmtFechaHora(e.fecha)}
                  </td>
                  <td data-etiqueta="Entregó">{e.adminNombre}</td>
                  <td className="derecha celda-acciones">
                    <button
                      className="btn btn-chico"
                      onClick={() =>
                        imprimir(
                          <HojaEntrega
                            conjunto={e.conjunto}
                            fecha={aDate(e.fecha) || new Date()}
                            empleadoId={e.empleadoId}
                            empleadoNombre={e.empleadoNombre}
                            items={e.items}
                            gerenteNombre={e.gerenteNombre}
                            gerenteCargo={e.gerenteCargo}
                            folio={e.id}
                          />,
                        )
                      }
                    >
                      <Icono n="print" /> Reimprimir constancia
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
