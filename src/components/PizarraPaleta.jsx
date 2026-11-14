import { memo, useState } from 'react'
import PizarraObjeto from './PizarraObjeto'
import { FORMACIONES, LINEAS, PALETA, plantillaHerramienta } from '../utils/pizarra'
import { coloresEquipo } from '../utils/pizarraPlantel'

const fechaCorta = f => f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : ''
const nombreJugadora = j => [j.apellido, j.nombre].filter(Boolean).join(', ')

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
// Etapa J: `datos` ({ jugadores, partidos, equipos, cargando, error }) habilita "Plantel y rival": convocadas de un partido,
// una jugadora del plantel y el equipo rival. Sin datos (Wellness, pruebas) el grupo no aparece.
export default memo(function PizarraMenuAgregar({ abierto, herramienta, arrastre, onFormacion, onCerrar, deshabilitado, datos = null, rival = null, onConvocadas, onJugadora, onRival }) {
  const [equipo, setEquipo] = useState('propio'), [vista, setVista] = useState('principal'), [busqueda, setBusqueda] = useState('')
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
  // Al elegir algo o cerrar, el menú vuelve a la vista principal para la próxima vez.
  const elegir = fn => (...a) => { setVista('principal'); setBusqueda(''); fn(...a) }
  const volver = <button type="button" className="pizarra-agregar-volver" onClick={() => { setVista('principal'); setBusqueda('') }}>← Volver</button>
  const texto = busqueda.trim().toLowerCase()
  // Subvistas de "Plantel y rival".
  if (vista !== 'principal' && datos) return <section className="pizarra-agregar-menu" role="dialog" aria-label="Agregar a la cancha">
    <header>{volver}<strong>{vista === 'convocadas' ? 'Cargar convocadas' : vista === 'plantel' ? 'Jugadora del plantel' : 'Equipo rival'}</strong>
      <button type="button" className="pizarra-icono" aria-label="Cerrar menú" onClick={elegir(onCerrar)}>✕</button></header>
    <fieldset disabled={deshabilitado} className="pizarra-agregar-lista">
      {vista === 'convocadas' && <>
        <p className="pizarra-agregar-nota">Trae las citadas con su dorsal: titulares en su lugar de la Formación, suplentes en el banco. Reemplaza a las fichas propias.</p>
        {datos.partidos.length ? datos.partidos.map(p => <button type="button" key={p.id} aria-label={`Convocadas vs ${p.rival} del ${fechaCorta(p.fecha)}`} onClick={() => elegir(onConvocadas)(p)}>
          <b>{fechaCorta(p.fecha)}</b><span>vs {p.rival}</span>{p.formacion && <i>{p.formacion}</i>}</button>)
          : <p className="pizarra-agregar-nota">No hay partidos de los últimos meses.</p>}
      </>}
      {vista === 'plantel' && <>
        <input type="search" aria-label="Buscar jugadora" placeholder="Buscar por nombre" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        {datos.jugadores.filter(j => !texto || nombreJugadora(j).toLowerCase().includes(texto)).map(j => <button type="button" key={j.id} aria-label={`Agregar a ${nombreJugadora(j)}`} onClick={() => elegir(onJugadora)(j)}>
          {j.foto_url ? <img src={j.foto_url} alt="" loading="lazy" /> : <span className="pizarra-agregar-sin-foto" aria-hidden="true">{(j.apellido || j.nombre || '?').slice(0, 1)}</span>}
          <span>{nombreJugadora(j)}</span></button>)}
      </>}
      {vista === 'rival' && <>
        <p className="pizarra-agregar-nota">Las fichas rivales toman su camiseta y su número (se cargan en Equipos).</p>
        {datos.equipos.map(eq => { const c = coloresEquipo(eq); return <button type="button" key={eq.id} aria-label={`Rival ${eq.nombre}`} aria-pressed={rival?.id === eq.id} onClick={() => elegir(onRival)(eq)}>
          {eq.escudo_url ? <img src={eq.escudo_url} alt="" loading="lazy" /> : <span className="pizarra-agregar-sin-foto" aria-hidden="true">{eq.nombre.slice(0, 1)}</span>}
          <span>{eq.nombre}</span><span className="pizarra-agregar-camiseta" style={{ '--camiseta': c.color, '--numero': c.tinta }} aria-hidden="true">10</span></button> })}
      </>}
    </fieldset>
  </section>
  return <section className="pizarra-agregar-menu" role="dialog" aria-label="Agregar a la cancha">
    <header><strong>Agregar</strong><span>Tocá y después la cancha, o arrastrá</span>
      <button type="button" className="pizarra-icono" aria-label="Cerrar menú" onClick={onCerrar}>✕</button></header>
    <fieldset disabled={deshabilitado}>
      {datos && <div className="pizarra-agregar-grupo">
        <h3>Plantel y rival</h3>
        {datos.error && <p className="pizarra-agregar-nota" role="alert">{datos.error}</p>}
        <div className="pizarra-agregar-plantel">
          <button type="button" disabled={datos.cargando} onClick={() => setVista('convocadas')}>Cargar convocadas</button>
          <button type="button" disabled={datos.cargando} onClick={() => setVista('plantel')}>Jugadora del plantel</button>
          <button type="button" disabled={datos.cargando} onClick={() => setVista('rival')}>{rival ? `Rival: ${rival.nombre}` : 'Equipo rival'}</button>
        </div>
      </div>}
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
