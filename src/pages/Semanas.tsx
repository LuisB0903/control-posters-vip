import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { CabPagina, Icono, useUI, Vacio } from '../components/ui';
import { HojaColocacion, ResultadoVista } from '../components/ResultadoVista';
import { fmtFechaHora, idSemana, semanaActual } from '../lib/fechas';
import type { Semana } from '../types';

function EstadoSemana({ s }: { s: Semana }) {
  return s.estado === 'aplicada' ? (
    <span className="estado-chip estado-chip-entregado">
      <Icono n="verified" /> Aplicada
    </span>
  ) : (
    <span className="estado-chip estado-chip-seleccionado">
      <Icono n="edit_note" /> Borrador
    </span>
  );
}

export default function Semanas() {
  const d = useData();
  const { imprimir } = useUI();
  const [abierta, setAbierta] = useState<Semana | null>(null);
  const hoy = semanaActual(d.config);
  const idHoy = idSemana(hoy.anio, hoy.semana);

  if (abierta) {
    const tit = (id: string | null) => (id && d.peliculaPorId.get(id) ? d.peliculaPorId.get(id)!.titulo : null);
    const sinMaterial = abierta.listas.estrenos.filter((e) => !tit(e.peliculaId)).length;
    return (
      <div>
        <button type="button" className="enlace-boton volver-arriba" onClick={() => setAbierta(null)}>
          <Icono n="arrow_back" /> Historial de semanas
        </button>
        <CabPagina
          titulo={
            <>
              Semana {abierta.semana} <span className="titulo-sec">{abierta.anio}</span>
            </>
          }
          desc={
            <span className="desc-con-chip">
              <EstadoSemana s={abierta} />
              {abierta.estado === 'aplicada'
                ? 'por ' + abierta.aplicadaPor + ' el ' + fmtFechaHora(abierta.aplicadaEn)
                : 'actualizado ' + fmtFechaHora(abierta.actualizadoEn)}
            </span>
          }
          acciones={
            <>
              {abierta.resultado && (
                <button
                  className="btn"
                  onClick={() => imprimir(<HojaColocacion r={abierta.resultado!} semana={abierta.semana} anio={abierta.anio} config={d.config} />)}
                >
                  <Icono n="print" /> Imprimir hoja
                </button>
              )}
              <Link className="btn btn-primario" to={'/admin/sugeridor?semana=' + abierta.id}>
                <Icono n="auto_awesome" /> Abrir en el sugeridor
              </Link>
            </>
          }
        />

        <dl className="cifras">
          <div>
            <dt>Estrenos</dt>
            <dd>{abierta.listas.estrenos.length}</dd>
          </div>
          <div className={sinMaterial ? 'cifra-alerta' : ''}>
            <dt>Sin material</dt>
            <dd>{sinMaterial}</dd>
          </div>
          <div>
            <dt>Salas con película</dt>
            <dd>{abierta.salas.filter((s) => s.peliculas.length).length}</dd>
          </div>
          <div>
            <dt>Movimientos</dt>
            <dd>{abierta.resultado ? abierta.resultado.movimientos.length : '—'}</dd>
          </div>
        </dl>

        <div className="rejilla rejilla-2 mb" style={{ alignItems: 'start' }}>
          <section className="bloque">
            <div className="bloque-cab">
              <h2>Estrenos del cronograma</h2>
            </div>
            {abierta.listas.estrenos.length === 0 ? (
              <p className="muted chico">Sin estrenos capturados.</p>
            ) : (
              <ol className="lista-orden">
                {abierta.listas.estrenos.map((e, i) => (
                  <li key={i} className={!e.activo ? 'inactivo' : ''}>
                    <span className="lista-orden-n">{i + 1}</span>
                    <span className="lista-orden-texto">
                      <b>{tit(e.peliculaId) || e.texto}</b>
                      {tit(e.peliculaId) && tit(e.peliculaId) !== e.texto && <small>Leído como "{e.texto}"</small>}
                    </span>
                    {!tit(e.peliculaId) ? (
                      <span className="estado-chip estado-chip-no">
                        <Icono n="image_not_supported" /> Sin material
                      </span>
                    ) : !e.activo ? (
                      <span className="estado-chip estado-chip-no">No se exhibe</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="bloque">
            <div className="bloque-cab">
              <h2>Salas</h2>
              <span className="bloque-desc">{abierta.noRepetir ? 'Sin repetir en ningún pasillo' : 'Sin repetir en el mismo pasillo'}</span>
            </div>
            <ul className="salas-resumen">
              {abierta.salas.map((s) => (
                <li key={s.sala} className={s.peliculas.length ? '' : 'vacia'}>
                  <span className="salas-resumen-n">{s.sala}</span>
                  <span>{s.peliculas.map((p) => tit(p) || '¿?').join(' · ') || 'Publicidad del cine'}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        {abierta.resultado ? (
          <ResultadoVista r={abierta.resultado} />
        ) : (
          <div className="tarjeta">
            <Vacio titulo="Sin sugerencia generada" icono="auto_awesome">
              Abre la semana en el sugeridor para generar la colocación.
            </Vacio>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <CabPagina
        titulo="Historial de semanas"
        desc="Cada cronograma cargado y la colocación que se aplicó."
        acciones={
          <Link className="btn btn-primario" to="/admin/sugeridor">
            <Icono n="auto_awesome" /> Ir al sugeridor
          </Link>
        }
      />
      {d.semanas.length === 0 ? (
        <div className="tarjeta">
          <Vacio titulo="Aún no hay semanas registradas" icono="date_range">
            Usa el sugeridor semanal para cargar el primer cronograma.
          </Vacio>
        </div>
      ) : (
        <div className="tabla-envoltura tarjetas-movil">
          <table className="tabla">
            <thead>
              <tr>
                <th>Semana</th>
                <th>Estado</th>
                <th className="num">Estrenos</th>
                <th className="num">Movimientos</th>
                <th>Aplicada por</th>
                <th>
                  <span className="solo-lector">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {d.semanas.map((s) => (
                <tr key={s.id} className={s.id === idHoy ? 'fila-actual' : ''}>
                  <td className="celda-principal">
                    <span className="celda-semana">
                      <b>Semana {s.semana}</b>
                      <small>{s.anio}</small>
                      {s.id === idHoy && <span className="chip chip-oro">Actual</span>}
                    </span>
                  </td>
                  <td data-etiqueta="Estado">
                    <EstadoSemana s={s} />
                  </td>
                  <td data-etiqueta="Estrenos" className="num">
                    {s.listas.estrenos.length}
                  </td>
                  <td data-etiqueta="Movimientos" className="num">
                    {s.resultado ? s.resultado.movimientos.length : '—'}
                  </td>
                  <td data-etiqueta="Aplicada por">
                    {s.aplicadaPor ? (
                      <span className="celda-persona">
                        <b>{s.aplicadaPor}</b>
                        <small>{fmtFechaHora(s.aplicadaEn)}</small>
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="derecha celda-acciones">
                    <button className="btn btn-chico" onClick={() => setAbierta(s)}>
                      Ver detalle <Icono n="chevron_right" />
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
