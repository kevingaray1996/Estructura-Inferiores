import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { obtenerCategoriaPrimeraDivision } from '../../utils/categoriaPrimera'
import { obtenerJugadoresDeCategoria } from '../../utils/jugadoresCategoria'
import { fechaArgentina, fechaValida } from '../../utils/planificacion'
import { mensajeErrorWellness, puedeConsultarWellnessInicio, resumirWellnessInicio } from '../../utils/inicioWellness'

function Foto({ jugadora }) {
  const [fallo, setFallo] = useState(false)
  return jugadora.foto_url && !fallo
    ? <img className="inicio-wellness-foto" src={jugadora.foto_url} alt="" loading="lazy" onError={() => setFallo(true)} />
    : <span className="inicio-avatar" aria-hidden="true">{jugadora.nombre?.[0]}{jugadora.apellido?.[0]}</span>
}

export default function WellnessInicio({ perfil, onCambiarSeccion, onVerBienestar }) {
  const [fecha, setFecha] = useState(fechaArgentina)
  const [lectura, setLectura] = useState(null)
  const [intento, setIntento] = useState(0)
  const pendiente = useRef(false)
  const { rol, categoria_id } = perfil
  const clave = [perfil.id, perfil.rol, perfil.categoria_id, fecha, intento].join(':')
  const candidato = ['coordinacion', 'preparador_fisico', 'tecnico'].includes(perfil.rol)
  useEffect(() => {
    let activo = true
    pendiente.current = true
    async function cargar() {
      if (!candidato || !fechaValida(fecha)) return
      try {
        const primera = await obtenerCategoriaPrimeraDivision({ exigirLectura: true })
        if (!activo) return
        if (!primera || !puedeConsultarWellnessInicio({ rol, categoria_id }, primera.id)) {
          setLectura({ clave, estado: primera ? 'restringido' : 'sin_categoria' }); return
        }
        const categorias = await supabase.from('categorias').select('id, es_reserva')
        if (categorias.error) throw categorias.error
        const jugadoras = await obtenerJugadoresDeCategoria(supabase, primera.id, categorias.data, { select: 'id,nombre,apellido,foto_url' })
        if (jugadoras.error) throw jugadoras.error
        if (!activo) return
        const ids = (jugadoras.data || []).map(j => j.id)
        const respuesta = ids.length ? await supabase.from('bienestar')
          .select('jugador_id,sueno,dolor_muscular,fatiga,estres,animo_entrenar').eq('fecha', fecha).in('jugador_id', ids) : { data: [] }
        if (respuesta.error) throw respuesta.error
        const resumen = resumirWellnessInicio(jugadoras.data || [], respuesta.data || [])
        if (activo) setLectura({ clave, estado: 'ok', resumen })
      } catch (error) { if (activo) setLectura({ clave, estado: 'error', error: mensajeErrorWellness(error) }) }
      finally { if (activo) pendiente.current = false }
    }
    cargar()
    return () => { activo = false }
  }, [clave, candidato, fecha, rol, categoria_id])
  const vigente = lectura?.clave === clave
  const cargando = candidato && fechaValida(fecha) && !vigente
  const resumen = vigente && lectura.estado === 'ok' ? lectura.resumen : null
  const abrir = () => onCambiarSeccion(perfil.rol === 'medico' ? 'bienestar' : 'fisico')
  return <section className="inicio-bloque inicio-wellness" aria-labelledby="inicio-wellness-titulo">
    <div className="inicio-titulo"><div><p className="inicio-antetitulo">SEGUIMIENTO DIARIO</p><h2 id="inicio-wellness-titulo">Wellness del plantel</h2></div>
      {(candidato || perfil.rol === 'medico') && <button type="button" onClick={abrir}>{perfil.rol === 'medico' ? 'Consultar Bienestar' : 'Abrir Físico / Wellness'} →</button>}</div>
    {candidato && <div className="inicio-wellness-controles"><label>Fecha de respuestas<input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></label>
      <button type="button" disabled={cargando || !fechaValida(fecha)} onClick={() => { if (!pendiente.current) setIntento(n => n + 1) }}>Actualizar Wellness</button></div>}
    {!candidato && <p className="inicio-vacio">Consultá Bienestar desde tu acceso habitual. Este resumen no muestra respuestas individuales para tu rol.</p>}
    {candidato && !fechaValida(fecha) && <p role="alert">Seleccioná una fecha válida.</p>}
    {cargando && <p role="status">Consultando respuestas y elegibilidad…</p>}
    {vigente && lectura.estado === 'error' && <p role="alert">{lectura.error}</p>}
    {vigente && lectura.estado === 'restringido' && <p>El resumen diario de Primera no está habilitado para tu categoría. Usá tu acceso habitual a Físico.</p>}
    {vigente && lectura.estado === 'sin_categoria' && <p>No hay una categoría Primera accesible para preparar el resumen.</p>}
    {resumen && <>
      <div className="inicio-wellness-indicadores">{[['Respondieron', resumen.respondieron], ['Alertas reales', resumen.alertas.length], ['Pendientes', resumen.pendientes.length], ['Elegibles accesibles', resumen.total]]
        .map(([etiqueta, valor]) => <div key={etiqueta}><span>{etiqueta}</span><strong>{valor}</strong></div>)}</div>
      <p className="inicio-secundario">Primera · Jugadoras accesibles según las reglas actuales, sin excluir lesionadas. Una respuesta parcial no equivale a una evaluación completa.</p>
      {resumen.total === 0 ? <p className="inicio-vacio">Sin jugadoras elegibles accesibles. No se puede inferir el total del plantel fuera de tus permisos.</p>
        : resumen.respondieron === 0 ? <p className="inicio-vacio">Sin respuestas disponibles para esta fecha. No significa bienestar normal.</p>
          : resumen.alertas.length === 0 && <p className="inicio-vacio">Sin alertas registradas entre las respuestas disponibles.</p>}
      {resumen.incompletas > 0 && <p>{resumen.incompletas} respuestas incompletas; revisá los campos faltantes en Wellness.</p>}
      {resumen.estresAlto >= 10 && <p role="status">{resumen.estresAlto} jugadoras con estrés alto hoy — conviene revisar el bienestar grupal</p>}
      <div className="inicio-seguimiento">{resumen.alertas.map(({ jugadora, nivel, motivo }) => <article key={jugadora.id} className="inicio-seguimiento-fila" data-nivel={nivel}>
        <Foto jugadora={jugadora} /><div><strong>{jugadora.apellido}, {jugadora.nombre}</strong><p>{motivo}</p></div>
        <span className="inicio-nivel">{nivel === 'alta' ? 'Alerta alta' : 'Seguimiento'}</span><button type="button" onClick={() => onVerBienestar ? onVerBienestar(jugadora.id) : abrir()} aria-label={`Consultar Wellness de ${jugadora.apellido}, ${jugadora.nombre}`}>Ver Wellness →</button>
      </article>)}</div>
      {resumen.pendientes.length > 0 && <details className="inicio-pendientes"><summary>Respuestas pendientes ({resumen.pendientes.length})</summary><p>No son alertas médicas.</p>
        <ul>{resumen.pendientes.map(j => <li key={j.id}>{j.apellido}, {j.nombre}</li>)}</ul></details>}
    </>}
  </section>
}
