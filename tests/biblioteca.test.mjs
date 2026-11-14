// Etapas D + G: permisos, filtros, carpetas, demostraciones y set inicial de la Biblioteca.
import test from 'node:test'
import assert from 'node:assert/strict'
import { carpetasDe, datosParaGuardar, demoValida, embedYoutube, erroresEjercicio, filtrarEjercicios, idYoutube, nombreCarpetaValido, puedeEditar, puedeVer, reordenar, valoresDistintos } from '../src/utils/biblioteca.js'
import { faltantesSetInicial, SET_INICIAL } from '../src/utils/bibliotecaInicial.js'
import { validarPizarra } from '../src/utils/pizarra.js'

const carpetas = [
  { id: 'c0', ambito: 'cancha', nombre: 'Sin clasificar', orden: 0, sistema: true },
  { id: 'c1', ambito: 'cancha', nombre: 'Salida', orden: 10, sistema: false },
  { id: 'c2', ambito: 'cancha', nombre: 'Presión', orden: 20, sistema: false },
  { id: 'c3', ambito: 'cancha', nombre: 'Rondos', orden: 30, sistema: false },
  { id: 'g1', ambito: 'gimnasio', nombre: 'Core', orden: 30, sistema: false },
  { id: 'g2', ambito: 'gimnasio', nombre: 'Tren inferior', orden: 10, sistema: false },
]
const ejercicios = [
  { id: 'e1', ambito: 'cancha', tipo: 'jugada', carpeta_id: 'c1', contenido: 'Salida con 3', objetivo: 'Salida limpia', cantidad_jugadores: 8, duracion_minutos: 15 },
  { id: 'e2', ambito: 'cancha', tipo: 'ejercicio', carpeta_id: null, contenido: 'Rondo 4 vs 2', objetivo: 'Posesión', cantidad_jugadores: 6, duracion_minutos: 8 },
  { id: 'e3', ambito: 'cancha', tipo: 'ejercicio', carpeta_id: 'c0', contenido: 'Pases en rombo', objetivo: 'posesión', cantidad_jugadores: 8, duracion_minutos: 25 },
  { id: 'g', ambito: 'gimnasio', tipo: 'ejercicio', carpeta_id: 'g2', contenido: 'Sentadilla búlgara', musculos: ['Cuádriceps', 'Glúteos'], material: ['Mancuernas'], tecnica: 'Rodilla alineada' },
]

test('Permisos: Cancha la editan coordinación y técnicos; Gimnasio, coordinación y PF; leen los tres', () => {
  assert.ok(puedeEditar('coordinacion', 'cancha') && puedeEditar('coordinacion', 'gimnasio'))
  assert.ok(puedeEditar('tecnico', 'cancha') && !puedeEditar('tecnico', 'gimnasio'))
  assert.ok(puedeEditar('preparador_fisico', 'gimnasio') && !puedeEditar('preparador_fisico', 'cancha'))
  assert.ok(!puedeEditar('medico', 'cancha') && !puedeVer('medico') && puedeVer('preparador_fisico'))
})

test('Filtros: carpeta (sin carpeta cae en "Sin clasificar"), tipo, jugadoras, duración, objetivo, músculo, material, texto y favoritos', () => {
  const ids = (f, fav = new Set()) => filtrarEjercicios(ejercicios, f, fav, 'c0').map(e => e.id)
  assert.deepEqual(ids({ ambito: 'cancha' }), ['e3', 'e2', 'e1'])
  assert.deepEqual(ids({ ambito: 'cancha', carpeta: 'sin' }), ['e3', 'e2'])
  assert.deepEqual(ids({ ambito: 'cancha', carpeta: 'c1' }), ['e1'])
  assert.deepEqual(ids({ ambito: 'cancha', tipo: 'jugada' }), ['e1'])
  assert.deepEqual(ids({ ambito: 'cancha', jugadoras: '8' }), ['e3', 'e1'])
  assert.deepEqual(ids({ ambito: 'cancha', duracion: 'corta' }), ['e2'])
  assert.deepEqual(ids({ ambito: 'cancha', duracion: 'larga' }), ['e3'])
  assert.deepEqual(ids({ ambito: 'cancha', objetivo: 'Posesion' }), ['e3', 'e2'], 'sin distinguir tildes ni mayúsculas')
  assert.deepEqual(ids({ ambito: 'cancha', texto: 'rondo' }), ['e2'])
  assert.deepEqual(ids({ ambito: 'gimnasio', musculo: 'gluteos' }), ['g'])
  assert.deepEqual(ids({ ambito: 'gimnasio', material: 'Barra' }), [])
  assert.deepEqual(ids({ ambito: 'gimnasio', texto: 'cuadriceps' }), ['g'])
  // Favoritos primero; "solo favoritos" deja solo esos.
  assert.deepEqual(ids({ ambito: 'cancha' }, new Set(['e1'])), ['e1', 'e3', 'e2'])
  assert.deepEqual(ids({ ambito: 'cancha', soloFavoritos: true }, new Set(['e2'])), ['e2'])
  assert.deepEqual(valoresDistintos(ejercicios, e => e.objetivo), ['Posesión', 'Salida limpia'])
})

test('Carpetas: la fija primero, conteos, reordenar y nombres únicos', () => {
  const cancha = carpetasDe(carpetas, 'cancha', ejercicios)
  assert.deepEqual(cancha.map(c => [c.nombre, c.cantidad]), [['Sin clasificar', 2], ['Salida', 1], ['Presión', 0], ['Rondos', 0]])
  assert.deepEqual(carpetasDe(carpetas, 'gimnasio', ejercicios).map(c => c.nombre), ['Tren inferior', 'Core'])
  assert.deepEqual(reordenar(cancha, 'c2', -1), [{ id: 'c2', orden: 10 }, { id: 'c1', orden: 20 }])
  assert.deepEqual(reordenar(cancha, 'c1', -1), [], 'no sube por encima de la fija')
  assert.deepEqual(reordenar(cancha, 'c0', 1), [], 'la fija no se mueve')
  assert.equal(nombreCarpetaValido(' salida ', carpetas, 'cancha'), 'Ya hay una carpeta con ese nombre.')
  assert.equal(nombreCarpetaValido('Salida', carpetas, 'gimnasio'), '')
  assert.equal(nombreCarpetaValido('Salida', carpetas, 'cancha', 'c1'), '', 'renombrar a sí misma')
  assert.ok(nombreCarpetaValido('', carpetas, 'cancha'))
})

test('Demostración: YouTube (reproductor sin cookies) o imagen de Biblioteca/gimnasio/, igual que la base', () => {
  for (const url of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://youtube.com/shorts/dQw4w9WgXcQ', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30'])
    assert.equal(idYoutube(url), 'dQw4w9WgXcQ', url)
  assert.equal(idYoutube('https://evil.example/watch?v=dQw4w9WgXcQ'), null)
  assert.match(embedYoutube('dQw4w9WgXcQ'), /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/)
  assert.ok(demoValida('imagen', 'https://abc.supabase.co/storage/v1/object/public/Biblioteca/gimnasio/1-sentadilla.jpg'))
  assert.ok(!demoValida('imagen', 'https://abc.supabase.co/storage/v1/object/public/Biblioteca/jugadores/x.jpg'))
})

test('Guardar: cada ámbito manda solo sus campos (la base exige que no se mezclen)', () => {
  const gim = datosParaGuardar({ ambito: 'gimnasio', contenido: ' Plancha ', descripcion: '', musculos: ['Core', ' '], material: ['Peso corporal'], tecnica: 'Cadera alineada',
    demo_tipo: 'youtube', demo_url: 'https://youtu.be/dQw4w9WgXcQ', demo_credito: 'Canal', pizarra: { version: 2 }, cantidad_jugadores: '5', duracion_minutos: '3' })
  assert.equal(gim.contenido, 'Plancha'); assert.deepEqual(gim.musculos, ['Core']); assert.equal(gim.pizarra, null); assert.equal(gim.cantidad_jugadores, null)
  assert.equal(gim.tipo, 'ejercicio'); assert.equal(gim.duracion_minutos, 3); assert.equal(gim.demo_tipo, 'youtube')
  const cancha = datosParaGuardar({ ambito: 'cancha', tipo: 'jugada', contenido: 'X', musculos: ['Core'], tecnica: 'no', demo_url: 'https://youtu.be/dQw4w9WgXcQ', demo_tipo: 'youtube', cantidad_jugadores: '' })
  assert.deepEqual(cancha.musculos, []); assert.equal(cancha.tecnica, ''); assert.equal(cancha.demo_tipo, null); assert.equal(cancha.demo_credito, ''); assert.equal(cancha.cantidad_jugadores, null)
  assert.deepEqual(erroresEjercicio({ ambito: 'cancha', contenido: '' }), ['Poné un nombre.'])
  assert.equal(erroresEjercicio({ ambito: 'gimnasio', contenido: 'A', demo_tipo: 'youtube', demo_url: 'https://otra.web/video' }).length, 1)
})

test('Set inicial: cinco jugadas v2 válidas, cada una con su carpeta; no se duplican', () => {
  assert.deepEqual(SET_INICIAL.map(j => j.carpeta), ['Salida', 'Salida', 'Presión', 'ABP ofensiva', 'ABP defensiva'])
  for (const j of SET_INICIAL) {
    assert.equal(j.pizarra.version, 2); assert.ok(j.pizarra.pasos.length >= 3); assert.deepEqual(validarPizarra(j.pizarra), j.pizarra)
    assert.ok(j.pizarra.pasos.some(p => p.texto), `${j.contenido}: con subtítulos`)
  }
  assert.ok(SET_INICIAL.find(j => j.contenido === 'Córner a favor').pizarra.pasos.some(p => p.pase === 'alto' && p.foco))
  assert.equal(faltantesSetInicial([]), 5)
  assert.equal(faltantesSetInicial([{ ambito: 'cancha', contenido: 'salida con 3 ' }, { ambito: 'gimnasio', contenido: 'Presión alta' }]), 4)
})
