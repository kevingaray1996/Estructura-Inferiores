import './panelDeportivo.css'

/** Recibe valores calculados; cero es un dato válido, nunca una ausencia. */
export default function TarjetaIndicador({ etiqueta, valor, unidad, periodo, cobertura, sinDato = false, mensajeSinDato = 'Sin datos' }) {
  const ausente = sinDato || valor == null || (typeof valor === 'string' && valor.trim() === '') ||
    (typeof valor === 'number' && !Number.isFinite(valor))
  return <div className="dp-indicador" data-sin-dato={ausente || undefined}>
    <dl>
      <dt className="dp-indicador-etiqueta">{etiqueta}</dt>
      <dd className="dp-indicador-valor">{ausente ? <span className="dp-indicador-ausente">{mensajeSinDato}</span> :
        <>{valor}{unidad && <span className="dp-indicador-unidad">{unidad}</span>}</>}</dd>
    </dl>
    {periodo && <p className="dp-indicador-contexto">{periodo}</p>}
    {cobertura && <p className="dp-indicador-contexto">{cobertura}</p>}
  </div>
}
