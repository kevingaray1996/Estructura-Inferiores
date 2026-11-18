import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import Boton from '../ui/Boton'
import { destinoTexto, mensajeErrorAvisos } from '../../utils/avisos'
import useFocoConfirmacion from '../../hooks/useFocoConfirmacion'

const MAXIMO = 140

// Aviso manual a todo el plantel de una categoría o a jugadoras elegidas. Coordinación elige la categoría; técnico y
// PF mandan solo a la suya (la base lo vuelve a controlar).
function MandarAviso({ categorias, categoriaFija }) {
  const [categoriaId, setCategoriaId] = useState(categoriaFija || '')
  const [jugadoras, setJugadoras] = useState([])
  const [todas, setTodas] = useState(true)
  const [elegidas, setElegidas] = useState([])
  const [texto, setTexto] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const { primerBoton, disparador, cancelar } = useFocoConfirmacion(confirmando)

  const categoriaActual = categoriaId || categorias[0]?.id || ''
  const nombreCategoria = categorias.find((c) => c.id === categoriaActual)?.nombre || 'la categoría'
  const limpio = texto.trim()
  const cantidad = todas ? jugadoras.length : elegidas.length

  useEffect(() => {
    if (!categoriaActual) return undefined
    let activo = true
    supabase.from('jugadores').select('id, nombre, apellido').eq('categoria_id', categoriaActual).order('apellido')
      .then(({ data }) => { if (activo) { setJugadoras(data || []); setElegidas([]) } })
    return () => { activo = false }
  }, [categoriaActual])

  function pedirConfirmacion() {
    setError(''); setAviso('')
    if (limpio.length < 3 || limpio.length > MAXIMO) { setError('El mensaje tiene que tener entre 3 y 140 caracteres.'); return }
    if (!todas && elegidas.length === 0) { setError('Elegí al menos una jugadora o mandalo a todo el plantel.'); return }
    setConfirmando(true)
  }

  async function mandar() {
    setEnviando(true)
    const { error: fallo } = await supabase.rpc('avisos_mandar', {
      p_categoria_id: categoriaActual, p_jugadoras: todas ? null : elegidas, p_texto: limpio,
    })
    setEnviando(false); setConfirmando(false)
    if (fallo) { setError(mensajeErrorAvisos(fallo, 'mandar')); return }
    setTexto(''); setElegidas([])
    setAviso('Aviso en camino. Puede tardar hasta un minuto en llegar.')
  }

  function alternar(id) {
    setElegidas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <section className="av-tarjeta" aria-labelledby="av-mandar-titulo">
      <h2 id="av-mandar-titulo" className="av-titulo">Mandar un aviso</h2>
      <p className="av-advertencia">No pongas datos personales ni de salud: el aviso se ve en la pantalla bloqueada del celular.</p>

      {categoriaFija
        ? <p className="av-texto">Categoría: <strong>{nombreCategoria}</strong></p>
        : (
          <label className="av-campo" htmlFor="av-mandar-categoria">
            <span>Categoría</span>
            <select id="av-mandar-categoria" className="ui-control av-control" value={categoriaActual}
              onChange={(e) => { setCategoriaId(e.target.value); setConfirmando(false) }}>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
        )}

      <fieldset className="av-grupo">
        <legend>Destinatarias</legend>
        <label className="av-opcion"><input type="radio" name="av-destino" checked={todas} onChange={() => { setTodas(true); setConfirmando(false) }} /> Todo el plantel</label>
        <label className="av-opcion"><input type="radio" name="av-destino" checked={!todas} onChange={() => { setTodas(false); setConfirmando(false) }} /> Jugadoras elegidas</label>
        {!todas && (
          <ul className="av-lista-elegir">
            {jugadoras.map((j) => (
              <li key={j.id}>
                <label className="av-opcion">
                  <input type="checkbox" checked={elegidas.includes(j.id)} onChange={() => { alternar(j.id); setConfirmando(false) }} />
                  {j.apellido}, {j.nombre}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <label className="av-campo" htmlFor="av-mandar-texto">
        <span>Mensaje</span>
        <textarea id="av-mandar-texto" className="ui-control av-control" rows={3} maxLength={MAXIMO + 20} value={texto}
          onChange={(e) => { setTexto(e.target.value); setConfirmando(false); setError('') }} aria-describedby="av-mandar-contador" />
      </label>
      <p id="av-mandar-contador" className="av-contador">{limpio.length} / {MAXIMO}</p>

      {!confirmando && <Boton ref={disparador()} onClick={pedirConfirmacion} disabled={enviando}>Mandar aviso</Boton>}
      {confirmando && (
        <div className="av-confirmar" role="group" aria-labelledby="av-mandar-confirmar">
          <p id="av-mandar-confirmar">{destinoTexto({ todas, cantidad, categoria: nombreCategoria })} ¿Lo mandamos?</p>
          <div className="av-botones">
            <Boton ref={primerBoton} onClick={mandar} disabled={enviando} aria-busy={enviando}>{enviando ? 'Mandando…' : 'Mandar aviso'}</Boton>
            <Boton variante="secundario" onClick={() => { cancelar(); setConfirmando(false) }} disabled={enviando}>Cancelar</Boton>
          </div>
        </div>
      )}
      <p className="av-estado" role="status" aria-live="polite">{aviso}</p>
      {error && <p className="av-error" role="alert">{error}</p>}
    </section>
  )
}

export default MandarAviso
