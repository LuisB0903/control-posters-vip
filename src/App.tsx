import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { UIProvider, Cargando } from './components/ui';
import { configurado } from './firebase';
import Layout from './components/Layout';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Inicio from './pages/Inicio';
import Inventario from './pages/Inventario';
import Sugeridor from './pages/Sugeridor';
import Semanas from './pages/Semanas';
import Apartados from './pages/Apartados';
import Empleados from './pages/Empleados';
import Movimientos from './pages/Movimientos';
import Administradores from './pages/Administradores';
import Configuracion from './pages/Configuracion';
import Cinepolitos from './pages/Cinepolitos';

function RequiereAdmin() {
  const { usuario, admin, cargando, salir } = useAuth();
  if (cargando) return <Cargando texto="Verificando sesión…" />;
  if (!usuario) return <Navigate to="/admin/login" replace />;
  if (!admin || !admin.activo)
    return (
      <div className="centro-pantalla">
        <div className="tarjeta" style={{ maxWidth: 420 }}>
          <h2>Sin acceso</h2>
          <p className="muted">Tu usuario no es administrador o fue desactivado.</p>
          <button className="btn btn-primario" onClick={salir}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  return (
    <DataProvider>
      <Layout />
    </DataProvider>
  );
}

function SinConfigurar() {
  return (
    <div className="centro-pantalla">
      <div className="tarjeta" style={{ maxWidth: 520 }}>
        <h2>Falta configurar Firebase</h2>
        <p className="muted">
          Abre el archivo <code>src/firebase-config.ts</code> y pega la configuración de tu proyecto de Firebase
          (revisa la guía, paso 3).
        </p>
      </div>
    </div>
  );
}

export default function App() {
  if (!configurado) return <SinConfigurar />;
  return (
    <UIProvider>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<Cinepolitos />} />
            <Route path="/admin/login" element={<Login />} />
            <Route path="/admin/configuracion-inicial" element={<Setup />} />
            <Route path="/admin" element={<RequiereAdmin />}>
              <Route index element={<Inicio />} />
              <Route path="sugeridor" element={<Sugeridor />} />
              <Route path="inventario" element={<Inventario />} />
              <Route path="cinepolitos" element={<Apartados />} />
              <Route path="semanas" element={<Semanas />} />
              <Route path="empleados" element={<Empleados />} />
              <Route path="movimientos" element={<Movimientos />} />
              <Route path="administradores" element={<Administradores />} />
              <Route path="configuracion" element={<Configuracion />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </AuthProvider>
    </UIProvider>
  );
}
