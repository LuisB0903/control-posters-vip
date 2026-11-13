import type { ItemEntrega } from '../types';
import { fmtFecha } from '../lib/fechas';

/** Constancia de entrega de pósters a un cinepolito (se imprime / guarda como PDF) */
export default function HojaEntrega({
  conjunto,
  fecha,
  empleadoId,
  empleadoNombre,
  items,
  gerenteNombre,
  gerenteCargo,
  folio,
}: {
  conjunto: string;
  fecha: Date;
  empleadoId: string;
  empleadoNombre: string;
  items: ItemEntrega[];
  gerenteNombre: string;
  gerenteCargo: string;
  folio?: string;
}) {
  return (
    <div className="hoja">
      <div className="hoja-cab">
        <div>
          <h1>{conjunto}</h1>
          <div style={{ fontSize: '12pt', fontWeight: 700 }}>Constancia de entrega de material publicitario</div>
        </div>
        {folio && <div style={{ fontSize: '8pt', color: '#555' }}>Folio: {folio.slice(0, 8).toUpperCase()}</div>}
      </div>

      <div className="hoja-datos">
        <div>
          <span>Conjunto</span>
          {conjunto}
        </div>
        <div>
          <span>Fecha de entrega</span>
          {fmtFecha(fecha, true)}
        </div>
        <div>
          <span>ID de empleado</span>
          {empleadoId}
        </div>
        <div>
          <span>Nombre del empleado</span>
          {empleadoNombre}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: '24pt' }}>#</th>
            <th>Película / material</th>
            <th>Versión</th>
            <th>Tipo</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{it.titulo}</td>
              <td>v{it.version}</td>
              <td>{it.categoria}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="firmas">
        <div className="firma">
          <div className="firma-linea">
            <b>{gerenteNombre || ' '}</b>
            <br />
            {gerenteCargo || 'Gerente General'}
          </div>
        </div>
        <div className="firma">
          <div className="firma-linea">
            <b>{empleadoNombre}</b>
            <br />
            Empleado · ID {empleadoId}
          </div>
        </div>
      </div>
    </div>
  );
}
