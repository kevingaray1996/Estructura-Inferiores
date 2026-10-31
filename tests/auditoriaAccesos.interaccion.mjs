import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(),'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Auditoría 1 y 2: Médico consulta sin Físico/offline; categoría PF, accesos y rechazos sin producción', async () => {
  const dom=new JSDOM('<div id="root"></div>',{url:'https://comunicaciones.test/'})
  const previos=new Map()
  const poner=(n,v)=>{previos.set(n,Object.getOwnPropertyDescriptor(globalThis,n));Object.defineProperty(globalThis,n,{value:v,writable:true,configurable:true})}
  for(const n of ['window','document','HTMLElement','Event','MouseEvent'])poner(n,dom.window[n])
  poner('IS_REACT_ACT_ENVIRONMENT',true)
  const {act,createElement}=await import('react'),{createRoot}=await import('react-dom/client'),{createServer}=await import('vite')
  const cat='10000000-0000-4000-8000-000000000001',otra='10000000-0000-4000-8000-000000000002'
  const j={id:'30000000-0000-4000-8000-000000000001',nombre:'Ana',apellido:'Prueba',categoria_id:cat,estado:'disponible'}
  let perfil={email:'prueba@example.invalid',nombre:'Prueba',rol:'medico',categoria_id:null}
  let errorBienestar=null,errorRpe=null,errorGuardar=null,filasPerfil=null
  let sincronizaciones=0
  const escrituras=[],rpcs=[]
  poner('__accesosOffline',{agregarPendiente(){throw Error('No se debe encolar')},contarPendientes(){return 0},async sincronizarPendientes(){sincronizaciones++;return 0}})
  poner('__accesosSupabase',{
    auth:{getSession:async()=>({data:{session:{user:{id:'staff',email:perfil.email}}}}),getUser:async()=>({data:{user:{id:'staff',email:perfil.email}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    storage:{from(){return {getPublicUrl(){return {data:{publicUrl:'https://example.invalid/escudo.png'}}}}}},
    async rpc(nombre,datos){if(nombre==='planificacion_publica_hoy')return {data:[],error:null};rpcs.push({nombre,datos});return {data:null,error:{code:'42501',message:'Denegado simulado'}}},
    from(tabla){
      const filtros=[];let operacion=null,datos=null,singular=false
      const q={select(){return q},order(){return q},limit(){return q},range(){return q},not(){return q},neq(){return q},or(){return q},gte(){return q},lte(){return q},lt(){return q},gt(){return q},in(){return q},
        eq(k,v){filtros.push([k,v]);return q},ilike(){return q},maybeSingle(){singular=true;return q},single(){singular=true;return q},
        update(d){operacion='update';datos=d;return q},insert(d){operacion='insert';datos=d;return q},
        then(resolve,reject){
          if(operacion){assert.equal(tabla,'perfiles');escrituras.push({tabla,operacion,datos:structuredClone(datos)});return Promise.resolve({data:errorGuardar?null:[{email:datos.email}],error:errorGuardar}).then(resolve,reject)}
          let data=tabla==='perfiles'?(filasPerfil || [perfil]):tabla==='categorias'?[{id:cat,nombre:'Primera División',orden:1},{id:otra,nombre:'Reserva',orden:2}]:tabla==='jugadores'?[j]:[]
          data=data.filter(r=>filtros.every(([k,v])=>r[k]===v))
          const error=tabla==='bienestar'?errorBienestar:tabla==='sesiones_fisicas'?errorRpe:null
          return Promise.resolve({data:error?null:singular?data[0] || null:structuredClone(data),error,count:data.length}).then(resolve,reject)
        }
      };return q
    }
  })
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',plugins:[{name:'accesos-simulados',enforce:'pre',resolveId(s){if(s.endsWith('/supabaseClient'))return '\0accesos-db';if(s.endsWith('/colaOffline'))return '\0accesos-offline'},load(id){if(id==='\0accesos-db')return 'export const supabase=globalThis.__accesosSupabase';if(id==='\0accesos-offline')return 'export const {agregarPendiente,contarPendientes,sincronizarPendientes}=globalThis.__accesosOffline'}}]})
  const root=createRoot(document.getElementById('root'))
  const texto=()=>document.body.textContent
  const boton=t=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(t))
  const click=async el=>{assert.ok(el);assert.equal(el.matches(':disabled'),false);await act(()=>el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})))}
  const seleccionar=async(el,v)=>act(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(el,v);el.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
  const escribir=async(el,v)=>act(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})
  let clave=0
  const render=async(C,props={})=>act(async()=>{root.render(createElement(C,{...props,key:++clave}));await Promise.resolve()})
  try{
    const {default:App}=await server.ssrLoadModule('/src/App.jsx')
    const {ContextoApariencia}=await server.ssrLoadModule('/src/appearance/contextoApariencia.js')
    const ConTema=()=>createElement(ContextoApariencia.Provider,{value:{preferencia:'oscuro',establecerPreferencia(){}}},createElement(App))
    await render(ConTema)
    await click(document.querySelector('button[aria-label="Bienestar"]'))
    assert.match(texto(),/Estado general del plantel/)
    assert.equal(sincronizaciones,0)
    assert.equal(escrituras.length,0)
    assert.equal(document.querySelector('button[aria-label="Físico"]'),null)
    assert.doesNotMatch(texto(),/Carga manual|Registro de esfuerzo|Carga entrenamiento/)
    const {default:Comparativo}=await server.ssrLoadModule('/src/components/BienestarComparativo.jsx')
    errorBienestar={code:'42501',message:'Denegado'}
    await render(Comparativo,{perfil})
    assert.match(document.querySelector('[role=alert]').textContent,/no tiene acceso/)
    assert.doesNotMatch(texto(),/Todavía no hay datos para mostrar/)
    assert.equal(boton('Descargar PDF').disabled,true)
    errorBienestar=null
    await render(Comparativo,{perfil})
    await seleccionar(document.querySelector('select'),j.id)
    assert.match(texto(),/Sin registros en este período/,'Una lectura vacía correcta conserva el estado vacío')
    errorRpe={code:'42501'}
    await render(Comparativo,{perfil})
    await seleccionar(document.querySelector('select'),j.id)
    assert.match(document.querySelector('[role=alert]').textContent,/no tiene acceso/)
    assert.equal(boton('Descargar PDF').disabled,true)
    errorRpe=null

    for(const categoria_id of [null,cat]){
      perfil={...perfil,rol:'preparador_fisico',categoria_id}
      await render(ConTema)
      assert.equal(!!document.querySelector('nav button[aria-label="Planificación semanal"]'),!!categoria_id)
      await click(document.querySelector('nav button[aria-label="Entrenamientos"]'))
      assert.equal(!!boton('Planificación semanal'),!!categoria_id)
    }
    const {default:Asistencia}=await server.ssrLoadModule('/src/components/AsistenciaSection.jsx')
    await render(Asistencia,{perfil,fechaInicial:'2026-10-30',categoriaInicial:otra,onVerPlanificacion(){}})
    assert.equal(boton('Ver planificación'),undefined,'No ofrece planificación de otra categoría')
    await render(Asistencia,{perfil,fechaInicial:'2026-10-30',categoriaInicial:cat,onVerPlanificacion(){}})
    assert.ok(boton('Ver planificación'))

    const {default:Usuarios}=await server.ssrLoadModule('/src/components/UsuariosSection.jsx')
    filasPerfil=[{...perfil,categorias:{nombre:'Primera División'}}]
    await render(Usuarios)
    await click(boton('✏️'))
    assert.equal(document.querySelector('[aria-label="Categoría asignada"]').value,cat)
    await escribir(document.querySelector('input[placeholder="Nombre (opcional)"]'),'Nombre actualizado')
    await click(boton('Guardar cambios'))
    assert.equal(escrituras.at(-1).datos.categoria_id,cat,'Editar otro dato conserva categoría PF')
    await click(boton('✏️'))
    await seleccionar(document.querySelector('[aria-label="Categoría asignada"]'),'')
    await click(boton('Guardar cambios'))
    assert.equal(escrituras.at(-1).datos.categoria_id,null,'PF puede quedar sin planificación')
    await click(boton('✏️'))
    await seleccionar(document.querySelector('[aria-label="Categoría asignada"]'),otra)
    errorGuardar={code:'42501',message:'Denegado'}
    await click(boton('Guardar cambios'))
    assert.match(texto(),/No tenés permiso para guardar/)
    assert.equal(document.querySelector('[aria-label="Categoría asignada"]').value,otra,'Rechazo conserva formulario')
    errorGuardar=null
    filasPerfil=[{...perfil,rol:'tecnico',categoria_id:null}]
    await render(Usuarios);await click(boton('✏️'))
    const antes=escrituras.length
    await click(boton('Guardar cambios'))
    assert.equal(escrituras.length,antes)
    assert.match(texto(),/necesita una categoría/)

    const {default:Planificacion}=await server.ssrLoadModule('/src/components/PlanificacionSection.jsx')
    await render(Planificacion,{perfil:{...perfil,categoria_id:null}})
    assert.match(texto(),/Necesitás una categoría asignada/)
    assert.equal(boton('+ Sesión'),undefined)
    await render(Planificacion,{perfil:{...perfil,categoria_id:cat}})
    await click(boton('+ Sesión'))
    const objetivo=[...document.querySelectorAll('label')].find(l=>l.textContent.startsWith('Objetivo general')).querySelector('input')
    await escribir(objetivo,'Conservar borrador ante rechazo')
    await click(boton('Guardar borrador'))
    assert.equal(rpcs.length,1)
    assert.match(document.querySelector('[role=alert]').textContent,/no tiene permiso/)
    assert.equal(objetivo.value,'Conservar borrador ante rechazo')
    assert.equal(boton('Guardar borrador').disabled,true)
    assert.ok(!escrituras.some(e=>e.tabla!=='perfiles'))
  }finally{
    await act(()=>root.unmount());await server.close();dom.window.close()
    for(const[n,d]of previos){if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n]}
  }
})
