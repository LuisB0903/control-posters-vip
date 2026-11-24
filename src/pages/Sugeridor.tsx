import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useQuien } from '../context/AuthContext';
import { CabPagina, Icono, Pestanas, useUI } from '../components/ui';
import { HojaColocacion, ResultadoVista } from '../components/ResultadoVista';
import { leerCronograma } from '../lib/ocr';
import { parseCronograma, semanaDeNombre, type ListasTexto } from '../lib/parseCronograma';
import { mejorCoincidencia } from '../lib/texto';
import { generarSugerencia, recalcularResultado } from '../lib/sugeridor';
import { aplicarSugerencia, cambiarEstadoPelicula, guardarSemana, marcarEnCartelera } from '../lib/acciones';
import { fmtFecha, idSemana, semanaActual, semanasDelAnio, sumarUnMes } from '../lib/fechas';
import { todasLasSalas } from '../lib/ubicaciones';
import { errorTexto } from '../lib/utilidades';
import {
  LISTAS_VACIAS,
  type Asignacion,
  type ItemLista,
  type ListasSemana,
  type Pelicula,
  type ResultadoSugerencia,
  type SalaSemana,
} from '../types';

type Paso = 'cronograma' | 'listas' | 'salas' | 'resultado';

const DEF_LISTAS: { k: keyof ListasSemana; t: string; d: string; activo?: string }[] = [
  { k: 'estrenos', t: 'Semana de estrenos', d: 'Van a taquilla en este orden (4 espacios). Si no hay póster, se pasa a la siguiente.', activo: 'Se exhibe' },
  { k: 'prioridadesVip', t: 'Prioridades Cinépolis VIP', d: 'Primeras en lobby y pasillos.' },
  { k: 'apoyo', t: 'Apoyo especial de colocación', d: 'Prioridad después de las de VIP.' },
  { k: 'garantia', t: 'Garantía Cinépolis', d: 'Si van a taquilla, se avisa que lleven el sello.' },
  { k: 'lobbyPasillos', t: 'Cajas de luz: lobby y pasillos', d: 'Orden de preferencia para pasillos (no estricto).' },
  { k: 'standees', t: 'Standees básicos', d: 'Solo estos standees grandes van a taquilla, en orden.' },
  { k: 'banners', t: 'Banners', d: 'Solo informativo.' },
];

function itemsDesdeTexto(textos: string[], peliculas: Pelicula[]): ItemLista[] {
  return textos.map((t) => {
    const m = mejorCoincidencia(t, peliculas);
    return { texto: t, peliculaId: m ? m.item.id : null, activo: true };
  });
}

/** Quita fotos incrustadas para no exceder el tamaño máximo de documento */
function limpiarResultado(r: ResultadoSugerencia): ResultadoSugerencia {
  return {
    ...r,
    asignaciones: r.asignaciones.map((a) => ({ ...a, imagenUrl: a.imagenUrl && a.imagenUrl.indexOf('data:') === 0 ? null : a.imagenUrl })),
  };
}

export default function Sugeridor() {
  const d = useData();
  const quien = useQuien();
  const { toast, confirmar, imprimir } = useUI();
  const [params] = useSearchParams();
  const hoy = semanaActual(d.config);

  const [anio, setAnio] = useState(hoy.anio);
  const [semana, setSemana] = useState(hoy.semana);
  const [paso, setPaso] = useState<Paso>('cronograma');
  const [listas, setListas] = useState<ListasSemana>(LISTAS_VACIAS);
  const [salas, setSalas] = useState<SalaSemana[]>([]);
  const [noRepetir, setNoRepetir] = useState(false);
  const [resultado, setResultado] = useState<ResultadoSugerencia | null>(null);
  const [progreso, setProgreso] = useState<{ msg: string; pct: number } | null>(null);
  const [textoOcr, setTextoOcr] = useState('');
  const [pestanaLista, setPestanaLista] = useState<keyof ListasSemana>('estrenos');
  const [ocupado, setOcupado] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);

  const id = idSemana(anio, semana);
  const existente = d.semanas.find((s) => s.id === id) || null;
  const salasConfig = todasLasSalas(d.config);

  // Cargar semana desde la URL (?semana=2026-46)
  useEffect(() => {
    const p = params.get('semana');
    if (p && /^\d{4}-\d{2}$/.test(p)) {
      setAnio(parseInt(p.slice(0, 4), 10));
      setSemana(parseInt(p.slice(5), 10));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al cambiar de semana, cargar lo guardado (si existe)
  useEffect(() => {
    const s = d.semanas.find((x) => x.id === id);
    if (s) {
      setListas({ ...LISTAS_VACIAS, ...s.listas });
      setSalas(completarSalas(s.salas));
      setNoRepetir(s.noRepetir);
      setResultado(s.resultado);
      setPaso(s.resultado ? 'resultado' : 'listas');
    } else {
      setListas(LISTAS_VACIAS);
      setSalas(completarSalas([]));
      setResultado(null);
      setPaso('cronograma');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function completarSalas(base: SalaSemana[]): SalaSemana[] {
    return salasConfig.map((n) => base.find((s) => s.sala === n) || { sala: n, peliculas: [] });
  }

  /* ── 1. Leer cronograma ── */
  const leerPdf = async (f: File | undefined) => {
    if (!f) return;
    const sem = semanaDeNombre(f.name);
    if (sem && sem !== semana) {
      setSemana(sem);
      toast('Semana ' + sem + ' detectada en el nombre del archivo', 'info');
    }
    setProgreso({ msg: 'Iniciando…', pct: 0 });
    try {
      const texto = await leerCronograma(f, (msg, pct) => setProgreso({ msg, pct }));
      setTextoOcr(texto);
      const lt: ListasTexto = parseCronograma(texto);
      const nuevas: ListasSemana = {
        estrenos: itemsDesdeTexto(lt.estrenos, d.peliculas),
        prioridadesVip: itemsDesdeTexto(lt.prioridadesVip, d.peliculas),
        apoyo: itemsDesdeTexto(lt.apoyo, d.peliculas),
        garantia: itemsDesdeTexto(lt.garantia, d.peliculas),
        lobbyPasillos: itemsDesdeTexto(lt.lobbyPasillos, d.peliculas),
        standees: itemsDesdeTexto(lt.standees, d.peliculas),
        banners: itemsDesdeTexto(lt.banners, d.peliculas),
      };
      setListas(nuevas);
      setResultado(null);
      const total = Object.keys(nuevas).reduce((a, k) => a + nuevas[k as keyof ListasSemana].length, 0);
      toast(total ? 'Se leyeron ' + total + ' títulos. Revisa las listas.' : 'No se encontraron listas. Puedes capturarlas a mano.', total ? 'ok' : 'error');
      setPaso('listas');
    } catch (e) {
      toast('No se pudo leer el PDF: ' + errorTexto(e), 'error');
    } finally {
      setProgreso(null);
      if (archivoRef.current) archivoRef.current.value = '';
    }
  };

  const rebuscar = () => {
    const r: ListasSemana = { ...listas };
    (Object.keys(r) as (keyof ListasSemana)[]).forEach((k) => {
      r[k] = r[k].map((it) => {
        if (it.peliculaId && d.peliculaPorId.has(it.peliculaId)) return it;
        const m = mejorCoincidencia(it.texto, d.peliculas);
        return { ...it, peliculaId: m ? m.item.id : null };
      });
    });
    setListas(r);
    toast('Coincidencias actualizadas');
  };

  /* ── 3. Salas ── */
  const copiarSemanaAnterior = () => {
    const previa = d.semanas.filter((s) => s.id < id && s.salas && s.salas.some((x) => x.peliculas.length)).sort((a, b) => b.id.localeCompare(a.id))[0];
    if (!previa) return toast('No hay una semana anterior con salas registradas', 'error');
    setSalas(
      completarSalas(
        previa.salas.map((s) => ({
          sala: s.sala,
          peliculas: s.peliculas.filter((p) => {
            const pel = d.peliculaPorId.get(p);
            return pel && pel.estado !== 'salio';
          }),
        })),
      ),
    );
    toast('Se copiaron las salas de la semana ' + previa.semana + ' (sin las que ya salieron)');
  };

  // Películas "En cartelera" que ya no tienen sala esta semana → ya salieron de cartelera
  const sinFuncion = useMemo(() => {
    const ids = new Set<string>();
    salas.forEach((s) => s.peliculas.forEach((p) => ids.add(p)));
    if (!ids.size) return [] as Pelicula[];
    return d.peliculas.filter((p) => p.estado === 'cartelera' && !ids.has(p.id));
  }, [salas, d.peliculas]);

  const marcarSalieron = async () => {
    const lista = sinFuncion.slice();
    const hasta = sumarUnMes(new Date());
    const conMaterial = lista.filter((p) => d.materiales.some((m) => m.peliculaId === p.id && m.piezas.some((x) => x.estado === 'activa')));
    const ok = await confirmar({
      titulo: 'Marcar como "Salió de cartelera"',
      mensaje: (
        <>
          <p>
            Estas películas ya no tienen función esta semana: <b>{lista.map((p) => p.titulo).join(', ')}</b>.
          </p>
          <p>
            {conMaterial.length > 0 ? (
              <>
                El material de {conMaterial.length} de ellas se publicará en la página de cinepolitos para que lo aparten.
                Fecha de entrega o desecho: <b>{fmtFecha(hasta, true)}</b>.
              </>
            ) : (
              'Ninguna tiene material activo, así que no se publicará nada para los cinepolitos.'
            )}
          </p>
        </>
      ),
      aceptar: 'Marcar y publicar',
    });
    if (!ok) return;
    setOcupado(true);
    try {
      for (const p of lista) {
        await cambiarEstadoPelicula(
          quien,
          p,
          'salio',
          d.materiales.filter((m) => m.peliculaId === p.id),
        );
      }
      toast(lista.length + ' película(s) marcada(s) como "Salió de cartelera"');
    } catch (e) {
      toast(errorTexto(e), 'error');
    } finally {
      setOcupado(false);
    }
  };

  const enSalasProximamente = useMemo(() => {
    const ids = new Set<string>();
    salas.forEach((s) => s.peliculas.forEach((p) => ids.add(p)));
    return Array.from(ids)
      .map((x) => d.peliculaPorId.get(x))
      .filter((p): p is Pelicula => !!p && p.estado === 'proximamente');
  }, [salas, d.peliculaPorId]);

  /* ── 4. Generar ── */
  // Siempre se recalcula contra la ubicación actual de cada pieza: si ya se aplicó o alguien movió algo,
  // la hoja de movimientos solo muestra lo que falta. También refleja los cambios manuales.
  const resultadoVivo = useMemo(
    () => (resultado ? recalcularResultado(resultado, d.materiales, d.categorias) : null),
    [resultado, d.materiales, d.categorias],
  );
  const cambiosManuales = resultado ? resultado.asignaciones.filter((a) => a.manual).length : 0;
  const editarAsignaciones = (asignaciones: Asignacion[]) => {
    if (!resultado) return;
    setResultado({ ...resultado, asignaciones });
    toast('Cambio hecho. Recuerda aplicar al inventario cuando lo coloques.', 'info');
  };

  const generar = async () => {
    if (cambiosManuales > 0) {
      const ok = await confirmar({
        titulo: 'Regenerar sugerencia',
        mensaje: (
          <>
            Tienes <b>{cambiosManuales}</b> cambio(s) manual(es). Al regenerar se pierden y el sugeridor vuelve a acomodar todo.
          </>
        ),
        aceptar: 'Regenerar',
        peligro: true,
      });
      if (!ok) return;
    }
    const r = generarSugerencia({
      peliculas: d.peliculas,
      materiales: d.materiales,
      categorias: d.categorias,
      config: d.config,
      listas,
      salas,
      noRepetir,
    });
    setResultado(r);
    setPaso('resultado');
  };

  const datosSemana = () => ({
    id,
    anio,
    semana,
    listas,
    salas,
    noRepetir,
    estado: existente && existente.estado === 'aplicada' ? ('aplicada' as const) : ('borrador' as const),
    resultado: resultadoVivo ? limpiarResultado(resultadoVivo) : null,
    aplicadaPor: existente ? existente.aplicadaPor : null,
  });

  const guardar = async () => {
    setOcupado(true);
    try {
      await guardarSemana(quien, datosSemana(), 'borrador guardado');
      toast('Semana guardada');
    } catch (e) {
      toast(errorTexto(e), 'error');
    } finally {
      setOcupado(false);
    }
  };

  const aplicar = async () => {
    if (!resultadoVivo) return;
    const resultado = resultadoVivo;
    const ok = await confirmar({
      titulo: 'Aplicar sugerencia de la semana ' + semana,
      mensaje: (
        <>
          Se actualizará la ubicación de <b>{resultado.movimientos.length}</b> pieza(s) en el inventario y se guardará el
          registro de la semana. Hazlo cuando ya estén colocados (o al imprimir la hoja para colocarlos).
        </>
      ),
      aceptar: 'Aplicar',
    });
    if (!ok) return;
    setOcupado(true);
    try {
      await aplicarSugerencia(quien, datosSemana(), limpiarResultado(resultado), d.materiales);
      toast('Sugerencia aplicada: inventario actualizado');
    } catch (e) {
      toast(errorTexto(e), 'error');
    } finally {
      setOcupado(false);
    }
  };

  const peliculasOrdenadas = d.peliculas;
  const sinCoincidencia = (Object.keys(listas) as (keyof ListasSemana)[]).reduce(
    (a, k) => a + listas[k].filter((i) => !i.peliculaId).length,
    0,
  );

  const PASOS: { id: Paso; t: string; i: string }[] = [
    { id: 'cronograma', t: 'Cronograma', i: 'upload_file' },
    { id: 'listas', t: 'Revisar listas OCR', i: 'fact_check' },
    { id: 'salas', t: 'Salas y opciones', i: 'tune' },
    { id: 'resultado', t: 'Sugerencia y aplicar', i: 'auto_awesome' },
  ];
  const idxPaso = PASOS.findIndex((p) => p.id === paso);
  const salasDe = new Map<string, number>();
  salas.forEach((s) => s.peliculas.forEach((pid) => salasDe.set(pid, (salasDe.get(pid) || 0) + 1)));

  return (
    <div>
      <CabPagina
        titulo="Sugeridor semanal"
        desc="Colocación para taquilla, salas, lobby y pasillos a partir del cronograma de punto de venta y las reglas del conjunto."
      />

      <section className="semana-barra" aria-label="Semana que se planea">
        <div className="semana-barra-actual">
          <button
            type="button"
            className="btn-icono"
            aria-label="Semana anterior"
            disabled={semana <= 1}
            onClick={() => setSemana(Math.max(1, semana - 1))}
          >
            <Icono n="chevron_left" />
          </button>
          <div className="semana-barra-titulo">
            <span className="semana-barra-num">
              Semana {semana} <span>{anio}</span>
            </span>
            {existente ? (
              existente.estado === 'aplicada' ? (
                <span className="estado-chip estado-chip-entregado">
                  <Icono n="verified" /> Aplicada por {existente.aplicadaPor}
                </span>
              ) : (
                <span className="estado-chip estado-chip-seleccionado">
                  <Icono n="edit_note" /> Borrador guardado
                </span>
              )
            ) : (
              <span className="estado-chip estado-chip-no">
                <Icono n="add_circle" /> Semana nueva
              </span>
            )}
            {anio === hoy.anio && semana === hoy.semana && <span className="chip chip-oro">Actual</span>}
          </div>
          <button
            type="button"
            className="btn-icono"
            aria-label="Semana siguiente"
            disabled={semana >= Math.max(52, semanasDelAnio(anio))}
            onClick={() => setSemana(Math.min(Math.max(52, semanasDelAnio(anio)), semana + 1))}
          >
            <Icono n="chevron_right" />
          </button>
        </div>
        <div className="semana-barra-controles">
          <div className="fila" style={{ flexWrap: 'nowrap' }}>
            <label className="campo" style={{ flex: 1, minWidth: 150 }}>
              <span>Ir a la semana</span>
              <select className="compacto" value={semana} onChange={(e) => setSemana(parseInt(e.target.value, 10))}>
                {Array.from({ length: Math.max(52, semanasDelAnio(anio)) }, (_, i) => i + 1).map((n) => {
                  const guardada = d.semanas.find((x) => x.id === idSemana(anio, n));
                  return (
                    <option key={n} value={n}>
                      Semana {n}
                      {anio === hoy.anio && n === hoy.semana ? ' · actual' : ''}
                      {guardada ? (guardada.estado === 'aplicada' ? ' · aplicada' : ' · borrador') : ''}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="campo" style={{ width: 92 }}>
              <span>Año</span>
              <select
                className="compacto"
                value={anio}
                onChange={(e) => {
                  const a = parseInt(e.target.value, 10);
                  const max = Math.max(52, semanasDelAnio(a));
                  setAnio(a);
                  if (semana > max) setSemana(max);
                }}
              >
                {[hoy.anio - 1, hoy.anio, hoy.anio + 1].map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="btn" onClick={guardar} disabled={ocupado}>
            <Icono n="save" /> Guardar borrador
          </button>
        </div>
      </section>

      <ol className="pasos" aria-label="Pasos del sugeridor">
        {PASOS.map((p, i) => {
          const estado = i < idxPaso ? 'listo' : i === idxPaso ? 'activo' : '';
          return (
            <li key={p.id}>
              <button
                type="button"
                className={'paso ' + estado}
                aria-current={estado === 'activo' ? 'step' : undefined}
                disabled={p.id === 'resultado' && !resultado}
                onClick={() => (p.id !== 'resultado' || resultado) && setPaso(p.id)}
              >
                <span className="paso-n">{estado === 'listo' ? <Icono n="check" /> : i + 1}</span>
                <span className="paso-texto">
                  <span className="paso-nombre">{p.t}</span>
                  <span className="paso-estado">{estado === 'listo' ? 'Listo' : estado === 'activo' ? 'En curso' : 'Pendiente'}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* ── PASO 1 ── */}
      {paso === 'cronograma' && (
        <div className="panel">
          <div className="panel-titulo">
            <span className="icono-caja rojo">
              <Icono n="upload_file" />
            </span>
            <div>
              <h3>Sube el cronograma de punto de venta (PDF)</h3>
              <p>
                Se leerán automáticamente las listas de <b>Semana de estrenos</b>, prioridades, garantía, cajas de luz de
                lobby y pasillos, standees y banners. Tarda alrededor de un minuto; la primera vez descarga el lector de texto
                en español.
              </p>
            </div>
          </div>
          <div className="mt">
            {progreso ? (
              <div className="pila">
                <div className="fila-entre">
                  <span className="fila" style={{ gap: 8 }}>
                    <span className="spinner" /> {progreso.msg}
                  </span>
                  <span className="negrita">{Math.round(progreso.pct * 100)}%</span>
                </div>
                <div className="progreso">
                  <div style={{ width: Math.round(progreso.pct * 100) + '%' }} />
                </div>
              </div>
            ) : (
              <div className="fila">
                <label className="btn btn-primario">
                  <Icono n="picture_as_pdf" /> Elegir PDF del cronograma
                  <input ref={archivoRef} type="file" accept="application/pdf" className="oculto" onChange={(e) => leerPdf(e.target.files ? e.target.files[0] : undefined)} />
                </label>
                <button className="btn btn-vip" onClick={() => setPaso('listas')}>
                  <Icono n="edit_note" /> Capturar listas a mano
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PASO 2 ── */}
      {paso === 'listas' && (
        <div className="panel">
          <div className="panel-cab">
            <div className="panel-titulo">
              <span className="icono-caja oro">
                <Icono n="fact_check" />
              </span>
              <div>
                <h3>Revisa lo que se leyó</h3>
                <p>
                  Corrige el texto si el lector se equivocó y elige la película correcta. Las que no tengas registradas déjalas
                  "sin coincidencia": se brincarán. En estrenos, desmarca las que el conjunto no va a exhibir.
                </p>
              </div>
            </div>
            <div className="fila">
              {sinCoincidencia > 0 && <span className="chip chip-rojo">{sinCoincidencia} sin coincidencia</span>}
              <button className="btn btn-chico" onClick={rebuscar}>
                <Icono n="sync" /> Volver a buscar coincidencias
              </button>
            </div>
          </div>
          <Pestanas<keyof ListasSemana>
            valor={pestanaLista}
            onCambio={setPestanaLista}
            opciones={DEF_LISTAS.map((l) => ({
              id: l.k,
              etiqueta: (
                <>
                  {l.t}
                  {listas[l.k].some((it) => !it.peliculaId) && <span className="pestana-alerta" title="Tiene títulos sin coincidencia" />}
                </>
              ),
              cuenta: listas[l.k].length,
            }))}
          />
          {DEF_LISTAS.filter((l) => l.k === pestanaLista).map((l) => (
            <EditorLista
              key={l.k}
              descripcion={l.d}
              etiquetaActivo={l.activo}
              items={listas[l.k]}
              peliculas={peliculasOrdenadas}
              onCambio={(items) => setListas({ ...listas, [l.k]: items })}
            />
          ))}
          {textoOcr && (
            <details className="mt">
              <summary className="muted chico">Ver texto leído del PDF</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 300, overflow: 'auto' }}>{textoOcr}</pre>
            </details>
          )}
          <div className="fila-entre mt">
            <button className="btn btn-fantasma" onClick={() => setPaso('cronograma')}>
              <Icono n="arrow_back" /> Subir otro PDF
            </button>
            <button className="btn btn-primario" onClick={() => setPaso('salas')}>
              Siguiente: salas <Icono n="arrow_forward" />
            </button>
          </div>
        </div>
      )}

      {/* ── PASO 3 ── */}
      {paso === 'salas' && (
        <div className="panel">
          <div className="panel-cab">
            <div className="panel-titulo">
              <span className="icono-caja oro">
                <Icono n="chair" />
              </span>
              <div>
                <h3>
                  Configuración de salas (1 a {salas.length})
                </h3>
                <p>
                  Sala con una sola película → su póster (aunque esté en varias salas del mismo pasillo, si alcanzan las
                  piezas). Sala compartida → el póster de la otra película. Sin póster → publicidad del cine. Las películas
                  en salas no van en pasillos.
                </p>
              </div>
            </div>
            <div className="pila" style={{ minWidth: 0 }}>
              <label className="check chico negrita">
                <input type="checkbox" checked={noRepetir} onChange={(e) => setNoRepetir(e.target.checked)} />
                No repetir en ninguno de los 2 pasillos
              </label>
              <button className="btn btn-chico btn-vip" onClick={copiarSemanaAnterior}>
                <Icono n="content_copy" /> Copiar de la semana anterior
              </button>
            </div>
          </div>
          <div className="salas">
            {salas.map((s, i) => (
              <div className="sala" key={s.sala}>
                <div className="fila-entre" style={{ flexWrap: 'nowrap' }}>
                  <span className="sala-num">Sala {s.sala}</span>
                  <span className="sala-pasillo">{d.config.pasillo13Salas.indexOf(s.sala) >= 0 ? 'Pasillo 1-3' : 'Pasillo 4-10'}</span>
                </div>
                {s.peliculas.length === 0 && <span className="muted chico">Sin película · publicidad</span>}
                {s.peliculas.map((pid) => {
                  const repetida = (salasDe.get(pid) || 0) > 1;
                  return (
                    <div key={pid} className="sala-peli">
                      <span title={d.peliculaPorId.get(pid) ? d.peliculaPorId.get(pid)!.titulo : ''}>
                        {d.peliculaPorId.get(pid) ? d.peliculaPorId.get(pid)!.titulo : '¿?'}
                      </span>
                      <span className="fila" style={{ gap: 2, flexWrap: 'nowrap' }}>
                        <span className={'chip ' + (s.peliculas.length > 1 ? 'chip-verde' : repetida ? 'chip-oro' : '')}>
                          {s.peliculas.length > 1 ? 'Compartida' : repetida ? 'Repetida' : 'Sola'}
                        </span>
                        <button
                          className="chip-x"
                          title="Quitar"
                          onClick={() => {
                            const n = salas.slice();
                            n[i] = { ...s, peliculas: s.peliculas.filter((x) => x !== pid) };
                            setSalas(n);
                          }}
                        >
                          <Icono n="close" className="ico-14" />
                        </button>
                      </span>
                    </div>
                  );
                })}
                <select
                  className="compacto"
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const n = salas.slice();
                    n[i] = { ...s, peliculas: s.peliculas.concat(e.target.value) };
                    setSalas(n);
                  }}
                >
                  <option value="">+ Agregar película…</option>
                  {d.peliculas
                    .filter((p) => p.estado !== 'salio' && s.peliculas.indexOf(p.id) < 0)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.titulo}
                        {p.estado === 'proximamente' ? ' (próximamente)' : ''}
                      </option>
                    ))}
                </select>
              </div>
            ))}
          </div>

          {enSalasProximamente.length > 0 && (
            <div className="alerta alerta-info mt fila-entre">
              <span>
                Estas películas están en salas pero siguen como "Próximamente": <b>{enSalasProximamente.map((p) => p.titulo).join(', ')}</b>.
              </span>
              <button
                className="btn btn-chico"
                onClick={() =>
                  marcarEnCartelera(quien, enSalasProximamente)
                    .then(() => toast('Marcadas como En cartelera'))
                    .catch((e) => toast(errorTexto(e), 'error'))
                }
              >
                Marcarlas "En cartelera"
              </button>
            </div>
          )}

          {sinFuncion.length > 0 && (
            <div className="alerta alerta-aviso mt fila-entre">
              <span>
                Estas películas siguen "En cartelera" pero ya no tienen función esta semana: <b>{sinFuncion.map((p) => p.titulo).join(', ')}</b>.
                Al marcarlas como salidas, su material se publica para los cinepolitos.
              </span>
              <button className="btn btn-chico btn-vip" onClick={marcarSalieron} disabled={ocupado}>
                <Icono n="logout" /> Marcarlas "Salió de cartelera"
              </button>
            </div>
          )}

          <div className="alerta mt" style={{ marginBottom: 0 }}>
            <b>{noRepetir ? 'Sin repetir entre pasillos:' : 'Repetición permitida entre pasillos:'}</b>{' '}
            {noRepetir
              ? 'cada película aparece en un solo pasillo. Si falta material, se usa publicidad del cine y, si aún así no alcanza, se repite pero en el otro pasillo.'
              : 'una película puede estar en ambos pasillos, pero nunca dos veces en el mismo.'}
          </div>

          <div className="fila-entre mt">
            <button className="btn btn-fantasma" onClick={() => setPaso('listas')}>
              <Icono n="arrow_back" /> Listas
            </button>
            <button className="btn btn-primario" onClick={generar}>
              <Icono n="auto_awesome" /> Generar sugerencia
            </button>
          </div>
        </div>
      )}

      {/* ── PASO 4 ── */}
      {paso === 'resultado' && resultadoVivo && (
        <div>
          <ResultadoVista r={resultadoVivo} onEditar={editarAsignaciones} />
          <div className="barra-acciones">
            <dl className="cifras cifras-compactas cifras-en-linea">
              <div>
                <dt>Movimientos</dt>
                <dd>{resultadoVivo.movimientos.length}</dd>
              </div>
              <div className={resultadoVivo.avisos.length ? 'cifra-alerta' : 'cifra-ok'}>
                <dt>Avisos</dt>
                <dd>{resultadoVivo.avisos.length}</dd>
              </div>
              {cambiosManuales > 0 && (
                <div>
                  <dt>Cambios manuales</dt>
                  <dd>{cambiosManuales}</dd>
                </div>
              )}
            </dl>
            <div className="acciones">
              <button className="btn" onClick={generar}>
                <Icono n="refresh" /> Regenerar
              </button>
              <button className="btn btn-vip" onClick={() => imprimir(<HojaColocacion r={resultadoVivo} semana={semana} anio={anio} config={d.config} />)}>
                <Icono n="print" /> Imprimir hoja
              </button>
              <button className="btn btn-primario" onClick={aplicar} disabled={ocupado}>
                <Icono n="task_alt" /> Aplicar al inventario
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── Editor de una lista ───────── */
function EditorLista({
  items,
  peliculas,
  onCambio,
  descripcion,
  etiquetaActivo,
}: {
  items: ItemLista[];
  peliculas: Pelicula[];
  onCambio: (items: ItemLista[]) => void;
  descripcion: string;
  etiquetaActivo?: string;
}) {
  const cambiar = (i: number, cambios: Partial<ItemLista>) => {
    const n = items.slice();
    n[i] = { ...n[i], ...cambios };
    onCambio(n);
  };
  const mover = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const n = items.slice();
    const t = n[i];
    n[i] = n[j];
    n[j] = t;
    onCambio(n);
  };
  return (
    <div>
      <p className="muted chico">{descripcion}</p>
      {items.length === 0 && <p className="muted">Lista vacía.</p>}
      {items.map((it, i) => (
        <div className="lista-fila" key={i}>
          <span className="lista-num">{i + 1}</span>
          <input
            className="compacto"
            value={it.texto}
            onChange={(e) => cambiar(i, { texto: e.target.value })}
            onBlur={() => {
              if (!it.peliculaId) {
                const m = mejorCoincidencia(it.texto, peliculas);
                if (m) cambiar(i, { peliculaId: m.item.id });
              }
            }}
          />
          <select
            className={'compacto lista-match' + (it.peliculaId ? '' : ' sin-coincidencia')}
            value={it.peliculaId || ''}
            aria-label={'Película para "' + (it.texto || 'fila ' + (i + 1)) + '"'}
            aria-invalid={!it.peliculaId}
            onChange={(e) => cambiar(i, { peliculaId: e.target.value || null })}
          >
            <option value="">— Sin coincidencia (se brinca) —</option>
            {peliculas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.titulo}
              </option>
            ))}
          </select>
          {etiquetaActivo ? (
            <label className="check chico" title={etiquetaActivo}>
              <input type="checkbox" checked={it.activo} onChange={(e) => cambiar(i, { activo: e.target.checked })} />
              <span className="oculto-movil">{etiquetaActivo}</span>
            </label>
          ) : (
            <span />
          )}
          <div className="fila" style={{ gap: 2, flexWrap: 'nowrap' }}>
            <button className="btn-icono chico" onClick={() => mover(i, -1)} title="Subir" aria-label="Subir">
              <Icono n="arrow_upward" />
            </button>
            <button className="btn-icono chico" onClick={() => mover(i, 1)} title="Bajar" aria-label="Bajar">
              <Icono n="arrow_downward" />
            </button>
            <button className="btn-icono chico" onClick={() => onCambio(items.filter((_, j) => j !== i))} title="Quitar" aria-label="Quitar">
              <Icono n="close" />
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn-chico btn-vip mt" onClick={() => onCambio(items.concat({ texto: '', peliculaId: null, activo: true }))}>
        <Icono n="add" /> Agregar fila
      </button>
    </div>
  );
}
