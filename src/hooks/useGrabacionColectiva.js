import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cerrarGrabacion, cerrarUltima, cerrarVencidas, finProvisorio, tocarColectiva } from '../utils/analisis/colectiva'

// Momentos colectivos abiertos («Grabando…»): como mucho una fase y uno de Charla a la vez (Charla se superpone).
//
// Guardado: cada momento se guarda APENAS se abre, con un fin provisorio (inicio + duración por defecto), por la
// misma cola de siempre (al instante, de fondo y con reintento). Al cerrarlo se corrige el fin. Si la página se
// recarga con un momento abierto, queda guardado con su fin provisorio (que se ajusta después en la línea de tiempo).
//
// registrar({ tipo, segundo, segundo_fin, partidoId }) → id del momento guardado (o null si no se pudo: sin video,
//   sin permiso…). actualizarFin(id, segundo_fin) corrige el fin al cerrar.
// tocar(tipo): abre; si ya está abierto, lo cierra. Una fase nueva cierra la fase abierta en este segundo; un botón
// de Charla no cierra la fase (y una fase no cierra la Charla). cerrar(): Enter, cierra el último abierto.
// cerrarTodas(): al pasar a la botonera individual. olvidar(id): el momento se deshizo o se borró.
export default function useGrabacionColectiva({ reloj, catalogo, partidoId, activa, registrar, actualizarFin }) {
  const [abiertas, setAbiertas] = useState([])
  const actual = useRef(abiertas)
  const ultimas = useRef({ registrar, actualizarFin, catalogo })
  useLayoutEffect(() => { ultimas.current = { registrar, actualizarFin, catalogo } })

  const fijar = useCallback((lista) => { actual.current = lista; setAbiertas(lista) }, [])

  // Cierra: solo se manda el fin si es distinto del provisorio con el que ya está guardado.
  const confirmarCierres = useCallback((cerradas, antes) => {
    for (const c of cerradas) {
      const original = antes.find((g) => g.id === c.id)
      if (c.id && original && c.segundo_fin !== finProvisorio(original)) ultimas.current.actualizarFin(c.id, c.segundo_fin)
    }
  }, [])

  const tocar = useCallback((tipo) => {
    if (!activa) return
    const antes = actual.current
    const resultado = tocarColectiva(antes, tipo, reloj.leer(), ultimas.current.catalogo)
    // Primero el cierre del anterior (en la cola va antes que el alta del nuevo).
    confirmarCierres(resultado.cerradas, antes)
    let nuevas = resultado.abiertas
    if (resultado.abierto) {
      // El que se acaba de abrir es el último: se guarda ya, con su fin provisorio.
      const nueva = { ...nuevas[nuevas.length - 1], partidoId }
      const id = ultimas.current.registrar({ tipo: nueva.tipo, segundo: nueva.inicio, segundo_fin: finProvisorio(nueva), partidoId })
      nuevas = id ? [...nuevas.slice(0, -1), { ...nueva, id }] : nuevas.slice(0, -1)
    }
    fijar(nuevas)
  }, [activa, reloj, partidoId, fijar, confirmarCierres])

  const cerrar = useCallback(() => {
    const antes = actual.current
    const resultado = cerrarUltima(antes, reloj.leer())
    fijar(resultado.abiertas)
    confirmarCierres(resultado.cerradas, antes)
  }, [reloj, fijar, confirmarCierres])

  const cerrarTodas = useCallback(() => {
    const antes = actual.current
    const segundo = reloj.leer()
    fijar([])
    confirmarCierres(antes.map((g) => cerrarGrabacion(g, segundo)), antes)
  }, [reloj, fijar, confirmarCierres])

  const olvidar = useCallback((id) => {
    if (actual.current.some((g) => g.id === id)) fijar(actual.current.filter((g) => g.id !== id))
  }, [fijar])

  // Se cierra solo con la duración por defecto: ya está guardado con ese fin, no hace falta mandar nada.
  useEffect(() => reloj.suscribir(() => {
    const resultado = cerrarVencidas(actual.current, reloj.leer())
    if (resultado.cerradas.length) fijar(resultado.abiertas)
  }), [reloj, fijar])

  // Al cambiar de partido, los abiertos del otro partido quedan con su fin provisorio.
  useEffect(() => {
    if (partidoId && actual.current.some((g) => g.partidoId !== partidoId)) fijar(actual.current.filter((g) => g.partidoId === partidoId))
  }, [partidoId, fijar])

  return { abiertas, tocar, cerrar, cerrarTodas, olvidar }
}
