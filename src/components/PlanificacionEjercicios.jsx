import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AMBITOS, carpetasDe, filtrarEjercicios, idYoutube, TIPOS, valoresDistintos } from '../utils/biblioteca'
import { AMBITOS_BLOQUE, cambiaLaBiblioteca, camposDe } from '../utils/planificacion'
import BibliotecaVista from './BibliotecaVista'
import PizarraEjercicio from './PizarraEjercicio'
import './biblioteca.css'

// Las ventanas van al body: secciones con transform/filter encerrarían a un "position: fixed".
const flotante = nodo => typeof document === 'undefined' ? nodo : createPortal(nodo, document.body)

// Etapa E: los ejercicios de una sesión se eligen de la biblioteca de su ámbito y se editan en su propia ficha.
const etiquetas = { objetivo: 'Objetivo', duracion: 'Duración (min)', indicaciones: 'Consignas', series: 'Series', repeticiones: 'Repeticiones', materiales: 'Materiales',
  imagen_url: 'Imagen', link_video: 'Video', pizarra: 'Pizarra animada', carga: 'Carga', tecnica: 'Técnica', demostracion: 'Demostración' }

export function SelectorBiblioteca({ ambito, biblioteca, carpetas, favoritos, agregar, cerrar, titulo }) {
  const [ambitoLibre, setAmbitoLibre] = useState(ambito || 'cancha')
  const efectivo = ambito || ambitoLibre
  const [filtros, setFiltros] = useState({ texto: '', carpeta: '', tipo: '', musculo: '', soloFavoritos: false })
  const [agregados, setAgregados] = useState([])
  const lista = useMemo(() => carpetasDe(carpetas, efectivo, biblioteca), [carpetas, efectivo, biblioteca])
  const fija = lista.find(c => c.sistema)?.id || null
  const visibles = useMemo(() => filtrarEjercicios(biblioteca, { ...filtros, ambito: efectivo }, favoritos, fija), [biblioteca, filtros, efectivo, favoritos, fija])
  const musculos = valoresDistintos(biblioteca.filter(e => e.ambito === efectivo), e => e.musculos)
  const filtrar = c => setFiltros(f => ({ ...f, ...c }))
  return flotante(<div className="bib-ficha-fondo" role="presentation" onClick={e => { if (e.target === e.currentTarget) cerrar() }}>
    <section className="bib-ficha plan-selector" role="dialog" aria-modal="true" aria-label={`Agregar desde la biblioteca de ${AMBITOS[efectivo]}`}>
      <header><div><p>{titulo}</p><h2>Agregar desde biblioteca</h2></div>
        <button type="button" aria-label="Cerrar" onClick={cerrar}>✕</button></header>
      {!ambito && <div className="bib-segmentado" role="group" aria-label="Ámbito">{Object.entries(AMBITOS).map(([a, n]) =>
        <button type="button" key={a} aria-pressed={efectivo === a} onClick={() => { setAmbitoLibre(a); setFiltros(f => ({ ...f, carpeta: '', tipo: '', musculo: '' })) }}>{n}</button>)}</div>}
      <div className="plan-selector-filtros">
        <label className="bib-campo bib-buscar"><span>Buscar</span><input type="search" autoFocus value={filtros.texto} onChange={e => filtrar({ texto: e.target.value })} placeholder="Nombre, objetivo…" /></label>
        <label className="bib-campo"><span>Carpeta</span><select value={filtros.carpeta} onChange={e => filtrar({ carpeta: e.target.value })}>
          <option value="">Todas</option>{lista.map(c => <option key={c.id} value={c.sistema ? 'sin' : c.id}>{c.nombre} ({c.cantidad})</option>)}</select></label>
        {efectivo === 'cancha'
          ? <label className="bib-campo"><span>Tipo</span><select value={filtros.tipo} onChange={e => filtrar({ tipo: e.target.value })}><option value="">Todos</option>{Object.entries(TIPOS).map(([v, n]) => <option key={v} value={v}>{n}s</option>)}</select></label>
          : <label className="bib-campo"><span>Grupo muscular</span><select value={filtros.musculo} onChange={e => filtrar({ musculo: e.target.value })}><option value="">Todos</option>{musculos.map(m => <option key={m} value={m}>{m}</option>)}</select></label>}
        <button type="button" className="bib-solo-favoritos" aria-pressed={filtros.soloFavoritos} onClick={() => filtrar({ soloFavoritos: !filtros.soloFavoritos })}>{filtros.soloFavoritos ? '★' : '☆'} Favoritos</button>
      </div>
      <div className="plan-selector-lista">
        {visibles.map(e => <article key={e.id} className="plan-selector-item">
          <div className="plan-selector-vista"><BibliotecaVista e={e} /></div>
          <div><strong>{favoritos.has(e.id) ? '★ ' : ''}{e.contenido || 'Ejercicio'}</strong>
            <small>{[e.ambito === 'cancha' && e.tipo === 'jugada' ? 'Jugada' : '', e.duracion_minutos ? `${e.duracion_minutos} min` : '', ...(e.musculos || []).slice(0, 2)].filter(Boolean).join(' · ')}</small></div>
          <button type="button" aria-label={`Agregar ${e.contenido}`} onClick={() => { agregar(e); setAgregados(a => [...a, e.id]) }}>{agregados.includes(e.id) ? `✓ ${agregados.filter(x => x === e.id).length > 1 ? `×${agregados.filter(x => x === e.id).length}` : 'Agregado'}` : '+ Agregar'}</button>
        </article>)}
        {!visibles.length && <p className="bib-agregar-nota">{biblioteca.some(e => e.ambito === efectivo) ? 'Nada para estos filtros.' : `La biblioteca de ${AMBITOS[efectivo]} todavía está vacía.`}</p>}
      </div>
      <div className="bib-acciones-form"><span className="plan-selector-cuenta" role="status">{agregados.length ? `${agregados.length} agregado(s) al bloque` : ''}</span>
        <button type="button" data-primario="" onClick={cerrar}>Listo</button></div>
    </section>
  </div>)
}

function Campo({ titulo, valor, cambiar, tipo = 'text', ancho = false, ...props }) {
  return <label className={`bib-campo${ancho ? ' bib-ancho' : ''}`}><span>{titulo}</span>{tipo === 'textarea'
    ? <textarea rows={3} value={valor ?? ''} onChange={e => cambiar(e.target.value)} {...props} />
    : <input type={tipo} value={valor ?? ''} onChange={e => cambiar(e.target.value)} {...props} />}</label>
}

// Ficha de un ejercicio de la sesión. Al aplicar, si cambió algo de lo que comparte con la biblioteca y hay permiso,
// pregunta si el cambio es solo para ese día o también para la biblioteca.
export function EditorTarea({ tarea, ambito, categoriaId, puedeBiblioteca, onAplicar, onCerrar }) {
  const [e, setE] = useState(tarea), [preguntar, setPreguntar] = useState(false)
  const gimnasio = ambito === 'gimnasio' || e.tecnica != null
  const campos = camposDe(gimnasio ? 'gimnasio' : 'cancha')
  const cambiar = c => setE(x => ({ ...x, ...c }))
  const enBiblioteca = Boolean(e.biblioteca_id), cambio = enBiblioteca && cambiaLaBiblioteca(tarea, e)
  function aplicar() { if (cambio && puedeBiblioteca) setPreguntar(true); else onAplicar(e, false) }
  return flotante(<div className="bib-ficha-fondo" role="presentation" onClick={ev => { if (ev.target === ev.currentTarget && !preguntar) onCerrar() }}>
    <section className="bib-ficha plan-editor-tarea" role="dialog" aria-modal="true" aria-labelledby="plan-tarea-titulo">
      <header><div><p>{AMBITOS_BLOQUE[gimnasio ? 'gimnasio' : 'cancha']}{enBiblioteca ? ' · De la biblioteca' : ' · Tarea libre'}</p><h2 id="plan-tarea-titulo">{e.nombre || 'Ejercicio'}</h2></div>
        <button type="button" aria-label="Cerrar" onClick={onCerrar}>✕</button></header>
      {preguntar ? <div className="plan-pregunta" role="alertdialog" aria-labelledby="plan-pregunta-titulo">
        <h3 id="plan-pregunta-titulo">¿Solo para este día o también en la biblioteca?</h3>
        <p>Cambiaste datos del ejercicio (nombre, consignas{gimnasio ? ', técnica o demostración' : ', pizarra'}…). Series, repeticiones, carga y notas siempre son solo de este día.</p>
        <div className="bib-acciones-form">
          <button type="button" onClick={() => setPreguntar(false)}>Volver</button>
          <button type="button" onClick={() => onAplicar(e, false)}>Solo este día</button>
          <button type="button" data-primario="" onClick={() => onAplicar(e, true)}>También en la biblioteca</button>
        </div>
      </div> : <>
        <div className="bib-form">
          <Campo titulo="Nombre" valor={e.nombre} cambiar={nombre => cambiar({ nombre })} ancho maxLength={120} />
          <Campo titulo="Series" valor={e.series} cambiar={series => cambiar({ series })} maxLength={40} />
          <Campo titulo="Repeticiones" valor={e.repeticiones} cambiar={repeticiones => cambiar({ repeticiones })} maxLength={40} />
          {gimnasio && <Campo titulo="Carga" valor={e.carga} cambiar={carga => cambiar({ carga })} maxLength={80} placeholder="Ej.: 70% 1RM, 12 kg" />}
          <Campo titulo="Duración (min)" tipo="number" min="0.1" max="1440" step="any" valor={e.duracion} cambiar={duracion => cambiar({ duracion })} />
          <Campo titulo="Objetivo" valor={e.objetivo} cambiar={objetivo => cambiar({ objetivo })} ancho />
          <Campo titulo="Consignas" tipo="textarea" valor={e.indicaciones} cambiar={indicaciones => cambiar({ indicaciones })} ancho />
          {gimnasio && <Campo titulo="Puntos clave de técnica" tipo="textarea" valor={e.tecnica} cambiar={tecnica => cambiar({ tecnica })} ancho maxLength={2000} />}
          {gimnasio && <Campo titulo="Demostración (link de YouTube)" valor={e.demostracion?.tipo === 'youtube' ? e.demostracion.url : ''} ancho placeholder={e.demostracion?.tipo === 'imagen' ? 'Tiene una imagen de la biblioteca' : 'https://www.youtube.com/watch?v=…'}
            cambiar={url => cambiar({ demostracion: url ? (idYoutube(url) ? { tipo: 'youtube', url, credito: e.demostracion?.credito || '' } : e.demostracion) : (e.demostracion?.tipo === 'imagen' ? e.demostracion : null) })} />}
          {!gimnasio && <Campo titulo="Materiales" valor={e.materiales} cambiar={materiales => cambiar({ materiales })} />}
          {!gimnasio && <Campo titulo="Link de video" valor={e.link_video} cambiar={link_video => cambiar({ link_video })} />}
          {!gimnasio && <div className="bib-campo bib-ancho"><span>Pizarra</span>
            <PizarraEjercicio valor={e.pizarra} miniatura={e.pizarra_miniatura} nombre={e.nombre || 'Ejercicio'} categoriaId={categoriaId} onChange={(pizarra, pizarra_miniatura) => cambiar({ pizarra, pizarra_miniatura })} />
            {e.pizarra && <button type="button" className="bib-quitar" onClick={() => { if (window.confirm('¿Quitar la pizarra de este ejercicio?')) cambiar({ pizarra: null, pizarra_miniatura: '' }) }}>Quitar pizarra</button>}
          </div>}
          <Campo titulo="Notas internas (privadas)" tipo="textarea" valor={e.notas_internas} cambiar={notas_internas => cambiar({ notas_internas })} ancho />
        </div>
        <details className="plan-compartir"><summary>Qué ven las jugadoras</summary>
          <label><input type="checkbox" checked={e.visible === true} onChange={ev => cambiar({ visible: ev.target.checked })} /> Compartir este ejercicio al publicar</label>
          <div className="bib-sugerencias">{campos.map(c => <label key={c}><input type="checkbox" checked={e.campos_publicos?.includes(c) || false}
            onChange={ev => cambiar({ campos_publicos: ev.target.checked ? [...(e.campos_publicos || []), c] : (e.campos_publicos || []).filter(x => x !== c) })} /> {etiquetas[c]}</label>)}</div>
          <small>El nombre siempre se comparte; las notas internas nunca.</small>
        </details>
        {cambio && !puedeBiblioteca && <p className="bib-agregar-nota">Este cambio queda solo para este día (tu rol no edita la biblioteca de {gimnasio ? 'Gimnasio' : 'Cancha'}).</p>}
        <div className="bib-acciones-form">
          <button type="button" onClick={onCerrar}>Cancelar</button>
          <button type="button" data-primario="" onClick={aplicar}>Aplicar</button>
        </div>
      </>}
    </section>
  </div>)
}
