import { useId, useState } from 'react'
import EstadoContenido from '../ui/EstadoContenido'

const INDICADORES = [['minutos', 'Minutos'], ['partidos', 'Partidos'], ['goles', 'Goles'], ['asistencias', 'Asistencias']]

/** Presentación de los acumulados originales; las barras no implican continuidad observada. */
export default function GraficoTemporadasPerfil({ estadisticasPorAnio }) {
  const [indicador, setIndicador] = useState('minutos')
  const id = useId()
  const temporadas = estadisticasPorAnio.filter(a => /^\d{4}$/.test(a.anio)).slice().sort((a, b) => a.anio.localeCompare(b.anio))
  const sinFecha = estadisticasPorAnio.some(a => !/^\d{4}$/.test(a.anio))
  const etiqueta = INDICADORES.find(([clave]) => clave === indicador)[1]
  const maximo = Math.max(1, ...temporadas.map(a => a[indicador]))
  return <section className="perfil-panel perfil-temporadas" aria-labelledby={id}>
    <div className="perfil-titulo-panel"><div><p className="perfil-sobretitulo">REGISTROS DEPORTIVOS</p><h2 id={id}>Temporadas en perspectiva</h2></div>
      <label>Indicador<select value={indicador} onChange={e => setIndicador(e.target.value)}>{INDICADORES.map(([clave, nombre]) => <option key={clave} value={clave}>{nombre}</option>)}</select></label></div>
    <p className="perfil-nota">Acumulados por año de los registros deportivos disponibles. No acredita cobertura completa de temporada.</p>
    {temporadas.length === 0 ? <EstadoContenido estado="insuficiente" titulo="Sin temporadas fechadas" mensaje="No se puede representar una evolución sin fechas válidas." /> : <>
      {temporadas.length === 1 && <p className="perfil-nota">Una temporada disponible: se muestra su acumulado, sin inferir evolución.</p>}
      <div className="perfil-barras-temporadas" role="list" aria-label={`${etiqueta} por temporada`}>
        {temporadas.map(a => <div className="perfil-barra-temporada" role="listitem" key={a.anio}>
          <span className="perfil-anio">{a.anio}</span><div className="perfil-pista-barra" aria-hidden="true"><span style={{ width: `${a[indicador] / maximo * 100}%` }} /></div><strong>{a[indicador]} <span>{etiqueta.toLowerCase()}</span></strong>
        </div>)}
      </div>
      <p className="perfil-nota">Escala independiente por indicador, desde 0 hasta {maximo}. No es una calificación de rendimiento.</p>
    </>}
    {sinFecha && <p className="perfil-nota">Hay registros sin fecha: permanecen en los totales y se excluyen del gráfico temporal.</p>}
  </section>
}
