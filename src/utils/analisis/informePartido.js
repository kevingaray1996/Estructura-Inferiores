// Informe técnico de partido (PDF de Análisis): lógica pura. Usa los mismos cálculos del mapa de acciones
// (capas, dirección por tiempo, siempre atacando a la derecha). Puntos en 0..100: x a lo largo, y a lo ancho.

import { calcularResultado } from '../estadisticasEquipo.js'
import { faltantesAccion } from './completitud.js'
import { faltanMarcas, minutoReal, problemasOrden } from './eventosPartido.js'
import { enCapa } from './mapaAcciones.js'
import { formatearTiempo } from './formato.js'

// «2T 22' · video 58:40»: el minuto del partido primero y el tiempo del video al lado (si no estaba ya).
const conVideo = (a) => (!a.minuto || a.minuto.includes('video') ? a.minuto : `${a.minuto} · video ${formatearTiempo(a.evento?.segundo)}`)

export const MINUTOS_MINIMOS = 20
export const TRAMOS = ['0-15\'', '15-30\'', '30-45+\'', '45-60\'', '60-75\'', '75-90+\'']

// Porcentajes: con menos de 3 acciones no se calculan (null → «—» en el PDF), para no mostrar 0% o 100% engañosos.
export const MINIMO_PORCENTAJE = 3
const porcentaje = (parte, total) => (total >= MINIMO_PORCENTAJE ? Math.round((parte / total) * 100) : null)
const texto = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const entero = (v) => {
  const n = Number(v)
  return v !== null && v !== '' && Number.isInteger(n) && n >= 1 && n <= 99 ? n : null
}

// ---------- Datos cargados a mano (columna informe de analisis_partidos) ----------

export function normalizarInforme(valor) {
  const v = valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {}
  const claves = Array.isArray(v.claves) ? v.claves : []
  return {
    arbitra: texto(v.arbitra, 80),
    figura_id: typeof v.figura_id === 'string' && v.figura_id ? v.figura_id : null,
    claves: [0, 1, 2].map((i) => ({ titulo: texto(claves[i]?.titulo, 60), texto: texto(claves[i]?.texto, 160) })),
    posicion_antes: entero(v.posicion_antes),
    posicion_despues: entero(v.posicion_despues),
    lectura_donde: texto(v.lectura_donde, 200),
    lectura_cuando: texto(v.lectura_cuando, 200),
  }
}

// Lo que se guarda: sin campos vacíos de más.
export function informeParaGuardar(informe) {
  const n = normalizarInforme(informe)
  return { ...n, claves: n.claves.filter((c) => c.titulo || c.texto) }
}

// Posición «antes»: la «después» del informe del partido analizado anterior (por fecha), si existe.
export function posicionAntesSugerida(partidos, actual) {
  const fecha = fechaDe(actual)
  if (!fecha) return null
  const anteriores = (partidos || [])
    .filter((p) => p.id !== actual.id && fechaDe(p) && fechaDe(p) < fecha)
    .sort((a, b) => fechaDe(b).localeCompare(fechaDe(a)))
  for (const p of anteriores) {
    const despues = normalizarInforme(p.informe).posicion_despues
    if (despues) return despues
  }
  return null
}

const fechaDe = (p) => p?.partido_calendario?.fecha || p?.fecha || null

// ---------- Resultado, últimos 5 y próximo rival (calendario) ----------

// Resultado del partido: el del calendario; si no está, se cuentan los goles cargados en la pestaña Partido.
export function resultadoInforme(calendario, eventosPartido) {
  const r = calendario ? calcularResultado(calendario) : null
  if (r) return { propios: r.golesPropios, rivales: r.golesRivales, etiqueta: r.etiqueta }
  const goles = (eventosPartido || []).filter((e) => e.tipo === 'gol')
  if (!goles.length) return null
  const propios = goles.filter((g) => g.equipo === 'propio').length, rivales = goles.length - propios
  return { propios, rivales, etiqueta: propios > rivales ? 'Victoria' : propios < rivales ? 'Derrota' : 'Empate' }
}

const LETRA = { Victoria: 'V', Empate: 'E', Derrota: 'D' }

// Los 5 partidos con resultado anteriores a la fecha (incluido el del informe), del más viejo al más nuevo.
export function ultimosCinco(calendario, actual) {
  if (!actual?.fecha) return []
  return (calendario || [])
    .filter((p) => p.fecha && (p.fecha < actual.fecha || p.id === actual.id) && calcularResultado(p))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .slice(-5)
    .map((p) => LETRA[calcularResultado(p).etiqueta])
}

export function proximoRival(calendario, actual) {
  if (!actual?.fecha) return null
  const siguiente = (calendario || [])
    .filter((p) => p.fecha && p.fecha > actual.fecha && p.rival)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))[0]
  return siguiente ? siguiente.rival : null
}

// ---------- Minutos, goles y cambios ----------

// Minuto corrido del partido ("23'", "45+2'", "90+1'"). null sin las marcas.
export function minutoCorrido(segundo, marcas) {
  const real = minutoReal(segundo, marcas)
  if (!real || real.estado !== 'juego') return null
  const base = real.periodo === 2 ? 45 : 0
  return real.minuto > 45 ? { valor: base + 45, extra: real.minuto - 45, periodo: real.periodo } : { valor: base + real.minuto, extra: 0, periodo: real.periodo }
}
export const textoMinuto = (m) => (m ? `${m.valor}${m.extra ? `+${m.extra}` : ''}'` : '')

export function golesInforme(eventosPartido, marcas, nombreDe) {
  return (eventosPartido || []).filter((e) => e.tipo === 'gol')
    .sort((a, b) => Number(a.segundo) - Number(b.segundo))
    .map((g) => {
      const propio = g.equipo === 'propio'
      // Rival: la autora es lo que va antes del primer « · » (después puede venir una nota del cuerpo técnico).
      const autora = propio ? (nombreDe?.(g.jugador_id) || '') : texto(String(g.observaciones ?? '').split(' · ')[0], 40)
      return {
        propio, minuto: minutoCorrido(g.segundo, marcas),
        texto: propio ? (autora || 'Gol propio') : (autora ? `Rival · ${autora}` : 'Rival'),
      }
    })
}

// Tramo de 15' (0..5) de un minuto corrido. El descuento queda en el último tramo de cada tiempo.
export function tramoDe(m) {
  if (!m) return null
  const dentro = m.valor - (m.periodo === 2 ? 45 : 0) // 1..45 (+extra)
  return (m.periodo === 2 ? 3 : 0) + Math.min(2, Math.floor((dentro - 1) / 15))
}

// Acciones bien / mal cada 15' (las neutras no cuentan). null si faltan las marcas.
export function accionesPorTramo(acciones, marcas) {
  if (!marcas || marcas.inicio_1t == null || marcas.inicio_2t == null) return null
  const tramos = TRAMOS.map((nombre) => ({ nombre, bien: 0, mal: 0 }))
  for (const a of acciones) {
    if (a.calidad === 'neutro') continue
    const t = tramoDe(minutoCorrido(a.evento?.segundo, marcas))
    if (t !== null) tramos[t][a.calidad] += 1
  }
  return tramos
}

// Marcas de la línea de tiempo: goles y cambios (los cambios del mismo minuto van juntos).
export function hitosTiempo(eventosPartido, marcas) {
  const hitos = []
  for (const g of (eventosPartido || []).filter((e) => e.tipo === 'gol')) {
    const m = minutoCorrido(g.segundo, marcas)
    if (m) hitos.push({ tipo: g.equipo === 'propio' ? 'gol' : 'gol_rival', minuto: m, texto: `${g.equipo === 'propio' ? 'GOL' : 'GOL RIVAL'} ${textoMinuto(m)}` })
  }
  const cambios = new Map()
  for (const c of (eventosPartido || []).filter((e) => e.tipo === 'cambio')) {
    const m = minutoCorrido(c.segundo, marcas)
    if (!m) continue
    const clave = textoMinuto(m)
    cambios.set(clave, { minuto: m, n: (cambios.get(clave)?.n || 0) + 1 })
  }
  for (const [clave, { minuto, n }] of cambios) hitos.push({ tipo: 'cambio', minuto, texto: `${n === 1 ? 'CAMBIO' : `${n} CAMBIOS`} ${clave}` })
  return hitos.sort((a, b) => a.minuto.valor + a.minuto.extra / 100 - (b.minuto.valor + b.minuto.extra / 100))
}

// ---------- Números del resumen ----------

const RESULTADO_ARCO = ['Gol', 'Atajada']
// Números de un partido con las acciones crudas (sirve para el promedio de la temporada, sin dirección).
export function numerosBasicos(eventos) {
  const lista = eventos || []
  const pases = lista.filter((e) => enCapa(e, 'pases'))
  const correctos = pases.filter((e) => e.tipo === 'Pase correcto').length
  const remates = lista.filter((e) => enCapa(e, 'remates'))
  return {
    pases: pases.length, correctos, pctPases: porcentaje(correctos, pases.length),
    perdidas: lista.filter((e) => enCapa(e, 'perdidas')).length,
    recuperaciones: lista.filter((e) => enCapa(e, 'recuperaciones')).length,
    remates: remates.length,
    alArco: remates.filter((e) => e.tipo === 'Gol' || RESULTADO_ARCO.includes(e.resultado)).length,
    goles: remates.filter((e) => e.tipo === 'Gol' || e.resultado === 'Gol').length,
  }
}

// Números del partido con las acciones ya acomodadas (para «en campo propio / rival»).
export function numerosPartido(acciones) {
  const base = numerosBasicos(acciones.map((a) => a.evento))
  return {
    ...base,
    perdidasPropio: acciones.filter((a) => enCapa(a.evento, 'perdidas') && a.punto && a.punto.x < 50).length,
    recuperacionesRival: acciones.filter((a) => enCapa(a.evento, 'recuperaciones') && a.punto && a.punto.x >= 50).length,
  }
}

// Los otros partidos analizados del mismo año que tienen acciones (candidatos para el promedio).
export function partidosTemporada(eventos, partidos, actual) {
  const anio = (fechaDe(actual) || '').slice(0, 4)
  if (!anio) return []
  const conAcciones = new Set((eventos || []).map((e) => e.partido_id))
  return (partidos || []).filter((p) => p.id !== actual.id && (fechaDe(p) || '').startsWith(anio) && conAcciones.has(p.id)).map((p) => p.id)
}

// Análisis completo: las 4 marcas de tiempo en orden y ninguna acción sin detallar.
export function analisisCompleto({ eventos = [], detalles = {}, catalogo, marcas } = {}) {
  if (!marcas || faltanMarcas(marcas).length || problemasOrden(marcas).length) return false
  return eventos.every((e) => !faltantesAccion(e, detalles?.[e.id], catalogo).length)
}

// Promedio de la temporada: solo los partidos de «completos» (ids con el análisis completo).
// Sin ninguno, null (el PDF no muestra la comparación).
export function promedioTemporada(eventos, partidos, actual, completos = new Set()) {
  const ids = partidosTemporada(eventos, partidos, actual).filter((id) => completos.has(id))
  const porPartido = ids.map((id) => (eventos || []).filter((e) => e.partido_id === id)).filter((l) => l.length)
  if (!porPartido.length) return null
  const numeros = porPartido.map(numerosBasicos)
  const media = (clave) => {
    const valores = numeros.map((n) => n[clave]).filter((v) => v !== null)
    return valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null
  }
  return { partidos: numeros.length, pctPases: media('pctPases'), perdidas: media('perdidas'), recuperaciones: media('recuperaciones'), alArco: media('alArco') }
}

// Comparación con el promedio: { signo: 'mas' | 'menos' | 'igual', diferencia }, redondeada.
export function contraPromedio(valor, promedio) {
  if (valor === null || valor === undefined || promedio === null || promedio === undefined) return null
  const diferencia = Math.round(valor - promedio)
  return { signo: diferencia > 0 ? 'mas' : diferencia < 0 ? 'menos' : 'igual', diferencia: Math.abs(diferencia) }
}

// ---------- Jugadoras ----------

const DUELOS_GANADOS = ['Exitoso']
const DUELOS_PERDIDOS = ['Fallido']

// Filas de la tabla individual: las que jugaron al menos 20'. Titulares primero, después por dorsal.
// Cada columna marca sus valores destacados (los 3 mejores; en pérdidas, las que superan el promedio del equipo).
// Sin minutos (faltan las marcas) entran las que tienen alguna acción, con los minutos vacíos.
export function jugadorasInforme(acciones, { citaciones = [], minutos = null, nombreDe } = {}) {
  const conAcciones = new Set(acciones.map((a) => a.evento.jugador_id))
  const filas = citaciones
    .filter((c) => (minutos ? Number(minutos[c.jugador_id]) >= MINUTOS_MINIMOS : conAcciones.has(c.jugador_id)))
    .map((c) => {
      const propias = acciones.filter((a) => a.evento.jugador_id === c.jugador_id).map((a) => a.evento)
      const pases = propias.filter((e) => enCapa(e, 'pases'))
      const duelos = propias.filter((e) => enCapa(e, 'duelos') && [...DUELOS_GANADOS, ...DUELOS_PERDIDOS].includes(e.resultado))
      return {
        id: c.jugador_id, dorsal: c.dorsal ?? null, nombre: nombreDe?.(c.jugador_id) || '', titular: Boolean(c.titular),
        minutos: minutos ? Number(minutos[c.jugador_id]) : null,
        pctPases: porcentaje(pases.filter((e) => e.tipo === 'Pase correcto').length, pases.length),
        perdidas: propias.filter((e) => enCapa(e, 'perdidas')).length,
        recuperaciones: propias.filter((e) => enCapa(e, 'recuperaciones')).length,
        pctDuelos: porcentaje(duelos.filter((e) => DUELOS_GANADOS.includes(e.resultado)).length, duelos.length),
      }
    })
    .sort((a, b) => Number(b.titular) - Number(a.titular) || (Number(a.dorsal) || 99) - (Number(b.dorsal) || 99) || a.nombre.localeCompare(b.nombre, 'es'))
  // Las «cuantas» mejores filas. Con empates en el corte entran todas las empatadas, salvo que eso sume más de
  // una de más: entonces quedan solo las que superan al empate (o, si no hay ninguna, las del valor máximo).
  const destacar = (clave, cuantas) => {
    const valores = filas.map((f) => f[clave]).filter((v) => v !== null && v > 0).sort((a, b) => b - a)
    let corte = valores[Math.min(cuantas, valores.length) - 1]
    if (corte !== undefined && valores.filter((v) => v >= corte).length > cuantas + 1) {
      const encima = valores.filter((v) => v > corte)
      corte = encima.length ? encima[encima.length - 1] : valores[0]
    }
    for (const f of filas) f[`${clave}Destacado`] = corte !== undefined && f[clave] !== null && f[clave] >= corte
  }
  destacar('pctPases', 3); destacar('recuperaciones', 3); destacar('pctDuelos', 3)
  // Pérdidas (en rojo): solo las que pierden más que el promedio del equipo. Si todas empatan, ninguna.
  const perdidas = filas.map((f) => f.perdidas)
  const promedio = perdidas.length ? perdidas.reduce((s, v) => s + v, 0) / perdidas.length : 0
  for (const f of filas) f.perdidasDestacado = f.perdidas > promedio
  return filas
}

// ---------- Frases de lectura (se pueden corregir en el formulario) ----------

const carril = (puntos) => {
  if (!puntos.length) return null
  const y = puntos.reduce((s, p) => s + p.y, 0) / puntos.length
  return y < 40 ? 'el costado izquierdo' : y > 60 ? 'el costado derecho' : 'el centro'
}
const campo = (puntos) => {
  if (!puntos.length) return null
  const propio = puntos.filter((p) => p.x < 50).length
  return propio * 2 >= puntos.length ? 'campo propio' : 'campo rival'
}

export function lecturaDonde(acciones) {
  const puntos = (capa, periodo) => acciones.filter((a) => a.periodo === periodo && a.punto && enCapa(a.evento, capa)).map((a) => a.punto)
  const p1 = puntos('perdidas', 1), p2 = puntos('perdidas', 2), r1 = puntos('recuperaciones', 1), r2 = puntos('recuperaciones', 2)
  if (!p1.length && !p2.length && !r1.length && !r2.length) return ''
  const partes = []
  if (p1.length || p2.length) {
    const cambio = p2.length > p1.length ? `subieron de ${p1.length} a ${p2.length}` : p2.length < p1.length ? `bajaron de ${p1.length} a ${p2.length}` : `se mantuvieron en ${p2.length}`
    const lugar = carril(p2) && carril(p2) !== carril(p1) ? ` y pasaron ${carril(p2).replace(/^el /, 'al ')}` : carril(p2) ? ` y siguieron por ${carril(p2)}` : ''
    partes.push(`en el 2T las pérdidas ${cambio}${lugar}`)
  }
  if (r1.length || r2.length) {
    const c1 = campo(r1), c2 = campo(r2)
    partes.push(c2 && c1 && c2 !== c1 ? `las recuperaciones pasaron a ${c2}` : c2 ? `las recuperaciones fueron sobre todo en ${c2}` : 'en el 2T no hubo recuperaciones con ubicación')
  }
  const frase = partes.join('; ')
  return `Lectura: ${frase}.`
}

export function lecturaCuando(tramos, hitos) {
  if (!tramos) return ''
  const peor = tramos.map((t, i) => ({ ...t, i, saldo: t.mal - t.bien })).sort((a, b) => b.saldo - a.saldo || b.mal - a.mal)[0]
  if (!peor || (!peor.mal && !peor.bien)) return ''
  const [desde, hasta] = peor.nombre.replace(/[+']/g, '').split('-')
  const golRival = (hitos || []).some((h) => h.tipo === 'gol_rival' && tramoDe(h.minuto) === peor.i)
  const base = peor.saldo > 0
    ? `Entre el ${desde}' y el ${hasta}' tuvimos más acciones malas que buenas (${peor.mal} contra ${peor.bien})`
    : `El tramo más flojo fue entre el ${desde}' y el ${hasta}', con ${peor.mal} acciones malas`
  return `${base}${golRival ? ': coincide con un gol rival.' : '.'}`
}

// ---------- Avisos antes de generar ----------

// calendario: el partido del calendario (resultado cargado); eventosPartido: goles de la pestaña Partido;
// acciones: las acciones ya acomodadas (para los remates en campo propio).
export function avisosInforme({ eventos = [], detalles = {}, catalogo, marcas, partido, calendario = null, eventosPartido = [], acciones = [] } = {}) {
  const avisos = []
  const faltan = faltanMarcas(marcas)
  if (faltan.length) avisos.push(`Faltan marcas de tiempo (pestaña Partido): ${faltan.join(', ')}. Sin ellas no hay minutos, barras por tramo ni minutos jugados.`)
  const orden = problemasOrden(marcas)
  if (orden.length) avisos.push(`Las marcas de tiempo están fuera de orden: ${orden.join(' ')}`)
  if (!['derecha', 'izquierda'].includes(partido?.direccion_primer_tiempo)) avisos.push('Falta la dirección de ataque del 1T (pestaña Partido).')
  const incompletas = eventos.filter((e) => faltantesAccion(e, detalles?.[e.id], catalogo).length).length
  if (incompletas) avisos.push(`${incompletas} ${incompletas === 1 ? 'acción está sin detallar' : 'acciones están sin detallar'} (falta jugadora, ubicación, resultado o receptora).`)
  avisos.push(...avisosGoles({ calendario, eventosPartido, eventos }))
  const propios = acciones.filter((a) => a.remate && a.punto && a.punto.x < 50)
  if (propios.length) {
    const minutos = propios.slice(0, 5).map(conVideo).join(', ') + (propios.length > 5 ? ` y ${propios.length - 5} más` : '')
    avisos.push(`${propios.length === 1 ? 'Un remate quedó' : `${propios.length} remates quedaron`} en campo propio (${minutos}): puede ser un error de ubicación o de la dirección de ataque.`)
  }
  avisos.push(...avisosTiempos(acciones, marcas))
  return avisos
}

// Lo que hace que un mapa o un tramo salga vacío aunque haya acciones:
//   - acciones con zona pero sin el punto exacto (los mapas de calor necesitan el punto). Las que tienen el punto
//     pero no se pueden acomodar por falta de la dirección de ataque ya tienen su propio aviso;
//   - acciones fuera del tiempo de juego según las marcas (antes del inicio, entretiempo, después del final);
//   - tramos de 15' sin acciones buenas ni malas (las mismas que cuentan las barras), con el minuto de la última.
// Lo de los tiempos necesita el inicio de los dos tiempos (como las barras) y las marcas en orden.
export function avisosTiempos(acciones = [], marcas = null) {
  const avisos = []
  for (const periodo of [1, 2]) {
    const soloZona = acciones.filter((a) => a.periodo === periodo && !a.punto && !a.sinDireccion && a.zona)
    if (soloZona.length) {
      avisos.push(`En el ${periodo}T, ${soloZona.length === 1 ? '1 acción tiene' : `${soloZona.length} acciones tienen`} zona pero no el punto exacto en la cancha: no ${soloZona.length === 1 ? 'aparece' : 'aparecen'} en los mapas (por ejemplo ${soloZona.slice(0, 3).map(conVideo).join(', ')}). Marcá el punto en la Playlist.`)
    }
  }
  if (!marcas || marcas.inicio_1t == null || marcas.inicio_2t == null || problemasOrden(marcas).length) return avisos
  const fuera = { antes: [], entretiempo: [], despues: [] }
  for (const a of acciones) {
    const real = minutoReal(a.evento?.segundo, marcas)
    if (real && fuera[real.estado]) fuera[real.estado].push(a)
  }
  for (const k of Object.keys(fuera)) fuera[k].sort((a, b) => Number(a.evento.segundo) - Number(b.evento.segundo))
  const partes = [['antes', 'antes del inicio'], ['entretiempo', 'en el entretiempo'], ['despues', 'después del final']]
    .filter(([k]) => fuera[k].length).map(([k, texto]) => `${fuera[k].length} ${texto} (video ${formatearTiempo(fuera[k][0].evento.segundo)}${fuera[k].length > 1 ? `…${formatearTiempo(fuera[k].at(-1).evento.segundo)}` : ''})`)
  if (partes.length) avisos.push(`Hay acciones fuera del tiempo de juego según las marcas: ${partes.join(', ')}. No entran en los tramos de 15'; revisá las marcas de tiempo.`)
  const enJuego = acciones.filter((a) => a.calidad !== 'neutro' && minutoReal(a.evento?.segundo, marcas)?.estado === 'juego')
  if (enJuego.length) {
    const porTramo = TRAMOS.map(() => 0)
    for (const a of enJuego) porTramo[tramoDe(minutoCorrido(a.evento.segundo, marcas))] += 1
    const vacios = TRAMOS.filter((_, i) => !porTramo[i])
    if (vacios.length) {
      const ultima = enJuego.reduce((u, a) => (Number(a.evento.segundo) > Number(u.evento.segundo) ? a : u))
      avisos.push(`Sin acciones en ${vacios.length === 1 ? 'el tramo' : 'los tramos'} ${vacios.join(', ')}. La última acción del partido es del ${conVideo(ultima)}.`)
    }
  }
  return avisos
}

const nuestros = (n) => `${n} ${n === 1 ? 'gol nuestro' : 'goles nuestros'}`
const delRival = (n) => `${n} ${n === 1 ? 'gol' : 'goles'} del rival`
// El resultado del calendario contra los goles de la pestaña Partido y los remates marcados como gol.
export function avisosGoles({ calendario = null, eventosPartido = [], eventos = [] } = {}) {
  const avisos = []
  const r = calendario ? calcularResultado(calendario) : null
  const golesPartido = (eventosPartido || []).filter((e) => e.tipo === 'gol')
  const propiosPartido = golesPartido.filter((g) => g.equipo === 'propio').length
  const rivalesPartido = golesPartido.length - propiosPartido
  const remateGol = (eventos || []).filter((e) => e.tipo === 'Gol' || (e.tipo === 'Remate' && e.resultado === 'Gol')).length
  if (r) {
    if (propiosPartido !== r.golesPropios || rivalesPartido !== r.golesRivales) {
      avisos.push(`El resultado cargado es ${r.golesPropios}-${r.golesRivales}, pero en la pestaña Partido hay ${nuestros(propiosPartido)} y ${delRival(rivalesPartido)}.`)
    }
    if (remateGol !== r.golesPropios) avisos.push(`El resultado cargado dice ${nuestros(r.golesPropios)}, pero hay ${remateGol} ${remateGol === 1 ? 'acción marcada' : 'acciones marcadas'} como gol.`)
  } else if (remateGol !== propiosPartido) {
    avisos.push(`En la pestaña Partido hay ${nuestros(propiosPartido)}, pero hay ${remateGol} ${remateGol === 1 ? 'acción marcada' : 'acciones marcadas'} como gol.`)
  }
  return avisos
}

// Nombres cortos para el PDF: el apellido; si dos comparten apellido, inicial + apellido («C. Gonzalez»);
// si también comparten la inicial, nombre y apellido.
export function nombresCortos(jugadoras) {
  const lista = (jugadoras || []).filter((j) => j?.id)
  const clave = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  const apellidoDe = (j) => (j.apellido || j.nombre || '').trim()
  const nombres = new Map()
  for (const j of lista) {
    const mismos = lista.filter((o) => clave(apellidoDe(o)) === clave(apellidoDe(j)))
    const inicial = (j.nombre || '').trim().charAt(0).toUpperCase()
    if (mismos.length < 2 || !j.apellido) nombres.set(j.id, apellidoDe(j))
    else if (mismos.filter((o) => (o.nombre || '').trim().charAt(0).toUpperCase() === inicial).length < 2 && inicial) nombres.set(j.id, `${inicial}. ${j.apellido.trim()}`)
    else nombres.set(j.id, `${(j.nombre || '').trim()} ${j.apellido.trim()}`.trim())
  }
  return nombres
}

// ---------- Formación (de Convocados: cancha parada, nuestro arco abajo) ----------

// Pasa la posición de Convocados a la cancha acostada, atacando a la derecha.
export function formacionAcostada(citaciones) {
  return (citaciones || []).filter((c) => c.coordenadas).map((c) => ({
    id: c.jugador_id, dorsal: c.dorsal ?? '', x: 100 - c.coordenadas.y, y: c.coordenadas.x,
  }))
}

// ---------- Excel opcional con la lista de acciones ----------

export function filasExcel(acciones, { nombreDe, etiquetaTipo } = {}) {
  return acciones.map((a) => ({
    Minuto: a.minuto, Video: formatearTiempo(a.evento.segundo), Tiempo: `${a.periodo}T`, Acción: etiquetaTipo ? etiquetaTipo(a.evento.tipo) : a.evento.tipo,
    Jugadora: nombreDe?.(a.evento.jugador_id) || '', Resultado: a.evento.resultado || '',
    Zona: a.zona || '', 'X (ataque →)': a.punto ? Math.round(a.punto.x) : '', 'Y': a.punto ? Math.round(a.punto.y) : '',
    Observaciones: a.evento.observaciones || '',
  }))
}
