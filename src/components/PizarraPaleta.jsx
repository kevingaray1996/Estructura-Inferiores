import { useState } from 'react'
import PizarraObjeto from './PizarraObjeto'
import PizarraCancha from './PizarraCancha'
import { HERRAMIENTAS, SUPERFICIES } from '../utils/pizarra'

const GRUPOS = {
  Jugadoras: ['jugadora'],
  Materiales: ['pelota', 'cono', 'tortuga', 'escalera', 'valla', 'pica', 'aro', 'arco', 'mini'],
  Movimientos: ['flecha', 'curva', 'punteada', 'conduccion', 'pase', 'movimiento', 'remate'],
  Dibujo: ['zona', 'rectangulo', 'circulo', 'texto'],
  Canchas: [],
}

export default function PizarraPaleta({ herramienta, elegir, superficie, cambiarSuperficie, deshabilitada, alArrastrar, alTerminar }) {
  const [grupo, setGrupo] = useState('Materiales')
  return <details className="pizarra-biblioteca" open>
    <summary>Objetos y canchas <span>Elegí o arrastrá</span></summary>
    <fieldset disabled={deshabilitada}>
      <div className="pizarra-categorias" role="group" aria-label="Categorías de herramientas">{Object.keys(GRUPOS).map(g => <button type="button" key={g} aria-pressed={grupo === g} onClick={() => setGrupo(g)}>{g}</button>)}</div>
      <div className="pizarra-paleta" aria-label="Herramientas de pizarra">
        {GRUPOS[grupo].map(tipo => {
          const esLinea = ['flecha', 'curva', 'punteada', 'conduccion', 'pase', 'movimiento', 'remate'].includes(tipo)
          const e = { tipo, tamano: tipo === 'pelota' ? 8 : tipo === 'jugadora' ? 7 : 5, color: tipo === 'pelota' ? '#FFFFFF' : tipo === 'jugadora' ? '#F2C230' : esLinea ? '#FFFFFF' : '#FF922D', tinta: '#111111', grosor: .6, numero: '10', texto: tipo === 'texto' ? 'ABC' : '', dx: 22, dy: 0, curva: 5 }
          return <button type="button" key={tipo} className="pizarra-objeto" title={`${HERRAMIENTAS[tipo]}: arrastrar o tocar y colocar`} aria-label={HERRAMIENTAS[tipo]} aria-pressed={herramienta === tipo}
            draggable={!deshabilitada} onDragStart={event => { event.dataTransfer.setData('application/x-comunicaciones-herramienta', tipo); event.dataTransfer.effectAllowed = 'copy'; alArrastrar(tipo) }} onDragEnd={alTerminar}
            onClick={() => elegir(tipo)}>
            <svg viewBox={esLinea ? '-4 -12 34 24' : ['arco', 'mini'].includes(tipo) ? '-12 -8 26 12' : '-12 -12 24 24'} aria-hidden="true" focusable="false"><PizarraObjeto e={e} ancho={100} alto={100} /></svg>
            <span>{HERRAMIENTAS[tipo]}</span>
          </button>
        })}
        {grupo === 'Canchas' && Object.entries(SUPERFICIES).map(([tipo, s]) => <button type="button" key={tipo} className="pizarra-objeto pizarra-superficie" aria-label={s[2]} aria-pressed={superficie === tipo} onClick={() => cambiarSuperficie(tipo)}>
          <PizarraCancha miniatura doc={{ superficie: tipo, orientacion: 'horizontal', ataque: 'derecha', elementos: [] }} poses={{}} /><span>{s[2]}</span>
        </button>)}
      </div>
      <p className="pizarra-ayuda">{grupo === 'Canchas' ? 'Cambiar superficie conserva el diseño.' : 'Tocá un objeto y después la cancha. En computadora también podés arrastrarlo.'}</p>
    </fieldset>
  </details>
}
