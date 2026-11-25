// Ayudas del editor de dibujos: qué hace cada herramienta, qué hacer ahora (línea arriba del video), las dos guías
// paso a paso y el modo seguimiento. Lógica pura y textos, para poder revisarlos y probarlos.
import { HERRAMIENTAS, moverTiempo } from './editor.js'

// ---------- Qué hace cada herramienta (al pasar el mouse o mantener apretado) ----------
export const DESCRIPCIONES = Object.freeze({
  seleccionar: 'tocá un dibujo para elegirlo y arrastralo para moverlo. Para corregir algo que ya dibujaste.',
  pase_bajo: 'flecha recta. Para pases a ras del piso.',
  pase_alto: 'flecha curva con sombra en el piso. Para pases elevados o centros.',
  movimiento: 'flecha punteada que dibujás a mano alzada. Para una conducción o un desmarque.',
  linea: 'línea recta sin punta. Para marcar una línea defensiva o una distancia.',
  zona: 'rectángulo transparente. Para marcar un espacio libre o una zona de presión.',
  poligono: 'zona transparente con la forma que quieras, esquina por esquina. Para espacios que no son rectangulares.',
  texto: 'un texto corto sobre el video. Para una aclaración puntual.',
  anillo: 'elipse bajo los pies que sigue a la jugadora. Para mostrar quién es la protagonista de la jugada.',
  foco: 'oscurece todo menos un círculo alrededor de la jugadora y la sigue. Para que se mire solo a ella.',
  nombre: 'cartel con el dorsal y el nombre (con foto si es nuestra) que sigue a la jugadora. Para identificarla.',
  enlace: 'une a dos jugadoras ya seguidas y se estira y se acorta con ellas. Para mostrar una distancia o una marca.',
  zoom: 'acerca la imagen hacia un punto o una jugadora y después vuelve al plano general. Para destacar un detalle.',
  pausa: 'congela el video en este cuadro unos segundos (3 si no lo cambiás) y después sigue solo. Para explicar una situación.',
  paso: 'texto abajo del video desde este momento. Para contar la jugada por partes.',
})

// Las dos acciones rápidas de la barra (no son herramientas: actúan en el cuadro actual).
export const ACCIONES_RAPIDAS = Object.freeze([
  { id: 'pausa', tecla: 'P', texto: 'Pausa', icono: '⏸' },
  { id: 'paso', tecla: 'S', texto: 'Paso con subtítulo', icono: '≡' },
])

// Nombre corto de cada herramienta para la ayuda.
const NOMBRES = Object.freeze({
  seleccionar: 'Elegir y mover', pase_bajo: 'Pase por bajo', pase_alto: 'Pase por alto', movimiento: 'Movimiento', linea: 'Línea',
  zona: 'Zona rectangular', poligono: 'Zona libre', texto: 'Texto', anillo: 'Anillo', foco: 'Foco', nombre: 'Nombre y dorsal',
  enlace: 'Línea entre dos jugadoras', zoom: 'Zoom de cámara', pausa: 'Pausa', paso: 'Paso con subtítulo',
})

// { nombre, tecla, descripcion, texto } — texto: «Pase por alto (tecla A): flecha curva con sombra en el piso. …»
export function ayudaHerramienta(id) {
  const h = HERRAMIENTAS.find((x) => x.id === id) || ACCIONES_RAPIDAS.find((x) => x.id === id)
  if (!h) return null
  const nombre = NOMBRES[id]
  const descripcion = DESCRIPCIONES[id]
  const frase = descripcion.charAt(0).toUpperCase() + descripcion.slice(1)
  return { nombre, tecla: h.tecla, descripcion: frase, texto: `${nombre} (tecla ${h.tecla}): ${descripcion}` }
}

// ---------- Qué hacer ahora (línea arriba del video) ----------
const QUE_DIBUJA = { pase_bajo: 'el pase', pase_alto: 'el pase', linea: 'la línea' }
export const TEXTO_SEGUIMIENTO = 'Tocá a la jugadora. Cada toque guarda su posición y adelanta el video solo. Enter para terminar.'

const reloj = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0').replace('.', ',')}`

// fueraDeTiempo: { desde, hasta } del dibujo elegido cuando no se ve en el momento actual (se muestra punteado).
export function instruccion({ herramienta, borrador = null, enlacePendiente = null, vistaPrevia = false, fueraDeTiempo = null }) {
  if (vistaPrevia) return 'Vista previa: así lo ve el cuerpo técnico. Espacio o Esc para volver a editar.'
  if (fueraDeTiempo && !borrador) {
    return `El dibujo elegido no se ve en este momento (aparece de ${reloj(fueraDeTiempo.desde)} a ${reloj(fueraDeTiempo.hasta)}). Lo ves punteado solo para encontrarlo.`
  }
  if (QUE_DIBUJA[herramienta]) {
    return borrador?.esperando
      ? `Ahora hacé clic donde termina ${QUE_DIBUJA[herramienta]}.`
      : `Hacé clic donde empieza ${QUE_DIBUJA[herramienta]} y después donde termina (o arrastrá).`
  }
  switch (herramienta) {
    case 'seleccionar': return 'Tocá un dibujo para elegirlo. Arrastralo para moverlo.'
    case 'zona': return borrador?.esperando ? 'Ahora hacé clic en la esquina opuesta.' : 'Hacé clic en una esquina de la zona y después en la esquina opuesta (o arrastrá).'
    case 'movimiento': return 'Mantené apretado y dibujá el recorrido; soltá donde termina.'
    case 'poligono': {
      const n = borrador?.tipo === 'poligono' ? borrador.puntos.length : 0
      return n ? `Seguí marcando esquinas (van ${n}). Enter o clic en el primer punto para cerrarla; Esc para cancelar.` : 'Hacé clic en cada esquina de la zona.'
    }
    case 'texto': return 'Hacé clic donde va el texto y escribilo ahí mismo. Enter para terminar, Esc para cancelar.'
    case 'enlace': return enlacePendiente ? 'Ahora tocá la otra jugadora.' : 'Tocá una jugadora seguida (con anillo, foco o nombre).'
    case 'zoom': return 'Hacé clic hacia donde querés acercar la cámara.'
    case 'anillo': case 'foco': case 'nombre': return TEXTO_SEGUIMIENTO
    default: return ''
  }
}

// ---------- Guías paso a paso ----------
// objetivo: el elemento que se marca con un recuadro (atributo data-guia). Si no está en pantalla, el texto va al centro.
export const GUIA_EDITOR = Object.freeze([
  { objetivo: 'herramientas', titulo: 'Herramientas', texto: 'Acá elegís qué dibujar: pases, movimientos, zonas, textos y herramientas que siguen a una jugadora. Pasá el mouse por cada una para ver qué hace. Cada una tiene su tecla.' },
  { objetivo: 'video', titulo: 'El video del clip', texto: 'Dibujás directo sobre la imagen. Con ← → avanzás o retrocedés de a 0,1 s (cuadro a cuadro) y con Espacio reproducís. Arriba del video siempre dice qué hacer con la herramienta elegida.' },
  { objetivo: 'propiedades', titulo: 'Propiedades', texto: 'Cuando elegís un dibujo, acá cambiás su color, su grosor y cuándo aparece y desaparece dentro del clip. Para borrar un dibujo, elegilo y apretá Supr.' },
  { objetivo: 'pasos', titulo: 'Pasos con subtítulo', texto: 'Partí la jugada en pasos: cada paso es un texto que se ve abajo del video durante un tramo. Se agregan con la tecla S o con el botón de esta sección.' },
  { objetivo: 'linea', titulo: 'Línea de tiempo del clip', texto: 'Una fila por dibujo: la barra muestra cuándo se ve (arrastrá sus bordes para cambiarlo). Los rombos son las pausas y los puntos clave de las jugadoras seguidas.' },
  { objetivo: 'vista-previa', titulo: 'Vista previa', texto: 'Reproduce el clip con los dibujos, las pausas y los subtítulos, tal cual lo va a ver el cuerpo técnico.' },
  { objetivo: 'pegar', titulo: 'Pegar en la línea de tiempo', texto: 'Guarda los dibujos y vuelve a Análisis. El clip queda con el ícono ✎ y se ve con sus dibujos en la línea de tiempo y en las playlists. Esta guía se vuelve a ver con el botón «?».' },
])

export const GUIA_SEGUIMIENTO = Object.freeze([
  { objetivo: 'video', titulo: 'Seguir a una jugadora', texto: 'Tocá a la jugadora en el video, a la altura de los pies. Ese toque guarda dónde está en este momento.' },
  { objetivo: 'seguimiento', titulo: 'El video avanza solo', texto: 'Después de cada toque, el video adelanta un poco. Volvé a tocarla donde quedó: así la vas siguiendo mientras se mueve, sin usar las flechas.' },
  { objetivo: 'salto', titulo: 'Cuánto adelanta', texto: 'Elegí 0,2 s si se mueve rápido o cambia de dirección, y 1 s si va derecho. Con ← → podés ir a otro cuadro sin marcar nada.' },
  { objetivo: 'contador', titulo: 'Puntos marcados', texto: 'Cuántas veces la tocaste. El punto anterior queda marcado tenue en el video para que sigas el recorrido. Si te equivocás, Ctrl+Z borra el último punto y vuelve el video a ese momento.' },
  { objetivo: 'listo', titulo: 'Terminar', texto: 'Con «Listo» o Enter terminás y se reproduce la Vista previa. La app une los puntos con un movimiento suave.' },
  { objetivo: 'propiedades', titulo: 'Ajustes de la jugadora seguida', texto: 'En Propiedades elegís el color y los efectos (rebote, pulso, sombra, rastro) y, en «Nombre y dorsal», quién es. Para la «Línea entre dos jugadoras», primero seguí a las dos y después unilas.' },
])

// Guía de la calibración de la cancha (etapa 5): la primera vez que se calibra, y con «?».
export const GUIA_CALIBRACION = Object.freeze([
  { objetivo: 'cal-medidas', titulo: 'Medidas de la cancha', texto: 'Poné el largo y el ancho de esta cancha en metros. Si no las sabés, dejá 100 × 64: se pueden cambiar después y valen para todo el partido.' },
  { objetivo: 'cal-cancha', titulo: 'Elegí un punto de la cancha', texto: 'En la cancha chica, tocá un punto que se vea en el video: una esquina del área, el punto penal, el centro, la mitad de cancha con el lateral, un banderín… Ojo con los lados: IZQ. es el arco que se ve a la izquierda del video y arriba es el lateral más lejos de la cámara. Al elegir un punto, su mitad se resalta.' },
  { objetivo: 'video', titulo: 'Marcalo en el video', texto: 'Después hacé clic en el video justo donde está ese punto. Repetí con al menos 4 puntos bien separados, que no estén todos sobre la misma línea.' },
  { objetivo: 'cal-lista', titulo: 'Revisá que coincida', texto: 'Con 4 puntos aparecen las líneas de la cancha en amarillo sobre el video. Si no coinciden con las líneas reales, tocá «Corregir» en el punto que está mal y volvé a marcarlo. Con 5 o más puntos, la app te avisa cuál parece mal marcado.' },
  { objetivo: 'cal-recalibrar', titulo: 'Si la cámara se mueve', texto: 'Si la cámara se mueve en el clip, andá al cuadro donde cambió y tocá «Recalibrar en este cuadro». Se copian los puntos y corregís solo los que se movieron. Cada momento usa la calibración más cercana.' },
  { objetivo: 'cal-listo', titulo: 'Listo', texto: 'Tocá «Listo» para ver la jugada en la pizarra 2D. Para ver esta guía otra vez, tocá «?».' },
])

// Avanza la guía: 'siguiente' | 'anterior' | 'saltar'. Devuelve el índice nuevo, o null si la guía terminó.
export function moverGuia(indice, accion, total) {
  if (accion === 'saltar') return null
  if (accion === 'anterior') return Math.max(0, indice - 1)
  return indice + 1 >= total ? null : indice + 1
}

// ---------- Preferencias guardadas en este navegador ----------
export const CLAVE_GUIA_EDITOR = 'analisis_dibujo_guia_v1'
export const CLAVE_GUIA_SEGUIMIENTO = 'analisis_dibujo_guia_seguimiento_v1'
export const CLAVE_SALTO = 'analisis_dibujo_salto_v1'
export const CLAVE_GUIA_CALIBRACION = 'analisis_dibujo_guia_calibracion_v1'
export const CLAVE_FICHAS_2D = 'analisis_pizarra2d_fichas_v1' // 'dorsal' | 'foto'

export function leerPreferencia(clave, almacen = typeof window === 'undefined' ? null : window.localStorage) {
  try { return almacen?.getItem(clave) ?? null } catch { return null }
}

export function guardarPreferencia(clave, valor, almacen = typeof window === 'undefined' ? null : window.localStorage) {
  try { almacen?.setItem(clave, String(valor)) } catch { /* Sin preferencia guardada: la guía puede volver a aparecer. */ }
}

// ---------- Modo seguimiento ----------
export const SALTOS = Object.freeze([0.2, 0.5, 1])
export const SALTO_POR_DEFECTO = 0.5

export function saltoGuardado(valor) {
  const n = Number(valor)
  return valor !== null && SALTOS.includes(n) ? n : SALTO_POR_DEFECTO
}

// Después de marcar en t: a qué tiempo adelanta el video (o null si ya está en el fin del clip).
export function siguienteCuadro(t, salto, clip) {
  const destino = moverTiempo(t, salto, clip)
  return destino > t ? destino : null
}

// Ctrl+Z en modo seguimiento: saca el último toque ({ t, n }) y dice a cuál volver (su t es el momento del video).
export function deshacerToque(marcas) {
  if (!marcas?.length) return { marcas: [], volverA: null }
  return { marcas: marcas.slice(0, -1), volverA: marcas[marcas.length - 1] }
}

// Punto clave anterior al cuadro actual (se muestra tenue para seguir el recorrido).
export function claveAnterior(claves, t) {
  let previa = null
  for (const c of claves || []) if (c.t < t - 0.02) previa = c
  return previa
}
