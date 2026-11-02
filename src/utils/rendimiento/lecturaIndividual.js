import { leerPaginas, leerPorIds } from './lecturas.js'
import { construirContratoIndividual } from './contratoIndividual.js'
import { fechaValida } from '../planificacion.js'

const CAMPOS_JUGADORAS='id,nombre,apellido,posicion,foto_url,categoria_id,tambien_reserva'
const CAMPOS_EVENTOS='id,partido_id,jugador_id,tipo,resultado,segundo,periodo,coordenada_x,coordenada_y,zona,sistema_coordenadas,direccion_captura,periodo_captura'
const CAMPOS_ANALISIS='id,partido_calendario_id,categoria_id,fecha,rival,video_url'
const CAMPOS_STATS='id,jugador_id,partido_id,minutos_jugados,titular,goles,asistencias,tarjetas_amarillas,tarjetas_rojas'
const CAMPOS_PARTIDOS='id,categoria_id,fecha,rival'
export const errorLecturaIndividual = e => ({estado:['42501','PGRST301','PGRST302'].includes(e?.code) || [401,403].includes(e?.status) ? 'denegado' : 'error',mensaje:'No se pudo completar la lectura. No se interpreta como ausencia de registros.'})
const unicos = filas => [...new Map(filas.map(f=>[f.id,f])).values()]
/** Solo SELECT con sesión ordinaria. El selector se limita a filas visibles de jugadores.
 * No utiliza las RPC nuevas ni fabrica evidencia de políticas certificadas.
 */
export async function leerRendimientoIndividual(cliente,{principalId,segundaId='',usuarioId,vigente=()=>true}) {
  const comprobar=()=>{if(!vigente()) throw Object.assign(new Error('Lectura sustituida.'),{name:'AbortError'})}
  const clienteVigente={from:tabla=>{comprobar();return cliente.from(tabla)}}
  const autenticar=async()=>{comprobar();const {data,error}=await cliente.auth.getUser();if(error)throw error;if(!data?.user?.id || data.user.id!==usuarioId)throw Object.assign(new Error('Sesión diferente o cerrada.'),{status:401});return data.user}
  const usuario=await autenticar()
  const {data:perfil,error:falloPerfil}=await cliente.from('perfiles').select('email,rol,categoria_id').eq('email',usuario.email).maybeSingle()
  if(falloPerfil)throw falloPerfil
  if(!perfil)return {estado:'no_disponible',mensaje:'No hay un perfil visible para confirmar el contexto de esta sesión.',jugadoras:[],fuentes:{}}
  // RLS decide qué jugadoras existen para la sesión, incluida la excepción de Reserva.
  const jugadoras=await leerPaginas(()=>clienteVigente.from('jugadores').select(CAMPOS_JUGADORAS))
  comprobar()
  const solicitados=[...new Set([principalId,segundaId].filter(Boolean))]
  const ids=solicitados.filter(id=>jugadoras.some(j=>j.id===id))
  if(!principalId || !ids.includes(principalId))return {estado:'no_disponible',mensaje:'Una jugadora seleccionada ya no figura entre los perfiles accesibles. Una consulta vacía no acredita una denegación.',jugadoras,fuentes:{}}
  const resultado={estado:'disponible',usuarioId:usuario.id,perfil,jugadoras,seleccion:ids,partidos:null,analisis:null,eventos:null,estadisticas:null,fuentes:{}}
  async function fuente(nombre,leer){try{resultado[nombre]=await leer();resultado.fuentes[nombre]={estado:'disponible'}}catch(e){if(e.name==='AbortError')throw e;resultado.fuentes[nombre]=errorLecturaIndividual(e);resultado[nombre]=null}}
  await Promise.all([
    fuente('eventos',()=>leerPaginas(()=>clienteVigente.from('analisis_eventos').select(CAMPOS_EVENTOS).in('jugador_id',ids))),
    fuente('estadisticas',()=>leerPaginas(()=>clienteVigente.from('estadisticas_jugador').select(CAMPOS_STATS).in('jugador_id',ids))),
  ])
  // Defensa adicional del contrato frente a una respuesta malformada: nunca agregamos otra jugadora.
  if(resultado.eventos)resultado.eventos=resultado.eventos.filter(e=>ids.includes(e.jugador_id))
  if(resultado.estadisticas)resultado.estadisticas=resultado.estadisticas.filter(e=>ids.includes(e.jugador_id))
  await fuente('analisis',async()=>{
    // Solo encuentros referenciados por registros de las seleccionadas, nunca toda la categoría.
    const idsEventos=(resultado.eventos || []).map(e=>e.partido_id).filter(Boolean)
    const idsDeportivos=(resultado.estadisticas || []).map(e=>e.partido_id).filter(Boolean)
    const porEventos=await leerPorIds(clienteVigente,'analisis_partidos',CAMPOS_ANALISIS,'id',idsEventos)
    const porParticipacion=await leerPorIds(clienteVigente,'analisis_partidos',CAMPOS_ANALISIS,'partido_calendario_id',idsDeportivos)
    return unicos([...porEventos,...porParticipacion])
  })
  const partidosIds=[...(resultado.estadisticas || []).map(s=>s.partido_id),...(resultado.analisis || []).map(a=>a.partido_calendario_id)].filter(Boolean)
  await fuente('partidos',()=>leerPorIds(clienteVigente,'partidos',CAMPOS_PARTIDOS,'id',partidosIds))
  await autenticar();comprobar()
  const actual=await cliente.from('perfiles').select('email,rol,categoria_id').eq('email',usuario.email).maybeSingle()
  if(actual.error)throw actual.error
  if(!actual.data || ['email','rol','categoria_id'].some(k=>actual.data[k]!==perfil[k]))throw Object.assign(new Error('El contexto de permisos cambió durante la lectura. Volvé a actualizar.'),{status:403})
  const visibles=await leerPorIds(clienteVigente,'jugadores','id','id',ids)
  if(ids.some(id=>!visibles.some(j=>j.id===id)))throw Object.assign(new Error('Cambió el acceso a las jugadoras durante la lectura.'),{status:403})
  comprobar()
  const fallidas=['eventos','analisis','partidos'].map(k=>resultado.fuentes[k]).filter(f=>f.estado!=='disponible')
  if(fallidas.length)resultado.estado=fallidas.some(f=>f.estado==='denegado')?'denegado':'error'
  else if(resultado.fuentes.estadisticas.estado!=='disponible')resultado.estado='parcial'
  return resultado
}

export function presentarLecturaIndividual(datos,anio) {
  if(!datos?.seleccion || !Number.isInteger(Number(anio)))return {...datos,contrato:null,analisis:[]}
  const categoriaIds=[...new Set([...datos.jugadoras.filter(j=>datos.seleccion.includes(j.id)).map(j=>j.categoria_id),...(datos.analisis || []).map(a=>a.categoria_id),...(datos.partidos || []).map(p=>p.categoria_id)].filter(Boolean))]
  const entradas=Object.fromEntries(['partidos','analisis','eventos','estadisticas'].map(k=>[k,{estado:datos.fuentes[k]?.estado || 'no_consultada',filas:datos[k]}]))
  const contrato=construirContratoIndividual({estado:'lectura_rls',anio:Number(anio),jugadoraIds:datos.seleccion,categoriaIds},entradas)
  const analisis=(datos.analisis || []).map(a=>{
    const partido=datos.partidos?.find(p=>p.id===a.partido_calendario_id && p.categoria_id===a.categoria_id && fechaValida(p.fecha))
    return {...a,fecha:partido?.fecha || a.fecha,rival:partido?.rival || a.rival,partido_deportivo:partido || null}
  })
  return {estado:datos.estado==='disponible' && contrato.estado==='parcial'?'parcial':datos.estado,contrato,analisis,fuentes:datos.fuentes,mensaje:datos.mensaje}
}
export function temporadasLecturaIndividual(datos) {
  const fechasAnalisis=(datos?.analisis || []).map(a=>{
    const p=datos.partidos?.find(p=>p.id===a.partido_calendario_id && p.categoria_id===a.categoria_id && fechaValida(p.fecha))
    return p?.fecha || a.fecha
  })
  return [...new Set([...(datos?.partidos || []).map(p=>p.fecha),...fechasAnalisis].filter(fechaValida).map(f=>f.slice(0,4)))].sort().reverse()
}
/** Mismo significado del segundo registrado por Análisis, sin crear offsets.
 * Solo URL directa del análisis exacto: no se infiere video por rival o fecha.
 */
export function enlaceVideoIndividual(evento,analisis) {
  if(!evento || evento.partido_id!==analisis?.id || typeof evento.segundo!=='number' || !Number.isFinite(evento.segundo) || evento.segundo<0)return null
  try{
    const url=new URL(analisis.video_url);if(url.protocol!=='https:')return null
    let id=''
    if(url.hostname==='youtu.be')id=url.pathname.split('/')[1]
    else if(['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(url.hostname))id=url.pathname==='/watch'?url.searchParams.get('v'):['embed','shorts','live'].includes(url.pathname.split('/')[1])?url.pathname.split('/')[2]:''
    return /^[A-Za-z0-9_-]{11}$/.test(id || '')?'https://www.youtube.com/watch?v='+id+'&t='+Math.floor(evento.segundo)+'s':null
  }catch{return null}
}
