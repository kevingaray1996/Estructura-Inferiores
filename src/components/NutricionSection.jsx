import { COLORES } from '../theme'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import CategoriaFiltro from './CategoriaFiltro'
import { obtenerFechaHoy } from '../utils/fecha'

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function formatearFechaCorta(fecha) {
  if (!fecha) return ''
  const partes = fecha.split('-')
  if (partes.length !== 3) return fecha
  return `${partes[2]}/${partes[1]}`
}

function MiniBarras({ datos, color }) {
  const valores = datos.map((d) => d.valor || 0)
  const min = Math.min(...valores)
  const max = Math.max(...valores, 1)
  const rango = max - min || 1
  const ancho = 30
  const gap = 8
  const alto = 60
  const svgAncho = datos.length * (ancho + gap)

  return (
    <svg viewBox={`0 0 ${svgAncho} ${alto + 28}`} width={svgAncho} height={alto + 28}>
      {datos.map((d, i) => {
        const h = 8 + ((d.valor - min) / rango) * (alto - 8)
        const x = i * (ancho + gap)
        return (
          <g key={i}>
            <rect x={x} y={alto - h} width={ancho} height={h} rx={3} fill={color} opacity={0.85} />
            <text x={x + ancho / 2} y={alto + 12} fontSize="8" fill={COLORES.textoMuted} textAnchor="middle">
              {d.etiqueta}
            </text>
            <text x={x + ancho / 2} y={alto + 23} fontSize="9" fontWeight="600" fill={color} textAnchor="middle">
              {d.valor}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function NutricionSection({ jugadorInicialId, onConsumirJugadorInicial }) {
  const [jugadores, setJugadores] = useState([])
  const [idsConAlerta, setIdsConAlerta] = useState(new Set())
  const [categoriaId, setCategoriaId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState(null)
  const [fichas, setFichas] = useState([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [fichaEditando, setFichaEditando] = useState(null)
  const [fecha, setFecha] = useState('')
  const [peso, setPeso] = useState('')
  const [altura, setAltura] = useState('')
  const [alertaPeso, setAlertaPeso] = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargarFichas = useCallback(async (jugadorId) => {
    const { data } = await supabase
      .from('fichas_nutricion')
      .select('*')
      .eq('jugador_id', jugadorId)
      .order('fecha', { ascending: false })
    setFichas(data || [])

    const tieneAlertaVigente = !!data?.[0]?.alerta_peso
    setIdsConAlerta((prev) => {
      const next = new Set(prev)
      if (tieneAlertaVigente) next.add(jugadorId)
      else next.delete(jugadorId)
      return next
    })
  }, [])

  const abrirJugador = useCallback(
    (j) => {
      setJugadorSeleccionado(j)
      setMostrarForm(false)
      setFichaEditando(null)
      cargarFichas(j.id)
    },
    [cargarFichas]
  )

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('jugadores')
        .select('*, categorias(nombre)')
        .order('apellido')
      setJugadores(data || [])

      const { data: registros } = await supabase
        .from('fichas_nutricion')
        .select('jugador_id, alerta_peso, fecha')
        .order('fecha', { ascending: false })
      const ultimaAlerta = new Set()
      const yaVisto = new Set()
      for (const r of registros || []) {
        if (yaVisto.has(r.jugador_id)) continue
        yaVisto.add(r.jugador_id)
        if (r.alerta_peso) ultimaAlerta.add(r.jugador_id)
      }
      setIdsConAlerta(ultimaAlerta)

      if (jugadorInicialId) {
        const encontrado = data?.find((j) => j.id === jugadorInicialId)
        if (encontrado) abrirJugador(encontrado)
        onConsumirJugadorInicial()
      }
    }
    cargar()
  }, [jugadorInicialId, abrirJugador, onConsumirJugadorInicial])

  function abrirNuevoRegistro() {
    setFichaEditando(null)
    setFecha(obtenerFechaHoy())
    setPeso('')
    setAltura('')
    setAlertaPeso(false)
    setDescripcion('')
    setMostrarForm(true)
  }

  function abrirEditarRegistro(f) {
    setFichaEditando(f)
    setFecha(f.fecha || '')
    setPeso(f.peso ?? '')
    setAltura(f.altura ?? '')
    setAlertaPeso(!!f.alerta_peso)
    setDescripcion(f.descripcion || '')
    setMostrarForm(true)
  }

  function cancelarForm() {
    setMostrarForm(false)
    setFichaEditando(null)
  }

  async function handleGuardar() {
    if (!fecha) return
    setGuardando(true)

    const datos = {
      fecha,
      peso: peso !== '' ? parseFloat(peso) : null,
      altura: altura !== '' ? parseFloat(altura) : null,
      alerta_peso: alertaPeso,
      descripcion,
    }

    if (fichaEditando) {
      await supabase.from('fichas_nutricion').update(datos).eq('id', fichaEditando.id)
    } else {
      await supabase.from('fichas_nutricion').insert({
        jugador_id: jugadorSeleccionado.id,
        ...datos,
      })
    }

    setGuardando(false)
    setMostrarForm(false)
    setFichaEditando(null)
    cargarFichas(jugadorSeleccionado.id)
  }

  async function handleEliminarFicha(fichaId) {
    const confirmar = window.confirm('¿Seguro que querés eliminar este registro nutricional?')
    if (!confirmar) return
    await supabase.from('fichas_nutricion').delete().eq('id', fichaId)
    cargarFichas(jugadorSeleccionado.id)
  }

  const filtrados = jugadores.filter((j) => {
    const coincideCategoria = !categoriaId || j.categoria_id === categoriaId
    const nombreCompleto = `${j.nombre} ${j.apellido}`.toLowerCase()
    const coincideBusqueda = !busqueda || nombreCompleto.includes(busqueda.toLowerCase())
    return coincideCategoria && coincideBusqueda
  })

  const conAlerta = filtrados.filter((j) => idsConAlerta.has(j.id))
  const sinAlerta = filtrados.filter((j) => !idsConAlerta.has(j.id))

  const fichasOrdenadas = [...fichas].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
  const datosPesoChart = fichasOrdenadas
    .filter((f) => f.peso !== null && f.peso !== undefined)
    .slice(-8)
    .map((f) => ({ valor: f.peso, etiqueta: formatearFechaCorta(f.fecha) }))
  const datosAlturaChart = fichasOrdenadas
    .filter((f) => f.altura !== null && f.altura !== undefined)
    .slice(-8)
    .map((f) => ({ valor: f.altura, etiqueta: formatearFechaCorta(f.fecha) }))

  const inputStyle = {
    backgroundColor: COLORES.fondoTarjeta,
    border: '1px solid COLORES.borde',
    color: COLORES.texto,
  }

  if (jugadorSeleccionado) {
    return (
      <div className="p-6 md:p-10">
        <div className="max-w-xl mx-auto">
          <button
            onClick={() => setJugadorSeleccionado(null)}
            className="text-sm mb-6 flex items-center gap-1 hover:opacity-70 transition-opacity"
            style={{ color: COLORES.textoSecundario }}
          >
            ← Volver
          </button>

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <p className="text-3xl">🥗</p>
              <h1
                className="text-2xl"
                style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.texto }}
              >
                {jugadorSeleccionado.apellido}, {jugadorSeleccionado.nombre}
              </h1>
            </div>
            <button
              onClick={mostrarForm ? cancelarForm : abrirNuevoRegistro}
              className="text-sm font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-80 shrink-0"
              style={{ backgroundColor: COLORES.exito, color: COLORES.fondoPagina }}
            >
              {mostrarForm ? 'Cancelar' : '+ Agregar registro'}
            </button>
          </div>

          {mostrarForm && (
            <div className="space-y-3 mb-6 p-4 rounded-xl" style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: '3px solid COLORES.acento', borderLeft: '1px solid COLORES.borde', borderRight: '1px solid COLORES.borde', borderBottom: '1px solid COLORES.borde' }}>
              {fichaEditando && (
                <p className="text-xs" style={{ color: COLORES.textoSecundario }}>
                  Editando registro del {fichaEditando.fecha}
                </p>
              )}
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase" style={{ color: COLORES.textoMuted }}>Peso (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={peso}
                    onChange={(e) => setPeso(e.target.value)}
                    className="w-full p-2.5 rounded-xl outline-none text-sm"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase" style={{ color: COLORES.textoMuted }}>Altura (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={altura}
                    onChange={(e) => setAltura(e.target.value)}
                    className="w-full p-2.5 rounded-xl outline-none text-sm"
                    style={inputStyle}
                  />
                </div>
              </div>
              <textarea
                placeholder="Observaciones (dieta, plan nutricional, etc.)"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={3}
                className="w-full p-2.5 rounded-xl outline-none text-sm resize-none"
                style={inputStyle}
              />
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: COLORES.texto }}>
                <input
                  type="checkbox"
                  checked={alertaPeso}
                  onChange={(e) => setAlertaPeso(e.target.checked)}
                />
                Alerta de peso (fuera de rango esperado)
              </label>
              <button
                onClick={handleGuardar}
                disabled={guardando}
                className="w-full p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: COLORES.exito, color: COLORES.fondoPagina }}
              >
                {guardando ? 'Guardando...' : fichaEditando ? 'Guardar cambios' : 'Guardar registro'}
              </button>
            </div>
          )}

          {(datosPesoChart.length >= 2 || datosAlturaChart.length >= 2) && (
            <div className="p-4 rounded-xl mb-6" style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: '3px solid COLORES.acento', borderLeft: '1px solid COLORES.borde', borderRight: '1px solid COLORES.borde', borderBottom: '1px solid COLORES.borde' }}>
              <p className="text-xs uppercase tracking-wide mb-3" style={{ color: COLORES.textoMuted }}>
                📈 Evolución
              </p>
              <div className="flex flex-wrap gap-6">
                {datosPesoChart.length >= 2 && (
                  <div>
                    <p className="text-[10px] uppercase mb-1.5" style={{ color: '#7DD3FC' }}>Peso (kg)</p>
                    <MiniBarras datos={datosPesoChart} color="#7DD3FC" />
                  </div>
                )}
                {datosAlturaChart.length >= 2 && (
                  <div>
                    <p className="text-[10px] uppercase mb-1.5" style={{ color: COLORES.exito }}>Altura (cm)</p>
                    <MiniBarras datos={datosAlturaChart} color={COLORES.exito} />
                  </div>
                )}
              </div>
            </div>
          )}

          <p className="text-xs uppercase tracking-wide mb-3" style={{ color: COLORES.textoMuted }}>
            Historial nutricional
          </p>

          <div className="space-y-2">
            {fichas.map((f) => (
              <div key={f.id} className="p-3.5 rounded-xl" style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: '3px solid COLORES.acento', borderLeft: '1px solid COLORES.borde', borderRight: '1px solid COLORES.borde', borderBottom: '1px solid COLORES.borde' }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-mono" style={{ color: COLORES.textoSecundario }}>{f.fecha}</p>
                  <div className="flex items-center gap-2">
                    {(f.peso || f.altura) && (
                      <span
                        className="text-xs font-mono px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}
                      >
                        {f.peso ? `${f.peso}kg` : ''}{f.peso && f.altura ? ' · ' : ''}{f.altura ? `${f.altura}cm` : ''}
                      </span>
                    )}
                    {f.alerta_peso && (
                      <span
                        className="text-xs font-mono px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.peligro }}
                      >
                        ⚠ Alerta
                      </span>
                    )}
                    <button
                      onClick={() => abrirEditarRegistro(f)}
                      className="text-xs px-2 py-0.5 rounded-full hover:opacity-80"
                      style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleEliminarFicha(f.id)}
                      className="text-xs px-2 py-0.5 rounded-full hover:opacity-80"
                      style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.peligro }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
                {f.descripcion && (
                  <p className="text-sm" style={{ color: COLORES.texto }}>{f.descripcion}</p>
                )}
              </div>
            ))}
            {fichas.length === 0 && (
              <p className="text-sm" style={{ color: COLORES.textoMuted }}>Sin registros nutricionales todavía.</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-2xl mx-auto">
        <h1
          className="text-3xl md:text-4xl mb-6 flex items-center gap-3"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.texto }}
        >
          <span>🥗</span> Nutrición
        </h1>

        <CategoriaFiltro
          categoriaId={categoriaId}
          onCategoriaChange={setCategoriaId}
          busqueda={busqueda}
          onBusquedaChange={setBusqueda}
        />

        {[
          { titulo: 'Alerta de peso', icono: '🔴', color: COLORES.peligro, lista: conAlerta },
          { titulo: null, icono: null, color: COLORES.borde, lista: sinAlerta },
        ].map(
          (grupo) =>
            grupo.lista.length > 0 && (
              <div key={grupo.titulo || 'resto'} className="mb-6">
                {grupo.titulo && (
                  <p className="text-xs uppercase tracking-wide mb-2" style={{ color: grupo.color }}>
                    {grupo.icono} {grupo.titulo} ({grupo.lista.length})
                  </p>
                )}
                <div className="space-y-2">
                  {grupo.lista.map((j) => (
                    <div
                      key={j.id}
                      onClick={() => abrirJugador(j)}
                      className="flex items-center gap-3 p-3.5 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
                      style={{ backgroundColor: COLORES.fondoTarjeta, border: `1px solid ${grupo.color}` }}
                    >
                      {j.foto_url ? (
                        <img
                          src={j.foto_url}
                          alt={`${j.apellido}, ${j.nombre}`}
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                          style={{ border: `2px solid ${grupo.color}` }}
                        />
                      ) : (
                        <div
                          className="flex items-center justify-center w-9 h-9 rounded-full shrink-0 text-xs font-bold"
                          style={{ backgroundColor: COLORES.fondoPagina, border: `2px solid ${grupo.color}`, color: grupo.titulo ? grupo.color : COLORES.textoSecundario, fontFamily: "'Archivo Black', sans-serif" }}
                        >
                          {iniciales(j.nombre, j.apellido)}
                        </div>
                      )}
                      <p className="flex-1 text-sm" style={{ color: COLORES.texto }}>
                        {j.apellido}, {j.nombre}
                      </p>
                      <span className="text-xs font-mono px-2 py-1 rounded-full shrink-0" style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}>
                        {j.categorias?.nombre}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
        )}

        {filtrados.length === 0 && (
          <p className="text-sm" style={{ color: COLORES.textoMuted }}>No se encontraron jugadores con ese filtro.</p>
        )}
      </div>
    </div>
  )
}

export default NutricionSection


