// Atajos de teclado del etiquetado de Análisis. Las teclas de cada acción se guardan en esta computadora
// (localStorage); no se guardan en la base.

export const CLAVE_ATAJOS = 'analisis_atajos_v1'

// Teclas fijas (no se pueden asignar a una acción).
export const TECLAS_FIJAS = [
  { tecla: 'Espacio', accion: 'Pausa / sigue' },
  { tecla: '←', accion: '5 segundos atrás' },
  { tecla: '→', accion: '5 segundos adelante' },
  { tecla: 'Ctrl + Z', accion: 'Deshacer la última acción marcada' },
  { tecla: '?', accion: 'Mostrar los atajos' },
]
const RESERVADAS = new Set([' ', '?', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'enter', 'escape', 'tab'])

export const ATAJOS_POR_DEFECTO = Object.freeze({
  'Pase correcto': '+',
  'Pase incorrecto': '-',
  'Pérdida': 'p',
  'Recuperación': 'r',
  'Remate': 't',
  'Centro': 'c',
  'Duelo ofensivo': 'o',
  'Duelo defensivo': 'd',
  'Duelo aéreo': 'a',
  'Atajada': 'k',
  'Salida de arquera': 's',
  'Gol': 'g',
  'Falta cometida': 'f',
  'Falta recibida': 'n',
  'Intercepción': 'i',
  'Despeje': 'e',
})

// Tecla de un evento de teclado, en minúscula. null si lleva Ctrl/Alt/Cmd (no es un atajo de acción).
export function teclaDeEvento(evento) {
  if (!evento || evento.ctrlKey || evento.metaKey || evento.altKey) return null
  const k = String(evento.key || '')
  return k.length === 1 ? k.toLowerCase() : k.toLowerCase()
}

// Texto para mostrar la tecla en el botón y en la ayuda.
export function mostrarTecla(tecla) {
  if (!tecla) return ''
  if (tecla === '-') return '−'
  return tecla.length === 1 ? tecla.toUpperCase() : tecla
}

// true si el foco está en un lugar donde las teclas tienen que escribir (campo de texto, selector, editable).
export function escribiendoEnCampo(elemento) {
  if (!elemento) return false
  const etiqueta = String(elemento.tagName || '').toUpperCase()
  if (etiqueta === 'TEXTAREA' || etiqueta === 'SELECT') return true
  if (elemento.isContentEditable) return true
  if (etiqueta === 'INPUT') {
    const tipo = String(elemento.type || 'text').toLowerCase()
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image'].includes(tipo)
  }
  return false
}

// Valida una tecla nueva para una acción. Devuelve { ok: true } o { ok: false, motivo }.
export function validarAtajo(tecla, accion, mapa) {
  const t = String(tecla || '').toLowerCase()
  if (!t || t.length !== 1) return { ok: false, motivo: 'Elegí una sola tecla (una letra, un número o un signo).' }
  if (RESERVADAS.has(t)) return { ok: false, motivo: 'Esa tecla ya se usa para controlar el video o la ayuda.' }
  const ocupada = Object.entries(mapa).find(([otra, valor]) => otra !== accion && valor === t)
  if (ocupada) return { ok: false, motivo: `Esa tecla ya es de «${ocupada[0]}». Cambiala ahí primero.`, ocupadaPor: ocupada[0] }
  return { ok: true }
}

function almacenDeLaVentana() {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

export function leerAtajos(almacen = almacenDeLaVentana()) {
  try {
    const guardado = JSON.parse(almacen?.getItem(CLAVE_ATAJOS) || 'null')
    if (!guardado || typeof guardado !== 'object') return { ...ATAJOS_POR_DEFECTO }
    const mapa = {}
    const usadas = new Set()
    for (const [accion, tecla] of Object.entries(guardado)) {
      const t = typeof tecla === 'string' ? tecla.toLowerCase() : ''
      if (t.length === 1 && !RESERVADAS.has(t) && !usadas.has(t)) { mapa[accion] = t; usadas.add(t) }
    }
    return mapa
  } catch {
    return { ...ATAJOS_POR_DEFECTO }
  }
}

export function guardarAtajos(mapa, almacen = almacenDeLaVentana()) {
  try { almacen?.setItem(CLAVE_ATAJOS, JSON.stringify(mapa)); return true } catch { return false }
}

// Acción que corresponde a una tecla (o undefined).
export function accionDeTecla(mapa, tecla) {
  return Object.keys(mapa).find((accion) => mapa[accion] === tecla)
}
