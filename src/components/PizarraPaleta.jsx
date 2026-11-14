import { memo, useState } from 'react'
import PizarraObjeto from './PizarraObjeto'
import { FORMACIONES, LINEAS, PALETA, plantillaHerramienta } from '../utils/pizarra'

// Menú "＋ Agregar" (ronda de uso): flota sobre la cancha y reemplaza a la paleta lateral y a la barra rápida.
// Tocar un objeto lo deja listo para colocar (el menú se pliega); arrastrarlo lo suelta directo en la cancha.
const GRUPOS = [
  ['Jugadoras', ['jugadora', 'rival']],
  ['Pelota y materiales', ['pelota', 'cono', 'tortuga', 'escalera', 'valla', 'pica', 'aro', 'arco', 'mini']],
  ['Flechas', ['pase', 'conduccion', 'movimiento', 'flecha', 'curva', 'punteada', 'remate']],
  ['Zonas y texto', ['sombra', 'zona', 'rectangulo', 'circulo', 'texto']],
]
const CORTOS = { jugadora: 'Propia', movimiento: 'Sin pelota', arco: 'Arco', mini: 'Arco chico', punteada: 'Punteada', curva: 'Curva', flecha: 'Recta', sombra: 'Sombreada', rectangulo: 'Rectángulo' }

// Ícono de una herramienta (también lo usa el fantasma al arrastrar).
export function IconoHerramienta({ id }) {
  const { tipo, extra } = plantillaHerramienta(id), esLinea = LINEAS.includes(tipo)
  const e = { tipo, tamano: tipo === 'pelota' ? 8 : tipo === 'jugadora' ? 7 : 5, color: tipo === 'pelota' ? PALETA.pelota : tipo === 'sombra' ? PALETA.sombra : tipo === 'jugadora' ? PALETA.local : esLinea ? PALETA.trazo : PALETA.material, tinta: PALETA.tinta, grosor: .6, numero: tipo === 'jugadora' ? '10' : '', texto: tipo === 'texto' ? 'ABC' : '', dx: 22, dy: 0, curva: 5, puntos: [{ x: -9, y: -6 }, { x: 8, y: -8 }, { x: 9, y: 6 }, { x: -7, y: 7 }], ...extra }
  return <svg viewBox={esLinea ? '-4 -12 34 24' : ['arco', 'mini'].includes(tipo) ? '-12 -8 26 12' : '-12 -12 24 24'} aria-hidden="true" focusable="false"><PizarraObjeto e={e} ancho={100} alto={100} /></svg>
}

// `arrastre` = { inicio, mover, fin, cancelar }: manejo con puntero (mouse y dedo) que distingue toque de arrastre.
export default memo(function PizarraMenuAgregar({ abierto, herramienta, arrastre, onFormacion, onCerrar, deshabilitado }) {
  const [equipo, setEquipo] = useState('propio')
  if (!abierto) return null
  const grupo = ([titulo, ids]) => <div key={titulo} className="pizarra-agregar-grupo">
    <h3>{titulo}</h3>
    <div className="pizarra-agregar-grilla">{ids.map(id => {
      const { nombre } = plantillaHerramienta(id)
      return <button type="button" key={id} className="pizarra-objeto" aria-label={nombre} title={nombre} aria-pressed={herramienta === id}
        onPointerDown={e => arrastre.inicio(e, id)} onPointerMove={arrastre.mover} onPointerUp={e => arrastre.fin(e)} onPointerCancel={e => arrastre.fin(e, true)} onClick={e => arrastre.click(e, id)}>
        <IconoHerramienta id={id} /><span>{CORTOS[id] || nombre}</span>
      </button>
    })}</div>
  </div>
  return <section className="pizarra-agregar-menu" role="dialog" aria-label="Agregar a la cancha">
    <header><strong>Agregar</strong><span>Tocá y después la cancha, o arrastrá</span>
      <button type="button" className="pizarra-icono" aria-label="Cerrar menú" onClick={onCerrar}>✕</button></header>
    <fieldset disabled={deshabilitado}>
      {GRUPOS.slice(0, 1).map(grupo)}
      <div className="pizarra-agregar-grupo">
        <h3>Formaciones</h3>
        <div className="pizarra-segmentado pizarra-grupo" role="group" aria-label="Equipo de la formación">
          <button type="button" aria-pressed={equipo === 'propio'} onClick={() => setEquipo('propio')}>Propio</button>
          <button type="button" aria-pressed={equipo === 'rival'} onClick={() => setEquipo('rival')}>Rival</button>
        </div>
        <div className="pizarra-agregar-formaciones">{Object.keys(FORMACIONES).map(sistema =>
          <button type="button" key={sistema} aria-label={`Formación ${sistema} ${equipo === 'rival' ? 'rival' : 'propia'}`} onClick={() => onFormacion(sistema, equipo)}>{sistema}</button>)}</div>
      </div>
      {GRUPOS.slice(1).map(grupo)}
    </fieldset>
  </section>
})
