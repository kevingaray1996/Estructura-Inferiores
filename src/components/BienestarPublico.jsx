import EntrenamientoDeHoy from './EntrenamientoDeHoy'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerFechaHoy } from '../utils/fecha'
import { COLORES } from '../theme'
import { fechaLarga } from '../utils/formatoFecha'
import EncabezadoSeccion from './ui/EncabezadoSeccion'
import EstadoVacio from './ui/EstadoVacio'
import FormularioWellness from './wellness/FormularioWellness'
import FormularioRpe from './wellness/FormularioRpe'

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function fechaHaceNDias(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const anio = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

function BienestarPublico({ categoriaId }) {
  const fecha = obtenerFechaHoy()
  const fechaMinima = fechaHaceNDias(3)

  const [categoria, setCategoria] = useState(null)
  const [jugadores, setJugadores] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState(null)
  const [vista, setVista] = useState('bienestar')
  const [cargando, setCargando] = useState(true)
  const [enviado, setEnviado] = useState(false)

  const [errorCarga, setErrorCarga] = useState('')
  const seleccionActual = useRef(null)

  // Sin login, el formulario no lee ni escribe tablas: usa funciones de la base que validan
  // la categoría del link y no devuelven ninguna respuesta guardada (ver supabase/migrations/*_seguridad_pasoA_*).
  useEffect(() => {
    async function cargar() {
      setCargando(true)
      setErrorCarga('')
      const { data, error: errorLista } = await supabase.rpc('wellness_publico_categoria', { p_categoria_id: categoriaId })
      setCategoria(data ? { nombre: data.nombre } : null)
      setJugadores(data?.jugadoras || [])
      // 22P02: el id del link no tiene formato válido; para la jugadora es lo mismo que un link inexistente.
      if (errorLista && errorLista.code !== '22P02') setErrorCarga('No se pudo cargar la lista. Revisá la conexión y volvé a abrir el link.')
      else if (!data) setErrorCarga('Este link de Wellness no es válido. Pedile el link actualizado al cuerpo técnico.')
      setCargando(false)
    }
    cargar()
  }, [categoriaId])

  // El formulario arranca siempre vacío: solo se consulta si ya completó hoy (sí/no).
  async function elegirJugador(j) {
    seleccionActual.current = j.id
    setJugadorSeleccionado(j)
    setVista('bienestar')
    setEnviado(false)
    const { data: yaCompleto } = await supabase.rpc('wellness_publico_respondio', {
      p_categoria_id: categoriaId,
      p_jugadora_id: j.id,
    })
    // Si mientras tanto eligió otra jugadora, esta respuesta ya no corresponde.
    if (seleccionActual.current === j.id) setEnviado(yaCompleto === true)
  }

  // La fecha del Wellness la pone la base (hoy en Argentina). Si ya había respuesta hoy, la reemplaza.
  async function guardarWellness(valores) {
    const { error } = await supabase.rpc('wellness_publico_guardar', {
      p_categoria_id: categoriaId,
      p_jugadora_id: jugadorSeleccionado.id,
      p_sueno: valores.sueno,
      p_dolor_muscular: valores.dolor_muscular,
      p_fatiga: valores.fatiga,
      p_estres: valores.estres,
      p_animo_entrenar: valores.animo_entrenar,
      p_zona_dolor: valores.zona_dolor,
      p_fase_ciclo: valores.fase_ciclo,
    })
    return { error: error?.message }
  }

  // Solo guarda el RPE: la base valida el día (hoy y 3 días antes) y no toca minutos ni GPS.
  async function guardarRpe({ fecha: dia, tipo, rpe }) {
    const { error } = await supabase.rpc('rpe_publico_guardar', {
      p_categoria_id: categoriaId,
      p_jugadora_id: jugadorSeleccionado.id,
      p_fecha: dia,
      p_tipo: tipo,
      p_rpe: rpe,
    })
    return { error: error?.message }
  }


  const jugadoresFiltrados = jugadores.filter((j) => {
    const nombreCompleto = `${j.nombre} ${j.apellido}`.toLowerCase()
    return !busqueda || nombreCompleto.includes(busqueda.toLowerCase())
  })

  const inputStyle = {
    backgroundColor: COLORES.fondoTarjeta,
    border: `1px solid ${COLORES.borde}`,
    color: COLORES.texto,
  }

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: COLORES.fondoPagina }}>
      <div className="max-w-md mx-auto pt-6">
        <div className="mb-6">
          <EncabezadoSeccion eyebrow={categoria?.nombre || 'Comunicaciones'} eyebrowResaltado={fechaLarga(fecha)} titulo="Well" resaltado="ness" />
        </div>

        {cargando && <EstadoVacio cargando mensaje="Cargando…" />}

        {!cargando && errorCarga && <EstadoVacio mensaje={errorCarga} />}

        {!cargando && !errorCarga && !jugadorSeleccionado && (
          <>
            <input
              type="text"
              placeholder="Buscá tu nombre..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full p-3 rounded-xl ui-control outline-none text-sm mb-4"
              style={inputStyle}
            />
            <div className="space-y-2">
              {jugadoresFiltrados.map((j) => (
                <div
                  key={j.id}
                  onClick={() => elegirJugador(j)}
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
                  style={inputStyle}
                >
                  {j.foto_url ? (
                    <img
                      src={j.foto_url}
                      alt={`${j.apellido}, ${j.nombre}`}
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <span
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ backgroundColor: COLORES.fondoSidebar, color: COLORES.textoSecundario }}
                    >
                      {iniciales(j.nombre, j.apellido)}
                    </span>
                  )}
                  <p className="text-sm font-medium" style={{ color: COLORES.texto }}>
                    {j.apellido}, {j.nombre}
                  </p>
                </div>
              ))}
              {jugadoresFiltrados.length === 0 && (
                <p className="text-sm" style={{ color: COLORES.textoMuted }}>No se encontraron jugadores.</p>
              )}
            </div>
          </>
        )}

        {jugadorSeleccionado && (
          <>
            <button
              onClick={() => setJugadorSeleccionado(null)}
              className="text-sm mb-4 flex items-center gap-1 hover:opacity-70 transition-opacity"
              style={{ color: COLORES.textoSecundario }}
            >
              ← No soy yo
            </button>

            <p className="text-sm font-medium mb-4" style={{ color: COLORES.texto }}>
              Hola, {jugadorSeleccionado.nombre} 👋
            </p>

            <EntrenamientoDeHoy categoriaId={categoriaId} jugadoraId={jugadorSeleccionado.id} plantel={jugadores} />

            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setVista('bienestar')}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: vista === 'bienestar' ? COLORES.acento : COLORES.fondoTarjeta,
                  color: vista === 'bienestar' ? 'var(--ui-texto-sobre-acento)' : COLORES.textoSecundario,
                  border: `1px solid ${COLORES.borde}`,
                }}
              >
                🧠 Bienestar
              </button>
              <button
                onClick={() => setVista('rpe')}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: vista === 'rpe' ? COLORES.acento : COLORES.fondoTarjeta,
                  color: vista === 'rpe' ? 'var(--ui-texto-sobre-acento)' : COLORES.textoSecundario,
                  border: `1px solid ${COLORES.borde}`,
                }}
              >
                💪 Esfuerzo (RPE)
              </button>
            </div>

            {/* Los dos formularios quedan montados: al cambiar de pestaña no se pierde lo que ya marcó. La key por
                jugadora los reinicia cuando elige otro nombre. */}
            <div hidden={vista !== 'bienestar'}>
              <FormularioWellness key={jugadorSeleccionado.id} completado={enviado} onCompletado={setEnviado} onGuardar={guardarWellness} />
            </div>

            <div hidden={vista !== 'rpe'}>
              <FormularioRpe key={jugadorSeleccionado.id} fechaHoy={fecha} fechaMinima={fechaMinima} onGuardar={guardarRpe} />
            </div>

          </>
        )}
      </div>
    </div>
  )
}

export default BienestarPublico
