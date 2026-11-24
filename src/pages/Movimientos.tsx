import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import { BotonFiltros, Buscador, CabPagina, Cargando, Icono, PieFiltros, Pildoras, Vacio } from '../components/ui';
import { aDate, fmtFechaHora } from '../lib/fechas';
import { contiene } from '../lib/texto';
import { descargarCsv } from '../lib/utilidades';
import { iconoAccion } from '../lib/bitacora';
import type { Movimiento } from '../types';

type Rango = 'todo' | 'hoy' | '7' | '30' | 'otro';

/** AAAA-MM-DD en hora local (para los campos de fecha) */
const isoLocal = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

function etiquetaDia(f: Date): string {
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (isoLocal(f) === isoLocal(hoy)) return 'Hoy';
  if (isoLocal(f) === isoLocal(ayer)) return 'Ayer';
  const t = f.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: f.getFullYear() === hoy.getFullYear() ? undefined : 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function Movimientos() {
  const d = useData();
  const [lista, setLista] = useState<Movimiento[] | null>(null);
  const [tope, setTope] = useState(300);
  const [q, setQ] = useState('');
  const [admin, setAdmin] = useState('todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [rango, setRango] = useState<Rango>('todo');
  const [verFiltros, setVerFiltros] = useState(false);

  useEffect(() => {
    const u = onSnapshot(query(collection(db, 'movimientos'), orderBy('fecha', 'desc'), limit(tope)), (s) =>
      setLista(s.docs.map((x) => ({ id: x.id, ...(x.data() as Omit<Movimiento, 'id'>) }))),
    );
    return u;
  }, [tope]);

  if (!lista) return <Cargando />;

  const filtrados = lista.filter((m) => {
    if (admin !== 'todos' && m.adminUid !== admin) return false;
    const f = aDate(m.fecha);
    if (desde && f && f < new Date(desde + 'T00:00:00')) return false;
    if (hasta && f && f > new Date(hasta + 'T23:59:59')) return false;
    return contiene(m.accion + ' ' + m.detalle + ' ' + m.adminNombre, q);
  });

  /** Los atajos de rango solo llenan "Desde" y "Hasta" */
  const elegirRango = (r: Rango) => {
    setRango(r);
    if (r === 'otro') return;
    if (r === 'todo') {
      setDesde('');
      setHasta('');
      return;
    }
    const inicio = new Date();
    if (r === '7') inicio.setDate(inicio.getDate() - 6);
    if (r === '30') inicio.setDate(inicio.getDate() - 29);
    setDesde(isoLocal(inicio));
    setHasta(isoLocal(new Date()));
  };

  const activos = (admin !== 'todos' ? 1 : 0) + (desde || hasta ? 1 : 0) + (q ? 1 : 0);
  const limpiar = () => {
    setQ('');
    setAdmin('todos');
    elegirRango('todo');
  };

  // agrupar por día
  const dias: { clave: string; titulo: string; items: Movimiento[] }[] = [];
  filtrados.forEach((m) => {
    const f = aDate(m.fecha);
    const clave = f ? isoLocal(f) : 'sin-fecha';
    let g = dias[dias.length - 1];
    if (!g || g.clave !== clave) {
      g = { clave, titulo: f ? etiquetaDia(f) : 'Sin fecha', items: [] };
      dias.push(g);
    }
    g.items.push(m);
  });

  return (
    <div>
      <CabPagina
        titulo="Bitácora"
        desc="Todo lo que se hace en el panel y quién lo hizo."
        acciones={
          <button
            className="btn"
            disabled={!filtrados.length}
            onClick={() =>
              descargarCsv(
                'bitacora.csv',
                [['Fecha', 'Administrador', 'ID', 'Acción', 'Detalle']].concat(
                  filtrados.map((m) => [fmtFechaHora(m.fecha), m.adminNombre, m.adminId, m.accion, m.detalle]),
                ),
              )
            }
          >
            <Icono n="download" /> Descargar CSV
          </button>
        }
      />

      <div className="barra-busqueda">
        <div className="barra-busqueda-fila">
          <Buscador valor={q} onCambio={setQ} placeholder="Buscar en la bitácora" />
          <BotonFiltros abierto={verFiltros} activos={admin !== 'todos' ? 1 : 0} onClick={() => setVerFiltros(!verFiltros)} />
        </div>
        <Pildoras<Rango>
          etiqueta="Periodo"
          valor={rango}
          onCambio={elegirRango}
          opciones={[
            { id: 'todo', texto: 'Todo' },
            { id: 'hoy', texto: 'Hoy' },
            { id: '7', texto: 'Últimos 7 días' },
            { id: '30', texto: 'Últimos 30 días' },
            { id: 'otro', texto: 'Elegir fechas' },
          ]}
        />
        {rango === 'otro' && (
          <div className="filtros-fechas">
            <label className="campo">
              <span>Desde</span>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </label>
            <label className="campo">
              <span>Hasta</span>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </label>
          </div>
        )}
        <div className={'filtros-extra' + (verFiltros ? ' abierto' : '')}>
          <label className="campo">
            <span>Administrador</span>
            <select value={admin} onChange={(e) => setAdmin(e.target.value)}>
              <option value="todos">Todos</option>
              {d.admins.map((a) => (
                <option key={a.uid} value={a.uid}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        <PieFiltros activos={activos} onLimpiar={limpiar}>
          <b>{filtrados.length}</b> movimiento(s)
        </PieFiltros>
      </div>

      {filtrados.length === 0 ? (
        <div className="tarjeta">
          <Vacio titulo="Sin movimientos en este periodo" icono="history">
            {activos ? 'Prueba con otro periodo o limpia los filtros.' : 'Aquí aparecerá cada cambio que se haga en el panel.'}
          </Vacio>
        </div>
      ) : (
        <div className="linea-tiempo">
          {dias.map((g) => (
            <section key={g.clave} className="linea-dia">
              <h2 className="linea-dia-titulo">
                {g.titulo} <span>{g.items.length}</span>
              </h2>
              <ol className="linea-lista">
                {g.items.map((m) => {
                  const ic = iconoAccion(m.accion);
                  const f = aDate(m.fecha);
                  return (
                    <li key={m.id} className="linea-item">
                      <time className="linea-hora" dateTime={f ? f.toISOString() : undefined}>
                        {f ? f.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </time>
                      <span className={'actividad-icono tono-' + (ic.c || 'neutro')}>
                        <Icono n={ic.i} />
                      </span>
                      <div className="linea-cuerpo">
                        <div className="linea-accion">{m.accion}</div>
                        {m.detalle && <div className="linea-detalle">{m.detalle}</div>}
                        <div className="linea-quien">
                          <Icono n="person" /> {m.adminNombre}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
      {lista.length >= tope && (
        <button className="btn btn-bloque mt" onClick={() => setTope(tope + 300)}>
          Cargar movimientos anteriores
        </button>
      )}
    </div>
  );
}
