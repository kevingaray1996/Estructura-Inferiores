// Estilos de pantalla; reutilizan las variables del proveedor de apariencia.
export const PARTIDOS = {
  fondo: 'var(--ui-compartido-fondo, #0F1419)',
  superficie: 'var(--ui-compartido-superficie, #1A2332)',
  borde: 'var(--ui-compartido-borde, #2A3548)',
  texto: 'var(--ui-compartido-texto, #F0F2F5)',
  secundario: 'var(--ui-compartido-secundario, #8A9BB8)',
  tenue: 'var(--ui-compartido-tenue, #5B6B85)',
  fila: 'var(--partidos-fila, #151D2A)',
  primario: 'var(--partidos-primario, #4ADE80)',
  sobrePrimario: 'var(--partidos-sobre-primario, #0F1419)',
  exito: 'var(--plantel-exito, #4ADE80)',
  peligro: 'var(--plantel-peligro, #F87171)',
  aviso: 'var(--plantel-aviso, #FBBF24)',
  informacion: 'var(--gestion-info, #7DD3FC)',
}

export function textoPartido(color) {
  return ({ '#FBBF24': PARTIDOS.aviso, '#F87171': PARTIDOS.peligro, '#8A9BB8': PARTIDOS.secundario })[color] || color
}
