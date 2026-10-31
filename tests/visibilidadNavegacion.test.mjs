import test from 'node:test'
import assert from 'node:assert/strict'
import { VISIBILIDAD_SECCIONES, esSeccionVisible, filtrarSeccionesVisibles, resolverSeccionVisible } from '../src/config/visibilidadSecciones.js'

const ocultas = ['representantes', 'pensiones', 'seleccion', 'contratos', 'psicologia', 'nutricion']
test('Visibilidad: solo seis secciones ocultas, sin eliminar otras ni mutar los menús originales', () => {
  assert.deepEqual(Object.keys(VISIBILIDAD_SECCIONES).sort(), [...ocultas].sort())
  for (const id of ocultas) { assert.equal(esSeccionVisible(id), false); assert.equal(resolverSeccionVisible(id), 'inicio') }
  for (const id of ['inicio', 'plantel', 'medicos', 'analisis', 'video', 'partidos', 'fisico', 'evaluaciones', 'buscar', 'planificacion', 'asistencia']) {
    assert.equal(resolverSeccionVisible(id), id)
  }
  const originales = [{id:'nutricion'},{id:'medicos'},{id:'contratos'},{id:'plantel'}]
  assert.deepEqual(filtrarSeccionesVisibles(originales,'id'),[originales[1],originales[3]])
  assert.equal(originales.length,4)
})

test('Navegación real: menú por rol, Inicio, perfil, buscador y recuperación de sección abierta', async () => {
  const {createServer}=await import('vite')
  const {createElement}=await import('react')
  const {renderToStaticMarkup}=await import('react-dom/server')
  const prevWindow=Object.getOwnPropertyDescriptor(globalThis,'window')
  Object.defineProperty(globalThis,'window',{value:{location:new URL('https://comunicaciones.test/'),localStorage:{getItem(){return null}},atob:globalThis.atob,btoa:globalThis.btoa},configurable:true})
  const jugadora={id:'prueba',nombre:'Ana',apellido:'Prueba',categorias:{nombre:'Reserva'}}
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',plugins:[{
    name:'navegacion-sin-datos-reales',enforce:'pre',
    resolveId(s){if(s.endsWith('/supabaseClient'))return '\0navegacion-mock'},
    load(id){if(id==='\0navegacion-mock')return `export const supabase={from(){throw Error('No se permiten consultas reales');},storage:{from(){return {getPublicUrl(){return {data:{publicUrl:'https://example.invalid/escudo.png'}}}}}}};`},
    transform(code,id){
      if(id.endsWith('/InicioSection.jsx'))return code
        .replace('const [cargando, setCargando] = useState(true)','const [cargando, setCargando] = useState(false)')
        .replace('const [alertasRegistradas, setAlertas] = useState([])',`const [alertasRegistradas, setAlertas] = useState([{id:'oculta',seccion:'nutricion',texto:'ACCESO OCULTO',color:'#F2C230'},{id:'visible',seccion:'medicos',texto:'ACCESO MEDICO VISIBLE',color:'#F2C230'}])`)
      if(id.endsWith('/PerfilJugador.jsx'))return code.replace('const [jugador, setJugador] = useState(null)',`const [jugador, setJugador] = useState(${JSON.stringify(jugadora)})`)
      if(id.endsWith('/App.jsx'))return code
        .replace("const [seccionSolicitada, setSeccionSolicitada] = useState('inicio')","const [seccionSolicitada, setSeccionSolicitada] = useState(globalThis.__seccionAbiertaPrueba)")
        .replace('const [sesion, setSesion] = useState(undefined)',"const [sesion, setSesion] = useState({user:{email:'prueba@example.invalid'}})")
        .replace('const [perfil, setPerfil] = useState(undefined)',"const [perfil, setPerfil] = useState({rol:'coordinacion',nombre:'Prueba'})")
    }
  }]})
  const previoInicial=Object.getOwnPropertyDescriptor(globalThis,'__seccionAbiertaPrueba')
  try {
    const {ContextoApariencia}=await server.ssrLoadModule('/src/appearance/contextoApariencia.js')
    const render=(Componente,props={})=>renderToStaticMarkup(createElement(ContextoApariencia.Provider,{value:{preferencia:'oscuro',establecerPreferencia(){}}},createElement(Componente,props)))
    const {default:Layout}=await server.ssrLoadModule('/src/components/Layout.jsx')
    const etiquetas=['Representantes','Pensión','Selección','Contratos','Psicología','Nutrición']
    for(const rol of ['coordinacion','medico','preparador_fisico','tecnico']) {
      const html=render(Layout,{perfil:{rol},seccionActiva:'inicio'})
      const menu=html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/)[1]
      for(const nombre of etiquetas)assert.ok(!menu.includes(nombre),`${rol}: ${nombre}`)
      for(const nombre of ['Inicio','Evaluaciones'])assert.ok(menu.includes(nombre),`${rol}: ${nombre}`)
      const calendarios = (html.match(/aria-label="Calendario"/g) || []).length
      assert.equal(calendarios, rol === 'medico' ? 0 : 1, `${rol}: un único acceso a Calendario`)
      if(rol !== 'medico') assert.ok(menu.indexOf('aria-label="Partidos"') < menu.indexOf('aria-label="Calendario"') && menu.indexOf('aria-label="Calendario"') < menu.indexOf('aria-label="Entrenamientos"'), `${rol}: orden del menú`)
      if(rol==='coordinacion')for(const nombre of ['Análisis','Médicos','Plantel','Entrenamientos','Planificación semanal','Usuarios'])assert.ok(menu.includes(nombre),nombre)
      assert.match(html,/Abrir menú|Abrir men/)
    }
    const {default:Inicio}=await server.ssrLoadModule('/src/components/InicioSection.jsx')
    for(const rol of ['coordinacion','medico','preparador_fisico','tecnico']) {
      const html=render(Inicio,{perfil:{rol}})
      assert.doesNotMatch(html,/Alertas de nutrición|Área nutricional/)
      assert.doesNotMatch(html,/ACCESO OCULTO/)
      assert.match(html,/ACCESO MEDICO VISIBLE/)
      assert.match(html,/Resumen del equipo/)
    }
    const {default:Perfil}=await server.ssrLoadModule('/src/components/PerfilJugador.jsx')
    const perfil=render(Perfil,{perfil:{rol:'coordinacion'},jugadorId:'prueba'})
    assert.doesNotMatch(perfil,/Nutrición|Psicología/)
    assert.match(perfil,/Kinesiología \/ Médica/)
    assert.match(perfil,/Videoanálisis/)
    const {default:Buscador}=await server.ssrLoadModule('/src/components/BuscadorGlobal.jsx')
    assert.doesNotMatch(render(Buscador),/Nutrición|Psicología|Representantes|Pensión|Contratos|Selección/)
    const {default:App}=await server.ssrLoadModule('/src/App.jsx')
    for(const id of ocultas) {
      Object.defineProperty(globalThis,'__seccionAbiertaPrueba',{value:id,configurable:true})
      const html=render(App)
      assert.match(html,/<h1[^>]*>Inicio<\/h1>/,`${id} redirige a Inicio`)
    }
  } finally {
    await server.close()
    if(prevWindow)Object.defineProperty(globalThis,'window',prevWindow);else delete globalThis.window
    if(previoInicial)Object.defineProperty(globalThis,'__seccionAbiertaPrueba',previoInicial);else delete globalThis.__seccionAbiertaPrueba
  }
})
