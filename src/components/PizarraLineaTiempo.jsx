import { memo } from 'react'
import PizarraCancha from './PizarraCancha'
import { PALETA } from '../utils/pizarra'

// Íconos propios (los caracteres ⏮ ⏭ se ven como emoji en iPhone).
const RUTAS = {
  inicio: 'M6 5v14M19 5 9 12l10 7z', anterior: 'M15 5 8 12l7 7', siguiente: 'm9 5 7 7-7 7', fin: 'M18 5v14M5 5l10 7-10 7z',
  reproducir: 'M7 4.5v15L19.5 12z', pausa: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z', bucle: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
}
function Icono({ nombre }) {
  const lleno = ['reproducir', 'pausa', 'inicio', 'fin'].includes(nombre)
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill={lleno ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={RUTAS[nombre]} /></svg>
}

const VELOCIDADES = [.25, .5, 1, 1.5, 2, 3]
const RECORRIDOS = [['estela', 'Estela'], ['completo', 'Completo'], ['oculto', 'Ocultos']]

// Barra de reproducción siempre visible: transporte, línea de tiempo con una marca por paso,
// chips de pasos con "+ Paso" y el menú Ver. La edición del paso queda plegada al final.
export default memo(function PizarraLineaTiempo({
  doc, indice, indiceVisible, animando, tiempo, total, tiempos, reproduciendo, velocidad, bucle, soloLectura, bloqueado, miniaturas,
  onReproducir, onPaso, onAnterior, onSiguiente, onBuscar, onVelocidad, onBucle, onAgregar,
  vista, onVista, onNombre, onDuracion, onOrdenar, onEliminar,
  recorrido = 'suave', onRecorrido, jugadoras = [], onTexto, onPausa, onPase, onFoco,
}) {
  const ultimo = doc.pasos.length - 1, paso = doc.pasos[indice]
  const segundos = v => v.toFixed(1).replace('.', ',')
  const etiquetaTiempo = `${segundos(tiempo)} / ${segundos(total)} s`
  return <section className="pizarra-linea" aria-label="Reproducción y pasos">
    <div className="pizarra-transporte" role="group" aria-label="Reproducción">
      <button type="button" className="pizarra-icono" aria-label="Ir al primer paso" title="Primer paso" onClick={() => onPaso(0)}><Icono nombre="inicio" /></button>
      <button type="button" className="pizarra-icono" aria-label="Paso anterior" title="Paso anterior" disabled={!animando && indice === 0} onClick={onAnterior}><Icono nombre="anterior" /></button>
      <button type="button" className="pizarra-reproducir" aria-label={reproduciendo ? 'Pausar' : 'Reproducir'} title={reproduciendo ? 'Pausar (espacio)' : 'Reproducir (espacio)'} disabled={doc.pasos.length < 2} onClick={onReproducir}><Icono nombre={reproduciendo ? 'pausa' : 'reproducir'} /></button>
      <button type="button" className="pizarra-icono" aria-label="Paso siguiente" title="Paso siguiente" disabled={(animando ? indiceVisible : indice) >= ultimo} onClick={onSiguiente}><Icono nombre="siguiente" /></button>
      <button type="button" className="pizarra-icono" aria-label="Ir al último paso" title="Último paso" onClick={() => onPaso(ultimo)}><Icono nombre="fin" /></button>
      <span className="pizarra-tiempo" aria-live="off">{etiquetaTiempo}</span>
      <label className="pizarra-velocidad"><span className="pizarra-solo-lector">Velocidad</span>
        <select aria-label="Velocidad" value={velocidad} onChange={e => onVelocidad(Number(e.target.value))}>{VELOCIDADES.map(v => <option key={v} value={v}>{String(v).replace('.', ',')}×</option>)}</select>
      </label>
      <button type="button" className="pizarra-icono" aria-label="Repetir en bucle" title="Repetir en bucle" aria-pressed={bucle} onClick={() => onBucle(!bucle)}><Icono nombre="bucle" /></button>
      <details className="pizarra-ver"><summary aria-label="Opciones de vista" title="Opciones de vista">Ver</summary>
        <div className="pizarra-ver-panel">
          <fieldset><legend>Recorridos al reproducir</legend>
            {RECORRIDOS.map(([valor, nombre]) => <label key={valor}><input type="radio" name="pizarra-recorridos" checked={vista.estela === valor} onChange={() => onVista({ estela: valor })} /> {nombre}</label>)}
          </fieldset>
          <label><input type="checkbox" checked={vista.flechas} onChange={e => onVista({ flechas: e.target.checked })} /> Flechas automáticas entre pasos</label>
          {!soloLectura && <label><input type="checkbox" checked={vista.fantasmas} onChange={e => onVista({ fantasmas: e.target.checked })} /> Ver el paso anterior</label>}
          {!soloLectura && <fieldset disabled={bloqueado && !reproduciendo}><legend>Movimiento</legend>
            {[['suave', 'Suave'], ['recto', 'Recto']].map(([valor, nombre]) => <label key={valor}><input type="radio" name="pizarra-movimiento" checked={recorrido === valor} onChange={() => onRecorrido(valor)} /> {nombre}</label>)}
            <small>Se guarda con el ejercicio.</small>
          </fieldset>}
        </div>
      </details>
    </div>
    <div className="pizarra-regla">
      <input type="range" aria-label="Línea de tiempo" aria-valuetext={etiquetaTiempo} min="0" max={Math.max(total, .01)} step=".05" value={Math.min(tiempo, total)} disabled={doc.pasos.length < 2} onChange={e => onBuscar(Number(e.target.value))} />
      <div className="pizarra-marcas" aria-hidden="true">{total > 0 && tiempos.map((t, i) => <span key={doc.pasos[i].id} className={i === indiceVisible ? 'pizarra-marca-activa' : undefined} style={{ left: `${t / total * 100}%` }} />)}</div>
    </div>
    <div className="pizarra-chips" aria-label="Pasos">
      {doc.pasos.map((p, i) => <button type="button" key={p.id} className="pizarra-chip" aria-label={`Paso ${i + 1}: ${p.nombre}`} title={p.nombre} aria-pressed={!animando && indice === i} aria-current={animando && indiceVisible === i ? 'step' : undefined} onClick={() => onPaso(i)}>
        {miniaturas && (doc.pasos.length <= 12 || Math.abs(indice - i) <= 2) && <PizarraCancha miniatura doc={doc} poses={p.poses} />}
        <span><b>{i + 1}</b> {p.nombre}</span>
      </button>)}
      {!soloLectura && <button type="button" className="pizarra-chip pizarra-agregar-paso" aria-label="Agregar paso" title="Agregar paso: copia el paso actual" disabled={doc.pasos.length >= 60 || bloqueado} onClick={onAgregar}>+ Paso</button>}
    </div>
    {!soloLectura && <details className="pizarra-editar-paso"><summary>Editar paso {indice + 1}</summary>
      <fieldset disabled={bloqueado} className="pizarra-fila">
        <label>Nombre del paso<input maxLength={80} value={paso.nombre} onChange={e => onNombre(e.target.value)} /></label>
        <label>Transición hacia este paso (s)<input type="number" min=".1" max="60" step=".1" value={paso.duracion} onChange={e => onDuracion(Number(e.target.value))} /></label>
        <label>Pausa al llegar (s)<input type="number" min="0" max="30" step=".5" value={paso.pausa} onChange={e => onPausa(Number(e.target.value))} /></label>
        <label className="pizarra-subtitulo-campo">Subtítulo del paso<textarea maxLength={200} rows={2} placeholder="Ej.: la 6 baja a recibir entre centrales" value={paso.texto} onChange={e => onTexto(e.target.value)} /></label>
        {indice > 0 && <div className="pizarra-segmentado" role="group" aria-label="Pase hacia este paso">
          <span>Pase hacia este paso</span>
          {[['bajo', 'Bajo'], ['alto', 'Alto']].map(([valor, nombre]) => <button type="button" key={valor} aria-pressed={paso.pase === valor} onClick={() => onPase(valor)}>{nombre}</button>)}
        </div>}
        <label>Foco en<select value={paso.foco || ''} onChange={e => onFoco(e.target.value)}>
          <option value="">Nadie</option>
          {jugadoras.map(j => <option key={j.id} value={j.id}>{j.color.toLowerCase() === PALETA.rival.toLowerCase() ? 'Rival' : 'Propia'}{j.numero ? ` N.º ${j.numero}` : ''}{j.texto ? ` · ${j.texto}` : ''}</option>)}
        </select></label>
        <button type="button" disabled={!indice} onClick={() => onOrdenar(-1)}>Mover paso antes</button>
        <button type="button" disabled={indice === ultimo} onClick={() => onOrdenar(1)}>Mover paso después</button>
        <button type="button" disabled={doc.pasos.length === 1} onClick={onEliminar}>Eliminar paso</button>
      </fieldset>
    </details>}
  </section>
})
