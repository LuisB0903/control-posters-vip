import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import { useQuien } from '../context/AuthContext';
import { alertasVersiones, materialesVencidos } from '../lib/alertas';
import { etiquetaUbic } from '../lib/ubicaciones';
import { aDate, fmtFecha, fmtFechaHora, idSemana, semanaActual } from '../lib/fechas';
import { Icono, Poster, useUI } from '../components/ui';
import { etiquetaVersion, moverPiezasABodega, nombreMaterial } from '../lib/acciones';
import { errorTexto } from '../lib/utilidades';
import { iconoAccion } from '../lib/bitacora';
import type { Movimiento, RolCategoria, ZonaTipo } from '../types';

const DIA = 86400000;

export default function Inicio() {
  const d = useData();
  const quien = useQuien();
  const { toast } = useUI();
  const [recientes, setRecientes] = useState<Movimiento[]>([]);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'movimientos'), orderBy('fecha', 'desc'), limit(6)),
        (s) => setRecientes(s.docs.map((x) => ({ id: x.id, ...(x.data() as Omit<Movimiento, 'id'>) }))),
        () => setRecientes([]),
      ),
    [],
  );

  const ahora = Date.now();
  const rolDe = (categoriaId: string): RolCategoria => (d.categoriaPorId.get(categoriaId) || { rol: 'ninguno' as RolCategoria }).rol;
  const alertas = alertasVersiones(d.materiales, d.categorias);
  const vencidos = materialesVencidos(d.materiales);

  /* ── métricas ── */
  let totalPiezas = 0;
  let enBodega = 0;
  let nuevasSemana = 0;
  const titulos = new Set<string>();
  const porZona: Record<string, number> = {};
  const salasOcupadas = new Set<number>();
  let standeesLobby = 0;
  for (const m of d.materiales) {
    const creado = aDate(m.creadoEn);
    const reciente = !!creado && ahora - creado.getTime() < 7 * DIA;
    const rol = rolDe(m.categoriaId);
    const esCartelera = rol === 'cartelera' || rol === 'publicidad';
    for (const p of m.piezas) {
      if (p.estado !== 'activa') continue;
      totalPiezas++;
      titulos.add(m.peliculaId || m.id);
      if (reciente) nuevasSemana++;
      if (p.ubic.tipo === 'bodega') enBodega++;
      if (esCartelera) {
        porZona[p.ubic.tipo] = (porZona[p.ubic.tipo] || 0) + 1;
        if (p.ubic.tipo === 'sala' && p.ubic.sala) salasOcupadas.add(p.ubic.sala);
      }
      if ((rol === 'standee_chico' || rol === 'standee_grande') && p.ubic.tipo === 'lobby') standeesLobby++;
    }
  }
  const proximas = d.peliculas.filter((p) => p.estado === 'proximamente').length;
  const enCartelera = d.peliculas.filter((p) => p.estado === 'cartelera').length;
  const publicados = d.materiales.filter((m) => {
    const h = m.cinepolitos && m.cinepolitos.activo ? aDate(m.cinepolitos.hasta) : null;
    return !!h && h.getTime() > ahora && m.piezas.some((p) => p.estado === 'activa');
  });
  const vencenPronto = publicados.filter((m) => {
    const h = aDate(m.cinepolitos!.hasta);
    return !!h && h.getTime() - ahora < 15 * DIA;
  }).length;
  const pendientes = d.apartados.filter((a) => a.estado === 'apartado').length;
  const porRecoger = d.apartados.filter((a) => a.estado === 'seleccionado').length;

  /* ── semana ── */
  const hoy = semanaActual(d.config);
  const semana = d.semanas.find((s) => s.id === idSemana(hoy.anio, hoy.semana));
  const urlPublica = window.location.href.split('#')[0] + '#/';
  const copiar = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(urlPublica).then(() => toast('Enlace copiado'));
    else toast(urlPublica, 'info');
  };

  const moverABodega = (a: (typeof alertas)[number]) =>
    moverPiezasABodega(quien, a.materialViejo, a.piezasColocadas)
      .then(() => toast(nombreMaterial(a.materialViejo) + ' regresó a bodega'))
      .catch((e) => toast(errorTexto(e), 'error'));

  /* ── distribución por ubicación ── */
  const gerPas = d.config.gerenciaPasillo || 'pasillo13';
  const cap13 = Math.max(0, d.config.pasillo13Total - d.config.pasillo13Salas.length - (gerPas === 'pasillo13' ? d.config.gerenciaEspacios : 0));
  const cap410 = Math.max(0, d.config.pasillo410Total - d.config.pasillo410Salas.length - (gerPas === 'pasillo410' ? d.config.gerenciaEspacios : 0));
  const totalSalas = d.config.pasillo13Salas.length + d.config.pasillo410Salas.length;
  const zonas: { tipo: ZonaTipo | 'salas'; area: string; nombre: string; usados: number; total: number; icono: string; desc: string }[] = [
    { tipo: 'taquilla', area: 'Front desk', nombre: 'Taquilla', usados: porZona.taquilla || 0, total: d.config.taquillaEspacios, icono: 'local_activity', desc: '' },
    { tipo: 'lobby', area: 'Vigilada', nombre: 'Lobby', usados: porZona.lobby || 0, total: d.config.lobbyEspacios, icono: 'weekend', desc: standeesLobby + ' standee(s)' },
    { tipo: 'pasillo13', area: 'Ala 1', nombre: 'Pasillo 1-3', usados: porZona.pasillo13 || 0, total: cap13, icono: 'view_column', desc: 'Carteleras libres' },
    { tipo: 'pasillo410', area: 'Ala 2', nombre: 'Pasillo 4-10', usados: porZona.pasillo410 || 0, total: cap410, icono: 'view_column', desc: 'Carteleras libres' },
    { tipo: 'salas', area: 'Marquesinas', nombre: 'Salas 1-' + totalSalas, usados: salasOcupadas.size, total: totalSalas, icono: 'chair', desc: 'Entradas de sala' },
    { tipo: 'gerencia', area: 'Vigilada', nombre: 'Gerencia', usados: porZona.gerencia || 0, total: d.config.gerenciaEspacios, icono: 'shield', desc: 'Zona vigilada' },
  ];


  const colocadas = totalPiezas - enBodega;
  const totalPeliculas = enCartelera + proximas;
  const totalPendientes = alertas.length + vencidos.length;
  const estadoSemana = semana ? (semana.estado === 'aplicada' ? 'aplicada' : 'borrador') : 'pendiente';

  const accesos: { a: string; i: string; t: string; d: string }[] = [
    { a: '/admin/inventario?registrar=1', i: 'add_circle', t: 'Registrar material', d: 'Pósters, standees y publicidad' },
    { a: '/admin/sugeridor', i: 'auto_awesome', t: 'Sugeridor semanal', d: 'Colocación según el cronograma' },
    { a: '/admin/cinepolitos', i: 'inventory', t: 'Apartados y entregas', d: 'Seleccionar y entregar material' },
    { a: '/admin/empleados', i: 'badge', t: 'Empleados', d: 'Altas, bajas e importación' },
    { a: '/admin/semanas', i: 'date_range', t: 'Historial de semanas', d: 'Cronogramas guardados' },
  ];

  return (
    <div className="tablero">
      {/* ── Encabezado ── */}
      <header className="tablero-cab">
        <div className="tablero-cab-texto">
          <h1>Panel de control</h1>
          <div className="tablero-meta">
            <span>{d.config.conjunto}</span>
            <span className={'estado-semana estado-' + estadoSemana}>
              <Icono n={estadoSemana === 'aplicada' ? 'verified' : estadoSemana === 'borrador' ? 'edit_note' : 'schedule'} />
              Semana {hoy.semana} ·{' '}
              {semana
                ? semana.estado === 'aplicada'
                  ? 'Aplicada por ' + semana.aplicadaPor + ' (' + fmtFecha(semana.aplicadaEn) + ')'
                  : 'Borrador guardado'
                : 'Cronograma pendiente'}
            </span>
          </div>
        </div>
        <div className="tablero-acciones">
          <Link className="btn" to="/admin/inventario?registrar=1">
            <Icono n="add" /> Registrar material
          </Link>
          <Link className="btn btn-primario" to="/admin/sugeridor">
            <Icono n="auto_awesome" /> Sugeridor semanal
          </Link>
        </div>
      </header>

      {/* ── Tarjetas resumen ── */}
      <section className="kpis" aria-label="Resumen">
        <Link to="/admin/inventario" className="kpi">
          <span className="kpi-cab">
            <span className="kpi-etiqueta">Piezas activas</span>
            <span className="kpi-icono">
              <Icono n="inventory_2" />
            </span>
          </span>
          <span className="kpi-valor">
            <span className="kpi-num">{totalPiezas}</span>
            {nuevasSemana > 0 && <span className="kpi-delta">+{nuevasSemana} esta semana</span>}
          </span>
          <span className="kpi-desc">En {titulos.size} títulos y campañas</span>
          <span className="kpi-pie">
            <span>
              <b>{colocadas}</b> colocadas
            </span>
            <span>
              <b>{enBodega}</b> en bodega
            </span>
          </span>
        </Link>

        <Link to="/admin/inventario" className="kpi">
          <span className="kpi-cab">
            <span className="kpi-etiqueta">Películas</span>
            <span className="kpi-icono">
              <Icono n="movie_filter" />
            </span>
          </span>
          <span className="kpi-valor">
            <span className="kpi-num">{enCartelera}</span>
            <span className="kpi-unidad">en cartelera</span>
          </span>
          <span className="kpi-desc">{proximas} próximamente</span>
          <span className="kpi-barra" role="img" aria-label={enCartelera + ' en cartelera, ' + proximas + ' próximamente'}>
            <span className="kpi-barra-a" style={{ width: (totalPeliculas ? (enCartelera / totalPeliculas) * 100 : 0) + '%' }} />
            <span className="kpi-barra-b" style={{ width: (totalPeliculas ? (proximas / totalPeliculas) * 100 : 0) + '%' }} />
          </span>
        </Link>

        <Link to="/admin/cinepolitos" className="kpi">
          <span className="kpi-cab">
            <span className="kpi-etiqueta">Publicado para cinepolitos</span>
            <span className="kpi-icono">
              <Icono n="public" />
            </span>
          </span>
          <span className="kpi-valor">
            <span className="kpi-num">{publicados.length}</span>
            <span className="kpi-unidad">material(es)</span>
          </span>
          <span className={'kpi-desc' + (vencenPronto ? ' kpi-alerta' : '')}>
            {vencenPronto ? (
              <>
                <Icono n="warning" /> {vencenPronto} vencen en menos de 15 días
              </>
            ) : (
              'Ninguno vence en los próximos 15 días'
            )}
          </span>
        </Link>

        <Link to="/admin/cinepolitos" className={'kpi' + (pendientes ? ' kpi-destacado' : '')}>
          <span className="kpi-cab">
            <span className="kpi-etiqueta">Apartados pendientes</span>
            <span className="kpi-icono">
              <Icono n="loyalty" />
            </span>
          </span>
          <span className="kpi-valor">
            <span className="kpi-num">{pendientes}</span>
            <span className="kpi-unidad">por decidir</span>
          </span>
          <span className="kpi-desc">{porRecoger} seleccionado(s) por recoger</span>
        </Link>
      </section>

      <div className="tablero-grid">
        <div className="tablero-col">
          {/* ── Pendientes ── */}
          <section className="bloque bloque-pendientes">
            <div className="bloque-cab">
              <h2>
                Pendientes {totalPendientes > 0 && <span className="bloque-cuenta">{totalPendientes}</span>}
              </h2>
              <span className="bloque-desc">Versiones por cambiar y material vencido</span>
            </div>
            {totalPendientes === 0 ? (
              <div className="bloque-vacio">
                <Icono n="task_alt" />
                <div>
                  <strong>Todo al día</strong>
                  <span>No hay versiones viejas colocadas ni material vencido.</span>
                </div>
              </div>
            ) : (
              <ul className="tareas">
                {alertas.map((a, i) => (
                  <li key={'v' + i} className="tarea">
                    <span className="tarea-poster">
                      <Poster url={a.imagenUrl} alt={a.titulo} chico />
                    </span>
                    <div className="tarea-cuerpo">
                      <span className="tarea-tipo tarea-tipo-version">Versión nueva · v{a.nueva}</span>
                      <div className="tarea-titulo">{a.titulo}</div>
                      <div className="tarea-desc">
                        Retirar <b>{etiquetaVersion(a.vieja, a.materialViejo.arte)}</b> ({a.categoria}) de {a.lugares.join(', ')}
                      </div>
                    </div>
                    <button className="btn btn-chico" onClick={() => moverABodega(a)}>
                      Mover a bodega
                    </button>
                  </li>
                ))}
                {vencidos.slice(0, 3).map((m) => {
                  const h = aDate(m.cinepolitos ? m.cinepolitos.hasta : null);
                  const dias = h ? Math.max(0, Math.floor((ahora - h.getTime()) / DIA)) : 0;
                  const activas = m.piezas.filter((p) => p.estado === 'activa');
                  const lugares = Array.from(new Set(activas.map((p) => etiquetaUbic(p.ubic))));
                  const abiertos = d.apartados.filter((a) => a.materialId === m.id && (a.estado === 'apartado' || a.estado === 'seleccionado')).length;
                  return (
                    <li key={m.id} className="tarea">
                      <span className="tarea-poster">
                        <Poster url={m.imagenUrl} alt={m.titulo} chico />
                      </span>
                      <div className="tarea-cuerpo">
                        <span className="tarea-tipo tarea-tipo-vencido">{dias === 0 ? 'Venció hoy' : 'Venció hace ' + dias + ' día(s)'}</span>
                        <div className="tarea-titulo">{nombreMaterial(m)}</div>
                        <div className="tarea-desc">
                          {activas.length} pieza(s) activa(s) en {lugares.join(', ')} · {abiertos} apartado(s) abierto(s)
                        </div>
                      </div>
                      <Link className="btn btn-chico" to="/admin/cinepolitos">
                        Gestionar
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {vencidos.length > 3 && (
              <Link to="/admin/cinepolitos" className="bloque-mas">
                Ver {vencidos.length - 3} vencido(s) más <Icono n="arrow_forward" />
              </Link>
            )}
            <p className="bloque-nota">
              <Icono n="info" /> Al entregar, recuerda imprimir la constancia y recabar la firma de la Gerente y del colaborador.
            </p>
          </section>

          {/* ── Ocupación ── */}
          <section className="bloque bloque-ocupacion">
            <div className="bloque-cab">
              <h2>Ocupación por ubicación</h2>
              <span className="bloque-desc">Carteleras y espacios del complejo</span>
            </div>
            <ul className="ocupacion">
              <li className="ocupacion-fila">
                <span className="ocupacion-icono">
                  <Icono n="warehouse" />
                </span>
                <span className="ocupacion-nombre">
                  <b>Bodega</b>
                  <span>Material en reserva</span>
                </span>
                <span className="ocupacion-barra">
                  <span style={{ width: (totalPiezas ? (enBodega / totalPiezas) * 100 : 0) + '%' }} className="ocupacion-barra-bodega" />
                </span>
                <span className="ocupacion-num">{enBodega}</span>
                <span className="ocupacion-estado">pieza(s)</span>
              </li>
              {zonas.map((z) => {
                const lleno = z.total > 0 && z.usados >= z.total;
                const vacantes = Math.max(0, z.total - z.usados);
                const pct = z.total ? Math.min(100, (z.usados / z.total) * 100) : 0;
                return (
                  <li key={z.tipo} className="ocupacion-fila">
                    <span className="ocupacion-icono">
                      <Icono n={z.icono} />
                    </span>
                    <span className="ocupacion-nombre">
                      <b>{z.nombre}</b>
                      <span>{z.desc || z.area}</span>
                    </span>
                    <span className="ocupacion-barra">
                      <span style={{ width: pct + '%' }} className={lleno ? 'ocupacion-barra-llena' : 'ocupacion-barra-libre'} />
                    </span>
                    <span className="ocupacion-num">
                      {z.usados}/{z.total}
                    </span>
                    <span className={'ocupacion-estado' + (lleno ? ' ocupacion-lleno' : vacantes > 0 ? ' ocupacion-libre' : '')}>
                      {lleno ? 'Completo' : vacantes > 0 ? vacantes + ' libre(s)' : 'Sin espacios'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="tablero-col">
          {/* ── Accesos rápidos ── */}
          <section className="bloque bloque-accesos">
            <div className="bloque-cab">
              <h2>Accesos rápidos</h2>
            </div>
            <div className="accesos">
              {accesos.map((x) => (
                <Link key={x.a} to={x.a} className="acceso-rapido">
                  <span className="acceso-rapido-icono">
                    <Icono n={x.i} />
                  </span>
                  <span className="acceso-rapido-texto">
                    <b>{x.t}</b>
                    <span>{x.d}</span>
                  </span>
                  <Icono n="chevron_right" className="acceso-rapido-flecha" />
                </Link>
              ))}
              <button type="button" className="acceso-rapido" onClick={copiar}>
                <span className="acceso-rapido-icono">
                  <Icono n="link" />
                </span>
                <span className="acceso-rapido-texto">
                  <b>Copiar enlace del portal</b>
                  <span className="mono">{urlPublica.replace(/^https?:\/\//, '')}</span>
                </span>
                <Icono n="content_copy" className="acceso-rapido-flecha" />
              </button>
            </div>
          </section>

          {/* ── Actividad reciente ── */}
          <section className="bloque bloque-actividad">
            <div className="bloque-cab">
              <h2>Actividad reciente</h2>
              <Link to="/admin/movimientos" className="bloque-enlace">
                Ver bitácora <Icono n="arrow_forward" />
              </Link>
            </div>
            {recientes.length === 0 ? (
              <div className="bloque-vacio">
                <Icono n="history" />
                <div>
                  <strong>Sin movimientos</strong>
                  <span>Aún no hay movimientos registrados.</span>
                </div>
              </div>
            ) : (
              <ul className="actividad">
                {recientes.map((m) => {
                  const ic = iconoAccion(m.accion);
                  return (
                    <li key={m.id} className="actividad-item">
                      <span className={'actividad-icono tono-' + (ic.c || 'neutro')}>
                        <Icono n={ic.i} />
                      </span>
                      <div className="actividad-cuerpo">
                        <div className="actividad-titulo">
                          <b>{m.accion}</b> <span className="muted">· {m.adminNombre}</span>
                        </div>
                        <div className="actividad-desc">{m.detalle}</div>
                      </div>
                      <time className="actividad-fecha">{fmtFechaHora(m.fecha)}</time>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
