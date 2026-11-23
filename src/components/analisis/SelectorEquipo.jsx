import { useId, useMemo, useState } from 'react'
import { buscarEquipos, equiposParaElegir } from '../../utils/analisis/equipos'
import './playlists.css'

// Elegir un equipo del listado con buscador (scouting). Los inactivos no aparecen, salvo el ya elegido.
// textoLibre: nombre de un scouting viejo que todavía no apunta al listado (se muestra para elegir el equipo).
// onAgregar(nombre) → Promise<{ equipo } | { error }>: solo para coordinación.
export default function SelectorEquipo({ etiqueta, equipos, valor, textoLibre = '', excluir = null, onElegir, onAgregar = null }) {
  const id = useId()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState('')
  const [agregando, setAgregando] = useState(false)
  const elegido = (equipos || []).find((e) => e.id === valor) || null
  const opciones = useMemo(
    () => buscarEquipos(equiposParaElegir(equipos, { elegidos: valor ? [valor] : [] }), texto).filter((e) => e.id !== excluir).slice(0, 40),
    [equipos, texto, valor, excluir],
  )

  function elegir(equipo) {
    onElegir(equipo)
    setAbierto(false)
    setTexto('')
  }

  async function agregar() {
    if (!onAgregar) return
    setAgregando(true)
    const r = await onAgregar(texto)
    setAgregando(false)
    if (r?.error) { setAviso(r.error); return }
    setAviso('')
    elegir(r.equipo)
  }

  return (
    <div className="se">
      <span className="se-etiqueta" id={`${id}-etiqueta`}>{etiqueta}</span>
      {!abierto ? (
        <button type="button" className="se-elegido" aria-labelledby={`${id}-etiqueta`} aria-describedby={`${id}-valor`} onClick={() => setAbierto(true)}>
          <span id={`${id}-valor`}>{elegido ? elegido.nombre : textoLibre ? `${textoLibre} (texto libre: elegí del listado)` : 'Elegí un equipo…'}</span>
          <span aria-hidden="true">▾</span>
        </button>
      ) : (
        <div className="se-panel">
          <input
            type="search" className="se-buscar" autoFocus value={texto} placeholder="Buscar equipo…"
            aria-labelledby={`${id}-etiqueta`} aria-controls={`${id}-lista`}
            onChange={(e) => { setTexto(e.target.value); setAviso('') }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setAbierto(false)
              if (e.key === 'Enter') { e.preventDefault(); if (opciones[0]) elegir(opciones[0]) }
            }}
          />
          <ul className="se-lista" id={`${id}-lista`} aria-labelledby={`${id}-etiqueta`}>
            {opciones.map((e) => (
              <li key={e.id}>
                <button type="button" aria-pressed={e.id === valor} onClick={() => elegir(e)}>{e.nombre}</button>
              </li>
            ))}
            {opciones.length === 0 && <li className="se-vacio">Ningún equipo coincide.</li>}
          </ul>
          <div className="se-pie">
            {onAgregar && (
              <button type="button" className="et-boton" disabled={agregando || !texto.trim()} onClick={agregar}>
                {agregando ? 'Agregando…' : `+ Agregar equipo${texto.trim() ? ` «${texto.trim()}»` : ''}`}
              </button>
            )}
            <button type="button" className="et-boton" onClick={() => setAbierto(false)}>Cerrar</button>
          </div>
          {aviso && <p role="alert" className="se-aviso">{aviso}</p>}
        </div>
      )}
    </div>
  )
}
