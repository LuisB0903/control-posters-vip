import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { BotonTema, Cargando, Modal, Poster, useUI, Vacio } from '../components/ui';
import { aDate, fmtFecha } from '../lib/fechas';
import { contiene } from '../lib/texto';
import { errorTexto } from '../lib/utilidades';

interface PosterPublico {
  id: string;
  peliculaId: string | null;
  titulo: string;
  version: number;
  imagenUrl: string | null;
  hasta: Date;
}

/** Página pública: los cinepolitos apartan pósters de películas que ya salieron de cartelera */
export default function Cinepolitos() {
  const { toast } = useUI();
  const [posters, setPosters] = useState<PosterPublico[] | null>(null);
  const [idTexto, setIdTexto] = useState('');
  const [empleado, setEmpleado] = useState<{ id: string; nombre: string } | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [errorId, setErrorId] = useState('');
  const [yaApartados, setYaApartados] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState('');
  const [listo, setListo] = useState<string[] | null>(null);

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
            lista.push({ id: x.id, peliculaId: m.peliculaId || null, titulo: m.titulo, version: m.version, imagenUrl: m.imagenUrl || null, hasta });
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

  // revisar cuáles ya apartó este empleado
  useEffect(() => {
    if (!empleado || !posters) return;
    let vivo = true;
    Promise.all(
      posters.map((p) =>
        getDoc(doc(db, 'apartados', p.id + '_' + empleado.id))
          .then((s) => (s.exists() ? p.id : null))
          .catch(() => null),
      ),
    ).then((r) => {
      if (vivo) setYaApartados(new Set(r.filter((x): x is string => !!x)));
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
      else setEmpleado({ id, nombre: s.data().nombre });
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

  const apartar = async () => {
    if (!empleado) return;
    setEnviando(true);
    const ok: string[] = [];
    const fallidos: string[] = [];
    await Promise.all(
      elegidos.map((p) =>
        setDoc(doc(db, 'apartados', p.id + '_' + empleado.id), {
          materialId: p.id,
          peliculaId: p.peliculaId,
          titulo: p.titulo,
          version: p.version,
          empleadoId: empleado.id,
          empleadoNombre: empleado.nombre,
          creadoEn: serverTimestamp(),
          estado: 'apartado',
        })
          .then(() => ok.push(p.titulo + ' v' + p.version))
          .catch(() => fallidos.push(p.titulo + ' v' + p.version)),
      ),
    );
    setEnviando(false);
    setConfirmando(false);
    setSel(new Set());
    setYaApartados(new Set(Array.from(yaApartados).concat(elegidos.filter((p) => ok.indexOf(p.titulo + ' v' + p.version) >= 0).map((p) => p.id))));
    if (fallidos.length) toast('No se pudo apartar: ' + fallidos.join(', ') + ' (ya lo habías apartado o ya cerró)', 'error');
    if (ok.length) setListo(ok);
  };

  const visibles = useMemo(() => (posters || []).filter((p) => contiene(p.titulo, busca)), [posters, busca]);

  return (
    <div className="publico">
      <header className="publico-cab">
        <div className="publico-cab-in">
          <div className="marca-logo" style={{ width: 38, height: 38, fontSize: '1.1rem' }}>
            VIP
          </div>
          <div className="display" style={{ fontSize: '1.4rem' }}>
            Pósters para cinepolitos
          </div>
          <div style={{ marginLeft: 'auto' }} className="fila">
            <BotonTema />
            <Link to="/admin" className="btn btn-chico btn-fantasma">
              Admin
            </Link>
          </div>
        </div>
      </header>

      <section className="publico-hero">
        <h1>Aparta tu póster 🎬</h1>
        <p className="muted" style={{ maxWidth: 640 }}>
          Estos pósters son de películas que ya salieron de cartelera. Elige los que quieras y apártalos con tu ID de empleado.
          Puedes apartar varios, pero <b>cada póster solo una vez</b> y <b>no se puede cancelar</b>. La gerencia decide a quién
          se entrega cuando hay más interesados que pósters.
        </p>
      </section>

      <div className="publico-cuerpo">
        <div className="tarjeta mb">
          {empleado ? (
            <div className="fila-entre">
              <div>
                <div className="muted chico">Apartando como</div>
                <div className="negrita">
                  {empleado.nombre} · ID {empleado.id}
                </div>
              </div>
              <button
                className="btn btn-chico"
                onClick={() => {
                  setEmpleado(null);
                  setSel(new Set());
                  setYaApartados(new Set());
                  setIdTexto('');
                }}
              >
                No soy yo
              </button>
            </div>
          ) : (
            <form className="fila" onSubmit={identificar}>
              <label className="campo" style={{ flex: 1, minWidth: 180 }}>
                <span>Tu ID de empleado</span>
                <input inputMode="numeric" value={idTexto} onChange={(e) => setIdTexto(e.target.value.replace(/\D/g, ''))} placeholder="Ej. 244689" />
              </label>
              <button className="btn btn-primario" style={{ alignSelf: 'flex-end' }} disabled={verificando}>
                {verificando ? 'Verificando…' : 'Continuar'}
              </button>
              {errorId && (
                <div className="alerta alerta-error" style={{ width: '100%', margin: 0 }}>
                  {errorId}
                </div>
              )}
            </form>
          )}
        </div>

        {posters === null ? (
          <Cargando texto="Cargando pósters…" />
        ) : posters.length === 0 ? (
          <div className="tarjeta">
            <Vacio titulo="Por ahora no hay pósters disponibles">Vuelve a revisar pronto.</Vacio>
          </div>
        ) : (
          <>
            {posters.length > 8 && (
              <input className="mb" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar película…" style={{ maxWidth: 340 }} />
            )}
            <div className="galeria-publica">
              {visibles.map((p) => {
                const ya = yaApartados.has(p.id);
                const marcado = sel.has(p.id);
                return (
                  <button key={p.id} className={'tarjeta-poster' + (marcado ? ' sel' : '') + (ya ? ' ya' : '')} onClick={() => alternar(p)}>
                    {marcado && <span className="marca-sel">✓</span>}
                    <Poster url={p.imagenUrl} alt={p.titulo} />
                    <div style={{ padding: '8px 2px 2px' }}>
                      <div className="negrita" style={{ lineHeight: 1.2 }}>
                        {p.titulo}
                      </div>
                      <div className="muted chico">Versión {p.version}</div>
                      <div className="chico" style={{ marginTop: 4 }}>
                        {ya ? (
                          <span className="chip chip-verde">Ya lo apartaste</span>
                        ) : (
                          <span className="muted">Entrega o desecho: {fmtFecha(p.hasta)}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {elegidos.length > 0 && (
        <div className="barra-flotante">
          <div className="barra-flotante-in">
            <span>
              <b>{elegidos.length}</b> seleccionado(s)
            </span>
            <button className="btn btn-primario" onClick={() => setConfirmando(true)}>
              Apartar
            </button>
          </div>
        </div>
      )}

      <Modal
        abierto={confirmando}
        titulo="Confirmar apartado"
        onCerrar={() => setConfirmando(false)}
        ancho={460}
        pie={
          <>
            <button className="btn" onClick={() => setConfirmando(false)}>
              Regresar
            </button>
            <button className="btn btn-primario" onClick={apartar} disabled={enviando}>
              {enviando ? 'Apartando…' : 'Sí, apartar'}
            </button>
          </>
        }
      >
        <p>
          <b>{empleado ? empleado.nombre : ''}</b>, vas a apartar:
        </p>
        <ul>
          {elegidos.map((p) => (
            <li key={p.id}>
              {p.titulo} v{p.version} <span className="muted chico">· {fmtFecha(p.hasta)}</span>
            </li>
          ))}
        </ul>
        <div className="alerta alerta-aviso">Un apartado no se puede cancelar.</div>
      </Modal>

      <Modal
        abierto={!!listo}
        titulo="¡Listo! 🎉"
        onCerrar={() => setListo(null)}
        ancho={420}
        pie={
          <button className="btn btn-primario" onClick={() => setListo(null)}>
            Entendido
          </button>
        }
      >
        <p>Apartaste:</p>
        <ul>{listo && listo.map((t) => <li key={t}>{t}</li>)}</ul>
        <p className="muted chico">La gerencia te avisará si se te entrega. Recuerda la fecha de entrega o desecho de cada póster.</p>
      </Modal>
    </div>
  );
}
