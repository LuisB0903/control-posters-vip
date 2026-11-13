/**
 * The Movie Database (TMDB): búsqueda automática de pósters.
 * Acepta la "Clave de API" (v3, 32 caracteres) o el "Token de acceso de lectura" (v4, largo).
 */
const BASE = 'https://api.themoviedb.org/3';
export const IMG = (ruta: string, tam = 'w500') => 'https://image.tmdb.org/t/p/' + tam + ruta;

export interface TmdbPelicula {
  id: number;
  titulo: string;
  tituloOriginal: string;
  fecha: string | null;
  poster: string | null;
}

async function pedir<T>(ruta: string, clave: string, params: Record<string, string>): Promise<T> {
  const url = new URL(BASE + ruta);
  Object.keys(params).forEach((k) => url.searchParams.set(k, params[k]));
  const headers: Record<string, string> = { accept: 'application/json' };
  if (clave.length > 40) headers.Authorization = 'Bearer ' + clave;
  else url.searchParams.set('api_key', clave);
  const r = await fetch(url.toString(), { headers });
  if (r.status === 401) throw new Error('La clave de TMDB no es válida. Revísala en Configuración.');
  if (!r.ok) throw new Error('TMDB respondió con error ' + r.status);
  return r.json() as Promise<T>;
}

export async function buscarPeliculas(texto: string, clave: string): Promise<TmdbPelicula[]> {
  type Res = {
    results: { id: number; title: string; original_title: string; release_date?: string; poster_path: string | null }[];
  };
  const r = await pedir<Res>('/search/movie', clave, {
    query: texto,
    language: 'es-MX',
    region: 'MX',
    include_adult: 'false',
  });
  return r.results.slice(0, 20).map((x) => ({
    id: x.id,
    titulo: x.title,
    tituloOriginal: x.original_title,
    fecha: x.release_date || null,
    poster: x.poster_path,
  }));
}

/** Todas las versiones de póster disponibles (español primero) */
export async function postersDePelicula(id: number, clave: string): Promise<string[]> {
  type Res = { posters: { file_path: string; iso_639_1: string | null; vote_average: number }[] };
  const r = await pedir<Res>('/movie/' + id + '/images', clave, { include_image_language: 'es,null,en' });
  const peso = (l: string | null) => (l === 'es' ? 0 : l === null ? 1 : 2);
  return r.posters
    .slice()
    .sort((a, b) => peso(a.iso_639_1) - peso(b.iso_639_1) || b.vote_average - a.vote_average)
    .map((p) => p.file_path);
}

export async function probarClave(clave: string): Promise<boolean> {
  await pedir('/configuration', clave, {});
  return true;
}

export function urlGoogleImagenes(titulo: string): string {
  return 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(titulo + ' póster oficial México');
}
