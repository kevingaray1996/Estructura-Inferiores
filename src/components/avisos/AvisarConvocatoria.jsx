import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import Boton from '../ui/Boton'
import { mensajeErrorAvisos } from '../../utils/avisos'
import useFocoConfirmacion from '../../hooks/useFocoConfirmacion'
import './avisos.css'

// 18/11 a partir de '2026-11-18'.
const diaMes = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso || '') ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')

// «Avisar convocatoria»: manda el aviso a las convocadas guardadas del partido. No sale solo en cada cambio.
// puedeAvisar: solo coordinación o el técnico de la categoría (la base lo vuelve a controlar); si no, no se muestra.
// rival y fecha (del partido cargado) nombran el partido en la confirmación.
function AvisarConvocatoria({ partidoId, convocadasGuardadas, hayCambios, puedeAvisar = true, rival, fecha }) {
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const { primerBoton, disparador, cancelar } = useFocoConfirmacion(confirmando)
  if (!puedeAvisar) return null
  const bloqueado = hayCambios || !convocadasGuardadas
  const cuando = diaMes(fecha)
  const partido = rival && cuando ? ` del partido vs ${rival} · ${cuando}` : ''

  async function avisar() {
    setEnviando(true); setError(''); setAviso('')
    const { error: fallo } = await supabase.rpc('avisos_avisar_convocatoria', { p_partido_id: partidoId })
    setEnviando(false); setConfirmando(false)
    if (fallo) { setError(mensajeErrorAvisos(fallo, 'mandar')); return }
    setAviso(`Aviso en camino a ${convocadasGuardadas} ${convocadasGuardadas === 1 ? 'convocada' : 'convocadas'}. Puede tardar hasta un minuto.`)
  }

  return (
    <div className="av-convocatoria">
      {!confirmando && (
        <Boton ref={disparador()} variante="secundario" onClick={() => { setConfirmando(true); setAviso(''); setError('') }} disabled={bloqueado}
          aria-describedby={bloqueado ? 'av-convocatoria-ayuda' : undefined}>
          Avisar convocatoria
        </Boton>
      )}
      {bloqueado && (
        <p id="av-convocatoria-ayuda" className="av-texto av-suave">
          {hayCambios ? 'Guardá la convocatoria antes de avisar.' : 'Guardá al menos una convocada para poder avisar.'}
        </p>
      )}
      {confirmando && (
        <div className="av-confirmar" role="group" aria-labelledby="av-convocatoria-confirmar">
          <p id="av-convocatoria-confirmar">
            {partido
              ? `Avisar a las ${convocadasGuardadas} convocadas${partido}.`
              : `Avisar a las ${convocadasGuardadas} convocadas.`} Les llega «Estás convocada» con el rival, la fecha y la hora.
          </p>
          <div className="av-botones">
            <Boton ref={primerBoton} onClick={avisar} disabled={enviando} aria-busy={enviando}>{enviando ? 'Avisando…' : 'Avisar convocatoria'}</Boton>
            <Boton variante="secundario" onClick={() => { cancelar(); setConfirmando(false) }} disabled={enviando}>Cancelar</Boton>
          </div>
        </div>
      )}
      <p className="av-estado" role="status" aria-live="polite">{aviso}</p>
      {error && <p className="av-error" role="alert">{error}</p>}
    </div>
  )
}

export default AvisarConvocatoria
