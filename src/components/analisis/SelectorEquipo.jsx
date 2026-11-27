import { useId, useMemo, useState } from 'react'
import { equiposParaElegir, resultadosBuscador } from '../../utils/analisis/equipos'
import './playlists.css'

// Elegir un equipo del listado con buscador (scouting). Los inactivos no aparecen, salvo el ya elegido.
// textoLibre: nombre de un scouting viejo que todavía no apunta al listado (se muestra para elegir el equipo).
// onAgregar(nombre) → Promise<{ equipo } | { error }>: solo para coordinación.
// Si lo escrito no coincide con ninguno, dentro de los resultados aparece «+ Agregar «…»». Si coincide con uno que ya
// existe escrito de otra forma (sin mayúsculas, acentos ni espacios), se ofrece ese y no se agrega otro igual.
export default function SelectorEquipo({ etiqueta, equipos, valor, textoLibre = '', excluir = null, onElegir, onAgregar = null }) {
  const id = useId()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState('')
  const [agregando, setAgregando] = useState(false)
  const elegido = (equipos || []).find((e) => e.id === valor) || null
  const { opciones, existente, agregar: nombreNuevo } = useMemo(
    () => resultadosBuscador(equiposParaElegir(equipos, { elegidos: valor ? [valor] : [] }), texto, { excluir }),
    [equipos, texto, valor, excluir],
  )
  const puedeAgregar = Boolean(onAgregar && nombreNuevo)

  function elegir(equipo) {
    onElegir(equipo)
    setAbierto(false)
    setTexto('')
  }

  async function agregar() {
    if (!puedeAgregar) return
    setAgregando(true)
    const r = await onAgregar(nombreNuevo)
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
              if (e.key === 'Enter') { e.preventDefault(); if (opciones[0]) elegir(opciones[0]); else if (puedeAgregar) agregar() }
            }}
          />
          <ul className="se-lista" id={`${id}-lista`} aria-labelledby={`${id}-etiqueta`}>
            {opciones.map((e) => (
              <li key={e.id}>
                <button type="button" aria-pressed={e.id === valor} onClick={() => elegir(e)}>
                  {e.nombre}{existente?.id === e.id && texto.trim() !== e.nombre ? ' (ya está en el listado)' : ''}
                </button>
              </li>
            ))}
            {existente && existente.id === excluir && <li className="se-vacio">«{existente.nombre}» ya es el otro equipo de este partido.</li>}
            {puedeAgregar && (
              <li>
                <button type="button" className="se-agregar" data-agregar="si" disabled={agregando} onClick={agregar}>
                  {agregando ? 'Agregando…' : `+ Agregar «${nombreNuevo}»`}
                </button>
              </li>
            )}
            {opciones.length === 0 && !puedeAgregar && !existente && <li className="se-vacio">Ningún equipo coincide.</li>}
          </ul>
          <div className="se-pie">
            {onAgregar && !texto.trim() && (
              <button type="button" className="et-boton" disabled>Escribí el nombre para agregarlo</button>
            )}
            <button type="button" className="et-boton" onClick={() => setAbierto(false)}>Cerrar</button>
          </div>
          {aviso && <p role="alert" className="se-aviso">{aviso}</p>}
        </div>
      )}
    </div>
  )
}
