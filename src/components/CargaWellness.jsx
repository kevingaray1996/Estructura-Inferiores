
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

const UI = {
  fondo: '#191917',
  tarjeta: '#242422',
  filaAlternativa: '#20201E',
  borde: '#393934',
  acento: '#F2C230',
  texto: '#F4F2EA',
  secundario: '#B5B3AA',
  muted: '#85847C',
  exito: '#97C459',
  peligro: '#E77970',
}

function CargaWellness() {
  const [categoria, setCategoria] = useState(null)
  const [fecha, setFecha] = useState(obtenerFechaHoy())
  const [jugadores, setJugadores] = useState([])
  const [valores, setValores] = useState({})
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const inputStyle = {
    backgroundColor: UI.fondo,
    border: `1px solid ${UI.borde}`,
    color: UI.texto,
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

      const { data: categoriasData } = await supabase
        .from('categorias')
        .select('id, es_reserva')

      const { data: jugadoresData } = await obtenerJugadoresDeCategoria(
        supabase,
        categoria.id,
        categoriasData
      )

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
            zona_dolor: b.zona_dolor || '',
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

    return CAMPOS.some(
      (c) =>
        fila[c.clave] !== undefined &&
        fila[c.clave] !== '' &&
        fila[c.clave] !== null
    )
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
          registro[c.clave] =
            v === '' || v === undefined || v === null ? null : Number(v)
        })

        return registro
      })

    if (filas.length > 0) {
      const { error } = await supabase
        .from('bienestar')
        .upsert(filas, { onConflict: 'fecha,jugador_id' })

      if (error) {
        setMensaje('Error al guardar: ' + error.message)
        setGuardando(false)
        return
      }
    }

    setGuardando(false)
    setMensaje('Listo, wellness guardado.')
  }

  const cantidadCargadas = jugadores.filter((j) =>
    tieneAlgunValor(valores[j.id])
  ).length

  return (
    <div className="space-y-5" style={{ color: UI.texto }}>
      {/* Encabezado */}
      <div
        className="relative overflow-hidden rounded-2xl p-5 sm:p-6"
        style={{
          background:
            'linear-gradient(125deg, #292925 0%, #20201D 65%, #302A19 100%)',
          border: `1px solid ${UI.borde}`,
        }}
      >
        <div
          className="absolute -right-8 -top-12 w-40 h-40 rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(circle, rgba(242,194,48,0.15) 0%, rgba(242,194,48,0) 70%)',
          }}
        />

        <div className="relative">
          <p
            className="text-[11px] font-bold tracking-[0.2em] uppercase mb-2"
            style={{ color: UI.acento }}
          >
            Comunicaciones · Rendimiento
          </p>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Carga de Wellness
              </h2>
              <p
                className="text-sm mt-2 max-w-2xl leading-relaxed"
                style={{ color: UI.secundario }}
              >
                Registro manual del bienestar diario de las jugadoras.
              </p>
            </div>

            <span
              className="self-start inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold"
              style={{
                backgroundColor: 'rgba(242,194,48,0.10)',
                border: '1px solid rgba(242,194,48,0.25)',
                color: UI.acento,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: UI.acento }}
              />
              Primera División
            </span>
          </div>
        </div>

        <div
          className="absolute bottom-0 left-0 h-[3px] w-24"
          style={{ backgroundColor: UI.acento }}
        />
      </div>

      {/* Descripción */}
      <div
        className="rounded-xl p-4 sm:p-5"
        style={{
          backgroundColor: UI.tarjeta,
          border: `1px solid ${UI.borde}`,
        }}
      >
        <div className="flex gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{
              backgroundColor: 'rgba(242,194,48,0.10)',
              color: UI.acento,
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="19"
              height="19"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 8v4l3 2" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </div>

          <div>
            <p className="text-sm font-semibold mb-1">
              Registro y edición manual
            </p>
            <p
              className="text-sm leading-relaxed"
              style={{ color: UI.secundario }}
            >
              Útil para cargar días atrasados o completar respuestas pendientes.
              Si una jugadora ya respondió por el link de bienestar, sus datos
              aparecen acá y se pueden editar.
            </p>
          </div>
        </div>
      </div>

      {/* Fecha y resumen */}
      <div
        className="rounded-2xl p-4 sm:p-5"
        style={{
          backgroundColor: UI.tarjeta,
          border: `1px solid ${UI.borde}`,
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <label
              htmlFor="fecha-wellness"
              className="block text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: UI.secundario }}
            >
              Fecha del registro
            </label>

            <input
              id="fecha-wellness"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full sm:w-56 p-3 rounded-xl outline-none text-sm"
              style={inputStyle}
            />
          </div>

          <div className="flex gap-3">
            <div
              className="flex-1 sm:min-w-28 rounded-xl p-3"
              style={{
                backgroundColor: UI.fondo,
                border: `1px solid ${UI.borde}`,
              }}
            >
              <p
                className="text-[10px] uppercase tracking-wider mb-1"
                style={{ color: UI.muted }}
              >
                Jugadoras
              </p>
              <p className="text-xl font-bold tabular-nums">
                {jugadores.length}
              </p>
            </div>

            <div
              className="flex-1 sm:min-w-28 rounded-xl p-3"
              style={{
                backgroundColor: UI.fondo,
                border: `1px solid ${UI.borde}`,
              }}
            >
              <p
                className="text-[10px] uppercase tracking-wider mb-1"
                style={{ color: UI.muted }}
              >
                Con datos
              </p>
              <p
                className="text-xl font-bold tabular-nums"
                style={{ color: UI.acento }}
              >
                {cantidadCargadas}
              </p>
            </div>
          </div>
        </div>
      </div>

      {!categoria && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{
            backgroundColor: 'rgba(231,121,112,0.08)',
            border: '1px solid rgba(231,121,112,0.25)',
            color: UI.peligro,
          }}
        >
          No se encontró la categoría Primera División.
        </div>
      )}

      {cargando && (
        <div
          className="rounded-xl p-5 text-sm"
          style={{
            backgroundColor: UI.tarjeta,
            border: `1px solid ${UI.borde}`,
            color: UI.secundario,
          }}
        >
          Cargando datos del plantel…
        </div>
      )}

      {!cargando && categoria && jugadores.length === 0 && (
        <div
          className="rounded-xl p-5 text-sm"
          style={{
            backgroundColor: UI.tarjeta,
            border: `1px solid ${UI.borde}`,
            color: UI.secundario,
          }}
        >
          No hay jugadoras cargadas en Primera División.
        </div>
      )}

      {/* Tabla de carga */}
      {jugadores.length > 0 && (
        <>
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              backgroundColor: UI.tarjeta,
              border: `1px solid ${UI.borde}`,
            }}
          >
            <div
              className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              style={{ borderBottom: `1px solid ${UI.borde}` }}
            >
              <div>
                <h3 className="font-semibold">Bienestar por jugadora</h3>
                <p className="text-xs mt-1" style={{ color: UI.muted }}>
                  Completá los valores del 1 al 5 para cada campo.
                </p>
              </div>

              <span
                className="self-start rounded-full px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: UI.fondo,
                  border: `1px solid ${UI.borde}`,
                  color: UI.secundario,
                }}
              >
                {CAMPOS.length} indicadores
              </span>
            </div>

            <div
              className="overflow-auto max-h-[70vh]"
              style={{ scrollbarColor: `${UI.borde} ${UI.tarjeta}` }}
            >
              <table
                className="min-w-full text-sm"
                style={{ borderCollapse: 'separate', borderSpacing: 0 }}
              >
                <thead>
                  <tr style={{ backgroundColor: UI.fondo }}>
                    <th
                      className="text-left p-3 whitespace-nowrap sticky left-0 top-0 z-20 min-w-52"
                      style={{
                        color: UI.secundario,
                        backgroundColor: UI.fondo,
                        borderBottom: `1px solid ${UI.borde}`,
                      }}
                    >
                      Jugadora
                    </th>

                    {CAMPOS.map((c) => (
                      <th
                        key={c.clave}
                        className="text-center p-3 whitespace-nowrap sticky top-0 z-10"
                        style={{
                          color: UI.secundario,
                          backgroundColor: UI.fondo,
                          borderBottom: `1px solid ${UI.borde}`,
                        }}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {jugadores.map((j, i) => {
                    const zonaDolor = valores[j.id]?.zona_dolor
                    const filaConDolor = !!zonaDolor
                    const fondoFila =
                      filaConDolor
                        ? 'rgba(231,121,112,0.08)'
                        : i % 2 === 0
                        ? UI.tarjeta
                        : UI.filaAlternativa

                    return (
                      <tr key={j.id} style={{ backgroundColor: fondoFila }}>
                        <td
                          className="p-3 sticky left-0 z-[1]"
                          style={{
                            color: UI.texto,
                            backgroundColor: fondoFila,
                            borderBottom: `1px solid ${UI.borde}`,
                          }}
                        >
                          <div className="flex items-center gap-2.5">
                            {j.foto_url ? (
                              <img
                                src={j.foto_url}
                                alt={`${j.apellido}, ${j.nombre}`}
                                className="w-8 h-8 rounded-lg object-cover shrink-0"
                              />
                            ) : (
                              <span
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0"
                                style={{
                                  backgroundColor: 'rgba(242,194,48,0.10)',
                                  color: UI.acento,
                                  border: '1px solid rgba(242,194,48,0.20)',
                                }}
                              >
                                {`${j.nombre?.[0] || ''}${j.apellido?.[0] || ''}`.toUpperCase()}
                              </span>
                            )}

                            <div>
                              <div className="whitespace-nowrap font-medium">
                                {j.apellido}, {j.nombre}
                              </div>

                              {filaConDolor && (
                                <div
                                  className="text-[11px] mt-0.5"
                                  style={{ color: UI.peligro }}
                                >
                                  📍 {zonaDolor}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {CAMPOS.map((c) => {
                          const valor = valores[j.id]?.[c.clave] ?? ''

                          return (
                            <td
                              key={c.clave}
                              className="p-2 text-center"
                              style={{ borderBottom: `1px solid ${UI.borde}` }}
                            >
                              <input
                                type="number"
                                min="1"
                                max="5"
                                value={valor}
                                aria-label={`${c.label}: ${j.apellido}, ${j.nombre}`}
                                onChange={(e) =>
                                  cambiarValor(j.id, c.clave, e.target.value)
                                }
                                className="w-[4.25rem] p-2 rounded-lg outline-none text-sm text-center transition-colors focus:ring-1"
                                style={{
                                  ...inputStyle,
                                  borderColor:
                                    valor !== ''
                                      ? 'rgba(242,194,48,0.45)'
                                      : UI.borde,
                                }}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div
              className="px-4 py-3 flex items-center gap-2 text-xs"
              style={{
                backgroundColor: UI.fondo,
                color: UI.muted,
                borderTop: `1px solid ${UI.borde}`,
              }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: UI.acento }}
              />
              Los campos con valores cargados se resaltan en amarillo.
              Deslizá horizontalmente para ver todos los indicadores.
            </div>
          </div>

          {/* Mensajes */}
          {mensaje && (
            <div
              role="status"
              className="rounded-xl p-4 text-sm flex items-start gap-2"
              style={{
                color: mensaje.startsWith('Listo') ? UI.exito : UI.peligro,
                backgroundColor: mensaje.startsWith('Listo')
                  ? 'rgba(151,196,89,0.09)'
                  : 'rgba(231,121,112,0.09)',
                border: `1px solid ${
                  mensaje.startsWith('Listo')
                    ? 'rgba(151,196,89,0.25)'
                    : 'rgba(231,121,112,0.25)'
                }`,
              }}
            >
              <span>{mensaje.startsWith('Listo') ? '✓' : '!'}</span>
              <span>{mensaje}</span>
            </div>
          )}

          {/* Guardar */}
          <button
            onClick={handleGuardar}
            disabled={guardando}
            className="w-full p-3.5 rounded-xl font-bold transition-opacity hover:opacity-85 disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${UI.acento}, #E5AE1E)`,
              color: '#1A1914',
            }}
          >
            {guardando ? 'Guardando…' : 'Guardar wellness'}
          </button>
        </>
      )}
    </div>
  )
}

export default CargaWellness
