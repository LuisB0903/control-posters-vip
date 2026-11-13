import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import { Cargando, Vacio } from '../components/ui';
import { aDate, fmtFechaHora } from '../lib/fechas';
import { contiene } from '../lib/texto';
import { descargarCsv } from '../lib/utilidades';
import type { Movimiento } from '../types';

export default function Movimientos() {
  const d = useData();
  const [lista, setLista] = useState<Movimiento[] | null>(null);
  const [tope, setTope] = useState(300);
  const [q, setQ] = useState('');
  const [admin, setAdmin] = useState('todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

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

  return (
    <div>
      <div className="cabecera">
        <div>
          <h1>Bitácora de movimientos</h1>
          <p>Todo lo que se hace en el sistema y quién lo hizo.</p>
        </div>
        <div className="acciones">
          <button
            className="btn"
            onClick={() =>
              descargarCsv(
                'bitacora.csv',
                [['Fecha', 'Administrador', 'ID', 'Acción', 'Detalle']].concat(
                  filtrados.map((m) => [fmtFechaHora(m.fecha), m.adminNombre, m.adminId, m.accion, m.detalle]),
                ),
              )
            }
          >
            Descargar CSV
          </button>
        </div>
      </div>
      <div className="tarjeta mb">
        <div className="rejilla rejilla-4">
          <label className="campo">
            <span>Buscar</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Película, acción…" />
          </label>
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
          <label className="campo">
            <span>Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="campo">
            <span>Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
        </div>
      </div>
      {filtrados.length === 0 ? (
        <div className="tarjeta">
          <Vacio titulo="Sin movimientos" />
        </div>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Quién</th>
                <th>Acción</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((m) => (
                <tr key={m.id}>
                  <td className="chico" style={{ whiteSpace: 'nowrap' }}>
                    {fmtFechaHora(m.fecha)}
                  </td>
                  <td>{m.adminNombre}</td>
                  <td>
                    <span className="chip chip-acento">{m.accion}</span>
                  </td>
                  <td className="chico">{m.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lista.length >= tope && (
        <button className="btn mt" onClick={() => setTope(tope + 300)}>
          Cargar más
        </button>
      )}
    </div>
  );
}
