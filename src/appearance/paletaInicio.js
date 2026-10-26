// Superficies y textos adaptables; colores originales como respaldo para oscuro.
export const PALETA_INICIO = {
  fondo: 'var(--inicio-fondo, #101010)',
  tarjeta: 'var(--inicio-tarjeta, #1B1B1B)',
  tarjetaHover: 'var(--inicio-tarjeta-hover, #232323)',
  borde: 'var(--inicio-borde, #303030)',
  amarillo: '#F6C900',
  amarilloSuave: 'var(--inicio-amarillo-suave, #332B00)',
  blanco: 'var(--inicio-texto, #FAFAFA)',
  gris: 'var(--inicio-secundario, #B5B5B5)',
  tenue: 'var(--inicio-tenue, #858585)',
  verde: '#72C58B',
  rojo: '#F07171',
}

// Se mantienen los hex originales para fondos con transparencia; solo los textos
// de estado necesitan un tono mas oscuro sobre superficies claras.
export function textoInicio(color) {
  const variables = {
    '#F6C900': '--inicio-texto-acento',
    '#72C58B': '--inicio-texto-exito',
    '#F07171': '--inicio-texto-peligro',
    '#EF9F27': '--inicio-texto-aviso',
  }
  return variables[color] ? `var(${variables[color]}, ${color})` : color
}
