import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerFechaHoy } from '../utils/fecha'
import { sanitizarNombreArchivo } from '../utils/archivos'
import { comprimirImagen } from '../utils/comprimirImagen'

function AgregarPartido({ categoriaId, onVolver, onGuardado, partidoIdEditar }) {
  const [equipos, setEquipos] = useState([])
  const [equipoId, setEquipoId] = useState('')
  const [rivalManual, setRivalManual] = useState('')
  const [escudoManual, setEscudoManual] = useState('')

  const [mostrarNuevoEquipo, setMostrarNuevoEquipo] = useState(false)
  const [nombreNuevoEquipo, setNombreNuevoEquipo] = useState('')
  const [escudoNuevoEquipo, setEscudoNuevoEquipo] = useState('')
  const [subiendoEscudoNuevo, setSubiendoEscudoNuevo] = useState(false)
  const [guardandoEquipo, setGuardandoEquipo] = useState(false)

  const [fecha, setFecha] = useState(() => (partidoIdEditar ? '' : obtenerFechaHoy()))
  const [hora, setHora] = useState('')
  const [lugar, setLugar] = useState('')
  const [localVisitante, setLocalVisitante] = useState('local')
  const [link, setLink] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [cargando, setCargando] = useState(!!partidoIdEditar)

  const esEdicion = !!partidoIdEditar

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  useEffect(() => {
    cargarEquipos()
  }, [])

  useEffect(() => {
    async function cargarPartido() {
      if (!partidoIdEditar) return
      const { data } = await supabase
        .from('partidos')
        .select('*')
        .eq('id', partidoIdEditar)
        .single()
      if (data) {
        setFecha(data.fecha || '')
        setHora(data.hora || '')
        setLugar(data.lugar || '')
        setLocalVisitante(data.local_visitante || 'local')
        setLink(data.link || '')
        if (data.equipo_id) {
          setEquipoId(data.equipo_id)
        } else {
          // Partido viejo cargado antes de tener equipos: preservamos su rival/escudo manual
          setRivalManual(data.rival || '')
          setEscudoManual(data.escudo_url || '')
        }
      }
      setCargando(false)
    }
    cargarPartido()
  }, [partidoIdEditar])

  async function cargarEquipos() {
    const { data } = await supabase.from('equipos').select('*').order('nombre')
    setEquipos(data || [])
  }

  async function handleSubirEscudoNuevoEquipo(archivo) {
    if (!archivo) return
    setSubiendoEscudoNuevo(true)
    const archivoComprimido = await comprimirImagen(archivo, { maxAncho: 300, maxAlto: 300 })
    const nombreArchivo = `escudos/${Date.now()}-${sanitizarNombreArchivo(archivoComprimido.name)}`
    const { error } = await supabase.storage.from('Biblioteca').upload(nombreArchivo, archivoComprimido, {
      upsert: true,
    })
    if (error) {
      alert('Error al subir el escudo: ' + error.message)
      setSubiendoEscudoNuevo(false)
      return
    }
    const { data } = supabase.storage.from('Biblioteca').getPublicUrl(nombreArchivo)
    setEscudoNuevoEquipo(data.publicUrl)
    setSubiendoEscudoNuevo(false)
  }

  async function handleGuardarNuevoEquipo() {
    if (!nombreNuevoEquipo) return
    setGuardandoEquipo(true)
    const { data, error } = await supabase
      .from('equipos')
      .insert({ nombre: nombreNuevoEquipo, escudo_url: escudoNuevoEquipo || null })
      .select()
      .single()
    setGuardandoEquipo(false)
    if (error) {
      alert('Error al crear el equipo: ' + error.message)
      return
    }
    await cargarEquipos()
    setEquipoId(data.id)
    setRivalManual('')
    setEscudoManual('')
    setMostrarNuevoEquipo(false)
    setNombreNuevoEquipo('')
    setEscudoNuevoEquipo('')
  }

  async function handleGuardar() {
    setErrorMsg('')
    if ((!equipoId && !rivalManual) || !fecha) {
      setErrorMsg('Rival y fecha son obligatorios.')
      return
    }
    setGuardando(true)

    const equipoSeleccionado = equipos.find((e) => e.id === equipoId)

    const datos = {
      rival: equipoSeleccionado ? equipoSeleccionado.nombre : rivalManual,
      escudo_url: equipoSeleccionado ? equipoSeleccionado.escudo_url || null : escudoManual || null,
      equipo_id: equipoId || null,
      fecha,
      hora: hora || null,
      lugar: lugar || null,
      local_visitante: localVisitante,
      categoria_id: categoriaId,
      link: link || null,
    }

    const { error } = esEdicion
      ? await supabase.from('partidos').update(datos).eq('id', partidoIdEditar)
      : await supabase.from('partidos').insert(datos)

    setGuardando(false)
    if (error) {
      setErrorMsg('Error al guardar: ' + error.message)
    } else {
      onGuardado()
    }
  }

  if (cargando) {
    return (
      <div className="p-6 md:p-10">
        <p style={{ color: '#5B6B85' }}>Cargando...</p>
      </div>
    )
  }

  const escudoAMostrar = equipos.find((e) => e.id === equipoId)?.escudo_url || escudoManual

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

        <h1
          className="text-2xl md:text-3xl mb-8"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
        >
          {esEdicion ? 'Editar partido' : 'Nuevo partido'}
        </h1>

        <div className="space-y-3 mb-6">
          <div>
            <label className="text-[10px] uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
              Rival
            </label>
            <div className="flex items-center gap-3">
              {escudoAMostrar ? (
                <img
                  src={escudoAMostrar}
                  alt="Escudo del rival"
                  className="w-10 h-10 rounded-lg object-contain shrink-0"
                  style={{ backgroundColor: '#0F1419', border: '1px solid #2A3548' }}
                />
              ) : (
                <span
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-sm shrink-0"
                  style={{ backgroundColor: '#0F1419', color: '#5B6B85', border: '1px solid #2A3548' }}
                >
                  🛡️
                </span>
              )}
              <select
                value={equipoId}
                onChange={(e) => {
                  setEquipoId(e.target.value)
                  setRivalManual('')
                  setEscudoManual('')
                }}
                className="flex-1 p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              >
                <option value="">
                  {rivalManual ? rivalManual + ' (sin vincular)' : 'Seleccionar equipo...'}
                </option>
                {equipos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setMostrarNuevoEquipo(!mostrarNuevoEquipo)}
              className="text-xs mt-2"
              style={{ color: '#4ADE80' }}
            >
              {mostrarNuevoEquipo ? 'Cancelar' : '+ El rival no está en la lista'}
            </button>
          </div>

          {mostrarNuevoEquipo && (
            <div className="p-3 rounded-xl space-y-2" style={{ backgroundColor: '#0F1419', border: '1px solid #2A3548' }}>
              <input
                type="text"
                placeholder="Nombre del nuevo equipo"
                value={nombreNuevoEquipo}
                onChange={(e) => setNombreNuevoEquipo(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              />
              <div className="flex items-center gap-3">
                {escudoNuevoEquipo && (
                  <img
                    src={escudoNuevoEquipo}
                    alt="Escudo"
                    className="w-10 h-10 rounded-lg object-contain shrink-0"
                    style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
                  />
                )}
                <label
                  className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 cursor-pointer"
                  style={{ backgroundColor: '#1A2332', color: '#8A9BB8', border: '1px solid #2A3548' }}
                >
                  {subiendoEscudoNuevo ? 'Subiendo...' : escudoNuevoEquipo ? 'Cambiar escudo' : '📤 Subir escudo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleSubirEscudoNuevoEquipo(e.target.files?.[0])}
                    disabled={subiendoEscudoNuevo}
                    className="hidden"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={handleGuardarNuevoEquipo}
                disabled={guardandoEquipo || !nombreNuevoEquipo}
                className="w-full p-2 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
              >
                {guardandoEquipo ? 'Creando...' : 'Crear equipo y usarlo'}
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="p-2.5 rounded-xl outline-none text-sm"
              style={inputStyle}
            />
            <input
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className="p-2.5 rounded-xl outline-none text-sm"
              style={inputStyle}
            />
          </div>
          <input
            type="text"
            placeholder="Lugar / cancha"
            value={lugar}
            onChange={(e) => setLugar(e.target.value)}
            className="w-full p-2.5 rounded-xl outline-none text-sm"
            style={inputStyle}
          />
          <select
            value={localVisitante}
            onChange={(e) => setLocalVisitante(e.target.value)}
            className="w-full p-2.5 rounded-xl outline-none text-sm"
            style={inputStyle}
          >
            <option value="local">Local</option>
            <option value="visitante">Visitante</option>
          </select>
          <input
            type="text"
            placeholder="Link del partido (opcional)"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="w-full p-2.5 rounded-xl outline-none text-sm"
            style={inputStyle}
          />
        </div>

        {errorMsg && (
          <p className="text-sm mb-4" style={{ color: '#F87171' }}>
            {errorMsg}
          </p>
        )}

        <button
          onClick={handleGuardar}
          disabled={guardando}
          className="w-full p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
        >
          {guardando ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Guardar partido'}
        </button>
      </div>
    </div>
  )
}

export default AgregarPartido
