import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, correoDeId, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { BotonTema, CampoClave, Icono } from '../components/ui';
import { errorTexto } from '../lib/utilidades';

export default function Login() {
  const { usuario, admin, cargando } = useAuth();
  const [id, setId] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sinSetup, setSinSetup] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'config', 'setup'))
      .then((s) => setSinSetup(!s.exists()))
      .catch(() => setSinSetup(false));
  }, []);

  if (!cargando && usuario && admin && admin.activo) return <Navigate to="/admin" replace />;

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await signInWithEmailAndPassword(auth, correoDeId(id), clave);
    } catch (err) {
      setError(errorTexto(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="centro-pantalla">
      <div style={{ position: 'fixed', top: 14, right: 14 }}>
        <BotonTema />
      </div>
      <form className="tarjeta acceso" onSubmit={entrar}>
        <div className="marca-logo">
          <Icono n="theaters" relleno />
        </div>
        <h2 className="centro" style={{ marginBottom: 4 }}>
          Control de Pósters
        </h2>
        <p className="muted centro" style={{ marginTop: 0 }}>
          Panel de administración
        </p>
        {sinSetup && (
          <div className="alerta alerta-info">
            Aún no hay administradores. <Link to="/admin/configuracion-inicial">Crea el primero aquí</Link>.
          </div>
        )}
        <div className="pila">
          <label className="campo">
            <span>ID de administrador</span>
            <input value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" autoFocus required />
          </label>
          <label className="campo">
            <span>Contraseña</span>
            <CampoClave value={clave} onChange={setClave} autoComplete="current-password" required />
          </label>
          {error && <div className="alerta alerta-error">{error}</div>}
          <button className="btn btn-primario btn-bloque" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
          <a className="btn btn-fantasma btn-bloque" href="#/">
            Ir a la página de cinepolitos
          </a>
        </div>
      </form>
    </div>
  );
}
