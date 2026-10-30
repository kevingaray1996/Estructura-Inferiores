import { useState } from 'react'
import { CENTRALES, COLORES_CORPORALES, colorZona, fichasZona, LADOS_CORPORALES, nombreZona, ZONAS_CORPORALES } from '../utils/mapaCorporal'
import './mapaCorporal.css'

const formas = {
  cuello: 'M87 49 L113 49 L116 68 L84 68 Z',
  hombro: 'M83 66 Q65 62 52 80 L47 99 L66 105 L78 83 Z',
  brazo: 'M47 102 L65 108 L58 145 L40 141 Z',
  codo: 'M39 144 L58 148 L55 165 L35 162 Z',
  antebrazo: 'M35 165 L54 168 L43 209 L27 204 Z',
  mano: 'M26 207 L43 213 L40 237 Q36 251 27 242 L21 225 Z',
  pecho: 'M82 70 L118 70 L128 108 L124 123 L76 123 L72 108 Z',
  abdomen: 'M77 127 L123 127 L122 169 L78 169 Z',
  espalda_alta: 'M82 70 L118 70 L128 108 L123 131 L77 131 L72 108 Z',
  lumbar: 'M78 135 L122 135 L123 169 L77 169 Z',
  cadera: 'M76 172 L88 173 L83 209 L68 211 L69 188 Z',
  gluteo: 'M90 173 L98 173 L98 222 Q85 234 71 217 Z',
  aductor: 'M90 178 L98 185 L96 242 L86 261 L82 225 Z',
  cuadriceps: 'M69 215 L79 215 L83 263 L94 246 L94 284 L68 284 L63 250 Z',
  isquiotibial: 'M69 229 Q85 241 97 228 L94 284 L68 284 L63 250 Z',
  rodilla: 'M68 288 L94 288 L92 309 L68 309 Z',
  pantorrilla: 'M68 313 L92 313 Q96 341 88 369 L83 398 L68 398 L64 348 Z',
  tobillo: 'M68 402 L83 402 L83 420 L68 420 Z',
  pie: 'M68 424 L84 424 L88 438 Q83 452 58 446 L58 438 Z',
}

export default function MapaCorporal({ fichas = [], seleccion, onSeleccionar }) {
  const [vistaAmpliada, setVistaAmpliada] = useState('ambas')
  return <section className="mapa-corporal" aria-label="Mapa corporal de la jugadora">
    <h2>Mapa corporal</h2>
    <p>Derecha e izquierda corresponden a la jugadora. Tocá una zona para ver su historial o registrar una situación.</p>
    <div className="mapa-corporal-controles" aria-label="Tamaño de las siluetas">{[['ambas', 'Ver ambas'], ['frente', 'Ampliar frente'], ['espalda', 'Ampliar espalda']].map(([id, texto]) => <button key={id} type="button" aria-pressed={vistaAmpliada === id} onClick={() => setVistaAmpliada(id)}>{texto}</button>)}</div>
    <div className="mapa-corporal-vistas" data-ampliada={vistaAmpliada !== 'ambas'}>
      {['frente', 'espalda'].filter(vista => vistaAmpliada === 'ambas' || vista === vistaAmpliada).map(vista => <div key={vista}>
        <h3>{vista === 'frente' ? 'Frente' : 'Espalda'}</h3>
        <div className="mapa-corporal-lados"><span>{vista === 'frente' ? 'Derecha' : 'Izquierda'}</span><span>{vista === 'frente' ? 'Izquierda' : 'Derecha'}</span></div>
        <svg viewBox="0 0 200 460" aria-label={`Vista de ${vista}`}>
          <circle cx="100" cy="27" r="22" fill="var(--ui-borde, #64748B)" />
          <path d="M69 313 L92 313 L88 398 L68 398 Z M108 313 L132 313 L132 398 L112 398 Z M83 174 L117 174 L117 211 L83 211 Z" fill="var(--ui-borde, #64748B)" />
          {ZONAS_CORPORALES.filter(z => z.vista === 'ambas' || z.vista === vista).flatMap(z =>
            (CENTRALES.includes(z.id) ? ['central'] : ['derecha', 'izquierda']).map(lado => {
              const izquierdaEnPantalla = vista === 'frente' ? lado === 'derecha' : lado === 'izquierda'
              const seleccionada = seleccion?.zona === z.id && (seleccion.lado === lado || seleccion.lado === 'ambos')
              const cantidad = fichasZona(fichas, z.id, lado).length
              const elegir = () => onSeleccionar?.({ zona: z.id, lado })
              return <path key={`${z.id}-${lado}`} d={formas[z.id]} transform={lado !== 'central' && !izquierdaEnPantalla ? 'translate(200 0) scale(-1 1)' : undefined}
                fill={colorZona(fichas, z.id, lado)} stroke={seleccionada ? 'var(--ui-texto, #fff)' : 'var(--ui-superficie, #fff)'} strokeWidth={seleccionada ? 3 : 1.5}
                role="button" tabIndex={0} aria-pressed={!!seleccionada} aria-label={`${nombreZona(z.id)} · ${LADOS_CORPORALES[lado]} · ${cantidad} registros`}
                onClick={elegir} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir() } }}>
                <title>{nombreZona(z.id)} · {LADOS_CORPORALES[lado]} · {cantidad} registros</title>
              </path>
            }))}
        </svg>
      </div>)}
    </div>
    <ul className="mapa-corporal-leyenda">{Object.entries({ lesion: 'Lesión registrada activa', seguimiento: 'Molestia en seguimiento', antecedente: 'Antecedente resuelto', sin_registros: 'Sin registros asociados' }).map(([id, texto]) => <li key={id}><span style={{ background: COLORES_CORPORALES[id] }} />{texto}</li>)}</ul>
    <p>El mapa muestra situaciones informadas; no establece diagnósticos ni autoriza la práctica deportiva.</p>
  </section>
}
