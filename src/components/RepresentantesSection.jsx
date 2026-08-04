import { COLORES } from '../theme'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function formatearFecha(fecha) {
  if (!fecha) return null
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}`
}

function RepresentantesSection({ onVolver }) {
  const [representantes, setRepresentantes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [representanteEditando, setRepresentanteEditando] = useState(null)

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const [expandidoId, setExpandidoId] = useState(null)
  const [asignaciones, setAsignaciones] = useState([])
  const [verHistorico, setVerHistorico] = useState(false)
  const [cargandoAsignaciones, setCargandoAsignaciones] = useState(false)

  const [jugadoresTodos, setJugadoresTodos] = useState([])
  const [busquedaJugador, setBusquedaJugador] = useState('')

  const inputStyle = {
    backgroundColor: COLORES.fondoTarjeta,
    border: '1px solid COLORES.borde',
    color: COLORES.texto,
  }

  useEffect(() => {
    cargarRepresentantes()
    cargarJugadores()
  }, [])

  const cargarAsignaciones = useCallback(
    async (representanteId) => {
      setCargandoAsignaciones(true)
      let query = supabase
        .from('jugador_representantes')
        .select('*, jugadores(nombre, apellido, categorias(nombre))')
        .eq('representante_id', representanteId)
        .order('fecha_inicio', { ascending: false })
      if (!verHistorico) query = query.is('fecha_fin', null)
      const { data } = await query
      setAsignaciones(data || [])
      setCargandoAsignaciones(false)
    },
    [verHistorico]
  )

  useEffect(() => {
    async function ejecutar() {
      if (expandidoId) await cargarAsignaciones(expandidoId)
    }
    ejecutar()
  }, [expandidoId, verHistorico, cargarAsignaciones])

  async function cargarRepresentantes() {
    setCargando(true)
    const { data } = await supabase.from('representantes').select('*').order('nombre')
    setRepresentantes(data || [])
    setCargando(false)
  }

  async function cargarJugadores() {
    const { data } = await supabase
      .from('jugadores')
      .select('id, nombre, apellido, categorias(nombre)')
      .order('apellido')
    setJugadoresTodos(data || [])
  }

  const filtrados = representantes.filter(
    (r) => !busqueda || (r.nombre || '').toLowerCase().includes(busqueda.toLowerCase())
  )

  function abrirNuevo() {
    setRepresentanteEditando(null)
    setNombre('')
    setTelefono('')
    setEmail('')
    setNotas('')
    setErrorMsg('')
    setMostrarForm(true)
  }

  function abrirEditar(r) {
    setRepresentanteEditando(r)
    setNombre(r.nombre || '')
    setTelefono(r.telefono || '')
    setEmail(r.email || '')
    setNotas(r.notas || '')
    setErrorMsg('')
    setMostrarForm(true)
  }

  function cancelarForm() {
    setMostrarForm(false)
    setRepresentanteEditando(null)
  }

  async function handleGuardar() {
    setErrorMsg('')
    if (!nombre) {
      setErrorMsg('El nombre es obligatorio.')
      return
    }
    setGuardando(true)
    const datos = { nombre, telefono: telefono || null, email: email || null, notas: notas || null }
    const { error } = representanteEditando
      ? await supabase.from('representantes').update(datos).eq('id', representanteEditando.id)
      : await supabase.from('representantes').insert(datos)
    setGuardando(false)
    if (error) {
      setErrorMsg('Error al guardar: ' + error.message)
    } else {
      setMostrarForm(false)
      setRepresentanteEditando(null)
      cargarRepresentantes()
    }
  }

  async function handleEliminarRepresentante(id) {
    const confirmar = window.confirm(
      '¿Seguro que querés eliminar este representante? También se borran sus vínculos con jugadores.'
    )
    if (!confirmar) return
    await supabase.from('representantes').delete().eq('id', id)
    if (expandidoId === id) setExpandidoId(null)
    cargarRepresentantes()
  }

  function toggleExpandir(id) {
    setBusquedaJugador('')
    setExpandidoId((actual) => (actual === id ? null : id))
  }

  async function asignarJugador(jugadorId) {
    await supabase
      .from('jugador_representantes')
      .insert({ representante_id: expandidoId, jugador_id: jugadorId, fecha_inicio: new Date().toISOString().slice(0, 10) })
    setBusquedaJugador('')
    cargarAsignaciones(expandidoId)
  }

  async function finalizarAsignacion(id) {
    await supabase
      .from('jugador_representantes')
      .update({ fecha_fin: new Date().toISOString().slice(0, 10) })
      .eq('id', id)
    cargarAsignaciones(expandidoId)
  }

  async function eliminarAsignacion(id) {
    await supabase.from('jugador_representantes').delete().eq('id', id)
    cargarAsignaciones(expandidoId)
  }

  const idsYaAsignados = new Set(asignaciones.filter((a) => !a.fecha_fin).map((a) => a.jugador_id))
  const resultadosJugador = busquedaJugador
    ? jugadoresTodos
        .filter((j) => !idsYaAsignados.has(j.id))
        .filter((j) => `${j.apellido} ${j.nombre}`.toLowerCase().includes(busquedaJugador.toLowerCase()))
        .slice(0, 8)
    : []

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-xl mx-auto">
        <button
          onClick={onVolver}
          className="text-sm mb-6 flex items-center gap-1 hover:opacity-70 transition-opacity"
          style={{ color: COLORES.textoSecundario }}
        >
          ← Volver
        </button>

        <div className="flex items-start justify-between mb-8 gap-3 flex-wrap">
          <h1
            className="text-2xl md:text-3xl"
            style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.texto }}
          >
            Representantes
          </h1>
          <button
            onClick={mostrarForm ? cancelarForm : abrirNuevo}
            className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
            style={{ backgroundColor: COLORES.exito, color: COLORES.fondoPagina }}
          >
            {mostrarForm ? 'Cancelar' : '+ Nuevo representante'}
          </button>
        </div>

        {mostrarForm && (
          <div
            className="space-y-3 mb-8 p-4 rounded-xl"
            style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: '3px solid COLORES.acento', borderLeft: '1px solid COLORES.borde', borderRight: '1px solid COLORES.borde', borderBottom: '1px solid COLORES.borde' }}
          >
            {representanteEditando && (
              <p className="text-xs" style={{ color: COLORES.textoSecundario }}>
                Editando {representanteEditando.nombre}
              </p>
            )}
            <input
              type="text"
              placeholder="Nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full p-2.5 rounded-xl outline-none text-sm"
              style={inputStyle}
            />
            <input
              type="tel"
              placeholder="Teléfono"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="w-full p-2.5 rounded-xl outline-none text-sm"
              style={inputStyle}
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2.5 rounded-xl outline-none text-sm"
              style={inputStyle}
            />
            <textarea
              placeholder="Notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              className="w-full p-2.5 rounded-xl outline-none text-sm resize-none"
              style={inputStyle}
            />

            {errorMsg && (
              <p className="text-sm" style={{ color: COLORES.peligro }}>
                {errorMsg}
              </p>
            )}

            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="w-full p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: COLORES.exito, color: COLORES.fondoPagina }}
            >
              {guardando ? 'Guardando...' : representanteEditando ? 'Guardar cambios' : 'Guardar representante'}
            </button>
          </div>
        )}

        <input
          type="text"
          placeholder="Buscar representante..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full p-2.5 rounded-xl outline-none text-sm mb-4"
          style={inputStyle}
        />

        {cargando && <p style={{ color: COLORES.textoMuted }}>Cargando...</p>}

        {!cargando && filtrados.length === 0 && (
          <p style={{ color: COLORES.textoMuted }}>No hay representantes cargados todavía.</p>
        )}

        <div className="space-y-2">
          {filtrados.map((r) => (
            <div key={r.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid COLORES.borde' }}>
              <div
                className="p-3 flex items-center justify-between cursor-pointer"
                style={{ backgroundColor: COLORES.fondoTarjeta }}
                onClick={() => toggleExpandir(r.id)}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: COLORES.texto }}>
                    {r.nombre}
                  </p>
                  {(r.telefono || r.email) && (
                    <p className="text-xs" style={{ color: COLORES.textoSecundario }}>
                      {[r.telefono, r.email].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => abrirEditar(r)}
                    className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                    style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleEliminarRepresentante(r.id)}
                    className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                    style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.peligro }}
                  >
                    🗑
                  </button>
                  <button
                    onClick={() => toggleExpandir(r.id)}
                    className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                    style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}
                  >
                    {expandidoId === r.id ? '▲' : '▼'}
                  </button>
                </div>
              </div>

              {expandidoId === r.id && (
                <div className="p-3 space-y-3" style={{ backgroundColor: COLORES.fondoPagina }}>
                  <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: COLORES.textoSecundario }}>
                    <input type="checkbox" checked={verHistorico} onChange={(e) => setVerHistorico(e.target.checked)} />
                    Ver histórico
                  </label>

                  {cargandoAsignaciones && <p className="text-xs" style={{ color: COLORES.textoMuted }}>Cargando...</p>}

                  {!cargandoAsignaciones && asignaciones.length === 0 && (
                    <p className="text-xs" style={{ color: COLORES.textoMuted }}>Sin jugadores vinculados.</p>
                  )}

                  {asignaciones.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between p-2 rounded-lg"
                      style={{ backgroundColor: COLORES.fondoTarjeta }}
                    >
                      <div>
                        <p className="text-sm" style={{ color: COLORES.texto }}>
                          {a.jugadores?.apellido}, {a.jugadores?.nombre}
                          {a.jugadores?.categorias?.nombre && (
                            <span className="text-xs ml-1" style={{ color: COLORES.textoMuted }}>
                              ({a.jugadores.categorias.nombre})
                            </span>
                          )}
                        </p>
                        <p className="text-[10px]" style={{ color: COLORES.textoMuted }}>
                          desde {formatearFecha(a.fecha_inicio)}
                          {a.fecha_fin ? ` hasta ${formatearFecha(a.fecha_fin)}` : ' · vigente'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!a.fecha_fin && (
                          <button
                            onClick={() => finalizarAsignacion(a.id)}
                            className="text-[10px] px-2 py-1 rounded-full hover:opacity-80"
                            style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.acento }}
                          >
                            Finalizar
                          </button>
                        )}
                        <button
                          onClick={() => eliminarAsignacion(a.id)}
                          className="text-[10px] px-2 py-1 rounded-full hover:opacity-80"
                          style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.peligro }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}

                  <div>
                    <input
                      type="text"
                      placeholder="Buscar jugador para vincular..."
                      value={busquedaJugador}
                      onChange={(e) => setBusquedaJugador(e.target.value)}
                      className="w-full p-2 rounded-lg outline-none text-xs"
                      style={inputStyle}
                    />
                    {resultadosJugador.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {resultadosJugador.map((j) => (
                          <button
                            key={j.id}
                            onClick={() => asignarJugador(j.id)}
                            className="w-full text-left text-xs p-2 rounded-lg hover:opacity-80"
                            style={{ backgroundColor: COLORES.fondoTarjeta, color: COLORES.texto }}
                          >
                            {j.apellido}, {j.nombre}
                            {j.categorias?.nombre && (
                              <span style={{ color: COLORES.textoMuted }}> · {j.categorias.nombre}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default RepresentantesSection



