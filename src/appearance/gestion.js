import { COLORES } from '../theme'

// Solo presentación: no cambiar los colores de los datos utilizados al exportar.
export const BOTON_GESTION = {
  backgroundColor: 'var(--gestion-primario-fondo, #97C459)',
  color: 'var(--gestion-primario-texto, #1A1A18)',
}

export function textoGestion(color) {
  if (color === COLORES.acento) return 'var(--ui-texto-acento, #F2C230)'
  if (color === '#7DD3FC') return 'var(--gestion-info, #7DD3FC)'
  if (color === '#FB923C') return 'var(--gestion-aviso, #FB923C)'
  return color
}

export function textoSobreEstado(color) {
  return color === COLORES.acento || color === '#7DD3FC' || color === '#FB923C'
    ? 'var(--gestion-estado-claro-texto, #1A1A18)'
    : 'var(--gestion-estado-texto, #1A1A18)'
}
