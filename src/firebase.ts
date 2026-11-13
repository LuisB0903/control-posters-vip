import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from './firebase-config';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const configurado = firebaseConfig.apiKey.indexOf('PEGA_AQUI') !== 0;

/** App secundaria: sirve para crear administradores sin cerrar la sesión actual */
export function appSecundaria(): FirebaseApp {
  const ya = getApps().find((a) => a.name === 'secundaria');
  return ya || initializeApp(firebaseConfig, 'secundaria');
}

/** Los administradores entran con ID + contraseña. Internamente se usa un correo ficticio. */
export const DOMINIO_ADMIN = 'posters.example.com';

export function limpiarIdAdmin(id: string): string {
  return id.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

export function correoDeId(id: string): string {
  return limpiarIdAdmin(id) + '@' + DOMINIO_ADMIN;
}
