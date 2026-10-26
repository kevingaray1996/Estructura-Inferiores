import { WELLNESS, textoWellness } from '../appearance/wellness'
import { tintePlantel } from '../appearance/plantel'

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerFechaHoy } from '../utils/fecha'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'

// Alias visual: conserva la superficie alternativa original de estos formularios.
const UI = { ...WELLNESS, tarjetaAlternativa: WELLNESS.filaAlternativa }

function CargaCMJ() {
  const [categoria, setCategoria] = useState(null)
  const [fecha, setFecha] = useState(obtenerFechaHoy())
  const [jugadores, setJugadores] = useState([])
  const [valores, setValores] = useState({})
  const [idsConRegistro, setIdsConRegistro] = useState(new Set())
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

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
        const { data: cmjData } = await supabase
          .from('cmj')
          .select('*')
          .eq('fecha', fecha)
          .in('jugador_id', ids)

        const mapa = {}

        ;(cmjData || []).forEach((c) => {
          mapa[c.jugador_id] = c.valor_cm
        })

        setValores(mapa)
        setIdsConRegistro(new Set((cmjData || []).map((c) => c.jugador_id)))
      } else {
        setValores({})
        setIdsConRegistro(new Set())
      }

      setCargando(false)
    }

    cargar()
  }, [categoria, fecha])

  function cambiarValor(jugadorId, valor) {
    setValores((prev) => ({ ...prev, [jugadorId]: valor }))
  }

  async function handleGuardar() {
    setGuardando(true)
    setMensaje('')

    function tieneValor(jugadorId) {
      const v = valores[jugadorId]
      return v !== undefined && v !== '' && v !== null
    }

    const filas = jugadores
      .filter((j) => tieneValor(j.id))
      .map((j) => ({
        fecha,
        jugador_id: j.id,
        valor_cm: Number(valores[j.id]),
      }))

    const idsABorrar = jugadores
      .filter((j) => idsConRegistro.has(j.id) && !tieneValor(j.id))
      .map((j) => j.id)

    if (filas.length > 0) {
      const { error } = await supabase
        .from('cmj')
        .upsert(filas, { onConflict: 'fecha,jugador_id' })

      if (error) {
        setMensaje('Error al guardar: ' + error.message)
        setGuardando(false)
        return
      }
    }

    if (idsABorrar.length > 0) {
      const { error } = await supabase
        .from('cmj')
        .delete()
        .eq('fecha', fecha)
        .in('jugador_id', idsABorrar)

      if (error) {
        setMensaje('Error al borrar: ' + error.message)
        setGuardando(false)
        return
      }
    }

    setIdsConRegistro(
      new Set(jugadores.filter((j) => tieneValor(j.id)).map((j) => j.id))
    )

    setGuardando(false)
    setMensaje('Listo, valores de CMJ guardados.')
  }

  const cantidadCargada = jugadores.filter((j) => {
    const valor = valores[j.id]
    return valor !== undefined && valor !== '' && valor !== null
  }).length

  const inputStyle = {
    backgroundColor: UI.tarjetaAlternativa,
    border: `1px solid ${UI.borde}`,
    color: UI.texto,
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div
        className="rounded-2xl p-5 sm:p-6"
        style={{
          background: `linear-gradient(135deg, ${UI.tarjeta} 0%, ${UI.tarjetaAlternativa} 100%)`,
          border: `1px solid ${UI.borde}`,
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{
              backgroundColor: tintePlantel(UI.acento, '18'),
              color: textoWellness(UI.acento),
              border: "1px solid " + tintePlantel(UI.acento, '40'),
            }}
          >
            <svg
              width="23"
              height="23"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 17h3l3-10 4 14 3-9 2 5h3" />
            </svg>
          </div>

          <div className="min-w-0">
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-1"
              style={{ color: textoWellness(UI.acento) }}
            >
              Rendimiento físico
            </p>
            <h2
              className="text-xl sm:text-2xl font-bold"
              style={{ color: UI.texto }}
            >
              Control de CMJ
            </h2>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: UI.secundario }}>
              Test de salto contramovimiento. Registrá la altura de salto de
              Primera División en centímetros.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <div
            className="rounded-xl p-3"
            style={{ backgroundColor: UI.fondo, border: `1px solid ${UI.borde}` }}
          >
            <p className="text-xs mb-1" style={{ color: UI.muted }}>
              Jugadoras
            </p>
            <p className="text-2xl font-bold" style={{ color: UI.texto }}>
              {jugadores.length}
            </p>
          </div>

          <div
            className="rounded-xl p-3"
            style={{ backgroundColor: UI.fondo, border: `1px solid ${UI.borde}` }}
          >
            <p className="text-xs mb-1" style={{ color: UI.muted }}>
              Valores cargados
            </p>
            <p className="text-2xl font-bold" style={{ color: textoWellness(UI.acento) }}>
              {cantidadCargada}
              <span className="text-sm font-normal" style={{ color: UI.muted }}>
                {' '}/ {jugadores.length}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Fecha */}
      <div
        className="rounded-2xl p-4 sm:p-5"
        style={{ backgroundColor: UI.tarjeta, border: `1px solid ${UI.borde}` }}
      >
        <label
          htmlFor="fecha-cmj"
          className="block text-sm font-semibold mb-2"
          style={{ color: UI.texto }}
        >
          Fecha del test
        </label>

        <input
          id="fecha-cmj"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="w-full sm:w-64 p-3 rounded-xl ui-control outline-none text-sm"
          style={inputStyle}
        />

        <p className="text-xs mt-2" style={{ color: UI.muted }}>
          Seleccioná la fecha correspondiente a la evaluación.
        </p>
      </div>

      {!categoria && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{
            backgroundColor: UI.tarjeta,
            border: `1px solid ${UI.borde}`,
            color: UI.secundario,
          }}
        >
          No se encontró la categoría Primera División.
        </div>
      )}

      {cargando && (
        <div
          className="rounded-xl p-5 text-sm flex items-center gap-3"
          style={{
            backgroundColor: UI.tarjeta,
            border: `1px solid ${UI.borde}`,
            color: UI.secundario,
          }}
        >
          <span
            className="w-4 h-4 rounded-full border-2 animate-spin shrink-0"
            style={{ borderColor: UI.borde, borderTopColor: UI.acento }}
          />
          Cargando jugadoras y registros...
        </div>
      )}

      {!cargando && categoria && jugadores.length === 0 && (
        <div
          className="rounded-2xl p-6 text-center"
          style={{ backgroundColor: UI.tarjeta, border: `1px solid ${UI.borde}` }}
        >
          <div className="text-3xl mb-3" style={{ color: UI.muted }}>
            —
          </div>
          <p className="font-semibold" style={{ color: UI.texto }}>
            No hay jugadoras cargadas
          </p>
          <p className="text-sm mt-1" style={{ color: UI.secundario }}>
            No se encontraron jugadoras de Primera División.
          </p>
        </div>
      )}

      {!cargando && jugadores.length > 0 && (
        <>
          {/* Listado de jugadoras */}
          <div
            className="overflow-hidden rounded-2xl"
            style={{ backgroundColor: UI.tarjeta, border: `1px solid ${UI.borde}` }}
          >
            <div
              className="px-4 sm:px-5 py-4 flex items-center justify-between gap-3"
              style={{ borderBottom: `1px solid ${UI.borde}` }}
            >
              <div>
                <h3 className="font-semibold" style={{ color: UI.texto }}>
                  Registro por jugadora
                </h3>
                <p className="text-xs mt-1" style={{ color: UI.muted }}>
                  Ingresá el resultado en centímetros.
                </p>
              </div>
              <span
                className="text-xs font-semibold px-3 py-1.5 rounded-full shrink-0"
                style={{ backgroundColor: tintePlantel(UI.acento, '18'), color: textoWellness(UI.acento) }}
              >
                CM
              </span>
            </div>

            <div className="p-3 sm:p-4 space-y-2">
              {jugadores.map((j, index) => {
                const tieneValor =
                  valores[j.id] !== undefined &&
                  valores[j.id] !== '' &&
                  valores[j.id] !== null

                return (
                  <div
                    key={j.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl"
                    style={{
                      backgroundColor: index % 2 === 0 ? UI.tarjetaAlternativa : UI.fondo,
                      border: `1px solid ${UI.borde}`,
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {j.foto_url ? (
                        <img
                          src={j.foto_url}
                          alt={`${j.apellido}, ${j.nombre}`}
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <span
                          className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{
                            backgroundColor: tintePlantel(UI.acento, '18'),
                            color: textoWellness(UI.acento),
                            border: "1px solid " + tintePlantel(UI.acento, '35'),
                          }}
                        >
                          {`${j.nombre?.[0] || ''}${j.apellido?.[0] || ''}`.toUpperCase()}
                        </span>
                      )}

                      <div className="min-w-0">
                        <p
                          className="text-sm font-medium truncate"
                          style={{ color: UI.texto }}
                        >
                          {j.apellido}, {j.nombre}
                        </p>
                        <p className="text-xs mt-1" style={{ color: UI.muted }}>
                          {tieneValor ? 'Valor ingresado' : 'Sin registro'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="0,0"
                        aria-label={`CMJ de ${j.apellido}, ${j.nombre} en centímetros`}
                        value={valores[j.id] ?? ''}
                        onChange={(e) => cambiarValor(j.id, e.target.value)}
                        className="w-20 sm:w-24 p-2.5 rounded-lg ui-control outline-none text-sm text-center"
                        style={{
                          backgroundColor: UI.fondo,
                          border: `1px solid ${tieneValor ? UI.acento : UI.borde}`,
                          color: UI.texto,
                        }}
                      />
                      <span className="text-xs" style={{ color: UI.muted }}>
                        cm
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Mensaje de estado */}
          {mensaje && (
            <div
              role="status"
              className="rounded-xl p-3 text-sm flex items-start gap-2"
              style={{
                backgroundColor: mensaje.startsWith('Listo')
                  ? tintePlantel(UI.exito, '15')
                  : tintePlantel(UI.peligro, '15'),
                border: "1px solid " + tintePlantel(mensaje.startsWith('Listo') ? UI.exito : UI.peligro, '50'),
                color: mensaje.startsWith('Listo') ? UI.exito : UI.peligro,
              }}
            >
              <span className="font-bold">
                {mensaje.startsWith('Listo') ? '✓' : '!'}
              </span>
              <span>{mensaje}</span>
            </div>
          )}

          {/* Guardar */}
          <button
            onClick={handleGuardar}
            disabled={guardando || cargando}
            className="w-full p-3.5 rounded-xl font-bold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{
              backgroundColor: UI.acento,
              color: 'var(--riesgo-boton-texto, #191917)',
            }}
          >
            {guardando ? 'Guardando resultados...' : 'Guardar resultados CMJ'}
          </button>

          <p className="text-xs text-center" style={{ color: UI.muted }}>
            Los cambios se aplican a la fecha seleccionada.
          </p>
        </>
      )}
    </div>
  )
}

export default CargaCMJ
