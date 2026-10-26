// Solo interfaz: las paletas deportivas y el informe imprimible conservan sus datos.
export const ANALISIS = {
  fondo: 'var(--ui-compartido-fondo, #0F1419)',
  borde: 'var(--ui-compartido-borde, #2A3548)',
  texto: 'var(--ui-compartido-texto, #F0F2F5)',
  secundario: 'var(--ui-compartido-secundario, #8A9BB8)',
  panel: 'var(--analisis-panel, #151D29)',
  control: 'var(--analisis-control, #202A38)',
  activo: 'var(--analisis-activo, #303B4D)',
  seleccion: 'var(--analisis-seleccion, #3A3522)',
  zonaSeleccion: 'var(--analisis-zona-seleccion, #292719)',
  cabecera: 'var(--analisis-cabecera, linear-gradient(120deg, #202A38 0%, #151D29 70%, #242B30 100%))',
  errorFondo: 'var(--analisis-error-fondo, #351D22)',
  errorBorde: 'var(--analisis-error-borde, #85404B)',
  errorTexto: 'var(--analisis-error-texto, #FFD5DA)',
  exitoFondo: 'var(--analisis-exito-fondo, #203326)',
  exitoBorde: 'var(--analisis-exito-borde, #3B714A)',
  exitoTexto: 'var(--analisis-exito-texto, #D5F5DE)',
}
export function textoAnalisis(color) {
  return ({
    '#F2C230': 'var(--ui-texto-acento, #F2C230)',
    '#4ADE80': 'var(--plantel-exito, #4ADE80)',
    '#F87171': 'var(--plantel-peligro, #F87171)',
    '#60A5FA': 'var(--analisis-azul, #60A5FA)',
  })[color] || color
}
