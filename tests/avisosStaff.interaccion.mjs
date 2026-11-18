import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Sección Avisos del staff y botón «Avisar convocatoria», con un cliente de Supabase simulado.
const { JSDOM } = await import(pathToFileURL(join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

const PRIMERA = '10000000-0000-4000-8000-000000000001'
const RESERVA = '10000000-0000-4000-8000-000000000002'
const ANA = '30000000-0000-4000-8000-000000000001'
const BEA = '30000000-0000-4000-8000-000000000002'
const PARTIDO = '50000000-0000-4000-8000-000000000001'
const PAUSA = '70000000-0000-4000-8000-000000000001'

function crearCliente() {
  const llamadas = []
  const estado = { errores: {} }
  const panel = {
    categorias: [
      { categoria_id: PRIMERA, nombre: 'Primera', activo: true, dias: [3, 4, 5], hora_wellness: '07:10', hora_rpe: '10:15', jugadoras: 2, con_avisos: 1, hoy: { aplica: true, motivo: 'dia_de_entrenamiento' } },
      { categoria_id: RESERVA, nombre: 'Reserva', activo: true, dias: [3, 4, 5], hora_wellness: '07:10', hora_rpe: '10:15', jugadoras: 0, con_avisos: 0, hoy: { aplica: false, motivo: 'pausa' } },
    ],
    pausas: [{ id: PAUSA, categoria_id: null, categoria: null, desde: '2026-12-24', hasta: '2026-12-26', motivo: 'Navidad' }],
  }
  const cliente = {
    from(tabla) {
      llamadas.push({ nombre: 'from', tabla })
      const datos = tabla === 'categorias'
        ? [{ id: PRIMERA, nombre: 'Primera', orden: 1 }, { id: RESERVA, nombre: 'Reserva', orden: 2 }]
        : [{ id: ANA, nombre: 'Ana', apellido: 'Alvarez', categoria_id: PRIMERA }, { id: BEA, nombre: 'Bea', apellido: 'Benitez', categoria_id: PRIMERA }]
      const q = new Proxy({}, { get(_, p) { if (p === 'then') return ok => ok({ data: datos, error: null }); return () => q } })
      return q
    },
    async rpc(nombre, args) {
      llamadas.push({ nombre, args })
      if (estado.errores[nombre]) return { data: null, error: estado.errores[nombre] }
      if (nombre === 'avisos_panel') return { data: panel, error: null }
      if (nombre === 'avisos_jugadoras') return { data: [
        { jugador_id: ANA, nombre: 'Ana', apellido: 'Alvarez', cuenta: 'activa', dispositivos: 2, tipos: ['android', 'iphone'], preferencias: { wellness: true, rpe: true, entrenamiento: true, convocatoria: true, mensajes: false } },
        { jugador_id: BEA, nombre: 'Bea', apellido: 'Benitez', cuenta: null, dispositivos: 0, tipos: [], preferencias: {} },
      ], error: null }
      if (nombre === 'avisos_historial') return { data: [
        { id: 'e1', tipo: 'manual', categoria: 'Primera', fecha: '2026-11-18', texto: 'Mañana traer pechera', remitente: 'Laura', estado: 'enviado', destinatarias: 2, entregados: 1, fallidos: 0, sin_avisos: 1, creado_at: '2026-11-18T12:00:00Z' },
        { id: 'e2', tipo: 'wellness', categoria: 'Primera', fecha: '2026-11-18', texto: null, remitente: 'Automático', estado: 'enviado', destinatarias: 2, entregados: 1, fallidos: 0, sin_avisos: 1, creado_at: '2026-11-18T10:10:00Z' },
      ], error: null }
      if (nombre === 'avisos_mandar' || nombre === 'avisos_crear_pausa' || nombre === 'avisos_avisar_convocatoria') return { data: 'nuevo-id', error: null }
      return { data: null, error: null }
    },
  }
  return { cliente, llamadas, estado }
}

async function montar(f, ruta, props) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid/' })
  const previos = new Map()
  const poner = (n, v) => { previos.set(n, Object.getOwnPropertyDescriptor(globalThis, n)); Object.defineProperty(globalThis, n, { value: v, configurable: true, writable: true }) }
  for (const n of ['window', 'document', 'HTMLElement', 'Event', 'FocusEvent', 'MouseEvent', 'KeyboardEvent', 'navigator']) poner(n, dom.window[n])
  poner('IS_REACT_ACT_ENVIRONMENT', true); poner('__clienteAvisos', f.cliente)
  const { act, createElement: h } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const vite = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'avisos-sin-servicios', enforce: 'pre', resolveId(s) { if (s.endsWith('/supabaseClient')) return '\0avisos-cliente' }, load(id) { if (id === '\0avisos-cliente') return 'export const supabase=globalThis.__clienteAvisos' } }] })
  const root = createRoot(document.getElementById('root'))
  const pausa = () => new Promise(r => setTimeout(r, 25))
  const restaurar = () => { for (const [n, d] of previos) { if (d) Object.defineProperty(globalThis, n, d); else delete globalThis[n] } }
  try {
    const C = (await vite.ssrLoadModule(ruta)).default
    await act(async () => { root.render(h(C, props)); await pausa() })
    await act(pausa)
  } catch (error) {
    await act(async () => root.unmount()); await vite.close(); restaurar(); throw error
  }
  const valor = (el, v, ctor) => Object.getOwnPropertyDescriptor(ctor.prototype, 'value').set.call(el, v)
  return {
    texto: () => document.body.textContent,
    boton: (etiqueta, dentro = document) => [...dentro.querySelectorAll('button:not([role="tab"])')].find(b => b.textContent.trim() === etiqueta && !b.closest('[hidden]')),
    pestana: (etiqueta) => [...document.querySelectorAll('[role="tab"]')].find(b => b.textContent.trim() === etiqueta),
    campo: (etiqueta) => { const l = [...document.querySelectorAll('label')].find(x => x.textContent.trim().startsWith(etiqueta)); return l?.control || document.getElementById(l?.htmlFor) || l?.querySelector('input,select,textarea') },
    clic: async el => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await pausa() }); await act(pausa) },
    escribir: async (el, v) => {
      await act(async () => {
        const ctor = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : el.tagName === 'SELECT' ? window.HTMLSelectElement : window.HTMLInputElement
        valor(el, v, ctor)
        el.dispatchEvent(new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
        await pausa()
      })
    },
    async cerrar() { await act(async () => root.unmount()); await vite.close(); restaurar() },
  }
}

test('mensajeErrorAvisos: cada código de la base con un texto claro', async () => {
  const { mensajeErrorAvisos } = await import('../src/utils/avisos.js')
  assert.equal(mensajeErrorAvisos({ code: 'P0001', message: 'limite_remitente' }), 'Ya mandaste 5 avisos hoy. Probá mañana.')
  assert.equal(mensajeErrorAvisos({ code: 'P0001', message: 'limite_categoria' }), 'Esta categoría ya recibió 10 avisos hoy. Probá mañana.')
  assert.equal(mensajeErrorAvisos({ code: 'P0001', message: 'limite_partido' }), 'Ya se avisó 3 veces esta convocatoria hoy.')
  assert.equal(mensajeErrorAvisos({ code: 'P0001', message: 'duplicado' }), 'Ese aviso ya se mandó hace un momento.')
  assert.equal(mensajeErrorAvisos({ code: '22023', message: 'texto_invalido' }), 'El mensaje tiene que tener entre 3 y 140 caracteres.')
  assert.equal(mensajeErrorAvisos({ code: '22023', message: 'sin_convocadas' }), 'Guardá la convocatoria con al menos una jugadora antes de avisar.')
  assert.equal(mensajeErrorAvisos({ code: '42501', message: 'sin_permiso' }), 'No tenés permiso para esto.')
  assert.equal(mensajeErrorAvisos({ code: 'XX', message: 'otra cosa' }), 'No se pudo guardar. Revisá la conexión y probá de nuevo.')
  assert.equal(mensajeErrorAvisos({ code: 'XX', message: 'otra cosa' }, 'guardar'), 'No se pudo guardar. Revisá la conexión y probá de nuevo.')
  assert.equal(mensajeErrorAvisos({ code: 'XX', message: 'otra cosa' }, 'mandar'), 'No se pudo mandar. Revisá la conexión y probá de nuevo.')
  assert.equal(mensajeErrorAvisos({ code: 'P0001', message: 'limite_remitente' }, 'mandar'), 'Ya mandaste 5 avisos hoy. Probá mañana.')
})

test('IconoNavegacion: Avisos tiene su campana (no la casa de Inicio)', async () => {
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const { createElement: h } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const vite = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const Icono = (await vite.ssrLoadModule('/src/components/IconoNavegacion.jsx')).default
    const trazo = nombre => renderToStaticMarkup(h(Icono, { nombre })).match(/ d="([^"]+)"/)[1]
    assert.notEqual(trazo('avisos'), trazo('inicio'))
    assert.match(trazo('avisos'), /^M6 8a6 6 0 0 1 12 0/)
    assert.equal(trazo('no-existe'), trazo('inicio'))
  } finally { await vite.close() }
})

test('Técnico: solo Mandar aviso e Historial, con su categoría fija; manda con el texto limpio y ve los límites', async () => {
  const f = crearCliente()
  const a = await montar(f, '/src/components/avisos/AvisosSection.jsx', { perfil: { rol: 'tecnico', categoria_id: PRIMERA } })
  try {
    assert.deepEqual([...document.querySelectorAll('[role="tab"]')].map(t => t.textContent.trim()), ['Mandar aviso', 'Historial'])
    assert.equal(document.querySelector('select'), null, 'la categoría del técnico es fija')
    assert.match(a.texto(), /No pongas datos personales ni de salud/)
    const mensaje = a.campo('Mensaje')
    await a.escribir(mensaje, '  Mañana traer pechera  ')
    assert.match(a.texto(), /20 \/ 140/)
    await a.clic(a.boton('Mandar aviso'))
    assert.ok(!f.llamadas.some(l => l.nombre === 'avisos_mandar'), 'primero pide confirmar')
    assert.match(a.texto(), /Va a todo el plantel de Primera \(2 jugadoras\)/)
    // El foco va al botón de confirmar; Cancelar lo devuelve al botón que abrió la confirmación.
    assert.equal(document.activeElement, a.boton('Mandar aviso'))
    assert.ok(document.activeElement.closest('.av-confirmar'))
    await a.clic(a.boton('Cancelar'))
    assert.equal(document.activeElement, a.boton('Mandar aviso'))
    assert.equal(document.activeElement.closest('.av-confirmar'), null)
    await a.clic(a.boton('Mandar aviso'))
    await a.clic(a.boton('Mandar aviso'))
    assert.deepEqual(f.llamadas.find(l => l.nombre === 'avisos_mandar').args, { p_categoria_id: PRIMERA, p_jugadoras: null, p_texto: 'Mañana traer pechera' })
    assert.match(a.texto(), /Aviso en camino/)

    f.estado.errores.avisos_mandar = { code: 'P0001', message: 'limite_remitente' }
    await a.escribir(a.campo('Mensaje'), 'Otro aviso')
    await a.clic(a.boton('Mandar aviso'))
    await a.clic(a.boton('Mandar aviso'))
    assert.match(a.texto(), /Ya mandaste 5 avisos hoy\. Probá mañana\./)
    // Sin conexión: el texto genérico dice «mandar», no «guardar».
    f.estado.errores.avisos_mandar = { message: 'Failed to fetch' }
    await a.escribir(a.campo('Mensaje'), 'Otro aviso más')
    await a.clic(a.boton('Mandar aviso'))
    await a.clic(a.boton('Mandar aviso'))
    assert.match(a.texto(), /No se pudo mandar\. Revisá la conexión y probá de nuevo\./)

    await a.clic(a.pestana('Historial'))
    assert.deepEqual(f.llamadas.filter(l => l.nombre === 'avisos_historial').at(-1).args, { p_categoria_id: PRIMERA, p_limite: 50 })
    assert.match(a.texto(), /Mañana traer pechera/)
    assert.match(a.texto(), /1 de 2/)
    assert.match(a.texto(), /«Entregado» quiere decir que lo aceptó el servicio del celular, no que lo leyó/)
    assert.ok(!f.llamadas.some(l => ['avisos_panel', 'avisos_jugadoras'].includes(l.nombre)), 'el técnico no pide el panel de coordinación')
  } finally { await a.cerrar() }
})

test('Coordinación: elegir jugadoras, horarios con días ISO, pausas con confirmación y quiénes tienen avisos', async () => {
  const f = crearCliente()
  const a = await montar(f, '/src/components/avisos/AvisosSection.jsx', { perfil: { rol: 'coordinacion' } })
  try {
    assert.deepEqual([...document.querySelectorAll('[role="tab"]')].map(t => t.textContent.trim()), ['Mandar aviso', 'Horarios', 'Pausas', 'Jugadoras', 'Historial'])
    // Mandar a jugadoras elegidas.
    await a.clic([...document.querySelectorAll('input[type="radio"]')].find(r => r.closest('label').textContent.includes('Jugadoras elegidas')))
    await a.clic([...document.querySelectorAll('label')].find(l => l.textContent.includes('Alvarez, Ana')).querySelector('input'))
    await a.escribir(a.campo('Mensaje'), 'Ana, pasá por coordinación')
    await a.clic(a.boton('Mandar aviso'))
    assert.match(a.texto(), /Va a 1 jugadora de Primera/)
    await a.clic(a.boton('Mandar aviso'))
    assert.deepEqual(f.llamadas.find(l => l.nombre === 'avisos_mandar').args, { p_categoria_id: PRIMERA, p_jugadoras: [ANA], p_texto: 'Ana, pasá por coordinación' })

    // Horarios: el estado de hoy, y guardar con sábado sumado y otra hora de Wellness.
    await a.clic(a.pestana('Horarios'))
    assert.match(a.texto(), /Hoy salen: día de entrenamiento/)
    assert.match(a.texto(), /Hoy no salen: pausa/)
    const tarjeta = [...document.querySelectorAll('[data-categoria-avisos]')].find(el => el.textContent.includes('Primera'))
    await a.clic([...tarjeta.querySelectorAll('label')].find(l => l.textContent.trim() === 'Sáb').querySelector('input'))
    await a.escribir([...tarjeta.querySelectorAll('label')].find(l => l.textContent.includes('Wellness')).querySelector('input'), '07:30')
    await a.clic(a.boton('Guardar horarios', tarjeta))
    assert.deepEqual(f.llamadas.find(l => l.nombre === 'avisos_guardar_config').args,
      { p_categoria_id: PRIMERA, p_activo: true, p_dias: [3, 4, 5, 6], p_hora_wellness: '07:30', p_hora_rpe: '10:15' })

    // Pausas: alta para todas y quitar con confirmación por motivo.
    await a.clic(a.pestana('Pausas'))
    assert.match(a.texto(), /Navidad/)
    await a.escribir(a.campo('Desde'), '2026-12-31')
    await a.escribir(a.campo('Hasta'), '2027-01-02')
    await a.escribir(a.campo('Motivo'), 'Año nuevo')
    await a.clic(a.boton('Crear pausa'))
    assert.deepEqual(f.llamadas.find(l => l.nombre === 'avisos_crear_pausa').args,
      { p_categoria_id: null, p_desde: '2026-12-31', p_hasta: '2027-01-02', p_motivo: 'Año nuevo' })
    await a.clic(a.boton('Quitar pausa'))
    assert.ok(!f.llamadas.some(l => l.nombre === 'avisos_borrar_pausa'), 'primero pide confirmar')
    assert.match(a.texto(), /Quitar la pausa «Navidad»/)
    assert.equal(document.activeElement, a.boton('Quitar pausa'))
    assert.ok(document.activeElement.closest('.av-confirmar'))
    await a.clic(a.boton('Cancelar'))
    assert.equal(document.activeElement, a.boton('Quitar pausa'))
    assert.equal(document.activeElement.closest('.av-confirmar'), null)
    await a.clic(a.boton('Quitar pausa'))
    await a.clic(a.boton('Quitar pausa'))
    assert.deepEqual(f.llamadas.find(l => l.nombre === 'avisos_borrar_pausa').args, { p_id: PAUSA })

    // Jugadoras: quién tiene los avisos activados.
    await a.clic(a.pestana('Jugadoras'))
    assert.match(a.texto(), /Avisos activos en 2 celulares/)
    assert.match(a.texto(), /Sin cuenta/)
  } finally { await a.cerrar() }
})

test('Avisar convocatoria: deshabilitado con cambios sin guardar, confirma con la cantidad y muestra el resultado', async () => {
  const f = crearCliente()
  let a = await montar(f, '/src/components/avisos/AvisarConvocatoria.jsx', { partidoId: PARTIDO, convocadasGuardadas: 16, hayCambios: true })
  try {
    assert.equal(a.boton('Avisar convocatoria').disabled, true)
    assert.match(a.texto(), /Guardá la convocatoria antes de avisar/)
  } finally { await a.cerrar() }

  // Sin rival ni fecha: el texto de siempre.
  a = await montar(f, '/src/components/avisos/AvisarConvocatoria.jsx', { partidoId: PARTIDO, convocadasGuardadas: 16, hayCambios: false })
  try {
    await a.clic(a.boton('Avisar convocatoria'))
    assert.match(a.texto(), /Avisar a las 16 convocadas\. Les llega/)
  } finally { await a.cerrar() }

  // PF (o cualquiera que no sea coordinación ni técnico): no ve el botón.
  a = await montar(f, '/src/components/avisos/AvisarConvocatoria.jsx', { partidoId: PARTIDO, convocadasGuardadas: 16, hayCambios: false, puedeAvisar: false })
  try {
    assert.equal(a.boton('Avisar convocatoria'), undefined)
    assert.doesNotMatch(a.texto(), /Avisar|Guardá/)
  } finally { await a.cerrar() }

  a = await montar(f, '/src/components/avisos/AvisarConvocatoria.jsx', { partidoId: PARTIDO, convocadasGuardadas: 16, hayCambios: false, rival: 'Boca', fecha: '2026-11-22' })
  try {
    await a.clic(a.boton('Avisar convocatoria'))
    assert.match(a.texto(), /Avisar a las 16 convocadas del partido vs Boca · 22\/11\./)
    assert.equal(document.activeElement, a.boton('Avisar convocatoria'))
    assert.ok(document.activeElement.closest('.av-confirmar'))
    await a.clic(a.boton('Cancelar'))
    assert.equal(document.activeElement, a.boton('Avisar convocatoria'))
    assert.equal(document.activeElement.closest('.av-confirmar'), null)
    await a.clic(a.boton('Avisar convocatoria'))
    assert.ok(!f.llamadas.some(l => l.nombre === 'avisos_avisar_convocatoria'))
    await a.clic(a.boton('Avisar convocatoria'))
    assert.deepEqual(f.llamadas.find(l => l.nombre === 'avisos_avisar_convocatoria').args, { p_partido_id: PARTIDO })
    assert.match(a.texto(), /Aviso en camino a 16 convocadas/)
    f.estado.errores.avisos_avisar_convocatoria = { code: 'P0001', message: 'limite_partido' }
    await a.clic(a.boton('Avisar convocatoria'))
    await a.clic(a.boton('Avisar convocatoria'))
    assert.match(a.texto(), /Ya se avisó 3 veces esta convocatoria hoy/)
    f.estado.errores.avisos_avisar_convocatoria = { message: 'Failed to fetch' }
    await a.clic(a.boton('Avisar convocatoria'))
    await a.clic(a.boton('Avisar convocatoria'))
    assert.match(a.texto(), /No se pudo mandar\. Revisá la conexión/)
  } finally { await a.cerrar() }
})

test('Partidos: el PF no recibe permiso para avisar la convocatoria; coordinación y técnico sí', async () => {
  const { readFileSync } = await import('node:fs')
  const fuente = readFileSync(new URL('../src/components/PartidosSection.jsx', import.meta.url), 'utf8')
  const expresion = fuente.match(/puedeAvisar=\{(.+)\}\s*$/m)[1]
  const puedeAvisar = new Function('perfil', 'return ' + expresion)
  assert.equal(puedeAvisar({ rol: 'coordinacion' }), true)
  assert.equal(puedeAvisar({ rol: 'tecnico' }), true)
  assert.equal(puedeAvisar({ rol: 'preparador_fisico' }), false)
  assert.equal(puedeAvisar({ rol: 'medico' }), false)
  assert.equal(puedeAvisar(null), false)
  const convocar = readFileSync(new URL('../src/components/ConvocarPartido.jsx', import.meta.url), 'utf8')
  assert.match(convocar, /<AvisarConvocatoria[^>]*puedeAvisar=\{puedeAvisar\}[^>]*rival=\{partido\.rival\}[^>]*fecha=\{partido\.fecha\}/s)
})
