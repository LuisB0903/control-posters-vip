import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import { useQuien } from '../context/AuthContext';
import { alertasVersiones, materialesVencidos } from '../lib/alertas';
import { etiquetaUbic } from '../lib/ubicaciones';
import { aDate, fmtFecha, fmtFechaHora, idSemana, semanaActual } from '../lib/fechas';
import { Encabezado, Icono, Poster, useUI } from '../components/ui';
import { etiquetaVersion, moverPiezasABodega, nombreMaterial } from '../lib/acciones';
import { errorTexto } from '../lib/utilidades';
import type { Movimiento, RolCategoria, ZonaTipo } from '../types';

const DIA = 86400000;

function iconoAccion(accion: string): { i: string; c: string } {
  const a = accion.toLowerCase();
  if (a.indexOf('sugerencia') >= 0) return { i: 'auto_awesome', c: 'rojo' };
  if (a.indexOf('entrega') >= 0) return { i: 'task_alt', c: 'verde' };
  if (a.indexOf('registro') >= 0 || a.indexOf('agregad') >= 0) return { i: 'add_box', c: 'oro' };
  if (a.indexOf('movimiento') >= 0) return { i: 'swap_horiz', c: 'rojo' };
  if (a.indexOf('desech') >= 0 || a.indexOf('elimin') >= 0) return { i: 'delete', c: 'rojo' };
  if (a.indexOf('apartado') >= 0 || a.indexOf('seleccion') >= 0) return { i: 'bookmark', c: 'oro' };
  if (a.indexOf('empleado') >= 0) return { i: 'badge', c: 'verde' };
  return { i: 'history', c: '' };
}

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

  return (
    <div>
      <Encabezado
        eyebrow={
          <>
            <span className="chip chip-oro chip-caps">
              <span className="punto punto-oro latido" /> Panel operativo VIP
            </span>
            <span className="chip">
              <Icono n={semana && semana.estado === 'aplicada' ? 'verified' : 'schedule'} className={semana && semana.estado === 'aplicada' ? 'texto-verde' : 'texto-oro'} />
              Semana {hoy.semana} ({hoy.anio}) ·{' '}
              {semana
                ? semana.estado === 'aplicada'
                  ? 'Aplicada por ' + semana.aplicadaPor + ' (' + fmtFecha(semana.aplicadaEn) + ')'
                  : 'Borrador guardado'
                : 'Cronograma pendiente'}
            </span>
          </>
        }
        titulo="Panel de control"
        sub={'· ' + d.config.conjunto}
        descripcion="Inventario de material publicitario, rotación semanal de pósters y apartados de los cinepolitos en un solo lugar."
        acciones={
          <>
            <Link className="btn btn-primario" to="/admin/sugeridor">
              <Icono n="auto_awesome" /> Sugeridor semanal
            </Link>
            <Link className="btn btn-vip" to="/admin/inventario?registrar=1">
              <Icono n="add_circle" /> Registrar material
            </Link>
            <button className="btn btn-fantasma" onClick={copiar} title="Copiar enlace para cinepolitos">
              <Icono n="content_copy" className="texto-oro" />
              <span className="mono chico oculto-movil">{urlPublica.replace(/^https?:\/\//, '')}</span>
              <span className="solo-movil">Copiar enlace</span>
            </button>
          </>
        }
      />

      {/* ── Métricas ── */}
      <div className="rejilla rejilla-4">
        <div className="metrica">
          <div className="metrica-cab">
            <span className="caps">Inventario total</span>
            <span className="icono-caja rojo">
              <Icono n="inventory_2" className="ico-18" />
            </span>
          </div>
          <div>
            <div className="metrica-valor">
              <span className="metrica-num">{totalPiezas}</span>
              {nuevasSemana > 0 && <span className="texto-verde negrita chico">+{nuevasSemana} esta semana</span>}
            </div>
            <div className="metrica-desc">Piezas activas en {titulos.size} títulos y campañas</div>
          </div>
          <div className="metrica-pie">
            <span>
              <span className="punto" style={{ marginRight: 6 }} />
              {enBodega} en bodega · {totalPiezas - enBodega} colocadas
            </span>
          </div>
        </div>

        <div className="metrica oro">
          <div className="metrica-cab">
            <span className="caps">Cartelera y estrenos</span>
            <span className="icono-caja oro">
              <Icono n="movie_filter" className="ico-18" />
            </span>
          </div>
          <div>
            <div className="metrica-valor">
              <span className="metrica-num">{proximas}</span>
              <span className="texto-oro negrita">Próximamente</span>
            </div>
            <div className="metrica-desc">{enCartelera} película(s) actualmente en cartelera</div>
          </div>
          <div className="barra-dividida">
            <div style={{ width: (enCartelera + proximas ? (enCartelera / (enCartelera + proximas)) * 100 : 0) + '%' }} />
            <div style={{ width: (enCartelera + proximas ? (proximas / (enCartelera + proximas)) * 100 : 0) + '%' }} />
          </div>
        </div>

        <div className="metrica verde">
          <div className="metrica-cab">
            <span className="caps">Cinepolitos público</span>
            <span className="icono-caja verde">
              <Icono n="public" className="ico-18" />
            </span>
          </div>
          <div>
            <div className="metrica-valor">
              <span className="metrica-num">{publicados.length}</span>
              <span className="muted negrita chico">visibles al personal</span>
            </div>
            <div className={'metrica-desc' + (vencenPronto ? ' texto-rojo' : '')}>
              {vencenPronto ? vencenPronto + ' vencen en menos de 15 días' : 'Ninguno vence en los próximos 15 días'}
            </div>
          </div>
          <div className="metrica-pie">
            <span>Página pública</span>
            <span className="texto-verde">Online · Activa</span>
          </div>
        </div>

        <div className="metrica">
          <div className="metrica-cab">
            <span className="caps">Apartados del personal</span>
            <span className="icono-caja rojo">
              <Icono n="loyalty" className="ico-18" />
            </span>
          </div>
          <div>
            <div className="metrica-valor">
              <span className="metrica-num texto-oro">{pendientes}</span>
              <span className="negrita">pendientes</span>
            </div>
            <div className="metrica-desc texto-oro">{porRecoger} seleccionado(s) por recoger</div>
          </div>
          <div className="metrica-pie">
            <span>Por decidir o entregar</span>
            <Link to="/admin/cinepolitos" className="texto-oro" style={{ textDecoration: 'none' }}>
              Revisar lista →
            </Link>
          </div>
        </div>
      </div>

      {/* ── Versiones nuevas y vencimientos ── */}
      <div className="rejilla rejilla-3-2" style={{ marginTop: 22 }}>
        <div className="panel">
          <div className="panel-cab">
            <div className="panel-titulo">
              <span className="icono-caja rojo">
                <Icono n="published_with_changes" />
              </span>
              <div>
                <h3>Versiones nuevas por cambiar</h3>
                <p>Llegó una versión más nueva: retira la anterior para mantener todo actualizado.</p>
              </div>
            </div>
            {alertas.length > 0 && <span className="chip chip-solido chip-caps">{alertas.length} prioritaria(s)</span>}
          </div>
          {alertas.length === 0 ? (
            <div className="vacio" style={{ padding: 20 }}>
              <div className="vacio-icono">
                <Icono n="check_circle" className="texto-verde" />
              </div>
              <strong>Todo al día</strong>
              <div className="muted chico">No hay versiones viejas colocadas.</div>
            </div>
          ) : (
            <div className="lista-alertas">
              {alertas.map((a, i) => (
                <div key={i} className="fila-alerta">
                  <Poster url={a.imagenUrl} alt={a.titulo} chico />
                  <div className="fila-alerta-cuerpo">
                    <div className="fila-alerta-titulo">
                      {a.titulo} <span className="chip chip-verde">v{a.nueva} llegó</span>
                    </div>
                    <div className="fila-alerta-sub">
                      Retirar <b>{etiquetaVersion(a.vieja, a.materialViejo.arte)}</b> ({a.categoria}) de <span className="texto-oro">{a.lugares.join(', ')}</span>
                    </div>
                  </div>
                  <button className="btn btn-chico" onClick={() => moverABodega(a)}>
                    Mover a bodega <Icono n="arrow_forward" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-cab">
            <div className="panel-titulo">
              <span className="icono-caja oro">
                <Icono n="timer" />
              </span>
              <div>
                <h3>Vencimiento para cinepolitos</h3>
                <p className="caps texto-oro" style={{ marginTop: 4 }}>
                  Acción de desecho o entrega requerida
                </p>
              </div>
            </div>
          </div>
          {vencidos.length === 0 ? (
            <div className="vacio" style={{ padding: 20 }}>
              <div className="vacio-icono">
                <Icono n="event_available" className="texto-verde" />
              </div>
              <strong>Sin vencimientos</strong>
              <div className="muted chico">Ningún material pasó su fecha de entrega o desecho.</div>
            </div>
          ) : (
            vencidos.slice(0, 3).map((m) => {
              const h = aDate(m.cinepolitos ? m.cinepolitos.hasta : null);
              const dias = h ? Math.max(0, Math.floor((ahora - h.getTime()) / DIA)) : 0;
              const activas = m.piezas.filter((p) => p.estado === 'activa');
              const lugares = Array.from(new Set(activas.map((p) => etiquetaUbic(p.ubic))));
              const abiertos = d.apartados.filter((a) => a.materialId === m.id && (a.estado === 'apartado' || a.estado === 'seleccionado')).length;
              return (
                <div key={m.id} className="vence-tarjeta">
                  <div style={{ width: 64, flexShrink: 0 }}>
                    <Poster url={m.imagenUrl} alt={m.titulo} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="caps muted">Fuera de exhibición</div>
                    <div className="fila-alerta-titulo" style={{ fontSize: 17 }}>
                      {nombreMaterial(m)}
                    </div>
                    <div className="texto-rojo negrita chico fila" style={{ gap: 4, marginTop: 2 }}>
                      <Icono n="schedule" className="ico-16" /> {dias === 0 ? 'Venció hoy' : 'Venció hace ' + dias + ' día(s)'}
                    </div>
                    <div className="chico muted" style={{ marginTop: 4 }}>
                      {activas.length} pieza(s) activa(s) en {lugares.join(', ')} · {abiertos} apartado(s) abierto(s)
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {vencidos.length > 0 && (
            <Link to="/admin/cinepolitos" className="btn btn-oro btn-bloque mt">
              Gestionar en entregas <Icono n="local_shipping" />
            </Link>
          )}
          <div className="alerta mt" style={{ marginBottom: 0, display: 'flex', gap: 8 }}>
            <Icono n="info" className="texto-oro ico-18" />
            <span className="chico">Al entregar, recuerda imprimir la constancia y recabar la firma de la Gerente y del colaborador.</span>
          </div>
        </div>
      </div>

      {/* ── Distribución ── */}
      <div className="seccion-titulo">
        <div>
          <div className="caps">Mapeo del complejo</div>
          <h2>Distribución de material por ubicación</h2>
        </div>
        <div className="leyenda">
          <span>
            <i style={{ background: 'var(--rojo)' }} /> 100% ocupado
          </span>
          <span>
            <i style={{ background: 'var(--verde)' }} /> Con espacio
          </span>
          <span>
            <i style={{ background: 'var(--oro)' }} /> Almacén
          </span>
        </div>
      </div>
      <div className="ubic-grid">
        <div className="ubic">
          <div className="ubic-cab">
            <span className="caps">Almacén</span>
            <Icono n="warehouse" className="texto-oro" />
          </div>
          <div className="ubic-num">{enBodega}</div>
          <div className="ubic-nombre">Bodega</div>
          <div className="ubic-desc">Material en reserva</div>
          <div className="ubic-barra">
            <div style={{ width: (totalPiezas ? (enBodega / totalPiezas) * 100 : 0) + '%', background: 'var(--oro)' }} />
          </div>
        </div>
        {zonas.map((z) => {
          const lleno = z.total > 0 && z.usados >= z.total;
          const vacantes = Math.max(0, z.total - z.usados);
          const pct = z.total ? Math.min(100, (z.usados / z.total) * 100) : 0;
          const libre = vacantes > 0;
          return (
            <div key={z.tipo} className={'ubic' + (libre ? ' libre' : '')}>
              <div className="ubic-cab">
                <span className={'caps' + (libre ? ' texto-verde' : '')}>{libre ? vacantes + ' vacante(s)' : z.area}</span>
                <Icono n={z.icono} className={libre ? 'texto-verde' : ''} />
              </div>
              <div className="ubic-num">
                {z.usados} / {z.total}
              </div>
              <div className="ubic-nombre">{z.nombre}</div>
              <div className={'ubic-desc' + (lleno ? ' texto-rojo' : '')}>{lleno ? 'Completo' : z.desc}</div>
              <div className="ubic-barra">
                <div
                  style={{
                    width: pct + '%',
                    background: lleno ? 'var(--rojo)' : 'var(--verde)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Bitácora ── */}
      <div className="panel" style={{ marginTop: 26 }}>
        <div className="panel-cab">
          <h3 className="fila" style={{ gap: 8 }}>
            <span className="punto latido" /> Bitácora en tiempo real
            <span className="muted chico" style={{ fontWeight: 500 }}>
              · Últimos movimientos
            </span>
          </h3>
          <Link to="/admin/movimientos" className="texto-oro negrita chico" style={{ textDecoration: 'none' }}>
            Ver bitácora completa ›
          </Link>
        </div>
        {recientes.length === 0 ? (
          <p className="muted">Aún no hay movimientos registrados.</p>
        ) : (
          <div className="bitacora-lista">
            {recientes.map((m) => {
              const ic = iconoAccion(m.accion);
              return (
                <div key={m.id} className="bitacora-item">
                  <span className={'icono-caja ' + ic.c}>
                    <Icono n={ic.i} className="ico-18" />
                  </span>
                  <div className="bitacora-cuerpo">
                    <div>
                      <b>{m.adminNombre}</b> <span className="chip">{m.accion}</span>
                    </div>
                    <div className="chico muted" style={{ marginTop: 3 }}>
                      {m.detalle}
                    </div>
                  </div>
                  <span className="bitacora-fecha">{fmtFechaHora(m.fecha)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
