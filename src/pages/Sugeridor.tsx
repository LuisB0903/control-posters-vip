import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useQuien } from '../context/AuthContext';
import { Interruptor, useUI } from '../components/ui';
import { HojaColocacion, ResultadoVista } from '../components/ResultadoVista';
import { leerCronograma } from '../lib/ocr';
import { parseCronograma, semanaDeNombre, type ListasTexto } from '../lib/parseCronograma';
import { mejorCoincidencia } from '../lib/texto';
import { generarSugerencia } from '../lib/sugeridor';
import { aplicarSugerencia, guardarSemana, marcarEnCartelera } from '../lib/acciones';
import { idSemana, semanaISO } from '../lib/fechas';
import { todasLasSalas } from '../lib/ubicaciones';
import { errorTexto } from '../lib/utilidades';
import {
  LISTAS_VACIAS,
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
  const hoy = semanaISO(new Date());

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

  const enSalasProximamente = useMemo(() => {
    const ids = new Set<string>();
    salas.forEach((s) => s.peliculas.forEach((p) => ids.add(p)));
    return Array.from(ids)
      .map((x) => d.peliculaPorId.get(x))
      .filter((p): p is Pelicula => !!p && p.estado === 'proximamente');
  }, [salas, d.peliculaPorId]);

  /* ── 4. Generar ── */
  const generar = () => {
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
    resultado: resultado ? limpiarResultado(resultado) : null,
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
    if (!resultado) return;
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

  const PASOS: { id: Paso; t: string }[] = [
    { id: 'cronograma', t: 'Cronograma' },
    { id: 'listas', t: 'Revisar listas' },
    { id: 'salas', t: 'Salas y opciones' },
    { id: 'resultado', t: 'Sugerencia' },
  ];

  return (
    <div>
      <div className="cabecera">
        <div>
          <h1>Sugeridor semanal</h1>
          <p>
            Semana {semana} de {anio}{' '}
            {existente ? (
              existente.estado === 'aplicada' ? (
                <span className="chip chip-verde">Aplicada por {existente.aplicadaPor}</span>
              ) : (
                <span className="chip chip-acento">Borrador guardado</span>
              )
            ) : (
              <span className="chip">Nueva</span>
            )}
          </p>
        </div>
        <div className="acciones">
          <label className="campo" style={{ width: 90 }}>
            <span>Semana</span>
            <input type="number" min={1} max={53} value={semana} onChange={(e) => setSemana(Math.min(53, Math.max(1, parseInt(e.target.value, 10) || 1)))} />
          </label>
          <label className="campo" style={{ width: 100 }}>
            <span>Año</span>
            <input type="number" value={anio} onChange={(e) => setAnio(parseInt(e.target.value, 10) || hoy.anio)} />
          </label>
          <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={guardar} disabled={ocupado}>
            Guardar borrador
          </button>
        </div>
      </div>

      <div className="pasos">
        {PASOS.map((p, i) => (
          <button key={p.id} className={'paso' + (paso === p.id ? ' activo' : '')} onClick={() => (p.id !== 'resultado' || resultado) && setPaso(p.id)}>
            <span className="paso-n">{i + 1}</span>
            {p.t}
          </button>
        ))}
      </div>

      {/* ── PASO 1 ── */}
      {paso === 'cronograma' && (
        <div className="tarjeta">
          <h3>Sube el cronograma de punto de venta (PDF)</h3>
          <p className="muted">
            Se leerán automáticamente las listas de <b>Semana de estrenos</b>, prioridades, garantía, cajas de luz de
            lobby y pasillos, standees y banners. Tarda alrededor de un minuto. La primera vez descarga el lector de
            texto en español.
          </p>
          {progreso ? (
            <div className="pila">
              <div className="fila-entre">
                <span>{progreso.msg}</span>
                <span className="negrita">{Math.round(progreso.pct * 100)}%</span>
              </div>
              <div className="progreso">
                <div style={{ width: Math.round(progreso.pct * 100) + '%' }} />
              </div>
            </div>
          ) : (
            <div className="fila">
              <label className="btn btn-primario">
                Elegir PDF del cronograma
                <input ref={archivoRef} type="file" accept="application/pdf" className="oculto" onChange={(e) => leerPdf(e.target.files ? e.target.files[0] : undefined)} />
              </label>
              <button className="btn" onClick={() => setPaso('listas')}>
                Capturar listas a mano
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── PASO 2 ── */}
      {paso === 'listas' && (
        <div className="tarjeta">
          <div className="tarjeta-cab">
            <h3>Revisa lo que se leyó</h3>
            <div className="fila">
              {sinCoincidencia > 0 && <span className="chip chip-rojo">{sinCoincidencia} sin coincidencia en inventario</span>}
              <button className="btn btn-chico" onClick={rebuscar}>
                Volver a buscar coincidencias
              </button>
            </div>
          </div>
          <p className="muted chico" style={{ marginTop: 0 }}>
            Corrige el texto si el lector se equivocó y elige la película del inventario correcta. Las que no tengas
            registradas déjalas "sin coincidencia": se brincarán. En estrenos, desmarca las que el conjunto no va a exhibir.
          </p>
          <div className="pestanas">
            {DEF_LISTAS.map((l) => (
              <button key={l.k} className={'pestana' + (pestanaLista === l.k ? ' activa' : '')} onClick={() => setPestanaLista(l.k)}>
                {l.t} <span className="chip">{listas[l.k].length}</span>
              </button>
            ))}
          </div>
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
          <div className="fila mt">
            <button className="btn" onClick={() => setPaso('cronograma')}>
              ← Subir otro PDF
            </button>
            <button className="btn btn-primario" onClick={() => setPaso('salas')}>
              Siguiente: salas →
            </button>
          </div>
        </div>
      )}

      {/* ── PASO 3 ── */}
      {paso === 'salas' && (
        <div className="tarjeta">
          <div className="tarjeta-cab">
            <h3>¿Qué película va en cada sala esta semana?</h3>
            <button className="btn btn-chico" onClick={copiarSemanaAnterior}>
              Copiar de la semana anterior
            </button>
          </div>
          <p className="muted chico" style={{ marginTop: 0 }}>
            Si una película se repite en varias salas y no comparte sala con otra, esas salas llevan publicidad del cine
            (se puede cambiar en Configuración). Las películas en salas no se ponen en pasillos.
          </p>
          <div className="salas">
            {salas.map((s, i) => (
              <div className="sala" key={s.sala}>
                <div className="fila-entre">
                  <span className="sala-num">Sala {s.sala}</span>
                  <span className="muted chico">{d.config.pasillo13Salas.indexOf(s.sala) >= 0 ? 'Pasillo 1-3' : 'Pasillo 4-10'}</span>
                </div>
                <div className="fila" style={{ gap: 6, margin: '8px 0' }}>
                  {s.peliculas.length === 0 && <span className="muted chico">Sin película</span>}
                  {s.peliculas.map((pid) => (
                    <span key={pid} className="chip chip-acento">
                      {d.peliculaPorId.get(pid) ? d.peliculaPorId.get(pid)!.titulo : '¿?'}
                      <button
                        className="chip-x"
                        onClick={() => {
                          const n = salas.slice();
                          n[i] = { ...s, peliculas: s.peliculas.filter((x) => x !== pid) };
                          setSalas(n);
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
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
            <div className="alerta alerta-info mt">
              Estas películas están en salas pero siguen como "Próximamente": {enSalasProximamente.map((p) => p.titulo).join(', ')}.{' '}
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

          <div className="tarjeta mt" style={{ background: 'var(--superficie-2)' }}>
            <h4>Opciones</h4>
            <Interruptor
              activo={noRepetir}
              onCambio={setNoRepetir}
              etiqueta={
                <span>
                  <b>No repetir en ninguno de los 2 pasillos</b>
                  <br />
                  <span className="muted chico">
                    Cada película solo aparece en un pasillo. Si falta material, se usa publicidad del cine y, si aún así no
                    alcanza, se repite pero en el otro pasillo.
                  </span>
                </span>
              }
            />
          </div>

          <div className="fila mt">
            <button className="btn" onClick={() => setPaso('listas')}>
              ← Listas
            </button>
            <button className="btn btn-primario" onClick={generar}>
              ✦ Generar sugerencia
            </button>
          </div>
        </div>
      )}

      {/* ── PASO 4 ── */}
      {paso === 'resultado' && resultado && (
        <div>
          <div className="tarjeta mb">
            <div className="fila-entre">
              <div>
                <h3 style={{ margin: 0 }}>Sugerencia de colocación</h3>
                <span className="muted chico">
                  {resultado.movimientos.length} movimiento(s) · {resultado.avisos.length} aviso(s)
                  {noRepetir ? ' · sin repetir entre pasillos' : ''}
                </span>
              </div>
              <div className="acciones">
                <button className="btn" onClick={generar}>
                  ↻ Regenerar
                </button>
                <button className="btn" onClick={() => imprimir(<HojaColocacion r={resultado} semana={semana} anio={anio} config={d.config} />)}>
                  🖨 Imprimir hoja
                </button>
                <button className="btn btn-primario" onClick={aplicar} disabled={ocupado}>
                  ✓ Aplicar al inventario
                </button>
              </div>
            </div>
          </div>
          <ResultadoVista r={resultado} />
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
            className={'compacto lista-match'}
            value={it.peliculaId || ''}
            onChange={(e) => cambiar(i, { peliculaId: e.target.value || null })}
            style={!it.peliculaId ? { borderColor: 'var(--rojo)' } : undefined}
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
            <button className="btn btn-chico btn-fantasma" onClick={() => mover(i, -1)} title="Subir">
              ↑
            </button>
            <button className="btn btn-chico btn-fantasma" onClick={() => mover(i, 1)} title="Bajar">
              ↓
            </button>
            <button className="btn btn-chico btn-fantasma" onClick={() => onCambio(items.filter((_, j) => j !== i))} title="Quitar">
              ✕
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn-chico mt" onClick={() => onCambio(items.concat({ texto: '', peliculaId: null, activo: true }))}>
        + Agregar fila
      </button>
    </div>
  );
}
