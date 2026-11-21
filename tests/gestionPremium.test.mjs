import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const base = 'f0322d857a52b985f52d268f858f39209274aa37'
const leer = p => readFileSync(p, 'utf8').replaceAll('\r', '')
const anterior = p => execFileSync('git', ['show', `${base}:${p}`], { encoding: 'utf8' }).replaceAll('\r', '')

test('Gestión Premium conserva íntegros handlers, payloads, filtros, roles y exportación', () => {
  for (const nombre of ['CaptacionSection']) {
    const ruta = `src/components/${nombre}.jsx`
    const bloque = s => s.slice(s.indexOf(nombre === 'CaptacionSection' ? 'const ESTADO_CONFIG' : 'const rolLabel'), s.lastIndexOf('\n  return ('))
    const nuevo = bloque(leer(ruta))
      .replace("\n  const [errorCarga, setErrorCarga] = useState(null)", '')
      .replace('const { data, error } = await supabase', 'const { data } = await supabase')
      .replace('const { data: usuariosData, error: errorUsuarios }', 'const { data: usuariosData }')
      .replace('    setErrorCarga(error || null)\n', '')
      .replace('    setErrorCarga(errorUsuarios || null)\n', '')
    assert.equal(nuevo, bloque(anterior(ruta)), nombre)
    assert.match(leer(ruta), /EncabezadoSeccion/)
    assert.match(leer(ruta), /EstadoContenido/)
    assert.match(leer(ruta), /TarjetaIndicador/)
    assert.doesNotMatch(leer(ruta), /BOTON_GESTION/)
  }
})

// Usuarios se compara contra main antes de la pestaña Jugadoras (9acc69b): esa versión ya incluye los cambios de
// seguridad de Storage (foto comprimida, sin reemplazar archivos) y el rediseño (FranjaNumeros). La pestaña Jugadoras
// (cuentas de jugadoras, 2026-11-16) se sumó a propósito: el componente recibe el perfil, guarda la pestaña elegida y
// arma el contenido del staff antes del return. Los handlers y payloads del staff tienen que quedar idénticos.
test('Usuarios conserva íntegros handlers, payloads, roles y exportación del staff al sumar la pestaña Jugadoras', () => {
  const ruta = 'src/components/UsuariosSection.jsx'
  const antesDeJugadoras = execFileSync('git', ['show', `9acc69b:${ruta}`], { encoding: 'utf8' }).replaceAll('\r', '')
  const actual = leer(ruta)
  const handlersAntes = antesDeJugadoras.slice(antesDeJugadoras.indexOf('const rolLabel'), antesDeJugadoras.lastIndexOf('\n  return ('))
  assert.ok(actual.includes('\n  const enStaff = '), 'el contenido del staff se arma antes del return')
  const handlersAhora = actual.slice(actual.indexOf('const rolLabel'), actual.indexOf('\n  const enStaff = '))
    .replace('function UsuariosSection({ perfil }) {', 'function UsuariosSection() {')
    .replace("\n  const esCoordinacion = perfil?.rol === 'coordinacion'\n  const [pestana, setPestana] = useState('staff')", '')
    // Mensajes de error claros (mail de jugadora o de otro usuario del staff): misma rama, otro texto.
    .replace('setErrorMsg(mensajeErrorPerfil(error))', "setErrorMsg(error.code === '42501' ? 'No tenés permiso para guardar este perfil. Revisá tu sesión.' : 'Error al guardar: ' + error.message)")
    // Mejoras etapa A (2026-11-20): error de subida de la foto en castellano, misma rama.
    .replace("setErrorMsg(mensajeError(err, 'subir la foto'))", "setErrorMsg('Error al subir la foto: ' + err.message)")
  assert.equal(handlersAhora, handlersAntes)
  assert.match(actual, /EncabezadoSeccion/)
  assert.match(actual, /EstadoContenido/)
  assert.match(actual, /FranjaNumeros/)
  assert.doesNotMatch(actual, /BOTON_GESTION/)
})

test('Gestión Premium amplía CSS únicamente por adhesión explícita y conserva los estilos compartidos anteriores', () => {
  const ruta = 'src/components/ui/panelDeportivo.css', css = leer(ruta), antes = anterior(ruta)
  const marcador = '@media screen {\n  .dp-encabezado,'
  // La base compartida (desde el marcador) cambia con el rediseño; sus reglas las verifica panelDeportivo.test.mjs.
  assert.ok(css.indexOf(marcador) > 0 && antes.indexOf(marcador) > 0)
  const reglas = css.slice(css.indexOf('@media screen {'), css.indexOf(marcador))
  assert.doesNotMatch(reglas, /!important|@media print|:root/)
  for (const selector of reglas.matchAll(/([^{}]+)\{/g)) {
    const texto = selector[1].trim()
    if (texto.startsWith('@')) continue
    for (const parte of texto.split(/,(?![^()]*\))/)) assert.match(parte, /\.dp-gestion/, parte)
  }
  assert.match(css, /max-width: 1440px/)
  for (const ancho of [1000, 700, 420]) assert.match(css, new RegExp(`max-width: ${ancho}px`))
  assert.match(css, /overflow-wrap: anywhere/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /\[data-apariencia='claro'\] \.dp-gestion/)
  assert.match(css, /background: var\(--marca-amarillo\); color: var\(--ui-texto-sobre-acento\)/)
})
