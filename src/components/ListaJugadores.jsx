import PestanasAccesibles from './ui/PestanasAccesibles'
import { agruparPlantel } from './plantel/posicionesPlantel'
import BarraFiltros from './ui/BarraFiltros'
import EstadoContenido from './ui/EstadoContenido'
import TarjetaJugadora from './plantel/TarjetaJugadora'
import './plantel/plantel.css'
import { PLANTEL as P, textoPlantel } from '../appearance/plantel'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { generarPlantelPDF } from '../utils/generarPlantelPDF'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'
import { obtenerEstadisticasCategoria } from '../utils/exportarEstadisticas'
import { COLORES } from '../theme'

const estadoConfig = {
  disponible: {
    label: 'Disponible',
    color: '#4ADE80',
    fondo: '#163627',
  },
  lesionado: {
    label: 'Lesionada',
    color: '#F87171',
    fondo: '#402326',
  },
  suspendido: {
    label: 'Suspendida',
    color: '#FBBF24',
    fondo: '#40351B',
  },
  no_disponible: {
    label: 'No disponible',
    color: '#A1A1AA',
    fondo: '#292B32',
  },
}

const posiciones = [
  'Arquero',
  'Defensor central',
  'Lateral derecho',
  'Lateral izquierdo',
  'Mediocampista central',
  'Volante ofensivo',
  'Extremo derecho',
  'Extremo izquierdo',
  'Delantero centro',
]

const filtrosPuesto = [
  { id: 'todas', label: 'Todas' },
  { id: 'arquera', label: 'Arqueras' },
  { id: 'defensa', label: 'Defensoras' },
  { id: 'mediocampo', label: 'Mediocampistas' },
  { id: 'delantera', label: 'Delanteras' },
]

const filtrosEstado = [
  { id: 'disponible', label: 'Disponibles', color: '#4ADE80' },
  { id: 'lesionado', label: 'Lesionadas', color: '#F87171' },
  { id: 'no_disponible', label: 'No disponibles', color: '#A1A1AA' },
]

const FORMACIONES = {
  '4-4-2': [
    [
      { id: 'DC1', nombre: 'Delantera', acepta: ['Delantero centro'] },
      { id: 'DC2', nombre: 'Delantera', acepta: ['Delantero centro'] },
    ],
    [
      { id: 'EI', nombre: 'Volante izquierdo', acepta: ['Extremo izquierdo'] },
      { id: 'MC1', nombre: 'Mediocampista', acepta: ['Mediocampista central'] },
      { id: 'MC2', nombre: 'Mediocampista', acepta: ['Mediocampista central'] },
      { id: 'ED', nombre: 'Volante derecho', acepta: ['Extremo derecho'] },
    ],
    [
      { id: 'LI', nombre: 'Lateral izquierdo', acepta: ['Lateral izquierdo'] },
      { id: 'DFC1', nombre: 'Defensora central', acepta: ['Defensor central'] },
      { id: 'DFC2', nombre: 'Defensora central', acepta: ['Defensor central'] },
      { id: 'LD', nombre: 'Lateral derecho', acepta: ['Lateral derecho'] },
    ],
    [{ id: 'ARQ', nombre: 'Arquera', acepta: ['Arquero'] }],
  ],
  '4-2-3-1': [
    [{ id: 'DC', nombre: 'Delantera', acepta: ['Delantero centro'] }],
    [
      { id: 'EI', nombre: 'Extrema izquierda', acepta: ['Extremo izquierdo'] },
      { id: 'VO', nombre: 'Volante ofensiva', acepta: ['Volante ofensivo'] },
      { id: 'ED', nombre: 'Extrema derecha', acepta: ['Extremo derecho'] },
    ],
    [
      { id: 'MC1', nombre: 'Mediocampista', acepta: ['Mediocampista central'] },
      { id: 'MC2', nombre: 'Mediocampista', acepta: ['Mediocampista central'] },
    ],
    [
      { id: 'LI', nombre: 'Lateral izquierdo', acepta: ['Lateral izquierdo'] },
      { id: 'DFC1', nombre: 'Defensora central', acepta: ['Defensor central'] },
      { id: 'DFC2', nombre: 'Defensora central', acepta: ['Defensor central'] },
      { id: 'LD', nombre: 'Lateral derecho', acepta: ['Lateral derecho'] },
    ],
    [{ id: 'ARQ', nombre: 'Arquera', acepta: ['Arquero'] }],
  ],
}

const normalizar = (valor) =>
  (valor || '').trim().toLocaleLowerCase('es-AR')

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function obtenerEstado(jugadora) {
  return estadoConfig[jugadora.estado] || estadoConfig.disponible
}

function coincideEstado(jugadora, filtro) {
  if (filtro === 'todos') return true

  const estado = jugadora.estado || 'disponible'

  if (filtro === 'no_disponible') {
    return estado === 'no_disponible' || estado === 'suspendido'
  }

  return estado === filtro
}

function coincidePuesto(jugadora, filtro) {
  if (filtro === 'todas') return true

  const posicion = normalizar(jugadora.posicion)
  const secundaria = normalizar(jugadora.posicion_secundaria)
  const posicionesJugadora = [posicion, secundaria]

  const grupos = {
    arquera: ['arquero'],
    defensa: [
      'defensor central',
      'lateral derecho',
      'lateral izquierdo',
    ],
    mediocampo: [
      'mediocampista central',
      'volante ofensivo',
      'extremo derecho',
      'extremo izquierdo',
    ],
    delantera: ['delantero centro'],
  }

  return posicionesJugadora.some((p) => grupos[filtro]?.includes(p))
}

function obtenerMinutos(jugadora, estadisticas) {
  return Number(estadisticas[String(jugadora.id)]?.minutos || 0)
}

function obtenerDato(jugadora, estadisticas, campo) {
  return Number(estadisticas[String(jugadora.id)]?.[campo] || 0)
}

function asignarOnce(jugadoras, estadisticas, formacion) {
  const filas = FORMACIONES[formacion]
  const puestos = filas.flat()
  const asignadas = new Map()
  const usadas = new Set()

  const ordenadas = [...jugadoras].sort((a, b) => {
    const diferencia =
      obtenerMinutos(b, estadisticas) - obtenerMinutos(a, estadisticas)

    if (diferencia !== 0) return diferencia

    return `${a.apellido || ''} ${a.nombre || ''}`.localeCompare(
      `${b.apellido || ''} ${b.nombre || ''}`,
      'es'
    )
  })

  for (const jugadora of ordenadas) {
    const principal = normalizar(jugadora.posicion)
    const secundaria = normalizar(jugadora.posicion_secundaria)

    const puestoPrincipal = puestos.find(
      (puesto) =>
        !asignadas.has(puesto.id) &&
        puesto.acepta.some((p) => normalizar(p) === principal)
    )

    if (puestoPrincipal) {
      asignadas.set(puestoPrincipal.id, jugadora)
      usadas.add(String(jugadora.id))
      continue
    }

    const puestoSecundario = puestos.find(
      (puesto) =>
        !asignadas.has(puesto.id) &&
        puesto.acepta.some((p) => normalizar(p) === secundaria)
    )

    if (puestoSecundario) {
      asignadas.set(puestoSecundario.id, jugadora)
      usadas.add(String(jugadora.id))
    }
  }

  return {
    filas: filas.map((fila) =>
      fila.map((puesto) => ({
        ...puesto,
        jugadora: asignadas.get(puesto.id) || null,
      }))
    ),
    usadas,
  }
}

function FotoJugadora({ jugadora, className = '' }) {
  const [errorFoto, setErrorFoto] = useState(false)

  useEffect(() => {
    setErrorFoto(false)
  }, [jugadora?.foto_url])

  if (jugadora.foto_url && !errorFoto) {
    return (
      <img
        src={jugadora.foto_url}
        alt={`${jugadora.nombre} ${jugadora.apellido}`}
        onError={() => setErrorFoto(true)}
        className={`object-cover rounded-full ${className}`}
      />
    )
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full font-bold shrink-0 ${className}`}
      style={{
        backgroundColor: P.controlLista,
        color: P.textoAmarilloLista,
        border: "1px solid var(--plantel-borde-control, #41434B)",
      }}
    >
      {iniciales(jugadora.nombre, jugadora.apellido)}
    </div>
  )
}

function TarjetaResumen({ titulo, valor, detalle, icono, color }) {
  return (
    <div
      className="rounded-2xl p-4 md:p-5 min-w-0"
      style={{
        backgroundColor: P.tarjetaLista,
        border: "1px solid var(--plantel-borde-lista, #2D3038)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs md:text-sm" style={{ color: P.secundarioLista }}>
          {titulo}
        </p>
        <span style={{ color: textoPlantel(color), fontSize: 20 }}>{icono}</span>
      </div>
      <p
        className="text-2xl md:text-3xl font-bold mt-3 truncate"
        style={{ color: textoPlantel(color) }}
      >
        {valor}
      </p>
      {detalle && (
        <p className="text-xs mt-2" style={{ color: P.secundarioLista }}>
          {detalle}
        </p>
      )}
    </div>
  )
}

function GraficoRanking({
  titulo,
  subtitulo,
  jugadoras,
  estadisticas,
  campo,
  sufijo,
  color,
}) {
  const ranking = [...jugadoras]
    .map((jugadora) => ({
      jugadora,
      valor: obtenerDato(jugadora, estadisticas, campo),
    }))
    .sort(
      (a, b) =>
        b.valor - a.valor ||
        `${a.jugadora.apellido || ''}`.localeCompare(
          `${b.jugadora.apellido || ''}`,
          'es'
        )
    )
    .filter((item) => item.valor > 0)
    .slice(0, 5)

  const maximo = Math.max(...ranking.map((item) => item.valor), 1)

  return (
    <div
      className="rounded-2xl p-4 md:p-5"
      style={{
        backgroundColor: P.tarjetaLista,
        border: "1px solid var(--plantel-borde-lista, #2D3038)",
      }}
    >
      <div className="mb-5">
        <h3 className="font-semibold" style={{ color: P.textoLista }}>
          {titulo}
        </h3>
        <p className="text-xs mt-1" style={{ color: P.secundarioLista }}>
          {subtitulo}
        </p>
      </div>

      {ranking.length === 0 ? (
        <p className="text-sm py-3" style={{ color: P.secundarioLista }}>
          Todavía no hay datos cargados.
        </p>
      ) : (
        <div className="space-y-4">
          {ranking.map(({ jugadora, valor }) => (
            <div key={jugadora.id}>
              <div className="flex justify-between items-center gap-3 mb-2">
                <span
                  className="text-sm truncate"
                  style={{ color: P.textoDetalle }}
                >
                  {jugadora.apellido}, {jugadora.nombre}
                </span>
                <span
                  className="text-sm font-bold shrink-0"
                  style={{ color: textoPlantel(color) }}
                >
                  {valor.toLocaleString('es-AR')} {sufijo}
                </span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: P.pista }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(valor / maximo) * 100}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CanchaTactica({
  jugadoras,
  estadisticas,
  formacion,
  onCambiarFormacion,
  onSelectJugador,
}) {
  const { filas, usadas } = useMemo(
    () => asignarOnce(jugadoras, estadisticas, formacion),
    [jugadoras, estadisticas, formacion]
  )

  return (
    <section
      className="plantel-cancha rounded-2xl p-4 md:p-6"
      style={{
        backgroundColor: P.tarjetaLista,
        border: "1px solid var(--plantel-borde-lista, #2D3038)",
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 style={{ color: P.blanco }} className="text-lg md:text-xl font-bold ">
            Cancha táctica
          </h2>
          <p className="text-xs mt-1" style={{ color: P.secundarioLista }}>
            Distribución automática según minutos y posiciones. No representa una convocatoria oficial.
          </p>
        </div>

        <div className="flex gap-2">
          {Object.keys(FORMACIONES).map((opcion) => (
            <button
              key={opcion}
              type="button"
              onClick={() => onCambiarFormacion(opcion)}
              aria-pressed={formacion === opcion}
              className="px-3 py-2 rounded-lg text-sm font-bold"
              style={{
                backgroundColor: formacion === opcion ? P.amarilloLista : P.controlLista,
                color: formacion === opcion ? '#171717' : P.textoDetalle,
                border: `1px solid ${formacion === opcion ? P.amarilloLista : P.bordeControl}`,
              }}
            >
              {opcion}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-between items-center gap-2 mb-3">
        <span className="text-xs" style={{ color: P.secundarioLista }}>
          {usadas.size} de 11 puestos cubiertos
        </span>
        <span className="text-xs" style={{ color: P.textoAmarilloLista }}>
          {formacion}
        </span>
      </div>

      <div
        className="relative rounded-xl overflow-hidden px-1 py-4 md:px-3 md:py-5"
        style={{
          background:
            'repeating-linear-gradient(0deg, #194D38 0px, #194D38 45px, #20583F 45px, #20583F 90px)',
          border: '1px solid #4A8065',
        }}
      >
        <div className="absolute inset-2 border border-white/30 rounded-lg pointer-events-none" />
        <div className="absolute left-0 right-0 top-1/2 border-t border-white/30 pointer-events-none" />
        <div className="absolute w-16 h-16 rounded-full border border-white/30 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        <div className="relative z-10 flex flex-col justify-around gap-3 md:gap-4 min-h-[390px] md:min-h-[420px]">
          {filas.map((fila, indiceFila) => (
            <div
              key={`${formacion}-${indiceFila}`}
              className="flex flex-wrap justify-center items-start gap-x-1 gap-y-2 md:gap-x-4"
            >
              {fila.map((puesto) => {
                const j = puesto.jugadora
                const estado = j ? obtenerEstado(j) : null

                return (
                  <div
                    key={puesto.id}
                    className="flex flex-col items-center w-[65px] sm:w-[78px] md:w-[88px] min-h-[92px]"
                  >
                    {j ? (
                      <button
                        type="button"
                        onClick={() => onSelectJugador(j.id)}
                        title={`${j.nombre} ${j.apellido} — ${puesto.nombre}`}
                        className="flex flex-col items-center w-full rounded-lg p-1 hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-white"
                      >
                        <div
                          className="rounded-full p-0.5"
                          style={{ backgroundColor: estado.color }}
                        >
                          <FotoJugadora
                            jugadora={j}
                            className="w-9 h-9 md:w-11 md:h-11"
                          />
                        </div>
                        <span className="plantel-cancha-nombre text-[10px] md:text-xs font-bold mt-1 text-center leading-tight text-white">
                          {j.apellido || j.nombre}
                        </span>
                        <span
                          className="text-[9px] mt-1 px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: P.amarilloLista, color: '#171717' }}
                        >
                          {obtenerMinutos(j, estadisticas)} min
                        </span>
                      </button>
                    ) : (
                      <div
                        className="flex flex-col items-center justify-center w-full rounded-lg p-1 min-h-[76px]"
                        style={{
                          border: '1px dashed rgba(255,255,255,0.45)',
                          backgroundColor: 'rgba(10,25,18,0.25)',
                        }}
                      >
                        <span className="text-xl text-white/80">+</span>
                        <span className="text-[9px] text-white/80 text-center leading-tight">
                          {puesto.nombre}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs mt-3" style={{ color: P.secundarioLista }}>
        Seleccioná una jugadora para abrir su perfil. Los puestos vacíos indican
        que no se encontró una jugadora compatible con esa posición.
      </p>
    </section>
  )
}

function ListaJugadores({ onSelectJugador, onNuevoJugador, onCargaMasiva }) {
  const [vistaPlantel, setVistaPlantel] = useState('jugadoras')
  const [jugadores, setJugadores] = useState([])
  const [estadisticas, setEstadisticas] = useState({})
  const [formacion, setFormacion] = useState('4-4-2')
  const [busqueda, setBusqueda] = useState('')
  const [filtroPuesto, setFiltroPuesto] = useState('todas')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [errorEstadisticas, setErrorEstadisticas] = useState('')

  useEffect(() => {
    let activo = true

    async function cargarPlantel() {
      setCargando(true)
      setErrorCarga('')
      setErrorEstadisticas('')

      try {
        const categoria = await obtenerCategoriaPrimeraDivision()

        if (!activo) return

        if (!categoria?.id) {
          setErrorCarga(
            'No se encontró la categoría Primera División. Revisá el nombre de la categoría en la base de datos.'
          )
          return
        }

        const { data, error } = await supabase
          .from('jugadores')
          .select('*, categorias(nombre)')
          .eq('categoria_id', categoria.id)
          .order('apellido')

        if (!activo) return

        if (error) {
          console.error('Error al cargar el plantel:', error)
          setErrorCarga(
            'No se pudo cargar el plantel. Revisá la conexión y los permisos.'
          )
          return
        }

        setJugadores(data || [])

        try {
          const filasEstadisticas = await obtenerEstadisticasCategoria(
            categoria.id
          )

          if (!activo) return

          const mapa = {}
          ;(filasEstadisticas || []).forEach((fila) => {
            if (fila.id != null) mapa[String(fila.id)] = fila
          })

          setEstadisticas(mapa)
        } catch (error) {
          console.error('Error al cargar estadísticas:', error)
          setErrorEstadisticas(
            'No se pudieron cargar las estadísticas. El plantel sigue disponible, pero los indicadores podrían aparecer en cero.'
          )
          setEstadisticas({})
        }
      } catch (error) {
        console.error('Error al cargar el plantel:', error)
        if (activo) setErrorCarga('Ocurrió un error al cargar el plantel.')
      } finally {
        if (activo) setCargando(false)
      }
    }

    cargarPlantel()

    return () => {
      activo = false
    }
  }, [])

  const jugadorasFiltradas = useMemo(() => {
    const texto = normalizar(busqueda)

    return jugadores.filter((j) => {
      const nombreCompleto = normalizar(`${j.nombre || ''} ${j.apellido || ''}`)
      const apellidoNombre = normalizar(`${j.apellido || ''} ${j.nombre || ''}`)
      const posicion = normalizar(j.posicion)
      const secundaria = normalizar(j.posicion_secundaria)

      const coincideBusqueda =
        !texto ||
        nombreCompleto.includes(texto) ||
        apellidoNombre.includes(texto) ||
        posicion.includes(texto) ||
        secundaria.includes(texto)

      return (
        coincideBusqueda &&
        coincidePuesto(j, filtroPuesto) &&
        coincideEstado(j, filtroEstado)
      )
    })
  }, [jugadores, busqueda, filtroPuesto, filtroEstado])

  const resumen = useMemo(() => {
    const total = jugadorasFiltradas.length
    const disponibles = jugadorasFiltradas.filter(
      (j) => (j.estado || 'disponible') === 'disponible'
    ).length
    const lesionadas = jugadorasFiltradas.filter(
      (j) => j.estado === 'lesionado'
    ).length
    const noDisponibles = jugadorasFiltradas.filter(
      (j) => j.estado === 'no_disponible' || j.estado === 'suspendido'
    ).length

    const totales = jugadorasFiltradas.reduce(
      (acc, j) => ({
        goles: acc.goles + obtenerDato(j, estadisticas, 'goles'),
        minutos: acc.minutos + obtenerDato(j, estadisticas, 'minutos'),
        titularidades:
          acc.titularidades + obtenerDato(j, estadisticas, 'titularidades'),
      }),
      { goles: 0, minutos: 0, titularidades: 0 }
    )

    return {
      total,
      disponibles,
      lesionadas,
      noDisponibles,
      ...totales,
    }
  }, [jugadorasFiltradas, estadisticas])

  const grupos = useMemo(() => {
    const gruposBase = {
      Arquera: ['Arquero'],
      Defensoras: [
        'Defensor central',
        'Lateral derecho',
        'Lateral izquierdo',
      ],
      Mediocampistas: [
        'Mediocampista central',
        'Volante ofensivo',
        'Extremo derecho',
        'Extremo izquierdo',
      ],
      Delanteras: ['Delantero centro'],
    }

    return Object.entries(gruposBase).map(([nombre, posicionesGrupo]) => ({
      nombre,
      cantidad: jugadorasFiltradas.filter((j) =>
        posicionesGrupo.includes(j.posicion)
      ).length,
    }))
  }, [jugadorasFiltradas])

  const limpiarFiltros = () => {
    setBusqueda('')
    setFiltroPuesto('todas')
    setFiltroEstado('todos')
  }

  const hayFiltrosActivos =
    busqueda.trim() !== '' ||
    filtroPuesto !== 'todas' ||
    filtroEstado !== 'todos'

  return (
    <div
      className="min-h-full plantel-premium"
      style={{ backgroundColor: P.fondoLista }}
    >
      <div className="plantel-premium-contenido">
        <header className="plantel-portada">
          <img className="plantel-portada-foto" src="/images/plantel/plantel-femenino-portada.jpg" width="1920" height="704"
            alt="Plantel femenino de Club Comunicaciones" fetchPriority="high" />
          <div className="plantel-portada-textos"><p>CLUB COMUNICACIONES</p><h1>PLANTEL <span aria-hidden="true">//</span></h1>
            <span className="plantel-portada-subtitulo">PRIMERA DIVISIÓN · FÚTBOL FEMENINO</span></div>
        </header>
        <div className="plantel-herramientas" role="group" aria-label="Acciones del plantel">            <button
              type="button"
              onClick={generarPlantelPDF}
              className="text-sm font-semibold px-3 py-2.5 rounded-xl"
              style={{
                backgroundColor: P.tarjetaLista,
                color: P.textoDetalle,
                border: "1px solid var(--plantel-separador, #34363F)",
              }}
            >
              ↓ Descargar PDF
            </button>

            <button
              type="button"
              onClick={onCargaMasiva}
              className="text-sm font-semibold px-3 py-2.5 rounded-xl"
              style={{
                backgroundColor: P.tarjetaLista,
                color: P.textoDetalle,
                border: "1px solid var(--plantel-separador, #34363F)",
              }}
            >
              Carga masiva
            </button>

            <button
              type="button"
              onClick={onNuevoJugador}
              className="text-sm font-bold px-4 py-2.5 rounded-xl"
              style={{ backgroundColor: P.amarilloLista, color: '#171717' }}
            >
              + Nueva jugadora
            </button>

</div>

        {cargando ? (
          <EstadoContenido estado="cargando" titulo="Cargando plantel…" />
        ) : errorCarga ? (
          <EstadoContenido estado="error" mensaje={errorCarga} />
        ) : (
          <>
            {errorEstadisticas && (
              <div
                className="rounded-xl p-3 text-sm"
                style={{
                  backgroundColor: P.avisoFondo,
                  color: P.aviso,
                  border: "1px solid var(--plantel-aviso-borde, #514323)",
                }}
              >
                {errorEstadisticas}
              </div>
            )}

            {/* Buscador y filtros */}
            <section className="plantel-filtros" aria-label="Listado y filtros de jugadoras">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h2 style={{ color: P.blanco }} className="text-lg font-bold ">
                    Listado de jugadoras
                  </h2>
                  <p className="text-xs mt-1" style={{ color: P.secundarioLista }}>
                    Buscá, filtrá y accedé a cada perfil.
                  </p>
                </div>
                <span className="text-sm" style={{ color: P.textoAmarilloLista }}>
                  {jugadorasFiltradas.length} resultado
                  {jugadorasFiltradas.length === 1 ? '' : 's'}
                </span>
              </div>

              <BarraFiltros etiqueta="Filtros del plantel">
              <div className="plantel-busqueda">
                <label htmlFor="plantel-busqueda">Buscar jugadora</label>
                <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: P.secundarioLista }}
                >
                  ⌕
                </span>
                <input
                  id="plantel-busqueda"
                  type="search"
                  placeholder="Buscar por nombre, apellido o posición..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="w-full rounded-xl py-3 pl-10 pr-4 ui-control outline-none text-sm"
                  style={{
                    backgroundColor: P.fondoLista,
                    border: "1px solid var(--plantel-separador, #34363F)",
                    color: P.textoLista,
                  }}
                />
              </div>

              </div>
              <div className="space-y-2 plantel-grupo-filtro">
                <p
                  className="text-[10px] font-bold tracking-[0.15em] uppercase"
                  style={{ color: P.secundarioLista }}
                >
                  Filtrar por puesto
                </p>
                <div className="flex flex-wrap gap-2">
                  {filtrosPuesto.map((filtro) => {
                    const activo = filtroPuesto === filtro.id

                    return (
                      <button
                        key={filtro.id}
                        type="button"
                        onClick={() => setFiltroPuesto(filtro.id)}
                        aria-pressed={activo}
                        className="px-3 py-2 rounded-lg text-xs md:text-sm font-semibold transition-colors"
                        style={{
                          backgroundColor: activo ? P.amarilloLista : P.controlLista,
                          color: activo ? '#171717' : P.textoControl,
                          border: `1px solid ${activo ? P.amarilloLista : P.bordeControl}`,
                        }}
                      >
                        {filtro.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2 plantel-grupo-filtro">
                <p
                  className="text-[10px] font-bold tracking-[0.15em] uppercase"
                  style={{ color: P.secundarioLista }}
                >
                  Disponibilidad
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFiltroEstado('todos')}
                    aria-pressed={filtroEstado === 'todos'}
                    className="px-3 py-2 rounded-lg text-xs md:text-sm font-semibold"
                    style={{
                      backgroundColor:
                        filtroEstado === 'todos' ? P.separador : P.controlInactivo,
                      color: P.textoLista,
                      border: `1px solid ${filtroEstado === 'todos' ? P.bordeSeleccionado : P.separador}`,
                    }}
                  >
                    Todos los estados
                  </button>

                  {filtrosEstado.map((filtro) => {
                    const activo = filtroEstado === filtro.id

                    return (
                      <button
                        key={filtro.id}
                        type="button"
                        onClick={() => setFiltroEstado(filtro.id)}
                        aria-pressed={activo}
                        className="px-3 py-2 rounded-lg text-xs md:text-sm font-semibold"
                        style={{
                          backgroundColor: activo ? `${filtro.color}20` : P.controlInactivo,
                          color: textoPlantel(filtro.color),
                          border: `1px solid ${activo ? filtro.color : P.separador}`,
                        }}
                      >
                        {filtro.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {hayFiltrosActivos && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={limpiarFiltros}
                    className="text-xs font-semibold underline underline-offset-4"
                    style={{ color: P.textoAmarilloLista }}
                  >
                    Limpiar filtros
                  </button>
                </div>
              )}
              </BarraFiltros>
            </section>

            <PestanasAccesibles etiqueta="Vistas de Plantel" seleccionada={vistaPlantel} onSeleccionar={setVistaPlantel}
              pestanas={[
                { id: 'jugadoras', etiqueta: 'Jugadoras', contenido: (<div className="plantel-galeria" id="plantel-jugadoras">
  {agruparPlantel(jugadorasFiltradas).map(grupo => <section key={grupo.id} className="plantel-grupo" aria-labelledby={'grupo-' + grupo.id}>
    <header className="plantel-grupo-titulo"><h2 id={'grupo-' + grupo.id}>{grupo.nombre}</h2><span>({grupo.jugadoras.length})</span></header>
    <div className="plantel-listado">{grupo.jugadoras.map(j => <TarjetaJugadora key={j.id} jugadora={j}
      foto={<FotoJugadora jugadora={j} />} onAbrir={onSelectJugador} />)}</div>
    {grupo.id === 'sin_equivalencia' && <p className="plantel-grupo-aviso">Estas posiciones principales no tienen una equivalencia definida. Se conservan sin asignar un puesto arbitrario.</p>}
  </section>)}
  {jugadorasFiltradas.length === 0 && <EstadoContenido estado="vacio" titulo="No hay jugadoras para mostrar"
    mensaje="Probá cambiar los filtros o la búsqueda.">
    {hayFiltrosActivos && <button type="button" className="dp-boton" onClick={limpiarFiltros}>Limpiar filtros</button>}
  </EstadoContenido>}
</div>) },
                { id: 'rendimiento', etiqueta: 'Rendimiento', contenido: (<div className="plantel-rendimiento">
            {/* Resumen del plantel */}
            <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <TarjetaResumen
                titulo="Jugadoras"
                valor={resumen.total}
                detalle="Según los filtros activos"
                icono="◉"
                color="#F4D21F"
              />
              <TarjetaResumen
                titulo="Disponibles"
                valor={resumen.disponibles}
                detalle="En condiciones de jugar"
                icono="✓"
                color="#4ADE80"
              />
              <TarjetaResumen
                titulo="Lesionadas"
                valor={resumen.lesionadas}
                detalle="Estado registrado"
                icono="＋"
                color="#F87171"
              />
              <TarjetaResumen
                titulo="No disponibles"
                valor={resumen.noDisponibles}
                detalle="Incluye suspendidas"
                icono="—"
                color="#A1A1AA"
              />
            </section>

            {/* Distribución por puesto debajo del listado */}
            <section
              className="rounded-2xl p-4 md:p-5"
              style={{
                backgroundColor: P.tarjetaLista,
                border: "1px solid var(--plantel-borde-lista, #2D3038)",
              }}
            >
              <div className="mb-4">
                <h2 style={{ color: P.blanco }} className="text-lg font-bold ">
                  Distribución por puesto
                </h2>
                <p className="text-xs mt-1" style={{ color: P.secundarioLista }}>
                  Cantidad según las jugadoras que estás viendo.
                </p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {grupos.map((grupo) => (
                  <div
                    key={grupo.nombre}
                    className="rounded-xl p-4"
                    style={{
                      backgroundColor: P.fondoLista,
                      border: "1px solid var(--plantel-borde-lista, #2D3038)",
                    }}
                  >
                    <p className="text-xs" style={{ color: P.secundarioLista }}>
                      {grupo.nombre}
                    </p>
                    <p style={{ color: P.blanco }} className="text-2xl font-bold  mt-2">
                      {grupo.cantidad}
                    </p>
                    <div
                      className="h-1 rounded-full mt-3 overflow-hidden"
                      style={{ backgroundColor: P.pista }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${jugadorasFiltradas.length ? (grupo.cantidad / jugadorasFiltradas.length) * 100 : 0}%`,
                          backgroundColor: P.amarilloLista,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Rendimiento con estadísticas reales */}
            <section className="space-y-3">
              <div>
                <h2 style={{ color: P.blanco }} className="text-lg font-bold ">
                  Rendimiento del plantel
                </h2>
                <p className="text-xs mt-1" style={{ color: P.secundarioLista }}>
                  Datos registrados para las jugadoras que estás viendo.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <GraficoRanking
                  titulo="Minutos jugados"
                  subtitulo="Top 5 por minutos acumulados"
                  jugadoras={jugadorasFiltradas}
                  estadisticas={estadisticas}
                  campo="minutos"
                  sufijo="min"
                  color="#F4D21F"
                />
                <GraficoRanking
                  titulo="Goleadoras"
                  subtitulo="Top 5 por goles registrados"
                  jugadoras={jugadorasFiltradas}
                  estadisticas={estadisticas}
                  campo="goles"
                  sufijo="goles"
                  color="#4ADE80"
                />
              </div>

              <div
                className="rounded-xl p-4 flex flex-wrap items-center gap-x-6 gap-y-3"
                style={{
                  backgroundColor: P.tarjetaLista,
                  border: "1px solid var(--plantel-borde-lista, #2D3038)",
                }}
              >
                <div>
                  <p className="text-xs" style={{ color: P.secundarioLista }}>
                    Goles
                  </p>
                  <p style={{ color: P.blanco }} className="text-xl font-bold  mt-1">
                    {resumen.goles}
                  </p>
                </div>
                <div className="h-8 w-px" style={{ backgroundColor: P.separador }} />
                <div>
                  <p className="text-xs" style={{ color: P.secundarioLista }}>
                    Minutos acumulados
                  </p>
                  <p style={{ color: P.blanco }} className="text-xl font-bold  mt-1">
                    {resumen.minutos.toLocaleString('es-AR')}
                  </p>
                </div>
                <div className="h-8 w-px" style={{ backgroundColor: P.separador }} />
                <div>
                  <p className="text-xs" style={{ color: P.secundarioLista }}>
                    Titularidades
                  </p>
                  <p style={{ color: P.blanco }} className="text-xl font-bold  mt-1">
                    {resumen.titularidades}
                  </p>
                </div>
              </div>
            </section>


                  <p className="plantel-grupo-aviso">Comparativas y evolución ampliadas se incorporarán en una próxima etapa. Los indicadores y rankings mostrados corresponden a los registros actuales.</p>
                </div>) },
              ]} />

            {/* Cancha táctica al final */}
            <CanchaTactica
              jugadoras={jugadores}
              estadisticas={estadisticas}
              formacion={formacion}
              onCambiarFormacion={setFormacion}
              onSelectJugador={onSelectJugador}
            />
          </>
        )}
      </div>
    </div>
  )
}

export default ListaJugadores
