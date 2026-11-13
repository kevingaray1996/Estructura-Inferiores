import { memo, useState } from 'react'
import PizarraObjeto from './PizarraObjeto'
import PizarraCancha from './PizarraCancha'
import { LINEAS, PALETA, plantillaHerramienta, SUPERFICIES } from '../utils/pizarra'

const GRUPOS = {
  Jugadoras: ['jugadora', 'rival'],
  Materiales: ['pelota', 'cono', 'tortuga', 'escalera', 'valla', 'pica', 'aro', 'arco', 'mini'],
  Movimientos: ['flecha', 'curva', 'punteada', 'conduccion', 'pase', 'movimiento', 'remate'],
  Dibujo: ['zona', 'rectangulo', 'circulo', 'texto'],
  Canchas: [],
}

// Ícono de una herramienta (también lo usa la barra rápida del editor).
export function IconoHerramienta({ id }) {
  const { tipo, extra } = plantillaHerramienta(id), esLinea = LINEAS.includes(tipo)
  const e = { tipo, tamano: tipo === 'pelota' ? 8 : tipo === 'jugadora' ? 7 : 5, color: tipo === 'pelota' ? PALETA.pelota : tipo === 'jugadora' ? PALETA.local : esLinea ? PALETA.trazo : PALETA.material, tinta: PALETA.tinta, grosor: .6, numero: tipo === 'jugadora' ? '10' : '', texto: tipo === 'texto' ? 'ABC' : '', dx: 22, dy: 0, curva: 5, ...extra }
  return <svg viewBox={esLinea ? '-4 -12 34 24' : ['arco', 'mini'].includes(tipo) ? '-12 -8 26 12' : '-12 -12 24 24'} aria-hidden="true" focusable="false"><PizarraObjeto e={e} ancho={100} alto={100} /></svg>
}

export default memo(function PizarraPaleta({ herramienta, elegir, superficie, cambiarSuperficie, deshabilitada, alArrastrar, alTerminar, abierta = false, onCerrar }) {
  const [grupo, setGrupo] = useState('Materiales')
  return <section className={`pizarra-biblioteca ${abierta ? 'pizarra-hoja-abierta' : ''}`} aria-label="Objetos y canchas">
    <header className="pizarra-biblioteca-cabecera"><strong>Objetos y canchas</strong><span>Tocá y después la cancha, o arrastrá</span>
      {onCerrar && <button type="button" className="pizarra-hoja-cerrar" aria-label="Cerrar objetos" onClick={onCerrar}>✕</button>}</header>
    <fieldset disabled={deshabilitada}>
      <div className="pizarra-categorias" role="group" aria-label="Categorías de herramientas">{Object.keys(GRUPOS).map(g => <button type="button" key={g} aria-pressed={grupo === g} onClick={() => setGrupo(g)}>{g}</button>)}</div>
      <div className="pizarra-paleta" aria-label="Herramientas de pizarra">
        {GRUPOS[grupo].map(id => {
          const { nombre } = plantillaHerramienta(id)
          return <button type="button" key={id} className="pizarra-objeto" title={`${nombre}: arrastrar o tocar y colocar`} aria-label={nombre} aria-pressed={herramienta === id}
            draggable={!deshabilitada} onDragStart={event => { event.dataTransfer.setData('application/x-comunicaciones-herramienta', id); event.dataTransfer.effectAllowed = 'copy'; alArrastrar(id) }} onDragEnd={alTerminar}
            onClick={() => elegir(id)}>
            <IconoHerramienta id={id} />
            <span>{nombre}</span>
          </button>
        })}
        {grupo === 'Canchas' && Object.entries(SUPERFICIES).map(([tipo, s]) => <button type="button" key={tipo} className="pizarra-objeto pizarra-superficie" aria-label={s[2]} aria-pressed={superficie === tipo} onClick={() => cambiarSuperficie(tipo)}>
          <PizarraCancha miniatura doc={{ superficie: tipo, orientacion: 'horizontal', ataque: 'derecha', elementos: [] }} poses={{}} /><span>{s[2]}</span>
        </button>)}
      </div>
      <p className="pizarra-ayuda">{grupo === 'Canchas' ? 'Cambiar superficie conserva el diseño.' : 'La herramienta queda activa para colocar varias seguidas; tocá Mover para terminar.'}</p>
    </fieldset>
  </section>
})
