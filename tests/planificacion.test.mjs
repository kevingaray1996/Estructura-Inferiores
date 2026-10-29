import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CAMPOS_BLOQUE, CAMPOS_EJERCICIO, cargarEntrenamientoHoy, contenidoVisible, copiarSesion, copiarSemana,
  eliminarSesion, fechaArgentina, guardarSesion, inicioSemana, moverElemento, nuevaSesion,
  nuevoBloque, nuevoEjercicio, puedePlanificar, prepararSesion, sumarDias } from '../src/utils/planificacion.js'

const categoria = '10000000-0000-4000-8000-000000000001'
const otra = '10000000-0000-4000-8000-000000000002'
const id = '20000000-0000-4000-8000-000000000001'

test('Calendario usa lunes a domingo y fecha Argentina aunque el dispositivo este en otro huso', () => {
  assert.equal(fechaArgentina(new Date('2026-10-27T01:30:00Z')), '2026-10-26')
  assert.equal(fechaArgentina(new Date('2026-10-27T03:30:00Z')), '2026-10-27')
  assert.equal(inicioSemana('2026-11-01'),'2026-10-26')
  assert.equal(sumarDias('2026-12-31',1),'2027-01-01')
  assert.throws(()=>inicioSemana('2026-02-30'))
})

test('Roles existentes: tecnico y PF solo categoria asignada; coordinacion todas; otros nunca', () => {
  assert.equal(puedePlanificar({rol:'coordinacion'},otra),true)
  for(const rol of ['tecnico','preparador_fisico']){
    assert.equal(puedePlanificar({rol,categoria_id:categoria},categoria),true)
    assert.equal(puedePlanificar({rol,categoria_id:categoria},otra),false)
    assert.equal(puedePlanificar({rol,categoria_id:null},categoria),false)
  }
  assert.equal(puedePlanificar({rol:'medico',categoria_id:categoria},categoria),false)
})

test('Borrador parcial, bloques libres y tareas de biblioteca conservan notas separadas', () => {
  const sesion=nuevaSesion('2026-10-26',categoria)
  assert.deepEqual(prepararSesion(sesion).bloques,[])
  const bloque=nuevoBloque()
  const tarea=nuevoEjercicio({id,contenido:'Gimnasio',descripcion:'Trabajo existente',imagen_url:'https://example.com/i.png'})
  assert.equal(bloque.visible,false)
  assert.equal(tarea.visible,false)
  assert.equal(tarea.biblioteca_id,id)
  assert.equal(tarea.indicaciones,'Trabajo existente')
  bloque.ejercicios=[{...tarea,notas_internas:'Privado',campos_publicos:['indicaciones','notas_internas']}]
  const preparada=prepararSesion({...sesion,bloques:[bloque]})
  assert.equal(preparada.bloques[0].ejercicios[0].notas_internas,'Privado')
  assert.deepEqual(preparada.bloques[0].ejercicios[0].campos_publicos,['indicaciones'])
  assert.deepEqual(CAMPOS_BLOQUE,['objetivo','duracion','indicaciones'])
  assert.ok(!CAMPOS_EJERCICIO.includes('notas_internas'))
  assert.throws(()=>prepararSesion({...sesion,bloques:[{...bloque,duracion:-1}]}))
})

test('Reordenar y copiar no muta originales; copias quedan borrador sin revision ni vinculo real', () => {
  const original={...nuevaSesion('2026-10-26',categoria),id,revision:3,estado:'publicado',entrenamiento_real_id:id,bloques:[nuevoBloque(),nuevoBloque()]}
  const copia=copiarSesion(original,'2026-10-27')
  assert.equal(copia.estado,'borrador')
  assert.equal(copia.id,undefined)
  assert.equal(copia.revision,undefined)
  assert.equal(copia.entrenamiento_real_id,null)
  copia.bloques[0].nombre='Otro'
  assert.equal(original.bloques[0].nombre,'')
  const movidos=moverElemento(original.bloques,0,1)
  assert.equal(movidos[0].id,original.bloques[1].id)
  assert.notEqual(movidos,original.bloques)
})

test('Guardado y eliminacion solo usan las RPC y la revision; conflictos no reintentan', async () => {
  const llamadas=[]
  const cliente={rpc:async(nombre,args)=>{llamadas.push({nombre,args});return {data:{id,revision:1}}},from(){throw Error('Escritura directa prohibida')}}
  const nueva=nuevaSesion('2026-10-26',categoria)
  await guardarSesion(cliente,nueva)
  assert.equal(llamadas[0].nombre,'guardar_planificacion_sesion')
  assert.equal(llamadas[0].args.p_revision,null)
  await guardarSesion(cliente,{...nueva,id,revision:4})
  assert.equal(llamadas[1].args.p_revision,4)
  await eliminarSesion(cliente,{...nueva,id,revision:4})
  assert.equal(llamadas[2].nombre,'eliminar_planificacion_sesion')
  assert.equal(llamadas[2].args.p_revision,4)
  await assert.rejects(guardarSesion(cliente,{...nueva,id}),/revisión/)
  let intentos=0
  const conflicto={rpc:async()=>{intentos++;return {error:{code:'40001',message:'Conflicto'}}}}
  await assert.rejects(guardarSesion(conflicto,{...nueva,id,revision:4}),(e)=>e.code==='40001')
  assert.equal(intentos,1)
  await assert.rejects(guardarSesion({rpc:async()=>({data:null})},nueva),(e)=>e.code==='RESULTADO_INCIERTO')
})

test('Duplicacion semanal usa una RPC atomica; no toca asistencia, Wellness ni cargas', async () => {
  let llamada
  const cliente={rpc:async(nombre,args)=>{llamada={nombre,args};return {data:2}},from(){throw Error('No permitido')}}
  assert.equal(await copiarSemana(cliente,categoria,'2026-10-26','2026-11-02'),2)
  assert.equal(llamada.nombre,'copiar_planificacion_semana')
  await assert.rejects(copiarSemana(cliente,categoria,'2026-10-26','2026-10-26'))
})

test('Publico sin jugadora no consulta; ausencia, fecha o categoria incorrecta no dejan contenido', async () => {
  let llamadas=0
  const cliente={rpc:async()=>{llamadas++;return {data:[]}}}
  assert.deepEqual(await cargarEntrenamientoHoy(cliente,categoria,null),[])
  assert.equal(llamadas,0)
  assert.deepEqual(await cargarEntrenamientoHoy(cliente,categoria,id),[])
  assert.equal(llamadas,1)
  assert.deepEqual(contenidoVisible([{categoria_id:otra,fecha:'2026-10-26',bloques:[{nombre:'No mostrar'}]}],categoria,'2026-10-26'),[])
  assert.deepEqual(contenidoVisible([{categoria_id:categoria,fecha:'2026-10-25',bloques:[{nombre:'No mostrar'}]}],categoria,'2026-10-26'),[])
  assert.deepEqual(contenidoVisible([{categoria_id:categoria,fecha:'2026-10-26',bloques:[{nombre:'  ',ejercicios:[]}]}],categoria,'2026-10-26'),[])
})

test('Render de planificador y Wellness sin tarjetas vacias ni exposicion de notas internas', async () => {
  const {createServer}=await import('vite')
  const {createServer:socketServer}=await import('node:net')
  const {createElement}=await import('react')
  const {renderToStaticMarkup}=await import('react-dom/server')
  const socket=socketServer()
  await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve)})
  const port=socket.address().port
  await new Promise((resolve,reject)=>socket.close(e=>e?reject(e):resolve()))
  const server=await createServer({server:{middlewareMode:true,hmr:{port}},appType:'custom',plugins:[{
    name:'planificacion-sin-backend',enforce:'pre',resolveId(source){if(source.endsWith('/supabaseClient'))return '\0planificacion-mock'},
    load(id){if(id==='\0planificacion-mock')return `export const supabase={from(){throw Error('No acceder al backend')},rpc(){throw Error('No escribir')}};`},
    transform(code,path){
      if(path.replaceAll('\\','/').endsWith('/PlanificacionSection.jsx')){
        const bloque={...nuevoBloque(),nombre:'Gimnasio',ejercicios:[{...nuevoEjercicio(),nombre:'Sentadillas'}]}
        const sesion={...nuevaSesion('2026-10-26',categoria),bloques:[bloque]}
        return code.replace('const [form, setForm] = useState(null)',`const [form, setForm] = useState(${JSON.stringify(sesion)})`)
      }
    },
  }]})
  const render=(C,props)=>renderToStaticMarkup(createElement(C,props))
  try{
    const {ContenidoEntrenamientoHoy,default:Hoy}=await server.ssrLoadModule('/src/components/EntrenamientoDeHoy.jsx')
    assert.equal(render(ContenidoEntrenamientoHoy,{sesiones:[]}), '')
    assert.equal(render(Hoy,{categoriaId:categoria,jugadoraId:id}), '')
    const html=render(ContenidoEntrenamientoHoy,{sesiones:[{id,fecha:'2026-10-26',bloques:[{nombre:'Gimnasio',notas_internas:'SECRETO',ejercicios:[{nombre:'Sentadillas',indicaciones:'Tres series',notas_internas:'SECRETO',link_video:'javascript:alert(1)'}]}]}]})
    assert.match(html,/Tu entrenamiento de hoy/)
    assert.match(html,/Sentadillas/)
    assert.doesNotMatch(html,/SECRETO|javascript:|<input|<button/)
    const {default:Plan}=await server.ssrLoadModule('/src/components/PlanificacionSection.jsx')
    const plan=render(Plan,{perfil:{rol:'coordinacion'}})
    assert.match(plan,/Planificación semanal/)
    assert.match(plan,/semana/)
    assert.match(plan,/Guardar borrador/)
    assert.match(plan,/Publicar/)
    assert.match(plan,/Notas internas/)
    assert.match(plan,/Qué ven las jugadoras/)
    assert.match(plan,/Sentadillas/)
    assert.doesNotMatch(render(Plan,{perfil:{rol:'medico'}}),/Calendario de lunes/)
    const css=readFileSync(new URL('../src/components/planificacion.css',import.meta.url),'utf8')
    assert.doesNotMatch(css,/!important|#[0-9a-f]{3,8}/i)
  }finally{await server.close()}
})
