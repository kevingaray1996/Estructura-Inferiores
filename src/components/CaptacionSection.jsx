import EncabezadoSeccion from './ui/EncabezadoSeccion'
import EstadoContenido from './ui/EstadoContenido'
import BarraFiltros from './ui/BarraFiltros'
import FranjaNumeros from './ui/FranjaNumeros'
import Boton from './ui/Boton'
import { textoGestion } from '../appearance/gestion'
import { COLORES } from '../theme'
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import CategoriaFiltro from './CategoriaFiltro'
import { obtenerFechaHoy } from '../utils/fecha'
import { fechaCorta } from '../utils/formatoFecha'
import { mensajeError } from '../utils/mensajesError'

const ESTADO_CONFIG = {
  en_prueba: { label: 'En prueba', color: COLORES.acento, icono: '🕓' },
  aceptado: { label: 'Aceptado', color: COLORES.exito, icono: '✅' },
  rechazado: { label: 'Rechazado', color: COLORES.peligro, icono: '✖️' },
}

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function CaptacionSection({ perfil }) {
  const esTecnico = perfil?.rol === 'tecnico'
  const [candidatos, setCandidatos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [categoriaId, setCategoriaId] = useState(esTecnico ? perfil.categoria_id : '')
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [candidatoEditando, setCandidatoEditando] = useState(null)
  const [convirtiendoId, setConvirtiendoId] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [posicion, setPosicion] = useState('')
  const [categoriaProbadaId, setCategoriaProbadaId] = useState(esTecnico ? perfil.categoria_id : '')
  const [fechaPrueba, setFechaPrueba] = useState(obtenerFechaHoy())
  const [contactoNombre, setContactoNombre] = useState('')
  const [telefonoContacto, setTelefonoContacto] = useState('')
  const [notas, setNotas] = useState('')
  const [estado, setEstado] = useState('en_prueba')
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    setCargando(true)
    const { data, error } = await supabase
      .from('candidatos')
      .select('*, categorias(nombre)')
      .order('fecha_prueba', { ascending: false })
    setErrorCarga(error || null)
    setCandidatos(data || [])
    setCargando(false)
  }

  useEffect(() => {
    async function ejecutar() {
      cargar()
      const { data } = await supabase.from('categorias').select('*').order('orden')
      setCategorias(data || [])
    }
    ejecutar()
  }, [])

  function abrirNuevo() {
    setCandidatoEditando(null)
    setNombre('')
    setApellido('')
    setFechaNacimiento('')
    setPosicion('')
    setCategoriaProbadaId(esTecnico ? perfil.categoria_id : '')
    setFechaPrueba(obtenerFechaHoy())
    setContactoNombre('')
    setTelefonoContacto('')
    setNotas('')
    setEstado('en_prueba')
    setErrorMsg('')
    setMostrarForm(true)
  }

  function abrirEditar(c) {
    setCandidatoEditando(c)
    setNombre(c.nombre || '')
    setApellido(c.apellido || '')
    setFechaNacimiento(c.fecha_nacimiento || '')
    setPosicion(c.posicion || '')
    setCategoriaProbadaId(c.categoria_probada_id || '')
    setFechaPrueba(c.fecha_prueba || '')
    setContactoNombre(c.contacto_nombre || '')
    setTelefonoContacto(c.telefono_contacto || '')
    setNotas(c.notas || '')
    setEstado(c.estado || 'en_prueba')
    setErrorMsg('')
    setMostrarForm(true)
  }

  function cancelarForm() {
    setMostrarForm(false)
    setCandidatoEditando(null)
  }

  async function crearJugadorDesdeCandidato(c) {
    const { data: nuevoJugador, error: errorInsert } = await supabase
      .from('jugadores')
      .insert({
        nombre: c.nombre,
        apellido: c.apellido,
        fecha_nacimiento: c.fecha_nacimiento || null,
        posicion: c.posicion || null,
        categoria_id: c.categoria_probada_id,
        estado: 'disponible',
      })
      .select()
      .single()

    if (errorInsert) {
      alert(mensajeError(errorInsert, 'dar de alta a la jugadora'))
      return null
    }

    await supabase
      .from('candidatos')
      .update({ estado: 'aceptado', jugador_id: nuevoJugador.id })
      .eq('id', c.id)

    return nuevoJugador
  }

  async function handleGuardar() {
    if (!nombre || !apellido || !categoriaProbadaId) {
      setErrorMsg('Completá nombre, apellido y categoría probada.')
      return
    }
    setGuardando(true)
    setErrorMsg('')

    const datos = {
      nombre,
      apellido,
      fecha_nacimiento: fechaNacimiento || null,
      posicion: posicion || null,
      categoria_probada_id: categoriaProbadaId,
      fecha_prueba: fechaPrueba || null,
      contacto_nombre: contactoNombre || null,
      telefono_contacto: telefonoContacto || null,
      notas: notas || null,
      estado,
    }

    let candidatoGuardado
    if (candidatoEditando) {
      const { error } = await supabase.from('candidatos').update(datos).eq('id', candidatoEditando.id)
      if (error) {
        setGuardando(false)
        setErrorMsg(mensajeError(error, 'guardar la candidata'))
        return
      }
      candidatoGuardado = { ...candidatoEditando, ...datos }
    } else {
      const { data, error } = await supabase.from('candidatos').insert(datos).select().single()
      if (error) {
        setGuardando(false)
        setErrorMsg(mensajeError(error, 'guardar la candidata'))
        return
      }
      candidatoGuardado = data
    }

    // Si quedó "aceptado" y todavía no tiene un jugador vinculado, lo pasamos
    // directo al plantel de la categoría probada.
    if (candidatoGuardado.estado === 'aceptado' && !candidatoGuardado.jugador_id) {
      await crearJugadorDesdeCandidato(candidatoGuardado)
    }

    setGuardando(false)
    setMostrarForm(false)
    setCandidatoEditando(null)
    cargar()
  }

  async function handleEliminar(candidatoId) {
    const c = candidatos.find((x) => x.id === candidatoId)
    const confirmar = window.confirm(`¿Eliminar a ${c ? `${c.apellido}, ${c.nombre}` : 'esta candidata'} de Captación? No se puede deshacer.`)
    if (!confirmar) return
    await supabase.from('candidatos').delete().eq('id', candidatoId)
    cargar()
  }

  async function handleConvertir(c) {
    const confirmar = window.confirm(`¿Dar de alta a ${c.apellido}, ${c.nombre} como jugador del plantel?`)
    if (!confirmar) return
    setConvirtiendoId(c.id)
    await crearJugadorDesdeCandidato(c)
    setConvirtiendoId(null)
    cargar()
  }

  const filtrados = candidatos.filter((c) => {
    const coincideCategoria = !categoriaId || c.categoria_probada_id === categoriaId
    const nombreCompleto = `${c.nombre} ${c.apellido}`.toLowerCase()
    const coincideBusqueda = !busqueda || nombreCompleto.includes(busqueda.toLowerCase())
    return coincideCategoria && coincideBusqueda
  })

  const grupos = ['en_prueba', 'aceptado', 'rechazado'].map((clave) => ({
    clave,
    config: ESTADO_CONFIG[clave],
    lista: filtrados.filter((c) => c.estado === clave),
  }))

  const inputStyle = {
    backgroundColor: COLORES.fondoTarjeta,
    border: `1px solid ${COLORES.borde}`,
    color: COLORES.texto,
  }

  return (
    <div className="dp-gestion" data-modulo="captacion">
      <div className="dp-gestion-contenido">
        <EncabezadoSeccion eyebrow="Gestión" eyebrowResaltado="Desarrollo de talento" titulo="Capta" resaltado="ción" acciones={<Boton variante={mostrarForm ? 'secundario' : 'principal'} onClick={mostrarForm ? cancelarForm : abrirNuevo} aria-expanded={mostrarForm} aria-controls="captacion-editor">{mostrarForm ? 'Cancelar' : '+ Nuevo candidato'}</Boton>} />

        {mostrarForm && (
          <div id="captacion-editor" role="region" aria-labelledby="captacion-editor-titulo"
            className="dp-panel dp-editor" style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: `3px solid ${COLORES.acento}`, borderLeft: `1px solid ${COLORES.borde}`, borderRight: `1px solid ${COLORES.borde}`, borderBottom: `1px solid ${COLORES.borde}` }}>
            <div className="dp-panel-cabecera"><div><p className="dp-antetitulo">Registro de prueba</p><h2 id="captacion-editor-titulo">{candidatoEditando ? 'Editar candidato' : 'Nuevo candidato'}</h2><p>Identidad, contacto y seguimiento deportivo.</p></div><span className="dp-insignia">{candidatoEditando ? 'Edición' : 'Alta'}</span></div>
            <fieldset className="dp-grupo-campos"><legend>01 · Identidad deportiva</legend>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="dp-campo"><span>Nombre</span><input
                type="text"
                placeholder="Nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                style={inputStyle}
              /></label>
              <label className="dp-campo"><span>Apellido</span><input
                type="text"
                placeholder="Apellido"
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                style={inputStyle}
              /></label>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="captacion-fechaNacimiento" className="text-[10px] uppercase" style={{ color: COLORES.textoMuted }}>Fecha de nacimiento</label>
                <input
                  type="date"
                  id="captacion-fechaNacimiento" value={fechaNacimiento}
                  onChange={(e) => setFechaNacimiento(e.target.value)}
                  className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                  style={inputStyle}
                />
              </div>
              <label className="dp-campo"><span>Posición</span><input
                type="text"
                placeholder="Posición"
                value={posicion}
                onChange={(e) => setPosicion(e.target.value)}
                className="w-full p-2.5 rounded-xl ui-control outline-none text-sm self-end"
                style={inputStyle}
              /></label>
            </div>
            </fieldset><fieldset className="dp-grupo-campos"><legend>02 · Datos de la prueba</legend>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="captacion-categoriaProbadaId" className="text-[10px] uppercase" style={{ color: COLORES.textoMuted }}>Categoría probada</label>
                {esTecnico ? (
                  <p className="p-2.5 rounded-xl text-sm" style={{ ...inputStyle, color: COLORES.textoSecundario }}>
                    {perfil?.categorias?.nombre || 'Tu categoría'}
                  </p>
                ) : (
                  <select
                    id="captacion-categoriaProbadaId" value={categoriaProbadaId}
                    onChange={(e) => setCategoriaProbadaId(e.target.value)}
                    className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                    style={inputStyle}
                  >
                    <option value="">Seleccionar...</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label htmlFor="captacion-fechaPrueba" className="text-[10px] uppercase" style={{ color: COLORES.textoMuted }}>Fecha de la prueba</label>
                <input
                  type="date"
                  id="captacion-fechaPrueba" value={fechaPrueba}
                  onChange={(e) => setFechaPrueba(e.target.value)}
                  className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                  style={inputStyle}
                />
              </div>
            </div>
            </fieldset><fieldset className="dp-grupo-campos"><legend>03 · Contacto y observaciones</legend>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="dp-campo"><span>Contacto (madre, padre o tutor)</span><input
                type="text"
                placeholder="Contacto (madre, padre, tutor)"
                value={contactoNombre}
                onChange={(e) => setContactoNombre(e.target.value)}
                className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                style={inputStyle}
              /></label>
              <label className="dp-campo"><span>Teléfono de contacto</span><input
                type="tel"
                placeholder="Teléfono de contacto"
                value={telefonoContacto}
                onChange={(e) => setTelefonoContacto(e.target.value)}
                className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                style={inputStyle}
              /></label>
            </div>
            <label className="dp-campo"><span>Notas de la evaluación</span><textarea
              placeholder="Notas de la evaluación (técnica, físico, actitud, etc.)"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              className="w-full p-2.5 rounded-xl ui-control outline-none text-sm resize-none"
              style={inputStyle}
            /></label>
            </fieldset><fieldset className="dp-grupo-campos"><legend>04 · Resultado y seguimiento</legend>
            <div>
              <label htmlFor="captacion-estado" className="text-[10px] uppercase" style={{ color: COLORES.textoMuted }}>Estado</label>
              <select
                id="captacion-estado" value={estado}
                onChange={(e) => setEstado(e.target.value)}
                className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                style={inputStyle}
              >
                <option value="en_prueba">En prueba</option>
                <option value="aceptado">Aceptado</option>
                <option value="rechazado">Rechazado</option>
              </select>
              {estado === 'aceptado' && !candidatoEditando?.jugador_id && (
                <p className="text-xs mt-1.5" style={{ color: COLORES.exito }}>
                  Al guardar como "Aceptado" se crea automáticamente en el plantel de la categoría probada.
                </p>
              )}
            </div>

            </fieldset>
            {errorMsg && <EstadoContenido estado="error" titulo="Revisá el registro" mensaje={errorMsg} />}

            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="w-full p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
              data-primario=""
            >
              {guardando ? 'Guardando...' : candidatoEditando ? 'Guardar cambios' : 'Guardar candidato'}
            </button>
          </div>
        )}

        <BarraFiltros etiqueta="Filtros de captación"><div className="dp-filtro-existente"><p className="dp-etiqueta-filtro">Categoría y búsqueda de candidatos</p><CategoriaFiltro
          categoriaId={categoriaId}
          onCategoriaChange={setCategoriaId}
          busqueda={busqueda}
          onBusquedaChange={setBusqueda}
          bloqueada={esTecnico}
          categoriaNombre={perfil?.categorias?.nombre}
        /></div></BarraFiltros>
        <FranjaNumeros etiqueta="Candidatos según los filtros actuales" items={[{ etiqueta: 'Candidatos', valor: cargando || errorCarga ? null : filtrados.length }, ...grupos.map(grupo => ({ etiqueta: grupo.config.label, valor: cargando || errorCarga ? null : grupo.lista.length }))]} />

        {cargando && <EstadoContenido estado="cargando" titulo="Cargando candidatos" />}
        {!cargando && errorCarga && <EstadoContenido estado={errorCarga.code === '42501' ? 'denegado' : 'error'} titulo="No se pudo consultar la información" mensaje="No equivale a una lista vacía. Podés reintentar la consulta." onReintentar={cargar} />}

        {!cargando && !errorCarga &&
          grupos.map(
            (grupo) =>
              grupo.lista.length > 0 && (
                <div key={grupo.clave} className="dp-seccion-listado">
                  <p className="text-xs uppercase tracking-wide mb-2" style={{ color: textoGestion(grupo.config.color) }}>
                    {grupo.config.label} ({grupo.lista.length})
                  </p>
                  <div className="dp-listado-tarjetas">
                    {grupo.lista.map((c) => (
                      <div
                        key={c.id}
                        className="dp-registro dp-candidato"
                        style={{ backgroundColor: COLORES.fondoTarjeta, border: `1px solid ${grupo.config.color}` }}
                      >
                        <div className="dp-registro-cabecera">
                          <span
                            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario, fontFamily: 'var(--fuente-titulo)', fontStyle: 'italic', fontWeight: 900, textTransform: 'uppercase' }}
                          >
                            {iniciales(c.nombre, c.apellido)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="dp-nombre-registro" style={{ color: COLORES.texto }}>
                              {c.apellido}, {c.nombre}
                            </p>
                            <p className="text-xs" style={{ color: COLORES.textoSecundario }}>
                              {c.categorias?.nombre}
                              {c.posicion ? ` · ${c.posicion}` : ''}
                              {c.fecha_prueba ? ` · ${fechaCorta(c.fecha_prueba)}` : ''}
                            </p>
                          </div>
                          <div className="dp-acciones-registro">
                            {c.estado === 'aceptado' && !c.jugador_id && (
                              <button
                                onClick={() => handleConvertir(c)}
                                disabled={convirtiendoId === c.id}
                                className="text-xs px-2.5 py-1 rounded-full hover:opacity-80 disabled:opacity-50"
                                data-primario=""
                              >
                                {convirtiendoId === c.id ? 'Creando...' : '➕ Pasar a plantel'}
                              </button>
                            )}
                            {c.jugador_id && (
                              <span className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.exito }}>
                                Ya está en el plantel
                              </span>
                            )}
                            <button
                              aria-label={`Editar candidato ${c.apellido}, ${c.nombre}`} onClick={() => abrirEditar(c)}
                              className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                              style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}
                            >
                              Editar
                            </button>
                            <button
                              aria-label={`Eliminar candidato ${c.apellido}, ${c.nombre}`} onClick={() => handleEliminar(c.id)}
                              className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                              style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.peligro }}
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                        {c.notas && (
                          <p className="dp-nota-registro" style={{ color: COLORES.textoSecundario }}>{c.notas}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
          )}

        {!cargando && !errorCarga && filtrados.length === 0 && <EstadoContenido estado="vacio" titulo="Sin candidatos para estos filtros" mensaje="No hay candidatos cargados para ese filtro. Podés cambiar la categoría o la búsqueda." />}
      </div>
    </div>
  )
}

export default CaptacionSection



