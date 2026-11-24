import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, correoDeId, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { CampoClave, Icono } from '../components/ui';
import { MarcoAcceso } from '../components/Acceso';
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
    <MarcoAcceso
      titulo="Iniciar sesión"
      descripcion="Entra con tu ID y contraseña de administrador."
      pie={
        <a href="#/">
          <Icono n="local_activity" /> Ir a la página de cinepolitos
        </a>
      }
    >
      {sinSetup && (
        <div className="ingreso-aviso">
          <Icono n="info" />
          <span>
            Aún no hay administradores. <Link to="/admin/configuracion-inicial">Crea el primero</Link>
          </span>
        </div>
      )}
      <form className="ingreso-form" onSubmit={entrar}>
        <label className="campo">
          <span>ID de administrador</span>
          <input value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label className="campo">
          <span>Contraseña</span>
          <CampoClave value={clave} onChange={setClave} autoComplete="current-password" required />
        </label>
        {error && (
          <div className="ingreso-error" role="alert">
            <Icono n="error" />
            <span>{error}</span>
          </div>
        )}
        <button className="btn btn-primario btn-bloque ingreso-enviar" disabled={enviando}>
          {enviando ? (
            <>
              <span className="spinner" /> Entrando…
            </>
          ) : (
            <>
              Entrar <Icono n="arrow_forward" />
            </>
          )}
        </button>
      </form>
    </MarcoAcceso>
  );
}
