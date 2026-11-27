// «Mi estilo» (docs/analisis-dibujos-pro.md §Mi estilo): color, grosor y efectos por defecto de cada herramienta, para
// cada usuario. Lógica pura: qué se guarda de un dibujo y cómo se aplica a uno nuevo.
import { COLORES_DIBUJO, FLECHAS_QUE_CRECEN, GROSORES, HUECO, LUZ, MODOS_CRECER, TIPOS } from './formato.js'

export const CLAVE_ESTILO = 'analisis_mi_estilo_v1'
const EFECTOS_SEGUIMIENTO = ['entrada', 'pulso', 'sombra', 'rastro']
const EFECTOS_ZONA = ['despliegue', 'rayado', 'pulso']
const ZONAS = ['zona', 'poligono', 'zona_lineas']
const CON_HUECO = ['anillo', 'opciones_pase']
const SEGUIMIENTO = ['anillo', 'foco', 'nombre', 'reflector']
const entre = (v, min, max, base) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : base)

function entradaValida(tipo, e) {
  if (!e || typeof e !== 'object') return null
  const r = {}
  if (COLORES_DIBUJO.includes(e.color)) r.color = e.color
  if (GROSORES.includes(Number(e.grosor))) r.grosor = Number(e.grosor)
  const efectos = SEGUIMIENTO.includes(tipo) ? EFECTOS_SEGUIMIENTO : ZONAS.includes(tipo) ? EFECTOS_ZONA : null
  if (efectos && e.efectos && typeof e.efectos === 'object') r.efectos = Object.fromEntries(efectos.map((k) => [k, Boolean(e.efectos[k])]))
  if (FLECHAS_QUE_CRECEN.includes(tipo) && e.crecer) {
    const modo = e.crecer.modo === 'entera' || (MODOS_CRECER.includes(e.crecer.modo) && e.crecer.modo !== 'real') ? e.crecer.modo : 'normal'
    r.crecer = { modo, pelota: Boolean(e.crecer.pelota) }
  }
  if (CON_HUECO.includes(tipo) && e.hueco !== undefined) r.hueco = e.hueco === false ? false : e.hueco === 'auto' ? 'auto' : entre(e.hueco, HUECO.minimo, HUECO.maximo, 'auto')
  if (tipo === 'reflector' && e.luz) {
    r.luz = { color: COLORES_DIBUJO.includes(e.luz.color) ? e.luz.color : 'blanco', intensidad: entre(e.luz.intensidad, 0.2, 1, LUZ.intensidad), ancho: entre(e.luz.ancho, 0.5, 2, LUZ.ancho) }
  }
  if (ZONAS.includes(tipo) && e.medidas !== undefined) r.medidas = Boolean(e.medidas)
  return Object.keys(r).length ? r : null
}

// { tipo: entrada } solo con tipos y valores conocidos.
export function normalizarEstilo(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return {}
  const salida = {}
  for (const tipo of TIPOS) {
    const e = entradaValida(tipo, datos[tipo])
    if (e) salida[tipo] = e
  }
  return salida
}

// Lo que se guarda de un dibujo como «mi estilo» de su herramienta.
export function estiloDeObjeto(obj) {
  if (!obj) return null
  return entradaValida(obj.tipo, {
    color: obj.color, grosor: obj.grosor,
    efectos: obj.efectos,
    crecer: FLECHAS_QUE_CRECEN.includes(obj.tipo) ? (obj.crecer ? { modo: obj.crecer.modo, pelota: obj.crecer.pelota } : { modo: 'entera', pelota: false }) : undefined,
    hueco: CON_HUECO.includes(obj.tipo) ? (obj.hueco === undefined ? 'auto' : obj.hueco) : undefined,
    luz: obj.luz, medidas: ZONAS.includes(obj.tipo) ? Boolean(obj.medidas) : undefined,
  })
}

// Aplica «mi estilo» a un dibujo recién creado (antes de agregarlo).
export function aplicarEstilo(obj, estilo) {
  const e = estilo?.[obj.tipo]
  if (!e) return obj
  const r = { ...obj }
  if (e.color) r.color = e.color
  if (e.grosor) r.grosor = e.grosor
  if (e.efectos && r.efectos !== undefined) r.efectos = { ...r.efectos, ...e.efectos }
  else if (e.efectos && ZONAS.includes(obj.tipo)) r.efectos = { ...e.efectos }
  if (e.crecer) {
    if (e.crecer.modo === 'entera') delete r.crecer
    else r.crecer = { modo: e.crecer.modo, pelota: e.crecer.pelota }
  }
  if (e.hueco !== undefined) { if (e.hueco === 'auto') delete r.hueco; else r.hueco = e.hueco }
  if (e.luz) r.luz = { ...e.luz }
  if (e.medidas !== undefined) { if (e.medidas) r.medidas = true; else delete r.medidas }
  return r
}

// Guarda la entrada de una herramienta (null la borra).
export function conEstilo(estilo, tipo, entrada) {
  const nuevo = { ...(estilo || {}) }
  if (entrada) nuevo[tipo] = entrada
  else delete nuevo[tipo]
  return normalizarEstilo(nuevo)
}
