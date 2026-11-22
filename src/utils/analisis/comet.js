// Lector del «Informe del partido» de COMET (AFA). Lógica pura: recibe los textos del PDF con su posición
// (textosDelPdf, en cometPdf.js) y arma los datos del partido.
//
// El PDF viene en dos columnas (izquierda: equipo local; derecha: visitante). En GOLES, TARJETAS y SUSTITUCIONES el
// equipo no está escrito: sale de la columna. Los nombres largos se cortan en dos renglones.
// No se leen los datos de las médicas (RESUMEN DEL PARTIDO) ni quién imprimió el PDF (encabezado y pie).
import { NOMBRE_CLUB } from '../../config/club.js'

// «Ávila Ñandú, Ana» → «AVILA NANDU, ANA»: así se guardan y se comparan los nombres de COMET.
export function normalizarNombre(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim()
}
const clave = (t) => normalizarNombre(t).replace(/[^A-Z0-9/ ]/g, '').trim()

// «90+4'» → { valor: 90, extra: 4 }. null si no es un minuto.
export function leerMinutoComet(texto) {
  const m = String(texto ?? '').trim().replace(/[’´`]/g, "'").match(/^(\d{1,3})\s*(?:\+\s*(\d{1,2}))?\s*'$/)
  return m ? { valor: Number(m[1]), extra: Number(m[2] || 0) } : null
}
export const textoMinutoComet = (m) => (m ? `${m.valor}${m.extra ? `+${m.extra}` : ''}'` : '')

// Íconos del PDF (fuente de íconos): caracteres de uso privado que no son texto.
const limpiar = (t) => String(t ?? '').replace(/[-]/g, '').replace(/\s+/g, ' ').trim()
const esDorsal = (t) => /^\d{1,2}$/.test(t)

const TITULOS = [
  ['OFICIALES DE PARTIDO', 'oficiales'],
  ['ALINEACIONES', 'alineaciones'],
  ['SUBSTITUCIONES', 'suplentes'],
  ['SUSTITUCIONES', 'cambios'],
  ['CUERPO TECNICO', 'tecnico'],
  ['GOLES', 'goles'],
  ['DISCIPLINARIO', 'disciplina'],
  ['RESUMEN DEL PARTIDO', 'resumen'],
]
// Seccion de un título centrado (o null). «SUBSTITUCIONES» dentro de las alineaciones son las suplentes; después,
// los cambios.
function seccionDeTitulo(texto, actual) {
  const t = clave(texto)
  if (/^TARJETAS? /.test(t) || /^EXPULSION/.test(t)) return /ROJA|EXPULSION|SEGUNDA|DOBLE/.test(t) ? 'tarjetas_roja' : 'tarjetas_amarilla'
  const encontrado = TITULOS.find(([titulo]) => t === titulo)
  if (!encontrado) return null
  if (encontrado[1] === 'suplentes' || encontrado[1] === 'cambios') return actual === 'alineaciones' ? 'suplentes' : 'cambios'
  return encontrado[1]
}

// «GOMEZ, LAURA INES (CIUDAD)» → { nombre: 'GOMEZ, LAURA INES', localidad: 'CIUDAD' }.
function persona(texto) {
  const limpio = limpiar(texto).replace(/^:\s*/, '')
  if (!limpio) return null
  const m = limpio.match(/^(.*?)\s*\(([^)]*)\)\s*$/)
  return m ? { nombre: m[1].trim(), localidad: m[2].trim() } : { nombre: limpio, localidad: '' }
}

// «9 NUEVE, GOLEADORA LOCAL» → { dorsal: 9, nombre: 'NUEVE, GOLEADORA LOCAL' }.
function dorsalYNombre(texto) {
  const m = limpiar(texto).match(/^(\d{1,2})\s+(.+)$/)
  return m ? { dorsal: Number(m[1]), nombre: m[2].trim() } : { dorsal: null, nombre: limpiar(texto) }
}

// «19.04.2026 14:00 ART» → { fecha: '2026-04-19', hora: '14:00' }.
function fechaHora(texto) {
  const m = String(texto || '').match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (!m) return { fecha: null, hora: null }
  return { fecha: `${m[3]}-${m[2]}-${m[1]}`, hora: m[4] ? `${m[4].padStart(2, '0')}:${m[5]}` : null }
}

const mismoRenglon = (a, b) => Math.abs(a.y - b.y) <= 4

// textos: [{ pagina, x, y, ancho, texto, anchoPagina, altoPagina }] con y de arriba hacia abajo.
// Devuelve los datos del partido; lanza un Error con un mensaje en castellano si el PDF no es de COMET.
export function leerComet(textos) {
  const items = (textos || [])
    .map((t) => ({ ...t, texto: limpiar(t.texto) }))
    .filter((t) => t.texto && t.y > 30 && t.y < (t.altoPagina || 842) - 25)
    .sort((a, b) => a.pagina - b.pagina || a.y - b.y || a.x - b.x)
  if (!items.some((t) => clave(t.texto) === 'ALINEACIONES') || !items.some((t) => /^Informe del partido$/i.test(t.texto))) {
    throw new Error('Este PDF no parece un «Informe del partido» de COMET. Bajalo de nuevo desde COMET y probá otra vez.')
  }

  // Cada texto con su sección y su columna (0: local, 1: visitante).
  let seccion = 'cabecera'
  const porSeccion = {}
  for (const t of items) {
    const mitad = (t.anchoPagina || 596) / 2
    const centrado = t.x > mitad * 0.6 && t.x + t.ancho < mitad * 1.4
    const nueva = centrado ? seccionDeTitulo(t.texto, seccion) : null
    if (nueva) { seccion = nueva; continue }
    // «JUGADO» y la firma de la árbitra cierran el informe.
    if (clave(t.texto) === 'JUGADO') { seccion = 'fin'; continue }
    t.columna = t.x < mitad ? 0 : 1
    t.inicioColumna = t.columna === 0 ? 0 : mitad;
    (porSeccion[seccion] ||= []).push(t)
  }

  const datos = {
    version: 1,
    torneo: '', fecha: null, hora: null, estadio: '', numero_fecha: '', numero_partido: '',
    local: { nombre: '', goles: null }, visitante: { nombre: '', goles: null }, propio: null,
    oficiales: { arbitra: null, asistente1: null, asistente2: null, cuarta: null },
    alineaciones: { local: [], visitante: [] },
    goles: [], tarjetas: [], cambios: [],
  }

  // Cabecera: torneo, equipos y resultado, fecha y hora, estadio, número de fecha y de partido.
  const cabecera = porSeccion.cabecera || []
  const titulo = cabecera.findIndex((t) => /^Informe del partido$/i.test(t.texto))
  if (titulo >= 0 && cabecera[titulo + 1]) datos.torneo = cabecera[titulo + 1].texto
  const marcador = cabecera.find((t) => /^\d+\s*:\s*\d+$/.test(t.texto))
  if (marcador) {
    const [gl, gv] = marcador.texto.split(':').map((n) => Number(n.trim()))
    const equipos = cabecera.filter((t) => mismoRenglon(t, marcador) && t !== marcador && !/^(N\/A|J|AR)$/.test(t.texto))
    const izquierda = equipos.filter((t) => t.x < marcador.x).sort((a, b) => b.x - a.x)[0]
    const derecha = equipos.filter((t) => t.x > marcador.x).sort((a, b) => a.x - b.x)[0]
    datos.local = { nombre: izquierda?.texto || '', goles: gl }
    datos.visitante = { nombre: derecha?.texto || '', goles: gv }
  }
  const valor = (etiqueta) => {
    const e = cabecera.find((t) => clave(t.texto) === clave(etiqueta))
    if (!e) return ''
    const siguiente = cabecera.filter((t) => mismoRenglon(t, e) && t.x > e.x && /:$/.test(t.texto)).sort((a, b) => a.x - b.x)[0]
    return cabecera.filter((t) => mismoRenglon(t, e) && t.x > e.x && (!siguiente || t.x < siguiente.x))
      .sort((a, b) => a.x - b.x).map((t) => t.texto).join(' ').trim()
  }
  Object.assign(datos, fechaHora(valor('Fecha/Hora:')))
  datos.estadio = valor('Estadio:')
  datos.numero_fecha = valor('Fecha:')
  datos.numero_partido = valor('Número de partido:')

  const club = clave(NOMBRE_CLUB)
  if (clave(datos.local.nombre).includes(club)) datos.propio = 'local'
  else if (clave(datos.visitante.nombre).includes(club)) datos.propio = 'visitante'
  else throw new Error(`Este PDF es de ${datos.local.nombre || '¿?'} contra ${datos.visitante.nombre || '¿?'}: no es un partido de ${NOMBRE_CLUB}.`)

  // Oficiales: «Árbitro», «1° árbitro asistente», «2° árbitro asistente», «Cuarto árbitro».
  const oficiales = porSeccion.oficiales || []
  const ROLES = [[/^ARBITRO$/, 'arbitra'], [/^1 ARBITRO ASISTENTE$/, 'asistente1'], [/^2 ARBITRO ASISTENTE$/, 'asistente2'], [/^CUARTO ARBITRO$/, 'cuarta']]
  const etiquetas = oficiales.map((t) => ({ t, rol: ROLES.find(([re]) => re.test(clave(t.texto).replace(/\s+/g, ' ')))?.[1] })).filter((e) => e.rol)
  for (const { t, rol } of etiquetas) {
    const fin = etiquetas.filter((o) => o.t !== t && mismoRenglon(o.t, t) && o.t.x > t.x).sort((a, b) => a.t.x - b.t.x)[0]?.t.x ?? Infinity
    const texto = oficiales.filter((o) => mismoRenglon(o, t) && o.x > t.x && o.x < fin && !etiquetas.some((e) => e.t === o))
      .sort((a, b) => a.x - b.x).map((o) => o.texto).join(' ')
    datos.oficiales[rol] = persona(texto)
  }

  // Alineaciones: renglones que empiezan con el dorsal; AR (arquera) y CP (capitana). Minutos e íconos se ignoran.
  const lado = (columna) => (columna === 0 ? 'local' : 'visitante')
  for (const [nombreSeccion, titular] of [['alineaciones', true], ['suplentes', false]]) {
    for (const columna of [0, 1]) {
      const enColumna = (porSeccion[nombreSeccion] || []).filter((t) => t.columna === columna)
      const filas = enColumna.filter((t) => esDorsal(t.texto) && t.x - t.inicioColumna < 30)
      const jugadoras = filas.map((f) => ({ dorsal: Number(f.texto), nombre: '', ar: false, cp: false, titular, _fila: f }))
      for (const t of enColumna) {
        if (filas.includes(t)) continue
        if (leerMinutoComet(t.texto) || /^[\d,'+]+$/.test(t.texto.replace(/\s/g, ''))) continue
        // Su renglón o, si el nombre se cortó en dos renglones, el renglón de arriba más cercano.
        const jugadora = jugadoras.find((j) => j._fila.pagina === t.pagina && mismoRenglon(j._fila, t))
          || jugadoras.filter((j) => j._fila.pagina === t.pagina && j._fila.y < t.y && t.y - j._fila.y < 14).at(-1)
        if (!jugadora) continue // el nombre del equipo, arriba de la lista
        if (t.texto === 'AR') jugadora.ar = true
        else if (t.texto === 'CP') jugadora.cp = true
        else jugadora.nombre = `${jugadora.nombre} ${t.texto}`.trim()
      }
      datos.alineaciones[lado(columna)].push(...jugadoras)
    }
  }
  for (const equipo of ['local', 'visitante']) for (const j of datos.alineaciones[equipo]) delete j._fila

  // Bloques por minuto (goles, tarjetas, cambios): cada minuto al principio de la columna abre un bloque que va hasta
  // el minuto siguiente de esa misma columna.
  const bloques = (lista) => {
    const salida = []
    for (const columna of [0, 1]) {
      const enColumna = lista.filter((t) => t.columna === columna)
      const minutos = enColumna.filter((t) => leerMinutoComet(t.texto) && t.x - t.inicioColumna < 40)
      minutos.forEach((m, i) => {
        const siguiente = minutos[i + 1]
        const desde = (t) => t.pagina > m.pagina || (t.pagina === m.pagina && t.y >= m.y - 9)
        const hasta = (t) => !siguiente || t.pagina < siguiente.pagina || (t.pagina === siguiente.pagina && t.y < siguiente.y - 9)
        const contenido = enColumna.filter((t) => t !== m && desde(t) && hasta(t))
          .sort((a, b) => a.pagina - b.pagina || a.y - b.y || a.x - b.x)
        salida.push({ equipo: lado(columna), minuto: leerMinutoComet(m.texto), contenido })
      })
    }
    return salida
  }

  for (const b of bloques(porSeccion.goles || [])) {
    const { dorsal, nombre } = dorsalYNombre(b.contenido.map((t) => t.texto).join(' '))
    datos.goles.push({ equipo: b.equipo, minuto: b.minuto, dorsal, nombre })
  }
  for (const [nombreSeccion, color] of [['tarjetas_amarilla', 'amarilla'], ['tarjetas_roja', 'roja']]) {
    for (const b of bloques(porSeccion[nombreSeccion] || [])) {
      const quien = b.contenido.find((t) => /^\d{1,2}\s+\S/.test(t.texto))
      const { dorsal, nombre } = dorsalYNombre(quien?.texto || '')
      const motivo = b.contenido.filter((t) => t !== quien).map((t) => t.texto).join(' ')
      datos.tarjetas.push({ equipo: b.equipo, minuto: b.minuto, dorsal, nombre, color, motivo })
    }
  }
  for (const b of bloques(porSeccion.cambios || [])) {
    const dorsales = b.contenido.filter((t) => esDorsal(t.texto)).sort((a, c) => a.x - c.x)
    const corte = dorsales[1]?.x ?? Infinity
    const nombres = (filtro) => b.contenido.filter((t) => !esDorsal(t.texto) && filtro(t)).map((t) => t.texto).join(' ').trim()
    datos.cambios.push({
      equipo: b.equipo, minuto: b.minuto,
      sale: { dorsal: dorsales[0] ? Number(dorsales[0].texto) : null, nombre: nombres((t) => t.x < corte) },
      entra: { dorsal: dorsales[1] ? Number(dorsales[1].texto) : null, nombre: nombres((t) => t.x >= corte) },
    })
  }
  const orden = (a, b) => (a.minuto.valor + a.minuto.extra / 100) - (b.minuto.valor + b.minuto.extra / 100)
  datos.goles.sort(orden); datos.tarjetas.sort(orden); datos.cambios.sort(orden)
  return datos
}

// Equipo de COMET ('local' / 'visitante') → el nuestro o el rival.
export const esPropio = (datos, equipo) => equipo === datos.propio
export const ladoRival = (datos) => (datos.propio === 'local' ? 'visitante' : 'local')
