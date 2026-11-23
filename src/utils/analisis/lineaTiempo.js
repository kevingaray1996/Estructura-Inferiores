// Línea de tiempo de Análisis (etapa 1): filas por tipo colectivo con barras de inicio a fin, una fila de eventos
// individuales (puntos) y las marcas de los tiempos. Cuentas puras (sin React) para poder probarlas.
import { reglasDe } from './catalogoAcciones.js'

// Zoom: segundos visibles. null = el partido entero.
export const ZOOMS = Object.freeze([
  { id: 'todo', texto: 'Todo', segundos: null },
  { id: '10m', texto: '10 min', segundos: 600 },
  { id: '2m', texto: '2 min', segundos: 120 },
  { id: '30s', texto: '30 s', segundos: 30 },
])

// Duración del eje: la del video si se sabe; si no, lo último marcado más un margen.
export function duracionEje({ duracionVideo, momentos = [], eventos = [], marcas = {} } = {}) {
  const d = Number(duracionVideo)
  if (Number.isFinite(d) && d > 0) return Math.ceil(d)
  const ultimos = [
    ...momentos.map((m) => Number(m.segundo_fin ?? m.segundo)),
    ...eventos.map((e) => Number(e.segundo)),
    ...Object.values(marcas || {}).map(Number),
  ].filter(Number.isFinite)
  return Math.max(60, ...ultimos.map((s) => s + 60))
}

// Ventana visible: centrada en `centro` con el ancho del zoom, sin salirse de [0, duración].
export function ventanaVisible(centro, zoomSegundos, duracion) {
  if (!zoomSegundos || zoomSegundos >= duracion) return { desde: 0, hasta: duracion }
  const desde = Math.min(Math.max(0, Number(centro) - zoomSegundos / 2), duracion - zoomSegundos)
  return { desde, hasta: desde + zoomSegundos }
}

// Posición (0 a 100 %) de un segundo dentro de la ventana, y al revés.
export function porcentajeDe(segundo, { desde, hasta }) {
  return ((Number(segundo) - desde) / Math.max(1e-9, hasta - desde)) * 100
}
export function segundoDePorcentaje(porcentaje, { desde, hasta }) {
  return desde + (Number(porcentaje) / 100) * (hasta - desde)
}

// Color del punto de un evento individual: 'correcta' (verde), 'incorrecta' (rojo) o 'neutra'.
const CORRECTOS = new Set(['Exitoso', 'Gol'])
const INCORRECTOS = new Set(['Fallido', 'Fuera', 'Bloqueado'])
export function estadoPunto(evento, catalogo) {
  const reglas = reglasDe(catalogo, evento?.tipo)
  const resultado = evento?.resultado || reglas.resultado_implicito
  if (CORRECTOS.has(resultado)) return 'correcta'
  if (INCORRECTOS.has(resultado)) return 'incorrecta'
  if (reglas.color === 'exito') return 'correcta'
  if (reglas.color === 'peligro') return 'incorrecta'
  return 'neutra'
}

// Filas de la línea: una por tipo colectivo con marcas (en el orden del catálogo), y los eventos individuales.
export function filasLinea({ momentos = [], individuales = [], catalogo }) {
  const porTipo = new Map()
  for (const m of momentos) {
    if (!porTipo.has(m.tipo)) porTipo.set(m.tipo, [])
    porTipo.get(m.tipo).push(m)
  }
  const orden = (codigo) => reglasDe(catalogo, codigo).orden ?? 0
  const filas = [...porTipo.entries()]
    .sort(([a], [b]) => orden(a) - orden(b) || a.localeCompare(b))
    .map(([codigo, lista]) => {
      const reglas = reglasDe(catalogo, codigo)
      return {
        codigo,
        etiqueta: reglas.etiqueta,
        color: reglas.color,
        barras: lista
          .map((m) => ({ ...m, inicio: Number(m.segundo), fin: Number(m.segundo_fin ?? m.segundo) }))
          .sort((a, b) => a.inicio - b.inicio),
      }
    })
  const puntos = individuales
    .map((e) => ({ ...e, estado: estadoPunto(e, catalogo) }))
    .sort((a, b) => Number(a.segundo) - Number(b.segundo))
  return { filas, puntos }
}

// ---------- Arrastre ----------

// Nuevo inicio y fin al arrastrar. modo: 'inicio' (borde izquierdo), 'fin' (borde derecho) o 'mover' (la barra entera).
// delta en segundos. El fin nunca queda antes del inicio (se deja al menos `minimo` segundos) y nada sale del video.
export function ajustarArrastre(original, modo, delta, { duracion = Infinity, minimo = 1 } = {}) {
  const inicio = Number(original.segundo), fin = Number(original.segundo_fin ?? original.segundo)
  const d = Math.round(Number(delta) || 0)
  const tope = Number.isFinite(duracion) ? Math.max(duracion, fin) : Infinity
  if (modo === 'inicio') {
    return { segundo: Math.min(Math.max(0, inicio + d), Math.max(0, fin - minimo)), segundo_fin: fin }
  }
  if (modo === 'fin') {
    return { segundo: inicio, segundo_fin: Math.max(Math.min(fin + d, tope), inicio + minimo) }
  }
  const largo = fin - inicio
  const nuevoInicio = Math.min(Math.max(0, inicio + d), Number.isFinite(tope) ? tope - largo : Infinity)
  return { segundo: nuevoInicio, segundo_fin: nuevoInicio + largo }
}

// Segundo al que salta el video mientras se arrastra: el borde que se mueve (o el inicio si se mueve la barra).
export function segundoDeArrastre(ajuste, modo) {
  return modo === 'fin' ? ajuste.segundo_fin : ajuste.segundo
}
