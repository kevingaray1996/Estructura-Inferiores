import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(),'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Mapa: SVG, formulario, guardado, historial, resolución, conflictos y acceso sin producción', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://comunicaciones.test/' })
  const previos = new Map()
  const global = (nombre, valor) => { previos.set(nombre, Object.getOwnPropertyDescriptor(globalThis,nombre)); Object.defineProperty(globalThis,nombre,{value:valor,writable:true,configurable:true}) }
  for (const nombre of ['window','document','HTMLElement','Event','MouseEvent','KeyboardEvent']) global(nombre,dom.window[nombre])
  global('IS_REACT_ACT_ENVIRONMENT',true)
  const { act, createElement } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { createServer } = await import('vite')
  const j = { id:'j',nombre:'Ana',apellido:'Prueba',categoria_id:'c',categorias:{nombre:'Reserva'},estado:'disponible' }
  const fichas = [], escrituras = [], lecturas = []
  let conflicto = false, falloLectura = false
  global('__medicosMock', { from(tabla) {
    lecturas.push(tabla)
    const filtros = []; let operacion = null, datos = null
    const q = { select(){return q},limit(){return q},order(){return q},eq(k,v){filtros.push([k,v]);return q},insert(d){operacion='insert';datos=d;return q},update(d){operacion='update';datos=d;return q},
      then(resolve,reject) {
        if (operacion) {
          assert.equal(tabla,'fichas_medicas','Nunca modificar disponibilidad de jugadores desde seguimientos')
          escrituras.push({operacion,datos:structuredClone(datos),filtros:[...filtros]})
          if (conflicto) return Promise.resolve({data:[],error:null}).then(resolve,reject)
          if (operacion==='insert') fichas.push({...datos,id:'f1',revision:0})
          else { const f=fichas.find(f=>filtros.every(([k,v])=>f[k]===v)); if(f)Object.assign(f,datos,{revision:f.revision+1}) }
          return Promise.resolve({data:[{id:'f1'}],error:null}).then(resolve,reject)
        }
        const rows=tabla==='jugadores'?[j]:tabla==='categorias'?[{id:'c',nombre:'Reserva'}]:fichas
        return Promise.resolve({data:falloLectura && tabla==='fichas_medicas'?null:structuredClone(rows.filter(f=>filtros.every(([k,v])=>f[k]===v))),error:falloLectura && tabla==='fichas_medicas'?{code:'42501'}:null}).then(resolve,reject)
      }
    }; return q
  } })
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',plugins:[{name:'medicos-backend-simulado',enforce:'pre',resolveId(s){if(s.endsWith('/supabaseClient'))return '\0medicos-mock'},load(id){if(id==='\0medicos-mock')return 'export const supabase=globalThis.__medicosMock;'}}]})
  const root=createRoot(document.getElementById('root'))
  const texto=()=>document.body.textContent
  const click=async(el)=>{assert.ok(el);assert.equal(!!el.disabled,false);await act(()=>el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})))}
  const boton=t=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(t))
  const cambiar=async(el,label)=>{await click(el); await click([...document.querySelectorAll('[role=option]')].find(o=>o.querySelector('span').textContent===label))}
  try {
    const {default:Medicos}=await server.ssrLoadModule('/src/components/MedicosSection.jsx')
    const props={perfil:{rol:'preparador_fisico'},jugadorInicialId:'j',onConsumirJugadorInicial(){}}
    await act(async()=>root.render(createElement(Medicos,props)))
    assert.equal(document.querySelectorAll('svg').length,2)
    const [frente,espalda]=document.querySelectorAll('svg')
    const derecha=s=>[...s.querySelectorAll('path[role=button]')].find(p=>p.getAttribute('aria-label').startsWith('Rodillas · Derecha'))
    const izquierda=s=>[...s.querySelectorAll('path[role=button]')].find(p=>p.getAttribute('aria-label').startsWith('Rodillas · Izquierda'))
    assert.equal(derecha(frente).getAttribute('transform'),null)
    assert.match(derecha(espalda).getAttribute('transform'),/scale\(-1 1\)/)
    assert.match(izquierda(frente).getAttribute('transform'),/scale\(-1 1\)/)
    assert.equal(izquierda(espalda).getAttribute('transform'),null)
    await act(()=>derecha(frente).dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})))
    assert.match(texto(),/Situación informada/)
    assert.match(document.querySelectorAll('fieldset [role=combobox]')[0].textContent,/Rodillas/)
    assert.match(document.querySelectorAll('fieldset [role=combobox]')[1].textContent,/Derecha/)
    await click(boton('Guardar registro'))
    assert.equal(escrituras.length,1)
    assert.equal(fichas[0].tipo_incidencia,'molestia')
    assert.equal(fichas[0].recuperado,false)
    assert.equal(derecha(frente).getAttribute('fill'),'#F2C230')
    await click(document.querySelector('button[aria-label^="Editar registro"]'))
    await cambiar(document.querySelectorAll('fieldset [role=combobox]')[2],'Lesión informada')
    await click(boton('Guardar cambios'))
    assert.deepEqual(escrituras[1].filtros,[['id','f1'],['revision',0]])
    assert.equal(derecha(frente).getAttribute('fill'),'#DC2626')
    await click(document.querySelector('button[aria-label^="Editar registro"]'))
    // Resolver sin fecha se rechaza y no escribe.
    await cambiar(document.querySelectorAll('fieldset [role=combobox]')[3],'Resuelta')
    await click(boton('Guardar cambios'))
    assert.match(document.querySelector('[role=alert]').textContent,/fecha de resolución/)
    assert.equal(escrituras.length,2)
    // Conflicto conserva el formulario y solicita releer; nunca pisa el dato actual.
    await cambiar(document.querySelectorAll('fieldset [role=combobox]')[3],'Derivada a evaluación profesional')
    conflicto=true
    await click(boton('Guardar cambios'))
    assert.match(document.querySelector('[role=alert]').textContent,/historial fue actualizado/)
    assert.equal(fichas[0].estado_seguimiento,'seguimiento')
    assert.ok(boton('Guardar cambios'))
    conflicto=false
    await click(boton('Cancelar'))
    await click(document.querySelector('button[aria-label^="Editar registro"]'))
    assert.match(document.querySelectorAll('fieldset [role=combobox]')[3].textContent,/En seguimiento/)
    // El cambio de tema no desmonta el formulario.
    document.documentElement.dataset.apariencia='claro'
    assert.match(document.querySelectorAll('fieldset [role=combobox]')[2].textContent,/Lesión informada/)
    await cambiar(document.querySelectorAll('fieldset [role=combobox]')[3],'Resuelta')
    const fechaResolucion=document.querySelector('fieldset fieldset input[type=date]')
    const fechaInicio=[...document.querySelectorAll('input[type=date]')].find(el=>el!==fechaResolucion).value
    await act(()=>{
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(fechaResolucion,fechaInicio)
      fechaResolucion.dispatchEvent(new dom.window.Event('input',{bubbles:true}))
    })
    await click(boton('Guardar cambios'))
    assert.equal(fichas[0].recuperado,true)
    assert.equal(fichas[0].fecha_resolucion,fechaInicio)
    assert.equal(derecha(document.querySelector('svg')).getAttribute('fill'),'#A78BFA')
    assert.match(texto(),/Resuelta el/)
    assert.equal(fichas.length,1,'Resolver nunca elimina el registro')
    await click(boton('Ampliar espalda'))
    assert.equal(document.querySelectorAll('svg').length,1)
    assert.equal(document.querySelector('svg').getAttribute('aria-label'),'Vista de espalda')
    await click(boton('Ver ambas'))
    assert.equal(document.querySelectorAll('svg').length,2)
    const antes=lecturas.length
    await act(()=>root.render(createElement(Medicos,{perfil:{rol:'tecnico'}})))
    assert.match(texto(),/No tenés acceso/)
    assert.equal(lecturas.length,antes)
    assert.equal(document.querySelectorAll('svg').length,0)
    falloLectura=true
    await act(()=>root.render(createElement(Medicos,props)))
    assert.match(texto(),/No se pudieron cargar/)
    assert.doesNotMatch(texto(),/Sin registros médicos todavía/)
    assert.equal(escrituras.length,4)
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close()
    for(const [nombre,descriptor] of previos) {if(descriptor)Object.defineProperty(globalThis,nombre,descriptor);else delete globalThis[nombre]}
  }
})
