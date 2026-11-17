import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { BotonTema, Cargando, Icono } from "./ui";
import { alertasVersiones, materialesVencidos } from "../lib/alertas";
import { idSemana, semanaISO } from "../lib/fechas";
import { sincronizarFilas } from "../lib/acciones";

const MENU = [
  {
    a: "/admin",
    t: "Inicio",
    corto: "Inicio",
    i: "space_dashboard",
    fin: true,
  },
  { a: "/admin/inventario", t: "Inventario", corto: "Inventario", i: "movie" },
  {
    a: "/admin/sugeridor",
    t: "Sugeridor semanal",
    corto: "Sugeridor",
    i: "auto_awesome",
  },
  {
    a: "/admin/cinepolitos",
    t: "Apartados y entregas",
    corto: "Apartados",
    i: "inventory",
  },
  {
    a: "/admin/semanas",
    t: "Historial de semanas",
    corto: "Semanas",
    i: "date_range",
  },
  { a: "/admin/empleados", t: "Empleados", corto: "Empleados", i: "badge" },
  { a: "/admin/movimientos", t: "Bitácora", corto: "Bitácora", i: "history" },
  {
    a: "/admin/administradores",
    t: "Administradores",
    corto: "Admins",
    i: "admin_panel_settings",
  },
  {
    a: "/admin/configuracion",
    t: "Configuración",
    corto: "Config.",
    i: "settings",
  },
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
    if (!data.apartados.some((a) => typeof a.turno !== "number")) return;
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
    alertasVersiones(data.materiales, data.categorias).length +
    materialesVencidos(data.materiales).length;
  const hoy = semanaISO(new Date());
  const semana = data.semanas.find(
    (s) => s.id === idSemana(hoy.anio, hoy.semana),
  );
  const activo = (a: string, fin?: boolean) =>
    fin ? loc.pathname === a : loc.pathname.indexOf(a) === 0;
  const masActivo = MENU.slice(4).some((m) => activo(m.a));

  const badge = (m: (typeof MENU)[number]) =>
    m.a === "/admin" && pendientes > 0 ? (
      <span className="nav-badge">{pendientes}</span>
    ) : null;

  return (
    <div className={"app" + (menuAbierto ? " menu-abierto" : "")}>
      {/* ── Encabezado superior ── */}
      <header className="cab">
        <button
          className="btn-icono solo-movil"
          onClick={() => setMenuAbierto(!menuAbierto)}
          aria-label="Menú"
        >
          <Icono n="menu" />
        </button>
        <NavLink to="/admin" className="marca">
          <span className="marca-logo">
            <Icono n="theaters" relleno />
          </span>
          <span style={{ minWidth: 0 }}>
            <span className="marca-titulo">
              Control de pósters <span className="etiqueta-vip">VIP</span>
            </span>
            <span
              className="marca-sub oculto-movil"
              style={{ display: "block" }}
            >
              {data.config.conjunto}
            </span>
          </span>
        </NavLink>
        <nav className="nav-top">
          {MENU.slice(0, 7).map((m) => (
            <NavLink
              key={m.a}
              to={m.a}
              end={m.fin}
              className={({ isActive }) => (isActive ? "activo" : "")}
            >
              {m.corto}
              {badge(m)}
            </NavLink>
          ))}
        </nav>
        <div className="cab-der">
          <a
            className="btn-portal oculto-movil"
            href="#/"
            target="_blank"
            rel="noreferrer"
          >
            <Icono n="local_activity" className="ico-18" /> Página cinepolitos ↗
          </a>
          <BotonTema />
          <div className="usuario">
            <span className="punto" />
            <span className="oculto-movil">{admin?.nombre}</span>
            <span className="usuario-avatar">
              {(admin?.nombre || "?").slice(0, 1).toUpperCase()}
            </span>
          </div>
          <button
            className="btn-icono"
            onClick={salir}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <Icono n="logout" />
          </button>
        </div>
      </header>

      {/* ── Menú lateral (en celular es un cajón) ── */}
      <aside className="lateral">
        <div>
          <div className="lateral-titulo">
            <span className="caps muted">Navegación</span>
            <span className="chip chip-verde">
              <span className="punto latido" /> En vivo
            </span>
          </div>
          <nav>
            {MENU.map((m) => (
              <NavLink
                key={m.a}
                to={m.a}
                end={m.fin}
                className={({ isActive }) =>
                  "nav-item" + (isActive ? " activo" : "")
                }
              >
                <Icono n={m.i} />
                <span>{m.t}</span>
                {badge(m)}
              </NavLink>
            ))}
          </nav>
        </div>
        <div>
          <a className="nav-item" href="#/" target="_blank" rel="noreferrer">
            <Icono n="local_activity" />
            <span>Página de cinepolitos ↗</span>
          </a>
          <div className="lateral-pie">
            <div className="caps texto-oro">Semana {hoy.semana}</div>
            <div className="chico muted" style={{ marginTop: 2 }}>
              {semana
                ? semana.estado === "aplicada"
                  ? "Colocación aplicada por " + semana.aplicadaPor
                  : "Borrador del cronograma guardado"
                : "Cronograma pendiente de cargar"}
            </div>
          </div>
        </div>
      </aside>
      {menuAbierto && (
        <div className="velo" onClick={() => setMenuAbierto(false)} />
      )}

      {/* ── Contenido ── */}
      <div className="principal">
        <main className="contenido">
          {data.error && (
            <div className="alerta alerta-error">
              Error de conexión con la base de datos: {data.error}
            </div>
          )}
          {data.listo ? <Outlet /> : <Cargando texto="Cargando datos…" />}
        </main>
        <footer className="pie">
          <span>
            <span className="punto" style={{ marginRight: 6 }} />
            {data.config.conjunto} · Control de pósters · Conectado con TMDB y
            Firebase
          </span>
          <span>
            <b>Semana {hoy.semana}</b> · {hoy.anio}
          </span>
        </footer>
      </div>

      {/* ── Barra inferior (celular) ── */}
      <nav className="nav-movil">
        {MENU.slice(0, 4).map((m) => (
          <NavLink
            key={m.a}
            to={m.a}
            end={m.fin}
            className={({ isActive }) => (isActive ? "activo" : "")}
          >
            <Icono n={m.i} relleno={activo(m.a, m.fin)} />
            <span>{m.corto}</span>
            {badge(m)}
          </NavLink>
        ))}
        <button
          className={masActivo ? "activo" : ""}
          onClick={() => setMenuAbierto(true)}
        >
          <Icono n="more_horiz" />
          <span>Más</span>
        </button>
      </nav>
    </div>
  );
}
