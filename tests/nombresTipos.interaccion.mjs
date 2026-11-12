// Nombres configurables: Análisis muestra el nombre de la tabla de tipos en
// todas las pestañas y guarda siempre el código. YouTube y Supabase simulados.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOGO_BASE } from '../src/utils/analisis/catalogoAcciones.js'
import { montar } from './helpers/montarAnalisis.mjs'

const tipos = [
  ...CATALOGO_BASE.map(t => {
    if (t.codigo === 'Pase correcto') return { ...t, etiqueta: 'Pase bien', etiqueta_boton: 'P+' }
    if (t.codigo === 'Atajada') return { ...t, etiqueta: 'Atajada real' }
    if (t.codigo === 'Gol') return { ...t, visible: false }
    return t
  }),
  { codigo: 'control_de_arquera', etiqueta: 'Control de arquera', etiqueta_boton: 'Control', icono: '✋', color: 'info', ubicacion: 'opcional',
    resultados: [], resultado_implicito: null, es_pase: false, grupo: 'arquera', orden: 17, visible: true, atajo: null },
]
const accion = (id, tipo, jugador_id, segundo, extra = {}) => ({ id, partido_id: 'p1', jugador_id, tipo, resultado: null, segundo, periodo: 1, zona: null,
  coordenada_x: 40, coordenada_y: 50, sistema_coordenadas: 'visual_v1', direccion_captura: 'derecha', periodo_captura: 1, observaciones: null, ...extra })
const eventos = [
  accion('v1', 'Pase correcto', 'j', 100, { resultado: 'Exitoso' }),
  accion('v2', 'control_de_arquera', 'j2', 200),
  accion('v3', 'Atajada', 'j2', 300),
]

const textos = sel => [...sel.options].map(o => o.textContent)
const selector = etiqueta => [...document.querySelectorAll('select')].find(s => s.parentElement.textContent.startsWith(etiqueta))
// En ninguna pestaña debe verse el código renombrado.
const sinCodigo = donde => assert.doesNotMatch(document.body.textContent, /Pase correcto/, donde)

test('Análisis muestra los nombres configurables y guarda el código', async () => {
  const h = await montar({ tipos, eventos })
  try {
    await h.iniciar()

    // Video: botón corto con el nombre completo al mantener presionado, línea de tiempo y filtros.
    const botonPase = h.tipo('Pase correcto')
    assert.match(botonPase.textContent, /P\+/)
    assert.equal(botonPase.getAttribute('title'), 'Pase bien')
    assert.match(document.body.textContent, /Pase bien/)
    assert.match(document.body.textContent, /Control de arquera/)
    assert.match(document.body.textContent, /Atajada real/)
    const filtroLinea = [...document.querySelectorAll('select')].find(s => s.options[0]?.textContent === 'Todas las acciones')
    assert.ok(textos(filtroLinea).includes('Control de arquera'))
    assert.ok(textos(filtroLinea).includes('Gol'), 'Los filtros incluyen los tipos ocultos')
    const manual = selector('Acción')
    assert.ok(textos(manual).includes('Control de arquera'))
    assert.ok(!textos(manual).includes('Gol'), 'El formulario manual solo ofrece tipos visibles')
    assert.equal(manual.value, 'Pase correcto')
    sinCodigo('video')

    // Captura: se muestra el nombre y se guarda el código.
    await h.marcar('Pase correcto')
    assert.match(document.body.textContent, /Acción seleccionada: Pase bien/)
    await h.etiquetar('Ana Prueba')
    assert.equal(h.writes[0].tipo, 'Pase correcto')
    await h.resolver()
    assert.match(document.body.textContent, /Pase bien registrada para Ana Prueba/)
    assert.match(h.boton('Deshacer').textContent, /Deshacer Pase bien/)
    sinCodigo('video tras capturar')

    // Edición: el valor es el código y el texto, el nombre; un tipo oculto se conserva si es el actual.
    const editar = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Editar')
    await h.act(() => editar.at(-1).click())
    const formEdicion = [...document.querySelectorAll('form')].find(f => f.textContent.includes('Editar acción'))
    const tipoEdicion = [...formEdicion.querySelectorAll('select')][0]
    assert.equal(tipoEdicion.value, 'Atajada')
    assert.equal(tipoEdicion.selectedOptions[0].textContent, 'Atajada real')

    // Explorador: tabla y filtro por el tipo nuevo.
    await h.click('⌕ Explorador de acciones')
    const filtroExplorador = selector('Tipo de acción')
    assert.ok(textos(filtroExplorador).includes('Control de arquera'))
    await h.cambio(filtroExplorador, 'control_de_arquera')
    assert.match(document.body.textContent, /1 resultados/)
    assert.match(document.querySelector('tbody').textContent, /Control de arquera/)
    await h.cambio(filtroExplorador, 'todos')
    sinCodigo('explorador')

    // Estadísticas, Mapa e Informe.
    await h.click('▥ Estadísticas')
    assert.match(document.body.textContent, /Pase bien/)
    assert.match(document.body.textContent, /Control de arquera: 1/)
    sinCodigo('estadísticas')

    await h.click('▦ Mapa de zonas')
    assert.ok(textos(selector('Tipo de acción')).includes('Pase bien'))
    assert.match(document.body.textContent, /Control de arquera/)
    sinCodigo('mapa')

    await h.click('▤ Informe')
    assert.match(document.body.textContent, /Pase bien/)
    assert.match(document.body.textContent, /Atajada real/)
    sinCodigo('informe')
  } finally {
    await h.cerrar()
  }
})
