import { memo } from 'react'
import { IconoHerramienta } from './PizarraPaleta'
import { esRival, HERRAMIENTAS, limitar, LINEAS, PALETA } from '../utils/pizarra'

// Panel de propiedades (ronda de uso): aparece solo con algo seleccionado y muestra lo que corresponde a ese elemento.
const TIPOS_FLECHA = ['pase', 'conduccion', 'movimiento', 'flecha', 'curva', 'punteada', 'remate']
const NOMBRES_FLECHA = { pase: 'Pase', conduccion: 'Conducción', movimiento: 'Sin pelota', flecha: 'Recta', curva: 'Curva', punteada: 'Punteada', remate: 'Remate' }

function Colores({ valor, onCambio }) {
  return <span className="pizarra-colores" role="group" aria-label="Color">
    {PALETA.rapidos.map(c => <button key={c} type="button" className="pizarra-muestra" aria-label={`Color ${c}`} aria-pressed={valor.toLowerCase() === c.toLowerCase()} style={{ '--muestra': c }} onClick={() => onCambio(c, false)} />)}
    <input type="color" aria-label="Otro color" value={valor} onChange={e => onCambio(e.target.value, true)} />
  </span>
}

export default memo(function PizarraPropiedades({ arriba = false, elegido, cantidad, foco, oculto, propiedad, onGirar, onDuplicar, onBorrar, onPegarPelota, onFoco, onOcultar, onCerrar }) {
  if (!elegido) return null
  const varios = cantidad > 1, tipo = elegido.tipo, linea = LINEAS.includes(tipo)
  const nombre = varios ? `${cantidad} seleccionados` : tipo === 'jugadora' ? (esRival(elegido) ? 'Rival' : 'Propia') : linea ? NOMBRES_FLECHA[tipo] : HERRAMIENTAS[tipo]
  const tamano = (delta) => propiedad('tamano', limitar(Math.round((elegido.tamano + delta) * 10) / 10, 1, 12), false)
  return <section className={`pizarra-propiedades${arriba ? ' pizarra-propiedades-arriba' : ''}`} aria-label={`Propiedades: ${nombre}`}>
    <header>
      {!varios && <span className="pizarra-propiedades-icono"><IconoHerramienta id={tipo === 'jugadora' && esRival(elegido) ? 'rival' : tipo} /></span>}
      <strong>{nombre}</strong>
      <button type="button" className="pizarra-icono" aria-label="Cerrar propiedades" title="Soltar selección (Esc)" onClick={onCerrar}>✕</button>
    </header>
    <div className="pizarra-propiedades-campos">
      {!varios && tipo === 'jugadora' && <>
        <label>Número<input maxLength={4} inputMode="numeric" value={elegido.numero} onChange={e => propiedad('numero', e.target.value)} /></label>
        <label>Nombre<input maxLength={200} placeholder="Opcional" value={elegido.texto} onChange={e => propiedad('texto', e.target.value)} /></label>
      </>}
      {!varios && tipo === 'texto' && <label className="pizarra-propiedades-ancho">Texto<input maxLength={200} value={elegido.texto} onChange={e => propiedad('texto', e.target.value)} /></label>}
      {!varios && linea && <label>Tipo<select value={tipo} onChange={e => propiedad('tipo', e.target.value, false)}>
        {TIPOS_FLECHA.map(t => <option key={t} value={t}>{NOMBRES_FLECHA[t]}</option>)}</select></label>}
      {!varios && linea && <label>Grosor<input type="range" min=".1" max="2" step=".1" value={elegido.grosor} onChange={e => propiedad('grosor', Number(e.target.value))} /></label>}
      {!varios && tipo === 'curva' && <label>Curvatura<input type="range" min="-50" max="50" value={elegido.curva} onChange={e => propiedad('curva', Number(e.target.value))} /></label>}
      {!varios && tipo === 'texto' && <label>Tamaño<input type="range" min="1" max="12" step=".2" value={elegido.tamano} onChange={e => propiedad('tamano', Number(e.target.value))} /></label>}
      <div className="pizarra-propiedades-ancho pizarra-propiedades-linea">
        {tipo !== 'pelota' && <Colores valor={elegido.color} onCambio={(c, agrupar) => propiedad('color', c, agrupar)} />}
        {!varios && !linea && !['texto', 'sombra'].includes(tipo) && <span className="pizarra-grupo" role="group" aria-label="Tamaño">
          <button type="button" aria-label="Reducir tamaño" onClick={() => tamano(-.5)}>−</button>
          <button type="button" aria-label="Aumentar tamaño" onClick={() => tamano(.5)}>+</button>
        </span>}
      </div>
    </div>
    <div className="pizarra-propiedades-acciones">
      {!varios && tipo === 'jugadora' && <button type="button" className="pizarra-pegar" title="Poner la pelota a sus pies en este paso" onClick={onPegarPelota}><IconoHerramienta id="pelota" /> Pegar pelota</button>}
      {!varios && tipo === 'jugadora' && <button type="button" title="Resaltar a esta jugadora y acercar la cámara en este paso" aria-pressed={foco} onClick={onFoco}>◎ Foco</button>}
      <button type="button" title={oculto ? 'Mostrar en este paso' : 'Ocultar en este paso (aparece o desaparece al reproducir)'} aria-pressed={oculto} onClick={onOcultar}>{oculto ? '◐ Mostrar' : '◐ Ocultar'}</button>
      {!linea && !['pelota', 'texto'].includes(tipo) && <button type="button" title="Rotar 15 grados en este paso" onClick={onGirar}>↻ Girar</button>}
      <button type="button" aria-label="Duplicar selección" title="Duplicar (Ctrl+D)" onClick={onDuplicar}>⧉ Duplicar</button>
      <button type="button" className="pizarra-peligro" aria-label="Eliminar selección" title="Eliminar (Supr)" onClick={onBorrar}>⌫ Eliminar</button>
    </div>
  </section>
})
