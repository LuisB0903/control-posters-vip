import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useUI, Vacio } from '../components/ui';
import { HojaColocacion, ResultadoVista } from '../components/ResultadoVista';
import { fmtFechaHora } from '../lib/fechas';
import type { Semana } from '../types';

export default function Semanas() {
  const d = useData();
  const { imprimir } = useUI();
  const [abierta, setAbierta] = useState<Semana | null>(null);

  if (abierta) {
    const tit = (id: string | null) => (id && d.peliculaPorId.get(id) ? d.peliculaPorId.get(id)!.titulo : null);
    return (
      <div>
        <div className="cabecera">
          <div>
            <h1>
              Semana {abierta.semana} · {abierta.anio}
            </h1>
            <p>
              {abierta.estado === 'aplicada'
                ? 'Aplicada por ' + abierta.aplicadaPor + ' el ' + fmtFechaHora(abierta.aplicadaEn)
                : 'Borrador · actualizado ' + fmtFechaHora(abierta.actualizadoEn)}
            </p>
          </div>
          <div className="acciones">
            <button className="btn" onClick={() => setAbierta(null)}>
              ← Volver
            </button>
            {abierta.resultado && (
              <button
                className="btn"
                onClick={() => imprimir(<HojaColocacion r={abierta.resultado!} semana={abierta.semana} anio={abierta.anio} config={d.config} />)}
              >
                🖨 Imprimir
              </button>
            )}
            <Link className="btn btn-primario" to={'/admin/sugeridor?semana=' + abierta.id}>
              Abrir en el sugeridor
            </Link>
          </div>
        </div>
        <div className="rejilla rejilla-2 mb">
          <div className="tarjeta">
            <h3>Estrenos del cronograma</h3>
            <ol className="chico">
              {abierta.listas.estrenos.map((e, i) => (
                <li key={i}>
                  {e.texto} {tit(e.peliculaId) ? <span className="muted">→ {tit(e.peliculaId)}</span> : <span className="chip chip-rojo">sin material</span>}
                  {!e.activo && <span className="chip"> no se exhibe</span>}
                </li>
              ))}
            </ol>
          </div>
          <div className="tarjeta">
            <h3>Salas</h3>
            <ul className="chico">
              {abierta.salas.map((s) => (
                <li key={s.sala}>
                  <b>Sala {s.sala}:</b> {s.peliculas.map((p) => tit(p) || '¿?').join(', ') || <span className="muted">sin película</span>}
                </li>
              ))}
            </ul>
            <p className="muted chico">{abierta.noRepetir ? 'Opción: no repetir en ningún pasillo' : 'Opción: no repetir en el mismo pasillo'}</p>
          </div>
        </div>
        {abierta.resultado ? <ResultadoVista r={abierta.resultado} /> : <div className="tarjeta muted">Esta semana no tiene sugerencia generada.</div>}
      </div>
    );
  }

  return (
    <div>
      <div className="cabecera">
        <div>
          <h1>Historial de semanas</h1>
          <p>Registro de cada cronograma y la colocación que se aplicó.</p>
        </div>
      </div>
      {d.semanas.length === 0 ? (
        <div className="tarjeta">
          <Vacio titulo="Aún no hay semanas registradas">Usa el sugeridor semanal para cargar el primer cronograma.</Vacio>
        </div>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Semana</th>
                <th>Estado</th>
                <th>Estrenos</th>
                <th>Movimientos</th>
                <th>Aplicada por</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {d.semanas.map((s) => (
                <tr key={s.id}>
                  <td className="negrita">
                    {s.semana} · {s.anio}
                  </td>
                  <td>{s.estado === 'aplicada' ? <span className="chip chip-verde">Aplicada</span> : <span className="chip chip-acento">Borrador</span>}</td>
                  <td>{s.listas.estrenos.length}</td>
                  <td>{s.resultado ? s.resultado.movimientos.length : '—'}</td>
                  <td>{s.aplicadaPor ? s.aplicadaPor + ' · ' + fmtFechaHora(s.aplicadaEn) : '—'}</td>
                  <td className="derecha">
                    <button className="btn btn-chico" onClick={() => setAbierta(s)}>
                      Ver
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
