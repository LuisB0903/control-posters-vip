import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { BotonTema, Cargando, Icono } from './ui';
import { alertasVersiones, materialesVencidos } from '../lib/alertas';
import { idSemana, semanaActual } from '../lib/fechas';
import { sincronizarFilas } from '../lib/acciones';

const MENU = [
  { a: '/admin', t: 'Inicio', corto: 'Inicio', i: 'space_dashboard', fin: true },
  { a: '/admin/inventario', t: 'Inventario', corto: 'Inventario', i: 'movie' },
  { a: '/admin/sugeridor', t: 'Sugeridor semanal', corto: 'Sugeridor', i: 'auto_awesome' },
  { a: '/admin/cinepolitos', t: 'Apartados y entregas', corto: 'Apartados', i: 'inventory' },
  { a: '/admin/semanas', t: 'Historial de semanas', corto: 'Semanas', i: 'date_range' },
  { a: '/admin/empleados', t: 'Empleados', corto: 'Empleados', i: 'badge' },
  { a: '/admin/movimientos', t: 'Bitácora', corto: 'Bitácora', i: 'history' },
  { a: '/admin/administradores', t: 'Administradores', corto: 'Admins', i: 'admin_panel_settings' },
  { a: '/admin/configuracion', t: 'Configuración', corto: 'Config.', i: 'settings' },
];

/** Menú lateral agrupado por tipo de tarea */
const GRUPOS = [
  { t: 'Operación', items: MENU.slice(0, 4) },
  { t: 'Registro', items: [MENU[4], MENU[6]] },
  { t: 'Administración', items: [MENU[5], MENU[7], MENU[8]] },
];

export default function Layout() {
  const { admin, salir, quien } = useAuth();
  const data = useData();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const loc = useLocation();

  // Apartados antiguos sin turno → se ordenan por llegada una sola vez
  const sincronizado = useRef(false);
  useEffect(() => {
    if (!data.listo || !quien || sincronizado.current) return;
    if (!data.apartados.some((a) => typeof a.turno !== 'number')) return;
    sincronizado.current = true;
    sincronizarFilas(quien, data.apartados).catch(() => {
      sincronizado.current = false;
    });
  }, [data.listo, data.apartados, quien]);

  // cerrar el menú móvil al cambiar de página
  useEffect(() => {
    setMenuAbierto(false);
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  const pendientes =
    alertasVersiones(data.materiales, data.categorias).length + materialesVencidos(data.materiales).length;
  const hoy = semanaActual(data.config);
  const semana = data.semanas.find((s) => s.id === idSemana(hoy.anio, hoy.semana));
  const activo = (a: string, fin?: boolean) => (fin ? loc.pathname === a : loc.pathname.indexOf(a) === 0);
  const masActivo = MENU.slice(4).some((m) => activo(m.a));

  const badge = (m: (typeof MENU)[number]) => (m.a === '/admin' && pendientes > 0 ? <span className="nav-badge">{pendientes}</span> : null);

  const actual = MENU.find((m) => activo(m.a, m.fin));
  const estadoSemana = semana ? (semana.estado === 'aplicada' ? 'aplicada' : 'borrador') : 'pendiente';

  return (
    <div className={'app' + (menuAbierto ? ' menu-abierto' : '')}>
      {/* ── Menú lateral (en celular es un cajón) ── */}
      <aside className="lateral" aria-label="Menú principal">
        <NavLink to="/admin" end className="marca">
          <span className="marca-logo">
            <Icono n="theaters" relleno />
          </span>
          <span className="marca-texto">
            <span className="marca-titulo">
              Control de Pósters <span className="etiqueta-vip">VIP</span>
            </span>
            <span className="marca-sub">{data.config.conjunto}</span>
          </span>
        </NavLink>

        <nav className="lateral-nav">
          {GRUPOS.map((g) => (
            <div key={g.t} className="nav-grupo">
              <div className="nav-grupo-titulo">{g.t}</div>
              {g.items.map((m) => (
                <NavLink key={m.a} to={m.a} end={m.fin} className={({ isActive }) => 'nav-item' + (isActive ? ' activo' : '')}>
                  <Icono n={m.i} relleno={activo(m.a, m.fin)} />
                  <span>{m.t}</span>
                  {badge(m)}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="lateral-pie">
          <NavLink to="/admin/semanas" className={'semana-estado semana-' + estadoSemana}>
            <span className="semana-estado-cab">
              <span>Semana {hoy.semana}</span>
              <span className="semana-estado-chip">
                {estadoSemana === 'aplicada' ? 'Aplicada' : estadoSemana === 'borrador' ? 'Borrador' : 'Pendiente'}
              </span>
            </span>
            <span className="semana-estado-desc">
              {semana
                ? semana.estado === 'aplicada'
                  ? 'Colocación aplicada por ' + semana.aplicadaPor
                  : 'Borrador del cronograma guardado'
                : 'Cronograma pendiente de cargar'}
            </span>
          </NavLink>
          <a className="nav-item" href="#/" target="_blank" rel="noreferrer">
            <Icono n="local_activity" />
            <span>Página de cinepolitos</span>
            <Icono n="open_in_new" className="nav-externo" />
          </a>
        </div>
      </aside>
      {menuAbierto && <div className="velo" onClick={() => setMenuAbierto(false)} />}

      {/* ── Barra superior ── */}
      <header className="cab">
        <button className="btn-icono solo-movil" onClick={() => setMenuAbierto(!menuAbierto)} aria-label="Abrir menú" aria-expanded={menuAbierto}>
          <Icono n="menu" />
        </button>
        <div className="cab-ubicacion">
          <span className="cab-ubicacion-raiz oculto-movil">Panel</span>
          <Icono n="chevron_right" className="cab-ubicacion-sep oculto-movil" />
          <span className="cab-ubicacion-actual">{actual ? actual.t : 'Inicio'}</span>
        </div>
        <div className="cab-der">
          <a className="btn btn-chico btn-fantasma oculto-movil" href="#/" target="_blank" rel="noreferrer">
            <Icono n="local_activity" /> Portal cinepolitos
          </a>
          <BotonTema />
          <div className="usuario" title={admin?.nombre}>
            <span className="usuario-avatar" aria-hidden="true">
              {(admin?.nombre || '?').slice(0, 1).toUpperCase()}
            </span>
            <span className="usuario-datos oculto-movil">
              <span className="usuario-nombre">{admin?.nombre}</span>
              <span className="usuario-id">ID {admin?.adminId}</span>
            </span>
          </div>
          <button className="btn-icono" onClick={salir} title="Cerrar sesión" aria-label="Cerrar sesión">
            <Icono n="logout" />
          </button>
        </div>
      </header>

      {/* ── Contenido ── */}
      <div className="principal">
        <main className="contenido">
          {data.error && <div className="alerta alerta-error">Error de conexión con la base de datos: {data.error}</div>}
          {data.listo ? <Outlet /> : <Cargando texto="Cargando datos…" />}
        </main>
      </div>

      {/* ── Barra inferior (celular) ── */}
      <nav className="nav-movil">
        {MENU.slice(0, 4).map((m) => (
          <NavLink key={m.a} to={m.a} end={m.fin} className={({ isActive }) => (isActive ? 'activo' : '')}>
            <Icono n={m.i} relleno={activo(m.a, m.fin)} />
            <span>{m.corto}</span>
            {badge(m)}
          </NavLink>
        ))}
        <button className={masActivo ? 'activo' : ''} onClick={() => setMenuAbierto(true)}>
          <Icono n="more_horiz" />
          <span>Más</span>
        </button>
      </nav>
    </div>
  );
}
