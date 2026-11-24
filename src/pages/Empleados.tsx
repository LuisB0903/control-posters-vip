import { useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import { useQuien } from '../context/AuthContext';
import { Buscador, CabPagina, Icono, Interruptor, Modal, PieFiltros, Pildoras, useUI, Vacio } from '../components/ui';
import { textoDePdf } from '../lib/pdf';
import { parseEmpleados, type EmpleadoLeido } from '../lib/parseEmpleados';
import { guardarEmpleado, importarEmpleados } from '../lib/acciones';
import { contiene } from '../lib/texto';
import { errorTexto } from '../lib/utilidades';
import type { Empleado } from '../types';

const iniciales = (n: string) =>
  n
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('');

export default function Empleados() {
  const d = useData();
  const quien = useQuien();
  const { toast } = useUI();
  const [q, setQ] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [leidos, setLeidos] = useState<EmpleadoLeido[] | null>(null);
  const [desactivarFaltantes, setDesactivarFaltantes] = useState(false);
  const [editar, setEditar] = useState<{ e: Empleado; nuevo: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  const lista = d.empleados.filter((e) => (verInactivos || e.activo) && contiene(e.id + ' ' + e.nombre, q));

  const leer = async (f: File | undefined) => {
    if (!f) return;
    try {
      const texto = await textoDePdf(f);
      const r = parseEmpleados(texto);
      if (!r.length) toast('No se encontraron empleados en ese PDF', 'error');
      else setLeidos(r);
    } catch (e) {
      toast('No se pudo leer el PDF: ' + errorTexto(e), 'error');
    } finally {
      if (archivo.current) archivo.current.value = '';
    }
  };

  const ids = new Set((leidos || []).map((e) => e.id));
  const nuevos = (leidos || []).filter((e) => !d.empleados.some((x) => x.id === e.id));
  const cambiados = (leidos || []).filter((e) => d.empleados.some((x) => x.id === e.id && (x.nombre !== e.nombre || !x.activo)));
  const faltantes = d.empleados.filter((e) => e.activo && !ids.has(e.id));

  const confirmarImport = async () => {
    if (!leidos) return;
    setOcupado(true);
    try {
      await importarEmpleados(quien, leidos, desactivarFaltantes ? faltantes : []);
      toast(leidos.length + ' empleado(s) importado(s)');
      setLeidos(null);
    } catch (e) {
      toast(errorTexto(e), 'error');
    } finally {
      setOcupado(false);
    }
  };

  const activosN = d.empleados.filter((e) => e.activo).length;
  const conApartados = (id: string) => d.apartados.filter((a) => a.empleadoId === id).length;

  return (
    <div>
      <CabPagina
        titulo="Empleados"
        desc="Cinepolitos que pueden apartar material con su ID en el portal."
        acciones={
          <>
            <button className="btn" onClick={() => setEditar({ e: { id: '', nombre: '', activo: true }, nuevo: true })}>
              <Icono n="person_add" /> Agregar
            </button>
            <label className="btn btn-primario">
              <Icono n="upload_file" /> Importar PDF de horarios
              <input ref={archivo} type="file" accept="application/pdf" className="oculto" onChange={(e) => leer(e.target.files ? e.target.files[0] : undefined)} />
            </label>
          </>
        }
      />

      <div className="barra-busqueda">
        <div className="barra-busqueda-fila">
          <Buscador valor={q} onCambio={setQ} placeholder="Buscar por ID o nombre" />
        </div>
        <Pildoras<'activos' | 'todos'>
          etiqueta="Estado"
          valor={verInactivos ? 'todos' : 'activos'}
          onCambio={(v) => setVerInactivos(v === 'todos')}
          opciones={[
            { id: 'activos', texto: 'Activos', cuenta: activosN },
            { id: 'todos', texto: 'Todos (incluye inactivos)', cuenta: d.empleados.length },
          ]}
        />
        <PieFiltros activos={q ? 1 : 0} onLimpiar={() => setQ('')}>
          <b>{lista.length}</b> empleado(s)
        </PieFiltros>
      </div>

      {lista.length === 0 ? (
        <div className="tarjeta">
          {d.empleados.length === 0 ? (
            <Vacio titulo="Aún no hay empleados" icono="badge">
              Importa el PDF del horario semanal (el mismo reporte del sistema) para cargarlos.
            </Vacio>
          ) : (
            <Vacio titulo="Nadie coincide con la búsqueda" icono="search_off">
              Prueba con otro ID o nombre.
            </Vacio>
          )}
        </div>
      ) : (
        <div className="tabla-envoltura tarjetas-movil">
          <table className="tabla">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Estado</th>
                <th className="num">Apartados</th>
                <th>
                  <span className="solo-lector">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id} className={e.activo ? '' : 'fila-inactiva'}>
                  <td className="celda-principal">
                    <span className="celda-material">
                      <span className="persona-avatar" aria-hidden="true">
                        {iniciales(e.nombre)}
                      </span>
                      <span className="celda-persona">
                        <b>{e.nombre}</b>
                        <small>ID {e.id}</small>
                      </span>
                    </span>
                  </td>
                  <td data-etiqueta="Estado">
                    {e.activo ? (
                      <span className="estado-chip estado-chip-entregado">
                        <Icono n="check_circle" /> Activo
                      </span>
                    ) : (
                      <span className="estado-chip estado-chip-no">
                        <Icono n="block" /> Inactivo
                      </span>
                    )}
                  </td>
                  <td data-etiqueta="Apartados" className="num">
                    {conApartados(e.id) || <span className="muted">0</span>}
                  </td>
                  <td className="derecha celda-acciones">
                    <button className="btn btn-chico" onClick={() => setEditar({ e, nuevo: false })}>
                      <Icono n="edit" /> Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        abierto={!!leidos}
        titulo="Importar empleados"
        onCerrar={() => setLeidos(null)}
        ancho={640}
        pie={
          <>
            <button className="btn" onClick={() => setLeidos(null)}>
              Cancelar
            </button>
            <button className="btn btn-primario" onClick={confirmarImport} disabled={ocupado}>
              {ocupado ? 'Importando…' : 'Importar ' + (leidos ? leidos.length : 0)}
            </button>
          </>
        }
      >
        <dl className="cifras cifras-compactas">
          <div>
            <dt>Leídos</dt>
            <dd>{leidos ? leidos.length : 0}</dd>
          </div>
          <div className="cifra-ok">
            <dt>Nuevos</dt>
            <dd>{nuevos.length}</dd>
          </div>
          <div>
            <dt>Con cambios</dt>
            <dd>{cambiados.length}</dd>
          </div>
          <div className={faltantes.length ? 'cifra-alerta' : ''}>
            <dt>No aparecen</dt>
            <dd>{faltantes.length}</dd>
          </div>
        </dl>
        {faltantes.length > 0 && (
          <div className="alerta alerta-info">
            {faltantes.length} empleado(s) activos no aparecen en este PDF (pueden estar de vacaciones).
            <div className="mt">
              <Interruptor activo={desactivarFaltantes} onCambio={setDesactivarFaltantes} etiqueta="Desactivarlos (ya no podrán apartar)" />
            </div>
          </div>
        )}
        <div className="tabla-envoltura" style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table className="tabla">
            <tbody>
              {(leidos || []).map((e) => (
                <tr key={e.id}>
                  <td className="negrita">{e.id}</td>
                  <td>{e.nombre}</td>
                  <td className="derecha">{nuevos.indexOf(e) >= 0 ? <span className="estado-chip estado-chip-entregado">Nuevo</span> : cambiados.indexOf(e) >= 0 ? <span className="estado-chip estado-chip-seleccionado">Cambia</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {editar && (
        <EditarEmpleado
          inicial={editar.e}
          nuevo={editar.nuevo}
          onCerrar={() => setEditar(null)}
          onGuardar={(e) =>
            guardarEmpleado(quien, e, editar.nuevo)
              .then(() => {
                toast('Empleado guardado');
                setEditar(null);
              })
              .catch((er) => toast(errorTexto(er), 'error'))
          }
        />
      )}
    </div>
  );
}

function EditarEmpleado({
  inicial,
  nuevo,
  onCerrar,
  onGuardar,
}: {
  inicial: Empleado;
  nuevo: boolean;
  onCerrar: () => void;
  onGuardar: (e: Empleado) => void;
}) {
  const d = useData();
  const [e, setE] = useState(inicial);
  const existe = nuevo && d.empleados.some((x) => x.id === e.id.trim());
  return (
    <Modal
      abierto
      titulo={nuevo ? 'Agregar empleado' : 'Editar empleado'}
      onCerrar={onCerrar}
      ancho={440}
      pie={
        <>
          <button className="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            className="btn btn-primario"
            disabled={!/^\d{3,10}$/.test(e.id.trim()) || !e.nombre.trim() || existe}
            onClick={() => onGuardar({ ...e, id: e.id.trim() })}
          >
            Guardar
          </button>
        </>
      }
    >
      <div className="pila">
        <label className="campo">
          <span>ID de empleado</span>
          <input value={e.id} disabled={!nuevo} inputMode="numeric" onChange={(x) => setE({ ...e, id: x.target.value.replace(/\D/g, '') })} />
          {existe && <small className="texto-rojo">Ese ID ya existe.</small>}
        </label>
        <label className="campo">
          <span>Nombre completo</span>
          <input value={e.nombre} onChange={(x) => setE({ ...e, nombre: x.target.value })} />
        </label>
        <Interruptor activo={e.activo} onCambio={(v) => setE({ ...e, activo: v })} etiqueta="Activo (puede apartar)" />
      </div>
    </Modal>
  );
}
