import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fechaArgentina, inicioSemana } from '../src/utils/planificacion.js'
import { cambiarMes } from '../src/utils/calendario.js'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(),'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Calendario y navegación: tres fuentes, recarga, mes tardío y sesión exacta; sin servicios ni escrituras', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url:'https://comunicaciones.test/' })
  const anteriores = new Map()
  function poner(n,v) { anteriores.set(n,Object.getOwnPropertyDescriptor(globalThis,n)); Object.defineProperty(globalThis,n,{value:v,writable:true,configurable:true}) }
  for (const n of ['window','document','HTMLElement','Event','MouseEvent']) poner(n,dom.window[n])
  poner('IS_REACT_ACT_ENVIRONMENT',true)
  const { act, createElement:h } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba: createServer } = await import('./helpers/servidorVite.mjs')
  const cat='10000000-0000-4000-8000-000000000001', hoy=fechaArgentina()
  const perfil={rol:'coordinacion',email:'prueba@example.invalid',nombre:'Prueba'}
  const base={id:'20000000-0000-4000-8000-000000000001',categoria_id:cat,fecha:hoy,hora:'18:30:00',objetivo:'Circuito',tipo:'entrenamiento',estado:'borrador',revision:1,bloques:[],responsable:'Primera',observaciones_internas:'NOTA PRIVADA',categorias:{nombre:'Primera'}}
  const segunda={...base,id:'20000000-0000-4000-8000-000000000002',responsable:'Segunda',estado:'publicado'}
  let sesiones=[base,segunda], errorPlan=null, demorar=false
  const pendientes=[], consultas=[]
  poner('__calendarioDB',{
    auth:{getSession:async()=>({data:{session:{user:{id:'staff',email:perfil.email}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    storage:{from(){return {getPublicUrl(){return {data:{publicUrl:'https://example.invalid/logo.png'}}}}}},
    rpc(){throw Error('No se permiten RPC ni escrituras en esta prueba')},
    from(tabla) {
      const filtros=[];let campos='', singular=false;const q={
        maybeSingle(){singular=true;return q},single(){singular=true;return q},
        select(c){campos=c;return q},order(){return q},limit(){return q},range(){return q},not(){return q},neq(){return q},or(){return q},in(){return q},lt(){return q},
        eq(k,v){filtros.push(['eq',k,v]);return q},gte(k,v){filtros.push(['gte',k,v]);return q},lte(k,v){filtros.push(['lte',k,v]);return q},
        then(ok,mal){
          consultas.push({tabla,campos,filtros})
          let data=tabla==='perfiles'?[perfil]:tabla==='categorias'?[{id:cat,nombre:'Primera',orden:1}]:tabla==='planificacion_sesiones'?sesiones:
            tabla==='partidos'?[{id:'p',fecha:hoy,rival:'Rival',categoria_id:cat}]:tabla==='videos'?[{id:'v',fecha:hoy,tipo:'entrenamiento',contenido:'Filmación',categoria_id:cat}]:[]
          data=data.filter(r=>filtros.every(([op,k,v])=>op==='eq'?r[k]===v:op==='gte'?r[k]>=v:r[k]<=v))
          const respuesta={data:structuredClone(singular ? data[0] || null : data),error:tabla==='planificacion_sesiones'?errorPlan:null}
          return (demorar && tabla==='planificacion_sesiones'?new Promise(resolve=>pendientes.push(resolve)):Promise.resolve(respuesta)).then(ok,mal)
        }
      };return q
    }
  })
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',plugins:[{name:'calendario-db',enforce:'pre',resolveId(s){if(s.endsWith('/supabaseClient'))return '\0calendario-db';if(s.endsWith('/InicioSection'))return '\0calendario-inicio'},load(id){if(id==='\0calendario-db')return 'export const supabase=globalThis.__calendarioDB';if(id==='\0calendario-inicio')return 'export default function InicioSimulado(){return null}'}}]})
  const root=createRoot(document.getElementById('root'))
  const texto=()=>document.body.textContent
  const botones=t=>[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()===t)
  const click=async el=>{assert.ok(el);await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));await Promise.resolve()})}
  let key=0
  const render=async(C,props={})=>act(async()=>{root.render(h(C,{...props,key:++key}));await Promise.resolve()})
  try {
    const {default:Calendario}=await server.ssrLoadModule('/src/components/CalendarioSection.jsx')
    const abrir=[]
    await render(Calendario,{perfil,onVerPlanificacion:(...args)=>abrir.push(args)})
    assert.equal(botones('Abrir planificación').length,2)
    assert.match(texto(),/Video de entrenamiento/)
    assert.match(texto(),/vs Rival/)
    assert.match(texto(),/18:30/)
    assert.match(texto(),/Borrador/);assert.match(texto(),/Publicado/)
    assert.doesNotMatch(texto(),/NOTA PRIVADA/)
    await click(botones('Abrir planificación')[1])
    assert.deepEqual(abrir[0],[hoy,cat,segunda.id])
    sesiones=[]
    await click(botones('Actualizar')[0])
    assert.equal(botones('Abrir planificación').length,0)
    sesiones=[{...segunda,hora:'20:15:00'}]
    await click(botones('Actualizar')[0]);assert.match(texto(),/20:15/)
    sesiones=[{...segunda,fecha:cambiarMes(hoy,2)}]
    await click(botones('Actualizar')[0])
    assert.equal(botones('Abrir planificación').length,0,'La sesión trasladada deja de aparecer en el mes anterior')
    sesiones=[base,segunda]
    errorPlan={code:'42501'}
    await click(botones('Actualizar')[0])
    assert.match(texto(),/incompleto/);assert.match(texto(),/no tiene acceso/);assert.match(texto(),/vs Rival/)
    errorPlan=null;demorar=true
    await render(Calendario,{perfil})
    await click(botones('→')[0])
    assert.equal(pendientes.length,2)
    await act(async()=>pendientes[1]({data:[{...segunda,fecha:cambiarMes(hoy,1),objetivo:'RESULTADO NUEVO'}],error:null}))
    await act(async()=>pendientes[0]({data:[{...base,objetivo:'RESULTADO ANTIGUO'}],error:null}))
    assert.doesNotMatch(texto(),/RESULTADO ANTIGUO/)
    assert.match(texto(),/RESULTADO NUEVO/)
    demorar=false;sesiones=[base,segunda]

    const {default:Planificacion}=await server.ssrLoadModule('/src/components/PlanificacionSection.jsx')
    await render(Planificacion,{perfil,fechaInicial:hoy,categoriaInicial:cat,sesionInicialId:segunda.id})
    assert.ok([...document.querySelectorAll('input')].some(i=>i.value==='Segunda'))
    assert.ok(consultas.some(q=>q.tabla==='planificacion_sesiones' && q.filtros.some(f=>f[0]==='gte'&&f[2]===inicioSemana(hoy))))
    sesiones=[base]
    await render(Planificacion,{perfil,fechaInicial:hoy,categoriaInicial:cat,sesionInicialId:segunda.id})
    assert.match(texto(),/ya no está disponible/)
    assert.equal([...document.querySelectorAll('input')].some(i=>i.value==='Primera'),false)

    sesiones=[base,segunda]
    const {default:App}=await server.ssrLoadModule('/src/App.jsx')
    const {ContextoApariencia}=await server.ssrLoadModule('/src/appearance/contextoApariencia.js')
    await render(()=>h(ContextoApariencia.Provider,{value:{preferencia:'oscuro',establecerPreferencia(){}}},h(App)))
    await click(document.querySelector('button[aria-label="Calendario"]'))
    await click(botones('Abrir planificación')[1])
    assert.ok([...document.querySelectorAll('input')].some(i=>i.value==='Segunda'),'App conserva el ID exacto')
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close()
    for(const [n,d] of anteriores) { if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n] }
  }
})
