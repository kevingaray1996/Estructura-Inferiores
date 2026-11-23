import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const {JSDOM}=await import(pathToFileURL(join(tmpdir(),'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)
test('Análisis: Kevin/Gastón ven acceso y editor sin RPC; cero escrituras, otras cuentas/roles excluidos',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'}),previos=new Map()
 const poner=(n,v)=>{previos.set(n,Object.getOwnPropertyDescriptor(globalThis,n));Object.defineProperty(globalThis,n,{value:v,configurable:true,writable:true})}
 for(const n of ['window','document','HTMLElement','Event','MouseEvent'])poner(n,dom.window[n])
 poner('IS_REACT_ACT_ENVIRONMENT',true)
 let id='f7562d52-a16a-48b5-95a0-efbcc70080d3',rol='coordinacion',rpcError={code:'PGRST202'},rpcValor=true,escrituras=0,acceso
 const db={auth:{getUser:async()=>({data:{user:{id,email:'fixture@invalid.test'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async()=>rpcError?{error:rpcError}:{data:rpcValor},from(tabla){const q={select(){return q},eq(){return q},in(){return q},order(){return q},range(){return q},maybeSingle:async()=>({data:{email:'fixture@invalid.test',nombre:'Cuenta ficticia',rol}}),insert(){escrituras++;throw Error('Escritura inesperada')},update(){escrituras++;throw Error('Escritura inesperada')},delete(){escrituras++;throw Error('Escritura inesperada')},then(ok,mal){return Promise.resolve({data:tabla==='analisis_partidos'?[{id:'a',rival:'Rival sintético',fecha:'2026-01-02',categoria_id:'cat',video_url:null}]:[]}).then(ok,mal)}};return q}}
 poner('__dbPendienteAnalisis',db)
 const {act,createElement:h}=await import('react'),{createRoot}=await import('react-dom/client'),{crearServidorVitePrueba}=await import('./helpers/servidorVite.mjs')
 const vite=await crearServidorVitePrueba({server:{middlewareMode:true,hmr:false},appType:'custom',plugins:[{name:'pendiente-analisis-sin-red',enforce:'pre',resolveId(s){if(s.endsWith('/supabaseClient'))return '\0db-pendiente'},load(id){if(id==='\0db-pendiente')return 'export const supabase=globalThis.__dbPendienteAnalisis'}}]})
 const root=createRoot(document.getElementById('root'))
 try{
 const Apariencia=(await vite.ssrLoadModule('/src/appearance/ProveedorApariencia.jsx')).default
 const useAcceso=(await vite.ssrLoadModule('/src/hooks/useAdministracionAnalisis.js')).default
 const Layout=(await vite.ssrLoadModule('/src/components/Layout.jsx')).default
 const Analisis=(await vite.ssrLoadModule('/src/components/AnalisisSection.jsx')).default
 function Ejemplo(){acceso=useAcceso({user:{id},access_token:'sintetico'},rol);return h(Layout,{perfil:{rol,nombre:'Cuenta ficticia'},seccionActiva:'analisis',onCambiarSeccion(){},puedeAdministrarAnalisis:acceso.puedeAbrir,puedeConsultarAnalisis:acceso.puedeConsultar},acceso.puedeAbrir?h(Analisis,{key:id,escrituraAutorizada:acceso.puedeEscribir,estadoAutorizacion:acceso.estado}):acceso.puedeConsultar?h(Analisis,{key:'consulta-'+id,modoConsulta:true,escrituraAutorizada:false}):h('p',null,'Acceso restringido'))}
 let version=0
 const montar=()=>act(async()=>{root.render(h(Apariencia,null,h(Ejemplo,{key:++version})));await new Promise(r=>setTimeout(r,20))})
 for(const cuenta of ['f7562d52-a16a-48b5-95a0-efbcc70080d3','b2c65c50-8772-45a4-b2e0-c0e53c66253b']){
 id=cuenta;rpcError={code:'PGRST202'};await montar()
 assert.equal(acceso.puedeAbrir,true);assert.equal(acceso.puedeEscribir,false);assert.equal(acceso.estado,'pendiente_migracion')
 assert.ok(document.querySelector('nav button[aria-label="Análisis"]'))
 assert.match(document.body.textContent,/falta activar la función de autorización/);assert.match(document.body.textContent,/Rival sintético/)
 const nuevo=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Nuevo análisis'));assert.ok(nuevo)
 await act(()=>nuevo.click())
 for(const form of document.querySelectorAll('form')){
 assert.ok(form.querySelector('[type="submit"]').disabled)
 await act(()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
 }
 assert.equal(escrituras,0)
 }
 rpcError={code:'42883'};await montar();assert.equal(acceso.puedeAbrir,true);assert.equal(acceso.estado,'pendiente_migracion');assert.equal(acceso.puedeEscribir,false)
 rpcError={message:'sin conexión'};await montar();assert.equal(acceso.puedeAbrir,true);assert.equal(acceso.puedeEscribir,false);assert.match(document.body.textContent,/Escrituras pausadas/)
 rpcError=null;rpcValor=false;await montar();assert.equal(acceso.puedeAbrir,false);assert.doesNotMatch(document.body.textContent,/Nuevo análisis/)
 rpcError={code:'PGRST202'};id='otra-cuenta-coordinacion';await montar();assert.equal(acceso.puedeAbrir,false);assert.equal(acceso.puedeConsultar,true)
 id='f7562d52-a16a-48b5-95a0-efbcc70080d3';rol='tecnico';await montar();assert.equal(acceso.puedeAbrir,false);assert.equal(acceso.puedeConsultar,true)
 // Cuerpo técnico: entra a Análisis en modo consulta, sin botonera ni nada que guarde.
 assert.ok(document.querySelector('nav button[aria-label="Análisis"]'));assert.match(document.body.textContent,/Modo consulta/);assert.match(document.body.textContent,/Rival sintético/)
 assert.doesNotMatch(document.body.textContent,/Nuevo análisis|Eliminar análisis|Escrituras pausadas/)
 rol='medico';await montar();assert.equal(acceso.puedeAbrir,false);assert.equal(acceso.puedeConsultar,false);assert.match(document.body.textContent,/Acceso restringido/)
 rol='coordinacion';rpcError=null;rpcValor=true;await montar();assert.equal(acceso.puedeAbrir,true);assert.equal(acceso.puedeEscribir,true);assert.match(document.body.textContent,/Gestión habilitada/)
 assert.equal(escrituras,0)
 const app=readFileSync('src/App.jsx','utf8');assert.match(app,/puedeAdministrarAnalisis=\{accesoAnalisis.puedeAbrir\}/);assert.match(app,/<AnalisisSection key=\{usuarioIdSesion\}/)
 }finally{await act(()=>root.unmount());await vite.close();dom.window.close();for(const [n,d]of previos){if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n]}}
})
