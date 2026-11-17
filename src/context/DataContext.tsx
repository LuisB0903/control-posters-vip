import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  CATEGORIAS_DEFAULT,
  CONFIG_DEFAULT,
  LISTAS_VACIAS,
  type Admin,
  type Apartado,
  type Categoria,
  type ConfigGeneral,
  type Empleado,
  type Entrega,
  type Material,
  type Pelicula,
  type Semana,
} from "../types";
import { BODEGA } from "../lib/ubicaciones";
import { ordenFecha } from "../lib/fila";

interface DataValor {
  listo: boolean;
  error: string | null;
  peliculas: Pelicula[];
  materiales: Material[];
  empleados: Empleado[];
  apartados: Apartado[];
  entregas: Entrega[];
  semanas: Semana[];
  admins: Admin[];
  config: ConfigGeneral;
  categorias: Categoria[];
  peliculaPorId: Map<string, Pelicula>;
  materialPorId: Map<string, Material>;
  categoriaPorId: Map<string, Categoria>;
}

const Ctx = createContext<DataValor | null>(null);

/* ── convertidores tolerantes (por si algún campo falta) ── */
const aPelicula = (id: string, d: DocumentData): Pelicula => ({
  id,
  titulo: d.titulo || "(sin título)",
  tituloOriginal: d.tituloOriginal || null,
  tmdbId: typeof d.tmdbId === "number" ? d.tmdbId : null,
  fechaEstreno: d.fechaEstreno || null,
  estado: d.estado || "proximamente",
  taquillera: !!d.taquillera,
  posterUrl: d.posterUrl || null,
  salioEn: d.salioEn || null,
});

const aMaterial = (id: string, d: DocumentData): Material => ({
  id,
  peliculaId: d.peliculaId || null,
  titulo: d.titulo || "(sin título)",
  categoriaId: d.categoriaId || "poster",
  version: Number(d.version) || 1,
  imagenUrl: d.imagenUrl || null,
  piezas: Array.isArray(d.piezas)
    ? d.piezas.map((p: DocumentData) => ({
        n: Number(p.n) || 0,
        ubic:
          p.ubic && p.ubic.tipo
            ? { tipo: p.ubic.tipo, sala: p.ubic.sala ?? null }
            : BODEGA,
        estado: p.estado || "activa",
        entregadaA: p.entregadaA || null,
      }))
    : [],
  cinepolitos: d.cinepolitos || null,
  notas: d.notas || "",
  creadoEn: d.creadoEn || null,
  creadoPor: d.creadoPor || "",
});

const aSemana = (id: string, d: DocumentData): Semana => ({
  id,
  anio: d.anio,
  semana: d.semana,
  listas: { ...LISTAS_VACIAS, ...(d.listas || {}) },
  salas: d.salas || [],
  noRepetir: !!d.noRepetir,
  estado: d.estado || "borrador",
  resultado: d.resultado || null,
  aplicadaPor: d.aplicadaPor || null,
  aplicadaEn: d.aplicadaEn || null,
  actualizadoEn: d.actualizadoEn || null,
});

export function DataProvider({ children }: { children: ReactNode }) {
  const [peliculas, setPeliculas] = useState<Pelicula[]>([]);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [apartados, setApartados] = useState<Apartado[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [semanas, setSemanas] = useState<Semana[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [config, setConfig] = useState<ConfigGeneral>(CONFIG_DEFAULT);
  const [categorias, setCategorias] = useState<Categoria[]>(CATEGORIAS_DEFAULT);
  const [cargados, setCargados] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const marcar = (k: string) =>
      setCargados((c) => (c[k] ? c : { ...c, [k]: true }));
    const fallo = (e: Error) => setError(e.message);
    const subs = [
      onSnapshot(
        collection(db, "peliculas"),
        (s) => {
          setPeliculas(
            s.docs
              .map((d) => aPelicula(d.id, d.data()))
              .sort((a, b) => a.titulo.localeCompare(b.titulo)),
          );
          marcar("peliculas");
        },
        fallo,
      ),
      onSnapshot(
        collection(db, "materiales"),
        (s) => {
          setMateriales(s.docs.map((d) => aMaterial(d.id, d.data())));
          marcar("materiales");
        },
        fallo,
      ),
      onSnapshot(
        collection(db, "empleados"),
        (s) => {
          setEmpleados(
            s.docs
              .map((d) => ({
                id: d.id,
                nombre: d.data().nombre || "",
                activo: d.data().activo !== false,
              }))
              .sort((a, b) => a.nombre.localeCompare(b.nombre)),
          );
          marcar("empleados");
        },
        fallo,
      ),
      onSnapshot(
        collection(db, "apartados"),
        (s) => {
          setApartados(
            s.docs
              .map((d) => ({ id: d.id, ...(d.data() as Omit<Apartado, "id">) }))
              // primero los que apartaron antes
              .sort(ordenFecha),
          );
          marcar("apartados");
        },
        fallo,
      ),
      onSnapshot(
        query(collection(db, "entregas"), orderBy("fecha", "desc")),
        (s) => {
          setEntregas(
            s.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<Entrega, "id">),
            })),
          );
          marcar("entregas");
        },
        fallo,
      ),
      onSnapshot(
        collection(db, "semanas"),
        (s) => {
          setSemanas(
            s.docs
              .map((d) => aSemana(d.id, d.data()))
              .sort((a, b) => b.id.localeCompare(a.id)),
          );
          marcar("semanas");
        },
        fallo,
      ),
      onSnapshot(
        collection(db, "admins"),
        (s) => {
          setAdmins(
            s.docs.map((d) => ({
              uid: d.id,
              adminId: d.data().adminId,
              nombre: d.data().nombre,
              activo: d.data().activo !== false,
            })),
          );
          marcar("admins");
        },
        fallo,
      ),
      onSnapshot(
        doc(db, "config", "general"),
        (s) => {
          setConfig({
            ...CONFIG_DEFAULT,
            ...(s.exists() ? (s.data() as Partial<ConfigGeneral>) : {}),
          });
          marcar("config");
        },
        fallo,
      ),
      onSnapshot(
        doc(db, "config", "categorias"),
        (s) => {
          const lista = s.exists() ? (s.data().lista as Categoria[]) : null;
          setCategorias(lista && lista.length ? lista : CATEGORIAS_DEFAULT);
          marcar("categorias");
        },
        fallo,
      ),
    ];
    return () => subs.forEach((u) => u());
  }, []);

  const valor = useMemo<DataValor>(() => {
    const listo = [
      "peliculas",
      "materiales",
      "config",
      "categorias",
      "semanas",
      "apartados",
      "empleados",
      "admins",
      "entregas",
    ].every((k) => cargados[k]);
    return {
      listo,
      error,
      peliculas,
      materiales,
      empleados,
      apartados,
      entregas,
      semanas,
      admins,
      config,
      categorias,
      peliculaPorId: new Map(
        peliculas.map((p) => [p.id, p] as [string, Pelicula]),
      ),
      materialPorId: new Map(
        materiales.map((m) => [m.id, m] as [string, Material]),
      ),
      categoriaPorId: new Map(
        categorias.map((c) => [c.id, c] as [string, Categoria]),
      ),
    };
  }, [
    cargados,
    error,
    peliculas,
    materiales,
    empleados,
    apartados,
    entregas,
    semanas,
    admins,
    config,
    categorias,
  ]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useData(): DataValor {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData fuera de DataProvider");
  return v;
}
