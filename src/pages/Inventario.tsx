import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useQuien } from '../context/AuthContext';
import { BotonFiltros, Buscador, CabPagina, Icono, Interruptor, MenuAcciones, Modal, PieFiltros, Pildoras, Poster, useUI, Vacio } from '../components/ui';
import RegistrarMaterial from '../components/RegistrarMaterial';
import {
  actualizarPelicula,
  agregarPiezas,
  cambiarEstadoPelicula,
  cambiarEstadoPieza,
  editarMaterial,
  eliminarMaterial,
  eliminarPelicula,
  marcarPropensoRobo,
  moverPieza,
  nombreMaterial,
  publicarParaCinepolitos,
  quitarPieza,
} from '../lib/acciones';
import { estadoVersion } from '../lib/alertas';
import { BODEGA, etiquetaUbic, opcionesUbic, ubicDeKey, ubicKey } from '../lib/ubicaciones';
import { contiene } from '../lib/texto';
import { fmtFecha, sumarUnMes, vencido } from '../lib/fechas';
import { comprimirImagen, errorTexto } from '../lib/utilidades';
import type { EstadoPelicula, EstadoPieza, Material, Pelicula } from '../types';

const ESTADOS: { id: EstadoPelicula; t: string }[] = [
  { id: 'proximamente', t: 'Próximamente' },
  { id: 'cartelera', t: 'En cartelera' },
  { id: 'salio', t: 'Salió de cartelera' },
];

export default function Inventario() {
  const d = useData();
  const quien = useQuien();
  const { toast, confirmar } = useUI();
  const [registrar, setRegistrar] = useState<{ abierto: boolean; pelicula: Pelicula | null }>({ abierto: false, pelicula: null });
  const [q, setQ] = useState('');
  const [fEstado, setFEstado] = useState<'todos' | EstadoPelicula>('todos');
  const [fCat, setFCat] = useState('todas');
  const [fUbic, setFUbic] = useState('todas');
  const [verInactivas, setVerInactivas] = useState(false);
  const [editando, setEditando] = useState<Material | null>(null);
  const [verFiltros, setVerFiltros] = useState(false);
  const [params, setParams] = useSearchParams();

  // Inicio → "Registrar material" abre la ventana directamente
  useEffect(() => {
    if (params.get('registrar') === '1') {
      setRegistrar({ abierto: true, pelicula: null });
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ejecutar = async (f: () => Promise<unknown>, ok?: string) => {
    try {
      await f();
      if (ok) toast(ok);
    } catch (e) {
      toast(errorTexto(e), 'error');
    }
  };

  // el material ya entregado o desechado por completo se oculta (sale del inventario)
  const filtraMaterial = (m: Material) =>
    (verInactivas || m.piezas.length === 0 || m.piezas.some((p) => p.estado === 'activa')) &&
    (fCat === 'todas' || m.categoriaId === fCat) &&
    (fUbic === 'todas' || m.piezas.some((p) => p.estado === 'activa' && ubicKey(p.ubic) === fUbic));

  const grupos = useMemo(() => {
    const lista = d.peliculas
      .filter((p) => fEstado === 'todos' || p.estado === fEstado)
      .filter((p) => contiene(p.titulo + ' ' + (p.tituloOriginal || ''), q))
      .map((p) => ({
        p,
        mats: d.materiales
          .filter((m) => m.peliculaId === p.id && filtraMaterial(m))
          .sort((a, b) => a.categoriaId.localeCompare(b.categoriaId) || b.version - a.version),
      }))
      .filter(
        (g) => g.mats.length || (fCat === 'todas' && fUbic === 'todas' && !d.materiales.some((m) => m.peliculaId === g.p.id)),
      );
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.peliculas, d.materiales, q, fEstado, fCat, fUbic, verInactivas]);

  const sinPelicula = d.materiales
    .filter((m) => !m.peliculaId && filtraMaterial(m) && contiene(m.titulo, q))
    .sort((a, b) => a.titulo.localeCompare(b.titulo));

  const cambiarEstado = async (p: Pelicula, estado: EstadoPelicula) => {
    const mats = d.materiales.filter((m) => m.peliculaId === p.id);
    if (estado === 'salio') {
      const hasta = sumarUnMes(new Date());
      const ok = await confirmar({
        titulo: 'Marcar como "Salió de cartelera"',
        mensaje: (
          <>
            <p>
              Los {mats.length} material(es) de <b>{p.titulo}</b> se publicarán en la página de cinepolitos para que los
              aparten.
            </p>
            <p>
              Fecha de entrega o desecho: <b>{fmtFecha(hasta, true)}</b> (un mes exacto).
            </p>
          </>
        ),
        aceptar: 'Publicar para cinepolitos',
      });
      if (!ok) return;
    } else if (p.estado === 'salio') {
      const ok = await confirmar({
        titulo: 'Regresar a ' + (estado === 'cartelera' ? 'cartelera' : 'próximamente'),
        mensaje: 'Sus materiales dejarán de mostrarse a los cinepolitos. Los apartados ya hechos se conservan.',
      });
      if (!ok) return;
    }
    ejecutar(() => cambiarEstadoPelicula(quien, p, estado, mats), 'Estado actualizado');
  };

  const totalActivas = d.materiales.reduce((a, m) => a + m.piezas.filter((x) => x.estado === 'activa').length, 0);

  const activos = (fCat !== 'todas' ? 1 : 0) + (fUbic !== 'todas' ? 1 : 0) + (verInactivas ? 1 : 0);
  const limpiar = () => {
    setQ('');
    setFEstado('todos');
    setFCat('todas');
    setFUbic('todas');
    setVerInactivas(false);
  };
  const cuentaEstado = (e: 'todos' | EstadoPelicula) => d.peliculas.filter((p) => e === 'todos' || p.estado === e).length;

  return (
    <div>
      <CabPagina
        titulo="Inventario"
        desc={totalActivas + ' piezas activas entre piso y bodega. Versiones, standees y ubicación de cada copia.'}
        acciones={
          <button className="btn btn-primario" onClick={() => setRegistrar({ abierto: true, pelicula: null })}>
            <Icono n="add" /> Registrar material
          </button>
        }
      />

      <div className="barra-busqueda">
        <div className="barra-busqueda-fila">
          <Buscador valor={q} onCambio={setQ} placeholder="Buscar película" />
          <BotonFiltros abierto={verFiltros} activos={activos} onClick={() => setVerFiltros(!verFiltros)} />
        </div>
        <Pildoras<'todos' | EstadoPelicula>
          etiqueta="Estado de la película"
          valor={fEstado}
          onCambio={setFEstado}
          opciones={[{ id: 'todos' as const, t: 'Todas' }, ...ESTADOS].map((e) => ({ id: e.id, texto: e.t, cuenta: cuentaEstado(e.id) }))}
        />
        <div className={'filtros-extra' + (verFiltros ? ' abierto' : '')}>
          <label className="campo">
            <span>Categoría</span>
            <select value={fCat} onChange={(e) => setFCat(e.target.value)}>
              <option value="todas">Todas</option>
              {d.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Ubicación</span>
            <select value={fUbic} onChange={(e) => setFUbic(e.target.value)}>
              <option value="todas">Todas</option>
              {opcionesUbic(d.config).map((o) => (
                <option key={o.key} value={o.key}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <div className="campo campo-interruptor">
            <Interruptor activo={verInactivas} onCambio={setVerInactivas} etiqueta="Incluir material entregado o desechado" />
          </div>
        </div>
        <PieFiltros activos={activos + (q ? 1 : 0) + (fEstado !== 'todos' ? 1 : 0)} onLimpiar={limpiar}>
          <b>{grupos.length}</b> película(s) y <b>{sinPelicula.length}</b> campaña(s)
        </PieFiltros>
      </div>

      {grupos.length === 0 && sinPelicula.length === 0 && (
        <div className="tarjeta">
          {d.peliculas.length === 0 && d.materiales.length === 0 ? (
            <Vacio titulo="Aún no hay material registrado" icono="movie">
              Registra tu primer póster con "Registrar material".
            </Vacio>
          ) : (
            <Vacio titulo="Nada coincide con esos filtros" icono="search_off">
              Cambia la búsqueda o limpia los filtros.
            </Vacio>
          )}
        </div>
      )}

      {grupos.map(({ p, mats }) => {
        const arte = p.posterUrl || (mats[0] && mats[0].imagenUrl) || null;
        const estreno = p.fechaEstreno ? new Date(p.fechaEstreno + 'T12:00:00') : null;
        const diasEstreno = estreno ? Math.ceil((estreno.getTime() - Date.now()) / 86400000) : null;
        const abiertos = d.apartados.filter(
          (a) => a.peliculaId === p.id && (a.estado === 'apartado' || a.estado === 'seleccionado'),
        ).length;
        const publicadoHasta = mats
          .map((m) => (m.cinepolitos && m.cinepolitos.activo ? m.cinepolitos.hasta : null))
          .filter((x) => !!x)[0];
        return (
          <article className="peli" key={p.id}>
            <div className="peli-arte">
              {arte && arte.indexOf('data:') !== 0 && <div className="peli-arte-fondo" style={{ backgroundImage: 'url("' + arte + '")' }} />}
              <div className="poster-envoltura">
                <Poster url={arte} alt={p.titulo} />
              </div>
              <span className="peli-arte-pie">{p.tmdbId ? 'TMDB #' + p.tmdbId : 'Registro manual'}</span>
            </div>

            <div className="peli-info">
              <div className="peli-cab">
                <span className="peli-mini">
                  <Poster url={arte} alt={p.titulo} chico />
                </span>
                <div className="peli-cab-texto">
                  <h2 className="peli-titulo">{p.titulo}</h2>
                  {p.tituloOriginal && p.tituloOriginal !== p.titulo && <div className="peli-original">{p.tituloOriginal}</div>}
                </div>
                <div className="peli-controles">
                  <select
                    className={'select-estado estado-' + p.estado}
                    value={p.estado}
                    aria-label={'Estado de ' + p.titulo}
                    onChange={(e) => cambiarEstado(p, e.target.value as EstadoPelicula)}
                  >
                    {ESTADOS.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.t}
                      </option>
                    ))}
                  </select>
                  <Interruptor
                    activo={p.taquillera}
                    etiqueta="Taquillera"
                    onCambio={(v) => ejecutar(() => actualizarPelicula(quien, p, { taquillera: v }, v ? 'marcada como taquillera' : 'ya no es taquillera'))}
                  />
                </div>
              </div>

              {(estreno || p.salioEn || publicadoHasta || abiertos > 0) && (
                <ul className="peli-meta">
                  {estreno && (
                    <li>
                      <Icono n="calendar_month" /> Estreno {fmtFecha(estreno)}
                      {p.estado === 'proximamente' && diasEstreno !== null && diasEstreno > 0 && <span className="muted"> (en {diasEstreno} día(s))</span>}
                    </li>
                  )}
                  {p.salioEn && (
                    <li>
                      <Icono n="event_busy" /> Salió {fmtFecha(p.salioEn)}
                    </li>
                  )}
                  {publicadoHasta && (
                    <li className="texto-oro">
                      <Icono n="public" /> En el portal hasta {fmtFecha(publicadoHasta)}
                    </li>
                  )}
                  {abiertos > 0 && (
                    <li className="texto-morado">
                      <Icono n="bookmark" /> {abiertos} apartado(s) abiertos
                    </li>
                  )}
                </ul>
              )}

              <h3 className="peli-seccion">
                Material <span>{mats.length}</span>
              </h3>

              {mats.length === 0 && <p className="muted chico">Sin material registrado.</p>}
              {mats.map((m) => (
                <MaterialFila key={m.id} m={m} verInactivas={verInactivas} onEditar={() => setEditando(m)} ejecutar={ejecutar} />
              ))}

              <div className="peli-pie">
                <button className="btn btn-chico btn-fantasma" onClick={() => setRegistrar({ abierto: true, pelicula: p })}>
                  <Icono n="add" /> Nueva versión o material
                </button>
                {mats.length === 0 && d.materiales.every((m) => m.peliculaId !== p.id) && (
                  <button
                    className="btn btn-chico btn-fantasma"
                    onClick={async () => {
                      if (await confirmar({ titulo: 'Eliminar película', mensaje: '¿Eliminar "' + p.titulo + '"? No tiene material.', peligro: true, aceptar: 'Eliminar' }))
                        ejecutar(() => eliminarPelicula(quien, p), 'Película eliminada');
                    }}
                  >
                    <Icono n="delete" /> Eliminar película
                  </button>
                )}
              </div>
            </div>
          </article>
        );
      })}

      {sinPelicula.length > 0 && (
        <>
          <div className="seccion-cab">
            <div>
              <h2>Publicidad del cine y campañas</h2>
              <p>Material sin película: rellena carteleras cuando no hay póster.</p>
            </div>
            <button className="btn btn-chico" onClick={() => setRegistrar({ abierto: true, pelicula: null })}>
              <Icono n="add" /> Nueva campaña
            </button>
          </div>
          <div className="campanas">
            {sinPelicula.map((m) => (
              <div className="campana" key={m.id}>
                <MaterialFila m={m} verInactivas={verInactivas} onEditar={() => setEditando(m)} ejecutar={ejecutar} campana />
              </div>
            ))}
          </div>
        </>
      )}

      <RegistrarMaterial
        abierto={registrar.abierto}
        peliculaInicial={registrar.pelicula}
        onCerrar={() => setRegistrar({ abierto: false, pelicula: null })}
      />
      {editando && <EditarMaterial m={editando} onCerrar={() => setEditando(null)} />}
    </div>
  );
}

const ICONO_ROL: Record<string, string> = {
  cartelera: 'image',
  publicidad: 'campaign',
  standee_grande: 'accessibility_new',
  standee_chico: 'view_in_ar',
  ninguno: 'flag',
};

/** "Pasillo 1-3 (#1, #2), Bodega (#3)" */
function resumenUbicaciones(m: Material): { lugar: string; piezas: number[] }[] {
  const mapa = new Map<string, number[]>();
  m.piezas
    .filter((p) => p.estado === 'activa')
    .sort((a, b) => a.n - b.n)
    .forEach((p) => {
      const k = etiquetaUbic(p.ubic);
      mapa.set(k, (mapa.get(k) || []).concat(p.n));
    });
  return Array.from(mapa.entries())
    .map(([lugar, piezas]) => ({ lugar, piezas }))
    .sort((a, b) => Number(a.lugar === 'Bodega') - Number(b.lugar === 'Bodega'));
}

/* ───────── Un material (variante) con sus piezas ───────── */
function MaterialFila({
  m,
  verInactivas,
  onEditar,
  ejecutar,
  campana,
}: {
  m: Material;
  verInactivas: boolean;
  onEditar: () => void;
  ejecutar: (f: () => Promise<unknown>, ok?: string) => void;
  campana?: boolean;
}) {
  const d = useData();
  const quien = useQuien();
  const { confirmar } = useUI();
  const [agregar, setAgregar] = useState(false);
  const [verPiezas, setVerPiezas] = useState(false);
  const cat = d.categoriaPorId.get(m.categoriaId);
  const activas = m.piezas.filter((p) => p.estado === 'activa');
  const piezas = verInactivas ? m.piezas : activas;
  const pub = m.cinepolitos;
  const publicado = !!pub && pub.activo && !vencido(pub.hasta);
  const apartados = d.apartados.filter((a) => a.materialId === m.id && (a.estado === 'apartado' || a.estado === 'seleccionado')).length;
  const ev = estadoVersion(m, d.materiales);
  const masNueva = ev.masNueva;
  const esVieja = ev.esVieja;
  const colocadasViejas = ev.aCambiar;
  const sinReemplazo = esVieja ? ev.colocadas.filter((p) => colocadasViejas.indexOf(p) < 0) : [];
  // otros materiales con la misma versión (diferente arte) → se muestra el nombre del arte
  const hermanos = d.materiales.filter(
    (x) => x.id !== m.id && x.peliculaId && x.peliculaId === m.peliculaId && x.categoriaId === m.categoriaId && x.version === m.version,
  ).length;
  const opciones = opcionesUbic(d.config);
  const ubic = resumenUbicaciones(m);
  const enUso = activas.filter((p) => p.ubic.tipo !== 'bodega').length;

  return (
    <div className={(campana ? "variante variante-campana" : "variante") + (colocadasViejas.length ? " vieja" : "")}>
      <div className="variante-fila">
        {m.imagenUrl && !campana ? (
          <span className={'variante-mini' + (colocadasViejas.length ? ' alerta-borde' : '')} title={nombreMaterial(m)}>
            <img src={m.imagenUrl} alt={nombreMaterial(m)} loading="lazy" />
          </span>
        ) : (
          <span className="variante-icono">
            <Icono n={colocadasViejas.length ? 'warning' : ICONO_ROL[cat ? cat.rol : 'ninguno'] || 'image'} />
          </span>
        )}
        <div className="variante-cuerpo">
          <div className="variante-titulo">
            {nombreMaterial(m)}
            <span className="variante-cat">{cat ? cat.nombre : campana ? 'Campaña' : m.categoriaId}</span>
          </div>
          {(esVieja || (!campana && m.peliculaId && masNueva > 1) || (hermanos > 0 && !m.arte) || m.propensoRobo || publicado || (pub && pub.activo) || apartados > 0) && (
            <div className="variante-chips">
              {!campana && m.peliculaId && !esVieja && masNueva > 1 && (
                <span className="chip chip-verde">
                  <Icono n="new_releases" /> Más reciente
                </span>
              )}
              {esVieja && colocadasViejas.length > 0 && (
                <span className="chip chip-rojo">
                  <Icono n="swap_horiz" /> Cambiar por v{masNueva}
                </span>
              )}
              {esVieja && !colocadasViejas.length && <span className="chip">Versión anterior</span>}
              {hermanos > 0 && !m.arte && (
                <button type="button" className="chip chip-oro chip-boton" onClick={onEditar} title="Hay otro material con la misma versión. Ponle nombre al arte para distinguirlos.">
                  <Icono n="edit" /> Ponle nombre al arte
                </button>
              )}
              {m.propensoRobo && (
                <span className="chip chip-oro" title="Solo se coloca en lobby o gerencia">
                  <Icono n="shield_lock" /> Propenso a robo
                </span>
              )}
              {publicado && (
                <span className="chip chip-oro">
                  <Icono n="public" /> Portal hasta {fmtFecha(pub!.hasta)}
                </span>
              )}
              {pub && pub.activo && vencido(pub.hasta) && (
                <span className="chip chip-rojo">
                  <Icono n="event_busy" /> Venció {fmtFecha(pub.hasta)}
                </span>
              )}
              {apartados > 0 && (
                <span className="chip chip-morado">
                  <Icono n="bookmark" /> {apartados} apartado(s)
                </span>
              )}
            </div>
          )}
          <div className="variante-sub">
            <span className="variante-cuenta">
              {activas.length}
              {m.piezas.length !== activas.length && <span className="muted"> de {m.piezas.length}</span>} pieza(s)
              {campana && enUso > 0 && <span className="muted"> · {enUso} en uso</span>}
            </span>
            {ubic.map((u) => (
              <span key={u.lugar} className={'ubic-chip' + (u.lugar === 'Bodega' ? ' ubic-bodega' : '')}>
                {u.lugar} <span>#{u.piezas.join(', #')}</span>
              </span>
            ))}
          </div>
          {m.notas && <div className="variante-notas">{m.notas}</div>}
          {colocadasViejas.length > 0 && (
            <div className="variante-aviso">
              <Icono n="warning" className="ico-16" />
              <span>
                Copia #{colocadasViejas.map((p) => p.n).join(', #')} sigue montada en{' '}
                <b>{Array.from(new Set(colocadasViejas.map((p) => etiquetaUbic(p.ubic)))).join(', ')}</b>. Reemplazar por v{masNueva}.
              </span>
            </div>
          )}
          {sinReemplazo.length > 0 && (
            <div className="variante-sub muted chico" style={{ marginTop: 4 }}>
              <Icono n="info" className="ico-16" /> Copia #{sinReemplazo.map((p) => p.n).join(', #')} puede seguir en{' '}
              {Array.from(new Set(sinReemplazo.map((p) => etiquetaUbic(p.ubic)))).join(', ')}: no hay piezas libres de v{masNueva} en bodega.
            </div>
          )}
        </div>
        <div className="variante-acciones">
          {piezas.length > 0 && (
            <button className={'btn btn-chico' + (verPiezas ? ' activo' : '')} aria-expanded={verPiezas} onClick={() => setVerPiezas(!verPiezas)}>
              <Icono n={verPiezas ? 'expand_less' : 'location_on'} /> <span className="btn-texto">Piezas</span> <span className="btn-cuenta">{piezas.length}</span>
            </button>
          )}
          <MenuAcciones
            titulo={nombreMaterial(m)}
            items={[
              {
                icono: publicado ? 'public_off' : 'public',
                texto: publicado ? 'Ocultar del portal de cinepolitos' : 'Publicar en el portal de cinepolitos',
                onClick: () =>
                  ejecutar(
                    () => publicarParaCinepolitos(quien, m, !publicado),
                    publicado ? 'Retirado de la página de cinepolitos' : 'Publicado para cinepolitos',
                  ),
              },
              { icono: 'add_box', texto: 'Agregar piezas', onClick: () => setAgregar(true) },
              {
                icono: m.propensoRobo ? 'shield_lock' : 'shield',
                texto: m.propensoRobo ? 'Quitar "propenso a robo"' : 'Marcar como propenso a robo',
                activo: m.propensoRobo,
                onClick: () =>
                  ejecutar(
                    () => marcarPropensoRobo(quien, m, !m.propensoRobo),
                    m.propensoRobo ? 'Ya no es propenso a robo' : 'Marcado como propenso a robo',
                  ),
              },
              { icono: 'edit', texto: 'Editar material', onClick: onEditar },
              {
                icono: 'delete',
                texto: 'Eliminar (registro por error)',
                peligro: true,
                onClick: async () => {
                  if (
                    await confirmar({
                      titulo: 'Eliminar material',
                      mensaje: '¿Eliminar "' + nombreMaterial(m) + '" y sus ' + m.piezas.length + ' pieza(s)? Úsalo solo si se registró por error.',
                      peligro: true,
                      aceptar: 'Eliminar',
                    })
                  )
                    ejecutar(() => eliminarMaterial(quien, m), 'Material eliminado');
                },
              },
            ]}
          />
        </div>
      </div>
      {verPiezas && piezas.length > 0 && (
        <div className="piezas">
          {piezas
            .slice()
            .sort((a, b) => a.n - b.n)
            .map((p) => (
              <div key={p.n} className={'pieza' + (p.estado !== 'activa' ? ' inactiva' : '')}>
                <span className="pieza-n">#{p.n}</span>
                {p.estado === 'activa' ? (
                  <select
                    className="compacto"
                    value={ubicKey(p.ubic)}
                    onChange={(e) => ejecutar(() => moverPieza(quien, m, p.n, ubicDeKey(e.target.value)), 'Ubicación actualizada')}
                  >
                    {opciones.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.etiqueta}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="chico" style={{ flex: 1 }}>
                    {p.estado === 'entregada' ? 'Entregada a ' + p.entregadaA : 'Desechada'}
                  </span>
                )}
                <select
                  className="compacto"
                  style={{ width: 'auto' }}
                  value=""
                  onChange={async (e) => {
                    const v = e.target.value;
                    if (v === 'quitar') {
                      if (await confirmar({ titulo: 'Quitar pieza', mensaje: '¿Quitar la pieza #' + p.n + '? (solo si se registró por error)', peligro: true }))
                        ejecutar(() => quitarPieza(quien, m, p.n), 'Pieza quitada');
                    } else if (v) ejecutar(() => cambiarEstadoPieza(quien, m, p.n, v as EstadoPieza), 'Pieza actualizada');
                  }}
                  aria-label={"Opciones de la pieza #" + p.n}
                >
                  <option value="">Opciones…</option>
                  {p.estado !== 'activa' && <option value="activa">Reactivar</option>}
                  {p.estado !== 'desechada' && <option value="desechada">Marcar desechada</option>}
                  <option value="quitar">Quitar (error)</option>
                </select>
              </div>
            ))}
        </div>
      )}
      {agregar && <AgregarPiezas m={m} onCerrar={() => setAgregar(false)} />}
    </div>
  );
}

function AgregarPiezas({ m, onCerrar }: { m: Material; onCerrar: () => void }) {
  const d = useData();
  const quien = useQuien();
  const { toast } = useUI();
  const [n, setN] = useState(1);
  const [u, setU] = useState(ubicKey(BODEGA));
  return (
    <Modal
      abierto
      titulo={'Agregar piezas · ' + nombreMaterial(m)}
      onCerrar={onCerrar}
      ancho={420}
      pie={
        <>
          <button className="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            className="btn btn-primario"
            onClick={() =>
              agregarPiezas(quien, m, n, ubicDeKey(u))
                .then(() => {
                  toast(n + ' pieza(s) agregada(s)');
                  onCerrar();
                })
                .catch((e) => toast(errorTexto(e), 'error'))
            }
          >
            Agregar
          </button>
        </>
      }
    >
      <div className="rejilla rejilla-2">
        <label className="campo">
          <span>Cantidad</span>
          <input type="number" min={1} value={n} onChange={(e) => setN(Math.max(1, parseInt(e.target.value, 10) || 1))} />
        </label>
        <label className="campo">
          <span>Ubicación</span>
          <select value={u} onChange={(e) => setU(e.target.value)}>
            {opcionesUbic(d.config).map((o) => (
              <option key={o.key} value={o.key}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted chico">Las piezas nuevas quedan en {etiquetaUbic(ubicDeKey(u))}.</p>
    </Modal>
  );
}

function EditarMaterial({ m, onCerrar }: { m: Material; onCerrar: () => void }) {
  const d = useData();
  const quien = useQuien();
  const { toast } = useUI();
  const [version, setVersion] = useState(m.version);
  const [arte, setArte] = useState(m.arte || '');
  const [imagen, setImagen] = useState(m.imagenUrl || '');
  const [notas, setNotas] = useState(m.notas);
  const [cat, setCat] = useState(m.categoriaId);
  const [titulo, setTitulo] = useState(m.titulo);
  const [robo, setRobo] = useState(!!m.propensoRobo);

  const guardar = () =>
    editarMaterial(quien, m, {
      version,
      arte: arte.trim(),
      imagenUrl: imagen.trim() || null,
      notas,
      propensoRobo: robo,
      categoriaId: cat,
      ...(m.peliculaId ? {} : { titulo: titulo.trim() }),
    })
      .then(() => {
        toast('Material actualizado');
        onCerrar();
      })
      .catch((e) => toast(errorTexto(e), 'error'));

  return (
    <Modal
      abierto
      titulo={'Editar · ' + nombreMaterial(m)}
      onCerrar={onCerrar}
      pie={
        <>
          <button className="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="btn btn-primario" onClick={guardar}>
            Guardar
          </button>
        </>
      }
    >
      <div className="pila">
        {!m.peliculaId && (
          <label className="campo">
            <span>Nombre</span>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </label>
        )}
        <div className="rejilla rejilla-2">
          <label className="campo">
            <span>Versión</span>
            <input type="number" min={1} value={version} onChange={(e) => setVersion(parseInt(e.target.value, 10) || 1)} />
          </label>
          <label className="campo">
            <span>Categoría</span>
            <select value={cat} onChange={(e) => setCat(e.target.value)}>
              {d.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="campo">
          <span>Nombre del arte (opcional)</span>
          <input value={arte} onChange={(e) => setArte(e.target.value)} placeholder="Ej. Arte A, Personajes, Compartido…" />
          <small>Úsalo cuando tengas dos imágenes distintas de la misma versión, para no confundirlas.</small>
        </label>
        <label className="campo">
          <span>Enlace de imagen</span>
          <input value={imagen.indexOf('data:') === 0 ? '(foto subida)' : imagen} onChange={(e) => setImagen(e.target.value)} />
        </label>
        <label className="btn btn-chico" style={{ alignSelf: 'flex-start' }}>
          Subir otra foto
          <input
            type="file"
            accept="image/*"
            className="oculto"
            onChange={(e) => {
              const f = e.target.files ? e.target.files[0] : undefined;
              if (f) comprimirImagen(f).then(setImagen).catch((er) => toast(errorTexto(er), 'error'));
            }}
          />
        </label>
        {imagen && (
          <div style={{ width: 120 }}>
            <Poster url={imagen} alt={m.titulo} />
          </div>
        )}
        <label className="campo">
          <span>Notas</span>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} />
        </label>
        <Interruptor activo={robo} onCambio={setRobo} etiqueta="Propenso a robo (solo lobby o gerencia)" />
      </div>
    </Modal>
  );
}
