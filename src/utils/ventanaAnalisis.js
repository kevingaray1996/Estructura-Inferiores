// Una sola raíz React controla ambas ventanas. No se transmiten sesiones,
// credenciales ni eventos de negocio por URL, storage o BroadcastChannel.
export function crearVentanaAnalisis(host, antesDeCambiar = () => {}) {
  let estado = { modo: null, nodo: null, conectado: true, revision: 0, aviso: '' }
  let auxiliar = null, documento = null, intervalo = null, observador = null, descargas = []
  const oyentes = new Set(), nombre = `comunicaciones-analisis-${crypto.randomUUID()}`
  const avisar = cambios => { estado = { ...estado, ...cambios, revision: estado.revision + 1 }; oyentes.forEach(fn => fn()) }
  const limpiarDocumento = () => { descargas.forEach(fn => fn()); descargas = []; observador?.disconnect(); observador = null }
  function conectado() {
    if (!estado.modo) return true
    try { return Boolean(auxiliar && !auxiliar.closed && auxiliar.document === documento && estado.nodo?.isConnected && estado.conectado) } catch { return false }
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
  function prepararDocumento() {
    limpiarDocumento()
    documento = auxiliar.document
    const nodo = documento.createElement('main')
    nodo.setAttribute('data-sesion-analisis', nombre)
    documento.body.replaceChildren(nodo)
    documento.title = 'Comunicaciones · Análisis en dos ventanas'
    const viewport = documento.createElement('meta'); viewport.name = 'viewport'; viewport.content = 'width=device-width, initial-scale=1'; documento.head.appendChild(viewport)
    copiarEstilos()
    if (host.MutationObserver) {
      observador = new host.MutationObserver(copiarEstilos)
      observador.observe(host.document.head, { childList: true, subtree: true, characterData: true })
      observador.observe(host.document.documentElement, { attributes: true, attributeFilter: ['data-apariencia'] })
    }
    const descargando = () => {
      if (!estado.conectado) return
      antesDeCambiar(estado.modo, estado.modo)
      avisar({ conectado: false, nodo: null, aviso: 'La ventana auxiliar está reconectando. El etiquetado queda bloqueado.' })
    }
    auxiliar.addEventListener('pagehide', descargando)
    auxiliar.addEventListener('beforeunload', descargando)
    descargas.push(() => { try { auxiliar?.removeEventListener('pagehide', descargando); auxiliar?.removeEventListener('beforeunload', descargando) } catch { /* Ventana cerrada. */ } })
    avisar({ nodo, conectado: true, aviso: '' })
  }
  function acoplar(aviso = '') {
    const modo = estado.modo
    if (modo) antesDeCambiar(modo, null)
    limpiarDocumento()
    if (intervalo) host.clearInterval(intervalo)
    intervalo = null
    const ventana = auxiliar
    auxiliar = null; documento = null
    avisar({ modo: null, nodo: null, conectado: true, aviso })
    try { if (ventana && !ventana.closed) ventana.close() } catch { /* Ya cerrada. */ }
  }
  function revisar() {
    if (!auxiliar) return
    try {
      if (auxiliar.closed) { acoplar('La ventana auxiliar se cerró. La vista volvió a integrarse.'); return }
      if (auxiliar.location.href !== 'about:blank') { acoplar('Se perdió la conexión con la ventana auxiliar.'); return }
      if (auxiliar.document === documento && !estado.conectado) return
      if (auxiliar.document !== documento || !estado.nodo?.isConnected) {
        if (auxiliar.document.readyState === 'loading') return
        if (estado.conectado) antesDeCambiar(estado.modo, estado.modo)
        prepararDocumento()
      }
    } catch { acoplar('La ventana auxiliar dejó de estar disponible. Se recuperó la vista principal.') }
  }
  function separar(modo) {
    if (!['reproductor', 'botonera'].includes(modo)) return false
    if (estado.modo === modo && conectado()) { auxiliar.focus(); return true }
    // Abrir sincrónicamente desde el clic, antes de cualquier await.
    const ventana = host.open('', nombre, 'popup=yes,width=1100,height=800,resizable=yes,scrollbars=yes')
    if (!ventana) { avisar({ aviso: 'El navegador bloqueó la ventana. Permití ventanas emergentes para este sitio y volvé a pulsar Separar.' }); return false }
    antesDeCambiar(estado.modo, modo)
    auxiliar = ventana
    estado = { ...estado, modo }
    try { prepararDocumento() } catch {
      acoplar('No se pudo preparar la ventana auxiliar. Se mantuvo la vista integrada.'); return false
    }
    if (!intervalo) intervalo = host.setInterval(revisar, 500)
    ventana.focus()
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
