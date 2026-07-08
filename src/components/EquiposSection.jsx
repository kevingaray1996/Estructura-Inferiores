import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { sanitizarNombreArchivo } from '../utils/archivos'
import { comprimirImagen } from '../utils/comprimirImagen'

function EquiposSection({ onVolver }) {
  const [equipos, setEquipos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [equipoEditando, setEquipoEditando] = useState(null)

  const [nombre, setNombre] = useState('')
  const [escudoUrl, setEscudoUrl] = useState('')
  const [subiendoEscudo, setSubiendoEscudo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  useEffect(() => {
    cargarEquipos()
  }, [])

  async function cargarEquipos() {
    setCargando(true)
    const { data } = await supabase.from('equipos').select('*').order('nombre')
    setEquipos(data || [])
    setCargando(false)
  }

  const filtrados = equipos.filter((e) =>
    !busqueda || (e.nombre || '').toLowerCase().includes(busqueda.toLowerCase())
  )

  function abrirNuevo() {
    setEquipoEditando(null)
    setNombre('')
    setEscudoUrl('')
    setErrorMsg('')
    setMostrarForm(true)
  }

  function abrirEditar(e) {
    setEquipoEditando(e)
    setNombre(e.nombre || '')
    setEscudoUrl(e.escudo_url || '')
    setErrorMsg('')
    setMostrarForm(true)
  }

  function cancelarForm() {
    setMostrarForm(false)
    setEquipoEditando(null)
  }

  async function handleSubirEscudo(archivo) {
    if (!archivo) return
    setSubiendoEscudo(true)
    const archivoComprimido = await comprimirImagen(archivo, { maxAncho: 300, maxAlto: 300 })
    const nombreArchivo = `escudos/${Date.now()}-${sanitizarNombreArchivo(archivoComprimido.name)}`
    const { error } = await supabase.storage.from('Biblioteca').upload(nombreArchivo, archivoComprimido, {
      upsert: true,
    })
    if (error) {
      alert('Error al subir el escudo: ' + error.message)
      setSubiendoEscudo(false)
      return
    }
    const { data } = supabase.storage.from('Biblioteca').getPublicUrl(nombreArchivo)
    setEscudoUrl(data.publicUrl)
    setSubiendoEscudo(false)
  }

  async function handleGuardar() {
    setErrorMsg('')
    if (!nombre) {
      setErrorMsg('El nombre es obligatorio.')
      return
    }
    setGuardando(true)

    const datos = { nombre, escudo_url: escudoUrl || null }

    const { error } = equipoEditando
      ? await supabase.from('equipos').update(datos).eq('id', equipoEditando.id)
      : await supabase.from('equipos').insert(datos)

    setGuardando(false)
    if (error) {
      setErrorMsg('Error al guardar: ' + error.message)
    } else {
      setMostrarForm(false)
      setEquipoEditando(null)
      cargarEquipos()
    }
  }

  async function handleEliminar(id) {
    const confirmar = window.confirm(
      '¿Seguro que querés eliminar este equipo? Los partidos ya cargados contra este rival no se modifican.'
    )
    if (!confirmar) return
    await supabase.from('equipos').delete().eq('id', id)
    cargarEquipos()
  }

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-xl mx-auto">
        <button
          onClick={onVolver}
          className="text-sm mb-6 flex items-center gap-1 hover:opacity-70 transition-opacity"
          style={{ color: '#8A9BB8' }}
        >
          ← Volver
        </button>

        <div className="flex items-start justify-between mb-8 gap-3 flex-wrap">
          <h1
            className="text-2xl md:text-3xl"
            style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
          >
            Equipos
          </h1>
          <button
            onClick={mostrarForm ? cancelarForm : abrirNuevo}
            className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
            style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
          >
            {mostrarForm ? 'Cancelar' : '+ Nuevo equipo'}
          </button>
        </div>

        {mostrarForm && (
          <div
            className="space-y-3 mb-8 p-4 rounded-xl"
            style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
          >
            {equipoEditando && (
              <p className="text-xs" style={{ color: '#8A9BB8' }}>
                Editando {equipoEditando.nombre}
              </p>
            )}
            <input
              type="text"
              placeholder="Nombre del equipo"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full p-2.5 rounded-xl outline-none text-sm"
              style={inputStyle}
            />

            <div>
              <label className="text-[10px] uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
                Escudo
              </label>
              <div className="flex items-center gap-3">
                {escudoUrl && (
                  <img
                    src={escudoUrl}
                    alt="Escudo"
                    className="w-12 h-12 rounded-lg object-contain shrink-0"
                    style={{ backgroundColor: '#0F1419', border: '1px solid #2A3548' }}
                  />
                )}
                <label
                  className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 cursor-pointer"
                  style={{ backgroundColor: '#0F1419', color: '#8A9BB8', border: '1px solid #2A3548' }}
                >
                  {subiendoEscudo ? 'Subiendo...' : escudoUrl ? 'Cambiar escudo' : '📤 Subir escudo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleSubirEscudo(e.target.files?.[0])}
                    disabled={subiendoEscudo}
                    className="hidden"
                  />
                </label>
                {escudoUrl && (
                  <button
                    type="button"
                    onClick={() => setEscudoUrl('')}
                    className="text-xs"
                    style={{ color: '#F87171' }}
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>

            {errorMsg && (
              <p className="text-sm" style={{ color: '#F87171' }}>
                {errorMsg}
              </p>
            )}

            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="w-full p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
            >
              {guardando ? 'Guardando...' : equipoEditando ? 'Guardar cambios' : 'Guardar equipo'}
            </button>
          </div>
        )}

        <input
          type="text"
          placeholder="Buscar equipo..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full p-2.5 rounded-xl outline-none text-sm mb-4"
          style={inputStyle}
        />

        {cargando && <p style={{ color: '#5B6B85' }}>Cargando...</p>}

        {!cargando && filtrados.length === 0 && (
          <p style={{ color: '#5B6B85' }}>No hay equipos cargados todavía.</p>
        )}

        <div className="space-y-2">
          {filtrados.map((e) => (
            <div
              key={e.id}
              className="p-3 rounded-xl flex items-center justify-between"
              style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
            >
              <div className="flex items-center gap-2.5">
                {e.escudo_url ? (
                  <img
                    src={e.escudo_url}
                    alt={e.nombre}
                    className="w-8 h-8 rounded object-contain shrink-0"
                    style={{ backgroundColor: '#0F1419' }}
                  />
                ) : (
                  <span
                    className="w-8 h-8 rounded flex items-center justify-center text-xs shrink-0"
                    style={{ backgroundColor: '#0F1419', color: '#5B6B85' }}
                  >
                    🛡️
                  </span>
                )}
                <p className="text-sm font-medium" style={{ color: '#F0F2F5' }}>
                  {e.nombre}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => abrirEditar(e)}
                  className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                  style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleEliminar(e.id)}
                  className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                  style={{ backgroundColor: '#0F1419', color: '#F87171' }}
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default EquiposSection
