import { useState, type FormEvent } from 'react';
import { createUserWithEmailAndPassword, EmailAuthProvider, reauthenticateWithCredential, signOut, updatePassword } from 'firebase/auth';
import { doc, serverTimestamp, writeBatch, collection } from 'firebase/firestore';
import { authSecundaria, auth, correoDeId, db, limpiarIdAdmin } from '../firebase';
import { useData } from '../context/DataContext';
import { useQuien } from '../context/AuthContext';
import { CabPagina, CampoClave, Icono, useUI } from '../components/ui';
import { cambiarAdminActivo, registrarMovimiento } from '../lib/acciones';
import { errorTexto } from '../lib/utilidades';

export default function Administradores() {
  const d = useData();
  const quien = useQuien();
  const { toast, confirmar } = useUI();
  const [id, setId] = useState('');
  const [nombre, setNombre] = useState('');
  const [clave, setClave] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    const limpio = limpiarIdAdmin(id);
    if (!limpio) return toast('ID no válido', 'error');
    if (clave.length < 6) return toast('La contraseña debe tener al menos 6 caracteres', 'error');
    setOcupado(true);
    try {
      // Se crea con una app secundaria para no cerrar tu sesión
      const authSec = authSecundaria();
      const cred = await createUserWithEmailAndPassword(authSec, correoDeId(limpio), clave);
      await signOut(authSec);
      const b = writeBatch(db);
      b.set(doc(db, 'admins', cred.user.uid), { adminId: limpio, nombre: nombre.trim(), activo: true, creadoEn: serverTimestamp() });
      b.set(doc(collection(db, 'movimientos')), {
        fecha: serverTimestamp(),
        adminUid: quien.uid,
        adminId: quien.adminId,
        adminNombre: quien.nombre,
        accion: 'Administrador creado',
        detalle: limpio + ' · ' + nombre.trim(),
      });
      await b.commit();
      toast('Administrador creado');
      setId('');
      setNombre('');
      setClave('');
    } catch (er) {
      toast(errorTexto(er), 'error');
    } finally {
      setOcupado(false);
    }
  };

  const cambiarClave = async (e: FormEvent) => {
    e.preventDefault();
    const u = auth.currentUser;
    if (!u || !u.email) return;
    if (nueva.length < 6) return toast('La nueva contraseña debe tener al menos 6 caracteres', 'error');
    try {
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, actual));
      await updatePassword(u, nueva);
      await registrarMovimiento(quien, 'Contraseña cambiada', quien.adminId);
      toast('Contraseña actualizada');
      setActual('');
      setNueva('');
    } catch (er) {
      toast(errorTexto(er), 'error');
    }
  };

  const activos = d.admins.filter((a) => a.activo).length;

  return (
    <div>
      <CabPagina titulo="Administradores" desc={activos + ' con acceso al panel. Cada acción queda registrada en la bitácora con su nombre.'} />
      <div className="rejilla rejilla-3-2" style={{ alignItems: 'start' }}>
        <section className="bloque">
          <div className="bloque-cab">
            <h2>Equipo</h2>
            <span className="bloque-desc">{d.admins.length} cuenta(s)</span>
          </div>
          <ul className="lista-admins">
            {d.admins.map((a) => (
              <li key={a.uid} className={a.activo ? '' : 'inactivo'}>
                <span className="persona-avatar" aria-hidden="true">
                  {a.nombre.slice(0, 1).toUpperCase()}
                </span>
                <span className="persona-datos">
                  <b>
                    {a.nombre} {a.uid === quien.uid && <span className="chip chip-oro">Tú</span>}
                  </b>
                  <small>ID {a.adminId}</small>
                </span>
                {a.activo ? (
                  <span className="estado-chip estado-chip-entregado">
                    <Icono n="check_circle" /> Activo
                  </span>
                ) : (
                  <span className="estado-chip estado-chip-no">
                    <Icono n="block" /> Desactivado
                  </span>
                )}
                {a.uid !== quien.uid && (
                  <button
                    className={'btn btn-chico' + (a.activo ? ' btn-peligro' : '')}
                    onClick={async () => {
                      if (
                        await confirmar({
                          titulo: a.activo ? 'Desactivar administrador' : 'Activar administrador',
                          mensaje: a.activo ? a.nombre + ' ya no podrá entrar al panel.' : a.nombre + ' podrá volver a entrar.',
                          peligro: a.activo,
                        })
                      )
                        cambiarAdminActivo(quien, a.uid, a.adminId, !a.activo)
                          .then(() => toast(a.activo ? 'Administrador desactivado' : 'Administrador activado'))
                          .catch((er) => toast(errorTexto(er), 'error'));
                    }}
                  >
                    {a.activo ? 'Desactivar' : 'Activar'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
        <div className="pila-bloques">
          <form className="bloque" onSubmit={crear}>
            <div className="bloque-cab">
              <h2>Nuevo administrador</h2>
            </div>
            <div className="pila">
              <label className="campo">
                <span>ID (para iniciar sesión)</span>
                <input value={id} onChange={(e) => setId(e.target.value)} autoComplete="off" required />
              </label>
              <label className="campo">
                <span>Nombre</span>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
              </label>
              <label className="campo">
                <span>Contraseña inicial</span>
                <CampoClave value={clave} onChange={setClave} required minLength={6} />
                <small>Mínimo 6 caracteres. Compártela con la persona; después puede cambiarla desde aquí.</small>
              </label>
              <button className="btn btn-primario" disabled={ocupado}>
                <Icono n="person_add" /> {ocupado ? 'Creando…' : 'Crear administrador'}
              </button>
            </div>
          </form>
          <form className="bloque" onSubmit={cambiarClave}>
            <div className="bloque-cab">
              <h2>Cambiar mi contraseña</h2>
            </div>
            <div className="pila">
              <label className="campo">
                <span>Contraseña actual</span>
                <CampoClave value={actual} onChange={setActual} required autoComplete="current-password" />
              </label>
              <label className="campo">
                <span>Nueva contraseña</span>
                <CampoClave value={nueva} onChange={setNueva} required minLength={6} />
              </label>
              <button className="btn">
                <Icono n="key" /> Cambiar contraseña
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
