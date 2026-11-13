import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useQuien } from '../context/AuthContext';
import { Pestanas, Poster, useUI, Vacio } from '../components/ui';
import HojaEntrega from '../components/HojaEntrega';
import { cambiarEstadoApartado, desecharRestantes, entregarPosters, nombreMaterial } from '../lib/acciones';
import { aDate, fmtFecha, fmtFechaHora, vencido } from '../lib/fechas';
import { contiene } from '../lib/texto';
import { descargarCsv, errorTexto } from '../lib/utilidades';
import type { Apartado, EstadoApartado, Material } from '../types';

type Tab = 'apartados' | 'entregar' | 'posters' | 'historial';

const ESTADO_TXT: Record<EstadoApartado, string> = {
  apartado: 'Apartado',
  entregado: 'Entregado',
  no_entregado: 'No entregado',
};
const ESTADO_CHIP: Record<EstadoApartado, string> = {
  apartado: 'chip-morado',
  entregado: 'chip-verde',
  no_entregado: 'chip',
};

export default function Apartados() {
  const [tab, setTab] = useState<Tab>('apartados');
  const [empleadoEntrega, setEmpleadoEntrega] = useState('');
  return (
    <div>
      <div className="cabecera">
        <div>
          <h1>Apartados y entregas</h1>
          <p>Pósters que apartaron los cinepolitos, entregas con constancia y desecho.</p>
        </div>
      </div>
      <Pestanas<Tab>
        valor={tab}
        onCambio={setTab}
        opciones={[
          { id: 'apartados', etiqueta: 'Apartados' },
          { id: 'entregar', etiqueta: 'Entregar' },
          { id: 'posters', etiqueta: 'Por póster' },
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

/* ───────── Lista con filtros ───────── */
function ListaApartados() {
  const d = useData();
  const quien = useQuien();
  const { toast } = useUI();
  const [q, setQ] = useState('');
  const [fMaterial, setFMaterial] = useState('todos');
  const [fEstado, setFEstado] = useState<'todos' | EstadoApartado>('apartado');
  const [fVigencia, setFVigencia] = useState<'todas' | 'vigentes' | 'vencidas'>('todas');
  const [agrupar, setAgrupar] = useState<'ninguno' | 'empleado' | 'poster'>('ninguno');

  const hastaDe = (a: Apartado) => {
    const m = d.materialPorId.get(a.materialId);
    return m && m.cinepolitos ? m.cinepolitos.hasta : null;
  };

  const filtrados = d.apartados.filter((a) => {
    if (fEstado !== 'todos' && a.estado !== fEstado) return false;
    if (fMaterial !== 'todos' && a.materialId !== fMaterial) return false;
    if (fVigencia !== 'todas') {
      const v = vencido(hastaDe(a));
      if (fVigencia === 'vigentes' ? v : !v) return false;
    }
    return contiene(a.empleadoId + ' ' + a.empleadoNombre + ' ' + a.titulo, q);
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
      const t = agrupar === 'empleado' ? a.empleadoId + ' · ' + a.empleadoNombre : a.titulo + ' v' + a.version;
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
      [['Fecha', 'ID empleado', 'Nombre', 'Póster', 'Versión', 'Estado', 'Fecha límite']].concat(
        filtrados.map((a) => [fmtFechaHora(a.creadoEn), a.empleadoId, a.empleadoNombre, a.titulo, 'v' + a.version, ESTADO_TXT[a.estado], fmtFecha(hastaDe(a))]),
      ),
    );

  return (
    <div>
      <div className="tarjeta mb">
        <div className="rejilla rejilla-4">
          <label className="campo">
            <span>Buscar</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ID, nombre o película" />
          </label>
          <label className="campo">
            <span>Póster</span>
            <select value={fMaterial} onChange={(e) => setFMaterial(e.target.value)}>
              <option value="todos">Todos</option>
              {materialesConApartados.map((m) => (
                <option key={m.id} value={m.id}>
                  {nombreMaterial(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Estado</span>
            <select value={fEstado} onChange={(e) => setFEstado(e.target.value as 'todos' | EstadoApartado)}>
              <option value="todos">Todos</option>
              <option value="apartado">Apartado (pendiente)</option>
              <option value="entregado">Entregado</option>
              <option value="no_entregado">No entregado</option>
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
        </div>
        <div className="fila-entre mt">
          <div className="fila">
            <span className="etiqueta">Agrupar por</span>
            <select className="compacto" style={{ width: 'auto' }} value={agrupar} onChange={(e) => setAgrupar(e.target.value as 'ninguno' | 'empleado' | 'poster')}>
              <option value="ninguno">Sin agrupar</option>
              <option value="empleado">Cinepolito</option>
              <option value="poster">Póster</option>
            </select>
          </div>
          <div className="fila">
            <span className="muted chico">{filtrados.length} resultado(s)</span>
            <button className="btn btn-chico" onClick={exportar} disabled={!filtrados.length}>
              Descargar CSV
            </button>
          </div>
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="tarjeta">
          <Vacio titulo="Sin apartados con esos filtros" />
        </div>
      ) : (
        grupos.map((g) => (
          <div key={g.clave} className="mb">
            {g.titulo && (
              <h3 style={{ margin: '8px 0' }}>
                {g.titulo} <span className="chip">{g.items.length}</span>
              </h3>
            )}
            <div className="tabla-envoltura">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cinepolito</th>
                    <th>Póster</th>
                    <th>Fecha límite</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((a) => (
                    <tr key={a.id}>
                      <td className="chico">{fmtFechaHora(a.creadoEn)}</td>
                      <td>
                        <b>{a.empleadoId}</b> · {a.empleadoNombre}
                      </td>
                      <td>
                        {a.titulo} v{a.version}
                      </td>
                      <td className={vencido(hastaDe(a)) ? 'negrita' : ''}>{fmtFecha(hastaDe(a))}</td>
                      <td>
                        <select
                          className={'compacto'}
                          style={{ width: 'auto' }}
                          value={a.estado}
                          onChange={(e) =>
                            cambiarEstadoApartado(quien, a, e.target.value as EstadoApartado)
                              .then(() => toast('Apartado actualizado'))
                              .catch((er) => toast(errorTexto(er), 'error'))
                          }
                        >
                          {(Object.keys(ESTADO_TXT) as EstadoApartado[]).map((k) => (
                            <option key={k} value={k}>
                              {ESTADO_TXT[k]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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

  const conPendientes = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; n: number }>();
    d.apartados
      .filter((a) => a.estado === 'apartado')
      .forEach((a) => {
        const v = m.get(a.empleadoId) || { id: a.empleadoId, nombre: a.empleadoNombre, n: 0 };
        v.n++;
        m.set(a.empleadoId, v);
      });
    return Array.from(m.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [d.apartados]);

  const empleado = conPendientes.find((e) => e.id === empleadoId) || null;
  const pendientes = d.apartados.filter((a) => a.empleadoId === empleadoId && a.estado === 'apartado');
  const elegidos = pendientes.filter((a) => sel[a.id]);

  const disponibles = (m: Material | undefined) => (m ? m.piezas.filter((p) => p.estado === 'activa').length : 0);
  const competencia = (materialId: string) => d.apartados.filter((a) => a.materialId === materialId && a.estado === 'apartado').length;

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
      const e = await entregarPosters(quien, d.config, { id: empleado.id, nombre: empleado.nombre }, elegidos, d.materiales, d.categorias);
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

  return (
    <div className="rejilla rejilla-2" style={{ alignItems: 'start' }}>
      <div className="tarjeta">
        <h3>Cinepolitos con apartados pendientes</h3>
        <input className="mb" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar ID o nombre…" />
        {conPendientes.length === 0 && <p className="muted">No hay apartados pendientes.</p>}
        <div className="pila" style={{ maxHeight: 460, overflowY: 'auto' }}>
          {conPendientes
            .filter((e) => contiene(e.id + ' ' + e.nombre, busca))
            .map((e) => (
              <button
                key={e.id}
                className={'btn btn-bloque' + (e.id === empleadoId ? ' btn-primario' : '')}
                style={{ justifyContent: 'space-between' }}
                onClick={() => {
                  setEmpleadoId(e.id);
                  setSel({});
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {e.id} · {e.nombre}
                </span>
                <span className="chip">{e.n}</span>
              </button>
            ))}
        </div>
      </div>

      <div className="tarjeta">
        {!empleado ? (
          <Vacio titulo="Elige a un cinepolito">Verás sus pósters apartados para marcar cuáles se le entregan.</Vacio>
        ) : (
          <>
            <h3>{empleado.nombre}</h3>
            <p className="muted chico" style={{ marginTop: -6 }}>
              ID {empleado.id} · marca los pósters que se le entregan
            </p>
            <div className="pila">
              {pendientes.map((a) => {
                const m = d.materialPorId.get(a.materialId);
                const libres = disponibles(m);
                const otros = competencia(a.materialId);
                return (
                  <label key={a.id} className="material fila" style={{ cursor: libres ? 'pointer' : 'not-allowed', marginTop: 0 }}>
                    <input
                      type="checkbox"
                      disabled={!libres}
                      checked={!!sel[a.id]}
                      onChange={(e) => setSel({ ...sel, [a.id]: e.target.checked })}
                    />
                    <Poster url={m ? m.imagenUrl : null} alt={a.titulo} chico />
                    <div style={{ flex: 1 }}>
                      <div className="negrita">
                        {a.titulo} v{a.version}
                      </div>
                      <div className="muted chico">
                        {libres} pieza(s) disponible(s) · {otros} persona(s) lo apartaron · límite{' '}
                        {fmtFecha(m && m.cinepolitos ? m.cinepolitos.hasta : null)}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            <button className="btn btn-primario btn-bloque mt" disabled={!elegidos.length || ocupado} onClick={entregar}>
              {ocupado ? 'Registrando…' : 'Entregar ' + elegidos.length + ' y generar constancia'}
            </button>
            {!d.config.gerenteNombre && (
              <p className="muted chico">Tip: captura el nombre de la Gerente General en Configuración para que salga en la constancia.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ───────── Vista por póster ───────── */
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

  const desechar = async (m: Material) => {
    const pend = d.apartados.filter((a) => a.materialId === m.id && a.estado === 'apartado');
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
    desecharRestantes(quien, m, pend)
      .then(() => toast('Material desechado'))
      .catch((e) => toast(errorTexto(e), 'error'));
  };

  return (
    <div>
      <div className="fila mb">
        <label className="check">
          <input type="checkbox" checked={verCerrados} onChange={(e) => setVerCerrados(e.target.checked)} />
          Mostrar también los ya cerrados (sin piezas)
        </label>
      </div>
      {lista.length === 0 ? (
        <div className="tarjeta">
          <Vacio titulo="No hay pósters publicados para cinepolitos">
            Marca una película como "Salió de cartelera" en Inventario para publicarla.
          </Vacio>
        </div>
      ) : (
        <div className="pila">
          {lista.map((m) => {
            const aps = d.apartados.filter((a) => a.materialId === m.id);
            const pend = aps.filter((a) => a.estado === 'apartado');
            const libres = m.piezas.filter((p) => p.estado === 'activa').length;
            const venc = vencido(m.cinepolitos!.hasta);
            return (
              <div className="tarjeta" key={m.id} style={{ marginTop: 0 }}>
                <div className="fila" style={{ alignItems: 'flex-start' }}>
                  <div style={{ width: 70 }}>
                    <Poster url={m.imagenUrl} alt={m.titulo} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fila-entre">
                      <div>
                        <div className="negrita">{nombreMaterial(m)}</div>
                        <div className="fila chico" style={{ gap: 6, marginTop: 4 }}>
                          <span className={'chip ' + (venc ? 'chip-rojo' : 'chip-verde')}>
                            {venc ? 'Venció' : 'Entrega/desecho'} {fmtFecha(m.cinepolitos!.hasta, true)}
                          </span>
                          {!m.cinepolitos!.activo && <span className="chip">Oculto</span>}
                          <span className="chip">{libres} pieza(s)</span>
                          <span className="chip chip-morado">{pend.length} pendiente(s)</span>
                        </div>
                      </div>
                      {libres > 0 && (
                        <button className="btn btn-chico btn-peligro" onClick={() => desechar(m)}>
                          Desechar restantes
                        </button>
                      )}
                    </div>
                    {aps.length > 0 && (
                      <div className="fila mt" style={{ gap: 6 }}>
                        {aps.map((a) => (
                          <button
                            key={a.id}
                            className={'chip ' + ESTADO_CHIP[a.estado]}
                            style={{ border: 0, cursor: a.estado === 'apartado' ? 'pointer' : 'default' }}
                            title={a.estado === 'apartado' ? 'Ir a entregar' : ESTADO_TXT[a.estado]}
                            onClick={() => a.estado === 'apartado' && irAEntregar(a.empleadoId)}
                          >
                            {a.empleadoId} · {a.empleadoNombre.split(' ').slice(-2).join(' ')}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
      <input className="mb" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por empleado o película…" style={{ maxWidth: 360 }} />
      {lista.length === 0 ? (
        <div className="tarjeta">
          <Vacio titulo="Aún no hay entregas" />
        </div>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cinepolito</th>
                <th>Pósters</th>
                <th>Entregó</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id}>
                  <td className="chico">{fmtFechaHora(e.fecha)}</td>
                  <td>
                    <b>{e.empleadoId}</b> · {e.empleadoNombre}
                  </td>
                  <td>{e.items.map((i) => i.titulo + ' v' + i.version).join(', ')}</td>
                  <td>{e.adminNombre}</td>
                  <td className="derecha">
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
                      🖨 Reimprimir
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
