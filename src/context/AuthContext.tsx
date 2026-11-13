import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Admin } from '../types';
import type { Quien } from '../lib/acciones';

interface AuthValor {
  usuario: User | null;
  admin: Admin | null;
  cargando: boolean;
  quien: Quien | null;
  salir: () => Promise<void>;
}

const Ctx = createContext<AuthValor>({
  usuario: null,
  admin: null,
  cargando: true,
  quien: null,
  salir: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelarAdmin: (() => void) | null = null;
    const cancelar = onAuthStateChanged(auth, (u) => {
      if (cancelarAdmin) {
        cancelarAdmin();
        cancelarAdmin = null;
      }
      setUsuario(u);
      if (!u) {
        setAdmin(null);
        setCargando(false);
        return;
      }
      setCargando(true);
      cancelarAdmin = onSnapshot(
        doc(db, 'admins', u.uid),
        (snap) => {
          if (snap.exists()) {
            const d = snap.data();
            setAdmin({ uid: u.uid, adminId: d.adminId || '', nombre: d.nombre || '', activo: d.activo !== false });
          } else setAdmin(null);
          setCargando(false);
        },
        () => {
          setAdmin(null);
          setCargando(false);
        },
      );
    });
    return () => {
      cancelar();
      if (cancelarAdmin) cancelarAdmin();
    };
  }, []);

  const quien: Quien | null = admin && admin.activo ? { uid: admin.uid, adminId: admin.adminId, nombre: admin.nombre } : null;

  return (
    <Ctx.Provider value={{ usuario, admin, cargando, quien, salir: () => signOut(auth) }}>{children}</Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}

/** Para componentes dentro del panel: siempre hay un administrador */
export function useQuien(): Quien {
  const { quien } = useAuth();
  if (!quien) throw new Error('Sesión no válida');
  return quien;
}
