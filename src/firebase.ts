import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, initializeAuth, inMemoryPersistence, type Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from './firebase-config';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const configurado = firebaseConfig.apiKey.indexOf('PEGA_AQUI') !== 0;

/**
 * Auth secundaria: sirve para crear administradores sin cerrar la sesión actual.
 * Vive solo en memoria: la sesión del administrador recién creado nunca se guarda en el navegador.
 */
export function authSecundaria(): Auth {
  const ya = getApps().find((a) => a.name === 'secundaria');
  if (ya) return getAuth(ya);
  const app2: FirebaseApp = initializeApp(firebaseConfig, 'secundaria');
  return initializeAuth(app2, { persistence: inMemoryPersistence });
}

/** Los administradores entran con ID + contraseña. Internamente se usa un correo ficticio. */
export const DOMINIO_ADMIN = 'posters.example.com';

export function limpiarIdAdmin(id: string): string {
  return id.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

export function correoDeId(id: string): string {
  return limpiarIdAdmin(id) + '@' + DOMINIO_ADMIN;
}
