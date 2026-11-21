import { useState, type FormEvent } from 'react';
import { createUserWithEmailAndPassword, EmailAuthProvider, getAuth, reauthenticateWithCredential, signOut, updatePassword } from 'firebase/auth';
import { doc, serverTimestamp, writeBatch, collection } from 'firebase/firestore';
import { appSecundaria, auth, correoDeId, db, limpiarIdAdmin } from '../firebase';
import { useData } from '../context/DataContext';
import { useQuien } from '../context/AuthContext';
import { CampoClave, useUI } from '../components/ui';
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
      const authSec = getAuth(appSecundaria());
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

  return (
    <div>
      <div className="cabecera">
        <div>
          <h1>Administradores</h1>
          <p>Quién puede entrar al panel. Cada acción queda registrada con su nombre.</p>
        </div>
      </div>
      <div className="rejilla rejilla-2" style={{ alignItems: 'start' }}>
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {d.admins.map((a) => (
                <tr key={a.uid}>
                  <td className="negrita">{a.adminId}</td>
                  <td>
                    {a.nombre} {a.uid === quien.uid && <span className="chip chip-acento">Tú</span>}
                  </td>
                  <td>{a.activo ? <span className="chip chip-verde">Activo</span> : <span className="chip">Desactivado</span>}</td>
                  <td className="derecha">
                    {a.uid !== quien.uid && (
                      <button
                        className="btn btn-chico"
                        onClick={async () => {
                          if (
                            await confirmar({
                              titulo: a.activo ? 'Desactivar administrador' : 'Activar administrador',
                              mensaje: a.activo ? a.nombre + ' ya no podrá entrar al panel.' : a.nombre + ' podrá volver a entrar.',
                              peligro: a.activo,
                            })
                          )
                            cambiarAdminActivo(quien, a.uid, a.adminId, !a.activo)
                              .then(() => toast('Listo'))
                              .catch((er) => toast(errorTexto(er), 'error'));
                        }}
                      >
                        {a.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <form className="tarjeta" onSubmit={crear}>
            <h3>Nuevo administrador</h3>
            <div className="pila">
              <label className="campo">
                <span>ID (para iniciar sesión)</span>
                <input value={id} onChange={(e) => setId(e.target.value)} required />
              </label>
              <label className="campo">
                <span>Nombre</span>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
              </label>
              <label className="campo">
                <span>Contraseña inicial</span>
                <CampoClave value={clave} onChange={setClave} required minLength={6} />
                <small>Mínimo 6 caracteres. Mantén presionado el ojo para verla. Compártela con la persona; después puede cambiarla desde aquí.</small>
              </label>
              <button className="btn btn-primario" disabled={ocupado}>
                {ocupado ? 'Creando…' : 'Crear administrador'}
              </button>
            </div>
          </form>
          <form className="tarjeta" onSubmit={cambiarClave}>
            <h3>Cambiar mi contraseña</h3>
            <div className="pila">
              <label className="campo">
                <span>Contraseña actual</span>
                <CampoClave value={actual} onChange={setActual} required autoComplete="current-password" />
              </label>
              <label className="campo">
                <span>Nueva contraseña</span>
                <CampoClave value={nueva} onChange={setNueva} required minLength={6} />
              </label>
              <button className="btn">Cambiar contraseña</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
