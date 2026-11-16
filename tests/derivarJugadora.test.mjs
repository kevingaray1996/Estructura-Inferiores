import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// El sistema del staff manda a /jugadora/ a quien no tiene perfil pero sí una cuenta de jugadora activa.
const { destinoSinPerfil } = await import('../src/utils/derivarJugadora.js')

const cliente = respuesta => ({ llamadas: [], async rpc(nombre) { this.llamadas.push(nombre); return respuesta } })

test('Sin perfil y con cuenta de jugadora activa: va a /jugadora/', async () => {
  const c = cliente({ data: { nombre: 'Ana' }, error: null })
  assert.equal(await destinoSinPerfil(c), '/jugadora/')
  assert.deepEqual(c.llamadas, ['portal_mi_perfil'])
})

test('Sin perfil y sin cuenta (o desactivada, o sin conexión): se queda con el mensaje actual', async () => {
  assert.equal(await destinoSinPerfil(cliente({ data: null, error: { code: '42501' } })), null)
  assert.equal(await destinoSinPerfil(cliente({ data: null, error: null })), null)
  assert.equal(await destinoSinPerfil({ async rpc() { throw new Error('sin red') } }), null)
})

test('App usa la derivación solo cuando no hay perfil', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(app, /import \{ destinoSinPerfil \} from '\.\/utils\/derivarJugadora'/)
  assert.match(app, /if \(!data\) \{[\s\S]{0,200}destinoSinPerfil\(supabase\)[\s\S]{0,200}window\.location\.replace\(destino\)/)
})
