import test from 'node:test'
import assert from 'node:assert/strict'
import { crearBloqueoEtiquetado, crearVentanaAnalisis, leerTiempoActivo, registroInciertoTrasError } from '../src/utils/ventanaAnalisis.js'
import { cargarYouTubeEnVentana, mensajeErrorYouTube } from '../src/utils/youtubeVentana.js'
import { RUTA_VENTANA_ANALISIS, CANAL_VENTANA_ANALISIS, esVentanaAnalisis } from '../src/utils/rutaVentanaAnalisis.js'

function documento() {
  const attrs = new Map()
  const nodo = { isConnected: true, setAttribute() {}, getAttribute: k => k === 'data-ventana-analisis' ? 'lista' : null }
  const d = { readyState: 'complete', title: '', querySelectorAll: () => [],
    getElementById: () => nodo,
    documentElement: { setAttribute: (k,v) => attrs.set(k,v), removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.get(k) },
    head: { querySelectorAll: () => [], appendChild() {} },
    body: { replaceChildren(n) { if (this.nodo) this.nodo.isConnected = false; this.nodo = n; n.isConnected = true } },
    createElement() { return { setAttribute() {}, isConnected: false } },
  }
  return d
}
function entorno() {
  const listeners = new Map(), timers = new Map(), llamadas = [], mensajes = new Map()
  const hija = { document: documento(), closed: false, location: { href: `https://comunicaciones.test${RUTA_VENTANA_ANALISIS}` }, focus() {}, close() { this.closed = true },postMessage() {},
    addEventListener: (k,fn) => listeners.set(k,fn), removeEventListener: (k,fn) => { if (listeners.get(k) === fn) listeners.delete(k) } }
  const host = { location:{href:'https://comunicaciones.test/',origin:'https://comunicaciones.test'},document: documento(),open: (...args) => { llamadas.push(args); return hija }, setInterval: fn => { const id=Symbol(); timers.set(id,fn);return id }, clearInterval: id => timers.delete(id),addEventListener:(k,fn)=>mensajes.set(k,fn),removeEventListener:k=>mensajes.delete(k) }
  return { host,hija,listeners,timers,llamadas,mensajes }
}

test('Separar es síncrono, usa un nombre único y mueve una única sección sin credenciales', () => {
  const e = entorno(), traslados = [], g = crearVentanaAnalisis(e.host, (...args) => traslados.push(args))
  assert.equal(g.separar('reproductor'),true)
  assert.equal(e.llamadas[0][0],`https://comunicaciones.test${RUTA_VENTANA_ANALISIS}`)
  assert.equal(g.getSnapshot().modo,'reproductor'); assert.equal(g.conectado(),true)
  const nodo = g.getSnapshot().nodo
  assert.equal(g.separar('reproductor'),true); assert.equal(e.llamadas.length,1)
  g.separar('botonera'); assert.equal(g.getSnapshot().modo,'botonera'); assert.equal(g.getSnapshot().nodo,nodo)
  assert.equal(e.llamadas.length,1)
  assert.deepEqual(traslados,[ [null,'reproductor'],['reproductor','botonera'] ])
  const otro = crearVentanaAnalisis(e.host); otro.separar('botonera')
  assert.notEqual(e.llamadas[1][1],e.llamadas[0][1])
  otro.cerrar(); g.cerrar(); assert.equal(e.timers.size,0)
})

test('Popup bloqueado mantiene la sesión; reload y cierre reconectan/acoplan sin guardar nada', () => {
  const e = entorno(), g = crearVentanaAnalisis(e.host)
  const abrir=e.host.open;e.host.open=()=>null
  assert.equal(g.separar('reproductor'),false);assert.equal(g.getSnapshot().modo,null)
  assert.match(g.getSnapshot().aviso,/bloqueó/)
  assert.equal(g.getSnapshot().reintento,'reproductor')
  e.host.open=abrir;g.separar('reproductor')
  e.listeners.get('beforeunload')(); assert.equal(g.conectado(),false); assert.equal(g.getSnapshot().nodo,null)
  e.hija.document=documento();g.revisar()
  assert.equal(g.conectado(),true);assert.equal(g.getSnapshot().modo,'reproductor')
  e.hija.closed=true;g.revisar()
  assert.equal(g.getSnapshot().modo,null);assert.match(g.getSnapshot().aviso,/cerró/)
  assert.equal(e.timers.size,0)
})

test('Navegar la auxiliar fuera de la página desconecta; no permite apropiarse de otra sesión', () => {
  const e=entorno(),g=crearVentanaAnalisis(e.host)
  g.separar('botonera');e.hija.location.href='https://example.invalid';g.revisar()
  assert.equal(g.getSnapshot().modo,null);assert.equal(e.hija.closed,true)
})

test('Tiempo exacto proviene de la API activa y del partido correcto, nunca de un fallback a cero', () => {
  const base={player:{getCurrentTime:()=>125.9},iframe:{isConnected:true},listo:true,partidoId:'p',partidoListo:'p',conectado:true,pendiente:false}
  assert.equal(leerTiempoActivo(base),125)
  for(const parche of [{conectado:false},{pendiente:true},{partidoListo:'otro'},{listo:false},{iframe:{isConnected:false}},{iframe:{isConnected:true,ownerDocument:{defaultView:{closed:true}}}},{player:{getCurrentTime:()=>undefined}},{player:{getCurrentTime:()=>NaN}},{player:{getCurrentTime:()=>-1}}]) assert.throws(()=>leerTiempoActivo({...base,...parche}))
  assert.equal(leerTiempoActivo({...base,player:{getCurrentTime:()=>0}}),0)
})

test('Bloqueo compartido se adquiere antes del await, impide inserciones simultáneas y se libera', async () => {
  const bloqueo=crearBloqueoEtiquetado();let inserts=0,terminar
  const guardar=async()=>{if(!bloqueo.entrar())return;try{inserts++;await new Promise(resolve=>{terminar=resolve})}finally{bloqueo.salir()}}
  const a=guardar();await guardar();assert.equal(inserts,1);terminar();await a
  const b=guardar();assert.equal(inserts,2);terminar();await b
})

test('La API de YouTube se carga en la ventana propietaria, con una única carga por documento', async () => {
  let revision, script, intervalos=0
  const win={location:{protocol:'https:'},document:{querySelector:()=>null,createElement:()=>({}),head:{appendChild(n){script=n}}},setInterval(fn){revision=fn;intervalos++;return 1},clearInterval(){},setTimeout(){return 2},clearTimeout(){}}
  const promesa=cargarYouTubeEnVentana(win)
  assert.equal(cargarYouTubeEnVentana(win),promesa);assert.equal(intervalos,1)
  assert.equal(script.src,'https://www.youtube.com/iframe_api')
  win.YT={Player:function(){}};revision();assert.equal(await promesa,win.YT)
})

test('Nunca monta el video en el documento provisional; espera la página real y permite recarga', () => {
  const e=entorno(),g=crearVentanaAnalisis(e.host)
  e.hija.location.href='about:blank'
  g.separar('reproductor');assert.equal(g.getSnapshot().conectado,false);assert.equal(g.getSnapshot().nodo,null)
  e.hija.location.href=`https://comunicaciones.test${RUTA_VENTANA_ANALISIS}`
  g.revisar();assert.equal(g.conectado(),true)
  g.cerrar()
})

test('Apertura con excepción y fallo de foco tienen respuesta visible; se puede reintentar botonera', () => {
  const e=entorno(),g=crearVentanaAnalisis(e.host),open=e.host.open
  e.host.open=()=>{throw Error('Blocked')}
  assert.equal(g.separar('botonera'),false);assert.equal(g.getSnapshot().reintento,'botonera');assert.match(g.getSnapshot().aviso,/Reintentar/)
  e.host.open=open;assert.equal(g.separar(g.getSnapshot().reintento),true);assert.equal(g.getSnapshot().modo,'botonera')
  const revision=g.getSnapshot().revision
  e.hija.focus=()=>{throw Error('Focus blocked')}
  g.separar('botonera');assert.match(g.getSnapshot().aviso,/barra de tareas/);assert.equal(g.getSnapshot().revision,revision)
  g.cerrar()
})

test('Rechaza mensajes ajenos y exige la ruta del mismo origen, sin parámetros de sesión', () => {
  const e=entorno(),g=crearVentanaAnalisis(e.host)
  e.hija.location.href='about:blank';g.separar('botonera')
  e.hija.location.href=`https://comunicaciones.test${RUTA_VENTANA_ANALISIS}`
  const mensaje={canal:CANAL_VENTANA_ANALISIS,tipo:'lista'}
  e.mensajes.get('message')({origin:'https://otro.test',source:e.hija,data:mensaje});assert.equal(g.conectado(),false)
  e.mensajes.get('message')({origin:e.host.location.origin,source:{},data:mensaje});assert.equal(g.conectado(),false)
  e.mensajes.get('message')({origin:e.host.location.origin,source:e.hija,data:mensaje});assert.equal(g.conectado(),true)
  assert.equal(esVentanaAnalisis(`https://otro.test${RUTA_VENTANA_ANALISIS}`,e.host.location.origin),false)
  assert.equal(esVentanaAnalisis(`https://comunicaciones.test${RUTA_VENTANA_ANALISIS}?token=x`,e.host.location.origin),false)
  g.cerrar()
})

test('El error 153 no se confunde con restricciones de incrustación, y about:blank no carga la API', async () => {
  assert.match(mensajeErrorYouTube(153),/identificación válida/)
  assert.match(mensajeErrorYouTube(150),/propietario/)
  await assert.rejects(cargarYouTubeEnVentana({location:{protocol:'about:'}}),/HTTP real/)
})

test('Fallos de transporte o respuesta incompleta requieren revisar antes de reenviar', () => {
  assert.equal(registroInciertoTrasError({code:'42501'}),false)
  assert.equal(registroInciertoTrasError({code:'23503'}),false)
  for(const error of [new Error('Conexión perdida'),{code:'500'},{code:''},{code:'PGRST116'}]) assert.equal(registroInciertoTrasError(error),true)
})
