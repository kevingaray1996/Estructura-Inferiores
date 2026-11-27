// Etapa 4 de Análisis: ayudas del editor de dibujos (qué hace cada herramienta, qué hacer ahora, guías y modo
// seguimiento). Lógica pura.
import test from 'node:test'
import assert from 'node:assert/strict'
import { HERRAMIENTAS } from '../src/utils/analisis/dibujos/editor.js'
import {
  ACCIONES_RAPIDAS, CLAVE_GUIA_EDITOR, GUIA_EDITOR, GUIA_SEGUIMIENTO, SALTOS, SALTO_POR_DEFECTO, TEXTO_SEGUIMIENTO, ayudaHerramienta,
  claveAnterior, deshacerToque, guardarPreferencia, instruccion, leerPreferencia, moverGuia, saltoGuardado, siguienteCuadro,
} from '../src/utils/analisis/dibujos/guias.js'

test('cada herramienta y acción rápida explica qué hace, con su tecla', () => {
  for (const h of [...HERRAMIENTAS, ...ACCIONES_RAPIDAS]) {
    const a = ayudaHerramienta(h.id)
    assert.ok(a, h.id)
    assert.equal(a.tecla, h.tecla)
    assert.match(a.texto, new RegExp(`^${a.nombre} \\(tecla ${h.tecla}\\): .+\\. Para .+\\.$`), h.id)
    assert.match(a.descripcion, /^[A-ZÁÉÍÓÚ]/, 'La descripción empieza con mayúscula')
  }
  assert.equal(ayudaHerramienta('pase_alto').texto, 'Pase por alto (tecla A): flecha curva con sombra en el piso. Para pases elevados o centros.')
  assert.equal(ayudaHerramienta('inventada'), null)
})

test('qué hacer ahora: cambia con la herramienta y con lo que ya se marcó', () => {
  assert.equal(instruccion({ herramienta: 'pase_bajo' }), 'Hacé clic donde empieza el pase y después donde termina (o arrastrá).')
  assert.equal(instruccion({ herramienta: 'pase_alto', borrador: { tipo: 'pase_alto', puntos: [{}, {}], esperando: true } }), 'Ahora hacé clic donde termina el pase.')
  assert.match(instruccion({ herramienta: 'zona', borrador: { esperando: true } }), /esquina opuesta/)
  assert.match(instruccion({ herramienta: 'poligono', borrador: { tipo: 'poligono', puntos: [{}, {}, {}] } }), /van 3/)
  assert.equal(instruccion({ herramienta: 'enlace', enlacePendiente: 'o1' }), 'Ahora tocá la otra jugadora.')
  for (const t of ['anillo', 'foco', 'nombre']) assert.equal(instruccion({ herramienta: t }), TEXTO_SEGUIMIENTO)
  assert.match(instruccion({ herramienta: 'texto', vistaPrevia: true }), /^Vista previa/)
  for (const h of HERRAMIENTAS) assert.ok(instruccion({ herramienta: h.id }), `Sin instrucción: ${h.id}`)
  // Dibujo elegido fuera de su tiempo: avisa que se ve punteado solo para encontrarlo (no en vista previa).
  const fuera = { desde: 379.5 - 5, hasta: 379.5 }
  assert.equal(instruccion({ herramienta: 'seleccionar', fueraDeTiempo: fuera }),
    'El dibujo elegido no se ve en este momento (aparece de 6:14,5 a 6:19,5). Lo ves punteado solo para encontrarlo.')
  assert.match(instruccion({ herramienta: 'seleccionar', fueraDeTiempo: fuera, vistaPrevia: true }), /^Vista previa/)
})

test('guías: marcan todas las partes pedidas, avanzan, retroceden y se saltan', () => {
  assert.deepEqual(GUIA_EDITOR.map((p) => p.objetivo), ['herramientas', 'herramientas', 'herramientas', 'acciones', 'video', 'propiedades', 'pasos', 'linea', 'vista-previa', 'propiedades', 'pegar'])
  assert.deepEqual(GUIA_EDITOR.map((p) => p.titulo).filter((t) => /zonas|Reflector|Acciones|Mi estilo/.test(t)),
    ['Flechas y zonas que se mueven', 'Reflector, línea defensiva y opciones de pase', 'Acciones en este cuadro', 'Mi estilo'])
  assert.ok(GUIA_SEGUIMIENTO.some((p) => p.objetivo === 'salto') && GUIA_SEGUIMIENTO.some((p) => p.objetivo === 'listo'))
  for (const p of [...GUIA_EDITOR, ...GUIA_SEGUIMIENTO]) assert.ok(p.titulo && p.texto.length > 20)
  assert.equal(moverGuia(0, 'siguiente', 7), 1)
  assert.equal(moverGuia(0, 'anterior', 7), 0)
  assert.equal(moverGuia(3, 'anterior', 7), 2)
  assert.equal(moverGuia(6, 'siguiente', 7), null, 'Después del último, termina')
  assert.equal(moverGuia(2, 'saltar', 7), null)
})

test('preferencias: se recuerda que se vio la guía; sin almacenamiento no rompe', () => {
  const memoria = new Map()
  const almacen = { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v) }
  assert.equal(leerPreferencia(CLAVE_GUIA_EDITOR, almacen), null)
  guardarPreferencia(CLAVE_GUIA_EDITOR, 'si', almacen)
  assert.equal(leerPreferencia(CLAVE_GUIA_EDITOR, almacen), 'si')
  const roto = { getItem() { throw new Error('bloqueado') }, setItem() { throw new Error('bloqueado') } }
  assert.equal(leerPreferencia(CLAVE_GUIA_EDITOR, roto), null)
  assert.doesNotThrow(() => guardarPreferencia(CLAVE_GUIA_EDITOR, 'si', roto))
})

test('modo seguimiento: salto configurable, avance sin pasar el fin, deshacer el último toque y punto anterior', () => {
  assert.deepEqual([...SALTOS], [0.2, 0.5, 1])
  assert.equal(SALTO_POR_DEFECTO, 0.5)
  assert.equal(saltoGuardado(null), 0.5)
  assert.equal(saltoGuardado('0.2'), 0.2)
  assert.equal(saltoGuardado('7'), 0.5)
  const clip = { inicio: 10, fin: 12 }
  assert.equal(siguienteCuadro(10, 0.5, clip), 10.5)
  assert.equal(siguienteCuadro(11.8, 0.5, clip), 12, 'No pasa del fin del clip')
  assert.equal(siguienteCuadro(12, 0.5, clip), null, 'En el fin ya no adelanta')
  const marcas = [{ t: 10, n: 1 }, { t: 10.5, n: 2 }]
  assert.deepEqual(deshacerToque(marcas), { marcas: [{ t: 10, n: 1 }], volverA: { t: 10.5, n: 2 } })
  assert.deepEqual(deshacerToque([]), { marcas: [], volverA: null })
  const claves = [{ t: 10, x: 0.1, y: 0.1 }, { t: 10.5, x: 0.2, y: 0.1 }, { t: 11, x: 0.3, y: 0.1 }]
  assert.equal(claveAnterior(claves, 11).t, 10.5, 'En el cuadro de un punto, el anterior es el de antes')
  assert.equal(claveAnterior(claves, 10.7).t, 10.5)
  assert.equal(claveAnterior(claves, 10), null)
})
