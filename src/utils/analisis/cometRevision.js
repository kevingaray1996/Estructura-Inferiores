// Revisión de lo leído de COMET contra lo ya cargado: qué se completa, qué no coincide y qué coincide.
// Lógica pura. COMET nunca pisa nada solo: cada cambio es una operación que se aplica recién si el analista lo confirma.
//
// Cada ítem: { id, grupo: 'completar' | 'distinto' | 'coincide', tema, titulo, comet, mio, segundoComet, segundoMio,
//   bloqueado (motivo por el que no se puede aplicar), ops: operaciones que se aplican con «Usar COMET» o tildado }.
// Operaciones: { op: 'insertar_evento', evento } · { op: 'actualizar_evento', id, cambios } · { op: 'borrar_evento', id }
//   · { op: 'informe', campos } · { op: 'calendario', campos } · { op: 'parte', parte } (qué parte de COMET se guarda).
import { leerMinutoPartido } from './marcador.js'
import { faltanMarcas, minutoReal } from './eventosPartido.js'
import { formatearTiempo } from './formato.js'
import { ladoRival, normalizarNombre, textoMinutoComet } from './comet.js'

export const TOLERANCIA_MINUTOS = 2

// «GOMEZ, LAURA INES» → «Laura Ines Gomez».
export function nombreLegible(nombreComet) {
  const [apellido, nombres] = String(nombreComet || '').split(',').map((p) => p.trim())
  const titulo = (t) => t.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
  return titulo([nombres, apellido].filter(Boolean).join(' '))
}
// «NUEVE, GOLEADORA LOCAL» → «Nueve, Goleadora Local» (para las observaciones de goles y tarjetas del rival).
export function nombreRival(nombreComet) {
  const [apellido, nombres] = String(nombreComet || '').split(',').map((p) => p.trim())
  const titulo = (t) => t.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
  return [titulo(apellido || ''), titulo(nombres || '')].filter(Boolean).join(', ')
}
const palabras = (t) => normalizarNombre(t).replace(/[^A-Z ]/g, ' ').split(/\s+/).filter((p) => p.length > 1)

// ---------- Nombres de COMET → jugadoras ----------

// Nombres de nuestras jugadoras en COMET (alineación y eventos), sin repetir: [{ nombre (normalizado), dorsal }].
export function nombresPropios(comet) {
  const vistos = new Map()
  const agregar = (nombre, dorsal) => {
    const n = normalizarNombre(nombre)
    if (n && !vistos.has(n)) vistos.set(n, { nombre: n, dorsal: dorsal ?? null })
  }
  for (const j of comet.alineaciones[comet.propio] || []) agregar(j.nombre, j.dorsal)
  for (const g of comet.goles) if (g.equipo === comet.propio) agregar(g.nombre, g.dorsal)
  for (const t of comet.tarjetas) if (t.equipo === comet.propio) agregar(t.nombre, t.dorsal)
  for (const c of comet.cambios) if (c.equipo === comet.propio) { agregar(c.sale.nombre, c.sale.dorsal); agregar(c.entra.nombre, c.entra.dorsal) }
  return [...vistos.values()]
}

// Jugadora nuestra que corresponde a un nombre de COMET («APELLIDOS, NOMBRES»): todas las palabras del apellido y el
// primer nombre tienen que estar. Si hay más de una, desempata el dorsal. null si no hay una sola clara.
// candidatas: [{ id, nombre, apellido, dorsal }]
export function sugerirJugadora(nombreComet, dorsal, candidatas) {
  const [apellidoComet, nombresComet] = normalizarNombre(nombreComet).split(',').map((p) => palabras(p || ''))
  if (!apellidoComet?.length) return null
  const puntaje = (c) => {
    const apellido = palabras(c.apellido)
    const nombres = palabras(c.nombre)
    if (!apellido.length || !apellido.every((p) => apellidoComet.includes(p))) return 0
    if (nombres.length && !(nombresComet || []).includes(nombres[0])) return 0
    return 1 + (nombres.every((p) => (nombresComet || []).includes(p)) ? 1 : 0) + (apellido.length === apellidoComet.length ? 1 : 0)
  }
  const puntuadas = candidatas.map((c) => ({ c, p: puntaje(c) })).filter((x) => x.p > 0)
  if (!puntuadas.length) return null
  const mejor = Math.max(...puntuadas.map((x) => x.p))
  let finalistas = puntuadas.filter((x) => x.p === mejor)
  if (finalistas.length > 1 && dorsal != null) finalistas = finalistas.filter((x) => Number(x.c.dorsal) === Number(dorsal))
  return finalistas.length === 1 ? finalistas[0].c.id : null
}

// ---------- Minutos ----------

// Minuto de COMET → { periodo, minuto } (minuto dentro del tiempo, 45+2 = 47 del 1T).
function posicionComet(m) {
  const periodo = m.valor <= 45 ? 1 : 2
  return { periodo, minuto: (periodo === 1 ? m.valor : m.valor - 45) + m.extra }
}
// Segundo del video de un minuto de COMET, o { error } si faltan las marcas.
export function segundoComet(m, marcas) {
  const r = leerMinutoPartido(`${m.valor}${m.extra ? `+${m.extra}` : ''}'`, marcas)
  return r || { error: 'Minuto inválido.' }
}
// Diferencia en minutos entre lo mío (segundo del video) y COMET. null si no se puede saber (faltan marcas).
function diferencia(segundoMio, minutoCometValor, marcas) {
  const real = minutoReal(segundoMio, marcas)
  if (!real || real.estado !== 'juego') return null
  const c = posicionComet(minutoCometValor)
  return real.periodo !== c.periodo ? 999 : Math.abs(real.minuto - c.minuto)
}
const textoMio = (segundo, marcas) => {
  const real = minutoReal(segundo, marcas)
  return real?.estado === 'juego' ? `${real.texto} (video ${formatearTiempo(segundo)})` : `video ${formatearTiempo(segundo)}`
}

// Empareja eventos de COMET con los míos: cada uno de COMET con el mío más cercano en minutos (sin repetir).
function emparejar(deComet, mios, marcas) {
  const libres = [...mios]
  const pares = []
  for (const c of deComet) {
    let mejor = null
    for (const m of libres) {
      const d = diferencia(Number(m.segundo), c.minuto, marcas)
      const valor = d == null ? 0 : d
      if (!mejor || valor < mejor.valor) mejor = { m, valor, d }
    }
    if (mejor) libres.splice(libres.indexOf(mejor.m), 1)
    pares.push({ c, m: mejor?.m || null, d: mejor ? mejor.d : null })
  }
  return { pares, sobrantes: libres }
}

// ---------- Revisión ----------

// comet: leerComet. eventos: analisis_partido_eventos del partido. idDe(nombreNormalizado) → jugador_id o null.
// citaciones: [{ jugador_id, dorsal, titular }]. calendario: fila de partidos (o null). informe: analisis.informe.
// anterior: analisis.comet (de una importación anterior) o null. nombreDe(id): nombre legible de una jugadora nuestra.
export function revisarComet({ comet, eventos = [], marcas, idDe = () => null, citaciones = [], calendario = null, informe = null, anterior = null, nombreDe = () => '' }) {
  const items = []
  const avisos = []
  const propio = comet.propio
  const rival = ladoRival(comet)
  const equipoDe = (lado) => (lado === propio ? 'propio' : 'rival')
  const quien = (lado, nombre) => (lado === propio ? (nombreDe(idDe(normalizarNombre(nombre))) || nombreLegible(nombre)) : `${nombreRival(nombre)} (rival)`)
  const faltan = faltanMarcas(marcas || {})
  if (faltan.length) avisos.push(`Faltan marcas de tiempo (${faltan.join(', ')}): lo que no se pueda ubicar en el video queda sin agregar.`)
  const agregar = (item) => items.push(item)

  // Goles y tarjetas: por equipo (y color).
  const grupos = [
    ...['propio', 'rival'].map((eq) => ({ tema: 'gol', eq, deComet: comet.goles.filter((g) => equipoDe(g.equipo) === eq), mios: eventos.filter((e) => e.tipo === 'gol' && e.equipo === eq) })),
    ...['propio', 'rival'].flatMap((eq) => ['amarilla', 'roja'].map((color) => ({
      tema: 'tarjeta', eq, color,
      deComet: comet.tarjetas.filter((t) => equipoDe(t.equipo) === eq && t.color === color),
      mios: eventos.filter((e) => e.tipo === 'tarjeta' && e.equipo === eq && e.tarjeta === color),
    }))),
  ]
  for (const g of grupos) {
    const { pares, sobrantes } = emparejar(g.deComet, g.mios, marcas)
    const nombreTema = g.tema === 'gol' ? 'Gol' : `Tarjeta ${g.color}`
    pares.forEach(({ c, m, d }, i) => {
      const id = `${g.tema}-${g.eq}-${g.color || ''}-${i}`
      const s = segundoComet(c.minuto, marcas)
      const autoraId = g.eq === 'propio' ? idDe(normalizarNombre(c.nombre)) : null
      const obs = g.eq === 'rival' ? [nombreRival(c.nombre), g.tema === 'tarjeta' ? c.motivo : ''].filter(Boolean).join(' · ').slice(0, 200) : null
      const descripcion = `${nombreTema} ${textoMinutoComet(c.minuto)} · ${quien(c.equipo, c.nombre)}${c.motivo ? ` · ${c.motivo}` : ''}`
      // Al agregar un gol nuestro también se crea su acción «Gol» (sin ubicación), para completarla en la Playlist.
      const nota = g.tema === 'gol' && g.eq === 'propio' ? ' (y su acción Gol, para ubicarla en la Playlist)' : ''
      if (!m) {
        agregar({
          id, grupo: 'completar', tema: g.tema, titulo: descripcion + nota, comet: descripcion, mio: null,
          segundoComet: s.segundo ?? null, bloqueado: s.error || '',
          ops: s.error ? [] : [{ op: 'insertar_evento', evento: {
            tipo: g.tema, segundo: s.segundo, equipo: g.eq,
            jugador_id: g.eq === 'propio' ? autoraId : null,
            tarjeta: g.tema === 'tarjeta' ? g.color : null,
            observaciones: obs,
          } }],
        })
        return
      }
      const mioTexto = `${nombreTema} ${textoMio(m.segundo, marcas)}${g.eq === 'propio' && m.jugador_id ? ` · ${nombreDe(m.jugador_id)}` : ''}`
      // Minuto.
      if (d != null && d > TOLERANCIA_MINUTOS) {
        agregar({
          id: `${id}-minuto`, grupo: 'distinto', tema: g.tema, titulo: `${nombreTema}: el minuto no coincide`,
          comet: `${textoMinutoComet(c.minuto)} · ${quien(c.equipo, c.nombre)}`, mio: mioTexto,
          segundoComet: s.segundo ?? null, segundoMio: Number(m.segundo), bloqueado: s.error || '',
          ops: s.error ? [] : [{ op: 'actualizar_evento', id: m.id, cambios: { segundo: s.segundo } }],
        })
      } else {
        agregar({ id: `${id}-minuto`, grupo: 'coincide', tema: g.tema, titulo: descripcion, comet: descripcion, mio: mioTexto,
          segundoComet: s.segundo ?? null, segundoMio: Number(m.segundo), ops: [] })
      }
      // Autora (nuestra) u observaciones (rival).
      if (g.eq === 'propio' && autoraId && m.jugador_id !== autoraId) {
        const vacio = !m.jugador_id
        agregar({
          id: `${id}-jugadora`, grupo: vacio ? 'completar' : 'distinto', tema: g.tema,
          titulo: vacio ? `${nombreTema} ${textoMinutoComet(c.minuto)}: ${g.tema === 'gol' ? 'autora' : 'jugadora'} ${nombreDe(autoraId) || nombreLegible(c.nombre)}`
            : `${nombreTema}: la jugadora no coincide`,
          comet: nombreDe(autoraId) || nombreLegible(c.nombre), mio: vacio ? null : nombreDe(m.jugador_id),
          segundoComet: s.segundo ?? null, segundoMio: Number(m.segundo),
          ops: [{ op: 'actualizar_evento', id: m.id, cambios: { jugador_id: autoraId } }],
        })
      }
      if (g.eq === 'rival' && obs && !String(m.observaciones || '').trim()) {
        agregar({
          id: `${id}-obs`, grupo: 'completar', tema: g.tema, titulo: `${nombreTema} ${textoMinutoComet(c.minuto)}: ${obs}`,
          comet: obs, mio: null, segundoMio: Number(m.segundo),
          ops: [{ op: 'actualizar_evento', id: m.id, cambios: { observaciones: obs } }],
        })
      }
    })
    sobrantes.forEach((m, i) => agregar({
      id: `${g.tema}-${g.eq}-${g.color || ''}-sobra-${i}`, grupo: 'distinto', tema: g.tema,
      titulo: `${nombreTema} ${g.eq === 'rival' ? 'del rival ' : ''}cargado que COMET no tiene`,
      comet: 'No figura en COMET', mio: `${nombreTema} ${textoMio(m.segundo, marcas)}`, segundoMio: Number(m.segundo),
      ops: [{ op: 'borrar_evento', id: m.id }],
    }))
  }

  // Cambios nuestros: primero los de la misma pareja (sale / entra); después, lo que quede.
  const cambiosComet = comet.cambios.filter((c) => c.equipo === propio)
  const misCambios = eventos.filter((e) => e.tipo === 'cambio')
  const libres = [...misCambios]
  const sinPareja = []
  cambiosComet.forEach((c, i) => {
    const sale = idDe(normalizarNombre(c.sale.nombre))
    const entra = idDe(normalizarNombre(c.entra.nombre))
    const s = segundoComet(c.minuto, marcas)
    const texto = `Cambio ${textoMinutoComet(c.minuto)} · sale ${quien(propio, c.sale.nombre)}, entra ${quien(propio, c.entra.nombre)}`
    const igual = libres.find((m) => m.jugadora_sale === sale && m.jugadora_entra === entra)
    if (igual && sale && entra) {
      libres.splice(libres.indexOf(igual), 1)
      const d = diferencia(Number(igual.segundo), c.minuto, marcas)
      const mio = `Cambio ${textoMio(igual.segundo, marcas)}`
      agregar(d != null && d > TOLERANCIA_MINUTOS
        ? { id: `cambio-${i}`, grupo: 'distinto', tema: 'cambio', titulo: 'Cambio: el minuto no coincide', comet: texto, mio,
          segundoComet: s.segundo ?? null, segundoMio: Number(igual.segundo), bloqueado: s.error || '',
          ops: s.error ? [] : [{ op: 'actualizar_evento', id: igual.id, cambios: { segundo: s.segundo } }] }
        : { id: `cambio-${i}`, grupo: 'coincide', tema: 'cambio', titulo: texto, comet: texto, mio,
          segundoComet: s.segundo ?? null, segundoMio: Number(igual.segundo), ops: [] })
      return
    }
    sinPareja.push({ c, i, sale, entra, s, texto })
  })
  const { pares, sobrantes } = emparejar(sinPareja.map((x) => ({ ...x, minuto: x.c.minuto })), libres, marcas)
  for (const { c: x, m } of pares) {
    const falta = !x.sale || !x.entra ? 'Falta asociar a una de las jugadoras del cambio.' : ''
    const evento = { jugadora_sale: x.sale, jugadora_entra: x.entra, segundo: x.s.segundo }
    if (!m) {
      agregar({ id: `cambio-${x.i}`, grupo: 'completar', tema: 'cambio', titulo: x.texto, comet: x.texto, mio: null,
        segundoComet: x.s.segundo ?? null, bloqueado: x.s.error || falta,
        ops: x.s.error || falta ? [] : [{ op: 'insertar_evento', evento: { tipo: 'cambio', ...evento } }] })
    } else {
      agregar({ id: `cambio-${x.i}`, grupo: 'distinto', tema: 'cambio', titulo: 'Cambio: no coincide', comet: x.texto,
        mio: `Cambio ${textoMio(m.segundo, marcas)} · sale ${nombreDe(m.jugadora_sale)}, entra ${nombreDe(m.jugadora_entra)}`,
        segundoComet: x.s.segundo ?? null, segundoMio: Number(m.segundo), bloqueado: x.s.error || falta,
        ops: x.s.error || falta ? [] : [{ op: 'actualizar_evento', id: m.id, cambios: evento }] })
    }
  }
  sobrantes.forEach((m, i) => agregar({
    id: `cambio-sobra-${i}`, grupo: 'distinto', tema: 'cambio', titulo: 'Cambio cargado que COMET no tiene',
    comet: 'No figura en COMET', mio: `Cambio ${textoMio(m.segundo, marcas)} · sale ${nombreDe(m.jugadora_sale)}, entra ${nombreDe(m.jugadora_entra)}`,
    segundoMio: Number(m.segundo), ops: [{ op: 'borrar_evento', id: m.id }],
  }))

  // Árbitra (va al informe PDF).
  const arbitra = comet.oficiales.arbitra ? nombreLegible(comet.oficiales.arbitra.nombre) : ''
  const miArbitra = String(informe?.arbitra || '').trim()
  if (arbitra) {
    const coincide = miArbitra && palabras(miArbitra).every((p) => palabras(comet.oficiales.arbitra.nombre).includes(p))
    agregar({
      id: 'arbitra', grupo: !miArbitra ? 'completar' : coincide ? 'coincide' : 'distinto', tema: 'oficiales',
      titulo: !miArbitra ? `Árbitra: ${arbitra}` : coincide ? `Árbitra: ${miArbitra}` : 'Árbitra: no coincide',
      comet: arbitra, mio: miArbitra || null, ops: coincide ? [] : [{ op: 'informe', campos: { arbitra: arbitra.slice(0, 80) } }],
    })
  }

  // Partes de COMET que se guardan con el análisis (las mismas que una importación anterior, o nuevas).
  const PARTES = [
    ['oficiales', 'Asistentes y cuarta árbitra', () => ({ asistente1: comet.oficiales.asistente1, asistente2: comet.oficiales.asistente2, cuarta: comet.oficiales.cuarta }),
      (v) => ['asistente1', 'asistente2', 'cuarta'].map((k) => v[k] && `${nombreLegible(v[k].nombre)}`).filter(Boolean).join(' · ')],
    ['alineacion_rival', `Alineación de ${nombreRival(comet[rival].nombre) || 'el rival'}`, () => comet.alineaciones[rival],
      (v) => `${v.filter((j) => j.titular).length} titulares y ${v.filter((j) => !j.titular).length} suplentes`],
    ['cambios_rival', 'Cambios del rival', () => comet.cambios.filter((c) => c.equipo === rival),
      (v) => (v.length ? v.map((c) => `${textoMinutoComet(c.minuto)} ${nombreRival(c.sale.nombre).split(',')[0]} → ${nombreRival(c.entra.nombre).split(',')[0]}`).join(' · ') : 'Sin cambios')],
  ]
  for (const [parte, titulo, valor, resumen] of PARTES) {
    const nuevo = valor()
    const viejo = anterior?.partes?.[parte]
    const texto = resumen(nuevo)
    if (!texto) continue
    const igual = viejo !== undefined && JSON.stringify(viejo) === JSON.stringify(nuevo)
    agregar({
      id: `parte-${parte}`, grupo: viejo === undefined ? 'completar' : igual ? 'coincide' : 'distinto', tema: 'comet',
      titulo: viejo === undefined || igual ? `${titulo}: ${texto}` : `${titulo}: cambió desde la importación anterior`,
      comet: texto, mio: viejo === undefined ? null : resumen(viejo), ops: [{ op: 'parte', parte }],
    })
  }

  // Calendario: estadio, hora, número de fecha y resultado (solo si el análisis está vinculado).
  if (!calendario) {
    avisos.push('Este análisis no está vinculado a un partido del calendario: no se completan estadio, hora ni resultado.')
  } else {
    const campos = [
      ['lugar', 'Estadio', comet.estadio, calendario.lugar, (a, b) => normalizarNombre(a) === normalizarNombre(b)],
      ['hora', 'Hora', comet.hora, calendario.hora ? String(calendario.hora).slice(0, 5) : '', (a, b) => a === b],
      ['numero_fecha', 'Número de fecha', comet.numero_fecha, calendario.numero_fecha,
        (a, b) => normalizarNombre(a).replace(/^FECHA\s*/, '') === normalizarNombre(b).replace(/^FECHA\s*/, '')],
    ]
    for (const [campo, nombre, deComet, mio, igual] of campos) {
      if (!deComet) continue
      const vacio = mio == null || String(mio).trim() === ''
      agregar({
        id: `cal-${campo}`, grupo: vacio ? 'completar' : igual(deComet, String(mio)) ? 'coincide' : 'distinto', tema: 'calendario',
        titulo: vacio || igual(deComet, String(mio)) ? `${nombre}: ${deComet}` : `${nombre}: no coincide`,
        comet: deComet, mio: vacio ? null : String(mio), ops: [{ op: 'calendario', campos: { [campo]: deComet } }],
      })
    }
    const golesComet = `${comet.local.goles}-${comet.visitante.goles}`
    const tieneResultado = calendario.goles_local != null && calendario.goles_visitante != null
    const miResultado = tieneResultado ? `${calendario.goles_local}-${calendario.goles_visitante}` : null
    if (comet.local.goles != null) {
      agregar({
        id: 'cal-resultado', grupo: !tieneResultado ? 'completar' : miResultado === golesComet ? 'coincide' : 'distinto', tema: 'calendario',
        titulo: !tieneResultado || miResultado === golesComet ? `Resultado: ${comet.local.nombre} ${golesComet} ${comet.visitante.nombre}` : 'Resultado: no coincide',
        comet: `${comet.local.nombre} ${golesComet} ${comet.visitante.nombre}`, mio: miResultado ? `${miResultado} (local-visitante)` : null,
        ops: [{ op: 'calendario', campos: { goles_local: comet.local.goles, goles_visitante: comet.visitante.goles } }],
      })
    }
    if (calendario.local_visitante && calendario.local_visitante !== propio) {
      avisos.push(`En el calendario figura que jugamos de ${calendario.local_visitante} y COMET dice ${propio}. Revisalo en Partidos.`)
    }
    if (calendario.fecha && comet.fecha && calendario.fecha.slice(0, 10) !== comet.fecha) {
      avisos.push(`La fecha del calendario (${calendario.fecha.slice(0, 10).split('-').reverse().join('/')}) no es la de COMET (${comet.fecha.split('-').reverse().join('/')}). ¿Es el PDF de este partido?`)
    }
  }

  // Avisos de la alineación nuestra: dorsales distintos, titulares distintos, jugadoras que no están en Convocados.
  for (const j of comet.alineaciones[propio] || []) {
    const id = idDe(normalizarNombre(j.nombre))
    const nombre = nombreDe(id) || nombreLegible(j.nombre)
    const citada = id ? citaciones.find((c) => c.jugador_id === id) : null
    if (!id) continue
    if (!citada) { avisos.push(`${nombre} figura en COMET y no está en los convocados del partido.`); continue }
    if (citada.dorsal != null && Number(citada.dorsal) !== Number(j.dorsal)) avisos.push(`Dorsal de ${nombre}: en COMET ${j.dorsal}, en los convocados ${citada.dorsal}.`)
    if (Boolean(citada.titular) !== Boolean(j.titular)) avisos.push(`${nombre}: en COMET es ${j.titular ? 'titular' : 'suplente'} y en los convocados ${citada.titular ? 'titular' : 'suplente'}.`)
  }

  return { items, avisos }
}

// Lo que hay que hacer: los ítems «completar» tildados y los «distinto» con «Usar COMET».
// elegidos: Set de ids (tildados o con «Usar COMET»). Los «coincide» de partes también se vuelven a guardar.
export function operacionesElegidas(items, elegidos) {
  const ops = []
  for (const item of items) {
    if (item.bloqueado) continue
    const aplica = item.grupo === 'coincide' ? item.ops.some((o) => o.op === 'parte') : elegidos.has(item.id)
    if (aplica) ops.push(...item.ops)
  }
  return ops
}

// Datos de COMET que se guardan en analisis_partidos.comet: lo general siempre; asistentes, alineación y cambios del
// rival solo si se eligieron (o los de antes, si se dejó lo anterior). Nunca médicas ni quién imprimió (no se leen).
export function cometParaGuardar(comet, ops, anterior = null, archivo = '') {
  const partesElegidas = new Set(ops.filter((o) => o.op === 'parte').map((o) => o.parte))
  const rival = ladoRival(comet)
  const nuevas = {
    oficiales: { asistente1: comet.oficiales.asistente1, asistente2: comet.oficiales.asistente2, cuarta: comet.oficiales.cuarta },
    alineacion_rival: comet.alineaciones[rival],
    cambios_rival: comet.cambios.filter((c) => c.equipo === rival),
  }
  const partes = {}
  for (const parte of Object.keys(nuevas)) {
    if (partesElegidas.has(parte)) partes[parte] = nuevas[parte]
    else if (anterior?.partes?.[parte] !== undefined) partes[parte] = anterior.partes[parte]
  }
  return {
    version: 1, archivo: String(archivo || '').slice(0, 120), importado: new Date().toISOString(),
    torneo: comet.torneo, fecha: comet.fecha, hora: comet.hora, estadio: comet.estadio,
    numero_fecha: comet.numero_fecha, numero_partido: comet.numero_partido,
    local: comet.local, visitante: comet.visitante, propio: comet.propio,
    arbitra: comet.oficiales.arbitra,
    alineacion_propia: comet.alineaciones[comet.propio],
    goles: comet.goles, tarjetas: comet.tarjetas, cambios_propios: comet.cambios.filter((c) => c.equipo === comet.propio),
    partes,
  }
}
