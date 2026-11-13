import type { Asignacion, ConfigGeneral, ResultadoSugerencia, Ubicacion } from '../types';
import { useData } from '../context/DataContext';
import { Poster } from './ui';
import { etiquetaUbic } from '../lib/ubicaciones';

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
    {
      clave: 'salas',
      titulo: 'Salas',
      items: res((a) => a.zona.tipo === 'sala').sort((a, b) => (a.zona.sala || 0) - (b.zona.sala || 0)),
    },
    { clave: 'p13', titulo: 'Pasillo 1-3', sub: sub('pasillo13'), items: res((a) => a.zona.tipo === 'pasillo13') },
    { clave: 'p410', titulo: 'Pasillo 4-10', sub: sub('pasillo410'), items: res((a) => a.zona.tipo === 'pasillo410') },
  ].filter((g) => g.items.length || g.clave === 'taquilla' || g.clave === 'p13' || g.clave === 'p410');
}

export function ResultadoVista({ r }: { r: ResultadoSugerencia }) {
  const d = useData();
  const grupos = agrupar(r);
  return (
    <div className="pila">
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
      {grupos.map((g) => (
        <div className="zona" key={g.clave}>
          <div className="zona-cab">
            <h3>{g.titulo}</h3>
            {g.sub && <span className="chip chip-acento">{g.sub}</span>}
          </div>
          {g.items.length === 0 ? (
            <p className="muted" style={{ padding: '0 16px' }}>
              Sin asignaciones.
            </p>
          ) : (
            <div className="zona-items">
              {g.items.map((a, i) => {
                const m = a.materialId ? d.materialPorId.get(a.materialId) : null;
                const img = (m && m.imagenUrl) || a.imagenUrl;
                return (
                  <div key={i} className={'asig' + (a.tipo === 'publicidad' ? ' asig-publicidad' : a.tipo === 'vacio' ? ' asig-vacio' : '')}>
                    <Poster url={img} alt={a.titulo} chico />
                    <div style={{ minWidth: 0 }}>
                      <div className="asig-titulo">
                        {a.zona.tipo === 'sala' && <span className="chip chip-acento">Sala {a.zona.sala}</span>}{' '}
                        {a.titulo}
                        {a.version ? ' v' + a.version : ''}
                      </div>
                      <div className="fila" style={{ gap: 6, marginTop: 3 }}>
                        {a.piezaN && <span className="chip">Pieza #{a.piezaN}</span>}
                        {a.tipo === 'publicidad' && <span className="chip chip-azul">Publicidad del cine</span>}
                        {a.notas.some((n) => n.indexOf('Garantía') >= 0) && <span className="chip chip-rojo">Sello Garantía</span>}
                      </div>
                      {a.notas.length > 0 && (
                        <ul className="asig-notas">
                          {a.notas.map((n, j) => (
                            <li key={j}>{n}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      <div className="tarjeta">
        <div className="tarjeta-cab">
          <h3>Movimientos a realizar ({r.movimientos.length})</h3>
        </div>
        {r.movimientos.length === 0 ? (
          <p className="muted">No hay que mover nada: todo ya está en su lugar.</p>
        ) : (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Pieza</th>
                  <th>Desde</th>
                  <th></th>
                  <th>Hacia</th>
                </tr>
              </thead>
              <tbody>
                {r.movimientos.map((mv, i) => (
                  <tr key={i}>
                    <td>
                      {mv.titulo} v{mv.version}
                    </td>
                    <td>#{mv.piezaN}</td>
                    <td>{etiquetaUbic(mv.desde)}</td>
                    <td className="flecha">→</td>
                    <td className={mv.hacia.tipo === 'bodega' ? 'muted' : 'negrita'}>{etiquetaUbic(mv.hacia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
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
                        {a.version ? ' v' + a.version : ''}
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
                    {mv.titulo} v{mv.version}
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
