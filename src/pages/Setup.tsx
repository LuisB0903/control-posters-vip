import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, correoDeId, db, limpiarIdAdmin } from '../firebase';
import { CATEGORIAS_DEFAULT, CONFIG_DEFAULT } from '../types';
import { CampoClave, Cargando, Icono } from '../components/ui';
import { errorTexto } from '../lib/utilidades';

/** Pantalla que solo aparece una vez: crea al primer administrador y la configuración inicial */
export default function Setup() {
  const nav = useNavigate();
  const [estado, setEstado] = useState<'revisando' | 'libre' | 'hecho'>('revisando');
  const [id, setId] = useState('');
  const [nombre, setNombre] = useState('');
  const [clave, setClave] = useState('');
  const [clave2, setClave2] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'config', 'setup'))
      .then((s) => setEstado(s.exists() ? 'hecho' : 'libre'))
      .catch((e) => {
        setError(errorTexto(e));
        setEstado('libre');
      });
  }, []);

  if (estado === 'revisando') return <Cargando />;
  if (estado === 'hecho') return <Navigate to="/admin/login" replace />;

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!limpiarIdAdmin(id)) return setError('Escribe un ID válido (letras o números).');
    if (clave.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    if (clave !== clave2) return setError('Las contraseñas no coinciden.');
    setEnviando(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, correoDeId(id), clave);
      const uid = cred.user.uid;
      // 1) administrador + marca de configuración (en el mismo batch, lo exigen las reglas)
      const b1 = writeBatch(db);
      b1.set(doc(db, 'admins', uid), { adminId: limpiarIdAdmin(id), nombre: nombre.trim(), activo: true, creadoEn: serverTimestamp() });
      b1.set(doc(db, 'config', 'setup'), { por: uid, creadoEn: serverTimestamp() });
      await b1.commit();
      // 2) configuración por defecto (ya como administrador)
      const b2 = writeBatch(db);
      b2.set(doc(db, 'config', 'general'), CONFIG_DEFAULT);
      b2.set(doc(db, 'config', 'categorias'), { lista: CATEGORIAS_DEFAULT });
      b2.set(doc(db, 'movimientos', 'inicio'), {
        fecha: serverTimestamp(),
        adminUid: uid,
        adminId: limpiarIdAdmin(id),
        adminNombre: nombre.trim(),
        accion: 'Configuración inicial',
        detalle: 'Se creó el primer administrador',
      });
      await b2.commit();
      nav('/admin', { replace: true });
    } catch (err) {
      setError(errorTexto(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="centro-pantalla">
      <form className="tarjeta acceso" onSubmit={crear} style={{ maxWidth: 440 }}>
        <div className="marca-logo">
          <Icono n="theaters" relleno />
        </div>
        <h2 className="centro">Configuración inicial</h2>
        <p className="muted centro" style={{ marginTop: 0 }}>
          Crea al primer administrador. Esta pantalla solo funciona una vez.
        </p>
        <div className="pila">
          <label className="campo">
            <span>ID de administrador</span>
            <input value={id} onChange={(e) => setId(e.target.value)} placeholder="Ej. 244689 o supervisor1" required />
            <small>Con este ID se inicia sesión. Solo letras, números, punto, guion.</small>
          </label>
          <label className="campo">
            <span>Nombre completo</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <label className="campo">
            <span>Contraseña</span>
            <CampoClave value={clave} onChange={setClave} required minLength={6} />
          </label>
          <label className="campo">
            <span>Repetir contraseña</span>
            <CampoClave value={clave2} onChange={setClave2} required minLength={6} />
          </label>
          {error && <div className="alerta alerta-error">{error}</div>}
          <button className="btn btn-primario btn-bloque" disabled={enviando}>
            {enviando ? 'Creando…' : 'Crear administrador'}
          </button>
        </div>
      </form>
    </div>
  );
}
