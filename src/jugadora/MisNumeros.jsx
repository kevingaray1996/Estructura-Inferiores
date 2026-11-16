import { useEffect, useState } from 'react'
import { obtenerNumeros } from './portal'
import { asistenciaSobreSesiones } from '../utils/asistencia'

function Dato({ valor, etiqueta }) {
  return (
    <div className="jg-dato">
      <dt className="jg-dato-etiqueta">{etiqueta}</dt>
      <dd className="jg-dato-valor">{valor}</dd>
    </div>
  )
}

// Solo sus números: partidos (jugados, titularidades, minutos) y asistencia a entrenamientos con porcentaje.
// "Justificadas" suma lesionado y enfermo, sin mostrar el motivo.
function MisNumeros() {
  const [anio, setAnio] = useState(null)
  const [lectura, setLectura] = useState({ estado: 'cargando' })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let activo = true
    obtenerNumeros(anio).then(({ data, error }) => {
      if (!activo) return
      setLectura(error || !data ? { estado: 'error' } : { estado: 'ok', datos: data })
    })
    return () => { activo = false }
  }, [anio, intento])

  function cambiarAnio(valor) {
    setLectura({ estado: 'cargando' })
    setAnio(Number(valor))
  }

  if (lectura.estado === 'cargando') return <p className="jg-texto" role="status">Cargando tus números…</p>
  if (lectura.estado === 'error') {
    return (
      <div className="jg-tarjeta jg-form" role="alert">
        <p className="jg-texto">No se pudieron cargar tus números. Revisá la conexión y probá de nuevo.</p>
        <button type="button" className="jg-boton jg-boton-principal" onClick={() => { setLectura({ estado: 'cargando' }); setIntento(i => i + 1) }}>Reintentar</button>
      </div>
    )
  }

  const { datos } = lectura
  const anios = datos.anios?.length ? datos.anios : [datos.anio]
  const { partidos, asistencia } = datos
  // Mismo cálculo que el PDF de perfil. El campo porcentaje de la base no se usa: la base cuenta sobre todos los
  // registros y acá (como en el PDF) lesionada y enferma no cuentan como sesión.
  const calculo = asistenciaSobreSesiones(asistencia)
  return (
    <div className="jg-pila">
      <label className="jg-campo-anio">
        <span className="jg-etiqueta">Año</span>
        <select className="jg-input" value={datos.anio} onChange={e => cambiarAnio(e.target.value)}>
          {anios.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </label>

      <section className="jg-tarjeta" aria-labelledby="jg-partidos">
        <h2 id="jg-partidos" className="jg-subtitulo">Partidos</h2>
        <dl className="jg-datos">
          <Dato valor={partidos.jugados} etiqueta="Jugados" />
          <Dato valor={partidos.titularidades} etiqueta="Titular" />
          <Dato valor={`${partidos.minutos}'`} etiqueta="Minutos" />
        </dl>
      </section>

      <section className="jg-tarjeta" aria-labelledby="jg-entrenamientos">
        <h2 id="jg-entrenamientos" className="jg-subtitulo">Entrenamientos</h2>
        {calculo
          ? <p className="jg-porcentaje"><span className="jg-porcentaje-valor">{calculo.porcentaje} %</span> de asistencia {calculo.detalle}</p>
          : <p className="jg-texto">Sin registros este año.</p>}
        <dl className="jg-datos jg-datos-4">
          <Dato valor={asistencia.presentes} etiqueta="Presentes" />
          <Dato valor={asistencia.tardes} etiqueta="Tardes" />
          <Dato valor={asistencia.ausentes} etiqueta="Ausentes" />
          <Dato valor={asistencia.justificadas} etiqueta="Justificadas" />
        </dl>
        <p className="jg-texto jg-texto-suave">El porcentaje cuenta presentes y tardes. Las ausencias justificadas no cuentan como sesión.</p>
      </section>
    </div>
  )
}

export default MisNumeros
