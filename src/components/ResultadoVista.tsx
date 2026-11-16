import { useState } from "react";
import type {
  Asignacion,
  ConfigGeneral,
  ResultadoSugerencia,
  Ubicacion,
} from "../types";
import { useData } from "../context/DataContext";
import { Icono, Poster } from "./ui";
import { etiquetaUbic } from "../lib/ubicaciones";

interface Grupo {
  clave: string;
  titulo: string;
  sub?: string;
  items: Asignacion[];
}

function agrupar(r: ResultadoSugerencia): Grupo[] {
  const res = (pred: (a: Asignacion) => boolean) => r.asignaciones.filter(pred);
  const resumen = (tipo: Ubicacion["tipo"]) =>
    r.resumen.find((z) => z.zona.tipo === tipo);
  const sub = (tipo: Ubicacion["tipo"]) => {
    const z = resumen(tipo);
    return z ? z.usados + " de " + z.total + " carteleras" : undefined;
  };
  return [
    {
      clave: "taquilla",
      titulo: "Taquilla",
      sub: sub("taquilla"),
      items: res((a) => a.zona.tipo === "taquilla" && a.grupo === "carteleras"),
    },
    {
      clave: "taquilla-st",
      titulo: "Standees en taquilla",
      items: res((a) => a.zona.tipo === "taquilla" && a.grupo === "standees"),
    },
    {
      clave: "lobby",
      titulo: "Lobby",
      sub: sub("lobby"),
      items: res((a) => a.zona.tipo === "lobby" && a.grupo === "carteleras"),
    },
    {
      clave: "lobby-st",
      titulo: "Standees en lobby",
      items: res((a) => a.zona.tipo === "lobby" && a.grupo === "standees"),
    },
    {
      clave: "salas",
      titulo: "Salas",
      items: res((a) => a.zona.tipo === "sala").sort(
        (a, b) => (a.zona.sala || 0) - (b.zona.sala || 0),
      ),
    },
    {
      clave: "p13",
      titulo: "Pasillo 1-3",
      sub: sub("pasillo13"),
      items: res((a) => a.zona.tipo === "pasillo13"),
    },
    {
      clave: "p410",
      titulo: "Pasillo 4-10",
      sub: sub("pasillo410"),
      items: res((a) => a.zona.tipo === "pasillo410"),
    },
  ].filter(
    (g) =>
      g.items.length ||
      g.clave === "taquilla" ||
      g.clave === "p13" ||
      g.clave === "p410",
  );
}

function Lugar({ a }: { a: Asignacion }) {
  return (
    <>{a.zona.tipo === "sala" ? "Sala " + a.zona.sala : etiquetaUbic(a.zona)}</>
  );
}

/** Tarjeta de póster dentro de una zona (pasillos y salas) */
function PosterZona({ a, codigo }: { a: Asignacion; codigo: string }) {
  const d = useData();
  const m = a.materialId ? d.materialPorId.get(a.materialId) : null;
  const img = (m && m.imagenUrl) || a.imagenUrl;
  return (
    <div
      className={
        "zp " +
        (a.tipo === "publicidad"
          ? "publicidad"
          : a.tipo === "vacio"
            ? "vacio"
            : "")
      }
    >
      <div className="poster-envoltura">
        <span className="zp-codigo">{codigo}</span>
        <Poster url={img} alt={a.titulo} />
        {a.version ? (
          <span
            className={"zp-version" + (a.tipo === "publicidad" ? " gris" : "")}
          >
            v{a.version}
            {a.piezaN ? " #" + a.piezaN : ""}
          </span>
        ) : null}
      </div>
      <div className="zp-titulo" title={a.titulo}>
        {a.titulo}
      </div>
      <div className="zp-sub" title={a.notas.join(" · ")}>
        {a.tipo === "publicidad"
          ? "Publicidad del cine"
          : a.tipo === "vacio"
            ? "Sin material"
            : a.notas[0] || "Versión más nueva"}
      </div>
    </div>
  );
}

function ZonaPasillo({
  titulo,
  items,
  total,
  regla,
}: {
  titulo: string;
  items: Asignacion[];
  total: number;
  regla: string;
}) {
  const [todos, setTodos] = useState(false);
  const visibles = todos ? items : items.slice(0, 5);
  const resto = items.length - visibles.length;
  return (
    <div className="zona">
      <div className="zona-cab">
        <div>
          <h3>
            <Icono n="view_column" /> {titulo} ({items.length} de {total}{" "}
            carteleras)
          </h3>
          <p>{regla}</p>
        </div>
        <span className="chip chip-verde chip-caps">
          <Icono n="check" /> Sin duplicados
        </span>
      </div>
      {items.length === 0 ? (
        <p className="muted" style={{ padding: "0 16px 6px" }}>
          Sin carteleras asignadas.
        </p>
      ) : (
        <div className="zona-posters">
          {visibles.map((a, i) => (
            <PosterZona
              key={i}
              a={a}
              codigo={"C-" + (i + 1 < 10 ? "0" : "") + (i + 1)}
            />
          ))}
          {resto > 0 && (
            <button className="zp-mas" onClick={() => setTodos(true)}>
              <Icono n="grid_view" className="ico-24" />
              <b>+{resto}</b>
              <span className="chico">carteleras más</span>
              <span className="chico negrita">
                Ver todas ({items.length}) →
              </span>
            </button>
          )}
          {todos && items.length > 5 && (
            <button className="zp-mas" onClick={() => setTodos(false)}>
              <Icono n="unfold_less" className="ico-24" />
              <span className="chico negrita">Mostrar menos</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ResultadoVista({ r }: { r: ResultadoSugerencia }) {
  const d = useData();
  const cart = r.asignaciones.filter((a) => a.grupo === "carteleras");
  const taquilla = cart.filter((a) => a.zona.tipo === "taquilla");
  const lobby = cart.filter((a) => a.zona.tipo === "lobby");
  const salas = cart
    .filter((a) => a.zona.tipo === "sala")
    .sort((a, b) => (a.zona.sala || 0) - (b.zona.sala || 0));
  const p13 = cart.filter((a) => a.zona.tipo === "pasillo13");
  const p410 = cart.filter((a) => a.zona.tipo === "pasillo410");
  const standees = r.asignaciones.filter((a) => a.grupo === "standees");
  const total = (tipo: string) => {
    const z = r.resumen.find((x) => x.zona.tipo === tipo);
    return z ? z.total : 0;
  };
  const usados = (l: Asignacion[]) =>
    l.filter((a) => a.tipo !== "vacio").length;
  const notasDe = new Map<string, string[]>();
  r.asignaciones.forEach(
    (a) => a.materialId && notasDe.set(a.materialId + "#" + a.piezaN, a.notas),
  );
  const img = (a: Asignacion) => {
    const m = a.materialId ? d.materialPorId.get(a.materialId) : null;
    return (m && m.imagenUrl) || a.imagenUrl;
  };

  return (
    <div>
      <div className="seccion-titulo" style={{ marginTop: 0 }}>
        <div>
          <div className="caps">Paso 4 · Motor ejecutado</div>
          <h2>Matriz de colocación por zonas</h2>
        </div>
        <div className="leyenda">
          <span>
            <i style={{ background: "var(--rojo)" }} /> Taquilla (
            {usados(taquilla)})
          </span>
          <span>
            <i style={{ background: "var(--oro)" }} /> Lobby ({usados(lobby)})
          </span>
          <span>
            <i style={{ background: "var(--verde)" }} /> Pasillos (
            {p13.length + p410.length})
          </span>
        </div>
      </div>

      {r.avisos.length > 0 && (
        <div className="alerta alerta-aviso">
          <strong>Avisos ({r.avisos.length})</strong>
          <ul>
            {r.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="matriz">
        <div className="zona">
          <div className="zona-cab">
            <div>
              <h3>
                <Icono n="local_activity" /> Taquilla principal
              </h3>
              <p>
                {usados(taquilla)} de {total("taquilla")} carteleras asignadas
              </p>
            </div>
            <span className="chip chip-rojo chip-caps">Alta prioridad</span>
          </div>
          <div className="taq-grid">
            {taquilla.map((a, i) => (
              <div
                key={i}
                className={"taq-item" + (a.tipo === "vacio" ? " vacio" : "")}
              >
                <div className="poster-envoltura">
                  <Poster url={img(a)} alt={a.titulo} />
                </div>
                <div className="taq-cuerpo">
                  <div className="fila" style={{ gap: 4 }}>
                    {a.notas.some((n) => n.indexOf("Estreno") >= 0) && (
                      <span className="chip chip-oro">
                        Estreno de la semana
                      </span>
                    )}
                    {a.notas.some((n) => n.indexOf("taquillera") >= 0) && (
                      <span className="chip chip-azul">Taquillera</span>
                    )}
                    {a.notas.some((n) => n.indexOf("Garantía") >= 0) && (
                      <span className="chip chip-solido">Sello Garantía</span>
                    )}
                  </div>
                  <div className="taq-titulo">{a.titulo}</div>
                  <div className="chico muted">
                    {a.version
                      ? "Versión v" + a.version + " · Pieza #" + a.piezaN
                      : a.notas.join(" · ")}
                  </div>
                  <div className="taq-pos">Taquilla #{i + 1}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="zona-col">
          <div className="zona">
            <div className="zona-cab">
              <div>
                <h3>
                  <Icono n="weekend" /> Lobby
                </h3>
                <p>
                  {usados(lobby)} de {total("lobby")} carteleras asignadas
                </p>
              </div>
              <span className="chip chip-oro chip-caps">Prestigio</span>
            </div>
            <div className="taq-grid">
              {lobby.length === 0 && (
                <span className="muted chico">Sin asignaciones.</span>
              )}
              {lobby.map((a, i) => (
                <div
                  key={i}
                  className={"taq-item" + (a.tipo === "vacio" ? " vacio" : "")}
                  style={{ flexDirection: "column", gap: 4 }}
                >
                  <span className="caps texto-oro">
                    {a.tipo === "publicidad"
                      ? "Publicidad del cine"
                      : a.notas[0] || "Próximo estreno"}
                  </span>
                  <span className="taq-titulo">
                    {a.titulo}
                    {a.version ? " v" + a.version : ""}
                  </span>
                  <span className="chico muted">
                    {a.piezaN ? "Pieza #" + a.piezaN : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="zona">
            <div className="zona-cab">
              <div>
                <h3>
                  <Icono n="accessibility_new" /> Standees
                </h3>
                <p>{standees.length} standee(s) asignado(s)</p>
              </div>
              {standees.length > 0 && (
                <span className="chip chip-verde chip-caps">OK</span>
              )}
            </div>
            {standees.length === 0 ? (
              <p className="muted chico" style={{ padding: "0 16px 6px" }}>
                Sin standees para colocar.
              </p>
            ) : (
              <div className="mini-grid">
                {standees.map((a, i) => (
                  <div key={i} className="mini" title={a.notas.join(" · ")}>
                    <Icono
                      n={
                        a.notas.some((n) => n.indexOf("grande") >= 0)
                          ? "accessibility_new"
                          : "view_in_ar"
                      }
                    />
                    <b>{a.titulo}</b>
                    <span className="muted">
                      <Lugar a={a} /> · #{a.piezaN}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {salas.length > 0 && (
        <div className="zona" style={{ marginTop: 16 }}>
          <div className="zona-cab">
            <div>
              <h3>
                <Icono n="chair" /> Salas ({usados(salas)} de {salas.length})
              </h3>
              <p>Una cartelera por sala: su película o publicidad del cine</p>
            </div>
          </div>
          <div className="zona-posters">
            {salas.map((a, i) => (
              <PosterZona key={i} a={a} codigo={"SALA " + a.zona.sala} />
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <ZonaPasillo
          titulo="Pasillo 1-3"
          items={p13}
          total={total("pasillo13")}
          regla="Regla estricta: sin repetir póster en el pasillo · versión más nueva"
        />
      </div>
      <div style={{ marginTop: 16 }}>
        <ZonaPasillo
          titulo="Pasillo 4-10"
          items={p410}
          total={total("pasillo410")}
          regla="Regla estricta: sin repetir póster en el pasillo · versión más nueva"
        />
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-cab">
          <div className="panel-titulo">
            <span className="icono-caja rojo">
              <Icono n="move_up" />
            </span>
            <div>
              <h3>Hoja de movimientos a realizar en piso</h3>
              <p>Primero se retira lo que sale y después se coloca lo nuevo.</p>
            </div>
          </div>
          <span className="chip">{r.movimientos.length} acción(es)</span>
        </div>
        {r.movimientos.length === 0 ? (
          <p className="muted">
            No hay que mover nada: todo ya está en su lugar.
          </p>
        ) : (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Paso</th>
                  <th>Operación</th>
                  <th>Póster y versión</th>
                  <th>Origen</th>
                  <th>Destino</th>
                  <th>Instrucción</th>
                </tr>
              </thead>
              <tbody>
                {r.movimientos.map((mv, i) => {
                  const retira = mv.hacia.tipo === "bodega";
                  const notas =
                    notasDe.get(mv.materialId + "#" + mv.piezaN) || [];
                  const especial = notas.filter(
                    (n) =>
                      n.indexOf("Garantía") >= 0 || n.indexOf("Se usa v") >= 0,
                  );
                  return (
                    <tr key={i}>
                      <td className="negrita">
                        #{(i + 1 < 10 ? "0" : "") + (i + 1)}
                      </td>
                      <td>
                        <span
                          className={
                            "op " + (retira ? "op-retirar" : "op-colocar")
                          }
                        >
                          <Icono n={retira ? "south" : "north"} />{" "}
                          {retira ? "Retirar" : "Colocar"}
                        </span>
                      </td>
                      <td>
                        <div className="negrita">
                          {mv.titulo} v{mv.version}
                        </div>
                        <div className="chico muted">Copia #{mv.piezaN}</div>
                      </td>
                      <td>{etiquetaUbic(mv.desde)}</td>
                      <td>
                        <span
                          className={
                            "destino" +
                            (mv.hacia.tipo === "taquilla" ? " fuerte" : "")
                          }
                        >
                          {etiquetaUbic(mv.hacia)}
                        </span>
                      </td>
                      <td className="chico">
                        {especial.length ? (
                          <span className="texto-oro">
                            {especial.join(" · ")}
                          </span>
                        ) : retira ? (
                          <span className="muted">Guardar en bodega</span>
                        ) : (
                          <span className="muted">{notas[0] || "—"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Hoja imprimible para el equipo que coloca los pósters */
export function HojaColocacion({
  r,
  semana,
  anio,
  config,
}: {
  r: ResultadoSugerencia;
  semana: number;
  anio: number;
  config: ConfigGeneral;
}) {
  const grupos = agrupar(r);
  return (
    <div className="hoja">
      <div className="hoja-cab">
        <div>
          <h1>Colocación de publicidad · Semana {semana}</h1>
          <div>{config.conjunto}</div>
        </div>
        <div style={{ textAlign: "right", fontSize: "9pt" }}>
          Año {anio}
          <br />
          Impreso: {new Date().toLocaleString("es-MX")}
        </div>
      </div>
      {grupos
        .filter((g) => g.items.length)
        .map((g) => (
          <div key={g.clave}>
            <h2>
              {g.titulo} {g.sub ? "(" + g.sub + ")" : ""}
            </h2>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "18pt" }}></th>
                  <th>Material</th>
                  <th style={{ width: "50pt" }}>Pieza</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((a, i) => (
                  <tr key={i}>
                    <td>
                      <span className="casilla" />
                    </td>
                    <td>
                      {a.zona.tipo === "sala"
                        ? "Sala " + a.zona.sala + ": "
                        : ""}
                      <b>
                        {a.titulo}
                        {a.version ? " v" + a.version : ""}
                      </b>
                      {a.tipo === "publicidad" ? " (publicidad del cine)" : ""}
                    </td>
                    <td>{a.piezaN ? "#" + a.piezaN : "—"}</td>
                    <td style={{ fontSize: "9pt" }}>{a.notas.join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      {r.movimientos.length > 0 && (
        <>
          <h2>Movimientos</h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: "18pt" }}></th>
                <th>Material</th>
                <th>Pieza</th>
                <th>Desde</th>
                <th>Hacia</th>
              </tr>
            </thead>
            <tbody>
              {r.movimientos.map((mv, i) => (
                <tr key={i}>
                  <td>
                    <span className="casilla" />
                  </td>
                  <td>
                    {mv.titulo} v{mv.version}
                  </td>
                  <td>#{mv.piezaN}</td>
                  <td>{etiquetaUbic(mv.desde)}</td>
                  <td>
                    <b>{etiquetaUbic(mv.hacia)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {r.avisos.length > 0 && (
        <>
          <h2>Avisos</h2>
          <ul style={{ fontSize: "9.5pt" }}>
            {r.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
