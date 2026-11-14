// Modelo de escena: qué hay en la cancha y dónde, en metros, independiente de cómo se dibuja.
// Hoy lo consume el dibujo SVG (PizarraCancha); el video (etapa K) y una futura vista 3D usan el mismo modelo,
// así cambiar de motor de dibujo no toca el documento ni la animación.
//
// Coordenadas: x a lo largo de la cancha, y a lo ancho, z hacia arriba (altura), todo en metros, origen en la
// esquina de la superficie. Rotación en grados alrededor del eje z.
import { LINEAS, PALETA, SUPERFICIES } from './pizarra.js'

// Capas de dibujo, de abajo hacia arriba. Un motor 3D las puede ignorar (usa z) o respetar para superposiciones.
export const CAPAS = { zona: -1, linea: 0, material: 1, jugadora: 2, pelota: 3, texto: 4 }

function capa(tipo) {
  if (tipo === 'sombra') return CAPAS.zona
  if (LINEAS.includes(tipo)) return CAPAS.linea
  if (tipo === 'jugadora') return CAPAS.jugadora
  if (tipo === 'pelota') return CAPAS.pelota
  if (tipo === 'texto') return CAPAS.texto
  return CAPAS.material
}

// Equipo de una jugadora según su color (hasta el formato v2, donde cada ficha se vincula a una jugadora o rival).
export function equipo(e) {
  if (e.tipo !== 'jugadora') return null
  return e.color.toLowerCase() === PALETA.rival.toLowerCase() ? 'rival' : 'propio'
}

// `alturas`: { id: metros } opcional (por ejemplo, la pelota en un pase alto). Por defecto todo está en el piso.
export function escena(doc, poses, alturas = {}) {
  const [ancho, largo] = SUPERFICIES[doc.superficie]
  const objetos = doc.elementos.map((e, orden) => {
    const p = poses[e.id]
    if (!p) return null
    return { id: e.id, tipo: e.tipo, equipo: equipo(e), capa: capa(e.tipo), orden,
      x: p.x * ancho / 100, y: p.y * largo / 100, z: alturas[e.id] || 0, rotacion: p.rotacion, elemento: e }
  }).filter(Boolean)
  // Orden estable de dibujo: por capa y, dentro de la capa, en el orden en que se crearon.
  objetos.sort((a, b) => a.capa - b.capa || a.orden - b.orden)
  return { superficie: doc.superficie, ancho, largo, orientacion: doc.orientacion, ataque: doc.ataque, objetos }
}
