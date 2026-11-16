import { useState } from 'react'
import { COLORES } from '../../theme'

const CAMPOS_WELLNESS = [
  { clave: 'sueno', label: '¿Cómo dormiste?' },
  { clave: 'dolor_muscular', label: '¿Tenés dolor muscular?' },
  { clave: 'fatiga', label: '¿Qué tan cansado estás?' },
  { clave: 'estres', label: '¿Cómo está tu estrés?' },
  { clave: 'animo_entrenar', label: '¿Cómo estás de ánimo para entrenar?' },
]

const FASES_CICLO = [
  { valor: 'menstrual', label: 'Menstrual' },
  { valor: 'folicular', label: 'Folicular' },
  { valor: 'ovulacion', label: 'Ovulación' },
  { valor: 'lutea', label: 'Lútea' },
  { valor: 'no_responde', label: 'No estoy segura / Prefiero no responder' },
]

const inputStyle = {
  backgroundColor: COLORES.fondoTarjeta,
  border: `1px solid ${COLORES.borde}`,
  color: COLORES.texto,
}

// Formulario de Wellness de hoy. Lo usan el link público y la cuenta de la jugadora: cada uno pasa su forma de
// guardar. Arranca siempre vacío (no se lee ninguna respuesta guardada). Para reiniciarlo, el padre cambia su key.
//   completado:   si ya hay respuesta de hoy (muestra "ya completaste").
//   onCompletado: avisa el nuevo estado (true al guardar, false al elegir "Editar mi respuesta").
//   onGuardar:    (valores) => Promise<{ error?: string }>; valores = { sueno, dolor_muscular, fatiga, estres,
//                 animo_entrenar, zona_dolor, fase_ciclo } con zona_dolor y fase_ciclo ya normalizados (o null).
function FormularioWellness({ completado, onCompletado, onGuardar }) {
  const [valores, setValores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mostrarAyudaCiclo, setMostrarAyudaCiclo] = useState(false)

  function editarRespuesta() {
    setValores({})
    setError('')
    onCompletado(false)
  }

  function marcar(campo, valor) {
    setValores((prev) => ({ ...prev, [campo]: prev[campo] === valor ? null : valor }))
  }

  function actualizarTexto(campo, valor) {
    setValores((prev) => ({ ...prev, [campo]: valor }))
  }

  function elegirFase(valor) {
    setValores((prev) => ({ ...prev, fase_ciclo: prev.fase_ciclo === valor ? null : valor }))
  }

  async function handleEnviar() {
    const completo = CAMPOS_WELLNESS.every((c) => valores[c.clave])
    if (!completo) {
      setError('Completá todas las preguntas antes de enviar.')
      return
    }
    setGuardando(true)
    setError('')
    const { error: errorGuardar } = await onGuardar({
      sueno: valores.sueno,
      dolor_muscular: valores.dolor_muscular,
      fatiga: valores.fatiga,
      estres: valores.estres,
      animo_entrenar: valores.animo_entrenar,
      zona_dolor: valores.zona_dolor?.trim() || null,
      fase_ciclo: valores.fase_ciclo || null,
    })
    setGuardando(false)
    if (errorGuardar) {
      setError('No se pudo guardar: ' + errorGuardar)
      return
    }
    onCompletado(true)
  }

  if (completado) {
    return (
      <div className="text-center py-12">
        <p className="text-3xl mb-3">✅</p>
        <p className="text-sm mb-4" style={{ color: COLORES.texto }}>
          ¡Gracias! Ya se guardó tu bienestar de hoy.
        </p>
        <button
          onClick={editarRespuesta}
          className="text-xs px-3 py-1.5 rounded-lg hover:opacity-80"
          style={{ backgroundColor: COLORES.fondoTarjeta, color: COLORES.textoSecundario, border: `1px solid ${COLORES.borde}` }}
        >
          ✏️ Editar mi respuesta
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-5 mb-6">
        {CAMPOS_WELLNESS.map((c) => (
          <div key={c.clave}>
            <p className="text-sm mb-2" style={{ color: COLORES.texto }}>{c.label}</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((v) => {
                const activo = valores[c.clave] === v
                return (
                  <button
                    key={v}
                    onClick={() => marcar(c.clave, v)}
                    className="flex-1 py-3 rounded-xl text-sm font-mono transition-opacity hover:opacity-80"
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
            <div className="flex justify-between mt-1">
              <span className="text-[10px]" style={{ color: COLORES.textoMuted }}>Mejor</span>
              <span className="text-[10px]" style={{ color: COLORES.textoMuted }}>Peor</span>
            </div>
            {c.clave === 'dolor_muscular' && (
              <div className="mt-3">
                <label className="text-sm mb-2 block" style={{ color: COLORES.texto }}>
                  ¿Qué parte del cuerpo te duele?
                </label>
                <textarea
                  rows={3}
                  value={valores.zona_dolor || ''}
                  onChange={(e) => actualizarTexto('zona_dolor', e.target.value)}
                  placeholder="Ej: rodilla, espalda, hombro..."
                  className="w-full p-3 rounded-xl ui-control outline-none text-sm"
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mb-6" style={{ borderTop: `1px solid ${COLORES.borde}`, paddingTop: '1.25rem' }}>
        <div className="flex justify-between items-center mb-1">
          <p className="text-sm" style={{ color: COLORES.texto }}>Fase del ciclo menstrual</p>
          <button
            type="button"
            onClick={() => setMostrarAyudaCiclo((v) => !v)}
            className="text-xs"
            style={{ color: COLORES.acento }}
          >
            ❔ ¿Qué es esto?
          </button>
        </div>
        <p className="text-xs mb-2" style={{ color: COLORES.textoMuted }}>
          Solo lo ven preparación física, coordinación y cuerpo técnico.
        </p>

        {mostrarAyudaCiclo && (
          <div
            className="rounded-xl p-3 mb-3 text-xs"
            style={{ backgroundColor: COLORES.fondoTarjeta, border: `1px solid ${COLORES.borde}` }}
          >
            <p className="font-medium mb-1" style={{ color: COLORES.acento }}>Menstrual (días 1 a 5 aprox.)</p>
            <p className="mb-2" style={{ color: COLORES.textoSecundario }}>Cuando tenés tu período.</p>
            <p className="font-medium mb-1" style={{ color: COLORES.textoSecundario }}>Folicular (después del período)</p>
            <p className="mb-2" style={{ color: COLORES.textoSecundario }}>Los días siguientes, hasta la ovulación.</p>
            <p className="font-medium mb-1" style={{ color: COLORES.textoSecundario }}>Ovulación (mitad del ciclo)</p>
            <p className="mb-2" style={{ color: COLORES.textoSecundario }}>Alrededor del día 14, aprox.</p>
            <p className="font-medium mb-1" style={{ color: COLORES.textoSecundario }}>Lútea (previo al próximo período)</p>
            <p style={{ color: COLORES.textoSecundario }}>Los días antes de que vuelva a empezar.</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {FASES_CICLO.map((f) => {
            const activo = valores.fase_ciclo === f.valor
            return (
              <button
                key={f.valor}
                type="button"
                onClick={() => elegirFase(f.valor)}
                className="text-left px-3 py-2.5 rounded-xl text-sm transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: activo ? COLORES.acento : COLORES.fondoTarjeta,
                  color: activo ? 'var(--ui-texto-sobre-acento)' : f.valor === 'no_responde' ? COLORES.textoMuted : COLORES.textoSecundario,
                  border: `1px solid ${COLORES.borde}`,
                  fontWeight: activo ? 500 : 400,
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>
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

export default FormularioWellness
