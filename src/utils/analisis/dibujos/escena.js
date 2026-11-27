// Qué se ve en un instante del clip: objetos visibles con su posición (los que siguen a una jugadora), efectos,
// subtítulo, zoom de cámara y (versión 3) flechas que crecen, reflector, foco en una zona, opciones de pase, zonas que
// se mueven, línea defensiva y cámara lenta. Lógica pura; la capa de dibujo solo pinta lo que devuelve.
import { aCancha, distanciaMetros, medidasCancha } from './calibracion.js'
import { esSeguimiento } from './formato.js'
import { posicionEn, recorrido } from './interpolacion.js'
import { DESPLIEGUE_ZONA, ENCENDIDO_REFLECTOR, SECUENCIA_PASE, edadEn, progresoFlecha, salidaSuave } from './animacion.js'
import { aVideo, centroide, focoZonaEn, formaEn, medidasEntreLineas, medidasZona, poligonoEntreLineas } from './zonas.js'
import { lineaDefensivaEn } from './lineaDefensiva.js'
import { lentoEn } from './lentos.js'

export const DURACION_ENTRADA = 0.45
export const DURACION_RASTRO = 1.5
export const RAMPA_ZOOM = 0.6
// Los que oscurecen el resto se pintan primero (abajo de todo).
const VELOS = ['foco', 'foco_zona', 'reflector']

export const visibleEn = (obj, t) => t >= obj.desde && t <= obj.hasta

// Rebote de entrada: arranca chico, se pasa un poco y vuelve a su tamaño.
export function rebote(u) {
  if (u <= 0) return 0
  if (u >= 1) return 1
  const c1 = 1.70158, c3 = c1 + 1
  return 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2
}

const suave = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u))

function escalaDe(obj, edad) {
  let escala = 1
  if (obj.efectos?.entrada) escala *= rebote(edad / DURACION_ENTRADA)
  if (obj.efectos?.pulso) escala *= 1 + 0.08 * Math.sin(2 * Math.PI * 1.2 * edad)
  return escala
}

// Zoom de cámara en t: { escala, origen: {x, y} } o null. Entra y sale suave (RAMPA_ZOOM segundos).
export function zoomEn(dibujo, t) {
  const z = (dibujo?.objetos || []).find((o) => o.tipo === 'zoom' && visibleEn(o, t))
  if (!z) return null
  const rampa = Math.min(RAMPA_ZOOM, (z.hasta - z.desde) / 2)
  const f = suave(Math.min((t - z.desde) / rampa, (z.hasta - t) / rampa, 1))
  const seguido = z.seguir ? dibujo.objetos.find((o) => o.id === z.seguir) : null
  const origen = (seguido && posicionEn(seguido.pista.claves, t)) || z.objetivo
  const escala = 1 + (z.escala - 1) * f
  return escala > 1.001 ? { escala, origen } : null
}

export function subtituloEn(dibujo, t) {
  return (dibujo?.subtitulos || []).find((s) => t >= s.desde && t < s.hasta)?.texto || ''
}

// Posición en t de un participante de «Opciones de pase»: la jugadora seguida o el punto marcado.
function posicionParticipante(p, porId, t) {
  const seguido = p.seguir ? porId.get(p.seguir) : null
  return (seguido?.pista && posicionEn(seguido.pista.claves, t)) || p.punto
}

// Posición en t de una jugadora seguida (por id), o null.
function posicionDe(porId, id, t) {
  const o = porId.get(id)
  return o?.pista ? posicionEn(o.pista.claves, t) : null
}

// Elementos para pintar en t. Cada uno: { obj, posicion?, escala, rastro?, a?, b?, ... }.
// elegidoId: en el editor se ve también el objeto elegido fuera de su tiempo (tenue). animar: false en el editor
// (sin rebote ni pulso ni crecimiento, para ver cada objeto entero al dibujar). pausa: { t, transcurrido } de la pausa
// en curso (las animaciones siguen mientras el video está congelado).
export function escenaEn(dibujo, t, { elegidoId = null, animar = true, pausa = null } = {}) {
  const objetos = dibujo?.objetos || []
  const pausas = dibujo?.pausas || []
  const porId = new Map(objetos.map((o) => [o.id, o]))
  const elementos = []
  for (const obj of objetos) {
    if (obj.tipo === 'zoom' || obj.tipo === 'ficha') continue // la ficha solo se ve en la pizarra 2D
    const visible = visibleEn(obj, t)
    if (!visible && obj.id !== elegidoId) continue
    const anima = visible && animar
    const edad = anima ? edadEn(pausas, obj.desde, t, pausa) : Infinity
    const base = { obj, fuera: !visible, escala: anima ? escalaDe(obj, edad) : 1 }
    if (esSeguimiento(obj.tipo)) {
      base.posicion = posicionEn(obj.pista.claves, t)
      if (obj.efectos?.rastro && visible) {
        base.rastro = recorrido(obj.pista.claves, Math.max(obj.desde, t - DURACION_RASTRO), t, 1 / 20)
      }
      if (obj.tipo === 'reflector') base.encendido = anima ? salidaSuave(edad / ENCENDIDO_REFLECTOR) : 1
    } else if (obj.tipo === 'enlace') {
      const a = porId.get(obj.a), b = porId.get(obj.b)
      if (!a || !b) continue
      base.a = posicionEn(a.pista.claves, t)
      base.b = posicionEn(b.pista.claves, t)
      if (!base.a || !base.b) continue
      // Con la cancha calibrada, la línea muestra la distancia en metros.
      const metros = distanciaMetros(aCancha(dibujo, t, base.a), aCancha(dibujo, t, base.b))
      if (metros !== null) base.metros = metros
    } else if (obj.crecer) {
      base.progreso = anima ? progresoFlecha(obj, t, edad) : 1
    } else if (obj.tipo === 'zona' || obj.tipo === 'poligono') {
      base.puntos = formaEn(obj, t)
      Object.assign(base, extrasZona(dibujo, obj, t, base.puntos, anima ? edad : Infinity))
    } else if (obj.tipo === 'zona_lineas') {
      const posA = obj.lineaA.map((id) => posicionDe(porId, id, t)), posB = obj.lineaB.map((id) => posicionDe(porId, id, t))
      base.puntos = poligonoEntreLineas(posA, posB)
      if (base.puntos.length < 3) continue
      Object.assign(base, extrasZona(dibujo, obj, t, base.puntos, anima ? edad : Infinity, () => medidasEntreLineas(dibujo, t, posA, posB)))
    } else if (obj.tipo === 'foco_zona') {
      base.forma = focoZonaEn(obj, t)
      base.encendido = anima ? salidaSuave(edad / ENCENDIDO_REFLECTOR) : 1
    } else if (obj.tipo === 'opciones_pase') {
      base.pasadora = posicionParticipante(obj.pasadora, porId, t)
      base.receptora = posicionParticipante(obj.receptora, porId, t)
      const sec = SECUENCIA_PASE
      const en = (inicio, dur) => (anima ? salidaSuave((edad - inicio) / dur) : 1)
      base.progresoPase = en(0, sec.pase)
      base.opciones = obj.opciones.map((o, i) => ({
        posicion: posicionParticipante(o, porId, t), numero: i + 1,
        progreso: obj.secuencia ? en(sec.primera + i * sec.entre, sec.crecer) : en(0, sec.pase),
      }))
    } else if (obj.tipo === 'linea_defensiva') {
      const cancha = medidasCancha(dibujo.cancha)
      const jugadoras = obj.jugadoras.map((id) => {
        const video = posicionDe(porId, id, t)
        return video ? { id, video, metros: aCancha(dibujo, t, video) } : null
      }).filter(Boolean)
      if (jugadoras.length < 2) continue
      base.linea = lineaDefensivaEn(jugadoras, obj, (m) => aVideo(dibujo, t, m))
      base.cancha = cancha
      base.aparicion = anima ? salidaSuave(edad / DESPLIEGUE_ZONA) : 1
    }
    elementos.push(base)
  }
  // Los velos (foco, foco en una zona, reflector) van primero (oscurecen todo lo de abajo); después lo demás en su orden.
  elementos.sort((x, y) => (VELOS.includes(x.obj.tipo) ? 0 : 1) - (VELOS.includes(y.obj.tipo) ? 0 : 1))
  const lento = lentoEn(dibujo?.lentos, t)
  return { elementos, subtitulo: subtituloEn(dibujo, t), zoom: zoomEn(dibujo, t), lento: lento ? lento.velocidad : null }
}

// Texto, metros y efectos de una zona en t.
function extrasZona(dibujo, obj, t, puntos, edad, medir = null) {
  const extra = { centro: centroide(puntos) }
  if (obj.medidas) { const m = medir ? medir() : medidasZona(dibujo, t, obj.tipo === 'zona' ? esquinas(puntos) : puntos); if (m) extra.medidas = m }
  if (obj.efectos?.despliegue) extra.despliegue = Number.isFinite(edad) ? salidaSuave(edad / DESPLIEGUE_ZONA) : 1
  if (obj.efectos?.pulso) extra.pulso = Number.isFinite(edad) ? 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.8 * edad) : 0.5
  return extra
}

// Las cuatro esquinas de una zona rectangular (dos puntos opuestos).
export function esquinas([a, b]) {
  return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]
}

// Transformación CSS del contenedor del video para el zoom: se agranda alrededor del punto, sin mostrar bordes negros.
export function transformZoom(zoom) {
  if (!zoom) return { transform: 'none', transformOrigin: '50% 50%' }
  return {
    transform: `scale(${zoom.escala.toFixed(4)})`,
    transformOrigin: `${(zoom.origen.x * 100).toFixed(2)}% ${(zoom.origen.y * 100).toFixed(2)}%`,
  }
}

// ¿El clip tiene algo para mostrar? (ícono ✎ y fila «Dibujos»)
export const tieneDibujos = (dibujo) => Boolean(dibujo && (dibujo.objetos?.length || dibujo.pausas?.length || dibujo.subtitulos?.length || dibujo.lentos?.length))

