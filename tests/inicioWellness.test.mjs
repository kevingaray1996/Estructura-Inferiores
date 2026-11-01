import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { puedeConsultarWellnessInicio, resumirWellnessInicio, mensajeErrorWellness } from '../src/utils/inicioWellness.js'

test('Inicio: conserva alcance diario de Wellness, sin conceder acceso a otras categorías o Médico', () => {
  for (const rol of ['coordinacion', 'preparador_fisico']) assert.equal(puedeConsultarWellnessInicio({ rol }, 'primera'), true)
  assert.equal(puedeConsultarWellnessInicio({ rol: 'tecnico', categoria_id: 'primera' }, 'primera'), true)
  for (const perfil of [{ rol: 'medico' }, { rol: 'tecnico', categoria_id: 'otra' }, { rol: 'tecnico' }, { rol: 'otro' }]) {
    assert.equal(puedeConsultarWellnessInicio(perfil, 'primera'), false)
  }
  assert.equal(puedeConsultarWellnessInicio({ rol: 'coordinacion' }, null), false)
})

test('Inicio: elegibles accesibles, respuesta parcial, pendiente y ausencia no se confunden', () => {
  const jugadoras = ['a', 'b', 'c', 'd'].map(id => ({ id, estado: 'lesionado' }))
  const resumen = resumirWellnessInicio(jugadoras, [{ jugador_id: 'a', fatiga: 2 }, { jugador_id: 'b', fatiga: null }, { jugador_id: 'c', fatiga: '' }])
  assert.equal(resumen.total, 4); assert.equal(resumen.respondieron, 1)
  assert.equal(resumen.incompletas, 1); assert.equal(resumen.pendientes.length, 3); assert.equal(resumen.alertas.length, 0)
  assert.equal(resumirWellnessInicio([], []).total, 0)
  assert.throws(() => resumirWellnessInicio(jugadoras, [{ jugador_id: 'a' }, { jugador_id: 'a' }]), /duplicadas/)
})

test('Inicio: umbrales diarios originales, promedio > 3, factores >= 4 y nivel alto', () => {
  const j = [{ id: 'j' }]
  const analizar = valores => resumirWellnessInicio(j, [{ jugador_id: 'j', ...valores }])
  assert.equal(analizar({ sueno: 3, fatiga: 3 }).alertas.length, 0)
  assert.equal(analizar({ sueno: 4, fatiga: 1 }).alertas[0].nivel, 'seguimiento')
  assert.equal(analizar({ sueno: 5, fatiga: 1 }).alertas[0].nivel, 'alta')
  assert.match(analizar({ fatiga: 5 }).alertas[0].motivo, /Fatiga 5/)
  assert.equal(analizar({ sueno: 3.5 }).alertas[0].nivel, 'seguimiento')
  assert.equal(analizar({ sueno: 4.5 }).alertas[0].nivel, 'alta')
  for (const error of [{ code: '42501' }, { status: 403 }]) assert.match(mensajeErrorWellness(error), /no tiene acceso/)
  assert.match(mensajeErrorWellness(new Error('Failed to fetch')), /conexión/)
})

test('Inicio: presentación aislada, responsive, temas y navegación existente sin cambiar módulos deportivos', () => {
  const css = readFileSync('src/components/inicio/inicioPremium.css', 'utf8')
  assert.match(css, /@media screen/); assert.match(css, /max-width:1100px/); assert.match(css, /max-width:600px/)
  assert.match(css, /repeat\(3,minmax\(0,1fr\)\)/); assert.match(css, /var\(--ui-texto/)
  assert.match(css, /prefers-reduced-motion/); assert.match(css, /focus-visible/)
  assert.doesNotMatch(css, /!important|@media print|:root/)
  const cambios = execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8' }).trim().split('\n')
  assert.ok(!cambios.some(p => /PerfilJugador|AnalisisSection|ListaJugadores|calendario\.js|CalendarioSection|ListaPartidos/.test(p)))
  const agenda = readFileSync('src/components/inicio/AgendaDiariaInicio.jsx', 'utf8')
  assert.match(agenda, /normalizarEventos/); assert.match(agenda, /cargarSesionesAgenda/)
  assert.doesNotMatch(agenda, /from\('partidos'\)|insert\(|update\(|rpc\(|notas_internas/)
})

test('Inicio: portada original, encuadre CSS móvil completo y fotografía de entrenamiento reservada', () => {
  const inicio = readFileSync('src/components/InicioSection.jsx', 'utf8')
  const css = readFileSync('src/components/inicio/inicioPremium.css', 'utf8')
  assert.match(inicio, /inicio-equipo-cuerpo-tecnico-original\.jpeg/)
  assert.match(inicio, /width="1280" height="959"/)
  assert.doesNotMatch(inicio, /entrenamientos-abrazo-equipo-original/)
  assert.match(css, /object-position:50% 18%/)
  assert.match(css, /inicio-portada-foto[^}]*height:auto; object-fit:contain/)
  assert.match(css, /linear-gradient/)
  assert.doesNotMatch(css, /filter:|mix-blend-mode/)
  const agenda = readFileSync('src/components/inicio/AgendaDiariaInicio.jsx', 'utf8')
  assert.match(agenda, /pelotas-entrenamiento-comunicaciones\.jpeg/)
})
