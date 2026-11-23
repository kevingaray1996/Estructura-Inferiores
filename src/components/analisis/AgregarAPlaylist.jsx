import { useState } from 'react'
import './playlists.css'

// «Agregar a playlist» desde la línea de tiempo o la lista de Acciones (coordinación): elegir una playlist o crear una
// nueva con este clip. onAgregar(playlist) y onNueva(nombre) devuelven { error } o { sumados }.
export default function AgregarAPlaylist({ titulo, playlists, aviso = '', onAgregar, onNueva, onCerrar }) {
  const [nombre, setNombre] = useState('')
  const [estado, setEstado] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function correr(fn, ok) {
    setOcupado(true)
    const r = await fn()
    setOcupado(false)
    setEstado(r?.error || (r?.sumados === 0 ? 'Ese clip ya estaba en la playlist.' : ok))
  }

  return (
    <div className="ap" role="region" aria-label="Agregar a playlist">
      <h4>Agregar a playlist: {titulo}</h4>
      {aviso ? <p className="pls-dato">{aviso}</p> : (
        <>
          {playlists.length > 0 ? (
            <ul className="ap-lista">
              {playlists.map((p) => (
                <li key={p.id}>
                  <button type="button" className="et-boton" disabled={ocupado} onClick={() => correr(() => onAgregar(p), `Agregado a «${p.nombre}».`)}>{p.nombre}</button>
                </li>
              ))}
            </ul>
          ) : <p className="pls-dato">Todavía no hay playlists de esta categoría.</p>}
          <form className="ap-nueva" onSubmit={(e) => { e.preventDefault(); if (nombre.trim()) correr(() => onNueva(nombre.trim()), `Playlist «${nombre.trim()}» creada con este clip.`) }}>
            <input aria-label="Nombre de la playlist nueva" placeholder="Nueva playlist…" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <button type="submit" className="et-boton" disabled={ocupado || !nombre.trim()}>Crear con este clip</button>
          </form>
        </>
      )}
      {estado && <p className="ap-estado" role="status">{estado}</p>}
      <div className="pls-botones"><button type="button" className="et-boton" onClick={onCerrar}>Cerrar</button></div>
    </div>
  )
}
