import { useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import { useQuien } from '../context/AuthContext';
import { Interruptor, Modal, useUI, Vacio } from '../components/ui';
import { textoDePdf } from '../lib/pdf';
import { parseEmpleados, type EmpleadoLeido } from '../lib/parseEmpleados';
import { guardarEmpleado, importarEmpleados } from '../lib/acciones';
import { contiene } from '../lib/texto';
import { errorTexto } from '../lib/utilidades';
import type { Empleado } from '../types';

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

  return (
    <div>
      <div className="cabecera">
        <div>
          <h1>Empleados</h1>
          <p>Cinepolitos que pueden apartar pósters con su ID. {d.empleados.filter((e) => e.activo).length} activos.</p>
        </div>
        <div className="acciones">
          <label className="btn btn-primario">
            Importar desde PDF de horarios
            <input ref={archivo} type="file" accept="application/pdf" className="oculto" onChange={(e) => leer(e.target.files ? e.target.files[0] : undefined)} />
          </label>
          <button className="btn" onClick={() => setEditar({ e: { id: '', nombre: '', activo: true }, nuevo: true })}>
            + Agregar
          </button>
        </div>
      </div>

      <div className="tarjeta mb fila">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por ID o nombre…" style={{ maxWidth: 360 }} />
        <Interruptor activo={verInactivos} onCambio={setVerInactivos} etiqueta="Ver inactivos" />
      </div>

      {lista.length === 0 ? (
        <div className="tarjeta">
          <Vacio titulo="Sin empleados">Importa el PDF del horario semanal (el mismo reporte del sistema) para cargarlos.</Vacio>
        </div>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Apartados</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id}>
                  <td className="negrita">{e.id}</td>
                  <td>{e.nombre}</td>
                  <td>{e.activo ? <span className="chip chip-verde">Activo</span> : <span className="chip">Inactivo</span>}</td>
                  <td>{d.apartados.filter((a) => a.empleadoId === e.id).length}</td>
                  <td className="derecha">
                    <button className="btn btn-chico" onClick={() => setEditar({ e, nuevo: false })}>
                      Editar
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
        <p>
          Se leyeron <b>{leidos ? leidos.length : 0}</b> empleados: <b>{nuevos.length}</b> nuevos y <b>{cambiados.length}</b> con cambios.
        </p>
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
                  <td>{nuevos.indexOf(e) >= 0 ? <span className="chip chip-verde">Nuevo</span> : cambiados.indexOf(e) >= 0 ? <span className="chip chip-acento">Cambia</span> : null}</td>
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
          {existe && <small style={{ color: 'var(--rojo)' }}>Ese ID ya existe.</small>}
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
