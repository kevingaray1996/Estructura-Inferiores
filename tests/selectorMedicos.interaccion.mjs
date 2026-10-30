import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(),'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Selector Médicos: teclado, confirmación, tacto, límites de pantalla y temas sin menús nativos', async () => {
  const dom = new JSDOM('<div id="root"></div><button id="fuera">Fuera</button>',{url:'https://comunicaciones.test/'})
  const originales = new Map()
  for(const [nombre,valor] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})) {
    originales.set(nombre,Object.getOwnPropertyDescriptor(globalThis,nombre));Object.defineProperty(globalThis,nombre,{value:valor,writable:true,configurable:true})
  }
  const {act,createElement,useState}=await import('react')
  const {createRoot}=await import('react-dom/client')
  const {createServer}=await import('vite')
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
  const root=createRoot(document.getElementById('root'))
  const cambios=[]
  let deshabilitado=false
  const opciones=Array.from({length:30},(_,i)=>({value:String(i),label:i===1?'Árbol':`Zona ${String(i).padStart(2,'0')}`}))
  const click=async(el)=>act(()=>el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})))
  const tecla=async(key)=>act(()=>document.querySelector('[role=combobox]').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true})))
  try {
    const {default:Selector}=await server.ssrLoadModule('/src/components/SelectorMedicos.jsx')
    function Formulario(){const [valor,setValor]=useState('0');return createElement('fieldset',{disabled:deshabilitado},createElement(Selector,{label:'Zona corporal',value:valor,options:opciones,disabled:deshabilitado,onChange:v=>{cambios.push(v);setValor(v)}}))}
    await act(()=>root.render(createElement(Formulario)))
    const combo=document.querySelector('[role=combobox]')
    combo.getBoundingClientRect=()=>({top:550,bottom:594,left:12,width:296})
    Object.defineProperty(window,'innerWidth',{value:320,configurable:true})
    Object.defineProperty(window,'innerHeight',{value:640,configurable:true})
    assert.equal(document.querySelectorAll('select,option').length,0)
    await click(combo)
    let lista=document.querySelector('[role=listbox]')
    assert.equal(combo.getAttribute('aria-expanded'),'true')
    assert.equal(lista.parentElement,document.body,'Portal evita recortes y hereda variables de html')
    assert.ok(parseFloat(lista.style.maxHeight)<=280)
    assert.ok(parseFloat(lista.style.width)<=304)
    assert.ok(lista.style.bottom,'Abre hacia arriba cuando queda poco espacio debajo')
    assert.equal(document.querySelector('[aria-selected=true]').textContent,'Zona 00✓')
    const ultimo=lista.lastElementChild
    Object.defineProperties(ultimo,{offsetTop:{value:1276},offsetHeight:{value:44}})
    Object.defineProperty(lista,'clientHeight',{value:280})
    await tecla('End')
    assert.equal(lista.scrollTop,1040,'La navegación mantiene la opción activa dentro del scroll del menú')
    assert.equal(cambios.length,0,'Recorrer no cambia el campo')
    await tecla('Escape')
    assert.equal(cambios.length,0)
    assert.equal(document.querySelector('[role=listbox]'),null)
    await tecla('Home');await tecla('ArrowDown');await tecla('Enter')
    assert.deepEqual(cambios,['1'])
    assert.match(combo.textContent,/Árbol/)
    await tecla('z');await tecla('End');await tecla('Tab')
    assert.deepEqual(cambios,['1','29'])
    await click(combo)
    await act(()=>document.getElementById('fuera').dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true})))
    assert.equal(document.querySelector('[role=listbox]'),null)
    await click(combo)
    // Un toque elige una sola opción, sin escrituras ni gestos simulados de ratón.
    const opcion=document.querySelectorAll('[role=option]')[2]
    await act(()=>{const e=new dom.window.Event('pointerdown',{bubbles:true,cancelable:true});Object.defineProperty(e,'pointerType',{value:'touch'});opcion.dispatchEvent(e);assert.equal(e.defaultPrevented,false,'El tacto permite desplazar la lista')})
    await click(opcion)
    assert.deepEqual(cambios,['1','29','2'])
    assert.equal(document.activeElement,combo)
    await click(combo)
    document.documentElement.dataset.apariencia='claro'
    assert.equal(combo.getAttribute('aria-expanded'),'true','El tema no desmonta ni reinicia el selector')
    assert.match(combo.textContent,/Zona 02/)
    deshabilitado=true
    await act(()=>root.render(createElement(Formulario)))
    assert.equal(combo.disabled,true)
    assert.equal(document.querySelector('[role=listbox]'),null)
    await click(combo)
    assert.equal(document.querySelector('[role=listbox]'),null)
    const css=readFileSync(new URL('../src/components/selectorMedicos.css',import.meta.url),'utf8')
    assert.match(css,/background: var\(--ui-control-fondo\)/)
    assert.match(css,/color: var\(--ui-control-texto\)/)
    assert.match(css,/overflow-y: auto/)
    assert.match(css,/overscroll-behavior: contain/)
    assert.match(css,/background: #F2C230; color: #111111/)
    assert.doesNotMatch(css,/!important/)
  } finally {
    await act(()=>root.unmount());await server.close();dom.window.close()
    for(const [nombre,descriptor] of originales){if(descriptor)Object.defineProperty(globalThis,nombre,descriptor);else delete globalThis[nombre]}
  }
})
