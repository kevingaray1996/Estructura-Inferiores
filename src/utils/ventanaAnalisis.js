import { CANAL_VENTANA_ANALISIS, ID_CONTENIDO_ANALISIS, RUTA_VENTANA_ANALISIS, esVentanaAnalisis } from './rutaVentanaAnalisis.js'

// Una sola raíz de Análisis controla ambas ventanas. No se transmiten sesiones,
// credenciales ni eventos de negocio por URL, storage o BroadcastChannel.
export function crearVentanaAnalisis(host, antesDeCambiar = () => {}) {
  let estado = { modo: null, nodo: null, conectado: true, revision: 0, aviso: '', reintento: null }
  let auxiliar = null, documento = null, intervalo = null, observador = null, descargas = []
  let escuchando = false, inicioCarga = 0
  const origen = host?.location?.origin
  const oyentes = new Set(), nombre = `comunicaciones-analisis-${crypto.randomUUID()}`
  const avisar = cambios => {
    const traslado = ['modo', 'nodo', 'conectado'].some(k => Object.hasOwn(cambios, k) && cambios[k] !== estado[k])
    estado = { ...estado, ...cambios, revision: estado.revision + (traslado ? 1 : 0) }; oyentes.forEach(fn => fn())
  }
  const limpiarDocumento = () => { descargas.forEach(fn => fn()); descargas = []; observador?.disconnect(); observador = null }
  function conectado() {
    if (!estado.modo) return true
    try { return Boolean(auxiliar && !auxiliar.closed && esVentanaAnalisis(auxiliar.location.href, origen) && auxiliar.document === documento && estado.nodo?.isConnected && estado.conectado) } catch { return false }
  }
  function copiarEstilos() {
    if (!documento || !auxiliar || auxiliar.closed) return
    documento.querySelectorAll('[data-estilo-analisis]').forEach(n => n.remove())
    host.document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach(n => {
      const copia = n.cloneNode(true)
      if (n.tagName === 'LINK') copia.href = n.href
      copia.setAttribute('data-estilo-analisis', ''); documento.head.appendChild(copia)
    })
    documento.documentElement.lang = 'es'
    const apariencia = host.document.documentElement.getAttribute('data-apariencia')
    if (apariencia) documento.documentElement.setAttribute('data-apariencia', apariencia)
    else documento.documentElement.removeAttribute('data-apariencia')
  }
  function prepararDocumento(nodo) {
    limpiarDocumento()
    documento = auxiliar.document
    // El marco React de la ruta real crea este nodo. Nunca reemplazar body ni
    // insertar HTML en about:blank: el iframe necesita una referencia HTTP real.
    nodo.setAttribute('data-sesion-analisis', nombre)
    documento.title = 'Comunicaciones · Análisis en dos ventanas'
    copiarEstilos()
    if (host.MutationObserver) {
      observador = new host.MutationObserver(copiarEstilos)
      observador.observe(host.document.head, { childList: true, subtree: true, characterData: true })
      observador.observe(host.document.documentElement, { attributes: true, attributeFilter: ['data-apariencia'] })
    }
    const descargando = () => {
      if (!estado.conectado) return
      antesDeCambiar(estado.modo, estado.modo)
      inicioCarga = Date.now()
      avisar({ conectado: false, nodo: null, aviso: 'La ventana auxiliar está reconectando. El etiquetado queda bloqueado.' })
    }
    auxiliar.addEventListener('pagehide', descargando)
    auxiliar.addEventListener('beforeunload', descargando)
    descargas.push(() => { try { auxiliar?.removeEventListener('pagehide', descargando); auxiliar?.removeEventListener('beforeunload', descargando) } catch { /* Ventana cerrada. */ } })
    avisar({ nodo, conectado: true, aviso: '', reintento: null })
    confirmarConexion()
  }
  function acoplar(aviso = '', reintento = null) {
    const modo = estado.modo
    if (modo) antesDeCambiar(modo, null)
    limpiarDocumento()
    if (intervalo) host.clearInterval(intervalo)
    intervalo = null
    host?.removeEventListener('message', recibir)
    escuchando = false
    const ventana = auxiliar
    auxiliar = null; documento = null
    avisar({ modo: null, nodo: null, conectado: true, aviso, reintento })
    try { if (ventana && !ventana.closed) ventana.close() } catch { /* Ya cerrada. */ }
  }
  function revisar() {
    if (!auxiliar) return
    try {
      if (auxiliar.closed) { acoplar('La ventana auxiliar se cerró. La vista volvió a integrarse.'); return }
      // Durante la navegación inicial puede existir un documento provisional.
      // No montar el reproductor hasta que cargue la ruta real y su marco React.
      if (Date.now() - inicioCarga > 20000 && !estado.conectado) {
        acoplar('La ventana se abrió, pero no confirmó su conexión. Volvé a intentarlo desde el botón Reintentar separación.', estado.modo); return
      }
      if (auxiliar.location.href === 'about:blank') return
      if (!esVentanaAnalisis(auxiliar.location.href, origen)) { acoplar('La ventana auxiliar salió de la ruta de Análisis. Volvé a intentarlo.', estado.modo); return }
      if (auxiliar.document === documento && !estado.conectado) return
      const nodo = auxiliar.document.getElementById(ID_CONTENIDO_ANALISIS)
      if (!nodo || nodo.getAttribute('data-ventana-analisis') !== 'lista') return
      if (auxiliar.document !== documento || estado.nodo !== nodo || !estado.nodo?.isConnected) {
        if (estado.conectado) antesDeCambiar(estado.modo, estado.modo)
        prepararDocumento(nodo)
      }
    } catch { acoplar('No se pudo acceder a la ventana auxiliar. Se recuperó la vista principal; podés reintentar.', estado.modo) }
  }
  function confirmarConexion() {
    if (!conectado()) return
    try { auxiliar.postMessage({ canal: CANAL_VENTANA_ANALISIS, tipo: 'conectada' }, origen) } catch { /* El cierre se recupera al revisar. */ }
  }
  function recibir(event) {
    if (!auxiliar || event.source !== auxiliar || event.origin !== origen || event.data?.canal !== CANAL_VENTANA_ANALISIS || event.data.tipo !== 'lista') return
    revisar()
    confirmarConexion()
  }
  function enfocar() {
    try { auxiliar.focus() }
    catch { avisar({ aviso: 'La ventana está abierta. Si Chrome no permite traerla al frente, seleccionála desde su barra de tareas.' }) }
  }
  function separar(modo) {
    if (!['reproductor', 'botonera'].includes(modo)) return false
    if (conectado() && auxiliar) {
      if (estado.modo !== modo) { antesDeCambiar(estado.modo, modo); avisar({ modo, aviso: '', reintento: null }) }
      enfocar(); return true
    }
    // Abrir sincrónicamente desde el clic, antes de cualquier await.
    let ventana
    try {
      if (!escuchando) { host.addEventListener('message', recibir); escuchando = true }
      ventana = host.open(new URL(RUTA_VENTANA_ANALISIS, host.location.href).href, nombre, 'popup=yes,width=1100,height=800,resizable=yes,scrollbars=yes')
    } catch {
      avisar({ aviso: 'Chrome no permitió abrir la ventana auxiliar. Permití ventanas emergentes para este sitio y pulsá Reintentar separación.', reintento: modo })
      if (!auxiliar) { host.removeEventListener('message', recibir); escuchando = false }
      return false
    }
    if (!ventana) {
      avisar({ aviso: 'El navegador bloqueó la ventana. Permití ventanas emergentes para este sitio y pulsá Reintentar separación.', reintento: modo })
      if (!auxiliar) { host.removeEventListener('message', recibir); escuchando = false }
      return false
    }
    antesDeCambiar(estado.modo, modo)
    auxiliar = ventana
    inicioCarga = Date.now()
    avisar({ modo, nodo: null, conectado: false, aviso: 'Abriendo la ventana y esperando su conexión…', reintento: null })
    if (!intervalo) intervalo = host.setInterval(revisar, 500)
    revisar()
    enfocar()
    return true
  }
  return {
    establecerAntes: fn => { antesDeCambiar = fn },
    getSnapshot: () => estado, subscribe: fn => { oyentes.add(fn); return () => oyentes.delete(fn) },
    separar, acoplar, conectado, revisar,
    cerrar: () => acoplar(),
  }
}

// El bloqueo se toma antes del primer await y se comparte entre las dos vistas.
export function crearBloqueoEtiquetado() {
  let ocupado = false
  return { entrar() { if (ocupado) return false; ocupado = true; return true }, salir() { ocupado = false } }
}

export function leerTiempoActivo({ player, iframe, listo, partidoId, partidoListo, conectado, pendiente }) {
  if (!conectado || pendiente || !listo || !player || !iframe?.isConnected || iframe.ownerDocument?.defaultView?.closed || !partidoId || partidoListo !== partidoId) {
    throw Error('El reproductor activo no está confirmado para este partido. Esperá la reconexión o la confirmación del comando.')
  }
  const tiempo = player.getCurrentTime?.()
  if (!Number.isFinite(tiempo) || tiempo < 0) throw Error('YouTube no devolvió un tiempo válido. No se registró la acción.')
  return Math.floor(tiempo)
}

// Un error SQL explícito rechaza la operación. Transporte, gateway o respuesta
// incompleta pueden haber perdido la confirmación: no ofrecer reenvío automático.
export function registroInciertoTrasError(error) {
  return !/^[0-9A-Z]{5}$/.test(error?.code || '')
}
