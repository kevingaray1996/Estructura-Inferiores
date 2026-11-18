import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import Boton from '../ui/Boton'
import EstadoContenido from '../ui/EstadoContenido'
import FranjaNumeros from '../ui/FranjaNumeros'
import useFocoConfirmacion from '../../hooks/useFocoConfirmacion'
import { emailValido, fechaCorta, llamarCuentas, mensajeCuentas, normalizarEmail } from '../../utils/cuentasJugadoras'
import './cuentasJugadoras.css'

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function estadoCuenta(fila) {
  if (!fila.email) return { clave: 'sin', texto: 'Sin cuenta' }
  if (!fila.activa) return { clave: 'desactivada', texto: 'Desactivada' }
  const ultimo = fechaCorta(fila.ultimo_ingreso)
  return { clave: 'activa', texto: ultimo ? `Activa · último ingreso ${ultimo}` : 'Activa · nunca ingresó' }
}

// Coordinación crea, desactiva y reactiva las cuentas de las jugadoras. La lista sale de la función
// cuentas_jugadoras_listar (solo coordinación) y los cambios van por la Edge Function cuentas-jugadoras.
function CuentasJugadorasPanel({ perfil, activo = true }) {
  const esCoordinacion = perfil?.rol === 'coordinacion'
  const [categorias, setCategorias] = useState(null)
  const [categoriaId, setCategoriaId] = useState('')
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(false)
  const [errorCarga, setErrorCarga] = useState(null)
  const [altaAbierta, setAltaAbierta] = useState(null)
  const [email, setEmail] = useState('')
  const [emailTocado, setEmailTocado] = useState(false)
  const [confirmando, setConfirmando] = useState(null)
  const [quitando, setQuitando] = useState(null)
  const [trabajando, setTrabajando] = useState(null)
  const [errores, setErrores] = useState({})
  const [aviso, setAviso] = useState('')
  const { primerBoton: primerDesactivar, disparador: disparadorDesactivar, cancelar: cancelarDesactivar } = useFocoConfirmacion(confirmando)
  const { primerBoton: primerQuitar, disparador: disparadorQuitar, cancelar: cancelarQuitar } = useFocoConfirmacion(quitando)

  const cargarCategorias = useCallback(async () => {
    setErrorCarga(null)
    const { data, error } = await supabase.from('categorias').select('id, nombre').order('orden')
    if (error) { setErrorCarga(error); setCategorias([]); return }
    setCategorias(data || [])
    setCategoriaId(actual => actual || data?.[0]?.id || '')
  }, [])

  const cargarLista = useCallback(async (id) => {
    if (!id) return
    setCargando(true)
    setErrorCarga(null)
    const { data, error } = await supabase.rpc('cuentas_jugadoras_listar', { p_categoria_id: id })
    setCargando(false)
    if (error) { setErrorCarga(error); setFilas([]); return }
    setFilas(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => {
    // Carga de datos al abrir la pestaña: el estado se actualiza cuando responde la base.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (esCoordinacion && activo && categorias === null) cargarCategorias()
  }, [esCoordinacion, activo, categorias, cargarCategorias])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (esCoordinacion && activo && categoriaId) cargarLista(categoriaId)
  }, [esCoordinacion, activo, categoriaId, cargarLista])

  if (!esCoordinacion) return null

  const linkJugadora = `${window.location.origin}/jugadora/`

  async function copiarLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('sin portapapeles')
      await navigator.clipboard.writeText(linkJugadora)
      setAviso('Link copiado.')
    } catch {
      setAviso('No se pudo copiar. Mantené apretado el link para copiarlo.')
    }
  }

  function ponerError(jugadorId, texto) {
    setErrores(prev => ({ ...prev, [jugadorId]: texto }))
  }

  function abrirAlta(fila) {
    setAltaAbierta(fila.jugador_id)
    setConfirmando(null)
    setQuitando(null)
    setEmail('')
    setEmailTocado(false)
    ponerError(fila.jugador_id, '')
  }

  function cerrarAlta() {
    setAltaAbierta(null)
    setEmail('')
    setEmailTocado(false)
  }

  async function ejecutar(fila, cuerpo, textoListo) {
    setTrabajando(fila.jugador_id)
    ponerError(fila.jugador_id, '')
    setAviso('')
    const resultado = await llamarCuentas(supabase, cuerpo)
    setTrabajando(null)
    if (resultado.error) {
      ponerError(fila.jugador_id, mensajeCuentas(resultado.error))
      return false
    }
    setAviso(textoListo)
    await cargarLista(categoriaId)
    return true
  }

  async function crearCuenta(evento, fila) {
    evento.preventDefault()
    setEmailTocado(true)
    if (!emailValido(email)) return
    const listo = await ejecutar(fila, { accion: 'crear', jugador_id: fila.jugador_id, email: normalizarEmail(email) },
      `Cuenta creada para ${fila.nombre} ${fila.apellido}.`)
    if (listo) cerrarAlta()
  }

  async function desactivar(fila) {
    const listo = await ejecutar(fila, { accion: 'desactivar', jugador_id: fila.jugador_id },
      `Cuenta de ${fila.nombre} ${fila.apellido} desactivada.`)
    if (listo) setConfirmando(null)
  }

  function reactivar(fila) {
    return ejecutar(fila, { accion: 'reactivar', jugador_id: fila.jugador_id },
      `Cuenta de ${fila.nombre} ${fila.apellido} reactivada.`)
  }

  // Para una cuenta creada por error: borra el usuario de ingreso y la jugadora vuelve a "Sin cuenta".
  // La jugadora y sus datos no se tocan.
  async function quitarCuenta(fila) {
    const listo = await ejecutar(fila, { accion: 'quitar', jugador_id: fila.jugador_id },
      `Cuenta de ${fila.nombre} ${fila.apellido} quitada. Ya se le puede crear una nueva.`)
    if (listo) setQuitando(null)
  }

  const conCuenta = filas.filter(f => f.email)
  const numeros = cargando || errorCarga ? null : {
    total: filas.length,
    activas: conCuenta.filter(f => f.activa).length,
    desactivadas: conCuenta.filter(f => !f.activa).length,
    sin: filas.length - conCuenta.length,
  }

  return (
    <section className="cj-panel" aria-labelledby="cj-titulo">
      <div className="cj-cabecera">
        <div>
          <h2 id="cj-titulo" className="cj-titulo">Cuentas de jugadoras</h2>
          <p className="cj-ayuda">
            La jugadora entra en <a href={linkJugadora} className="cj-link">{linkJugadora}</a> con su mail. No hace falta
            mandarle nada: le llega un link y un código cuando lo pide.
          </p>
          <Boton variante="secundario" className="cj-copiar" onClick={copiarLink}>Copiar link</Boton>
        </div>
        <label className="cj-campo-categoria">
          <span>Categoría</span>
          <select className="ui-control" value={categoriaId} onChange={e => { setCategoriaId(e.target.value); cerrarAlta(); setConfirmando(null); setQuitando(null); setErrores({}) }}
            disabled={!categorias?.length}>
            {(categorias || []).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
      </div>

      <p className="cj-aviso" role="status" aria-live="polite">{aviso}</p>

      <FranjaNumeros etiqueta="Cuentas de la categoría" items={[
        { etiqueta: 'Jugadoras', valor: numeros?.total ?? null },
        { etiqueta: 'Activas', valor: numeros?.activas ?? null },
        { etiqueta: 'Desactivadas', valor: numeros?.desactivadas ?? null },
        { etiqueta: 'Sin cuenta', valor: numeros?.sin ?? null },
      ]} />

      {(cargando || categorias === null) && !errorCarga && <EstadoContenido estado="cargando" titulo="Cargando jugadoras" />}
      {errorCarga && <EstadoContenido estado={errorCarga.code === '42501' ? 'denegado' : 'error'} titulo="No se pudo consultar la lista"
        mensaje="No equivale a una lista vacía. Podés reintentar la consulta." onReintentar={() => (categoriaId ? cargarLista(categoriaId) : cargarCategorias())} />}
      {!cargando && !errorCarga && categorias !== null && filas.length === 0 &&
        <EstadoContenido estado="vacio" titulo="Sin jugadoras en esta categoría" mensaje="Cargá las jugadoras en Plantel y después creales la cuenta acá." />}

      {!cargando && !errorCarga && filas.length > 0 && (
        <ul className="cj-lista">
          {filas.map(fila => {
            const estado = estadoCuenta(fila)
            const nombreCompleto = `${fila.nombre} ${fila.apellido}`
            const idEmail = `cj-email-${fila.jugador_id}`
            const idError = `cj-error-email-${fila.jugador_id}`
            const errorEmail = emailTocado && !emailValido(email) ? 'Escribí un mail válido, por ejemplo nombre@gmail.com.' : ''
            const ocupado = trabajando === fila.jugador_id
            return (
              <li key={fila.jugador_id} className="cj-fila" data-fila-jugadora="">
                <div className="cj-identidad">
                  {fila.foto_url
                    ? <img src={fila.foto_url} alt="" className="cj-foto" />
                    : <span className="cj-foto cj-iniciales" aria-hidden="true">{iniciales(fila.nombre, fila.apellido)}</span>}
                  <div className="cj-textos">
                    <p className="cj-nombre">{fila.apellido}, {fila.nombre}</p>
                    <p className="cj-estado" data-estado={estado.clave}>
                      {estado.texto}{fila.email ? <span className="cj-email"> · {fila.email}</span> : null}
                    </p>
                  </div>
                </div>

                <div className="cj-acciones">
                  {estado.clave === 'sin' && altaAbierta !== fila.jugador_id &&
                    <Boton variante="secundario" onClick={() => abrirAlta(fila)}>Crear cuenta</Boton>}
                  {estado.clave === 'activa' && confirmando !== fila.jugador_id &&
                    <Boton ref={disparadorDesactivar(fila.jugador_id)} variante="secundario" onClick={() => { setConfirmando(fila.jugador_id); setQuitando(null); cerrarAlta() }}>Desactivar cuenta</Boton>}
                  {estado.clave === 'desactivada' && quitando !== fila.jugador_id && <>
                    <Boton variante="secundario" onClick={() => reactivar(fila)} disabled={ocupado} aria-busy={ocupado}>
                      {ocupado ? 'Reactivando…' : 'Reactivar cuenta'}
                    </Boton>
                    <Boton ref={disparadorQuitar(fila.jugador_id)} variante="secundario" onClick={() => { setQuitando(fila.jugador_id); setConfirmando(null); cerrarAlta() }} disabled={ocupado}>
                      Quitar cuenta
                    </Boton>
                  </>}
                </div>

                {altaAbierta === fila.jugador_id && (
                  <form className="cj-alta" onSubmit={e => crearCuenta(e, fila)} noValidate>
                    <label htmlFor={idEmail} className="cj-etiqueta">Email de la jugadora</label>
                    <input id={idEmail} type="email" inputMode="email" autoComplete="off" className="ui-control cj-input"
                      value={email} autoFocus
                      onChange={e => { setEmail(e.target.value); setEmailTocado(false) }}
                      onBlur={() => setEmailTocado(true)}
                      aria-invalid={errorEmail ? 'true' : undefined}
                      aria-describedby={errorEmail ? idError : undefined} />
                    {errorEmail && <p id={idError} className="cj-error">{errorEmail}</p>}
                    <div className="cj-botones">
                      <Boton type="submit" disabled={ocupado} aria-busy={ocupado}>{ocupado ? 'Creando…' : 'Crear cuenta'}</Boton>
                      <Boton variante="secundario" onClick={cerrarAlta} disabled={ocupado}>Cancelar</Boton>
                    </div>
                  </form>
                )}

                {confirmando === fila.jugador_id && (
                  <div className="cj-confirmar" role="group" aria-labelledby={`cj-confirmar-${fila.jugador_id}`}>
                    <p id={`cj-confirmar-${fila.jugador_id}`}>Desactivar la cuenta de {nombreCompleto}. No va a poder entrar hasta que la reactives.</p>
                    <div className="cj-botones">
                      <Boton ref={primerDesactivar} variante="peligro" onClick={() => desactivar(fila)} disabled={ocupado} aria-busy={ocupado}>
                        {ocupado ? 'Desactivando…' : 'Desactivar cuenta'}
                      </Boton>
                      <Boton variante="secundario" onClick={() => { cancelarDesactivar(); setConfirmando(null) }} disabled={ocupado}>Cancelar</Boton>
                    </div>
                  </div>
                )}

                {quitando === fila.jugador_id && (
                  <div className="cj-confirmar" role="group" aria-labelledby={`cj-quitar-${fila.jugador_id}`}>
                    <p id={`cj-quitar-${fila.jugador_id}`}>
                      Quitar la cuenta de {nombreCompleto}. Se borra su usuario de ingreso ({fila.email}) y vuelve a quedar
                      sin cuenta. La jugadora y sus datos no se tocan.
                    </p>
                    <div className="cj-botones">
                      <Boton ref={primerQuitar} variante="peligro" onClick={() => quitarCuenta(fila)} disabled={ocupado} aria-busy={ocupado}>
                        {ocupado ? 'Quitando…' : 'Quitar cuenta'}
                      </Boton>
                      <Boton variante="secundario" onClick={() => { cancelarQuitar(); setQuitando(null) }} disabled={ocupado}>Cancelar</Boton>
                    </div>
                  </div>
                )}

                {errores[fila.jugador_id] && <p className="cj-error" role="alert">{errores[fila.jugador_id]}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default CuentasJugadorasPanel
