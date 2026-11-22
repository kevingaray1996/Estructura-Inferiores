// Monta AnalisisSection con YouTube y Supabase simulados; nunca usa producción.
// Lo comparten los tests de interacción de Análisis.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

export async function montar({ tipos, eventos = [], eventosPartido = [], planilla = [], calendario = [], nombresComet = [] } = {}) {
  const dom = new JSDOM('<!doctype html><html><head><style>body{color:black}</style></head><body><div id="root"></div></body></html>', { url: 'https://comunicaciones.test' })
  const previos = new Map(), players = [], timers = new Map(), writes = [], borrados = [], actualizaciones = [], lecturas = {}, rpcs = [], guardados = [], subidas = []
  function global(nombre, valor) { previos.set(nombre, Object.getOwnPropertyDescriptor(globalThis,nombre)); Object.defineProperty(globalThis,nombre,{value:valor,configurable:true,writable:true}) }
  for (const n of ['window','document','HTMLElement','Event','MouseEvent','KeyboardEvent']) global(n,dom.window[n])
  global('IS_REACT_ACT_ENVIRONMENT',true)
  const { act,createElement } = await import('react'), { createRoot } = await import('react-dom/client'), { crearServidorVitePrueba: createServer } = await import('./servidorVite.mjs')
  const authUser={id:'f7562d52-a16a-48b5-95a0-efbcc70080d3',email:'simulado@test.invalid'}
  const ana={id:'j',nombre:'Ana',apellido:'Prueba',categoria_id:'cat'}, bea={id:'j2',nombre:'Bea',apellido:'Ensayo',categoria_id:'cat'}
  const partidos=[{id:'p1',rival:'Rival A',fecha:'2026-10-29',categoria_id:'cat',direccion_primer_tiempo:'derecha',partido_calendario_id:'c1',video_url:'https://www.youtube.com/watch?v=abc123def45'}]
  const estado={resolverInsert:null}
  const datos={perfiles:{email:authUser.email,nombre:'Kevin Garay',rol:'coordinacion'},partidos:structuredClone(calendario),analisis_comet_nombres:structuredClone(nombresComet),analisis_partidos:partidos,analisis_eventos:structuredClone(eventos),analisis_pases_detalle:[],analisis_tipos_accion:tipos,jugadores:[ana,bea],
    analisis_partido_eventos:structuredClone(eventosPartido),estadisticas_jugador:structuredClone(planilla),
    citaciones:[{id:'c',jugador_id:'j',dorsal:10,titular:true},{id:'c2',jugador_id:'j2',dorsal:7,titular:false}]}
  global('__analisisSupabase', { rpc:async (nombre,args)=>{
    // Receptora de un pase: se guarda con su revisión.
    if(nombre==='guardar_detalle_pase'){rpcs.push(args);return {data:[{evento_id:args.p_evento_id,destinataria_estado:args.p_destinataria_estado,destinataria_id:args.p_destinataria_id,revision:(args.p_revision_esperada||0)+1}]}}
    assert.equal(nombre,'puede_administrar_analisis');return {data:true}}, storage:{from:(bucket)=>({upload:async(ruta,archivo,opciones)=>{subidas.push({bucket,ruta,archivo,opciones});return {data:{path:ruta},error:null}},createSignedUrl:async(ruta)=>({data:{signedUrl:'https://archivo.test/'+ruta},error:null})})}, auth:{getUser:async()=>({data:{user:authUser}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(tabla){
    // Eventos del partido y planilla: se guardan al instante y quedan anotados en «guardados».
    if(['analisis_partido_eventos','estadisticas_jugador','analisis_comet_nombres'].includes(tabla)||(['analisis_partidos','partidos'].includes(tabla)&&globalThis.__escrituraPartidos)){
      let op=null,valores=null;const filtro={}
      const aplicar=()=>{
        if(op==='insert'){const fila={id:crypto.randomUUID(),...valores};datos[tabla].push(fila);guardados.push({tabla,op,fila});return fila}
        if(op==='upsert'){for(const v of valores){datos[tabla]=datos[tabla].filter(f=>f.nombre_comet!==v.nombre_comet);datos[tabla].push(v)}guardados.push({tabla,op,filas:valores});return valores}
        if(op==='update'){const ids=filtro.in||[filtro.id];datos[tabla]=datos[tabla].map(f=>ids.includes(f.id)?{...f,...valores}:f);guardados.push({tabla,op,ids,valores});return datos[tabla].find(f=>ids.includes(f.id))}
        if(op==='delete'){datos[tabla]=datos[tabla].filter(f=>f.id!==filtro.id);guardados.push({tabla,op,id:filtro.id});return null}
        return structuredClone(datos[tabla])}
      const s={select(){return s},eq(c,v){filtro[c]=v;return s},in(c,v){filtro.in=v;return s},order(){return s},
        insert(d){op='insert';valores=d;return s},upsert(d){op='upsert';valores=d;return s},update(d){op='update';valores=d;return s},delete(){op='delete';return s},
        single(){return Promise.resolve({data:aplicar(),error:null})},then(ok,ko){return Promise.resolve({data:aplicar(),error:null}).then(ok,ko)}}
      return s
    }
    let registro, borrar=false, cambios=null
    const filtro={}
    const q={select(){return q},eq(c,v){filtro[c]=v;return q},in(){return q},order(){return q},range(){return q},limit(){return q},maybeSingle(){return Promise.resolve({data:datos[tabla]})},
      insert(d){assert.equal(tabla,'analisis_eventos');registro=d;return q},
      delete(){assert.equal(tabla,'analisis_eventos');borrar=true;return q},
      update(d){assert.equal(tabla,'analisis_eventos');cambios=d;return q},
      single(){
        if(cambios){actualizaciones.push({id:filtro.id,...cambios});const fila={...datos.analisis_eventos.find(e=>e.id===filtro.id),...cambios};datos.analisis_eventos=datos.analisis_eventos.map(e=>e.id===fila.id?fila:e);return Promise.resolve({data:fila,error:null})}
        // El insert queda esperando: el test decide si se guarda (resolver) o si falla la red (fallar).
        writes.push(registro);return new Promise(resolve=>{estado.resolverInsert=()=>{datos.analisis_eventos.push(registro);resolve({data:registro})};estado.fallarInsert=(error)=>resolve({data:null,error})})},
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
  // jsdom no calcula diseño ni tiene scrollIntoView (la Playlist lo usa al abrir «Editar todo»).
  dom.window.HTMLElement.prototype.scrollIntoView=function(){}
  dom.window.setInterval=fn=>{const id=Symbol();timers.set(id,fn);return id};dom.window.clearInterval=id=>timers.delete(id)
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',plugins:[{name:'captura-backend-simulado',enforce:'pre',resolveId(s){if(s.endsWith('/supabaseClient'))return '\0captura-mock';if(s.endsWith('/cometPdf'))return '\0comet-pdf-mock'},load(id){if(id==='\0captura-mock')return 'export const supabase=globalThis.__analisisSupabase;';if(id==='\0comet-pdf-mock')return 'export const textosDeArchivo=(archivo)=>globalThis.__cometTextos(archivo);'}}]})
  const root=createRoot(document.getElementById('root'))
  const boton=t=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(t))
  const presionar=async(b,t)=>{assert.ok(b,t);assert.equal(b.disabled,false,t);await act(()=>b.click())}
  const h={
    act, dom, datos, writes, borrados, actualizaciones, lecturas, rpcs, guardados, subidas, boton,
    resolver:async()=>act(async()=>estado.resolverInsert()),
    fallar:async(error={message:'TypeError: Failed to fetch'})=>act(async()=>estado.fallarInsert(error)),
    // Tecla en la ventana principal (los atajos escuchan en window).
    tecla:async(key,extra={})=>act(()=>{dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra}))}),
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
