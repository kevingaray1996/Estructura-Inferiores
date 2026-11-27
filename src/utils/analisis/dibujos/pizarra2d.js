// Pizarra 2D de un clip (etapa 5, docs/analisis-etapa5.md): pasa los dibujos del video a una cancha vista desde arriba
// usando la calibración, y arma una jugada de la Pizarra (documento v2 de src/utils/pizarra.js). Lógica pura.
import { PALETA, SUPERFICIES, validarPizarra } from '../../pizarra.js'
import { aCancha, distanciaMetros, medidasCancha, textoMetros } from './calibracion.js'
import { esSeguimiento } from './formato.js'
import { posicionEn } from './interpolacion.js'
import { esquinas, subtituloEn, visibleEn } from './escena.js'
import { centroide, formaEn } from './zonas.js'
import { estadosEnMetros, coberturaEnMetros, NOMBRE_ESTADO } from './lineaDefensiva.js'

const [LARGO_PIZARRA, ANCHO_PIZARRA] = SUPERFICIES.completa
const FONDO_AREA = 16.5
const MITAD_AREA = 20.16
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// verde y naranja: semáforo de las opciones de pase y de la línea defensiva (los mismos que --dib-verde y --dib-naranja).
export const COLOR_HEX = Object.freeze({ amarillo: PALETA.local, blanco: '#FFFFFF', rojo: '#EF4444', azul: '#2563EB', verde: '#3ECF6E', naranja: '#F08A24' })
export const MAXIMO_PASOS = 60
const redondear = (v) => Math.round(v * 100) / 100
const limitar = (v, min, max) => Math.max(min, Math.min(max, v))

// ---------- Metros de la cancha real ↔ % de la cancha de la Pizarra (105 × 68) ----------
// Lo que está a menos de 16,5 m de cada arco conserva su distancia a la línea de fondo, y lo que está dentro del ancho
// del área conserva su distancia al centro: así las áreas coinciden aunque la cancha real sea más chica.
function ida(v, total, destino, borde) {
  if (total <= 2 * borde + 1) return v * destino / total
  if (v <= borde) return v
  if (v >= total - borde) return destino - (total - v)
  return borde + (v - borde) * (destino - 2 * borde) / (total - 2 * borde)
}
function vuelta(m, total, destino, borde) {
  if (total <= 2 * borde + 1) return m * total / destino
  if (m <= borde) return m
  if (m >= destino - borde) return total - (destino - m)
  return borde + (m - borde) * (total - 2 * borde) / (destino - 2 * borde)
}
// A lo ancho: dentro de ±20,16 m del centro se conserva; afuera se estira hasta el lateral.
function anchoIda(v, W) {
  const c = W / 2, d = v - c, a = Math.abs(d)
  if (c <= MITAD_AREA + 1) return v * ANCHO_PIZARRA / W
  const m = a <= MITAD_AREA ? a : MITAD_AREA + (a - MITAD_AREA) * (ANCHO_PIZARRA / 2 - MITAD_AREA) / (c - MITAD_AREA)
  return ANCHO_PIZARRA / 2 + Math.sign(d) * m
}
function anchoVuelta(m, W) {
  const c = W / 2, d = m - ANCHO_PIZARRA / 2, a = Math.abs(d)
  if (c <= MITAD_AREA + 1) return m * W / ANCHO_PIZARRA
  const v = a <= MITAD_AREA ? a : MITAD_AREA + (a - MITAD_AREA) * (c - MITAD_AREA) / (ANCHO_PIZARRA / 2 - MITAD_AREA)
  return c + Math.sign(d) * v
}

// Metros reales → { x, y } en % de la superficie de la Pizarra (sin recortar).
export function aPizarra(p, cancha) {
  const { largo, ancho } = medidasCancha(cancha)
  return { x: ida(p.x, largo, LARGO_PIZARRA, FONDO_AREA) * 100 / LARGO_PIZARRA, y: anchoIda(p.y, ancho) * 100 / ANCHO_PIZARRA }
}
// % de la Pizarra → metros reales.
export function desdePizarra(p, cancha) {
  const { largo, ancho } = medidasCancha(cancha)
  return { x: vuelta(p.x * LARGO_PIZARRA / 100, largo, LARGO_PIZARRA, FONDO_AREA), y: anchoVuelta(p.y * ANCHO_PIZARRA / 100, ancho) }
}
const pose = (p) => ({ x: redondear(limitar(p.x, 0, 100)), y: redondear(limitar(p.y, 0, 100)), rotacion: 0 })

// ---------- Jugadoras ----------
// Equipo de una ficha: el de su jugadora; si no tiene, por el color del dibujo (rojo o azul = rival).
export function equipoDe(obj) {
  if (obj?.jugadora?.rival) return 'rival'
  if (obj?.jugadora?.id) return 'nuestra'
  return ['rojo', 'azul'].includes(obj?.color) ? 'rival' : 'nuestra'
}

const PREFERENCIA = { nombre: 0, ficha: 1, anillo: 2, reflector: 3, foco: 4 }
// Jugadoras que van a la 2D: las seguidas (salvo las marcadas «no mostrar») y las fichas de un cuadro. Si dos objetos
// siguen a la misma jugadora nuestra, queda uno (primero «Nombre y dorsal»).
export function jugadoras2d(dibujo) {
  const lista = (dibujo?.objetos || []).filter((o) => (esSeguimiento(o.tipo) && o.en2d !== false) || o.tipo === 'ficha')
  const ordenadas = [...lista].sort((a, b) => PREFERENCIA[a.tipo] - PREFERENCIA[b.tipo])
  const vistas = new Set()
  const quedan = new Set()
  for (const o of ordenadas) {
    const clave = o.jugadora?.id ? `j:${o.jugadora.id}` : `o:${o.id}`
    if (vistas.has(clave)) continue
    vistas.add(clave)
    quedan.add(o.id)
  }
  return lista.filter((o) => quedan.has(o.id))
}

// Ficha que lleva el foco en t: la del foco, o la que quedó de esa misma jugadora (si se juntaron dos objetos).
function fichaConFoco(dibujo, t, presentes) {
  const foco = (dibujo?.objetos || []).find((o) => (o.tipo === 'foco' || o.tipo === 'reflector') && visibleEn(o, t))
  if (!foco) return null
  if (presentes.has(foco.id)) return foco.id
  const misma = foco.jugadora?.id && (dibujo.objetos || []).find((o) => o.jugadora?.id === foco.jugadora.id && presentes.has(o.id))
  return misma ? misma.id : null
}

// Corrección hecha en la 2D en t (interpolada entre ajustes; antes del primero y después del último, la del borde).
export function ajusteEn(ajustes, t) {
  if (!ajustes?.length) return { dx: 0, dy: 0 }
  if (t <= ajustes[0].t) return { dx: ajustes[0].dx, dy: ajustes[0].dy }
  const ultimo = ajustes[ajustes.length - 1]
  if (t >= ultimo.t) return { dx: ultimo.dx, dy: ultimo.dy }
  const i = ajustes.findIndex((a) => a.t > t) - 1
  const a = ajustes[i], b = ajustes[i + 1]
  const u = (t - a.t) / (b.t - a.t)
  return { dx: a.dx + (b.dx - a.dx) * u, dy: a.dy + (b.dy - a.dy) * u }
}

// Posición calculada desde el video (sin ajustes), en metros.
function posicionVideo(dibujo, obj, t) {
  if (obj.tipo === 'ficha') return aCancha(dibujo, obj.t, obj.punto)
  const p = posicionEn(obj.pista?.claves, t)
  return p ? aCancha(dibujo, t, p) : null
}

// Posición en la cancha (metros) de una jugadora en t, con las correcciones de la 2D.
export function posicionCancha(dibujo, obj, t) {
  const base = posicionVideo(dibujo, obj, t)
  if (!base) return null
  const a = ajusteEn(obj.ajustes2d, t)
  return { x: base.x + a.dx, y: base.y + a.dy }
}

// Arrastrar una ficha en la 2D: guarda la corrección en t (no cambia los puntos del video).
export function fijarAjuste(dibujo, objId, t, deseado) {
  const obj = dibujo.objetos.find((o) => o.id === objId)
  const base = obj && posicionVideo(dibujo, obj, t)
  if (!base) return dibujo
  const ajuste = { t: Math.round(t * 1000) / 1000, dx: redondear(limitar(deseado.x - base.x, -60, 60)), dy: redondear(limitar(deseado.y - base.y, -60, 60)) }
  const ajustes = [...(obj.ajustes2d || []).filter((a) => Math.abs(a.t - ajuste.t) > 0.05), ajuste].sort((a, b) => a.t - b.t)
  return { ...dibujo, objetos: dibujo.objetos.map((o) => (o.id === objId ? { ...o, ajustes2d: ajustes } : o)) }
}

// Borra las correcciones de la 2D de una jugadora.
export const quitarAjustes = (dibujo, objId) => ({ ...dibujo, objetos: dibujo.objetos.map((o) => {
  if (o.id !== objId) return o
  const { ajustes2d, ...resto } = o
  void ajustes2d
  return resto
}) })

// Colores, número, nombre y vínculo de la ficha de la Pizarra. rival: equipo rival de Equipos (con sus colores) o null.
export function datosFicha(obj, rival = null) {
  const j = obj.jugadora || {}
  const numero = String(j.dorsal || '').slice(0, 4)
  const texto = String(j.nombre || '').slice(0, 40)
  if (equipoDe(obj) === 'rival') {
    const camiseta = rival && /^#[0-9a-f]{6}$/i.test(rival.color_camiseta || '') ? rival.color_camiseta : PALETA.rival
    const tinta = rival && /^#[0-9a-f]{6}$/i.test(rival.color_numero || '') ? rival.color_numero : PALETA.tintaClara
    return { color: camiseta, tinta, numero, texto, vinculo: rival && UUID.test(rival.id || '') ? { tipo: 'rival', id: rival.id.toLowerCase() } : null, foto: '' }
  }
  return {
    color: PALETA.local, tinta: PALETA.tinta, numero, texto,
    vinculo: UUID.test(j.id || '') ? { tipo: 'jugadora', id: j.id.toLowerCase() } : null,
    foto: typeof j.foto === 'string' && /^https:\/\//.test(j.foto) ? j.foto : '',
  }
}

const elementoBase = (id, tipo, extra = {}) => ({ id, tipo, color: PALETA.trazo, tinta: PALETA.tinta, tamano: 3, grosor: 0.4, dx: 0, dy: 0, curva: 0, texto: '', numero: '', ...extra })
const TIPO_FLECHA = { pase_bajo: 'pase', pase_alto: 'curva', movimiento: 'movimiento', linea: 'punteada' }

// Dibujos fijos (pases, movimientos, líneas, zonas, textos) pasados a la Pizarra con la calibración del momento en que
// aparecen: [{ elemento, pose, desde, hasta }].
export function elementosFijos(dibujo) {
  const cancha = medidasCancha(dibujo.cancha)
  const salida = []
  for (const obj of dibujo.objetos || []) {
    const color = COLOR_HEX[obj.color] || PALETA.trazo
    const grosor = [0.3, 0.4, 0.55][(obj.grosor || 2) - 1] || 0.4
    const enPizarra = (p) => { const m = aCancha(dibujo, obj.desde, p); return m ? aPizarra(m, cancha) : null }
    if (TIPO_FLECHA[obj.tipo]) {
      const a = enPizarra(obj.puntos[0]), b = enPizarra(obj.puntos[obj.puntos.length - 1])
      if (!a || !b) continue
      const origen = pose(a)
      salida.push({
        elemento: elementoBase(obj.id, TIPO_FLECHA[obj.tipo], {
          color, grosor, curva: obj.tipo === 'pase_alto' ? 8 : 0,
          dx: redondear(limitar(limitar(b.x, 0, 100) - origen.x, -80, 80)), dy: redondear(limitar(limitar(b.y, 0, 100) - origen.y, -80, 80)),
        }),
        pose: origen, desde: obj.desde, hasta: obj.hasta,
      })
    } else if ((obj.tipo === 'zona' || obj.tipo === 'poligono') && !obj.claves?.length) {
      // Las zonas que se mueven con puntos clave se arman en cada instante (vista2dEn).
      const zona = sombraEnPizarra(obj.id, ladosZona(obj, obj.puntos).map(enPizarra), color, grosor)
      if (!zona) continue
      salida.push({ ...zona, desde: obj.desde, hasta: obj.hasta })
      if (obj.texto) salida.push({ elemento: elementoBase(`${obj.id}-t`, 'texto', { color: PALETA.trazo, tamano: 2.6, texto: obj.texto.slice(0, 60) }), pose: zona.pose, desde: obj.desde, hasta: obj.hasta })
    } else if (obj.tipo === 'opciones_pase') {
      // El pase que se hizo (rojo) y las opciones (verde, numeradas), en el lugar del momento en que aparece.
      const porId = new Map((dibujo.objetos || []).map((o) => [o.id, o]))
      const lugar = (p) => {
        const seguido = p.seguir ? porId.get(p.seguir) : null
        const v = (seguido?.pista && posicionEn(seguido.pista.claves, obj.desde)) || p.punto
        return enPizarra(v)
      }
      const a = lugar(obj.pasadora), r = lugar(obj.receptora)
      if (!a || !r) continue
      const origen = pose(a)
      const hacia = (b) => ({ dx: redondear(limitar(limitar(b.x, 0, 100) - origen.x, -80, 80)), dy: redondear(limitar(limitar(b.y, 0, 100) - origen.y, -80, 80)) })
      salida.push({ elemento: elementoBase(obj.id, 'pase', { color: COLOR_HEX.rojo, grosor, ...hacia(r) }), pose: origen, desde: obj.desde, hasta: obj.hasta })
      obj.opciones.forEach((op, i) => {
        const b = lugar(op)
        if (!b) return
        salida.push({ elemento: elementoBase(`${obj.id}-o${i + 1}`, 'punteada', { color: COLOR_HEX.verde, grosor, ...hacia(b) }), pose: origen, desde: obj.desde, hasta: obj.hasta })
        salida.push({ elemento: elementoBase(`${obj.id}-n${i + 1}`, 'texto', { color: COLOR_HEX.verde, tamano: 2.8, texto: String(i + 1) }), pose: pose({ x: b.x, y: b.y - 3.5 }), desde: obj.desde, hasta: obj.hasta })
      })
    } else if (obj.tipo === 'texto') {
      const p = enPizarra(obj.puntos[0])
      if (!p) continue
      salida.push({ elemento: elementoBase(obj.id, 'texto', { color, texto: obj.texto.slice(0, 200) }), pose: pose(p), desde: obj.desde, hasta: obj.hasta })
    }
  }
  return salida
}

// Esquinas de una zona (la rectangular tiene dos puntos opuestos; la libre, hasta 16 para la Pizarra).
function ladosZona(obj, puntos) {
  if (obj.tipo === 'zona') return esquinas(puntos)
  if (puntos.length > 16) return Array.from({ length: 16 }, (_, i) => puntos[Math.floor(i * puntos.length / 16)])
  return puntos
}

// Polígono de la Pizarra («sombra») con su centro como pose. puntos: en % de la Pizarra (o null si alguno no se pudo pasar).
function sombraEnPizarra(id, enCancha, color, grosor) {
  if (enCancha.length < 3 || enCancha.some((p) => !p)) return null
  const centro = pose({ x: enCancha.reduce((s, p) => s + p.x, 0) / enCancha.length, y: enCancha.reduce((s, p) => s + p.y, 0) / enCancha.length })
  return {
    elemento: elementoBase(id, 'sombra', {
      color, grosor,
      puntos: enCancha.map((p) => ({ x: redondear(limitar(limitar(p.x, 0, 100) - centro.x, -100, 100)), y: redondear(limitar(limitar(p.y, 0, 100) - centro.y, -100, 100)) })),
    }),
    pose: centro,
  }
}

// Dibujos de la versión 3 que cambian en cada instante: zonas con puntos clave, zona entre líneas, línea defensiva y
// metros de las zonas. Devuelve [{ elemento, pose }] (todos visibles en t).
function dinamicos2d(dibujo, t) {
  const cancha = medidasCancha(dibujo?.cancha)
  const porId = new Map((dibujo?.objetos || []).map((o) => [o.id, o]))
  const enPizarraT = (p) => { const m = aCancha(dibujo, t, p); return m ? aPizarra(m, cancha) : null }
  const ficha = (id) => { const o = porId.get(id); const m = o && posicionCancha(dibujo, o, t); return m ? { id, m, p: aPizarra(m, cancha) } : null }
  const salida = []
  const texto = (id, p, valor, color, tamano = 2.4) => salida.push({ elemento: elementoBase(id, 'texto', { color, tamano, texto: valor.slice(0, 80) }), pose: pose(p) })
  for (const obj of dibujo?.objetos || []) {
    if (!visibleEn(obj, t)) continue
    const color = COLOR_HEX[obj.color] || PALETA.trazo
    const grosor = [0.3, 0.4, 0.55][(obj.grosor || 2) - 1] || 0.4
    if ((obj.tipo === 'zona' || obj.tipo === 'poligono') && (obj.claves?.length || obj.medidas)) {
      const puntos = ladosZona(obj, formaEn(obj, t))
      const enCancha = puntos.map(enPizarraT)
      if (obj.claves?.length) {
        const zona = sombraEnPizarra(obj.id, enCancha, color, grosor)
        if (!zona) continue
        salida.push(zona)
        if (obj.texto) texto(`${obj.id}-t`, zona.pose, obj.texto, PALETA.trazo, 2.6)
      }
      if (obj.medidas) {
        const m = puntos.map((p) => aCancha(dibujo, t, p))
        const c = centroide(enCancha.filter(Boolean))
        if (c && m.every(Boolean)) {
          const xs = m.map((p) => p.x), ys = m.map((p) => p.y)
          texto(`${obj.id}-m`, { x: c.x, y: c.y + 3.5 }, `${textoMetros(Math.max(...ys) - Math.min(...ys))} × ${textoMetros(Math.max(...xs) - Math.min(...xs))}`, color)
        }
      }
    } else if (obj.tipo === 'zona_lineas') {
      const a = obj.lineaA.map(ficha).filter(Boolean).sort((x, y) => x.p.y - y.p.y)
      const b = obj.lineaB.map(ficha).filter(Boolean).sort((x, y) => y.p.y - x.p.y)
      if (!a.length || !b.length) continue
      const zona = sombraEnPizarra(obj.id, [...a, ...b].map((f) => f.p), color, grosor)
      if (!zona) continue
      salida.push(zona)
      if (obj.texto) texto(`${obj.id}-t`, zona.pose, obj.texto, PALETA.trazo, 2.6)
      if (obj.medidas) {
        const prom = (l) => l.reduce((s, f) => s + f.m.x, 0) / l.length
        texto(`${obj.id}-m`, { x: zona.pose.x, y: zona.pose.y + 3.5 }, `Entre líneas ${textoMetros(Math.abs(prom(a) - prom(b)))}`, color)
      }
    } else if (obj.tipo === 'linea_defensiva') {
      // La línea une las fichas a lo ancho de la cancha; los estados y la cobertura, en metros (o a mano sin calibrar).
      const fichas = obj.jugadoras.map(ficha).filter(Boolean).sort((x, y) => x.m.y - y.m.y)
      if (fichas.length < 2) continue
      const r = estadosEnMetros(fichas.map((f) => ({ id: f.id, metros: f.m })), { arco: obj.arco, umbral: obj.umbral ?? 2 })
      const estado = Object.fromEntries(r.filas.map((f) => [f.id, f]))
      for (let i = 1; i < fichas.length; i++) {
        const p = pose(fichas[i - 1].p), q = fichas[i].p
        salida.push({ elemento: elementoBase(`${obj.id}-s${i}`, 'punteada', { color, grosor, dx: redondear(limitar(q.x - p.x, -80, 80)), dy: redondear(limitar(q.y - p.y, -80, 80)) }), pose: p })
      }
      for (const f of fichas) {
        const e = estado[f.id]
        if (e.estado === 'en_linea') continue
        texto(`${obj.id}-e-${f.id}`, { x: f.p.x, y: f.p.y - 4 }, e.estado === 'atras' ? NOMBRE_ESTADO.atras : `+${textoMetros(e.d)}`, e.estado === 'atras' ? COLOR_HEX.rojo : COLOR_HEX.naranja)
        if (e.estado !== 'adelantada') continue
        const filas = fichas.map((x) => ({ id: x.id, metros: x.m, estado: estado[x.id].estado }))
        const c = coberturaEnMetros({ id: f.id, metros: f.m }, filas.filter((x) => x.id !== f.id), r)
        const vecina = c && fichas.find((x) => x.id === c.vecina)
        if (!vecina) continue
        const tri = sombraEnPizarra(`${obj.id}-c-${f.id}`, [vecina.p, aPizarra(c.hueco, cancha), aPizarra(c.atras, cancha)], c.cubierto ? COLOR_HEX.verde : COLOR_HEX.rojo, 0.3)
        if (tri) salida.push(tri)
      }
    }
  }
  return salida
}

// Lo que se ve en la 2D en el instante t, listo para PizarraCancha:
// { doc, poses, opacidades, fotos, foco, subtitulo, fichas: [{ id, objId, x, y (metros) }] }.
// opciones: { rival (equipo de Equipos), fichas: 'dorsal' | 'foto', fijos (de elementosFijos, para no recalcular) }.
export function vista2dEn(dibujo, t, { rival = null, fichas: modo = 'dorsal', fijos = null } = {}) {
  const cancha = medidasCancha(dibujo?.cancha)
  const elementos = [], poses = {}, opacidades = {}, fotos = {}, enCancha = []
  for (const obj of jugadoras2d(dibujo)) {
    const m = posicionCancha(dibujo, obj, t)
    if (!m) continue
    const d = datosFicha(obj, rival)
    elementos.push(elementoBase(obj.id, 'jugadora', { color: d.color, tinta: d.tinta, numero: d.numero, texto: d.texto, vinculo: d.vinculo }))
    poses[obj.id] = pose(aPizarra(m, cancha))
    opacidades[obj.id] = visibleEn(obj, t) ? 1 : 0
    if (modo === 'foto' && d.foto) fotos[obj.id] = d.foto
    enCancha.push({ id: obj.id, objId: obj.id, x: m.x, y: m.y })
  }
  for (const f of fijos || elementosFijos(dibujo)) {
    elementos.push(f.elemento)
    poses[f.elemento.id] = f.pose
    opacidades[f.elemento.id] = t >= f.desde && t <= f.hasta ? 1 : 0
  }
  // v3: lo que cambia en cada instante (zonas que se mueven, entre líneas, línea defensiva, metros).
  for (const f of dinamicos2d(dibujo, t)) {
    elementos.push(f.elemento)
    poses[f.elemento.id] = f.pose
    opacidades[f.elemento.id] = 1
  }
  // Línea entre dos jugadoras: con la distancia en metros en el medio.
  const porId = new Map((dibujo?.objetos || []).map((o) => [o.id, o]))
  for (const obj of dibujo?.objetos || []) {
    if (obj.tipo !== 'enlace' || !visibleEn(obj, t)) continue
    const a = porId.get(obj.a), b = porId.get(obj.b)
    const ma = a && posicionCancha(dibujo, a, t), mb = b && posicionCancha(dibujo, b, t)
    if (!ma || !mb) continue
    const pa = pose(aPizarra(ma, cancha)), pb = pose(aPizarra(mb, cancha))
    const color = COLOR_HEX[obj.color] || PALETA.trazo
    elementos.push(elementoBase(obj.id, 'punteada', { color, dx: redondear(limitar(pb.x - pa.x, -80, 80)), dy: redondear(limitar(pb.y - pa.y, -80, 80)) }))
    poses[obj.id] = pa
    opacidades[obj.id] = 1
    const idMetros = `${obj.id}-m`
    elementos.push(elementoBase(idMetros, 'texto', { color, tamano: 2.4, texto: textoMetros(distanciaMetros(ma, mb)) }))
    poses[idMetros] = pose({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 - 3 })
    opacidades[idMetros] = 1
  }
  const foco = fichaConFoco(dibujo, t, new Set(enCancha.map((f) => f.id)))
  return {
    doc: { version: 2, superficie: 'completa', orientacion: 'horizontal', ataque: 'derecha', bucle: false, velocidad: 1, recorrido: 'suave', placa: { titulo: '', analista: '' }, elementos, pasos: [] },
    poses, opacidades, fotos: Object.keys(fotos).length ? fotos : null,
    foco: foco ? { id: foco, peso: 1 } : null,
    subtitulo: subtituloEn(dibujo, t),
    fichas: enCancha,
  }
}

// ---------- Jugada de la Pizarra ----------
// Momentos de cada paso: el inicio, cada comienzo de subtítulo y cada pausa, y el resto cada `intervalo` segundos.
export function tiemposDePasos(dibujo, rango, intervalo = 1) {
  const dentro = (t) => t >= rango.inicio - 0.001 && t <= rango.fin + 0.001
  const marcas = [rango.inicio, ...(dibujo.subtitulos || []).map((s) => s.desde), ...(dibujo.pausas || []).map((p) => p.t), rango.fin]
    .filter(dentro).sort((a, b) => a - b)
  for (let paso = intervalo; ; paso *= 1.5) {
    const lista = []
    const agregar = (t, fija) => {
      const cerca = lista.findIndex((x) => Math.abs(x.t - t) < 0.25)
      if (cerca < 0) lista.push({ t, fija })
      else if (fija && !lista[cerca].fija) lista[cerca] = { t, fija }
    }
    for (const t of marcas) agregar(t, true)
    for (let t = rango.inicio + paso; t < rango.fin - 0.2; t += paso) agregar(Math.round(t * 1000) / 1000, false)
    lista.sort((a, b) => a.t - b.t)
    if (lista.length <= MAXIMO_PASOS || paso > rango.fin - rango.inicio) return lista.slice(0, MAXIMO_PASOS).map((x) => Math.round(x.t * 1000) / 1000)
  }
}

// Convierte la jugada en un documento de la Pizarra (v2, cancha completa), validado.
// opciones: { titulo, rival, intervalo }. Lanza un error si no hay calibración o jugadoras.
export function aJugadaPizarra(dibujo, { titulo = '', rival = null, intervalo = 1 } = {}) {
  const rango = dibujo.clip || { inicio: 0, fin: 10 }
  const cancha = medidasCancha(dibujo.cancha)
  const tiempos = tiemposDePasos(dibujo, rango, intervalo)
  const elementos = [], posesPorId = {}, visible = {}
  for (const obj of jugadoras2d(dibujo)) {
    const lista = tiempos.map((t) => { const m = posicionCancha(dibujo, obj, t); return m ? pose(aPizarra(m, cancha)) : null })
    if (lista.every((p) => !p)) continue
    // Donde no hay posición (antes de calibrar, por ejemplo) queda en la más cercana.
    const llenas = lista.map((p, i) => p || lista.reduce((mejor, q, j) => (q && (mejor === null || Math.abs(j - i) < Math.abs(mejor.j - i)) ? { j, q } : mejor), null).q)
    const d = datosFicha(obj, rival)
    elementos.push(elementoBase(obj.id, 'jugadora', { color: d.color, tinta: d.tinta, numero: d.numero, texto: d.texto, vinculo: d.vinculo }))
    posesPorId[obj.id] = llenas
    visible[obj.id] = (t) => visibleEn(obj, t)
  }
  const fichas = new Set(elementos.map((e) => e.id))
  if (!elementos.length) throw new Error('No hay jugadoras para pasar a la pizarra: seguí al menos una o agregá una ficha (con la cancha calibrada).')
  for (const f of elementosFijos(dibujo)) {
    elementos.push(f.elemento)
    posesPorId[f.elemento.id] = tiempos.map(() => f.pose)
    visible[f.elemento.id] = (t) => t >= f.desde && t <= f.hasta
  }
  const pausas = dibujo.pausas || []
  const pasos = tiempos.map((t, i) => {
    const pausa = pausas.find((p) => Math.abs(p.t - t) < 0.25)
    const foco = fichaConFoco(dibujo, t, fichas)
    const texto = subtituloEn(dibujo, t).slice(0, 200)
    return {
      id: `p${i + 1}`,
      nombre: (texto || `Paso ${i + 1}`).slice(0, 80),
      duracion: i === 0 ? 1 : limitar(redondear(t - tiempos[i - 1]), 0.1, 60),
      texto, pausa: pausa ? Math.min(30, pausa.duracion) : 0, pase: 'bajo', foco,
      ocultos: elementos.filter((e) => !visible[e.id](t)).map((e) => e.id),
      poses: Object.fromEntries(elementos.map((e) => [e.id, posesPorId[e.id][i]])),
    }
  })
  return validarPizarra({
    version: 2, superficie: 'completa', orientacion: 'horizontal', ataque: 'derecha', bucle: false, velocidad: 1, recorrido: 'suave',
    placa: { titulo: String(titulo).slice(0, 80), analista: '' }, elementos, pasos,
  })
}

// Enlace al clip original en YouTube, en el segundo justo.
export function enlaceClip(videoId, inicio) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) return null
  return `https://www.youtube.com/watch?v=${videoId}&t=${Math.max(0, Math.floor(Number(inicio) || 0))}s`
}

// Formulario de la Biblioteca para guardar la jugada (va por datosParaGuardar → guardar_ejercicio_pizarra).
export function formularioJugada({ nombre, carpetaId = '', doc, videoId, inicio, descripcion = '' }) {
  return {
    ambito: 'cancha', tipo: 'jugada', carpeta_id: carpetaId || '', contenido: String(nombre || '').trim().slice(0, 120),
    descripcion: String(descripcion || '').trim(),
    cantidad_jugadores: doc.elementos.filter((e) => e.tipo === 'jugadora').length || '',
    duracion_minutos: '', objetivo: '', imagen_url: null, link_video: enlaceClip(videoId, inicio), pizarra: doc, pizarra_miniatura: '',
  }
}
