// Botonera de etiquetado: sale del catálogo configurable (analisis_tipos_accion), no de una lista fija.
// Muestra los tipos visibles en el orden de la tabla. Las teclas siguen guardadas en cada computadora.
import { colorDe } from './catalogoAcciones.js'

// Color de texto legible sobre el fondo del panel para cada token del catálogo.
const TEXTO_POR_TOKEN = {
  acento: 'var(--ui-texto-acento)',
  exito: 'var(--plantel-exito)',
  peligro: 'var(--plantel-peligro)',
  alerta: 'var(--ui-alerta)',
  info: 'var(--analisis-azul)',
  neutro: 'var(--ui-texto-secundario)',
}

export function colorTextoDe(token) {
  return TEXTO_POR_TOKEN[token] || TEXTO_POR_TOKEN.acento
}

// La acción «Gol» no tiene botón propio: la carga el botón «⚽ Gol» del marcador, junto con el gol del resultado.
export const CODIGO_GOL = 'Gol'

// Botones de la botonera: { nombre (código), corto, icono, color, colorTexto }.
// botonera: 'individual' (la de siempre) o 'colectiva' (etapa 1). Un tipo nunca está en las dos.
export function tiposBotonera(catalogo, botonera = 'individual') {
  return (catalogo?.tipos || [])
    .filter((t) => t.visible && t.codigo !== CODIGO_GOL && (t.botonera || 'individual') === botonera)
    .map((t) => ({
      nombre: t.codigo,
      corto: t.etiqueta_boton,
      icono: t.icono || '•',
      color: colorDe(t.color),
      colorTexto: colorTextoDe(t.color),
      grupo: t.grupo,
      duracion: t.duracion_defecto,
    }))
}

// Datos de cualquier tipo (aunque esté oculto en la botonera), para pintar la lista de acciones.
export function aparienciaTipo(catalogo, codigo) {
  const t = catalogo?.porCodigo?.[codigo]
  if (!t) return { icono: '•', color: colorDe('acento'), colorTexto: colorTextoDe('acento') }
  return { icono: t.icono || '•', color: colorDe(t.color), colorTexto: colorTextoDe(t.color) }
}

// Solo los tipos que están en la botonera tienen tecla activa.
export function atajosDeBotonera(atajos, tipos) {
  const nombres = new Set(tipos.map((t) => t.nombre))
  return Object.fromEntries(Object.entries(atajos || {}).filter(([nombre]) => nombres.has(nombre)))
}
