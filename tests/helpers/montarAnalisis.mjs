// Monta AnalisisSection con YouTube y Supabase simulados; nunca usa producción.
// Lo comparten los tests de interacción de Análisis.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

export async function montar({ tipos, eventos = [] } = {}) {
  const dom = new JSDOM('<!doctype html><html><head><style>body{color:black}</style></head><body><div id="root"></div></body></html>', { url: 'https://comunicaciones.test' })
  const previos = new Map(), players = [], timers = new Map(), writes = [], borrados = [], actualizaciones = [], lecturas = {}
  function global(nombre, valor) { previos.set(nombre, Object.getOwnPropertyDescriptor(globalThis,nombre)); Object.defineProperty(globalThis,nombre,{value:valor,configurable:true,writable:true}) }
  for (const n of ['window','document','HTMLElement','Event','MouseEvent','KeyboardEvent']) global(n,dom.window[n])
  global('IS_REACT_ACT_ENVIRONMENT',true)
  const { act,createElement } = await import('react'), { createRoot } = await import('react-dom/client'), { crearServidorVitePrueba: createServer } = await import('./servidorVite.mjs')
  const authUser={id:'f7562d52-a16a-48b5-95a0-efbcc70080d3',email:'simulado@test.invalid'}
  const ana={id:'j',nombre:'Ana',apellido:'Prueba',categoria_id:'cat'}, bea={id:'j2',nombre:'Bea',apellido:'Ensayo',categoria_id:'cat'}
  const partidos=[{id:'p1',rival:'Rival A',fecha:'2026-10-29',categoria_id:'cat',direccion_primer_tiempo:'derecha',partido_calendario_id:'c1',video_url:'https://www.youtube.com/watch?v=abc123def45'}]
  const estado={resolverInsert:null}
  const datos={perfiles:{email:authUser.email,nombre:'Kevin Garay',rol:'coordinacion'},partidos:[],analisis_partidos:partidos,analisis_eventos:structuredClone(eventos),analisis_pases_detalle:[],analisis_tipos_accion:tipos,jugadores:[ana,bea],
    citaciones:[{id:'c',jugador_id:'j',dorsal:10,titular:true},{id:'c2',jugador_id:'j2',dorsal:7,titular:false}]}
  global('__analisisSupabase', { rpc:async nombre=>{assert.equal(nombre,'puede_administrar_analisis');return {data:true}}, auth:{getUser:async()=>({data:{user:authUser}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(tabla){
    let registro, borrar=false, cambios=null
    const filtro={}
    const q={select(){return q},eq(c,v){filtro[c]=v;return q},in(){return q},order(){return q},range(){return q},limit(){return q},maybeSingle(){return Promise.resolve({data:datos[tabla]})},
      insert(d){assert.equal(tabla,'analisis_eventos');registro=d;return q},
      delete(){assert.equal(tabla,'analisis_eventos');borrar=true;return q},
      update(d){assert.equal(tabla,'analisis_eventos');cambios=d;return q},
      single(){
        if(cambios){actualizaciones.push({id:filtro.id,...cambios});const fila={...datos.analisis_eventos.find(e=>e.id===filtro.id),...cambios};datos.analisis_eventos=datos.analisis_eventos.map(e=>e.id===fila.id?fila:e);return Promise.resolve({data:fila,error:null})}
        writes.push(registro);return new Promise(resolve=>{estado.resolverInsert=()=>{datos.analisis_eventos.push(registro);resolve({data:registro})}})},
      then(resolve,reject){
        if(borrar){borrados.push(filtro.id);datos.analisis_eventos=datos.analisis_eventos.filter(e=>e.id!==filtro.id);return Promise.resolve({error:null}).then(resolve,reject)}
        lecturas[tabla]=(lecturas[tabla]||0)+1;return Promise.resolve({data:structuredClone(datos[tabla] || [])}).then(resolve,reject)}}
    return q
  } })
  class Player {
    constructor(iframe, opciones){this.iframe=iframe;this.events=opciones.events;this.time=0;this.state=2;this.rate=1;this.alive=true;players.push(this);queueMicrotask(()=>this.events.onReady({target:this}))}
    getCurrentTime(){return this.time} getPlayerState(){return this.state} getPlaybackRate(){return this.rate} getAvailablePlaybackRates(){return [.5,1,2]}
    emitir(){this.events.onStateChange({target:this,data:this.state})}
    playVideo(){this.state=1;this.emitir()} pauseVideo(){this.state=2;this.emitir()}
    seekTo(t){this.pending=t} confirmarSalto(){this.time=this.pending;this.pending=undefined;this.emitir()}
    setPlaybackRate(v){this.rate=v;this.events.onPlaybackRateChange({target:this,data:v})}
    destroy(){this.alive=false;this.iframe.remove()}
  }
  dom.window.YT={Player,PlayerState:{PLAYING:1}}
  dom.window.setInterval=fn=>{const id=Symbol();timers.set(id,fn);return id};dom.window.clearInterval=id=>timers.delete(id)
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',plugins:[{name:'captura-backend-simulado',enforce:'pre',resolveId(s){if(s.endsWith('/supabaseClient'))return '\0captura-mock'},load(id){if(id==='\0captura-mock')return 'export const supabase=globalThis.__analisisSupabase;'}}]})
  const root=createRoot(document.getElementById('root'))
  const boton=t=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(t))
  const presionar=async(b,t)=>{assert.ok(b,t);assert.equal(b.disabled,false,t);await act(()=>b.click())}
  const h={
    act, dom, datos, writes, borrados, actualizaciones, lecturas, boton,
    resolver:async()=>act(async()=>estado.resolverInsert()),
    click:async t=>presionar(boton(t),t),
    // Botón de una acción de la botonera rápida.
    tipo:t=>document.querySelector(`[data-tipo-rapido="${t}"]`),
    marcar:async t=>presionar(h.tipo(t),t),
    // Botón de la lista de etiquetado rápido (lleva "＋"); el de Suplentes solo selecciona.
    convocada:t=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(t)&&b.textContent.includes('＋')),
    etiquetar:async t=>presionar(h.convocada(t),t),
    tick:async()=>act(()=>{[...timers.values()].forEach(fn=>fn())}),
    activo:()=>players.filter(p=>p.alive).at(-1),
    cambio:async(el,value)=>act(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(el,value);el.dispatchEvent(new el.ownerDocument.defaultView.Event('change',{bubbles:true}))}),
    registradas:n=>assert.match(document.body.textContent,new RegExp(`Acciones registradas \\(${n}\\)`)),
    iniciar:async()=>{
      const {default:Analisis}=await server.ssrLoadModule('/src/components/AnalisisSection.jsx')
      await act(async()=>{root.render(createElement(Analisis));await Promise.resolve()})
      assert.equal(players.filter(p=>p.alive).length,1)
    },
    cerrar:async()=>{
      await act(()=>root.unmount());await server.close();dom.window.close()
      for(const[n,p]of previos){if(p)Object.defineProperty(globalThis,n,p);else delete globalThis[n]}
    },
  }
  return h
}
