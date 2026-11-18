import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import Boton from '../ui/Boton'
import { mensajeErrorAvisos } from '../../utils/avisos'
import './avisos.css'

// «Avisar convocatoria»: manda el aviso a las convocadas guardadas del partido. No sale solo en cada cambio.
function AvisarConvocatoria({ partidoId, convocadasGuardadas, hayCambios }) {
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const bloqueado = hayCambios || !convocadasGuardadas

  async function avisar() {
    setEnviando(true); setError(''); setAviso('')
    const { error: fallo } = await supabase.rpc('avisos_avisar_convocatoria', { p_partido_id: partidoId })
    setEnviando(false); setConfirmando(false)
    if (fallo) { setError(mensajeErrorAvisos(fallo)); return }
    setAviso(`Aviso en camino a ${convocadasGuardadas} ${convocadasGuardadas === 1 ? 'convocada' : 'convocadas'}. Puede tardar hasta un minuto.`)
  }

  return (
    <div className="av-convocatoria">
      {!confirmando && (
        <Boton variante="secundario" onClick={() => { setConfirmando(true); setAviso(''); setError('') }} disabled={bloqueado}
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
          <p id="av-convocatoria-confirmar">Avisar a las {convocadasGuardadas} convocadas. Les llega «Estás convocada» con el rival, la fecha y la hora.</p>
          <div className="av-botones">
            <Boton onClick={avisar} disabled={enviando} aria-busy={enviando}>{enviando ? 'Avisando…' : 'Avisar convocatoria'}</Boton>
            <Boton variante="secundario" onClick={() => setConfirmando(false)} disabled={enviando}>Cancelar</Boton>
          </div>
        </div>
      )}
      <p className="av-estado" role="status" aria-live="polite">{aviso}</p>
      {error && <p className="av-error" role="alert">{error}</p>}
    </div>
  )
}

export default AvisarConvocatoria
