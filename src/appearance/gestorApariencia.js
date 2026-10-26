export const PREFERENCIAS_APARIENCIA = ['claro', 'oscuro', 'sistema']
export const PREFERENCIA_INICIAL = 'oscuro'
const memoriaDePagina = new Map()

export const claveApariencia = (usuarioId) => `comunicaciones:apariencia:v1:${usuarioId}`
export const temaEfectivo = (preferencia, sistemaOscuro) =>
  preferencia === 'sistema' ? (sistemaOscuro ? 'oscuro' : 'claro') : preferencia

// Sin dependencias de React, Supabase ni acceso obligatorio al almacenamiento.
export function crearGestorApariencia({ obtenerAlmacen = () => null, sistemaOscuro = false, memoria = memoriaDePagina } = {}) {
  let usuarioId = null
  let preferencia = PREFERENCIA_INICIAL
  let sistema = sistemaOscuro
  let snapshot = { usuarioId, preferencia, temaEfectivo: temaEfectivo(preferencia, sistema) }
  const oyentes = new Set()
  const publicar = () => {
    const tema = temaEfectivo(preferencia, sistema)
    if (snapshot.usuarioId === usuarioId && snapshot.preferencia === preferencia && snapshot.temaEfectivo === tema) return
    snapshot = { usuarioId, preferencia, temaEfectivo: tema }
    oyentes.forEach((fn) => fn())
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(fn) { oyentes.add(fn); return () => oyentes.delete(fn) },
    cambiarUsuario(id) {
      const siguiente = typeof id === 'string' && id ? id : null
      if (siguiente === usuarioId) return
      usuarioId = siguiente
      preferencia = PREFERENCIA_INICIAL
      if (usuarioId) {
        const recordada = memoria.get(usuarioId)
        if (PREFERENCIAS_APARIENCIA.includes(recordada)) {
          preferencia = recordada
        } else {
          try {
            const guardada = obtenerAlmacen()?.getItem(claveApariencia(usuarioId))
            if (PREFERENCIAS_APARIENCIA.includes(guardada)) preferencia = guardada
          } catch { /* Memoria de la pagina como respaldo, sin bloquear el acceso. */ }
        }
      }
      publicar()
    },
    cambiarPreferencia(valor) {
      if (!PREFERENCIAS_APARIENCIA.includes(valor)) throw new Error('Preferencia de apariencia no válida.')
      preferencia = valor
      if (usuarioId) {
        memoria.set(usuarioId, valor)
        try { obtenerAlmacen()?.setItem(claveApariencia(usuarioId), valor) } catch { /* Respaldo en memoria. */ }
      }
      publicar()
    },
    cambiarSistema(oscuro) { sistema = Boolean(oscuro); publicar() },
  }
}
