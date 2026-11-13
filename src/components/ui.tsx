import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/* ════════════ TEMA CLARO / OSCURO ════════════ */
export function useTema(): [string, () => void] {
  const [tema, setTema] = useState<string>(() => document.documentElement.getAttribute('data-tema') || 'oscuro');
  const alternar = useCallback(() => {
    const nuevo = tema === 'oscuro' ? 'claro' : 'oscuro';
    document.documentElement.setAttribute('data-tema', nuevo);
    try {
      localStorage.setItem('tema', nuevo);
    } catch (e) {
      /* sin almacenamiento */
    }
    setTema(nuevo);
  }, [tema]);
  return [tema, alternar];
}

export function BotonTema() {
  const [tema, alternar] = useTema();
  return (
    <button className="btn-icono" onClick={alternar} title={tema === 'oscuro' ? 'Modo claro' : 'Modo oscuro'} aria-label="Cambiar tema">
      {tema === 'oscuro' ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

/* ════════════ MODAL ════════════ */
export function Modal({
  abierto,
  titulo,
  onCerrar,
  children,
  pie,
  ancho = 560,
}: {
  abierto: boolean;
  titulo: ReactNode;
  onCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: number;
}) {
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', esc);
    document.body.classList.add('sin-scroll');
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.classList.remove('sin-scroll');
    };
  }, [abierto, onCerrar]);
  if (!abierto) return null;
  return createPortal(
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal" style={{ maxWidth: ancho }} role="dialog" aria-modal="true">
        <div className="modal-cab">
          <h3>{titulo}</h3>
          <button className="btn-icono" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-cuerpo">{children}</div>
        {pie && <div className="modal-pie">{pie}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ════════════ AVISOS (TOAST) + CONFIRMAR + IMPRIMIR ════════════ */
type TipoToast = 'ok' | 'error' | 'info';
interface Toast {
  id: number;
  texto: string;
  tipo: TipoToast;
}
interface OpcionesConfirmar {
  titulo: string;
  mensaje: ReactNode;
  aceptar?: string;
  peligro?: boolean;
}
interface UIValor {
  toast: (texto: string, tipo?: TipoToast) => void;
  confirmar: (o: OpcionesConfirmar) => Promise<boolean>;
  imprimir: (contenido: ReactNode) => void;
}
const UICtx = createContext<UIValor>({
  toast: () => {},
  confirmar: async () => false,
  imprimir: () => {},
});

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [conf, setConf] = useState<(OpcionesConfirmar & { resolver: (v: boolean) => void }) | null>(null);
  const [impresion, setImpresion] = useState<ReactNode>(null);
  const contador = useRef(0);

  const toast = useCallback((texto: string, tipo: TipoToast = 'ok') => {
    const id = ++contador.current;
    setToasts((t) => t.concat({ id, texto, tipo }));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tipo === 'error' ? 6000 : 3500);
  }, []);

  const confirmar = useCallback(
    (o: OpcionesConfirmar) => new Promise<boolean>((resolver) => setConf({ ...o, resolver })),
    [],
  );

  const imprimir = useCallback((contenido: ReactNode) => setImpresion(contenido), []);

  useEffect(() => {
    if (!impresion) return;
    const limpiar = () => setImpresion(null);
    const t = setTimeout(() => {
      window.addEventListener('afterprint', limpiar, { once: true });
      window.print();
    }, 250);
    return () => clearTimeout(t);
  }, [impresion]);

  const cerrarConf = (v: boolean) => {
    if (conf) conf.resolver(v);
    setConf(null);
  };

  const raizImpresion = document.getElementById('print-root');

  return (
    <UICtx.Provider value={{ toast, confirmar, imprimir }}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={'toast toast-' + t.tipo}>
            {t.texto}
          </div>
        ))}
      </div>
      <Modal
        abierto={!!conf}
        titulo={conf ? conf.titulo : ''}
        onCerrar={() => cerrarConf(false)}
        ancho={440}
        pie={
          <>
            <button className="btn" onClick={() => cerrarConf(false)}>
              Cancelar
            </button>
            <button className={'btn ' + (conf && conf.peligro ? 'btn-peligro' : 'btn-primario')} onClick={() => cerrarConf(true)}>
              {(conf && conf.aceptar) || 'Aceptar'}
            </button>
          </>
        }
      >
        <div className="texto-confirmar">{conf ? conf.mensaje : null}</div>
      </Modal>
      {impresion && raizImpresion ? createPortal(impresion, raizImpresion) : null}
    </UICtx.Provider>
  );
}

export function useUI() {
  return useContext(UICtx);
}

/* ════════════ PIEZAS PEQUEÑAS ════════════ */
export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="cargando">
      <span className="spinner" /> {texto}
    </div>
  );
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="vacio">
      <div className="vacio-icono">🎞️</div>
      <strong>{titulo}</strong>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function Poster({ url, alt, chico }: { url: string | null; alt: string; chico?: boolean }) {
  const [fallo, setFallo] = useState(false);
  return (
    <div className={'poster' + (chico ? ' poster-chico' : '')}>
      {url && !fallo ? (
        <img src={url} alt={alt} loading="lazy" onError={() => setFallo(true)} />
      ) : (
        <div className="poster-vacio">
          <span>{alt.slice(0, 2).toUpperCase()}</span>
        </div>
      )}
    </div>
  );
}

export function Interruptor({
  activo,
  onCambio,
  etiqueta,
  deshabilitado,
}: {
  activo: boolean;
  onCambio: (v: boolean) => void;
  etiqueta?: ReactNode;
  deshabilitado?: boolean;
}) {
  return (
    <label className={'interruptor' + (deshabilitado ? ' deshabilitado' : '')}>
      <input type="checkbox" checked={activo} disabled={deshabilitado} onChange={(e) => onCambio(e.target.checked)} />
      <span className="interruptor-pista">
        <span className="interruptor-bola" />
      </span>
      {etiqueta && <span>{etiqueta}</span>}
    </label>
  );
}

export function Pestanas<T extends string>({
  opciones,
  valor,
  onCambio,
}: {
  opciones: { id: T; etiqueta: ReactNode }[];
  valor: T;
  onCambio: (v: T) => void;
}) {
  return (
    <div className="pestanas">
      {opciones.map((o) => (
        <button key={o.id} className={'pestana' + (o.id === valor ? ' activa' : '')} onClick={() => onCambio(o.id)}>
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}
