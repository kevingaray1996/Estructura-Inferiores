import { useState } from 'react'
import { COLORES } from '../../theme'

const inputStyle = {
  backgroundColor: COLORES.fondoTarjeta,
  border: `1px solid ${COLORES.borde}`,
  color: COLORES.texto,
}

// Carga del esfuerzo percibido (RPE). Lo usan el link público y la cuenta de la jugadora: cada uno pasa su forma
// de guardar. La base valida el día (hoy y 3 días antes); acá solo se limita el selector. Para reiniciarlo, el
// padre cambia su key.
//   fechaHoy, fechaMinima: 'AAAA-MM-DD'.
//   onGuardar: ({ fecha, tipo, rpe }) => Promise<{ error?: string }>.
function FormularioRpe({ fechaHoy, fechaMinima, onGuardar }) {
  const [fecha, setFecha] = useState(fechaHoy)
  const [tipo, setTipo] = useState('entrenamiento')
  const [valor, setValor] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')

  function reiniciar() {
    setValor(null)
    setEnviado(false)
    setError('')
  }

  async function handleEnviar() {
    if (!valor) {
      setError('Elegí un valor del 1 al 10.')
      return
    }
    setGuardando(true)
    setError('')
    const { error: errorGuardar } = await onGuardar({ fecha, tipo, rpe: valor })
    setGuardando(false)
    if (errorGuardar) {
      setError('No se pudo guardar: ' + errorGuardar)
      return
    }
    setEnviado(true)
  }

  if (enviado) {
    return (
      <div className="text-center py-12">
        <p className="text-3xl mb-3">✅</p>
        <p className="text-sm" style={{ color: COLORES.texto }}>
          ¡Gracias! Ya se guardó tu esfuerzo de ese día.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div>
          <label className="text-[10px] uppercase" style={{ color: COLORES.textoMuted }}>Día</label>
          <input
            type="date"
            value={fecha}
            min={fechaMinima}
            max={fechaHoy}
            onChange={(e) => { reiniciar(); setFecha(e.target.value) }}
            className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="text-[10px] uppercase" style={{ color: COLORES.textoMuted }}>Actividad</label>
          <select
            value={tipo}
            onChange={(e) => { reiniciar(); setTipo(e.target.value) }}
            className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
            style={inputStyle}
          >
            <option value="entrenamiento">Entrenamiento</option>
            <option value="partido">Partido</option>
          </select>
        </div>
      </div>

      <p className="text-sm mb-2" style={{ color: COLORES.texto }}>
        ¿Qué tan duro sentiste el esfuerzo?
      </p>
      <div className="grid grid-cols-5 gap-2 mb-1">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => {
          const activo = valor === v
          return (
            <button
              key={v}
              onClick={() => setValor(v)}
              className="py-3 rounded-xl text-sm font-mono transition-opacity hover:opacity-80"
              style={{
                backgroundColor: activo ? COLORES.acento : COLORES.fondoTarjeta,
                color: activo ? 'var(--ui-texto-sobre-acento)' : COLORES.textoSecundario,
                fontWeight: activo ? 700 : 400,
                border: `1px solid ${COLORES.borde}`,
              }}
            >
              {v}
            </button>
          )
        })}
      </div>
      <div className="flex justify-between mb-6">
        <span className="text-[10px]" style={{ color: COLORES.textoMuted }}>Muy suave</span>
        <span className="text-[10px]" style={{ color: COLORES.textoMuted }}>Al máximo</span>
      </div>

      {error && (
        <p className="text-sm mb-4" style={{ color: COLORES.peligro }}>{error}</p>
      )}

      <button
        onClick={handleEnviar}
        disabled={guardando}
        className="w-full p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{ backgroundColor: COLORES.acento, color: 'var(--ui-texto-sobre-acento)' }}
      >
        {guardando ? 'Enviando...' : 'Enviar'}
      </button>
    </>
  )
}

export default FormularioRpe
