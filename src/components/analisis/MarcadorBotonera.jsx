import { useEffect, useRef, useState } from 'react'
import CanchaMini from './CanchaMini'
import { nombreJugadora } from '../../utils/analisis/formato'
import { textoTiempos } from '../../utils/analisis/marcador'
import './marcador.css'

// Botones del marcador en la botonera. Cada uno toma el segundo actual del video (lo hace onBoton).
// tipo: 'gol' | 'gol_rival' | 'tarjeta' | 'cambio'.
const BOTONES_GOL = [
  { tipo: 'gol', icono: '⚽', texto: 'Gol', tecla: 'G', titulo: 'Gol nuestro (tecla G): suma al marcador y carga la acción de gol' },
  { tipo: 'gol_rival', icono: '⚽', texto: 'Gol rival', tecla: '⇧G', titulo: 'Gol rival (Shift + G)' },
]
const BOTONES_FILA = [
  { tipo: 'tarjeta', icono: '▮', texto: 'Tarjeta', tecla: 'Y', titulo: 'Tarjeta (tecla Y)' },
  { tipo: 'cambio', icono: '⇄', texto: 'Cambio', tecla: 'X', titulo: 'Cambio (tecla X)' },
]

// «⚽ Gol» y «⚽ Gol rival»: van dentro de la grilla de la botonera, con el mismo estilo que las acciones.
export function BotonesGol({ onBoton, deshabilitado, activo }) {
  return BOTONES_GOL.map((b) => (
    <button key={b.tipo} type="button" className="az-boton-accion mb-boton-gol" data-marcador={b.tipo}
      data-activa={activo === b.tipo ? 'si' : undefined} title={b.titulo} aria-keyshortcuts={b.tipo === 'gol' ? 'G' : 'Shift+G'}
      disabled={deshabilitado} onClick={() => onBoton(b.tipo)}>
      <span className="flex items-start justify-between gap-2">
        <span className="az-boton-icono" aria-hidden="true">{b.icono}</span>
        <kbd className="et-tecla" aria-hidden="true">{b.tecla}</kbd>
      </span>
      <span className="az-boton-texto">{b.texto}</span>
    </button>
  ))
}

// «Tarjeta» y «Cambio», en una fila aparte debajo de la botonera.
export function FilaTarjetaCambio({ onBoton, deshabilitado, activo }) {
  return (
    <div className="mb-fila" role="group" aria-label="Tarjetas y cambios">
      {BOTONES_FILA.map((b) => (
        <button key={b.tipo} type="button" className="mb-boton" data-marcador={b.tipo} data-activa={activo === b.tipo ? 'si' : undefined}
          title={b.titulo} aria-keyshortcuts={b.tecla} disabled={deshabilitado} onClick={() => onBoton(b.tipo)}>
          <span className="mb-boton-icono" aria-hidden="true">{b.icono}</span>
          <span>{b.texto}</span>
          <kbd className="et-tecla" aria-hidden="true">{b.tecla}</kbd>
        </button>
      ))}
    </div>
  )
}

const TITULOS = { gol: '⚽ Gol nuestro', tarjeta: 'Tarjeta', cambio: 'Cambio' }

// Elegir jugadora tocando su dorsal. Las que estaban en cancha van primero.
function ElegirJugadora({ etiqueta, lista, valor, onCambiar, opcional, enCancha }) {
  const ordenadas = enCancha
    ? [...lista].sort((a, b) => Number(enCancha.has(b.jugador_id)) - Number(enCancha.has(a.jugador_id)))
    : lista
  return (
    <fieldset className="mb-campo">
      <legend>{etiqueta}{opcional && <span className="mb-opcional"> (opcional)</span>}</legend>
      <div className="mb-jugadoras">
        {opcional && (
          <button type="button" className="mb-jugadora" aria-pressed={!valor} onClick={() => onCambiar('')}>Sin elegir</button>
        )}
        {ordenadas.map((c) => (
          <button key={c.jugador_id} type="button" className="mb-jugadora" aria-pressed={valor === c.jugador_id}
            data-fuera={enCancha && !enCancha.has(c.jugador_id) ? 'si' : undefined}
            title={enCancha && !enCancha.has(c.jugador_id) ? 'No estaba en cancha en ese momento' : undefined}
            onClick={() => onCambiar(c.jugador_id)}>
            <span className="mb-dorsal">{c.dorsal ?? '—'}</span>
            <span className="mb-nombre">{nombreJugadora(c.jugadora)}</span>
          </button>
        ))}
      </div>
    </fieldset>
  )
}

// Cartel que se abre al tocar Gol, Tarjeta o Cambio: el video queda en pausa hasta guardar o cancelar.
// cartel: { tipo, segundo, referencia }. enCancha: Set de las que estaban en cancha (o null si no se sabe).
// onGuardar(datos): gol { jugadorId, punto } · tarjeta { equipo, tarjeta, jugadorId } · cambio { sale, entra }.
export function CartelMarcador({ cartel, marcas, citaciones, enCancha, partido, periodo, guardando, onGuardar, onCancelar }) {
  const [jugadorId, setJugadorId] = useState('')
  const [punto, setPunto] = useState(null)
  const [equipo, setEquipo] = useState('propio')
  const [tarjeta, setTarjeta] = useState('amarilla')
  const [sale, setSale] = useState('')
  const [entra, setEntra] = useState('')
  const [error, setError] = useState('')
  const caja = useRef(null)
  const { tipo } = cartel

  // Al abrir, el foco va al cartel (Esc cancela; las teclas de la botonera quedan en pausa mientras está abierto).
  useEffect(() => { caja.current?.focus() }, [])

  function guardar() {
    if (tipo === 'cambio') {
      if (!sale || !entra) { setError('Elegí quién sale y quién entra.'); return }
      if (sale === entra) { setError('Sale y entra tienen que ser jugadoras distintas.'); return }
      onGuardar({ sale, entra })
    } else if (tipo === 'tarjeta') {
      onGuardar({ equipo, tarjeta, jugadorId: equipo === 'propio' ? jugadorId : '' })
    } else {
      onGuardar({ jugadorId, punto })
    }
  }

  const eventoCancha = {
    periodo, ...(cartel.referencia || {}),
    coordenada_x: punto?.x ?? null, coordenada_y: punto?.y ?? null, zona: punto?.zona ?? null,
  }
  const cuando = textoTiempos(cartel.segundo, marcas)

  return (
    <section ref={caja} tabIndex={-1} className="mb-cartel" aria-labelledby="mb-cartel-titulo" aria-busy={guardando || undefined}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancelar() } }}>
      <header className="mb-cartel-cabecera">
        <h3 id="mb-cartel-titulo">{TITULOS[tipo]}</h3>
        <span className="mb-cuando">{cuando}</span>
      </header>
      <p className="mb-nota">El video quedó en pausa. Sigue cuando guardás o cancelás.</p>

      {tipo === 'gol' && (
        <>
          <ElegirJugadora etiqueta="¿Quién lo hizo?" lista={citaciones} valor={jugadorId} onCambiar={setJugadorId} opcional enCancha={enCancha} />
          <div className="mb-campo">
            <span className="mb-rotulo">Desde dónde <span className="mb-opcional">(opcional)</span></span>
            <CanchaMini evento={eventoCancha} partido={partido} deshabilitada={guardando}
              onElegir={(p) => setPunto(p)} onQuitar={() => setPunto(null)} />
          </div>
        </>
      )}

      {tipo === 'tarjeta' && (
        <>
          <div className="az-segmento" role="group" aria-label="De quién">
            <button type="button" aria-pressed={equipo === 'propio'} onClick={() => setEquipo('propio')}>Nuestra</button>
            <button type="button" aria-pressed={equipo === 'rival'} onClick={() => setEquipo('rival')}>Rival</button>
          </div>
          <div className="az-segmento" role="group" aria-label="Color">
            <button type="button" aria-pressed={tarjeta === 'amarilla'} onClick={() => setTarjeta('amarilla')}>Amarilla</button>
            <button type="button" aria-pressed={tarjeta === 'roja'} onClick={() => setTarjeta('roja')}>Roja</button>
          </div>
          {equipo === 'propio' && (
            <ElegirJugadora etiqueta="¿A quién?" lista={citaciones} valor={jugadorId} onCambiar={setJugadorId} opcional enCancha={enCancha} />
          )}
        </>
      )}

      {tipo === 'cambio' && (
        <>
          <ElegirJugadora etiqueta="Sale" lista={enCancha ? citaciones.filter((c) => enCancha.has(c.jugador_id)) : citaciones}
            valor={sale} onCambiar={(id) => { setSale(id); setError('') }} />
          <ElegirJugadora etiqueta="Entra" lista={citaciones.filter((c) => c.jugador_id !== sale && !(enCancha && enCancha.has(c.jugador_id)))}
            valor={entra} onCambiar={(id) => { setEntra(id); setError('') }} />
        </>
      )}

      {error && <p className="pa-error" role="alert">{error}</p>}
      <div className="mb-acciones">
        <button type="button" className="pa-boton" data-principal="si" disabled={guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : tipo === 'gol' ? 'Guardar gol' : tipo === 'tarjeta' ? 'Guardar tarjeta' : 'Guardar cambio'}
        </button>
        <button type="button" className="pa-boton" disabled={guardando} onClick={onCancelar}>Cancelar</button>
      </div>
    </section>
  )
}
