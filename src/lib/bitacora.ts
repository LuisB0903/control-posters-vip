/** Ícono y tono de color de cada tipo de movimiento de la bitácora */
export function iconoAccion(accion: string): { i: string; c: string } {
  const a = accion.toLowerCase();
  if (a.indexOf('sugerencia') >= 0) return { i: 'auto_awesome', c: 'rojo' };
  if (a.indexOf('entrega') >= 0) return { i: 'task_alt', c: 'verde' };
  if (a.indexOf('registr') >= 0 || a.indexOf('agregad') >= 0) return { i: 'add_box', c: 'oro' };
  if (a.indexOf('movimiento') >= 0) return { i: 'swap_horiz', c: 'rojo' };
  if (a.indexOf('desech') >= 0 || a.indexOf('elimin') >= 0) return { i: 'delete', c: 'rojo' };
  if (a.indexOf('apartado') >= 0 || a.indexOf('seleccion') >= 0) return { i: 'bookmark', c: 'oro' };
  if (a.indexOf('empleado') >= 0) return { i: 'badge', c: 'verde' };
  return { i: 'history', c: '' };
}
