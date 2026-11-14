import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import PizarraCancha from './PizarraCancha'
import PizarraMenuAgregar, { IconoHerramienta } from './PizarraPaleta'
import PizarraLineaTiempo from './PizarraLineaTiempo'
import PizarraPasos from './PizarraPasos'
import PizarraPropiedades from './PizarraPropiedades'
import { alturas as calcularAlturas, animar, duenasEnPaso, enMovimiento, estelas as calcularEstelas, flechasAutomaticas, imanPelotas, jugadoraCercana, pegarPelota, pelotasDe, tiemposDePasos } from '../utils/pizarraAnimacion'
import { agregarElemento, alternarFoco, alternarOcultos, aplicarFormacion, colocarFlecha, copiarPaso, duplicarElementos, duplicarPaso, duracionTotal, eliminarPaso, esRival, fijarAnotaciones, historial, historialInicial, limitar, LINEAS, moverExtremo, moverPaso, moverVertice, nuevaPizarra, plantillaHerramienta, quitarElementos, SUPERFICIES, validarPizarra } from '../utils/pizarra'
import { focoYCamara, opacidades as calcularOpacidades, subtitulo as calcularSubtitulo } from '../utils/pizarraExplicar'
import { descargarArchivo, miniaturaPizarra } from '../utils/pizarraExportar'
import './pizarra.css'

const UMBRAL_PX = 4, TOQUE_PX = 22
const RETRATO = '(orientation: portrait) and (max-width: 750px)'
const MOVIL = '(max-width: 750px)'
const DOBLE_TOQUE_MS = 400

function consulta(q) { return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(q) : null }
function suscribir(q) { return cb => { const m = consulta(q); m?.addEventListener?.('change', cb); return () => m?.removeEventListener?.('change', cb) } }
const suscribirRetrato = suscribir(RETRATO)
const esRetrato = () => !!consulta(RETRATO)?.matches
const suscribirMovil = suscribir(MOVIL)
const esMovil = () => !!consulta(MOVIL)?.matches

// Preferencias de vista de cada dispositivo (no son del ejercicio). El movimiento suave o recto sí es del ejercicio:
// se guarda en el documento v2.
const CLAVE_VISTA = 'pizarra-vista'
const VISTA_INICIAL = { estela: 'estela', flechas: true, fantasmas: true }
function leerVista() {
  try {
    const guardada = JSON.parse(window.localStorage.getItem(CLAVE_VISTA) || '{}')
    return { ...VISTA_INICIAL, estela: ['estela', 'completo', 'oculto'].includes(guardada.estela) ? guardada.estela : VISTA_INICIAL.estela,
      flechas: typeof guardada.flechas === 'boolean' ? guardada.flechas : true, fantasmas: typeof guardada.fantasmas === 'boolean' ? guardada.fantasmas : true }
  } catch { return VISTA_INICIAL }
}
function guardarVista({ estela, flechas, fantasmas }) { try { window.localStorage.setItem(CLAVE_VISTA, JSON.stringify({ estela, flechas, fantasmas })) } catch { /* sin almacenamiento: queda en memoria */ } }

export default function PizarraTactica({ inicial, soloLectura = false, onGuardar, onCerrar, titulo = 'Pizarra táctica' }) {
  const [h, setH] = useState(() => historialInicial(inicial || nuevaPizarra()))
  const doc = h.actual
  const [paso, setPaso] = useState(0), [seleccion, setSeleccion] = useState([]), [herramienta, setHerramienta] = useState('seleccionar')
  const [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 }), [borrador, setBorrador] = useState(null), [caja, setCaja] = useState(null)
  const [reproduciendo, setReproduciendo] = useState(false), [tiempo, setTiempo] = useState(0), [velocidad, setVelocidad] = useState(doc.velocidad), [bucle, setBucle] = useState(doc.bucle)
  const [error, setError] = useState(''), [guardando, setGuardando] = useState(false), [guardado, setGuardado] = useState(() => JSON.stringify(doc))
  const [arrastrando, setArrastrando] = useState(null)
  const [menu, setMenu] = useState(false), [preferencias, setPreferencias] = useState(leerVista)
  const [aviso, setAviso] = useState(null), [fantasma, setFantasma] = useState(null), [medida, setMedida] = useState(null)
  // Vista vertical automática en celular vertical: sólo cambia cómo se ve, no la orientación guardada.
  const retrato = useSyncExternalStore(suscribirRetrato, esRetrato, () => false)
  // Celular: un toque solo selecciona; las opciones se abren con doble toque (o con "⋯") en una hoja compacta.
  // En la compu el panel aparece apenas se selecciona algo.
  const movil = useSyncExternalStore(suscribirMovil, esMovil, () => false)
  // La hoja queda abierta para una selección concreta: si cambia (otro elemento o nada), se cierra sola.
  const [hojaDe, setHojaDe] = useState(null)
  const ultimoToque = useRef(null)
  const claveSeleccion = seleccion.join(), hoja = hojaDe !== null && hojaDe.clave === claveSeleccion
  // Si lo elegido está en la mitad de abajo de la cancha, la hoja se abre arriba para no taparlo.
  function setHoja(abierta) {
    if (!abierta) { setHojaDe(null); return }
    const nodo = svg.current?.querySelector(`[data-elemento="${seleccion[0]}"]`), lienzo = svg.current?.getBoundingClientRect()
    const r = nodo?.getBoundingClientRect?.()
    setHojaDe({ clave: claveSeleccion, arriba: !!(r && lienzo && lienzo.height && r.top + r.height / 2 > lienzo.top + lienzo.height / 2) })
  }
  const svg = useRef(null), svgExportar = useRef(null), raiz = useRef(null), arrastre = useRef(null), reloj = useRef(0), ultimo = useRef(0)
  const punteros = useRef(new Map()), gesto = useRef(null), cuadro = useRef(0), pendiente = useRef(null), barra = useRef(null), temporizador = useRef(0), manejadoresMenu = useRef({})
  const indice = Math.min(paso, doc.pasos.length - 1), sucio = JSON.stringify(doc) !== guardado
  const activo = borrador || doc, total = duracionTotal(doc)
  const { estela: modoEstela } = preferencias, recorrido = doc.recorrido
  const tiempos = useMemo(() => tiemposDePasos(doc), [doc])
  const animando = reproduciendo || tiempo > 0
  const cuadroAnimado = animando ? animar(doc, tiempo, recorrido) : null
  const poses = cuadroAnimado ? cuadroAnimado.poses : activo.pasos[indice].poses
  // Paso que se ve: el del tramo que se está reproduciendo, o el que se edita.
  const indiceVisible = cuadroAnimado ? (tiempo >= total ? doc.pasos.length - 1 : cuadroAnimado.indice) : indice
  const estelas = useMemo(() => animando ? calcularEstelas(doc, tiempo, modoEstela, recorrido) : null, [animando, doc, tiempo, modoEstela, recorrido])
  // Flechas automáticas: al editar, las que llegan al paso actual; al reproducir, las del tramo en curso
  // (y, detenida en un paso con pausa, las que acaban de llegar a ese paso).
  const movimiento = animando ? enMovimiento(doc, tiempo) : null
  const pasoFlechas = animando ? Math.min(movimiento.pausa ? movimiento.paso : movimiento.paso + 1, doc.pasos.length - 1) : indice
  const automaticas = useMemo(() => preferencias.flechas ? flechasAutomaticas(animando ? doc : activo, pasoFlechas) : null, [preferencias.flechas, animando, doc, activo, pasoFlechas])
  const fantasmas = !soloLectura && !animando && preferencias.fantasmas && indice > 0 ? activo.pasos[indice - 1].poses : null
  const pegadas = useMemo(() => animando || soloLectura ? null : Object.entries(duenasEnPaso(activo, indice)).filter(([, j]) => j).map(([id]) => id), [animando, soloLectura, activo, indice])
  const pelotaArrastrada = arrastrando && activo.elementos.find(e => e.id === arrastrando)?.tipo === 'pelota' ? arrastrando : null
  const iman = pelotaArrastrada ? jugadoraCercana(activo, indice, pelotaArrastrada, activo.pasos[indice].poses[pelotaArrastrada])?.id || null : null
  const elegido = doc.elementos.find(e => e.id === seleccion[0])
  // Etapa I: pelota en el aire, fundidos de lo oculto, foco, cámara y subtítulo del instante (o del paso que se edita).
  const base = animando ? doc : activo, instante = animando ? tiempo : null
  const alturas = animando ? calcularAlturas(doc, tiempo, recorrido) : null
  const opacidades = calcularOpacidades(base, instante, indice)
  const explicacion = focoYCamara(base, instante, indice, poses)
  // Editando, el foco se marca a medias para no tapar el resto; la cámara se acerca solo al reproducir o en el visor.
  const foco = explicacion.foco && (animando || soloLectura ? explicacion.foco : { ...explicacion.foco, peso: explicacion.foco.peso * .5 })
  const camara = animando || soloLectura ? explicacion.camara : null
  const textoPaso = calcularSubtitulo(base, instante, indice)
  const ocultosEnPaso = seleccion.length > 0 && seleccion.every(id => doc.pasos[indice].ocultos.includes(id))
  const bloqueado = soloLectura || guardando || reproduciendo || tiempo > 0
  // Sólo conviene girar superficies apaisadas (completa, cuarto, reducida); media cancha y área ya son "de pie".
  const forzarVertical = retrato && activo.orientacion !== 'vertical' && SUPERFICIES[activo.superficie][0] > SUPERFICIES[activo.superficie][1]
  const vista = useMemo(() => forzarVertical ? { ...activo, orientacion: 'vertical' } : activo, [activo, forzarVertical])
  const vertical = vista.orientacion === 'vertical'
  const [cw, ch] = SUPERFICIES[vista.superficie]
  const pxPorUnidad = medida ? Math.min(medida.w / ((vertical ? ch : cw) + 6), medida.h / ((vertical ? cw : ch) + 6)) : 0
  const toque = pxPorUnidad ? limitar(TOQUE_PX / (pxPorUnidad * zoom), 1.2, 9) : 3
  // Tamaño de la cancha: lo más grande posible en su proporción (con el margen de 3 m del dibujo), según el espacio libre.
  // En la compu: alto del cuerpo menos la reproducción, y ancho menos la columna de pasos (que se queda con lo que sobra).
  // En el celular (una columna): todo el ancho y un alto que deje a la vista la reproducción y la fila de pasos.
  const aspecto = ((vertical ? ch : cw) + 6) / ((vertical ? cw : ch) + 6)
  const cuerpo = useRef(null), cajaLinea = useRef(null)
  const [tamano, setTamano] = useState(null)
  useLayoutEffect(() => {
    const nodo = cuerpo.current
    if (!nodo || typeof ResizeObserver === 'undefined') return
    const calcular = () => {
      const ancho = nodo.clientWidth, alto = nodo.clientHeight, linea = cajaLinea.current?.offsetHeight || 0
      if (!ancho) return
      const columna = soloLectura || window.innerWidth <= 750
      const separacion = 8, lateralMinimo = ancho >= 1500 ? 340 : 300
      const altoLibre = columna
        // Visor: que entren la reproducción y los pasos debajo, sin bajar (desde donde arranca el cuerpo en la pantalla).
        ? (soloLectura ? Math.max(240, window.innerHeight - nodo.getBoundingClientRect().top - linea - (nodo.querySelector('.pizarra-lateral')?.offsetHeight || 0) - 3 * separacion - 16)
          : Math.max(300, window.innerHeight - (window.innerWidth <= 750 ? 248 : 200)))
        : alto - linea - separacion
      const anchoLibre = columna ? ancho : ancho - lateralMinimo - separacion
      const w = Math.max(160, Math.floor(Math.min(anchoLibre, altoLibre * aspecto)))
      const h = Math.floor(w / aspecto)
      setTamano(t => t && t.w === w && t.h === h && t.columna === columna ? t : { w, h, columna })
    }
    const observador = new ResizeObserver(calcular)
    observador.observe(nodo)
    if (cajaLinea.current) observador.observe(cajaLinea.current)
    window.addEventListener('resize', calcular)
    calcular()
    return () => { observador.disconnect(); window.removeEventListener('resize', calcular) }
  }, [aspecto, soloLectura])

  useEffect(() => {
    if (!sucio || soloLectura) return
    const salir = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', salir)
    return () => window.removeEventListener('beforeunload', salir)
  }, [sucio, soloLectura])
  useEffect(() => {
    const nodo = svg.current
    if (!nodo || typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(([entrada]) => setMedida({ w: entrada.contentRect.width, h: entrada.contentRect.height }))
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [])
  useEffect(() => {
    if (!hoja) return
    const fuera = e => { if (!e.target.closest?.('.pizarra-propiedades')) setHojaDe(null) }
    document.addEventListener('pointerdown', fuera, true)
    return () => document.removeEventListener('pointerdown', fuera, true)
  }, [hoja])
  useEffect(() => () => { window.clearTimeout(temporizador.current); cancelAnimationFrame(cuadro.current); barra.current?.quitar?.() }, [])
  useEffect(() => {
    if (!reproduciendo) return
    ultimo.current = 0
    let raf
    function avanzar(ahora) {
      const delta = ultimo.current ? Math.min((ahora - ultimo.current) / 1000, .15) : 0
      ultimo.current = ahora
      reloj.current += delta * velocidad
      if (reloj.current >= total) {
        if (bucle && total > 0) reloj.current %= total
        // Al terminar queda en el último paso, listo para editar; Reproducir vuelve a empezar.
        else { reloj.current = 0; setTiempo(0); setPaso(Number.MAX_SAFE_INTEGER); setReproduciendo(false); return }
      }
      setTiempo(reloj.current)
      raf = requestAnimationFrame(avanzar)
    }
    raf = requestAnimationFrame(avanzar)
    return () => cancelAnimationFrame(raf)
  }, [reproduciendo, velocidad, bucle, total])

  // `clave` agrupa cambios continuos (deslizadores, textos) en un solo paso de deshacer.
  function cambiar(siguiente, clave = null) { if (soloLectura) return; setH(actual => historial(actual, 'editar', siguiente, clave)); setTiempo(0); reloj.current = 0; setError('') }
  // Velocidad y bucle se guardan en el documento sin cortar la reproducción en curso.
  function ajustar(siguiente) { if (!soloLectura) setH(actual => historial(actual, 'editar', siguiente)) }
  function historialAccion(accion) {
    const siguiente = historial(h, accion)
    setH(siguiente); setSeleccion(s => s.filter(id => siguiente.actual.elementos.some(e => e.id === id))); setTiempo(0); setReproduciendo(false); setAviso(null)
  }
  const cambiarSuperficie = useCallback(superficie => { if (!soloLectura) setH(a => historial(a, 'editar', { ...a.actual, superficie })) }, [soloLectura])
  const cerrarMenu = useCallback(() => setMenu(false), [])
  function mostrarAviso(texto) { window.clearTimeout(temporizador.current); setAviso(texto); temporizador.current = window.setTimeout(() => setAviso(null), 5000) }
  function elegirPaso(i) { setReproduciendo(false); setTiempo(0); reloj.current = 0; setPaso(limitar(i, 0, doc.pasos.length - 1)) }
  // Reproducir sigue desde la pausa; si se está editando un paso, arranca desde ese paso (o del principio si es el último).
  function alternarReproduccion() {
    if (reproduciendo) { setReproduciendo(false); return }
    if (!(tiempo > 0 && tiempo < total)) { reloj.current = indice < doc.pasos.length - 1 ? tiempos[indice] : 0; setTiempo(reloj.current) }
    setReproduciendo(true)
  }
  // Mover la línea de tiempo pausa y muestra ese instante; al principio de todo vuelve a editar el primer paso.
  function buscar(t) {
    setReproduciendo(false)
    if (t <= 0) { elegirPaso(0); return }
    reloj.current = Math.min(t, total); setTiempo(reloj.current)
  }
  function pasoAnterior() { elegirPaso(animando && tiempo > tiempos[indiceVisible] + .001 ? indiceVisible : (animando ? indiceVisible : indice) - 1) }
  function pasoSiguiente() { elegirPaso((animando ? indiceVisible : indice) + 1) }
  function cambiarVista(cambios) { setPreferencias(actual => { const nueva = { ...actual, ...cambios }; guardarVista(nueva); return nueva }) }
  function punto(e) {
    const g = svg.current.querySelector('[data-campo]'), matrix = g.getScreenCTM()
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse())
    const [w, h] = SUPERFICIES[doc.superficie]
    return { x: p.x * 100 / w, y: p.y * 100 / h }
  }
  function colocar(id, p, destino = null) {
    const plantilla = plantillaHerramienta(id); if (!plantilla) return
    let siguiente = destino && LINEAS.includes(plantilla.tipo) ? colocarFlecha(doc, plantilla.tipo, p, destino, plantilla.extra) : agregarElemento(doc, plantilla.tipo, limitar(p.x, 0, 100), limitar(p.y, 0, 100), plantilla.extra)
    if (siguiente === doc) { setError('La pizarra admite hasta 200 elementos.'); return }
    // Una pelota colocada cerca de una jugadora queda a sus pies.
    if (plantilla.tipo === 'pelota') siguiente = imanPelotas(siguiente, indice, [siguiente.elementos.at(-1).id])
    cambiar(siguiente); setSeleccion([siguiente.elementos.at(-1).id])
  }
  // Dibuja en el próximo cuadro de pantalla: un render por frame aunque el dedo envíe más eventos.
  function programar(fn) {
    pendiente.current = fn
    if (!cuadro.current) cuadro.current = requestAnimationFrame(() => { cuadro.current = 0; if (arrastre.current) pendiente.current?.() })
  }
  function coordenadaVista(x, y) { return new DOMPoint(x, y).matrixTransform(svg.current.getScreenCTM().inverse()) }
  function registrarPuntero(e) {
    if (e.pointerType !== 'touch' || guardando) return
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()], centro = coordenadaVista((a.x + b.x) / 2, (a.y + b.y) / 2)
      gesto.current = { distancia: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), zoom, ancla: { x: (centro.x - pan.x) / zoom, y: (centro.y - pan.y) / zoom } }
      arrastre.current = null; setBorrador(null); setCaja(null); setArrastrando(null)
    }
    svg.current.setPointerCapture(e.pointerId)
  }
  function capturar(e, datos) { arrastre.current = { ...datos, pointer: e.pointerId, client: { x: e.clientX, y: e.clientY }, doc, activo: false }; svg.current.setPointerCapture(e.pointerId) }
  function iniciar(e, id) {
    if (bloqueado || e.button !== 0 || gesto.current) return
    if (herramienta !== 'seleccionar') { fondo(e); return }
    const ids = e.shiftKey ? (seleccion.includes(id) ? seleccion.filter(x => x !== id) : [...seleccion, id]) : seleccion.includes(id) ? seleccion : [id]
    setSeleccion(ids)
    // La pelota que tiene una jugadora arrastrada la acompaña (salvo que también esté seleccionada).
    const acompanan = pelotasDe(doc, indice, ids).filter(b => !ids.includes(b))
    capturar(e, { tipo: 'mover', inicio: punto(e), ids, acompanan, tocado: id })
  }
  function iniciarExtremo(e, id, extremo) {
    if (bloqueado || e.button !== 0 || gesto.current) return
    capturar(e, { tipo: 'extremo', id, extremo })
  }
  function iniciarVertice(e, id, vertice) {
    if (bloqueado || e.button !== 0 || gesto.current) return
    capturar(e, { tipo: 'vertice', id, vertice })
  }
  function fondo(e) {
    if (bloqueado || e.button !== 0 || gesto.current) return
    const p = punto(e), plantilla = plantillaHerramienta(herramienta)
    if (plantilla && LINEAS.includes(plantilla.tipo)) { capturar(e, { tipo: 'flecha', herramienta, inicio: p }); return }
    if (plantilla) { colocar(herramienta, p); return }
    if (zoom > 1) { capturar(e, { tipo: 'pan', pan }); return }
    setSeleccion([]); capturar(e, { tipo: 'caja', inicio: p })
  }
  function mover(e) {
    if (punteros.current.has(e.pointerId)) punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (gesto.current) {
      if (punteros.current.size === 2) {
        const [a, b] = [...punteros.current.values()], g = gesto.current
        const centro = coordenadaVista((a.x + b.x) / 2, (a.y + b.y) / 2)
        const escala = limitar(g.zoom * Math.hypot(b.x - a.x, b.y - a.y) / g.distancia, .5, 3)
        setZoom(escala); setPan({ x: centro.x - g.ancla.x * escala, y: centro.y - g.ancla.y * escala })
      }
      return
    }
    const a = arrastre.current; if (!a || a.pointer !== e.pointerId) return
    if (!a.activo) {
      // Un toque con temblor no mueve nada ni ensucia el historial.
      if (Math.hypot(e.clientX - a.client.x, e.clientY - a.client.y) < UMBRAL_PX) return
      a.activo = true
      if (a.tipo === 'mover') setArrastrando(a.ids.length === 1 ? a.ids[0] : null)
    }
    const p = punto(e)
    if (a.tipo === 'mover') {
      if (!a.ids.length) return
      const origen = a.doc.pasos[indice].poses
      // Una sola traslación limitada mantiene las distancias de la selección.
      const dx = limitar(p.x - a.inicio.x, -Math.min(...a.ids.map(id => origen[id].x)), 100 - Math.max(...a.ids.map(id => origen[id].x)))
      const dy = limitar(p.y - a.inicio.y, -Math.min(...a.ids.map(id => origen[id].y)), 100 - Math.max(...a.ids.map(id => origen[id].y)))
      const actualizado = { ...origen, ...Object.fromEntries(a.ids.map(id => [id, { ...origen[id], x: origen[id].x + dx, y: origen[id].y + dy }])),
        ...Object.fromEntries((a.acompanan || []).map(id => [id, { ...origen[id], x: limitar(origen[id].x + dx, 0, 100), y: limitar(origen[id].y + dy, 0, 100) }])) }
      const next = { ...a.doc, pasos: a.doc.pasos.map((f, i) => i === indice ? { ...f, poses: actualizado } : f) }
      a.final = next; programar(() => setBorrador(next))
    } else if (a.tipo === 'extremo') {
      const next = moverExtremo(a.doc, indice, a.id, a.extremo, p)
      a.final = next; programar(() => setBorrador(next))
    } else if (a.tipo === 'vertice') {
      const next = moverVertice(a.doc, indice, a.id, a.vertice, p)
      a.final = next; programar(() => setBorrador(next))
    } else if (a.tipo === 'flecha') {
      const plantilla = plantillaHerramienta(a.herramienta)
      const next = colocarFlecha(a.doc, plantilla.tipo, a.inicio, p, plantilla.extra)
      programar(() => setBorrador(next))
    } else if (a.tipo === 'caja') { a.fin = p; programar(() => setCaja({ ...a.inicio, x2: p.x, y2: p.y })) }
    else {
      const escala = pxPorUnidad || 1
      const siguiente = { x: a.pan.x + (e.clientX - a.client.x) / escala, y: a.pan.y + (e.clientY - a.client.y) / escala }
      programar(() => setPan(siguiente))
    }
  }
  function terminar(e, cancelar = false) {
    punteros.current.delete(e.pointerId)
    if (gesto.current) {
      if (!punteros.current.size) gesto.current = null
      if (svg.current.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId)
      return
    }
    const a = arrastre.current; if (!a || a.pointer !== e.pointerId) return
    cancelAnimationFrame(cuadro.current); cuadro.current = 0
    if (!cancelar) {
      if (a.tipo === 'flecha') {
        // Toque sin arrastre: flecha corta por defecto en ese punto.
        const fin = a.activo ? punto(e) : null
        colocar(a.herramienta, a.inicio, fin && Math.hypot(fin.x - a.inicio.x, fin.y - a.inicio.y) > 2 ? fin : null)
      } else if (a.activo && a.final) {
        // Pelota soltada: se pega a la jugadora más cercana dentro del imán (pase) o queda suelta.
        // Textos y zonas quedan en el mismo lugar en todos los pasos.
        cambiar(a.tipo === 'mover' ? fijarAnotaciones(imanPelotas(a.final, indice, a.ids), indice) : a.final)
      }
      // Doble toque sobre el mismo elemento (sin arrastrar): abre las opciones en el celular.
      if (a.tipo === 'mover' && !a.activo && a.tocado) {
        const ahora = performance.now(), previo = ultimoToque.current
        if (previo && previo.id === a.tocado && ahora - previo.t < DOBLE_TOQUE_MS) { setHoja(true); ultimoToque.current = null }
        else ultimoToque.current = { id: a.tocado, t: ahora }
      } else ultimoToque.current = null
      if (a.tipo === 'caja' && a.activo && a.fin) setSeleccion(doc.elementos.filter(el => { const p = doc.pasos[indice].poses[el.id]; return p.x >= Math.min(a.inicio.x, a.fin.x) && p.x <= Math.max(a.inicio.x, a.fin.x) && p.y >= Math.min(a.inicio.y, a.fin.y) && p.y <= Math.max(a.inicio.y, a.fin.y) }).map(el => el.id))
    }
    arrastre.current = null; setBorrador(null); setCaja(null); setArrastrando(null)
    if (svg.current.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId)
  }
  // Arrastrar un objeto desde el menú "＋ Agregar" hasta la cancha (funciona con el dedo); un toque lo deja listo.
  function barraInicio(e, id) {
    if (bloqueado) return
    // El menú se pliega al empezar a arrastrar y su botón desaparece: el arrastre se sigue desde la ventana.
    const mover = ev => manejadoresMenu.current.barraMover(ev), fin = ev => manejadoresMenu.current.barraFin(ev), cancelar = ev => manejadoresMenu.current.barraFin(ev, true)
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', fin); window.addEventListener('pointercancel', cancelar)
    const quitar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', fin); window.removeEventListener('pointercancel', cancelar) }
    barra.current?.quitar?.()
    barra.current = { id, pointer: e.pointerId, x: e.clientX, y: e.clientY, movido: false, quitar }
  }
  function barraMover(e) {
    const b = barra.current; if (!b || b.pointer !== e.pointerId) return
    if (!b.movido && Math.hypot(e.clientX - b.x, e.clientY - b.y) < 8) return
    // Al empezar a arrastrar, el menú se pliega para dejar la cancha a la vista.
    if (!b.movido) setMenu(false)
    b.movido = true; setFantasma({ id: b.id, x: e.clientX, y: e.clientY })
  }
  function barraFin(e, cancelar = false) {
    const b = barra.current; if (!b || b.pointer !== e.pointerId) return
    barra.current = null; b.quitar(); setFantasma(null)
    if (cancelar) return
    // Se activa al levantar el dedo: Chrome a veces descarta el click del primer toque tras un trazo rápido.
    if (!b.movido) { activarHerramienta(b.id); return }
    const r = svg.current.getBoundingClientRect()
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return
    const p = punto(e)
    if (p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100) colocar(b.id, p)
  }
  function activarHerramienta(id) {
    setMenu(false)
    if (id !== 'seleccionar') setSeleccion([])
    setHerramienta(actual => actual === id && id !== 'seleccionar' ? 'seleccionar' : id)
  }
  // Teclado y lectores de pantalla (click sin puntero, detail 0); el puntero se resuelve en barraFin.
  function barraClick(e, id) { if (e.detail === 0) activarHerramienta(id) }
  function propiedad(clave, valor, agrupar = true) { cambiar({ ...doc, elementos: doc.elementos.map(e => seleccion.includes(e.id) ? { ...e, [clave]: valor } : e) }, agrupar ? `propiedad:${clave}:${seleccion.join()}` : null) }
  function rotar(valor, agrupar = false) { cambiar(fijarAnotaciones({ ...doc, pasos: doc.pasos.map((p, i) => i !== indice ? p : { ...p, poses: Object.fromEntries(Object.entries(p.poses).map(([id, pose]) => [id, seleccion.includes(id) ? { ...pose, rotacion: valor } : pose])) }) }, indice), agrupar ? `rotacion:${indice}:${seleccion.join()}` : null) }
  function borrar() {
    if (!seleccion.length) return
    const cantidad = seleccion.length
    cambiar(quitarElementos(doc, seleccion)); setSeleccion([])
    mostrarAviso(cantidad > 1 ? `${cantidad} elementos eliminados` : 'Elemento eliminado')
  }
  function duplicar() {
    const siguiente = duplicarElementos(doc, seleccion)
    if (siguiente === doc) return
    cambiar(siguiente); setSeleccion(siguiente.elementos.slice(-seleccion.length).map(e => e.id))
  }
  function pasoNuevo() {
    const siguiente = copiarPaso(doc, indice)
    if (siguiente === doc) return
    cambiar(siguiente); setPaso(indice + 1)
  }
  // Pasos: eliminar con aviso para deshacer, duplicar y reordenar (el paso elegido acompaña al que se mueve).
  function eliminarPasoEn(i) {
    const siguiente = eliminarPaso(doc, i)
    if (siguiente === doc) return
    cambiar(siguiente); setPaso(p => Math.max(0, p > i || p === siguiente.pasos.length ? p - 1 : p))
    mostrarAviso('Paso eliminado')
  }
  function duplicarPasoEn(i) {
    const siguiente = duplicarPaso(doc, i)
    if (siguiente === doc) return
    cambiar(siguiente); setPaso(i + 1)
  }
  function moverPasoA(desde, hasta) {
    const siguiente = moverPaso(doc, desde, hasta)
    if (siguiente === doc) return
    cambiar(siguiente); setPaso(hasta)
  }
  // Formación prearmada en el paso actual: reubica a las que ya están (sin duplicar) y agrega las que faltan.
  function formacion(sistema, equipo) {
    const ya = doc.elementos.filter(e => e.tipo === 'jugadora' && (equipo === 'rival') === esRival(e)).length
    const quien = equipo === 'rival' ? 'rivales' : 'propias'
    if (ya && !window.confirm(`Ya hay ${ya} jugadoras ${quien}. ¿Acomodarlas en ${sistema} en este paso? Se agregan solo las que falten.`)) return
    const siguiente = aplicarFormacion(doc, indice, sistema, equipo)
    if (siguiente === doc) { setError('La pizarra admite hasta 200 elementos.'); return }
    cambiar(siguiente); setMenu(false); setSeleccion([])
  }
  function cambiarPaso(cambios, clave = null) { cambiar({ ...doc, pasos: doc.pasos.map((p, i) => i === indice ? { ...p, ...cambios } : p) }, clave) }
  // Pone a los pies de la jugadora la pelota más cercana (o crea una si no hay ninguna).
  function pegarPelotaAElegida() {
    if (!elegido || elegido.tipo !== 'jugadora') return
    let base = doc
    if (!doc.elementos.some(e => e.tipo === 'pelota')) {
      const pj = doc.pasos[indice].poses[elegido.id]
      base = agregarElemento(doc, 'pelota', pj.x, pj.y)
      if (base === doc) { setError('La pizarra admite hasta 200 elementos.'); return }
    }
    cambiar(pegarPelota(base, indice, elegido.id))
  }
  function cerrar() { if (!soloLectura && sucio && !window.confirm('¿Salir sin aplicar los cambios de la pizarra?')) return; onCerrar?.() }
  function pantallaCompleta() { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); else if (raiz.current.requestFullscreen) raiz.current.requestFullscreen().catch(() => setError('Pantalla completa no disponible.')); else setError('Pantalla completa no disponible en este navegador.') }
  function ajustarVista() { setZoom(1); setPan({ x: 0, y: 0 }) }
  async function guardar() {
    setGuardando(true); setError('')
    try {
      const limpia = validarPizarra(doc)
      const miniatura = await miniaturaPizarra(svgExportar.current || svg.current)
      await onGuardar?.(limpia, miniatura)
      setGuardado(JSON.stringify(limpia))
    } catch (e) { setError(e.message || 'No se pudo guardar la pizarra.'); } finally { setGuardando(false) }
  }
  async function png() { try { const data = await miniaturaPizarra(svgExportar.current || svg.current); const a = document.createElement('a'); a.href = data; a.download = 'pizarra-comunicaciones.png'; a.click() } catch (e) { setError(e.message) } }
  async function importar(e) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
    try { if (file.size > 900000) throw Error('Archivo demasiado grande.'); const nuevo = validarPizarra(JSON.parse(await file.text())); if (!window.confirm('¿Reemplazar el diseño actual por el archivo? Podés deshacer.')) return; cambiar(nuevo); setPaso(0); setSeleccion([]) } catch (e) { setError(e.message || 'Archivo inválido.') }
  }
  function teclado(e) {
    if (guardando || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY'].includes(e.target.tagName)) return
    // Reproducción: espacio reproduce o pausa; las flechas cambian de paso (también en el visor).
    if (e.key === ' ' && doc.pasos.length > 1) { e.preventDefault(); alternarReproduccion(); return }
    if (e.key === 'ArrowLeft' && !e.altKey) { e.preventDefault(); pasoAnterior(); return }
    if (e.key === 'ArrowRight' && !e.altKey) { e.preventDefault(); pasoSiguiente(); return }
    if (soloLectura || reproduciendo) return
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); historialAccion(e.shiftKey ? 'rehacer' : 'deshacer') }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); historialAccion('rehacer') }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSeleccion(doc.elementos.map(el => el.id)) }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicar() }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); borrar() }
    if (e.key === 'Escape') { setSeleccion([]); setHerramienta('seleccionar'); setMenu(false) }
  }

  const zoomControl = <label className="pizarra-zoom">Zoom <input aria-label="Zoom de cancha" type="range" min=".5" max="3" step=".1" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
  const plantillaActiva = plantillaHerramienta(herramienta)
  // El menú recibe manejadores estables que siempre llaman a la versión actual (con el documento al día).
  manejadoresMenu.current = { barraInicio, barraMover, barraFin, barraClick }
  const arrastreMenu = useMemo(() => ({ inicio: (...a) => manejadoresMenu.current.barraInicio(...a), mover: (...a) => manejadoresMenu.current.barraMover(...a), fin: (...a) => manejadoresMenu.current.barraFin(...a), click: (...a) => manejadoresMenu.current.barraClick(...a) }), [])
  const enPaso = indice < doc.pasos.length ? doc.pasos[indice] : doc.pasos.at(-1)
  const pasos = <PizarraPasos doc={doc} indice={indice} indiceVisible={indiceVisible} animando={animando} soloLectura={soloLectura} bloqueado={bloqueado}
    jugadoras={doc.elementos.filter(e => e.tipo === 'jugadora')}
    onPaso={elegirPaso} onAgregar={pasoNuevo} onDuplicar={duplicarPasoEn} onEliminar={eliminarPasoEn} onMover={moverPasoA}
    onNombre={nombre => cambiarPaso({ nombre }, `nombre:${enPaso.id}`)}
    onDuracion={v => { if (v >= .1 && v <= 60) cambiarPaso({ duracion: v }, `duracion:${enPaso.id}`) }}
    onTexto={texto => cambiarPaso({ texto }, `texto:${enPaso.id}`)}
    onPausa={v => { if (v >= 0 && v <= 30) cambiarPaso({ pausa: v }, `pausa:${enPaso.id}`) }}
    onPase={pase => cambiarPaso({ pase })} onFoco={id => cambiarPaso({ foco: id || null })} />

  return <div ref={raiz} className={`pizarra ${soloLectura ? 'pizarra-visor' : 'pizarra-editor'}${reproduciendo ? ' pizarra-reproduciendo' : ''}`} tabIndex={0} onKeyDown={teclado}>
    <header className="pizarra-barra">
      <h2 className="pizarra-titulo"><strong>{titulo}</strong><small>PIZARRA DE COMUNICACIONES</small></h2>
      {onCerrar && <button type="button" className="pizarra-icono" aria-label="Cerrar" title="Cerrar" disabled={guardando} onClick={cerrar}>✕</button>}
      {!soloLectura && <div className="pizarra-grupo" role="group" aria-label="Historial">
        <button type="button" className="pizarra-icono" aria-label="Deshacer" title="Deshacer (Ctrl+Z)" disabled={!h.antes.length || reproduciendo || guardando} onClick={() => historialAccion('deshacer')}>↶</button>
        <button type="button" className="pizarra-icono" aria-label="Rehacer" title="Rehacer (Ctrl+Shift+Z)" disabled={!h.despues.length || reproduciendo || guardando} onClick={() => historialAccion('rehacer')}>↷</button>
      </div>}
      {!soloLectura && <div className="pizarra-grupo pizarra-segmentado" role="group" aria-label="Superficie">
        <button type="button" aria-label="Cancha completa" aria-pressed={doc.superficie === 'completa'} disabled={bloqueado} onClick={() => cambiarSuperficie('completa')}>Completa</button>
        <button type="button" aria-label="Media cancha" aria-pressed={doc.superficie === 'media'} disabled={bloqueado} onClick={() => cambiarSuperficie('media')}>Media</button>
      </div>}
      <span className="pizarra-espacio" />
      {soloLectura ? <button type="button" onClick={pantallaCompleta}>Ampliar cancha</button>
        : <details className="pizarra-menu"><summary aria-label="Más opciones" title="Más opciones">⋯</summary>
          <div className="pizarra-menu-panel">
            <strong>Vista</strong>
            {zoomControl}
            <div className="pizarra-fila"><button type="button" onClick={ajustarVista}>Ajustar vista</button><button type="button" onClick={pantallaCompleta}>Pantalla completa</button></div>
            <fieldset disabled={bloqueado} className="pizarra-fila">
              <label>Superficie <select aria-label="Superficie" value={doc.superficie} onChange={e => cambiarSuperficie(e.target.value)}>{Object.entries(SUPERFICIES).map(([id, s]) => <option key={id} value={id}>{s[2]}</option>)}</select></label>
              <label>Orientación guardada <select value={doc.orientacion} onChange={e => cambiar({ ...doc, orientacion: e.target.value })}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>
              <label>Ataque <select value={doc.ataque} onChange={e => cambiar({ ...doc, ataque: e.target.value })}><option value="derecha">Derecha</option><option value="izquierda">Izquierda</option></select></label>
            </fieldset>
            {retrato && <p className="pizarra-ayuda">En el celular vertical la cancha se muestra de pie; lo guardado y Wellness conservan la orientación elegida.</p>}
            <strong>Archivo</strong>
            <div className="pizarra-fila"><button type="button" onClick={png}>Descargar PNG</button><button type="button" onClick={() => descargarArchivo(JSON.stringify(doc), 'pizarra.json', 'application/json')}>Respaldo editable</button><label className="pizarra-archivo">Recuperar JSON <input type="file" accept="application/json,.json" onChange={importar} /></label></div>
            <button type="button" className="pizarra-peligro" disabled={bloqueado} onClick={() => { if (window.confirm('¿Borrar todos los elementos y pasos? Podés deshacer.')) { cambiar(nuevaPizarra()); setPaso(0); setSeleccion([]) } }}>Borrar todo</button>
            <p className="pizarra-ayuda">Ctrl/Cmd+Z deshacer · Ctrl/Cmd+Shift+Z rehacer · Ctrl/Cmd+A seleccionar todo · Ctrl/Cmd+D duplicar · Supr eliminar · Esc soltar · Alt+flechas mueve el paso elegido.</p>
          </div>
        </details>}
      {!soloLectura && onGuardar && <button type="button" className="pizarra-guardar" aria-label="Aplicar pizarra al ejercicio" disabled={guardando || reproduciendo || tiempo > 0} onClick={guardar}>{guardando ? 'Preparando…' : <><span className="pizarra-largo">Aplicar</span><span className="pizarra-corto" aria-hidden="true">✓</span></>}</button>}
    </header>
    {error && <p role="alert" className="pizarra-error">{error}</p>}
    {soloLectura && <div className="pizarra-fila">{zoomControl}<button type="button" onClick={ajustarVista}>Ajustar vista</button></div>}
    <div ref={cuerpo} className={`pizarra-cuerpo${tamano ? ' pizarra-medida' : ''}`} style={tamano && !tamano.columna ? { gridTemplateColumns: `${tamano.w}px minmax(0, 1fr)` } : undefined}>
      <div className="pizarra-escenario" style={tamano?.columna ? { alignItems: 'center' } : undefined}>
        <div className={`pizarra-lienzo ${plantillaActiva ? 'pizarra-colocando' : ''}`} style={tamano ? { width: tamano.w, height: tamano.h } : undefined}>
          <PizarraCancha ref={svg} doc={vista} poses={poses} estelas={estelas} modoEstela={modoEstela} automaticas={automaticas} fantasmas={fantasmas} pegadas={pegadas} iman={iman} seleccion={soloLectura ? [] : seleccion} zoom={zoom} pan={pan} caja={caja} toque={toque} arrastrando={arrastrando} giro={forzarVertical ? -90 : 90}
            alturas={alturas} opacidades={opacidades} foco={foco} camara={camara} verOcultos={!soloLectura && !animando}
            onElemento={soloLectura ? undefined : iniciar} onExtremo={soloLectura ? undefined : iniciarExtremo} onVertice={soloLectura ? undefined : iniciarVertice} onFondo={fondo} onPointerDownCapture={registrarPuntero}
            onPointerMove={mover} onPointerUp={e => terminar(e)} onPointerCancel={e => terminar(e, true)} />
          {!soloLectura && !reproduciendo && <button type="button" className="pizarra-flotante pizarra-agregar" aria-label={menu ? 'Cerrar menú para agregar' : 'Agregar a la cancha'} aria-expanded={menu} disabled={bloqueado} onClick={() => setMenu(m => !m)}>{menu ? '✕' : '＋'} <span>Agregar</span></button>}
          {!soloLectura && <PizarraMenuAgregar abierto={menu && !bloqueado} herramienta={herramienta} arrastre={arrastreMenu} onFormacion={formacion} onCerrar={cerrarMenu} deshabilitado={bloqueado} />}
          {!soloLectura && plantillaActiva && !menu && <div className="pizarra-flotante pizarra-colocando-aviso" role="status">
            <IconoHerramienta id={herramienta} /><span>{LINEAS.includes(plantillaActiva.tipo) ? `${plantillaActiva.nombre}: arrastrá de la salida al destino` : `${plantillaActiva.nombre}: tocá la cancha para colocar`}</span>
            <button type="button" onClick={() => setHerramienta('seleccionar')}>Listo</button>
          </div>}
          {!soloLectura && !animando && !menu && movil && elegido && !hoja && <button type="button" className="pizarra-flotante pizarra-opciones" aria-label="Opciones del elemento" title="Opciones (o doble toque sobre el elemento)" onClick={() => setHoja(true)}>⋯</button>}
          {!soloLectura && !animando && !menu && (!movil || hoja) && <PizarraPropiedades arriba={movil && hojaDe?.arriba} elegido={elegido} cantidad={seleccion.length} foco={elegido && enPaso.foco === elegido.id} oculto={ocultosEnPaso}
            propiedad={propiedad} onGirar={() => rotar(((doc.pasos[indice].poses[elegido.id].rotacion + 195) % 360) - 180)} onDuplicar={duplicar} onBorrar={borrar}
            onPegarPelota={pegarPelotaAElegida} onFoco={() => cambiar(alternarFoco(doc, indice, elegido.id))} onOcultar={() => cambiar(alternarOcultos(doc, indice, seleccion))} onCerrar={() => movil ? setHoja(false) : setSeleccion([])} />}
          {textoPaso && <p className="pizarra-subtitulo" aria-live="polite">{textoPaso}</p>}
          {zoom !== 1 && <button type="button" className="pizarra-flotante pizarra-ajustar" onClick={ajustarVista}>Ajustar vista</button>}
          {aviso && <div className="pizarra-flotante pizarra-aviso" role="status"><span>{aviso}</span><button type="button" onClick={() => historialAccion('deshacer')}>Deshacer</button></div>}
        </div>
        <div ref={cajaLinea} className="pizarra-caja-linea" style={tamano ? { width: tamano.w, maxWidth: '100%' } : undefined}><PizarraLineaTiempo doc={doc} indice={indice} indiceVisible={indiceVisible} animando={animando} tiempo={tiempo} total={total} tiempos={tiempos}
          reproduciendo={reproduciendo} velocidad={velocidad} bucle={bucle} soloLectura={soloLectura} bloqueado={bloqueado}
          onReproducir={alternarReproduccion} onPaso={elegirPaso} onAnterior={pasoAnterior} onSiguiente={pasoSiguiente} onBuscar={buscar}
          onVelocidad={v => { setVelocidad(v); ajustar({ ...doc, velocidad: v }) }} onBucle={b => { setBucle(b); ajustar({ ...doc, bucle: b }) }}
          vista={preferencias} onVista={cambiarVista} recorrido={doc.recorrido} onRecorrido={r => ajustar({ ...doc, recorrido: r })} /></div>
      </div>
      <aside className="pizarra-lateral">{pasos}</aside>
    </div>
    {fantasma && <div className="pizarra-fantasma" aria-hidden="true" style={{ transform: `translate(${fantasma.x}px, ${fantasma.y}px)` }}><IconoHerramienta id={fantasma.id} /></div>}
    {/* Copia para exportar con la orientación guardada aunque la vista esté de pie. */}
    {!soloLectura && <div hidden><PizarraCancha ref={svgExportar} miniatura doc={doc} poses={doc.pasos[indice].poses} opacidades={calcularOpacidades(doc, null, indice)} /></div>}
  </div>
}
