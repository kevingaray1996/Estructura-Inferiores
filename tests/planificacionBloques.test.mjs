// Etapa E: entrenamientos por bloques (gimnasio y cancha) armados desde la biblioteca.
import test from 'node:test'
import assert from 'node:assert/strict'
import { cambiaLaBiblioteca, camposDe, datosBibliotecaDesde, nuevoBloque, nuevoEjercicio, nuevoEntrenamiento, prepararSesion } from '../src/utils/planificacion.js'
import { SET_INICIAL } from '../src/utils/bibliotecaInicial.js'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const gimnasio = { id: id(1), ambito: 'gimnasio', tipo: 'ejercicio', contenido: 'Sentadilla búlgara', descripcion: 'Bajar controlado', objetivo: 'Fuerza unilateral', duracion_minutos: 8,
  musculos: ['Cuádriceps'], material: ['Mancuernas'], tecnica: 'Rodilla alineada', demo_tipo: 'youtube', demo_url: 'https://youtu.be/dQw4w9WgXcQ', demo_credito: 'Canal', pizarra_revision: 4,
  fecha: '2026-11-01', carpeta_id: id(9), cantidad_jugadores: null }
const cancha = { id: id(2), ambito: 'cancha', tipo: 'jugada', contenido: 'Salida con 3', descripcion: 'Consigna', objetivo: 'Salida', duracion_minutos: 15, pizarra: SET_INICIAL[0].pizarra, imagen_url: null, link_video: null, pizarra_revision: 2, fecha: '2026-11-02', carpeta_id: id(8), cantidad_jugadores: 8 }

test('Entrenamiento nuevo: Bloque 1 Gimnasio y Bloque 2 Cancha; los bloques libres no tienen ámbito', () => {
  const s = nuevoEntrenamiento('2026-11-16', id(500))
  assert.deepEqual(s.bloques.map(b => [b.nombre, b.ambito]), [['Gimnasio', 'gimnasio'], ['Cancha', 'cancha']])
  assert.equal(nuevoBloque().ambito, undefined)
  const preparado = prepararSesion({ ...s, bloques: [...s.bloques, { ...nuevoBloque(), ambito: 'pileta' }] })
  assert.deepEqual(preparado.bloques.map(b => b.ambito), ['gimnasio', 'cancha', undefined], 'un ámbito inválido no se guarda')
})

test('Copia de la biblioteca: gimnasio trae técnica, músculos, material y demostración; carga y series a mano', () => {
  const g = nuevoEjercicio(gimnasio)
  assert.equal(g.biblioteca_id, gimnasio.id); assert.equal(g.nombre, 'Sentadilla búlgara'); assert.equal(g.duracion, 8); assert.equal(g.objetivo, 'Fuerza unilateral')
  assert.equal(g.tecnica, 'Rodilla alineada'); assert.deepEqual(g.musculos, ['Cuádriceps']); assert.equal(g.materiales, 'Mancuernas')
  assert.deepEqual(g.demostracion, { tipo: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', credito: 'Canal' })
  assert.equal(g.carga, ''); assert.equal(g.pizarra, null)
  assert.ok(g.campos_publicos.includes('carga') && g.campos_publicos.includes('demostracion'))
  const c = nuevoEjercicio(cancha)
  assert.equal(c.tecnica, undefined); assert.equal(c.carga, undefined); assert.ok(c.pizarra); assert.deepEqual(c.pizarra, cancha.pizarra)
  assert.equal(nuevoEjercicio(null, 'gimnasio').tecnica, '', 'tarea libre en un bloque de gimnasio')
  assert.ok(camposDe('gimnasio').includes('carga') && !camposDe('cancha').includes('carga'))
  // Se guarda con sus datos de gimnasio; una demostración inválida se descarta.
  const sesion = prepararSesion({ ...nuevoEntrenamiento('2026-11-16', id(500)), bloques: [{ ...nuevoBloque('gimnasio'), ejercicios: [{ ...g, carga: '70% 1RM', series: '4' },
    { ...g, id: 'x', demostracion: { tipo: 'youtube', url: 'https://otra.web/v', credito: '' } }] }] })
  const [a, b] = sesion.bloques[0].ejercicios
  assert.equal(a.carga, '70% 1RM'); assert.equal(a.series, '4'); assert.equal(a.tecnica, 'Rodilla alineada'); assert.deepEqual(a.musculos, ['Cuádriceps'])
  assert.equal(b.demostracion, null)
  // Una sesión vieja (sin campos de gimnasio) no cambia al prepararse.
  const vieja = prepararSesion({ ...nuevoEntrenamiento('2026-11-16', id(500)), bloques: [{ ...nuevoBloque(), ejercicios: [nuevoEjercicio()] }] })
  assert.equal('carga' in vieja.bloques[0].ejercicios[0], false); assert.equal('ambito' in vieja.bloques[0], false)
})

test('¿Solo este día o también en la biblioteca?: solo preguntan los datos compartidos; series, carga y notas son del día', () => {
  const g = nuevoEjercicio(gimnasio)
  assert.equal(cambiaLaBiblioteca(g, { ...g, series: '5', repeticiones: '8', carga: '20 kg', notas_internas: 'x', visible: true }), false)
  assert.equal(cambiaLaBiblioteca(g, { ...g, tecnica: 'Otra técnica' }), true)
  assert.equal(cambiaLaBiblioteca(g, { ...g, nombre: 'Otro nombre' }), true)
  const c = nuevoEjercicio(cancha)
  assert.equal(cambiaLaBiblioteca(c, { ...c, pizarra: { ...c.pizarra, velocidad: 2 } }), true)
})

test('Datos para la biblioteca: conserva lo que la sesión no tiene; una tarea libre entra a Sin clasificar', () => {
  const g = { ...nuevoEjercicio(gimnasio), tecnica: 'Nueva técnica', duracion: 7.6, series: '4', carga: '20 kg' }
  const d = datosBibliotecaDesde(g, 'gimnasio', gimnasio)
  assert.equal(d.fecha, gimnasio.fecha); assert.equal(d.carpeta_id, gimnasio.carpeta_id); assert.equal(d.tipo, 'ejercicio')
  assert.equal(d.tecnica, 'Nueva técnica'); assert.equal(d.duracion_minutos, 8); assert.equal(d.pizarra, null); assert.equal(d.demo_tipo, 'youtube')
  assert.equal('series' in d || 'carga' in d, false, 'series y carga no van a la biblioteca')
  const c = datosBibliotecaDesde({ ...nuevoEjercicio(cancha), indicaciones: 'Nueva consigna' }, 'cancha', cancha)
  assert.equal(c.descripcion, 'Nueva consigna'); assert.deepEqual(c.pizarra, cancha.pizarra); assert.equal(c.cantidad_jugadores, 8); assert.deepEqual(c.musculos, [])
  const libre = datosBibliotecaDesde({ ...nuevoEjercicio(null, 'cancha'), nombre: 'Rondo', pizarra: SET_INICIAL[1].pizarra }, 'cancha')
  assert.equal(libre.ambito, 'cancha'); assert.equal(libre.carpeta_id, null); assert.equal(libre.contenido, 'Rondo')
})
