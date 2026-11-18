import type { Timestamp } from "firebase/firestore";

/* ───────── Ubicaciones ───────── */
export type ZonaTipo =
  | "bodega"
  | "taquilla"
  | "lobby"
  | "gerencia"
  | "pasillo13"
  | "pasillo410"
  | "sala";

export interface Ubicacion {
  tipo: ZonaTipo;
  sala: number | null;
}

/* ───────── Inventario ───────── */
export type EstadoPieza = "activa" | "entregada" | "desechada";

export interface Pieza {
  n: number; // número de pieza dentro del material (1, 2, 3…)
  ubic: Ubicacion;
  estado: EstadoPieza;
  entregadaA: string | null; // ID de empleado
}

/** Para qué se usa una categoría dentro del sugeridor */
export type RolCategoria =
  | "cartelera" // póster de película (taquilla, salas, lobby, pasillos)
  | "publicidad" // publicidad del cine (relleno de carteleras)
  | "standee_grande"
  | "standee_chico"
  | "ninguno"; // se controla pero el sugeridor no lo mueve (banners, etc.)

export interface Categoria {
  id: string;
  nombre: string;
  rol: RolCategoria;
}

export type EstadoPelicula = "proximamente" | "cartelera" | "salio";

export interface Pelicula {
  id: string;
  titulo: string;
  tituloOriginal: string | null;
  tmdbId: number | null;
  fechaEstreno: string | null; // AAAA-MM-DD
  estado: EstadoPelicula;
  taquillera: boolean;
  posterUrl: string | null;
  salioEn: Timestamp | null;
}

export interface Cinepolitos {
  activo: boolean;
  desde: Timestamp;
  hasta: Timestamp; // fecha de entrega o desecho (1 mes exacto después de publicarse)
}

export interface Material {
  id: string;
  peliculaId: string | null;
  titulo: string;
  categoriaId: string;
  version: number;
  imagenUrl: string | null;
  piezas: Pieza[];
  cinepolitos: Cinepolitos | null;
  propensoRobo: boolean; // solo se coloca en zonas vigiladas (lobby y gerencia)
  notas: string;
  creadoEn: Timestamp | null;
  creadoPor: string;
}

/* ───────── Personas ───────── */
export interface Empleado {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface Admin {
  uid: string;
  adminId: string;
  nombre: string;
  activo: boolean;
}

/* ───────── Cinepolitos ───────── */
export type EstadoApartado =
  | "apartado"
  | "seleccionado"
  | "entregado"
  | "no_entregado";

export interface Apartado {
  id: string; // materialId_empleadoId
  materialId: string;
  peliculaId: string | null;
  titulo: string;
  version: number;
  empleadoId: string;
  empleadoNombre: string;
  creadoEn: Timestamp | null;
  estado: EstadoApartado;
  turno?: number; // orden de llegada para ese material (1 = el primero que lo apartó)
}

/** Fila pública de un material: cuántos lo han apartado y qué turnos ya no cuentan */
export interface FilaMaterial {
  total: number;
  ultimo: string;
  fuera: number[]; // turnos que quedaron como "No entregado"
}

/** Aviso público por empleado: lo que ya se le seleccionó y debe recoger */
export interface AvisoEmpleado {
  pendientes: { titulo: string; version: number; categoria: string }[];
}

export interface ItemEntrega {
  materialId: string;
  titulo: string;
  version: number;
  categoria: string;
  piezaN: number;
}

export interface Entrega {
  id: string;
  empleadoId: string;
  empleadoNombre: string;
  items: ItemEntrega[];
  fecha: Timestamp | null;
  adminId: string;
  adminNombre: string;
  conjunto: string;
  gerenteNombre: string;
  gerenteCargo: string;
}

/* ───────── Configuración ───────── */
export type ReglaRepetida = "publicidad_todas" | "poster_primera";

export interface ConfigGeneral {
  conjunto: string;
  gerenteNombre: string;
  gerenteCargo: string;
  tmdbKey: string;
  pasillo13Total: number;
  pasillo13Salas: number[];
  pasillo410Total: number;
  pasillo410Salas: number[];
  taquillaEspacios: number;
  lobbyEspacios: number;
  gerenciaEspacios: number;
  standeesGrandesTaquilla: number;
  standeesChicosTaquilla: number;
  standeesChicosLobby: number; // 0 = sin límite
  reglaRepetida: ReglaRepetida;
  entregaContacto: string; // quiénes entregan, se muestra a los cinepolitos
  gerenciaPasillo: "pasillo13" | "pasillo410" | "ninguno"; // pasillo donde están físicamente las carteleras de gerencia
  cambioSemanaDia: number; // 1 = lunes … 7 = domingo
  cambioSemanaHora: number; // 0 a 23
}

export const CONFIG_DEFAULT: ConfigGeneral = {
  conjunto: "C. VIP Galerías Santa Anita",
  gerenteNombre: "",
  gerenteCargo: "Gerente General",
  tmdbKey: "",
  pasillo13Total: 27,
  pasillo13Salas: [1, 2, 3],
  pasillo410Total: 43,
  pasillo410Salas: [4, 5, 6, 7, 8, 9, 10],
  taquillaEspacios: 4,
  lobbyEspacios: 2,
  gerenciaEspacios: 2,
  standeesGrandesTaquilla: 4,
  standeesChicosTaquilla: 2,
  standeesChicosLobby: 0,
  reglaRepetida: "publicidad_todas",
  entregaContacto: "Atziri, Andre o Luis",
  gerenciaPasillo: "pasillo13",
  cambioSemanaDia: 2,
  cambioSemanaHora: 20,
};

export const CATEGORIAS_DEFAULT: Categoria[] = [
  { id: "poster", nombre: "Póster", rol: "cartelera" },
  { id: "publicidad", nombre: "Publicidad del cine", rol: "publicidad" },
  { id: "standee", nombre: "Standee grande", rol: "standee_grande" },
  { id: "standee_chico", nombre: "Standee pequeño", rol: "standee_chico" },
  { id: "banner", nombre: "Banner", rol: "ninguno" },
];

/* ───────── Semanas / sugeridor ───────── */
export interface ItemLista {
  texto: string;
  peliculaId: string | null;
  activo: boolean; // en estrenos: "se exhibe en el conjunto"
}

export interface ListasSemana {
  estrenos: ItemLista[];
  prioridadesVip: ItemLista[];
  apoyo: ItemLista[];
  garantia: ItemLista[];
  lobbyPasillos: ItemLista[];
  standees: ItemLista[];
  banners: ItemLista[];
}

export const LISTAS_VACIAS: ListasSemana = {
  estrenos: [],
  prioridadesVip: [],
  apoyo: [],
  garantia: [],
  lobbyPasillos: [],
  standees: [],
  banners: [],
};

export interface SalaSemana {
  sala: number;
  peliculas: string[];
}

export type TipoAsignacion = "pelicula" | "publicidad" | "vacio";

export interface Asignacion {
  zona: Ubicacion;
  grupo: "carteleras" | "standees";
  tipo: TipoAsignacion;
  materialId: string | null;
  piezaN: number | null;
  peliculaId: string | null;
  titulo: string;
  version: number | null;
  imagenUrl: string | null;
  notas: string[];
}

export interface MovimientoSugerido {
  materialId: string;
  piezaN: number;
  titulo: string;
  version: number;
  desde: Ubicacion;
  hacia: Ubicacion;
}

export interface ResumenZona {
  zona: Ubicacion;
  usados: number;
  total: number;
}

export interface ResultadoSugerencia {
  asignaciones: Asignacion[];
  movimientos: MovimientoSugerido[];
  avisos: string[];
  resumen: ResumenZona[];
}

export interface Semana {
  id: string; // AAAA-SS
  anio: number;
  semana: number;
  listas: ListasSemana;
  salas: SalaSemana[];
  noRepetir: boolean;
  estado: "borrador" | "aplicada";
  resultado: ResultadoSugerencia | null;
  aplicadaPor: string | null;
  aplicadaEn: Timestamp | null;
  actualizadoEn: Timestamp | null;
}

export interface Movimiento {
  id: string;
  fecha: Timestamp | null;
  adminUid: string;
  adminId: string;
  adminNombre: string;
  accion: string;
  detalle: string;
}
