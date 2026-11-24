import { useRef, useState } from 'react'
import { useTiempoVideo } from '../../utils/relojVideo'
import { colorDe } from '../../utils/analisis/catalogoAcciones'
import { formatearTiempo } from '../../utils/analisis/formato'
import {
  ZOOMS, ajustarArrastre, duracionEje, filasLinea, porcentajeDe, segundoDeArrastre, segundoDePorcentaje, ventanaVisible,
} from '../../utils/analisis/lineaTiempo'
import { NOMBRE_ESTADO } from '../../utils/analisis/posesion'
import './colectiva.css'
import './estadisticasVisuales.css'

const MARCAS = [['inicio_1t', 'Inicio 1T'], ['fin_1t', 'Fin 1T'], ['inicio_2t', 'Inicio 2T'], ['fin_partido', 'Fin']]
const SALTO_MS = 180

function esTactil() {
  try { return window.matchMedia('(hover: none) and (pointer: coarse)').matches } catch { return false }
}

// Línea de tiempo estilo editor de video, debajo del video.
// momentos: los colectivos de la vista elegida (con espejo ya calculado). individuales: acciones con jugadora.
// editable: coordinación en compu (arrastrar bordes o la barra entera). En el celular y en modo consulta, solo mirar
// y reproducir. onAjustar(barra, { segundo, segundo_fin }) guarda; onIr(segundo) mueve el video; onReproducir(barra).
// posesion (etapa 3): la línea de posesión (amarillo analizado, blanco el otro, gris detenida, rayado sin datos).
// onAjustarPosesion(tramo, { segundo, segundo_fin }): coordinación arrastra los bordes como en las otras barras.
// dibujos (etapa 4): clips con dibujos [{ id, inicio, fin, etiqueta }]; onReproducirDibujo(clip) los muestra con sus dibujos.
export default function LineaTiempo({
  reloj, catalogo, momentos, individuales, marcas, obtenerDuracionVideo, editable, vista, onVista, equipos,
  seleccionadoId, onReproducir, onIr, onAjustar, etiquetaDe, posesion = [], onAjustarPosesion = null,
  dibujos = [], onReproducirDibujo = null,
}) {
  const segundo = useTiempoVideo(reloj)
  const duracion = duracionEje({ duracionVideo: obtenerDuracionVideo?.(), momentos, eventos: individuales, marcas })
  const [zoom, setZoom] = useState('todo')
  const [arrastre, setArrastre] = useState(null)
  const ultimoSalto = useRef(0)
  const [tactil] = useState(esTactil)
  const puedeEditar = editable && !tactil && vista === 'analizado'

  const zoomSegundos = ZOOMS.find((z) => z.id === zoom)?.segundos ?? null
  // Mientras se arrastra, la ventana queda quieta (el video salta y no debe mover la escala).
  const ventana = arrastre?.ventana || ventanaVisible(segundo, zoomSegundos, duracion)
  const { filas, puntos } = filasLinea({ momentos, individuales, catalogo })
  const visible = (desde, hasta) => hasta >= ventana.desde && desde <= ventana.hasta
  const pos = (s) => Math.min(100, Math.max(0, porcentajeDe(s, ventana)))

  function empezar(evento, barra, modo) {
    if (!puedeEditar || barra._cola || evento.button > 0) return
    if (barra._posesion && (barra.estado === 'sin_datos' || !onAjustarPosesion)) return
    evento.stopPropagation()
    const pista = evento.currentTarget.closest('.lt-pista')
    const ancho = pista?.getBoundingClientRect().width || 1
    try { evento.currentTarget.setPointerCapture(evento.pointerId) } catch { /* Sin captura. */ }
    setArrastre({ id: barra.id, modo, original: barra, x0: evento.clientX, ancho, ventana, ajuste: { segundo: barra.inicio, segundo_fin: barra.fin }, movido: false })
  }

  function mover(evento) {
    if (!arrastre) return
    const dx = evento.clientX - arrastre.x0
    const delta = (dx / arrastre.ancho) * (arrastre.ventana.hasta - arrastre.ventana.desde)
    const ajuste = ajustarArrastre(arrastre.original, arrastre.modo, delta, { duracion })
    const movido = arrastre.movido || Math.abs(dx) > 3
    setArrastre({ ...arrastre, ajuste, movido })
    const ahora = Date.now()
    if (movido && ahora - ultimoSalto.current > SALTO_MS) {
      ultimoSalto.current = ahora
      onIr(segundoDeArrastre(ajuste, arrastre.modo))
    }
  }

  function soltar() {
    if (!arrastre) return
    const { original, ajuste, movido } = arrastre
    setArrastre(null)
    if (!movido) { if (original._posesion) onIr(original.inicio); else onReproducir(original); return }
    if (ajuste.segundo !== original.inicio || ajuste.segundo_fin !== original.fin) {
      if (original._posesion) onAjustarPosesion?.(original, ajuste)
      else onAjustar(original, ajuste)
    }
  }

  function tocarPista(evento) {
    const caja = evento.currentTarget.getBoundingClientRect()
    const porcentaje = ((evento.clientX - caja.left) / Math.max(1, caja.width)) * 100
    onIr(Math.max(0, Math.round(segundoDePorcentaje(porcentaje, ventana))))
  }

  const marcasVisibles = MARCAS.filter(([clave]) => marcas?.[clave] != null && visible(marcas[clave], marcas[clave]))

  return (
    <section className="lt" aria-label="Línea de tiempo">
      <div className="lt-barra-sup">
        <h3>Línea de tiempo</h3>
        {equipos && (
          <div className="az-segmento" role="group" aria-label="Ver los momentos desde">
            <button type="button" aria-pressed={vista === 'analizado'} onClick={() => onVista('analizado')}>{equipos.analizado}</button>
            <button type="button" aria-pressed={vista === 'otro'} onClick={() => onVista('otro')}>{equipos.otro}</button>
          </div>
        )}
        <div className="flex gap-1" role="group" aria-label="Zoom">
          {ZOOMS.map((z) => (
            <button key={z.id} type="button" className="lt-control" aria-pressed={zoom === z.id} onClick={() => setZoom(z.id)}>{z.texto}</button>
          ))}
        </div>
      </div>

      <div className="lt-scroll">
        <div className="lt-tabla">
          <div className="lt-fila">
            <span className="lt-etiqueta">Tiempos</span>
            <div className="lt-pista" onClick={tocarPista} role="presentation">
              {marcasVisibles.map(([clave, texto]) => (
                <span key={clave} className="lt-marca" style={{ left: `${pos(marcas[clave])}%` }}><span>{texto}</span></span>
              ))}
            </div>
          </div>

          {posesion.length > 0 && (
            <div className="lt-fila">
              <span className="lt-etiqueta" title="Posesión">Posesión</span>
              <div className="lt-pista" onClick={tocarPista} role="presentation">
                {posesion.map((tramo) => {
                  const original = { ...tramo, id: `pos:${tramo.periodo}:${tramo.inicio}`, _posesion: true }
                  const enArrastre = arrastre?.id === original.id
                  const inicio = enArrastre ? arrastre.ajuste.segundo : original.inicio
                  const fin = enArrastre ? arrastre.ajuste.segundo_fin : original.fin
                  if (!visible(inicio, fin)) return null
                  const izquierda = pos(inicio)
                  const ajustable = puedeEditar && onAjustarPosesion && tramo.estado !== 'sin_datos'
                  const nombre = tramo.estado === 'analizado' ? equipos?.analizado || NOMBRE_ESTADO.analizado
                    : tramo.estado === 'otro' ? equipos?.otro || NOMBRE_ESTADO.otro : NOMBRE_ESTADO[tramo.estado]
                  const texto = `Posesión: ${nombre} de ${formatearTiempo(inicio)} a ${formatearTiempo(fin)}${tramo.origen === 'manual' ? ' · marcada a mano' : tramo.origen === 'auto' ? ' · por los momentos' : ''}`
                  return (
                    <button key={original.id} type="button" className="lt-pos" data-estado={tramo.estado} data-origen={tramo.origen || undefined}
                      data-editable={ajustable ? 'si' : undefined}
                      style={{ left: `${izquierda}%`, width: `${Math.max(0.2, pos(fin) - izquierda)}%` }}
                      aria-label={texto} title={texto}
                      onClick={(e) => { e.stopPropagation(); if (!ajustable || e.detail === 0) onIr(tramo.inicio) }}
                      onPointerDown={(e) => empezar(e, original, 'mover')} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={() => setArrastre(null)}>
                      {ajustable && <>
                        <span className="lt-borde" data-lado="inicio" aria-hidden="true"
                          onPointerDown={(e) => empezar(e, original, 'inicio')} onPointerMove={mover} onPointerUp={soltar} />
                        <span className="lt-borde" data-lado="fin" aria-hidden="true"
                          onPointerDown={(e) => empezar(e, original, 'fin')} onPointerMove={mover} onPointerUp={soltar} />
                      </>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {dibujos.length > 0 && (
            <div className="lt-fila">
              <span className="lt-etiqueta" title="Clips con dibujos">✎ Dibujos</span>
              <div className="lt-pista" onClick={tocarPista} role="presentation" style={{ '--lt-color': 'var(--ui-acento)' }}>
                {dibujos.filter((d) => visible(d.inicio, d.fin)).map((d) => {
                  const izquierda = pos(d.inicio)
                  const texto = `Dibujos: ${d.etiqueta} de ${formatearTiempo(d.inicio)} a ${formatearTiempo(d.fin)}`
                  return (
                    <button key={d.id} type="button" className="lt-barra" data-dibujo="si"
                      style={{ left: `${izquierda}%`, width: `${Math.max(0.4, pos(d.fin) - izquierda)}%` }}
                      aria-label={texto} title={texto}
                      onClick={(e) => { e.stopPropagation(); onReproducirDibujo?.(d) }} />
                  )
                })}
              </div>
            </div>
          )}

          {filas.map((fila) => (
            <div key={fila.codigo} className="lt-fila">
              <span className="lt-etiqueta" title={etiquetaDe(fila.codigo)}>{etiquetaDe(fila.codigo)}</span>
              <div className="lt-pista" onClick={tocarPista} role="presentation" style={{ '--lt-color': colorDe(fila.color) }}>
                {fila.barras.map((original) => {
                  const enArrastre = arrastre?.id === original.id
                  const inicio = enArrastre ? arrastre.ajuste.segundo : original.inicio
                  const fin = enArrastre ? arrastre.ajuste.segundo_fin : original.fin
                  if (!visible(inicio, fin)) return null
                  const izquierda = pos(inicio)
                  return (
                    <button
                      key={original.id}
                      type="button"
                      className="lt-barra"
                      style={{ left: `${izquierda}%`, width: `${Math.max(0.4, pos(fin) - izquierda)}%` }}
                      data-elegida={seleccionadoId === original.id ? 'si' : undefined}
                      data-editable={puedeEditar && !original._cola ? 'si' : undefined}
                      data-arrastrando={enArrastre && arrastre.movido ? 'si' : undefined}
                      data-pendiente={original._cola ? 'si' : undefined}
                      aria-label={`${etiquetaDe(original.tipo)} de ${formatearTiempo(inicio)} a ${formatearTiempo(fin)}`}
                      title={`${etiquetaDe(original.tipo)} · ${formatearTiempo(inicio)} a ${formatearTiempo(fin)}${original._cola ? ' · guardando' : ''}`}
                      onClick={(e) => { e.stopPropagation(); if (!puedeEditar || original._cola || e.detail === 0) onReproducir(original) }}
                      onPointerDown={(e) => empezar(e, original, 'mover')}
                      onPointerMove={mover}
                      onPointerUp={soltar}
                      onPointerCancel={() => setArrastre(null)}
                    >
                      {puedeEditar && !original._cola && <>
                        <span className="lt-borde" data-lado="inicio" aria-hidden="true"
                          onPointerDown={(e) => empezar(e, original, 'inicio')} onPointerMove={mover} onPointerUp={soltar} />
                        <span className="lt-borde" data-lado="fin" aria-hidden="true"
                          onPointerDown={(e) => empezar(e, original, 'fin')} onPointerMove={mover} onPointerUp={soltar} />
                      </>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="lt-fila">
            <span className="lt-etiqueta">Eventos individuales</span>
            <div className="lt-pista" onClick={tocarPista} role="presentation">
              {puntos.filter((p) => visible(p.segundo, p.segundo)).map((p) => (
                <button key={p.id} type="button" className="lt-punto" data-estado={p.estado} style={{ left: `${pos(p.segundo)}%` }}
                  aria-label={`${etiquetaDe(p.tipo)} · ${formatearTiempo(p.segundo)}`} title={`${etiquetaDe(p.tipo)} · ${formatearTiempo(p.segundo)}`}
                  onClick={(e) => { e.stopPropagation(); onIr(Math.max(0, Number(p.segundo) - 3)) }} />
              ))}
            </div>
          </div>

          <div className="lt-capa-cursor" aria-hidden="true">
            {visible(segundo, segundo) && <span className="lt-cursor" style={{ left: `${pos(segundo)}%` }} />}
          </div>
        </div>
      </div>

      {filas.length === 0 && (
        <p className="lt-vacia">
          {vista === 'otro' ? 'Ningún momento marcado tiene espejo para el otro equipo.' : 'Todavía no hay momentos colectivos. Se marcan en Etiquetado → Colectiva.'}
        </p>
      )}
      <p className="lt-pie">
        {puedeEditar
          ? 'Tocá una barra para verla. Arrastrá sus bordes para ajustar inicio y fin, o la barra entera para moverla.'
          : vista === 'otro' && editable
            ? 'Vista del otro equipo (espejo): para ajustar, volvé a la vista del equipo analizado.'
            : 'Tocá una barra para reproducirla desde su inicio.'}
      </p>
    </section>
  )
}
