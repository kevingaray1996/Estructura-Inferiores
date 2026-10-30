// Integración de dos documentos DOM, YouTube y Supabase simulados. Nunca usa producción.
import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Análisis: dos ventanas, un reproductor, comandos confirmados y un guardado por acción', async () => {
  const dom = new JSDOM('<!doctype html><html><head><style>body{color:black}</style></head><body><div id="root"></div></body></html>', { url: 'https://comunicaciones.test' })
  const previos = new Map(), hijas = [], players = [], timers = new Map(), writes = []
  function global(nombre, valor) { previos.set(nombre, Object.getOwnPropertyDescriptor(globalThis,nombre)); Object.defineProperty(globalThis,nombre,{value:valor,configurable:true,writable:true}) }
  for (const n of ['window','document','HTMLElement','Event','MouseEvent','KeyboardEvent']) global(n,dom.window[n])
  global('IS_REACT_ACT_ENVIRONMENT',true)
  const { act,createElement } = await import('react'), { createRoot } = await import('react-dom/client'), { createServer } = await import('vite')
  const authUser={id:'f7562d52-a16a-48b5-95a0-efbcc70080d3',email:'simulado@test.invalid'}
  const j={id:'j',nombre:'Ana',apellido:'Prueba',categoria_id:'cat'}
  const partidos=[{id:'p1',rival:'Rival A',fecha:'2026-10-29',categoria_id:'cat',partido_calendario_id:'c1',video_url:'https://www.youtube.com/watch?v=abc123def45'}, {id:'p2',rival:'Rival B',fecha:'2026-10-30',categoria_id:'cat',partido_calendario_id:'c2',video_url:'https://www.youtube.com/watch?v=xyz123def45'}]
  let resolverInsert
  const datos={perfiles:{email:authUser.email,nombre:'Kevin Garay',rol:'coordinacion'},partidos:[],analisis_partidos:partidos,analisis_eventos:[],jugadores:[j],citaciones:[{id:'c',jugador_id:'j',dorsal:10,titular:true}]}
  global('__analisisSupabase', { auth:{getUser:async()=>({data:{user:authUser}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(tabla){
    let registro
    const q={select(){return q},eq(){return q},in(){return q},order(){return q},maybeSingle(){return Promise.resolve({data:datos[tabla]})},insert(d){assert.equal(tabla,'analisis_eventos');registro=d;return q},single(){writes.push(registro);return new Promise(resolve=>{resolverInsert=()=>{datos.analisis_eventos.push(registro);resolve({data:registro})}})},then(resolve,reject){return Promise.resolve({data:structuredClone(datos[tabla] || [])}).then(resolve,reject)}}
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
  const YT={Player,PlayerState:{PLAYING:1}}
  dom.window.YT=YT
  dom.window.setInterval=fn=>{const id=Symbol();timers.set(id,fn);return id};dom.window.clearInterval=id=>timers.delete(id)
  let popup=null, bloqueada=false
  function nuevoDocumento(){const hija=new JSDOM('<!doctype html><html><head></head><body><main id="analisis-auxiliar-contenido" data-ventana-analisis="lista"></main></body></html>',{url:'https://comunicaciones.test/analisis-ventana.html'});hija.window.YT=YT;hijas.push(hija);return hija.window.document}
  dom.window.open=(url)=>{
    assert.equal(url,'https://comunicaciones.test/analisis-ventana.html')
    if(bloqueada)return null
    if(!popup || popup.closed){const listeners=new Map();popup={document:nuevoDocumento(),location:{href:'https://comunicaciones.test/analisis-ventana.html'},closed:false,focus(){},close(){this.closed=true},addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:(k,fn)=>{if(listeners.get(k)===fn)listeners.delete(k)},listeners}}
    return popup
  }
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',plugins:[{name:'ventanas-backend-simulado',enforce:'pre',resolveId(s){if(s.endsWith('/supabaseClient'))return '\0ventanas-mock'},load(id){if(id==='\0ventanas-mock')return 'export const supabase=globalThis.__analisisSupabase;'}}]})
  const root=createRoot(document.getElementById('root'))
  const main=()=>document, remoto=()=>popup.document
  const boton=(d,t)=>[...d.querySelectorAll('button')].find(b=>b.textContent.includes(t))
  const click=async(d,t)=>{const b=boton(d,t);assert.ok(b,t);assert.equal(b.disabled,false,t);await act(()=>b.click())}
  const tick=async()=>act(()=>{[...timers.values()].forEach(fn=>fn())})
  const activo=()=>players.filter(p=>p.alive).at(-1)
  const cambio=async(el,value)=>act(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(el,value);el.dispatchEvent(new el.ownerDocument.defaultView.Event('change',{bubbles:true}))})
  try {
    const {default:Analisis}=await server.ssrLoadModule('/src/components/AnalisisSection.jsx')
    await act(async()=>{root.render(createElement(Analisis));await Promise.resolve()})
    assert.equal(document.querySelectorAll('iframe').length,1);assert.equal(players.filter(p=>p.alive).length,1)
    activo().time=125.9
    bloqueada=true;await click(main(),'Separar botonera');assert.match(document.body.textContent,/bloqueó/);assert.equal(document.querySelectorAll('iframe').length,1)
    assert.ok(boton(main(),'Reintentar separación'))
    bloqueada=false;const original=activo();await click(main(),'Reintentar separación')
    assert.equal(activo(),original);assert.match(remoto().body.textContent,/Etiquetado rápido/)
    assert.ok(![...document.querySelectorAll('h2')].some(h=>h.textContent==='Etiquetado rápido'))
    await click(remoto(),'Pase +')
    await act(()=>{const b=boton(remoto(),'Ana Prueba');b.click();b.click()})
    assert.equal(writes.length,1);assert.equal(writes[0].segundo,125);assert.equal(writes[0].partido_id,'p1');assert.equal(writes[0].jugador_id,'j')
    await act(async()=>resolverInsert());assert.match(document.body.textContent,/Acciones registradas \(1\)/)
    await click(remoto(),'▶ Reproducir');assert.equal(activo().state,1)
    await click(main(),'Ⅱ Pausar');assert.equal(activo().state,2);assert.match(remoto().body.textContent,/Reproducir/)
    await click(remoto(),'+5 s');assert.ok(boton(remoto(),'Ana Prueba').disabled);assert.equal(writes.length,1)
    await act(()=>activo().confirmarSalto());await tick();assert.equal(activo().time,130)
    const velocidad=[...remoto().querySelectorAll('select')].find(s=>s.parentElement.textContent.includes('Velocidad'))
    await cambio(velocidad,'2');assert.equal(activo().rate,2)
    await click(main(),'Rival B');assert.match(remoto().body.textContent,/Rival B/);assert.equal(players.filter(p=>p.alive).length,1)
    activo().time=73.4;await click(remoto(),'Pase +');await click(remoto(),'Ana Prueba');assert.equal(writes.length,2);assert.equal(writes[1].partido_id,'p2');assert.equal(writes[1].segundo,73)
    await act(async()=>resolverInsert())
    await click(main(),'Separar reproductor')
    assert.equal(document.querySelectorAll('iframe').length,0);assert.equal(remoto().querySelectorAll('iframe').length,1)
    assert.equal(players.filter(p=>p.alive).length,1);assert.equal(activo().iframe.ownerDocument,remoto())
    assert.equal(activo().iframe.ownerDocument.URL,'https://comunicaciones.test/analisis-ventana.html')
    const embed=new URL(activo().iframe.src)
    assert.equal(embed.searchParams.get('enablejsapi'),'1');assert.equal(embed.searchParams.get('origin'),'https://comunicaciones.test')
    assert.equal(activo().iframe.getAttribute('referrerpolicy'),'strict-origin-when-cross-origin')
    await act(()=>activo().confirmarSalto());await tick()
    assert.equal(activo().state,2)
    await click(remoto(),'▶ Reproducir')
    await click(main(),'Ⅱ Pausar');assert.equal(activo().state,2)
    await act(()=>popup.listeners.get('beforeunload')())
    assert.match(document.body.textContent,/reconectando/)
    await tick();assert.equal(document.querySelectorAll('iframe').length,0)
    popup.document=nuevoDocumento();await tick();await tick()
    assert.equal(remoto().querySelectorAll('iframe').length,1);assert.equal(players.filter(p=>p.alive).length,1)
    await act(()=>activo().confirmarSalto());await tick()
    await act(()=>popup.close());await tick()
    assert.equal(document.querySelectorAll('iframe').length,1);assert.equal(players.filter(p=>p.alive).length,1)
    assert.match(document.body.textContent,/volvió a integrarse/);assert.equal(writes.length,2)
    await act(()=>activo().confirmarSalto());await tick()
    await click(main(),'Separar botonera')
    const form=remoto().querySelector('form')
    await act(()=>{form.parentElement.open=true})
    await cambio(form.querySelectorAll('select')[0],'Despeje')
    await cambio(form.querySelectorAll('select')[1],'j')
    await cambio(form.querySelectorAll('select')[2],'Fallido')
    const cancha=form.querySelector('svg[role="button"]')
    cancha.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100})
    await act(()=>cancha.dispatchEvent(new cancha.ownerDocument.defaultView.MouseEvent('click',{bubbles:true,clientX:72,clientY:35})))
    // Selección y coordenadas viven en la principal y sobreviven al acoplar.
    await click(remoto(),'Acoplar ventana')
    assert.equal(document.querySelector('form').querySelectorAll('select')[0].value,'Despeje')
    assert.equal(document.querySelector('form').querySelectorAll('select')[2].value,'Fallido')
    assert.match(document.querySelector('form').textContent,/X 72%/)
    await click(main(),'Separar botonera')
    await act(()=>remoto().querySelector('form').dispatchEvent(new (remoto().defaultView.Event)('submit',{bubbles:true,cancelable:true})))
    assert.equal(writes.length,3);assert.equal(writes[2].tipo,'Despeje');assert.equal(writes[2].resultado,'Fallido')
    assert.equal(writes[2].coordenada_x,72);assert.equal(writes[2].coordenada_y,35);assert.equal(writes[2].partido_id,'p2')
    await act(async()=>resolverInsert())
    await act(()=>window.dispatchEvent(new window.Event('pagehide')))
    assert.equal(popup.closed,true);assert.equal(writes.length,3)
    // Marco real de la ruta auxiliar: conexión sin iniciar otra aplicación ni cliente.
    const mensajes=[];const principal={closed:false,postMessage:(d,o)=>mensajes.push({d,o})}
    Object.defineProperty(window,'opener',{value:principal,configurable:true})
    window.history.replaceState({},'', '/analisis-ventana.html')
    const {default:Marco}=await server.ssrLoadModule('/src/components/VentanaAuxiliarAnalisis.jsx')
    await act(()=>root.render(createElement(Marco)))
    assert.equal(mensajes.length,1);assert.equal(mensajes[0].o,'https://comunicaciones.test')
    assert.deepEqual(mensajes[0].d,{canal:'comunicaciones:analisis-auxiliar:v1',tipo:'lista'})
    const destino=document.getElementById('analisis-auxiliar-contenido')
    assert.ok(destino);assert.match(document.body.textContent,/Conectando/)
    const confirmar=async origin=>act(()=>{const e=new window.MessageEvent('message',{origin,data:{canal:'comunicaciones:analisis-auxiliar:v1',tipo:'conectada'}});Object.defineProperty(e,'source',{value:principal});window.dispatchEvent(e)})
    await confirmar('https://ajeno.test');assert.match(document.body.textContent,/Conectando/)
    await confirmar('https://comunicaciones.test');assert.doesNotMatch(document.body.textContent,/Conectando/)
    assert.equal(document.getElementById('analisis-auxiliar-contenido'),destino)
    assert.equal(writes.length,3)
  } finally {
    await act(()=>root.unmount());await server.close();for(const hija of hijas)hija.window.close();dom.window.close()
    for(const[n,p]of previos){if(p)Object.defineProperty(globalThis,n,p);else delete globalThis[n]}
  }
})
