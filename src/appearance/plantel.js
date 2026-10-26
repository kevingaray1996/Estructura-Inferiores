// Paletas de pantalla: los valores alternativos preservan el modo oscuro original.
export const PLANTEL = {
  fondoLista: 'var(--plantel-fondo-lista, #101115)',
  tarjetaLista: 'var(--plantel-tarjeta-lista, #191B21)',
  bordeLista: 'var(--plantel-borde-lista, #2D3038)',
  controlLista: 'var(--plantel-control-lista, #292B32)',
  bordeControl: 'var(--plantel-borde-control, #41434B)',
  separador: 'var(--plantel-separador, #34363F)',
  pista: 'var(--plantel-pista, #30323A)',
  controlInactivo: 'var(--plantel-control-inactivo, #202127)',
  seleccionado: 'var(--plantel-seleccionado, #34363F)',
  bordeSeleccionado: 'var(--plantel-borde-seleccionado, #777984)',
  textoLista: 'var(--plantel-texto-lista, #F4F4F5)',
  textoDetalle: 'var(--plantel-texto-detalle, #E4E4E7)',
  textoControl: 'var(--plantel-texto-control, #D4D4D8)',
  secundarioLista: 'var(--plantel-secundario-lista, #A1A1AA)',
  amarilloLista: 'var(--plantel-amarillo-lista, #F4D21F)',
  textoAmarilloLista: 'var(--plantel-texto-amarillo-lista, #F4D21F)',
  blanco: 'var(--plantel-blanco, #FFFFFF)',
  fondoPerfil: 'var(--plantel-fondo-perfil, #101010)',
  tarjetaPerfil: 'var(--plantel-tarjeta-perfil, #202020)',
  bordePerfil: 'var(--plantel-borde-perfil, #383838)',
  textoPerfil: 'var(--plantel-texto-perfil, #F5F5F5)',
  secundarioPerfil: 'var(--plantel-secundario-perfil, #B8B8B8)',
  tenuePerfil: 'var(--plantel-tenue-perfil, #8A8A8A)',
  amarilloPerfil: 'var(--plantel-amarillo-perfil, #F6C900)',
  textoAmarilloPerfil: 'var(--plantel-texto-amarillo-perfil, #F6C900)',
  amarilloSuave: 'var(--plantel-amarillo-suave, #332B00)',
  fila: 'var(--plantel-fila, #191919)',
  exito: 'var(--plantel-exito, #4ADE80)',
  peligro: 'var(--plantel-peligro, #F87171)',
  aviso: 'var(--plantel-aviso, #FBBF24)',
  informacion: 'var(--plantel-informacion, #7DD3FC)',
  lesion: 'var(--plantel-lesion, #FB923C)',
  errorFondo: 'var(--plantel-error-fondo, #402326)',
  errorTexto: 'var(--plantel-error-texto, #FCA5A5)',
  errorBorde: 'var(--plantel-error-borde, #653337)',
  avisoFondo: 'var(--plantel-aviso-fondo, #29251A)',
  avisoBorde: 'var(--plantel-aviso-borde, #514323)',
  estadoExito: 'var(--plantel-estado-exito, #163627)',
  estadoAviso: 'var(--plantel-estado-aviso, #40351B)',
  estadoNeutro: 'var(--plantel-estado-neutro, #292B32)',
  primario: 'var(--plantel-primario, #4ADE80)',
  sobrePrimario: 'var(--plantel-sobre-primario, #0F1419)',
  cabecera: 'var(--plantel-cabecera, linear-gradient(135deg, #25251F 0%, #171717 60%, #101010 100%))',
  bordeAcento: 'var(--plantel-borde-acento, #F6C90055)',
}

export function textoPlantel(color) {
  const equivalencias = {
    '#4ADE80': PLANTEL.exito, '#F87171': PLANTEL.peligro, '#FBBF24': PLANTEL.aviso,
    '#7DD3FC': PLANTEL.informacion, '#FB923C': PLANTEL.lesion, '#A1A1AA': PLANTEL.secundarioLista,
    '#F4D21F': PLANTEL.textoAmarilloLista, '#F6C900': PLANTEL.textoAmarilloPerfil,
    [PLANTEL.amarilloPerfil]: PLANTEL.textoAmarilloPerfil,
  }
  return equivalencias[color] || color
}

export function fondoEstadoPlantel(color) {
  return ({ '#163627': PLANTEL.estadoExito, '#402326': PLANTEL.errorFondo, '#40351B': PLANTEL.estadoAviso, '#292B32': PLANTEL.estadoNeutro })[color] || color
}

// Las variables CSS no admiten concatenar sufijos hexadecimales de transparencia.
export function tintePlantel(color, alfa) {
  return color.startsWith('var(')
    ? `color-mix(in srgb, ${color} ${parseInt(alfa, 16) / 255 * 100}%, transparent)`
    : color + alfa
}
