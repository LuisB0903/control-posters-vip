import type { ReactNode } from 'react';
import { BotonTema, Icono } from './ui';

const FUNCIONES = [
  { i: 'inventory_2', t: 'Inventario', d: 'Material publicitario por ubicación, versión y pieza.' },
  { i: 'auto_awesome', t: 'Sugeridor semanal', d: 'Rotación de pósters a partir del cronograma.' },
  { i: 'how_to_reg', t: 'Apartados y entregas', d: 'Material para cinepolitos con constancia firmada.' },
];

/** Marco común de las pantallas de acceso (inicio de sesión y configuración inicial) */
export function MarcoAcceso({
  titulo,
  descripcion,
  children,
  pie,
}: {
  titulo: string;
  descripcion: ReactNode;
  children: ReactNode;
  pie?: ReactNode;
}) {
  return (
    <div className="ingreso">
      <aside className="ingreso-marca" aria-hidden="true">
        <div className="ingreso-logo">
          <span className="ingreso-logo-icono">
            <Icono n="theaters" relleno />
          </span>
          <span>
            Control de Pósters <span className="etiqueta-vip">VIP</span>
          </span>
        </div>
        <div>
          <p className="ingreso-lema">Todo el material de exhibición del conjunto, en un solo panel.</p>
          <ul className="ingreso-funciones">
            {FUNCIONES.map((f) => (
              <li key={f.t}>
                <span className="ingreso-funcion-icono">
                  <Icono n={f.i} />
                </span>
                <span>
                  <b>{f.t}</b>
                  <span>{f.d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <span className="ingreso-nota">Uso exclusivo del personal administrativo</span>
      </aside>

      <main className="ingreso-panel">
        <div className="ingreso-tema">
          <BotonTema />
        </div>
        <div className="ingreso-caja">
          <div className="ingreso-logo ingreso-logo-movil">
            <span className="ingreso-logo-icono">
              <Icono n="theaters" relleno />
            </span>
            <span>
              Control de Pósters <span className="etiqueta-vip">VIP</span>
            </span>
          </div>
          <h1 className="ingreso-titulo">{titulo}</h1>
          <p className="ingreso-desc">{descripcion}</p>
          {children}
          {pie && <div className="ingreso-pie">{pie}</div>}
        </div>
      </main>
    </div>
  );
}
