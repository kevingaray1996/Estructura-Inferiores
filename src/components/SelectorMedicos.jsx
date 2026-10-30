import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './selectorMedicos.css'

// Select-only combobox. El valor se confirma al elegir, nunca al recorrer opciones.
export default function SelectorMedicos({ label, value, onChange, options, disabled = false, className = '' }) {
  const id = useId()
  const boton = useRef(null)
  const lista = useRef(null)
  const busqueda = useRef({ texto: '', tiempo: 0 })
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const [posicion, setPosicion] = useState({})
  const visible = abierto && !disabled
  const elegido = options.find(o => o.value === value)

  function medir() {
    const r = boton.current.getBoundingClientRect()
    const v = window.visualViewport
    const arriba = v?.offsetTop || 0, izquierda = v?.offsetLeft || 0
    const alto = v?.height || window.innerHeight, ancho = v?.width || window.innerWidth
    const inferior = arriba + alto - r.bottom - 8, superior = r.top - arriba - 8
    const haciaArriba = inferior < 180 && superior > inferior
    const maxHeight = Math.max(0, Math.min(280, alto * .5, haciaArriba ? superior : inferior))
    const width = Math.min(Math.max(r.width, 220), ancho - 16)
    return { position: 'fixed', left: Math.max(izquierda + 8, Math.min(r.left, izquierda + ancho - width - 8)), width, maxHeight,
      ...(haciaArriba ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) }
  }
  function abrir(indice = Math.max(0, options.findIndex(o => o.value === value))) {
    if (disabled || boton.current?.matches(':disabled') || !options.length) return
    setPosicion(medir()); setActivo(indice); setAbierto(true)
    busqueda.current = { texto: '', tiempo: 0 }
  }
  function elegir(indice) {
    if (disabled || boton.current?.matches(':disabled')) return
    if (options[indice]) onChange(options[indice].value)
    setAbierto(false)
  }
  useEffect(() => {
    if (!visible) return
    const exterior = e => { if (!boton.current?.contains(e.target) && !lista.current?.contains(e.target)) setAbierto(false) }
    const ajustar = () => setPosicion(medir())
    document.addEventListener('pointerdown', exterior)
    document.addEventListener('focusin', exterior)
    window.addEventListener('resize', ajustar)
    window.addEventListener('scroll', ajustar, true)
    window.visualViewport?.addEventListener('resize', ajustar)
    window.visualViewport?.addEventListener('scroll', ajustar)
    return () => {
      document.removeEventListener('pointerdown', exterior); document.removeEventListener('focusin', exterior)
      window.removeEventListener('resize', ajustar); window.removeEventListener('scroll', ajustar, true)
      window.visualViewport?.removeEventListener('resize', ajustar); window.visualViewport?.removeEventListener('scroll', ajustar)
    }
  }, [visible])
  useLayoutEffect(() => {
    if (!visible) return
    const opcion = lista.current?.children[activo]
    if (!opcion) return
    const contenedor = lista.current
    if (opcion.offsetTop < contenedor.scrollTop) contenedor.scrollTop = opcion.offsetTop
    else if (opcion.offsetTop + opcion.offsetHeight > contenedor.scrollTop + contenedor.clientHeight) contenedor.scrollTop = opcion.offsetTop + opcion.offsetHeight - contenedor.clientHeight
  }, [activo, visible])

  function teclado(e) {
    if (disabled || !options.length) return
    const max = options.length - 1
    if (e.key === 'Escape') { if (visible) { e.preventDefault(); e.stopPropagation(); setAbierto(false) }; return }
    if (e.key === 'Tab') { if (visible) elegir(activo); return }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (visible) elegir(activo); else abrir(); return }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(e.key)) {
      e.preventDefault()
      const base = visible ? activo : Math.max(0, options.findIndex(o => o.value === value))
      const siguiente = e.key === 'Home' ? 0 : e.key === 'End' ? max : Math.max(0, Math.min(max, base + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : e.key === 'PageDown' ? 10 : -10)))
      if (!visible) abrir(['ArrowDown', 'ArrowUp'].includes(e.key) ? base : siguiente)
      else setActivo(siguiente)
      return
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      const normalizar = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      const anterior = busqueda.current, ahora = Date.now()
      const texto = ahora - anterior.tiempo < 700 ? anterior.texto + e.key : e.key
      const patron = new Set(texto.toLowerCase()).size === 1 ? e.key : texto
      busqueda.current = { texto, tiempo: ahora }
      const inicio = visible ? activo : Math.max(0, options.findIndex(o => o.value === value))
      const orden = options.map((_, i) => (inicio + 1 + i) % options.length)
      const encontrado = orden.find(i => normalizar(options[i].label).startsWith(normalizar(patron)))
      if (!visible) abrir(encontrado ?? inicio)
      else if (encontrado !== undefined) setActivo(encontrado)
    }
  }
  return <div className={`selector-medicos ${className}`}>
    <label id={`${id}-label`} htmlFor={id}>{label}</label>
    <button ref={boton} id={id} type="button" role="combobox" disabled={disabled} aria-labelledby={`${id}-label`} aria-expanded={visible}
      aria-haspopup="listbox" aria-controls={visible ? `${id}-lista` : undefined} aria-activedescendant={visible ? `${id}-opcion-${activo}` : undefined}
      onKeyDown={teclado} onClick={() => visible ? setAbierto(false) : abrir()}>
      <span>{elegido?.label || 'Seleccionar…'}</span><span aria-hidden="true">▾</span>
    </button>
    {visible && createPortal(<div ref={lista} id={`${id}-lista`} role="listbox" aria-labelledby={`${id}-label`} className="selector-medicos-lista" style={posicion}>
      {options.map((opcion, i) => <div key={opcion.value} id={`${id}-opcion-${i}`} role="option" aria-selected={opcion.value === value}
        data-activa={activo === i} onPointerDown={e => { if (e.pointerType === 'mouse') e.preventDefault() }}
        onClick={() => { elegir(i); boton.current?.focus({ preventScroll: true }) }}>
        <span>{opcion.label}</span><span aria-hidden="true">{opcion.value === value ? '✓' : ''}</span>
      </div>)}
    </div>, document.body)}
  </div>
}
