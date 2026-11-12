// Captura en vivo en la ventana principal: con jugadora, sin jugadora y en un toque. YouTube y Supabase simulados; nunca usa producción.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOGO_BASE } from '../src/utils/analisis/catalogoAcciones.js'
import { montar } from './helpers/montarAnalisis.mjs'

test('Análisis: Pase +/− en vivo guarda una vez, con el segundo y el período del video, sin recargar', async () => {
  const h = await montar()
  const { writes, lecturas } = h
  try {
    await h.iniciar()
    const lecturasIniciales=lecturas.analisis_eventos
    assert.ok(lecturasIniciales>=1)

    // El reloj en pantalla sigue al video.
    await h.marcar('Pase correcto')
    h.activo().time=300.7;await h.tick()
    assert.match(document.body.textContent,/Tiempo: 05:00/)
    h.activo().time=301.2;await h.tick()
    assert.match(document.body.textContent,/Tiempo: 05:01/)

    // Doble toque rápido: un solo registro, con el segundo leído del reproductor.
    await h.act(()=>{const b=h.convocada('Ana Prueba');b.click();b.click()})
    assert.equal(writes.length,1)
    assert.deepEqual([writes[0].tipo,writes[0].jugador_id,writes[0].segundo,writes[0].periodo,writes[0].partido_id,writes[0].resultado],['Pase correcto','j',301,1,'p1','Exitoso'])
    await h.resolver();h.registradas(1)

    // La acción elegida se conserva para la siguiente jugadora.
    h.activo().time=318.9
    await h.etiquetar('Bea Ensayo')
    assert.equal(writes.length,2)
    assert.deepEqual([writes[1].tipo,writes[1].jugador_id,writes[1].segundo,writes[1].resultado],['Pase correcto','j2',318,'Exitoso'])
    await h.resolver();h.registradas(2)

    await h.marcar('Pase incorrecto')
    h.activo().time=322.4
    await h.etiquetar('Ana Prueba')
    assert.equal(writes.length,3)
    assert.deepEqual([writes[2].tipo,writes[2].jugador_id,writes[2].segundo,writes[2].resultado],['Pase incorrecto','j',322,'Fallido'])
    await h.resolver();h.registradas(3)

    // Segundo tiempo: período y dirección de captura cambian, el segundo sigue siendo el del video.
    const periodo=[...document.querySelectorAll('select')].find(s=>s.parentElement.textContent.includes('Tiempo del partido'))
    await h.cambio(periodo,'2')
    h.activo().time=2945.3
    await h.marcar('Pase correcto')
    await h.etiquetar('Bea Ensayo')
    assert.equal(writes.length,4)
    assert.deepEqual([writes[3].tipo,writes[3].segundo,writes[3].periodo,writes[3].direccion_captura],['Pase correcto',2945,2,'izquierda'])
    assert.equal(writes[0].direccion_captura,'derecha')
    await h.resolver();h.registradas(4)

    // Un remate con jugadora no recibe resultado automático.
    await h.marcar('Remate')
    await h.etiquetar('Ana Prueba')
    assert.deepEqual([writes[4].tipo,writes[4].jugador_id,writes[4].resultado],['Remate','j',null])
    await h.resolver();h.registradas(5)

    // Las acciones aparecen sin volver a leer los eventos.
    assert.equal(lecturas.analisis_eventos,lecturasIniciales)
  } finally {
    await h.cerrar()
  }
})

test('Análisis: un toque sin jugadora, botón "Sin jugadora" y deshacer la última', async () => {
  const h = await montar()
  const { writes, borrados, datos } = h
  try {
    await h.iniciar()

    // Modo un toque: tocar la acción guarda al instante, sin jugadora.
    await h.click('Marcar sin jugadora')
    h.activo().time=600.4
    await h.act(()=>{const b=h.tipo('Remate');b.click();b.click()})
    assert.equal(writes.length,1,'Doble toque guarda una sola acción')
    assert.deepEqual([writes[0].tipo,writes[0].jugador_id,writes[0].segundo,writes[0].periodo,writes[0].direccion_captura,writes[0].resultado],['Remate',null,600,1,'derecha',null])
    await h.resolver();h.registradas(1)
    assert.match(document.body.textContent,/Remate registrada sin jugadora/)
    assert.match(document.body.textContent,/Sin jugadora/)

    h.activo().time=610.2
    await h.marcar('Pase correcto')
    assert.deepEqual([writes[1].tipo,writes[1].jugador_id,writes[1].segundo,writes[1].resultado],['Pase correcto',null,610,'Exitoso'])
    await h.resolver()
    h.activo().time=611.8
    await h.marcar('Pase incorrecto')
    assert.deepEqual([writes[2].tipo,writes[2].jugador_id,writes[2].segundo,writes[2].resultado],['Pase incorrecto',null,611,'Fallido'])
    await h.resolver();h.registradas(3)

    // Deshacer borra solo la última acción marcada y no deja deshacer otra vez.
    const deshacer=h.boton('Deshacer')
    assert.match(deshacer.textContent,/Pase incorrecto · 10:11/)
    await h.click('Deshacer')
    assert.deepEqual(borrados,[writes[2].id])
    assert.equal(datos.analisis_eventos.length,2)
    h.registradas(2)
    assert.equal(h.boton('Deshacer'),undefined)

    // Sin el modo un toque, la acción vuelve a esperar a la jugadora…
    await h.click('Marcar sin jugadora')
    h.activo().time=700.1
    await h.marcar('Pase correcto')
    assert.equal(writes.length,3,'Elegir la acción no guarda')
    // …o se guarda sin ella con el botón de la lista.
    await h.click('Guardar sin jugadora')
    assert.deepEqual([writes[3].tipo,writes[3].jugador_id,writes[3].segundo,writes[3].resultado],['Pase correcto',null,700,'Exitoso'])
    await h.resolver()
    await h.etiquetar('Bea Ensayo')
    assert.deepEqual([writes[4].tipo,writes[4].jugador_id,writes[4].resultado],['Pase correcto','j2','Exitoso'])
    await h.resolver();h.registradas(4)
    assert.equal(borrados.length,1)
  } finally {
    await h.cerrar()
  }
})

// Edición: el selector de resultado sigue las reglas de cada tipo.
const accionesPrevias = [
  { id: 'v1', partido_id: 'p1', jugador_id: 'j', tipo: 'Pérdida', resultado: 'Fallido', segundo: 100, periodo: 1, zona: null, coordenada_x: null, coordenada_y: null, observaciones: null },
  { id: 'v2', partido_id: 'p1', jugador_id: 'j2', tipo: 'Remate', resultado: 'Exitoso', segundo: 200, periodo: 1, zona: null, coordenada_x: null, coordenada_y: null, observaciones: null },
]
const formularioEdicion = () => [...document.querySelectorAll('form')].find(f => f.textContent.includes('Editar acción'))
const selectorResultado = form => [...form.querySelectorAll('select')].find(s => s.parentElement.textContent.startsWith('Resultado'))
async function editar(h, indice) {
  const botones = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Editar')
  await h.act(() => botones[indice].click())
  const form = formularioEdicion(); assert.ok(form, 'formulario de edición')
  return form
}
const guardar = async (h, form) => h.act(async () => { form.dispatchEvent(new h.dom.window.Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve() })

test('Análisis sin tabla de tipos: catálogo por defecto, aviso y resultados según el tipo', async () => {
  const h = await montar({ eventos: accionesPrevias })
  try {
    await h.iniciar()
    assert.match(document.body.textContent, /valores por defecto/)

    // Pérdida no lleva resultado: no hay selector y al guardar queda vacío.
    let form = await editar(h, 0)
    assert.equal(selectorResultado(form), undefined)
    await guardar(h, form)
    assert.deepEqual([h.actualizaciones[0].id, h.actualizaciones[0].resultado], ['v1', null])

    // Remate: sus cuatro opciones y el valor viejo marcado, sin cambiarlo.
    form = await editar(h, 1)
    const sel = selectorResultado(form)
    assert.deepEqual([...sel.options].map(o => o.textContent), ['Pendiente de completar', 'Exitoso (valor anterior)', 'Gol', 'Atajada', 'Fuera', 'Bloqueado'])
    assert.equal(sel.value, 'Exitoso')
    await guardar(h, form)
    assert.deepEqual([h.actualizaciones[1].id, h.actualizaciones[1].resultado], ['v2', 'Exitoso'])
  } finally {
    await h.cerrar()
  }
})

test('Análisis con tabla de tipos: las reglas salen de la base', async () => {
  const tipos = CATALOGO_BASE.map(t => t.codigo === 'Pérdida' ? { ...t, resultados: ['Exitoso', 'Fallido'] } : t)
  const h = await montar({ tipos, eventos: accionesPrevias })
  try {
    await h.iniciar()
    assert.doesNotMatch(document.body.textContent, /valores por defecto|falta aplicar/)
    const form = await editar(h, 0)
    const sel = selectorResultado(form)
    assert.deepEqual([...sel.options].map(o => o.value), ['', 'Exitoso', 'Fallido'])
    assert.equal(sel.value, 'Fallido')
    await guardar(h, form)
    assert.deepEqual([h.actualizaciones[0].id, h.actualizaciones[0].resultado], ['v1', 'Fallido'])
  } finally {
    await h.cerrar()
  }
})
