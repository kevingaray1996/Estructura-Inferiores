import { useTiempoVideo } from '../../utils/relojVideo'
import { mostrarTecla } from '../../utils/analisis/atajos'
import { GRUPOS_COLECTIVA, segundosGrabando } from '../../utils/analisis/colectiva'
import './colectiva.css'

// Aviso de un momento abierto. Va aparte para que solo él se redibuje cada segundo.
function AvisoGrabando({ grabacion, reloj, etiqueta, tecla, onCerrar }) {
  const segundo = useTiempoVideo(reloj)
  const lleva = segundosGrabando(grabacion, segundo)
  return (
    <div className="col-grabando" role="status" aria-live="polite">
      <span className="col-grabando-punto" aria-hidden="true" />
      <span>Grabando: {etiqueta} · {lleva} s</span>
      <button type="button" className="et-boton" onClick={onCerrar}>Cerrar ahora{tecla ? ` (${mostrarTecla(tecla)})` : ''}</button>
      <span className="col-grabando-nota">Si no lo cerrás, se cierra solo a los {grabacion.duracion} s. Después lo ajustás en la línea de tiempo.</span>
    </div>
  )
}

// Botonera colectiva: momentos que duran (Salida, Transición, Córner…), sin jugadora, agrupados.
// tipos: los de tiposBotonera(catalogo, 'colectiva'). atajos: { código: tecla }.
// abiertas: momentos abiertos (una fase y, superpuesto, uno de Charla). Enter cierra el último abierto.
export default function BotoneraColectiva({ tipos, atajos, abiertas = [], reloj, etiquetaDe, deshabilitado, onTocar, iluminado }) {
  return (
    <div>
      {abiertas.map((g) => (
        <AvisoGrabando key={`${g.tipo}-${g.inicio}`} grabacion={g} reloj={reloj} etiqueta={etiquetaDe(g.tipo)} tecla={atajos[g.tipo]}
          onCerrar={() => onTocar(g.tipo)} />
      ))}
      {abiertas.length > 0 && <p className="col-grabando-nota mb-2">Enter cierra el último que abriste.</p>}
      {tipos.length === 0 && (
        <p className="az-nota">Todavía no hay botones colectivos. Falta correr en Supabase el SQL de la etapa 1 (botonera colectiva).</p>
      )}
      {GRUPOS_COLECTIVA.map(([grupo, titulo]) => {
        const delGrupo = tipos.filter((t) => t.grupo === grupo)
        if (!delGrupo.length) return null
        return (
          <section key={grupo} className="col-grupo" aria-label={titulo}>
            <h3 className="col-grupo-titulo">{titulo}{grupo === 'charla' ? ' · se suma a la fase abierta' : ''}</h3>
            <div className="az-botonera">
              {delGrupo.map((accion) => {
                const tecla = atajos[accion.nombre]
                const abierta = abiertas.some((g) => g.tipo === accion.nombre)
                return (
                  <button
                    key={accion.nombre}
                    type="button"
                    data-tipo-colectivo={accion.nombre}
                    className={`az-boton-accion col-boton${iluminado?.tipo === accion.nombre ? ' et-iluminado' : ''}`}
                    data-grabando={abierta ? 'si' : undefined}
                    aria-pressed={abierta}
                    aria-keyshortcuts={tecla || undefined}
                    title={`${etiquetaDe(accion.nombre)} · dura ${accion.duracion} s si no lo cerrás${tecla ? ` (tecla ${mostrarTecla(tecla)})` : ''}`}
                    disabled={deshabilitado}
                    onClick={() => onTocar(accion.nombre)}
                    style={{ '--az-color-accion': accion.color }}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="az-boton-icono" style={{ color: accion.colorTexto }}>{accion.icono}</span>
                      {tecla && <kbd className="et-tecla" aria-hidden="true">{mostrarTecla(tecla)}</kbd>}
                    </span>
                    <span className="az-boton-texto">{abierta ? `■ ${accion.corto}` : accion.corto}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
