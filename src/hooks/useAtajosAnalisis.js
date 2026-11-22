import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { accionDeTecla, botonMarcadorDeTecla, escribiendoEnCampo, teclaDeEvento } from '../utils/analisis/atajos'

const esIframe = (elemento) => String(elemento?.tagName || '').toUpperCase() === 'IFRAME'

// Escucha el teclado en la ventana principal y, si hay una ventana separada (reproductor o botonera), también ahí.
//
// YouTube: al hacer clic en el video el teclado queda dentro del iframe y la página no lo puede leer. Cuando el foco
// entra al iframe, se lo devuelve a la página enseguida (el clic en el video ya llegó a YouTube). Si no se puede
// (por ejemplo, el foco está en otra aplicación), el estado pasa a «pausados» hasta volver a la página.
//
// acciones: { marcar(tipo), alternar(), saltar(delta), deshacer(), ayuda(), interceptar?(evento), marcador?(boton) }. Se leen siempre las
// últimas. interceptar va primero (por ejemplo, la Playlist con ↑ / ↓ y el dorsal); si devuelve true, la tecla ya se usó.
// pausar: true mientras se está eligiendo una tecla nueva en el editor de atajos.
export default function useAtajosAnalisis({ activo, mapa, principal, auxiliar = null, acciones, pausar = false }) {
  const [estado, setEstado] = useState('activos')
  const ultimas = useRef({ mapa, acciones, pausar })
  useLayoutEffect(() => { ultimas.current = { mapa, acciones, pausar } })

  useEffect(() => {
    if (!activo || !principal) return undefined
    const lista = [principal, auxiliar].filter(Boolean)
    const limpiezas = []
    const temporizadores = new Set()
    const despues = (fn) => { const t = setTimeout(() => { temporizadores.delete(t); fn() }, 0); temporizadores.add(t) }
    const revisarFoco = () => {
      const alguna = lista.some((w) => {
        try { return w.document.hasFocus() && !esIframe(w.document.activeElement) } catch { return false }
      })
      setEstado(alguna ? 'activos' : 'pausados')
    }

    for (const w of lista) {
      const alTeclear = (evento) => {
        const { mapa: m, acciones: a, pausar: p } = ultimas.current
        if (p || evento.defaultPrevented || evento.isComposing) return
        if (escribiendoEnCampo(evento.target)) return
        // Ctrl/Cmd + Z: deshacer la última acción marcada.
        if ((evento.ctrlKey || evento.metaKey) && !evento.altKey && !evento.shiftKey && String(evento.key).toLowerCase() === 'z') {
          evento.preventDefault(); a.deshacer(); return
        }
        if (evento.ctrlKey || evento.metaKey || evento.altKey) return
        if (evento.repeat) return
        if (a.interceptar?.(evento)) { evento.preventDefault(); return }
        if (evento.key === ' ' || evento.code === 'Space') {
          // Un botón enfocado se «presionaría» con Espacio: acá Espacio siempre es pausa/sigue.
          evento.preventDefault(); a.alternar(); return
        }
        if (evento.key === 'ArrowLeft' || evento.key === 'ArrowRight') {
          evento.preventDefault(); a.saltar(evento.key === 'ArrowLeft' ? -5 : 5); return
        }
        if (evento.key === '?') { evento.preventDefault(); a.ayuda(); return }
        // G / Shift + G / Y / X: botones del marcador (gol nuestro, gol rival, tarjeta, cambio).
        const boton = botonMarcadorDeTecla(evento)
        if (boton && a.marcador) { evento.preventDefault(); a.marcador(boton); return }
        const tecla = teclaDeEvento(evento)
        const tipo = tecla && accionDeTecla(m, tecla)
        if (tipo) { evento.preventDefault(); a.marcar(tipo) }
      }
      const alPerderFoco = () => {
        // El foco llega al iframe de YouTube después del blur: se mira en la vuelta siguiente.
        despues(() => {
          const enfocado = w.document.activeElement
          if (esIframe(enfocado)) {
            try { enfocado.blur(); w.focus() } catch { /* El navegador no lo permitió. */ }
          }
          revisarFoco()
        })
      }
      const alRecuperarFoco = () => despues(revisarFoco)
      w.addEventListener('keydown', alTeclear)
      w.addEventListener('blur', alPerderFoco)
      w.addEventListener('focus', alRecuperarFoco)
      limpiezas.push(() => {
        w.removeEventListener('keydown', alTeclear)
        w.removeEventListener('blur', alPerderFoco)
        w.removeEventListener('focus', alRecuperarFoco)
      })
    }
    despues(revisarFoco)
    return () => { limpiezas.forEach((fn) => fn()); temporizadores.forEach((t) => clearTimeout(t)) }
  }, [activo, principal, auxiliar])

  return activo ? estado : 'apagados'
}
