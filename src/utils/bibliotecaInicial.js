// Set inicial de Cancha (etapa D): cinco jugadas comunes, cada una en su carpeta. Gimnasio arranca vacío.
// Se cargan desde la Biblioteca con un botón (no hace falta SQL) y nunca se duplican: se saltean las que ya existen.
import { PALETA, validarPizarra } from './pizarra.js'

const base = { color: PALETA.local, tinta: PALETA.tinta, tamano: 3, grosor: .4, dx: 15, dy: 0, curva: 0, texto: '', numero: '' }
const propia = (id, numero) => ({ ...base, id, tipo: 'jugadora', numero, vinculo: null })
const rival = (id, numero) => ({ ...base, id, tipo: 'jugadora', numero, color: PALETA.rival, tinta: PALETA.tintaClara, vinculo: null })
const pelota = id => ({ ...base, id, tipo: 'pelota', color: PALETA.pelota, tamano: 2 })
const sombra = (id, puntos) => ({ ...base, id, tipo: 'sombra', color: PALETA.sombra, puntos })

// `pasos`: [{ nombre, texto, pase, foco, pausa, duracion, ocultos, poses: { id: [x, y] } }]. Cada paso hereda las
// posiciones del anterior para lo que no menciona.
function armar({ superficie = 'completa', ataque = 'derecha', elementos, pasos }) {
  let previas = {}
  const doc = {
    version: 2, superficie, orientacion: 'horizontal', ataque, bucle: false, velocidad: 1, recorrido: 'suave', placa: { titulo: '', analista: '' }, elementos,
    pasos: pasos.map((p, i) => {
      const poses = { ...previas }
      for (const [id, [x, y]] of Object.entries(p.poses || {})) poses[id] = { x, y, rotacion: 0 }
      previas = poses
      return { id: `p${i + 1}`, nombre: p.nombre, duracion: p.duracion ?? 2, texto: p.texto || '', pausa: p.pausa ?? 0, pase: p.pase || 'bajo', foco: p.foco || null, ocultos: p.ocultos || [], poses }
    }),
  }
  return validarPizarra(doc)
}

export const SET_INICIAL = [
  {
    contenido: 'Salida con 3', carpeta: 'Salida', duracion_minutos: 15, cantidad_jugadores: 8, objetivo: 'Salida limpia desde el arco',
    descripcion: 'La 5 baja entre centrales para formar línea de 3; los laterales suben y la central abierta progresa conduciendo.',
    pizarra: armar({
      elementos: [propia('a1', '1'), propia('a2', '2'), propia('a6', '6'), propia('a4', '4'), propia('a3', '3'), propia('a5', '5'), rival('r9', '9'), rival('r10', '10'), pelota('b')],
      pasos: [
        { nombre: 'Inicio', texto: 'Arquera con pelota; las centrales abren', pausa: 1, poses: { a1: [5, 50], a2: [15, 32], a6: [15, 68], a4: [26, 88], a3: [26, 12], a5: [30, 50], r9: [38, 42], r10: [38, 60], b: [7.6, 50] } },
        { nombre: 'Línea de 3', texto: 'La 5 baja entre centrales: salida con 3', poses: { a5: [15, 50], a2: [18, 24], a6: [18, 76], a4: [36, 90], a3: [36, 10], r9: [30, 45] } },
        { nombre: 'Pase', texto: 'Pase a la central abierta', poses: { b: [20.6, 24] } },
        { nombre: 'Conducción', texto: 'Conduce y busca a la lateral', poses: { a2: [30, 22], b: [32.6, 22], r10: [34, 40] } },
      ],
    }),
  },
  {
    contenido: 'Salida con lateral por dentro', carpeta: 'Salida', duracion_minutos: 15, cantidad_jugadores: 8, objetivo: 'Superar la primera línea de presión',
    descripcion: 'La lateral se mete por dentro para recibir entre líneas; la extrema fija afuera y recibe el pase siguiente.',
    pizarra: armar({
      elementos: [propia('a1', '1'), propia('a2', '2'), propia('a6', '6'), propia('a4', '4'), propia('a7', '7'), propia('a5', '5'), rival('r7', '7'), rival('r8', '8'), pelota('b')],
      pasos: [
        { nombre: 'Inicio', texto: 'La central derecha con pelota', pausa: 1, poses: { a1: [5, 50], a2: [16, 35], a6: [18, 70], a4: [28, 88], a7: [48, 94], a5: [28, 50], r7: [34, 78], r8: [38, 58], b: [20.6, 70] } },
        { nombre: 'Por dentro', texto: 'La lateral se mete por dentro', poses: { a4: [33, 66], a7: [50, 92], r7: [30, 76] } },
        { nombre: 'Pase', texto: 'Pase a la lateral entre líneas', poses: { b: [35.6, 66] } },
        { nombre: 'Extrema', texto: 'Descarga a la extrema que fijó afuera', poses: { b: [52.6, 92], a4: [36, 64] } },
      ],
    }),
  },
  {
    contenido: 'Presión alta', carpeta: 'Presión', duracion_minutos: 20, cantidad_jugadores: 10, objetivo: 'Recuperar en campo rival',
    descripcion: 'Presión tras pase al central rival: la 9 tapa el pase a la arquera, la extrema salta al central y las volantes cierran por dentro.',
    pizarra: armar({
      elementos: [rival('r1', '1'), rival('r2', '2'), rival('r6', '6'), rival('r5', '5'), propia('a9', '9'), propia('a7', '7'), propia('a11', '11'), propia('a8', '8'), propia('a10', '10'), pelota('b'),
        sombra('z', [{ x: -8, y: -12 }, { x: 8, y: -12 }, { x: 8, y: 12 }, { x: -8, y: 12 }])],
      pasos: [
        { nombre: 'Inicio', texto: 'Arquera rival con pelota', pausa: 1, ocultos: ['z'], poses: { r1: [95, 50], r2: [85, 32], r6: [85, 68], r5: [74, 50], a9: [70, 50], a7: [66, 22], a11: [66, 78], a8: [58, 40], a10: [58, 60], b: [92.4, 50], z: [84, 70] } },
        { nombre: 'Pase al central', texto: 'Pase al central: señal para presionar', poses: { b: [82.4, 68] } },
        { nombre: 'Presión', texto: 'La 9 tapa el pase atrás, la 11 salta y la 10 cierra por dentro', foco: 'a11', poses: { a9: [86, 58], a11: [80, 72], a10: [72, 58], a8: [66, 46], r5: [76, 52] } },
      ],
    }),
  },
  {
    contenido: 'Córner a favor', carpeta: 'ABP ofensiva', duracion_minutos: 15, cantidad_jugadores: 10, objetivo: 'Rematar al segundo palo',
    descripcion: 'Centro pasado al segundo palo: la 4 ataca el espacio libre mientras la 9 arrastra marca al primer palo.',
    pizarra: armar({
      superficie: 'media', ataque: 'izquierda',
      elementos: [propia('a10', '10'), propia('a9', '9'), propia('a4', '4'), propia('a6', '6'), rival('r1', '1'), rival('r2', '2'), rival('r3', '3'), rival('r5', '5'), pelota('b'),
        sombra('z', [{ x: -5, y: -9 }, { x: 6, y: -9 }, { x: 6, y: 9 }, { x: -5, y: 9 }])],
      pasos: [
        { nombre: 'Inicio', texto: 'Córner desde la izquierda', pausa: 1, ocultos: ['z'], poses: { a10: [2, 3], b: [3, 6], a9: [26, 36], a4: [28, 60], a6: [22, 70], r1: [3, 50], r2: [10, 40], r3: [10, 58], r5: [16, 50], z: [9, 64] } },
        { nombre: 'Desmarques', texto: 'La 9 arrastra al primer palo; la 4 ataca el segundo', poses: { a9: [9, 38], a4: [16, 62], r2: [8, 40] } },
        { nombre: 'Centro', texto: 'Centro pasado al segundo palo', pase: 'alto', foco: 'a4', duracion: 2.2, poses: { a4: [10, 64], b: [12, 64] } },
      ],
    }),
  },
  {
    contenido: 'Córner en contra', carpeta: 'ABP defensiva', duracion_minutos: 15, cantidad_jugadores: 10, objetivo: 'Defender el área chica en zona',
    descripcion: 'Defensa mixta: tres en zona en el área chica y marcas a las rematadoras rivales; despeje hacia afuera.',
    pizarra: armar({
      superficie: 'media', ataque: 'derecha',
      elementos: [propia('a1', '1'), propia('a2', '2'), propia('a6', '6'), propia('a4', '4'), propia('a5', '5'), rival('r10', '10'), rival('r9', '9'), rival('r4', '4'), pelota('b'),
        sombra('z', [{ x: -4, y: -14 }, { x: 4, y: -14 }, { x: 4, y: 14 }, { x: -4, y: 14 }])],
      pasos: [
        { nombre: 'Inicio', texto: 'Tres en zona en el área chica', pausa: 1, poses: { a1: [2, 50], a2: [7, 40], a6: [7, 52], a4: [7, 64], a5: [20, 56], r10: [2, 97], b: [3.5, 94], r9: [24, 44], r4: [26, 62], z: [6, 52] } },
        { nombre: 'Centro', texto: 'Centro al área: la 5 sigue a su marca', pase: 'alto', duracion: 2.2, poses: { b: [10, 54], r4: [12, 58], a5: [12, 54], a6: [9, 54] } },
        { nombre: 'Despeje', texto: 'Despeje hacia afuera', pase: 'alto', poses: { b: [40, 30] } },
      ],
    }),
  },
]

// Carga en la Biblioteca las jugadas del set que falten (por nombre). Devuelve cuántas cargó.
export async function cargarSetInicial(supabase, carpetas, existentes) {
  const nombres = new Set(existentes.filter(e => e.ambito === 'cancha').map(e => (e.contenido || '').trim().toLowerCase()))
  let cargadas = 0
  for (const j of SET_INICIAL) {
    if (nombres.has(j.contenido.toLowerCase())) continue
    const carpeta = carpetas.find(c => c.ambito === 'cancha' && c.nombre === j.carpeta)
    const { error } = await supabase.rpc('guardar_ejercicio_pizarra', { p_id: null, p_revision: null, p_datos: {
      ambito: 'cancha', tipo: 'jugada', carpeta_id: carpeta?.id || null, contenido: j.contenido, descripcion: j.descripcion, objetivo: j.objetivo,
      duracion_minutos: j.duracion_minutos, cantidad_jugadores: j.cantidad_jugadores, pizarra: j.pizarra, pizarra_miniatura: '' } })
    if (error) throw error
    cargadas++
  }
  return cargadas
}
export const faltantesSetInicial = existentes => {
  const nombres = new Set(existentes.filter(e => e.ambito === 'cancha').map(e => (e.contenido || '').trim().toLowerCase()))
  return SET_INICIAL.filter(j => !nombres.has(j.contenido.toLowerCase())).length
}
