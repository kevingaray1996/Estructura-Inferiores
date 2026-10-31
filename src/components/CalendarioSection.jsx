import { textoSobreEstado } from '../appearance/gestion'
import { COLORES } from '../theme'
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fechaArgentina, puedePlanificar } from '../utils/planificacion'
import { cambiarMes, cargarEventosCalendario, matrizMes } from '../utils/calendario'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const DIAS_SEMANA = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SÁ']

const PALETA_ENTRENAMIENTO = [
  { bg: '#3B2F6B', color: '#C4B5FD' },
  { bg: '#1E4620', color: '#86EFAC' },
  { bg: '#1E3A5F', color: '#7DD3FC' },
  { bg: '#5C3A1E', color: '#FDBA74' },
  { bg: '#5C1E3A', color: '#F9A8D4' },
  { bg: '#1E5C52', color: '#5EEAD4' },
]

function colorParaContenido(contenido) {
  if (!contenido) return { bg: COLORES.fondoTarjeta, color: COLORES.textoSecundario }
  let hash = 0
  for (let i = 0; i < contenido.length; i++) {
    hash = contenido.charCodeAt(i) + ((hash << 5) - hash)
  }
  return PALETA_ENTRENAMIENTO[Math.abs(hash) % PALETA_ENTRENAMIENTO.length]
}

function formatearFechaLarga(fecha) {
  return new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(fecha + 'T12:00:00Z'))
}

function agruparPartidosPorRival(eventos) {
  const mapa = new Map()
  const resultado = []
  eventos.forEach((e) => {
    if (e.tipo !== 'partido') {
      resultado.push(e)
      return
    }
    const clave = `${e.fecha}|${(e.rival || e.titulo).toLowerCase().trim()}`
    if (mapa.has(clave)) {
      const existente = mapa.get(clave)
      if (e.categoria && !existente.categorias.includes(e.categoria)) {
        existente.categorias.push(e.categoria)
      }
      existente.categoriaIds.push(e.categoriaId)
    } else {
      const nuevo = {
        ...e,
        categorias: e.categoria ? [e.categoria] : [],
        categoriaIds: [e.categoriaId],
      }
      mapa.set(clave, nuevo)
      resultado.push(nuevo)
    }
  })
  return resultado
}

function CalendarioSection({ perfil, onVerPlanificacion }) {
  const { rol, categoria_id } = perfil
  const [mesActual, setMesActual] = useState(() => fechaArgentina().slice(0, 7) + '-01')
  const [lectura, setLectura] = useState(null)
  const [recarga, setRecarga] = useState(0)
  const [errorCategorias, setErrorCategorias] = useState('')
  const [cargando, setCargando] = useState(true)
  const [categorias, setCategorias] = useState([])
  const [categoriaFiltro, setCategoriaFiltro] = useState('')
  const [diaSeleccionado, setDiaSeleccionado] = useState(() => fechaArgentina())

  useEffect(() => {
    let activo = true
    async function cargarCategorias() {
      try {
        const { data, error } = await supabase.from('categorias').select('*').order('orden')
        if (!activo) return
        setCategorias(data || [])
        setErrorCategorias(error ? 'No se pudieron consultar las categorías. El filtro podría estar incompleto.' : '')
      } catch {
        if (activo) setErrorCategorias('No se pudieron consultar las categorías. Reintentá actualizar.')
      }
    }
    void cargarCategorias()
    return () => { activo = false }
  }, [recarga])

  useEffect(() => {
    let activo = true
    async function cargarEventos() {
      setCargando(true)
      const semanas = matrizMes(mesActual)
      const resultado = await cargarEventosCalendario(supabase, { rol, categoria_id }, semanas[0][0].iso, semanas.at(-1)[6].iso)
      if (activo) {
        setLectura({ ...resultado, mes: mesActual, rol, categoria: categoria_id })
        setCargando(false)
      }
    }
    void cargarEventos()
    return () => { activo = false }
  }, [mesActual, recarga, rol, categoria_id])

  const vigente = lectura?.mes === mesActual && lectura?.rol === perfil.rol && lectura?.categoria === perfil.categoria_id
  const eventos = vigente ? lectura.eventos : []
  const errores = vigente ? lectura.errores : []
  const eventosFiltrados = eventos.filter((e) => !categoriaFiltro || e.categoriaId === categoriaFiltro)
  const eventosParaMostrar = agruparPartidosPorRival(eventosFiltrados)

  const eventosPorDia = eventosParaMostrar.reduce((acc, e) => {
    if (!acc[e.fecha]) acc[e.fecha] = []
    acc[e.fecha].push(e)
    return acc
  }, {})

  const hoyISO = fechaArgentina()
  const semanas = matrizMes(mesActual)
  const eventosDelDiaSeleccionado = diaSeleccionado ? eventosPorDia[diaSeleccionado] || [] : []

  const inputStyle = {
    backgroundColor: COLORES.fondoTarjeta,
    border: `1px solid ${COLORES.borde}`,
    color: COLORES.texto,
  }

  function irAHoy() {
    setMesActual(fechaArgentina().slice(0, 7) + '-01')
    setDiaSeleccionado(hoyISO)
  }

  return (
    <div className="p-3 sm:p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <h1
          className="text-3xl md:text-4xl mb-6"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.texto }}
        >
          Calendario
        </h1>

        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMesActual((m) => cambiarMes(m, -1))}
              className="text-sm px-3 py-1.5 rounded-lg hover:opacity-80"
              style={{ backgroundColor: COLORES.fondoTarjeta, color: COLORES.textoSecundario, borderTop: `3px solid ${COLORES.acento}`, borderLeft: `1px solid ${COLORES.borde}`, borderRight: `1px solid ${COLORES.borde}`, borderBottom: `1px solid ${COLORES.borde}` }}
            >
              ←
            </button>
            <p className="text-sm font-medium min-w-[140px] text-center" style={{ color: COLORES.texto }}>
              {MESES[Number(mesActual.slice(5, 7)) - 1]} {mesActual.slice(0, 4)}
            </p>
            <button
              onClick={() => setMesActual((m) => cambiarMes(m, 1))}
              className="text-sm px-3 py-1.5 rounded-lg hover:opacity-80"
              style={{ backgroundColor: COLORES.fondoTarjeta, color: COLORES.textoSecundario, borderTop: `3px solid ${COLORES.acento}`, borderLeft: `1px solid ${COLORES.borde}`, borderRight: `1px solid ${COLORES.borde}`, borderBottom: `1px solid ${COLORES.borde}` }}
            >
              →
            </button>
            <button
              onClick={irAHoy}
              className="text-xs px-3 py-1.5 rounded-lg hover:opacity-80"
              style={{ backgroundColor: COLORES.fondoTarjeta, color: COLORES.exito, borderTop: `3px solid ${COLORES.acento}`, borderLeft: `1px solid ${COLORES.borde}`, borderRight: `1px solid ${COLORES.borde}`, borderBottom: `1px solid ${COLORES.borde}` }}
            >
              Hoy
            </button>
          </div>

          <button type="button" onClick={() => setRecarga(n => n + 1)} disabled={cargando}
            className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
            style={inputStyle}>Actualizar</button>
          {perfil.rol !== 'tecnico' && (
            <select
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
              className="p-2 rounded-xl ui-control outline-none text-sm"
              style={inputStyle}
            >
              <option value="">Todas las categorías</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="min-h-8" role="status" aria-live="polite">
          {(cargando || !vigente) && <p style={{ color: COLORES.textoMuted }}>Cargando calendario…</p>}
        </div>
        {errorCategorias && <p role="alert" className="text-sm mb-3" style={{ color: COLORES.peligro }}>{errorCategorias}</p>}
        {errores.length > 0 && <div role="alert" className="text-sm mb-3" style={{ color: COLORES.peligro }}>
          <p>El calendario podría estar incompleto.</p>{errores.map(e => <p key={e}>{e}</p>)}
        </div>}

        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${COLORES.borde}` }}>
          <div className="grid grid-cols-7" style={{ backgroundColor: COLORES.fondoTarjeta }}>
            {DIAS_SEMANA.map((d) => (
              <div
                key={d}
                className="text-center text-[10px] uppercase tracking-wide py-2"
                style={{ color: COLORES.textoMuted }}
              >
                {d}
              </div>
            ))}
          </div>

          {semanas.map((semana, i) => (
            <div key={i} className="grid grid-cols-7" style={{ borderTop: `1px solid ${COLORES.borde}` }}>
              {semana.map((dia) => {
                const eventosDia = eventosPorDia[dia.iso] || []
                const esHoy = dia.iso === hoyISO
                const esSeleccionado = dia.iso === diaSeleccionado
                const visibles = eventosDia.slice(0, 3)
                const restantes = eventosDia.length - visibles.length

                return (
                  <div
                    key={dia.iso}
                    onClick={() => setDiaSeleccionado(dia.iso)}
                    role="button" tabIndex={0} aria-label={formatearFechaLarga(dia.iso)} aria-pressed={esSeleccionado}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDiaSeleccionado(dia.iso) } }}
                    className="min-h-[84px] p-1 sm:p-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                    style={{
                      borderLeft: `1px solid ${COLORES.borde}`,
                      backgroundColor: esSeleccionado ? COLORES.fondoTarjeta : 'transparent',
                      opacity: dia.delMes ? 1 : 0.35,
                    }}
                  >
                    <div className="flex justify-end mb-1">
                      <span
                        className="w-5 h-5 flex items-center justify-center text-xs rounded-full"
                        style={{
                          backgroundColor: esHoy ? COLORES.exito : 'transparent',
                          color: esHoy ? textoSobreEstado(COLORES.exito) : COLORES.textoSecundario,
                          fontWeight: esHoy ? 700 : 400,
                        }}
                      >
                        {dia.numero}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {visibles.map((e) => {
                        const c =
                          e.tipo === 'partido'
                            ? { bg: COLORES.fondoPagina, color: COLORES.exito }
                            : e.tipo === 'planificacion'
                              ? { bg: 'var(--inicio-amarillo-suave)', color: 'var(--ui-texto-acento)' }
                              : colorParaContenido(e.titulo)
                        return (
                          <div
                            key={e.id}
                            className="text-[9px] px-1 py-0.5 rounded truncate leading-tight"
                            style={{ backgroundColor: c.bg, color: c.color }}
                            title={(e.tipo === 'video' ? 'Video de entrenamiento: ' : e.tipo === 'planificacion' ? 'Planificación: ' : 'Partido: ') + e.titulo}
                          >
                            {e.tipo === 'partido' ? '🛡️ ' : e.tipo === 'video' ? '▶ ' : '▦ '}
                            {e.hora && `${e.hora} `}
                            {e.titulo}
                          </div>
                        )
                      })}
                      {restantes > 0 && (
                        <p className="text-[9px] px-1" style={{ color: COLORES.textoMuted }}>
                          +{restantes} más
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {diaSeleccionado && (
          <div className="mt-6">
            <p className="text-xs uppercase tracking-wide mb-2" style={{ color: COLORES.textoMuted }}>
              {formatearFechaLarga(diaSeleccionado)}
            </p>

            {eventosDelDiaSeleccionado.length === 0 ? (
              <p className="text-sm" style={{ color: COLORES.textoMuted }}>
                {cargando || !vigente ? 'Consultando eventos…' : errores.length ? 'No se pudieron cargar todos los eventos de este día.' : 'No hay partidos, videos ni planificaciones ese día.'}
              </p>
            ) : (
              <div className="space-y-2">
                {eventosDelDiaSeleccionado.map((e) => (
                  <div
                    key={e.id}
                    className="p-3 rounded-xl flex items-center gap-3 flex-wrap"
                    style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: `3px solid ${COLORES.acento}`, borderLeft: `1px solid ${COLORES.borde}`, borderRight: `1px solid ${COLORES.borde}`, borderBottom: `1px solid ${COLORES.borde}` }}
                  >
                    {e.tipo === 'partido' ? (
                      e.escudo ? (
                        <img
                          src={e.escudo}
                          alt={e.titulo}
                          className="w-8 h-8 rounded object-contain shrink-0"
                          style={{ backgroundColor: COLORES.fondoPagina }}
                        />
                      ) : (
                        <span
                          className="w-8 h-8 rounded flex items-center justify-center text-sm shrink-0"
                          style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoMuted }}
                        >
                          🛡️
                        </span>
                      )
                    ) : (
                      <span
                        className="w-8 h-8 rounded flex items-center justify-center text-sm shrink-0"
                        style={{ backgroundColor: COLORES.fondoPagina }}
                      >
                        {e.tipo === 'video' ? '▶' : '▦'}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: COLORES.texto }}>
                        {e.titulo}
                      </p>
                      <p className="text-xs break-words" style={{ color: COLORES.textoSecundario }}>
                        {e.detalle}
                        {e.categorias?.length > 0 && ` · ${e.categorias.join(', ')}`}
                        {!e.categorias && e.categoria && ` · ${e.categoria}`}
                      </p>
                      {e.tipo === 'planificacion' && <>
                        <p className="text-xs mt-1" style={{ color: COLORES.textoSecundario }}>
                          {e.estado === 'publicado' ? 'Publicado' : 'Borrador'}
                          {e.entrenamientoRealId ? ' · Vinculada a un entrenamiento registrado' : ''}
                        </p>
                        {onVerPlanificacion && puedePlanificar(perfil, e.categoriaId) && <button type="button"
                          className="mt-2 rounded-lg px-3 py-2 text-xs font-semibold hover:opacity-80"
                          style={{ backgroundColor: COLORES.acento, color: 'var(--ui-texto-sobre-acento)' }}
                          onClick={() => onVerPlanificacion(e.fecha, e.categoriaId, e.originalId)}>
                          Abrir planificación
                        </button>}
                      </>}
                    </div>
                    <span
                      className="text-[10px] font-mono px-2 py-1 rounded-full shrink-0"
                      style={{
                        backgroundColor: COLORES.fondoPagina,
                        color: e.tipo === 'partido' ? COLORES.exito : COLORES.textoSecundario,
                      }}
                    >
                      {e.tipo === 'partido' ? 'Partido' : e.tipo === 'video' ? 'Video de entrenamiento' : 'Planificación'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default CalendarioSection



