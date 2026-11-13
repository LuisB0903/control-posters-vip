import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { BotonTema, Cargando } from './ui';
import { alertasVersiones, materialesVencidos } from '../lib/alertas';

const MENU = [
  { a: '/admin', t: 'Inicio', i: '◧', fin: true },
  { a: '/admin/sugeridor', t: 'Sugeridor semanal', i: '✦' },
  { a: '/admin/inventario', t: 'Inventario', i: '▤' },
  { a: '/admin/cinepolitos', t: 'Apartados y entregas', i: '✋' },
  { a: '/admin/semanas', t: 'Historial de semanas', i: '☰' },
  { a: '/admin/empleados', t: 'Empleados', i: '☺' },
  { a: '/admin/movimientos', t: 'Bitácora', i: '⟲' },
  { a: '/admin/administradores', t: 'Administradores', i: '⚿' },
  { a: '/admin/configuracion', t: 'Configuración', i: '⚙' },
];

export default function Layout() {
  const { admin, salir } = useAuth();
  const data = useData();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const loc = useLocation();

  const pendientes =
    alertasVersiones(data.materiales, data.categorias).length + materialesVencidos(data.materiales).length;

  return (
    <div className={'app' + (menuAbierto ? ' menu-abierto' : '')}>
      <aside className="lateral" onClick={() => setMenuAbierto(false)}>
        <div className="marca">
          <div className="marca-logo">VIP</div>
          <div>
            <div className="marca-titulo">Pósters</div>
            <div className="marca-sub">{data.config.conjunto}</div>
          </div>
        </div>
        <nav>
          {MENU.map((m) => (
            <NavLink key={m.a} to={m.a} end={m.fin} className={({ isActive }) => 'nav-item' + (isActive ? ' activo' : '')}>
              <span className="nav-icono">{m.i}</span>
              <span>{m.t}</span>
              {m.a === '/admin' && pendientes > 0 && <span className="nav-badge">{pendientes}</span>}
            </NavLink>
          ))}
        </nav>
        <a className="nav-item nav-publico" href="#/" target="_blank" rel="noreferrer">
          <span className="nav-icono">↗</span>
          <span>Página de cinepolitos</span>
        </a>
      </aside>
      <div className="principal">
        <header className="barra">
          <button className="btn-icono solo-movil" onClick={() => setMenuAbierto(!menuAbierto)} aria-label="Menú">
            ☰
          </button>
          <div className="barra-ruta">{(MENU.find((m) => (m.fin ? loc.pathname === m.a : loc.pathname.indexOf(m.a) === 0)) || MENU[0]).t}</div>
          <div className="barra-der">
            <BotonTema />
            <div className="usuario">
              <span className="usuario-avatar">{(admin?.nombre || '?').slice(0, 1).toUpperCase()}</span>
              <span className="oculto-movil">{admin?.nombre}</span>
            </div>
            <button className="btn btn-chico" onClick={salir}>
              Salir
            </button>
          </div>
        </header>
        <main className="contenido">
          {data.error && <div className="alerta alerta-error">Error de conexión con la base de datos: {data.error}</div>}
          {data.listo ? <Outlet /> : <Cargando texto="Cargando datos…" />}
        </main>
      </div>
      {menuAbierto && <div className="velo" onClick={() => setMenuAbierto(false)} />}
    </div>
  );
}
