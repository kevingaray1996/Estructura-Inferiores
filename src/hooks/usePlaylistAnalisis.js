import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  clipDe, faltasDetalle, filtrarPlaylist, progresoDetalle, resolverDorsal, siguientePendiente, vecina,
} from '../utils/analisis/playlist'

// Espera para el segundo número del dorsal (con «1» puede venir «10»).
const ESPERA_DORSAL = 700
const FILTROS_INICIALES = { tipo: 'todos', jugadora: 'todos', soloPendientes: false }

// Estado y acciones de la Playlist de Análisis. La pantalla solo dibuja; los guardados los hace AnalisisSection.
//
// eventos: acciones del partido, en orden. detalles: analisis_pases_detalle por id de acción.
// visible: la pestaña Playlist está a la vista (solo ahí valen ↑ / ↓ y los números).
// irAClip(evento): salta el video al inicio del clip y lo reproduce; devuelve true si pudo.
// guardarCampos(evento, cambios) y guardarReceptora(evento, estado, jugadoraId) devuelven la fila guardada.
export default function usePlaylistAnalisis({
  partidoId, partido = null, eventos, detalles, catalogo, citaciones, visible, puedeEditar, reloj,
  irAClip, guardarCampos, guardarReceptora, avisar, alFallar,
}) {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES)
  const [activoId, setActivoId] = useState(null)
  const [repetir, setRepetir] = useState(false)
  const [avanceAuto, setAvanceAuto] = useState(true)
  const [guardando, setGuardando] = useState({})
  const [dorsalEscrito, setDorsalEscrito] = useState('')

  // Otro partido: la Playlist arranca de cero (sin filtros, sin acción elegida, sin repetir).
  const [partidoVisto, setPartidoVisto] = useState(partidoId)
  if (partidoVisto !== partidoId) {
    setPartidoVisto(partidoId); setFiltros(FILTROS_INICIALES); setActivoId(null); setRepetir(false); setGuardando({})
  }

  const lista = useMemo(() => filtrarPlaylist(eventos, filtros, detalles, catalogo, partido), [eventos, filtros, detalles, catalogo, partido])
  const progreso = useMemo(() => progresoDetalle(eventos, detalles, catalogo, partido), [eventos, detalles, catalogo, partido])
  const eventoActivo = eventos.find((e) => e.id === activoId) || null

  // Funciones del padre siempre al día, sin volver a crear los efectos.
  const ultimas = useRef({})
  useLayoutEffect(() => { ultimas.current = { eventos, detalles, catalogo, partido, citaciones, filtros, irAClip, guardarCampos, guardarReceptora, avisar, alFallar } })

  const elegir = useCallback((id, { saltar = true } = {}) => {
    setActivoId(id)
    const evento = ultimas.current.eventos.find((e) => e.id === id)
    if (saltar && evento) ultimas.current.irAClip(evento)
  }, [])

  const mover = useCallback((paso) => {
    const id = vecina(lista, activoId, paso)
    if (id && id !== activoId) elegir(id)
  }, [lista, activoId, elegir])

  // Después de completar una acción, pasa sola a la siguiente pendiente (si está activado).
  const avanzarSiCorresponde = useCallback((filaGuardada, detalleNuevo) => {
    const { eventos: evs, detalles: dets, catalogo: cat, partido: par, filtros: f } = ultimas.current
    const detallesNuevos = detalleNuevo ? { ...dets, [detalleNuevo.evento_id]: detalleNuevo } : dets
    const actualizada = { ...evs.find((e) => e.id === filaGuardada.id), ...filaGuardada }
    if (faltasDetalle(actualizada, detallesNuevos[actualizada.id], cat, par).length) return
    if (!avanceAuto) return
    const evsNuevos = evs.map((e) => e.id === actualizada.id ? actualizada : e)
    const candidatas = filtrarPlaylist(evsNuevos, { ...f, soloPendientes: false }, detallesNuevos, cat, par)
    const siguiente = siguientePendiente(candidatas, actualizada.id, detallesNuevos, cat, par)
    if (siguiente) elegir(siguiente)
    else ultimas.current.avisar('No quedan acciones por detallar con estos filtros.')
  }, [avanceAuto, elegir])

  const conGuardado = useCallback(async (evento, tarea) => {
    setGuardando((g) => ({ ...g, [evento.id]: 'guardando' }))
    try {
      const resultado = await tarea()
      setGuardando((g) => { const resto = { ...g }; delete resto[evento.id]; return resto })
      return resultado
    } catch (e) {
      // alFallar devuelve el mensaje para mostrarlo en la fila (en el celular el aviso de arriba no se ve).
      const mensaje = ultimas.current.alFallar(e)
      setGuardando((g) => ({ ...g, [evento.id]: mensaje || 'No se guardó. Probá de nuevo.' }))
      return null
    }
  }, [])

  const cambiarCampos = useCallback(async (evento, cambios) => {
    if (!puedeEditar || evento._cola) return
    const fila = await conGuardado(evento, () => ultimas.current.guardarCampos(evento, cambios))
    if (fila) avanzarSiCorresponde(fila, null)
  }, [puedeEditar, conGuardado, avanzarSiCorresponde])

  // valor: 'pendiente' | 'desconocida' | 'no_observable' | id de la jugadora que recibió.
  const cambiarReceptora = useCallback(async (evento, valor) => {
    if (!puedeEditar || evento._cola) return
    const estado = ['pendiente', 'desconocida', 'no_observable'].includes(valor) ? valor : 'identificada'
    const detalle = await conGuardado(evento, () => ultimas.current.guardarReceptora(evento, estado, estado === 'identificada' ? valor : null))
    if (detalle) avanzarSiCorresponde(evento, detalle)
  }, [puedeEditar, conGuardado, avanzarSiCorresponde])

  // Dorsal escrito con números: elige la jugadora de la acción activa.
  const dorsal = useRef({ texto: '', temporizador: null })
  useEffect(() => () => clearTimeout(dorsal.current.temporizador), [])
  const aplicarDorsal = useCallback((texto) => {
    clearTimeout(dorsal.current.temporizador)
    dorsal.current = { texto: '', temporizador: null }
    setDorsalEscrito('')
    const evento = ultimas.current.eventos.find((e) => e.id === activoId)
    if (!evento) return
    const { citacion } = resolverDorsal(ultimas.current.citaciones, texto)
    if (!citacion) { ultimas.current.avisar(`No hay ninguna convocada con el dorsal ${texto}.`); return }
    if (citacion.jugador_id !== evento.jugador_id) cambiarCampos(evento, { jugador_id: citacion.jugador_id })
  }, [activoId, cambiarCampos])

  const escribirDorsal = useCallback((numero) => {
    const texto = (dorsal.current.texto + numero).slice(-2)
    clearTimeout(dorsal.current.temporizador)
    const { citacion, esperar } = resolverDorsal(ultimas.current.citaciones, texto)
    if (citacion && !esperar) { aplicarDorsal(texto); return }
    if (!citacion && !esperar && texto.length === 2) {
      // «7» y después «3»: si no existe el 73, vale el último número como dorsal nuevo.
      const solo = resolverDorsal(ultimas.current.citaciones, numero)
      if (solo.citacion && !solo.esperar) { aplicarDorsal(numero); return }
    }
    dorsal.current = { texto, temporizador: setTimeout(() => aplicarDorsal(texto), ESPERA_DORSAL) }
    setDorsalEscrito(texto)
  }, [aplicarDorsal])

  // Teclas de la Playlist. Las llama primero el hook de atajos; true = tecla usada.
  const interceptar = useCallback((evento) => {
    if (!visible) return false
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') { mover(evento.key === 'ArrowDown' ? 1 : -1); return true }
    if (/^\d$/.test(evento.key) && activoId && puedeEditar) { escribirDorsal(evento.key); return true }
    return false
  }, [visible, mover, activoId, puedeEditar, escribirDorsal])

  // Repetir clip: al pasar el final (5 s después de la acción), vuelve al inicio (3 s antes). Solo cuenta si el video
  // llega al final reproduciendo (hasta 3 s pasado); un salto a otro lado o una lectura vieja no lo dispara.
  const idActivo = eventoActivo?.id, segundoActivo = eventoActivo?.segundo
  useEffect(() => {
    if (!repetir || !visible || !idActivo) return undefined
    const { fin } = clipDe({ segundo: segundoActivo })
    let disparado = false
    return reloj.suscribir(() => {
      const t = reloj.leer()
      if (t >= fin && t <= fin + 3 && !disparado) {
        disparado = true
        const evento = ultimas.current.eventos.find((e) => e.id === idActivo)
        if (evento) ultimas.current.irAClip(evento)
      } else if (t < fin || t > fin + 3) disparado = false
    })
  }, [repetir, visible, idActivo, segundoActivo, reloj])

  // Al prender «Repetir clip» arranca el clip de la acción elegida.
  const cambiarRepetir = useCallback((valor) => {
    setRepetir(valor)
    const evento = ultimas.current.eventos.find((e) => e.id === activoId)
    if (valor && evento) ultimas.current.irAClip(evento)
  }, [activoId])

  const cambiarFiltro = useCallback((clave, valor) => setFiltros((f) => ({ ...f, [clave]: valor })), [])

  return {
    lista, progreso, filtros, cambiarFiltro, activoId, eventoActivo, elegir, mover,
    repetir, setRepetir: cambiarRepetir, avanceAuto, setAvanceAuto, guardando, dorsalEscrito,
    cambiarCampos, cambiarReceptora, interceptar,
  }
}
