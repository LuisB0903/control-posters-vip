import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { BotonTema, Cargando, Icono, Modal, Poster, useUI, Vacio } from '../components/ui';
import { aDate, fmtFecha } from '../lib/fechas';
import { contiene } from '../lib/texto';
import { errorTexto } from '../lib/utilidades';
import { CATEGORIAS_DEFAULT, CONFIG_DEFAULT, type AvisoEmpleado, type Categoria, type EstadoApartado, type FilaMaterial } from '../types';
import { lugarEnFila, posicionPublica, stockDe, type Lugar } from '../lib/fila';

interface PosterPublico {
  id: string;
  categoriaId: string;
  peliculaId: string | null;
  titulo: string;
  version: number;
  arte: string;
  imagenUrl: string | null;
  hasta: Date;
  piezas: number;
  stock: number; // piezas activas + entregadas (cuentan para la fila)
}

interface MiApartado {
  estado: EstadoApartado;
  turno: number | null;
}

/** Página pública: los cinepolitos apartan pósters de películas que ya salieron de cartelera */
export default function Cinepolitos() {
  const { toast } = useUI();
  const [posters, setPosters] = useState<PosterPublico[] | null>(null);
  const [idTexto, setIdTexto] = useState('');
  const [empleado, setEmpleado] = useState<{ id: string; nombre: string } | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [errorId, setErrorId] = useState('');
  const [yaApartados, setYaApartados] = useState<Map<string, MiApartado>>(new Map());
  const [filas, setFilas] = useState<Map<string, FilaMaterial>>(new Map());
  const [resultados, setResultados] = useState<{ texto: string; lugar: Lugar }[] | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>(CATEGORIAS_DEFAULT);
  const [contacto, setContacto] = useState(CONFIG_DEFAULT.entregaContacto);
  const [conjunto, setConjunto] = useState(CONFIG_DEFAULT.conjunto);
  const [filtroCat, setFiltroCat] = useState('todas');
  const [aviso, setAviso] = useState<AvisoEmpleado | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState('');
  const [listo, setListo] = useState<string[] | null>(null);

  // categorías (Póster, Standee…) y quién entrega
  useEffect(() => {
    getDoc(doc(db, 'config', 'categorias'))
      .then((s) => {
        const l = s.exists() ? (s.data().lista as Categoria[]) : null;
        if (l && l.length) setCategorias(l);
      })
      .catch(() => {});
    getDoc(doc(db, 'config', 'publico'))
      .then((s) => {
        if (s.exists() && s.data().entregaContacto) setContacto(s.data().entregaContacto);
        if (s.exists() && s.data().conjunto) setConjunto(s.data().conjunto);
      })
      .catch(() => {});
  }, []);

  const nombreCat = (categoriaId: string) => {
    const c = categorias.find((x) => x.id === categoriaId);
    return c ? c.nombre : 'Material';
  };
  const vtxt = (p: PosterPublico) => 'v' + p.version + (p.arte ? ' · ' + p.arte : '');
  const etiqueta = (p: PosterPublico) => nombreCat(p.categoriaId) + ' · ' + p.titulo + ' ' + vtxt(p);

  useEffect(() => {
    const u = onSnapshot(
      query(collection(db, 'materiales'), where('cinepolitos.activo', '==', true)),
      (s) => {
        const ahora = Date.now();
        const lista: PosterPublico[] = [];
        s.docs.forEach((x) => {
          const m = x.data();
          const hasta = aDate(m.cinepolitos && m.cinepolitos.hasta);
          const quedan = Array.isArray(m.piezas) && m.piezas.some((p: { estado: string }) => p.estado === 'activa');
          if (hasta && hasta.getTime() > ahora && quedan)
            lista.push({
              id: x.id,
              categoriaId: m.categoriaId || 'poster',
              peliculaId: m.peliculaId || null,
              titulo: m.titulo,
              version: m.version,
              arte: typeof m.arte === 'string' ? m.arte.trim() : '',
              imagenUrl: m.imagenUrl || null,
              hasta,
              piezas: m.piezas.filter((p: { estado: string }) => p.estado === 'activa').length,
              stock: stockDe(m.piezas),
            });
        });
        lista.sort((a, b) => a.hasta.getTime() - b.hasta.getTime() || a.titulo.localeCompare(b.titulo));
        setPosters(lista);
      },
      (e) => {
        toast(errorTexto(e), 'error');
        setPosters([]);
      },
    );
    return u;
  }, [toast]);

  // fila pública de cada material (para saber si aún hay pieza o se queda en fila)
  const cargarFilas = (lista: PosterPublico[]) =>
    Promise.all(
      lista.map((p) =>
        getDoc(doc(db, 'filas', p.id))
          .then((f) => (f.exists() ? ([p.id, f.data() as FilaMaterial] as [string, FilaMaterial]) : null))
          .catch(() => null),
      ),
    ).then((r) => setFilas(new Map(r.filter((x): x is [string, FilaMaterial] => !!x))));
  useEffect(() => {
    if (posters) cargarFilas(posters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posters]);

  // revisar cuáles ya apartó este empleado
  useEffect(() => {
    if (!empleado || !posters) return;
    let vivo = true;
    Promise.all(
      posters.map((p) =>
        getDoc(doc(db, 'apartados', p.id + '_' + empleado.id))
          .then((s) =>
            s.exists()
              ? ([
                  p.id,
                  {
                    estado: (s.data().estado || 'apartado') as EstadoApartado,
                    turno: typeof s.data().turno === 'number' ? (s.data().turno as number) : null,
                  },
                ] as [string, MiApartado])
              : null,
          )
          .catch(() => null),
      ),
    ).then((r) => {
      if (vivo) setYaApartados(new Map(r.filter((x): x is [string, MiApartado] => !!x)));
    });
    return () => {
      vivo = false;
    };
  }, [empleado, posters]);

  const identificar = async (e: FormEvent) => {
    e.preventDefault();
    const id = idTexto.trim();
    setErrorId('');
    if (!/^\d{3,10}$/.test(id)) return setErrorId('Escribe tu ID de empleado (solo números).');
    setVerificando(true);
    try {
      const s = await getDoc(doc(db, 'empleados', id));
      if (!s.exists() || s.data().activo === false) setErrorId('No encontramos ese ID. Pregunta a tu supervisor.');
      else {
        setEmpleado({ id, nombre: s.data().nombre });
        getDoc(doc(db, 'avisos', id))
          .then((a) => setAviso(a.exists() ? ({ pendientes: a.data().pendientes || [] } as AvisoEmpleado) : null))
          .catch(() => setAviso(null));
      }
    } catch (er) {
      setErrorId(errorTexto(er));
    } finally {
      setVerificando(false);
    }
  };

  const alternar = (p: PosterPublico) => {
    if (yaApartados.has(p.id)) return;
    if (!empleado) {
      toast('Primero escribe tu ID de empleado', 'info');
      return;
    }
    const n = new Set(sel);
    if (n.has(p.id)) n.delete(p.id);
    else n.add(p.id);
    setSel(n);
  };

  const elegidos = (posters || []).filter((p) => sel.has(p.id));

  /** Lugar que tendría (o tiene) en la fila de un material */
  const lugarDe = (p: PosterPublico): Lugar | null => {
    const mio = yaApartados.get(p.id);
    const f = filas.get(p.id);
    if (mio && mio.turno !== null) return lugarEnFila(posicionPublica(mio.turno, f ? f.fuera || [] : []), p.stock);
    return null;
  };
  const lugarProyectado = (p: PosterPublico): Lugar => {
    const f = filas.get(p.id);
    const cuentan = f ? f.total - (f.fuera || []).length : 0;
    return lugarEnFila(cuentan + 1, p.stock);
  };

  const apartar = async () => {
    if (!empleado) return;
    setEnviando(true);
    const ok: { texto: string; lugar: Lugar }[] = [];
    const nuevos = new Map(yaApartados);
    const fallidos: string[] = [];
    // uno por uno: cada apartado toma el siguiente turno de la fila de ese material
    for (const p of elegidos) {
      const apId = p.id + '_' + empleado.id;
      try {
        const r = await runTransaction(db, async (tx) => {
          const filaRef = doc(db, 'filas', p.id);
          const f = await tx.get(filaRef);
          const previa = f.exists() ? (f.data() as FilaMaterial) : null;
          const turno = (previa ? previa.total : 0) + 1;
          const fuera = previa && Array.isArray(previa.fuera) ? previa.fuera : [];
          tx.set(doc(db, 'apartados', apId), {
            materialId: p.id,
            peliculaId: p.peliculaId,
            titulo: p.titulo,
            version: p.version,
            empleadoId: empleado.id,
            empleadoNombre: empleado.nombre,
            creadoEn: serverTimestamp(),
            estado: 'apartado',
            turno,
          });
          tx.set(filaRef, { total: turno, ultimo: apId, fuera });
          return { turno, fuera };
        });
        ok.push({ texto: etiqueta(p), lugar: lugarEnFila(posicionPublica(r.turno, r.fuera), p.stock) });
        nuevos.set(p.id, { estado: 'apartado', turno: r.turno });
      } catch (e) {
        fallidos.push(etiqueta(p));
      }
    }
    setEnviando(false);
    setConfirmando(false);
    setSel(new Set());
    setYaApartados(nuevos);
    if (posters) cargarFilas(posters);
    if (fallidos.length) toast('No se pudo apartar: ' + fallidos.join(', ') + ' (ya lo habías apartado o ya cerró)', 'error');
    if (ok.length) {
      setResultados(ok);
      setListo(ok.map((x) => x.texto));
    }
  };

  const visibles = useMemo(
    () => (posters || []).filter((p) => contiene(p.titulo, busca) && (filtroCat === 'todas' || p.categoriaId === filtroCat)),
    [posters, busca, filtroCat],
  );
  const categoriasPresentes = categorias
    .map((c) => ({ c, n: (posters || []).filter((p) => p.categoriaId === c.id).length }))
    .filter((x) => x.n > 0);
  const diasPara = (f: Date) => Math.max(0, Math.ceil((f.getTime() - Date.now()) / 86400000));
  const iniciales = (n: string) =>
    n
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x[0])
      .join('');

  return (
    <div className="publico">
      <div className="portal">
        {/* ── Encabezado ── */}
        <header className="portal-cab">
          <div className="portal-marca">
            <span className="marca-logo">
              <Icono n="theaters" relleno />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="portal-nombre">
                {conjunto} <span className="etiqueta-vip">Portal cinepolitos</span>
              </div>
              <div className="portal-sub">Material oficial de exhibición para cinepolitos</div>
            </div>
          </div>
          <div className="fila" style={{ flexWrap: 'nowrap' }}>
            {empleado ? (
              <div className="portal-id">
                <span className="avatar">{iniciales(empleado.nombre)}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="portal-id-nombre">
                    Apartando como: {empleado.nombre} <span className="mono">#{empleado.id}</span>
                  </div>
                  <button
                    className="enlace"
                    onClick={() => {
                      setEmpleado(null);
                      setSel(new Set());
                      setYaApartados(new Map());
                      setAviso(null);
                      setIdTexto('');
                    }}
                  >
                    ¿No eres tú? Cambiar ID
                  </button>
                </div>
              </div>
            ) : (
              <form className="portal-form" onSubmit={identificar}>
                <label className="campo" style={{ flex: 1, minWidth: 150 }}>
                  <span>Tu ID de empleado</span>
                  <input inputMode="numeric" value={idTexto} onChange={(e) => setIdTexto(e.target.value.replace(/\D/g, ''))} placeholder="Ej. 244689" />
                </label>
                <button className="btn btn-primario" disabled={verificando}>
                  {verificando ? 'Verificando…' : 'Continuar'}
                </button>
                {errorId && (
                  <div className="texto-rojo chico negrita" style={{ width: '100%' }}>
                    {errorId}
                  </div>
                )}
              </form>
            )}
            <BotonTema />
          </div>
        </header>

        {/* ── Aviso de material por recoger ── */}
        {empleado && aviso && aviso.pendientes.length > 0 && (
          <div className="alerta-entrega">
            <span className="alerta-entrega-icono">
              <Icono n="celebration" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3>
                ¡Tienes material listo para entrega! <span className="chip chip-oro chip-caps">Asignado</span>
              </h3>
              <div>
                Tu apartado de{' '}
                {aviso.pendientes.map((x, i) => (
                  <span key={i}>
                    {i > 0 ? (i === aviso.pendientes.length - 1 ? ' y ' : ', ') : ''}
                    <b>
                      "{x.titulo} ({x.categoria} v{x.version})"
                    </b>
                  </span>
                ))}{' '}
                {aviso.pendientes.length === 1 ? 'fue' : 'fueron'} <b>seleccionado{aviso.pendientes.length === 1 ? '' : 's'} por gerencia</b>.
                Acércate con <b>{contacto}</b> para su entrega y firma de constancia.
              </div>
            </div>
          </div>
        )}

        {/* ── Reglas ── */}
        <div className="aviso-reglas">
          <Icono n="info" />
          <div>
            <b>Material exclusivo de películas que salieron de cartelera.</b> Vigencia de 1 mes exacto desde su publicación.{' '}
            <span className="texto-oro negrita">Recuerda:</span> puedes apartar varios, pero cada uno solo una vez; un apartado
            es personal y no se puede cancelar. Los primeros en apartar, hasta completar las piezas, quedan{' '}
            <b>apartados</b>; los demás quedan <b>en fila</b> y se les entrega si alguien de antes no lo recibe y gerencia los
            selecciona.
          </div>
        </div>

        {/* ── Filtros ── */}
        {posters && posters.length > 0 && (
          <div className="portal-filtros">
            <div className="buscador">
              <Icono n="search" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por película…" />
            </div>
            <div className="filtros-pildora">
              <button className={'pildora' + (filtroCat === 'todas' ? ' activa' : '')} onClick={() => setFiltroCat('todas')}>
                Todos los materiales <span className="cuenta">{posters.length}</span>
              </button>
              {categoriasPresentes.map(({ c, n }) => (
                <button key={c.id} className={'pildora' + (filtroCat === c.id ? ' activa' : '')} onClick={() => setFiltroCat(c.id)}>
                  {c.nombre} <span className="cuenta">{n}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="seccion-titulo" style={{ marginTop: 0 }}>
          <div>
            <h2>
              <span className="barra-roja" />
              Disponibles para apartado
            </h2>
            <div className="muted" style={{ marginTop: 4 }}>
              {empleado ? 'Toca las piezas que deseas apartar.' : 'Escribe tu ID de empleado arriba para poder apartar.'}
            </div>
          </div>
          <span className="caps texto-oro">{conjunto}</span>
        </div>

        {posters === null ? (
          <Cargando texto="Cargando material…" />
        ) : posters.length === 0 ? (
          <div className="tarjeta">
            <Vacio titulo="Por ahora no hay material disponible" icono="local_activity">
              Vuelve a revisar pronto.
            </Vacio>
          </div>
        ) : visibles.length === 0 ? (
          <div className="tarjeta">
            <Vacio titulo="Sin resultados" icono="search_off">
              Prueba con otro nombre o tipo de material.
            </Vacio>
          </div>
        ) : (
          <div className="galeria-publica">
            {visibles.map((p) => {
              const ya = yaApartados.has(p.id);
              const mio = yaApartados.get(p.id);
              const estado = mio ? mio.estado : undefined;
              const lugar = lugarDe(p);
              const proy = lugarProyectado(p);
              const abiertoMio = estado === 'apartado' || estado === 'seleccionado';
              const marcado = sel.has(p.id);
              const dias = diasPara(p.hasta);
              const cat = nombreCat(p.categoriaId);
              const esStandeeChico = (categorias.find((c) => c.id === p.categoriaId) || { rol: '' }).rol === 'standee_chico';
              return (
                <div key={p.id} className={'tarjeta-poster' + (marcado ? ' sel' : '')}>
                  <div className="poster-envoltura" onClick={() => alternar(p)}>
                    <span className={'tp-tipo' + (esStandeeChico ? ' oro' : '')}>{cat}</span>
                    {mio && abiertoMio && lugar ? (
                      lugar.enStock ? (
                        <span className="tp-piezas rojo" title="Alcanzaste pieza">
                          Apartado #{lugar.pos}
                        </span>
                      ) : (
                        <span className="tp-piezas" title="Ya no hay piezas: estás en espera">
                          En fila #{lugar.fila}
                        </span>
                      )
                    ) : !mio ? (
                      proy.enStock ? (
                        <span className="tp-piezas verde">Disponible</span>
                      ) : (
                        <span className="tp-piezas" title="Ya lo apartaron otros: quedarías en fila">
                          En espera
                        </span>
                      )
                    ) : null}
                    {estado === 'entregado' && <span className="tp-estado">Entregado</span>}
                    <Poster url={p.imagenUrl} alt={p.titulo} />
                    <span className="tp-vence">
                      <Icono n={estado === 'entregado' ? 'done_all' : 'schedule'} />
                      {estado === 'entregado' ? 'Proceso cerrado' : dias <= 1 ? 'Vence hoy' : 'Vence en: ' + dias + ' días'}
                    </span>
                  </div>
                  <div className="tp-titulo" title={p.titulo}>
                    {p.titulo}
                  </div>
                  <div className="tp-sub">
                    {cat} {vtxt(p)} · hasta {fmtFecha(p.hasta)}
                  </div>
                  {ya ? (
                    estado === 'seleccionado' ? (
                      <button className="btn tp-accion recoger" disabled>
                        <Icono n="redeem" /> ¡Por entregarte!
                      </button>
                    ) : estado === 'entregado' ? (
                      <button className="btn tp-accion entregado" disabled>
                        <Icono n="verified" /> Ya se te entregó
                      </button>
                    ) : lugar && !lugar.enStock && estado === 'apartado' ? (
                      <button className="btn tp-accion ya" disabled>
                        <Icono n="hourglass_top" /> En fila #{lugar.fila}
                      </button>
                    ) : (
                      <button className="btn tp-accion ya" disabled>
                        <Icono n="check_circle" /> {lugar && estado === 'apartado' ? 'Apartado #' + lugar.pos : 'Ya lo apartaste'}
                      </button>
                    )
                  ) : marcado ? (
                    <button className="btn btn-primario tp-accion" onClick={() => alternar(p)}>
                      <Icono n="check_circle" relleno /> Seleccionado
                    </button>
                  ) : (
                    <button className="btn tp-accion" onClick={() => alternar(p)}>
                      <Icono n="bookmark_add" /> Seleccionar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="portal-admin">
          <Link to="/admin">
            Acceso administración <Icono n="lock" className="ico-14" />
          </Link>
        </div>
      </div>

      {elegidos.length > 0 && (
        <div className="barra-flotante">
          <div className="barra-flotante-in">
            <div className="barra-flotante-info">
              <span className="icono-caja rojo">
                <Icono n="style" />
              </span>
              <div style={{ minWidth: 0 }}>
                <b>
                  {elegidos.length} material{elegidos.length === 1 ? '' : 'es'} seleccionado{elegidos.length === 1 ? '' : 's'}{' '}
                  <span className="punto punto-rojo latido" />
                </b>
                <div className="barra-flotante-lista">{elegidos.map((p) => p.titulo + ' (' + nombreCat(p.categoriaId) + ' ' + vtxt(p) + ')').join(', ')}</div>
              </div>
            </div>
            <button className="btn btn-primario" onClick={() => setConfirmando(true)}>
              Confirmar y apartar ({elegidos.length}) <Icono n="arrow_forward" />
            </button>
          </div>
        </div>
      )}

      <Modal
        abierto={confirmando}
        titulo="Confirmar apartado"
        onCerrar={() => setConfirmando(false)}
        ancho={480}
        pie={
          <>
            <button className="btn btn-fantasma" onClick={() => setConfirmando(false)}>
              Regresar
            </button>
            <button className="btn btn-primario" onClick={apartar} disabled={enviando}>
              {enviando ? 'Apartando…' : 'Sí, apartar'}
            </button>
          </>
        }
      >
        <p>
          <b className="negrita">{empleado ? empleado.nombre : ''}</b>, vas a apartar:
        </p>
        <ul>
          {elegidos.map((p) => {
            const l = lugarProyectado(p);
            return (
              <li key={p.id} style={{ marginBottom: 6 }}>
                <b className="negrita">{nombreCat(p.categoriaId)}</b>: {p.titulo} {vtxt(p)}{' '}
                {l.enStock ? (
                  <span className="chip chip-verde">Alcanzas pieza</span>
                ) : (
                  <span className="chip chip-oro">Quedarías en fila #{l.fila}</span>
                )}
              </li>
            );
          })}
        </ul>
        {elegidos.some((p) => !lugarProyectado(p).enStock) && (
          <div className="alerta alerta-aviso">
            <strong>Vas a quedar en fila en algunos materiales.</strong> Ya no hay piezas suficientes porque otros compañeros los
            apartaron antes. Si alguno de ellos no lo recibe y gerencia te selecciona, se te entregará; verás el aviso al poner tu
            ID en esta página.
          </div>
        )}
        <div className="alerta alerta-error" style={{ marginBottom: 0 }}>
          Un apartado no se puede cancelar.
        </div>
      </Modal>

      <Modal
        abierto={!!listo}
        titulo="¡Listo! 🎉"
        onCerrar={() => setListo(null)}
        ancho={440}
        pie={
          <button className="btn btn-primario" onClick={() => setListo(null)}>
            Entendido
          </button>
        }
      >
        <p>Apartaste:</p>
        <ul>
          {(resultados || []).map((r) => (
            <li key={r.texto} style={{ marginBottom: 6 }}>
              {r.texto}{' '}
              {r.lugar.enStock ? (
                <span className="chip chip-verde">Apartado #{r.lugar.pos}</span>
              ) : (
                <span className="chip chip-oro">En fila #{r.lugar.fila}</span>
              )}
            </li>
          ))}
        </ul>
        {(resultados || []).some((r) => !r.lugar.enStock) && (
          <div className="alerta alerta-aviso">
            En los que quedaste <b>en fila</b> ya no alcanzó pieza. Si alguien que lo apartó antes no lo recibe y gerencia te
            selecciona, se te entregará.
          </div>
        )}
        <p className="muted chico">
          Si se te selecciona, al poner tu ID en esta página verás el aviso para recogerlo con {contacto}. Recuerda la fecha de
          entrega o desecho de cada material.
        </p>
      </Modal>
    </div>
  );
}
