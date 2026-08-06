import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerFechaHoy } from '../utils/fecha'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'
import { COLORES } from '../theme'

const CAMPOS = [
  { clave: 'sueno', label: 'Sueño' },
  { clave: 'dolor_muscular', label: 'Dolor musc.' },
  { clave: 'fatiga', label: 'Fatiga' },
  { clave: 'estres', label: 'Estrés' },
  { clave: 'animo_entrenar', label: 'Ánimo' },
]

function CargaWellness() {
  const [categoria, setCategoria] = useState(null)
  const [fecha, setFecha] = useState(obtenerFechaHoy())
  const [jugadores, setJugadores] = useState([])
  const [valores, setValores] = useState({})
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const inputStyle = {
    backgroundColor: COLORES.fondoTarjeta,
    border: `1px solid ${COLORES.borde}`,
    color: COLORES.texto,
  }

  useEffect(() => {
    async function cargarCategoria() {
      const cat = await obtenerCategoriaPrimeraDivision()
      setCategoria(cat)
    }
    cargarCategoria()
  }, [])

  useEffect(() => {
    async function cargar() {
      if (!categoria || !fecha) {
        setJugadores([])
        return
      }
      setCargando(true)
      setMensaje('')

      const { data: categoriasData } = await supabase.from('categorias').select('id, es_reserva')
      const { data: jugadoresData } = await obtenerJugadoresDeCategoria(supabase, categoria.id, categoriasData)
      setJugadores(jugadoresData || [])

      const ids = (jugadoresData || []).map((j) => j.id)
      if (ids.length > 0) {
        const { data: bienestarData } = await supabase
          .from('bienestar')
          .select('*')
          .eq('fecha', fecha)
          .in('jugador_id', ids)
        const mapa = {}
        ;(bienestarData || []).forEach((b) => {
          mapa[b.jugador_id] = {
            sueno: b.sueno ?? '',
            dolor_muscular: b.dolor_muscular ?? '',
            fatiga: b.fatiga ?? '',
            estres: b.estres ?? '',
            animo_entrenar: b.animo_entrenar ?? '',
          }
        })
        setValores(mapa)
      } else {
        setValores({})
      }
      setCargando(false)
    }
    cargar()
  }, [categoria, fecha])

  function cambiarValor(jugadorId, campo, valor) {
    setValores((prev) => ({
      ...prev,
      [jugadorId]: { ...(prev[jugadorId] || {}), [campo]: valor },
    }))
  }

  function tieneAlgunValor(fila) {
    if (!fila) return false
    return CAMPOS.some((c) => fila[c.clave] !== undefined && fila[c.clave] !== '' && fila[c.clave] !== null)
  }

  async function handleGuardar() {
    setGuardando(true)
    setMensaje('')

    const filas = jugadores
      .filter((j) => tieneAlgunValor(valores[j.id]))
      .map((j) => {
        const fila = valores[j.id] || {}
        const registro = { fecha, jugador_id: j.id }
        CAMPOS.forEach((c) => {
          const v = fila[c.clave]
          registro[c.clave] = v === '' || v === undefined || v === null ? null : Number(v)
        })
        return registro
      })

    if (filas.length > 0) {
      const { error } = await supabase.from('bienestar').upsert(filas, { onConflict: 'fecha,jugador_id' })
      if (error) {
        setMensaje('Error al guardar: ' + error.message)
        setGuardando(false)
        return
      }
    }

    setGuardando(false)
    setMensaje('Listo, wellness guardado.')
  }

  return (
    <div>
      <p className="text-sm mb-6" style={{ color: COLORES.textoMuted }}>
        Carga manual de wellness de Primera División. Útil para cargar días atrasados o completar datos
        que la jugadora no respondió por el link. Si ya hay una respuesta cargada para esa fecha (por el
        link de bienestar), acá se muestra y se puede editar.
      </p>

      <div className="mb-6">
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="w-full sm:w-56 p-2.5 rounded-xl outline-none text-sm"
          style={inputStyle}
        />
      </div>

      {!categoria && (
        <p className="text-sm" style={{ color: COLORES.textoMuted }}>
          No se encontró la categoría Primera División.
        </p>
      )}

      {cargando && <p style={{ color: COLORES.textoMuted }}>Cargando...</p>}

      {!cargando && categoria && jugadores.length === 0 && (
        <p className="text-sm" style={{ color: COLORES.textoMuted }}>
          No hay jugadoras cargadas en Primera División.
        </p>
      )}

      {jugadores.length > 0 && (
        <>
          <div className="overflow-x-auto mb-6 rounded-xl" style={{ border: `1px solid ${COLORES.borde}` }}>
            <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: COLORES.fondoTarjeta }}>
                  <th
                    className="text-left p-2.5 whitespace-nowrap sticky left-0 top-0 z-20"
                    style={{ color: COLORES.textoSecundario, backgroundColor: COLORES.fondoTarjeta }}
                  >
                    Jugadora
                  </th>
                  {CAMPOS.map((c) => (
                    <th
                      key={c.clave}
                      className="text-left p-2.5 whitespace-nowrap sticky top-0 z-10"
                      style={{ color: COLORES.textoSecundario, backgroundColor: COLORES.fondoTarjeta }}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jugadores.map((j, i) => (
                  <tr key={j.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : '#1F1F1D' }}>
                    <td
                      className="p-2.5 whitespace-nowrap sticky left-0"
                      style={{ color: COLORES.texto, backgroundColor: i % 2 === 0 ? COLORES.fondoPagina : '#1F1F1D' }}
                    >
                      <div className="flex items-center gap-2">
                        {j.foto_url ? (
                          <img
                            src={j.foto_url}
                            alt={`${j.apellido}, ${j.nombre}`}
                            className="w-6 h-6 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <span
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                            style={{ backgroundColor: COLORES.fondoSidebar, color: COLORES.textoSecundario }}
                          >
                            {`${j.nombre?.[0] || ''}${j.apellido?.[0] || ''}`.toUpperCase()}
                          </span>
                        )}
                        {j.apellido}, {j.nombre}
                      </div>
                    </td>
                    {CAMPOS.map((c) => (
                      <td key={c.clave} className="p-1.5">
                        <input
                          type="number"
                          min="1"
                          max="5"
                          value={valores[j.id]?.[c.clave] ?? ''}
                          onChange={(e) => cambiarValor(j.id, c.clave, e.target.value)}
                          className="w-16 p-1.5 rounded-lg outline-none text-sm text-center"
                          style={inputStyle}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {mensaje && (
            <p
              className="text-sm mb-4"
              style={{ color: mensaje.startsWith('Listo') ? COLORES.exito : COLORES.peligro }}
            >
              {mensaje}
            </p>
          )}

          <button
            onClick={handleGuardar}
            disabled={guardando}
            className="w-full p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: COLORES.acento, color: '#1A1A1A' }}
          >
            {guardando ? 'Guardando...' : 'Guardar wellness'}
          </button>
        </>
      )}
    </div>
  )
}

export default CargaWellness
