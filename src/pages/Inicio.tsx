import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { alertasVersiones, materialesVencidos } from '../lib/alertas';
import { etiquetaUbic, ubicKey, ordenZona } from '../lib/ubicaciones';
import { fmtFecha, fmtFechaHora, semanaISO, idSemana } from '../lib/fechas';
import { useUI } from '../components/ui';
import { nombreMaterial } from '../lib/acciones';
import type { Ubicacion } from '../types';

export default function Inicio() {
  const d = useData();
  const { toast } = useUI();
  const alertas = alertasVersiones(d.materiales, d.categorias);
  const vencidos = materialesVencidos(d.materiales);
  const pendientes = d.apartados.filter((a) => a.estado === 'apartado').length;
  const publicados = d.materiales.filter(
    (m) => m.cinepolitos && m.cinepolitos.activo && m.cinepolitos.hasta && m.cinepolitos.hasta.toMillis() > Date.now(),
  ).length;

  // piezas por ubicación
  const porUbic = new Map<string, { u: Ubicacion; n: number }>();
  let totalPiezas = 0;
  for (const m of d.materiales)
    for (const p of m.piezas) {
      if (p.estado !== 'activa') continue;
      totalPiezas++;
      const k = ubicKey(p.ubic);
      const v = porUbic.get(k) || { u: p.ubic, n: 0 };
      v.n++;
      porUbic.set(k, v);
    }
  const ubicaciones = Array.from(porUbic.values()).sort((a, b) => ordenZona(a.u) - ordenZona(b.u));

  const hoy = semanaISO(new Date());
  const semanaActual = d.semanas.find((s) => s.id === idSemana(hoy.anio, hoy.semana));
  const ultima = d.semanas.find((s) => s.estado === 'aplicada');

  const urlPublica = window.location.href.split('#')[0] + '#/';
  const copiar = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(urlPublica).then(() => toast('Enlace copiado'));
    else toast(urlPublica, 'info');
  };

  const estados = {
    proximamente: d.peliculas.filter((p) => p.estado === 'proximamente').length,
    cartelera: d.peliculas.filter((p) => p.estado === 'cartelera').length,
    salio: d.peliculas.filter((p) => p.estado === 'salio').length,
  };

  return (
    <div>
      <div className="cabecera">
        <div>
          <h1>Hola 👋</h1>
          <p>
            Semana {hoy.semana} · {fmtFecha(new Date(), true)}
          </p>
        </div>
        <div className="acciones">
          <Link className="btn btn-primario" to="/admin/sugeridor">
            ✦ Sugeridor semanal
          </Link>
          <Link className="btn" to="/admin/inventario">
            + Registrar material
          </Link>
        </div>
      </div>

      <div className="rejilla rejilla-4 mb">
        <div className="stat">
          <div className="stat-num">{totalPiezas}</div>
          <div className="stat-et">Piezas activas en inventario</div>
        </div>
        <div className="stat">
          <div className="stat-num">{estados.proximamente}</div>
          <div className="stat-et">Películas próximamente · {estados.cartelera} en cartelera</div>
        </div>
        <div className="stat">
          <div className="stat-num">{publicados}</div>
          <div className="stat-et">Pósters visibles para cinepolitos</div>
        </div>
        <div className="stat">
          <div className="stat-num">{pendientes}</div>
          <div className="stat-et">Apartados pendientes de entregar</div>
        </div>
      </div>

      {alertas.length > 0 && (
        <div className="alerta alerta-aviso">
          <strong>🔁 Hay versiones nuevas: cambia estos pósters</strong>
          <ul>
            {alertas.map((a, i) => (
              <li key={i}>
                <b>{a.titulo}</b> ({a.categoria}): llegó la <b>v{a.nueva}</b>. Cambia la v{a.vieja} que está en{' '}
                {a.lugares.join(', ')}.
              </li>
            ))}
          </ul>
        </div>
      )}

      {vencidos.length > 0 && (
        <div className="alerta alerta-error">
          <strong>⏰ Ya pasó la fecha de entrega o desecho de {vencidos.length} material(es)</strong>
          <ul>
            {vencidos.map((m) => (
              <li key={m.id}>
                {nombreMaterial(m)} — fecha: {fmtFecha(m.cinepolitos ? m.cinepolitos.hasta : null)} ·{' '}
                {d.apartados.filter((a) => a.materialId === m.id && a.estado === 'apartado').length} apartado(s) pendiente(s)
              </li>
            ))}
          </ul>
          <Link to="/admin/cinepolitos" className="btn btn-chico mt">
            Ir a entregas
          </Link>
        </div>
      )}

      <div className="rejilla rejilla-2">
        <div className="tarjeta">
          <div className="tarjeta-cab">
            <h3>Dónde está el material</h3>
          </div>
          {ubicaciones.length === 0 ? (
            <p className="muted">Aún no hay piezas registradas.</p>
          ) : (
            <div className="tabla-envoltura">
              <table className="tabla">
                <tbody>
                  {ubicaciones.map((u) => (
                    <tr key={ubicKey(u.u)}>
                      <td>{etiquetaUbic(u.u)}</td>
                      <td className="derecha negrita">{u.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="tarjeta">
          <div className="tarjeta-cab">
            <h3>Semana</h3>
          </div>
          {semanaActual ? (
            <p>
              Semana {semanaActual.semana}:{' '}
              {semanaActual.estado === 'aplicada' ? (
                <span className="chip chip-verde">Aplicada</span>
              ) : (
                <span className="chip chip-acento">Borrador</span>
              )}
            </p>
          ) : (
            <p className="muted">Aún no se ha cargado el cronograma de la semana {hoy.semana}.</p>
          )}
          {ultima && (
            <p className="muted chico">
              Última aplicada: semana {ultima.semana} de {ultima.anio}, por {ultima.aplicadaPor} el {fmtFechaHora(ultima.aplicadaEn)}
            </p>
          )}
          <hr style={{ border: 0, borderTop: '1px solid var(--borde)', margin: '14px 0' }} />
          <h4>Enlace para cinepolitos</h4>
          <p className="muted chico">Compártelo en el grupo para que aparten pósters con su ID de empleado.</p>
          <div className="fila">
            <input readOnly value={urlPublica} onFocus={(e) => e.target.select()} />
            <button className="btn" onClick={copiar}>
              Copiar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
