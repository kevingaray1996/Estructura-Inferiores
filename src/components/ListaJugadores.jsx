import RendimientoPlantel from './plantel/RendimientoPlantel'
import PestanasAccesibles from './ui/PestanasAccesibles'
import { agruparPlantel } from './plantel/posicionesPlantel'
import BarraFiltros from './ui/BarraFiltros'
import EstadoContenido from './ui/EstadoContenido'
import EncabezadoSeccion from './ui/EncabezadoSeccion'
import FranjaNumeros from './ui/FranjaNumeros'
import Chips from './ui/Chips'
import Boton from './ui/Boton'
import EstadoVacio from './ui/EstadoVacio'
import TarjetaJugadora from './plantel/TarjetaJugadora'
import './plantel/plantel.css'
import { PLANTEL as P, textoPlantel } from '../appearance/plantel'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { generarPlantelPDF } from '../utils/herramientasDiferidas'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'
import { obtenerEstadisticasCategoria } from '../utils/exportarEstadisticas'
import { ultimosDorsales } from '../utils/dorsales'

const filtrosPuesto = [
  { id: 'todas', label: 'Todas' },
  { id: 'arquera', label: 'Arqueras' },
  { id: 'defensa', label: 'Defensoras' },
  { id: 'mediocampo', label: 'Mediocampistas' },
  { id: 'delantera', label: 'Delanteras' },
]

const filtrosEstado = [
  { id: 'disponible', label: 'Disponibles', color: 'var(--ui-exito)' },
  { id: 'lesionado', label: 'Lesionadas', color: 'var(--ui-peligro)' },
  { id: 'no_disponible', label: 'No disponibles', color: 'var(--ui-neutro)' },
]

const normalizar = (valor) =>
  (valor || '').trim().toLocaleLowerCase('es-AR')

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
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

function obtenerDato(jugadora, estadisticas, campo) {
  return Number(estadisticas[String(jugadora.id)]?.[campo] || 0)
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
        border: "1px solid var(--plantel-borde-control)",
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
        border: "1px solid var(--plantel-borde-lista)",
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
        border: "1px solid var(--plantel-borde-lista)",
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

function ListaJugadores({ onSelectJugador: onElegirJugador, onNuevoJugador, onCargaMasiva, estadoGaleria, onGuardarEstadoGaleria }) {
  const [vistaPlantel, setVistaPlantel] = useState(estadoGaleria?.vistaPlantel ?? 'jugadoras')
  const [jugadores, setJugadores] = useState([])
  const [estadisticas, setEstadisticas] = useState({})
  const [dorsales, setDorsales] = useState({})
  const [formacion, setFormacion] = useState('4-4-2')
  const [busqueda, setBusqueda] = useState(estadoGaleria?.busqueda ?? '')
  const [filtroPuesto, setFiltroPuesto] = useState(estadoGaleria?.filtroPuesto ?? 'todas')
  const [filtroEstado, setFiltroEstado] = useState(estadoGaleria?.filtroEstado ?? 'todos')
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [errorEstadisticas, setErrorEstadisticas] = useState('')

  function onSelectJugador(id) {
    onGuardarEstadoGaleria?.({ vistaPlantel, busqueda, filtroPuesto, filtroEstado })
    onElegirJugador(id)
  }

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
        // Último dorsal de cada jugadora según citaciones: una sola consulta, sin demorar el listado.
        ultimosDorsales(supabase, (data || []).map(j => j.id)).then(mapa => { if (activo) setDorsales(mapa) })

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
    >
      <div className="plantel-premium-contenido">
        <EncabezadoSeccion eyebrow="Primera División" eyebrowResaltado="Fútbol femenino" titulo="Plan" resaltado="tel"
          imagenFondo="/images/plantel/plantel-femenino-portada.jpg" posicionImagen="70% 35%"
          acciones={<>
            <Boton variante="secundario" onClick={generarPlantelPDF}>Descargar PDF</Boton>
            <Boton variante="secundario" onClick={onCargaMasiva}>Carga masiva</Boton>
            <Boton onClick={onNuevoJugador}>+ Nueva jugadora</Boton>
          </>} />
        <FranjaNumeros etiqueta="Estado del plantel" items={[
          { etiqueta: 'Jugadoras', valor: cargando || errorCarga ? null : jugadores.length },
          ...filtrosEstado.map(f => ({ etiqueta: f.label, valor: cargando || errorCarga ? null : jugadores.filter(j => coincideEstado(j, f.id)).length })),
        ]} />

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
                  border: "1px solid var(--plantel-aviso-borde)",
                }}
              >
                {errorEstadisticas}
              </div>
            )}

            {/* Buscador y filtros */}
            <section className="plantel-filtros" aria-label="Listado y filtros de jugadoras">
              <BarraFiltros etiqueta="Filtros del plantel">
              <div className="plantel-busqueda">
                <label htmlFor="plantel-busqueda">Buscar jugadora · <b>{jugadorasFiltradas.length} {jugadorasFiltradas.length === 1 ? 'resultado' : 'resultados'}</b></label>
                <input
                  id="plantel-busqueda"
                  type="search"
                  placeholder="Nombre, apellido o posición"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="w-full py-3 px-4 ui-control outline-none text-sm"
                  style={{
                    backgroundColor: P.fondoLista,
                    border: "1px solid var(--plantel-separador)",
                    color: P.textoLista,
                  }}
                />
              </div>
              <div className="plantel-grupo-filtro">
                <Chips etiqueta="Puesto" valor={filtroPuesto} onCambiar={setFiltroPuesto}
                  opciones={filtrosPuesto.map(f => ({ valor: f.id, etiqueta: f.label }))} />
              </div>
              <div className="plantel-grupo-filtro">
                <Chips etiqueta="Estado" valor={filtroEstado} onCambiar={setFiltroEstado}
                  opciones={[{ valor: 'todos', etiqueta: 'Todos' }, ...filtrosEstado.map(f => ({ valor: f.id, etiqueta: f.label }))]} />
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
    <header className="plantel-grupo-titulo"><h2 id={'grupo-' + grupo.id}>{grupo.nombre}</h2><span>{grupo.jugadoras.length}</span></header>
    <div className="plantel-listado club-grilla-foco">{grupo.jugadoras.map(j => <TarjetaJugadora key={j.id} jugadora={j} dorsal={dorsales[j.id]} onAbrir={onSelectJugador} />)}</div>
    {grupo.id === 'sin_equivalencia' && <p className="plantel-grupo-aviso">Posiciones sin equivalencia definida.</p>}
  </section>)}
  {jugadorasFiltradas.length === 0 && <EstadoVacio mensaje="Ninguna jugadora con estos filtros."
    accion={hayFiltrosActivos ? { etiqueta: 'Limpiar filtros', onClick: limpiarFiltros } : { etiqueta: '+ Nueva jugadora', onClick: onNuevoJugador }} />}
</div>) },
                { id: 'rendimiento', etiqueta: 'Rendimiento', contenido: (<RendimientoPlantel activo={vistaPlantel === 'rendimiento'} jugadoras={jugadores} estadisticas={estadisticas}
                  formacion={formacion} onCambiarFormacion={setFormacion} onSelectJugador={onSelectJugador} FotoJugadora={FotoJugadora}>
            {/* Resumen del plantel */}
            <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <TarjetaResumen
                titulo="Jugadoras"
                valor={resumen.total}
                detalle="Según los filtros activos"
                icono="◉"
                color="var(--ui-acento)"
              />
              <TarjetaResumen
                titulo="Disponibles"
                valor={resumen.disponibles}
                detalle="En condiciones de jugar"
                icono="✓"
                color="var(--ui-exito)"
              />
              <TarjetaResumen
                titulo="Lesionadas"
                valor={resumen.lesionadas}
                detalle="Estado registrado"
                icono="＋"
                color="var(--ui-peligro)"
              />
              <TarjetaResumen
                titulo="No disponibles"
                valor={resumen.noDisponibles}
                detalle="Incluye suspendidas"
                icono="—"
                color="var(--ui-neutro)"
              />
            </section>

            {/* Distribución por puesto debajo del listado */}
            <section
              className="rounded-2xl p-4 md:p-5"
              style={{
                backgroundColor: P.tarjetaLista,
                border: "1px solid var(--plantel-borde-lista)",
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
                      border: "1px solid var(--plantel-borde-lista)",
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
                  color="var(--ui-acento)"
                />
                <GraficoRanking
                  titulo="Goleadoras"
                  subtitulo="Top 5 por goles registrados"
                  jugadoras={jugadorasFiltradas}
                  estadisticas={estadisticas}
                  campo="goles"
                  sufijo="goles"
                  color="var(--ui-exito)"
                />
              </div>

              <div
                className="rounded-xl p-4 flex flex-wrap items-center gap-x-6 gap-y-3"
                style={{
                  backgroundColor: P.tarjetaLista,
                  border: "1px solid var(--plantel-borde-lista)",
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
                </RendimientoPlantel>) },
              ]} />

          </>
        )}
      </div>
    </div>
  )
}

export default ListaJugadores
