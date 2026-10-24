


import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

const AMARILLO = '#F2C230'
const PANEL = '#151D29'
const BORDE = '#2A3548'
const TEXTO = '#F0F2F5'
const SECUNDARIO = '#8A9BB8'
const FONDO = '#0F1419'
const CATEGORIA_ID = '438874e7-e59f-460b-bec4-3c0ef5b44016'

const TIPOS = [
  'Pase correcto',
  'Pase incorrecto',
  'Pérdida',
  'Recuperación',
  'Remate',
  'Centro',
  'Duelo ofensivo',
  'Duelo defensivo',
  'Duelo aéreo',
  'Atajada',
  'Salida de arquera',
  'Gol',
  'Falta cometida',
  'Falta recibida',
  'Intercepción',
]

const TIPOS_RAPIDOS = [
  { nombre: 'Pase correcto', corto: 'Pase +', icono: '↗', color: '#4ADE80' },
  { nombre: 'Pase incorrecto', corto: 'Pase −', icono: '↘', color: '#F87171' },
  { nombre: 'Pérdida', corto: 'Pérdida', icono: '×', color: '#F87171' },
  { nombre: 'Recuperación', corto: 'Recuperación', icono: '↺', color: '#4ADE80' },
  { nombre: 'Remate', corto: 'Remate', icono: '◎', color: '#F2C230' },
  { nombre: 'Centro', corto: 'Centro', icono: '⌁', color: '#F2C230' },
  { nombre: 'Duelo ofensivo', corto: 'Duelo of.', icono: '⚔', color: '#F2C230' },
  { nombre: 'Duelo defensivo', corto: 'Duelo def.', icono: '◆', color: '#60A5FA' },
  { nombre: 'Duelo aéreo', corto: 'Duelo aéreo', icono: '↑', color: '#60A5FA' },
  { nombre: 'Atajada', corto: 'Atajada', icono: '⊙', color: '#4ADE80' },
  { nombre: 'Salida de arquera', corto: 'Salida', icono: '↗', color: '#60A5FA' },
  { nombre: 'Gol', corto: 'Gol', icono: '⚽', color: '#F2C230' },
  { nombre: 'Falta cometida', corto: 'Falta com.', icono: '!', color: '#F87171' },
  { nombre: 'Falta recibida', corto: 'Falta rec.', icono: '+', color: '#4ADE80' },
  { nombre: 'Intercepción', corto: 'Intercepción', icono: '↯', color: '#60A5FA' },
]

const ZONAS = [
  'Defensa izquierda', 'Defensa centro', 'Defensa derecha',
  'Medio izquierda', 'Medio centro', 'Medio derecha',
  'Ataque izquierda', 'Ataque centro', 'Ataque derecha',
]

const RESULTADOS = [
  'Exitoso', 'Fallido', 'Neutro', 'Gol', 'Atajada', 'Fuera', 'Bloqueado',
]

const inputClass =
  'w-full rounded-lg border p-3 text-sm outline-none focus:ring-1 focus:ring-yellow-400'

const inputStyle = {
  backgroundColor: FONDO,
  borderColor: BORDE,
  color: TEXTO,
}

function Boton({
  children,
  onClick,
  disabled = false,
  secundario = false,
  submit = false,
}) {
  return (
    <button
      type={submit ? 'submit' : 'button'}
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg px-4 py-2.5 text-sm font-bold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
      style={secundario
        ? { backgroundColor: '#202A38', color: TEXTO, border: `1px solid ${BORDE}` }
        : { backgroundColor: AMARILLO, color: '#171717' }}
    >
      {children}
    </button>
  )
}

function Campo({ label, children }) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium" style={{ color: TEXTO }}>{label}</span>
      {children}
    </label>
  )
}

function Panel({ children, className = '', style = {}, id }) {
  return (
    <section
      id={id}
      className={`rounded-xl border p-4 md:p-5 ${className}`}
      style={{ backgroundColor: PANEL, borderColor: BORDE, ...style }}
    >
      {children}
    </section>
  )
}

function youtubeEmbed(url) {
  if (!url) return ''

  try {
    const parsed = new URL(url)
    let id = ''

    if (parsed.hostname.includes('youtu.be')) {
      id = parsed.pathname.split('/').filter(Boolean)[0] || ''
    } else if (
      parsed.hostname.includes('youtube.com') ||
      parsed.hostname.includes('youtube-nocookie.com')
    ) {
      if (parsed.pathname === '/watch') {
        id = parsed.searchParams.get('v') || ''
      } else {
        const parts = parsed.pathname.split('/').filter(Boolean)
        if (['embed', 'shorts', 'live'].includes(parts[0])) {
          id = parts[1] || ''
        }
      }
    }

    if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) return ''

    const origen = typeof window !== 'undefined'
      ? `&origin=${encodeURIComponent(window.location.origin)}`
      : ''

    return `https://www.youtube.com/embed/${id}?enablejsapi=1${origen}`
  } catch {
    return ''
  }
}

function formatearTiempo(segundos) {
  const total = Math.max(0, Math.floor(Number(segundos) || 0))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function fechaLegible(fecha) {
  if (!fecha) return 'Fecha sin definir'
  const [anio, mes, dia] = fecha.slice(0, 10).split('-')
  return `${dia}/${mes}/${anio}`
}

function datosEncuentro(partido) {
  if (!partido) return ''
  const calendario = partido.partido_calendario || null

  return [
    fechaLegible(calendario?.fecha || partido.fecha),
    calendario?.local_visitante
      ? calendario.local_visitante.charAt(0).toUpperCase() +
        calendario.local_visitante.slice(1)
      : '',
    calendario?.numero_fecha || '',
  ].filter(Boolean).join(' · ')
}

function videoCalendario(partido) {
  if (!partido) return ''

  return partido.video_partido_completo ||
    partido.video_analisis_propio ||
    partido.video_resumen ||
    partido.video_analisis_rival ||
    partido.link ||
    ''
}

function nombreJugadora(jugadora) {
  if (!jugadora) return 'Sin jugadora asignada'
  return `${jugadora.nombre || ''} ${jugadora.apellido || ''}`.trim() || 'Sin nombre'
}

function iniciales(jugadora) {
  const nombre = jugadora?.nombre?.trim()?.[0] || ''
  const apellido = jugadora?.apellido?.trim()?.[0] || ''
  return `${nombre}${apellido}`.toUpperCase() || '?'
}

function obtenerCoordenadas(posicion) {
  if (!posicion || typeof posicion !== 'string') return null

  const [xStr, yStr] = posicion.split(',')
  const x = Number(xStr)
  const y = Number(yStr)

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null

  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
  }
}

function zonaDesdeCoordenadas(x, y) {
  // Cancha horizontal: X representa la progresión defensa → medio → ataque.
  // Y representa los carriles izquierda → centro → derecha.
  const sector = x < 33.333 ? 'Defensa' : x < 66.666 ? 'Medio' : 'Ataque'
  const carril = y < 33.333 ? 'izquierda' : y < 66.666 ? 'centro' : 'derecha'
  return `${sector} ${carril}`
}

function coordenadasEvento(evento) {
  const tieneX = evento?.coordenada_x !== null && evento?.coordenada_x !== undefined && evento?.coordenada_x !== ''
  const tieneY = evento?.coordenada_y !== null && evento?.coordenada_y !== undefined && evento?.coordenada_y !== ''
  const x = Number(evento?.coordenada_x)
  const y = Number(evento?.coordenada_y)

  if (tieneX && tieneY && Number.isFinite(x) && Number.isFinite(y)) {
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)), exacta: true }
  }

  // Los eventos antiguos se muestran en el centro aproximado de su zona,
  // sin modificar ni sobrescribir sus datos históricos.
  const indice = ZONAS.indexOf(evento?.zona)
  if (indice < 0) return null
  const sector = Math.floor(indice / 3) // Defensa, Medio, Ataque
  const carril = indice % 3 // izquierda, centro, derecha
  return { x: [17, 50, 83][sector], y: [17, 50, 83][carril], exacta: false }
}

function tieneCoordenadasExactas(evento) {
  return evento?.coordenada_x !== null && evento?.coordenada_x !== undefined && evento?.coordenada_x !== '' &&
    evento?.coordenada_y !== null && evento?.coordenada_y !== undefined && evento?.coordenada_y !== '' &&
    Number.isFinite(Number(evento.coordenada_x)) && Number.isFinite(Number(evento.coordenada_y))
}

function zonaEfectivaEvento(evento) {
  if (tieneCoordenadasExactas(evento)) {
    return zonaDesdeCoordenadas(Number(evento.coordenada_x), Number(evento.coordenada_y))
  }
  return ZONAS.includes(evento?.zona) ? evento.zona : null
}

function colorTipo(tipo) {
  if (['Gol', 'Remate', 'Centro'].includes(tipo)) return '#F2C230'
  if (['Pase correcto', 'Recuperación', 'Atajada', 'Falta recibida'].includes(tipo)) return '#4ADE80'
  if (['Pérdida', 'Pase incorrecto', 'Falta cometida'].includes(tipo)) return '#F87171'
  return '#60A5FA'
}

function CanchaInteractiva({ eventos = [], coordenadas, interactiva = false, onSelect, onEventClick }) {
  function manejarClick(e) {
    if (!interactiva || !onSelect) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    onSelect({ x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) })
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border" style={{ borderColor: '#78917D', backgroundColor: '#176344' }}>
      <svg
        viewBox="0 0 100 64"
        role={interactiva ? 'button' : 'img'}
        aria-label={interactiva ? 'Cancha interactiva. Seleccioná la ubicación de la acción.' : 'Cancha con ubicaciones de acciones registradas.'}
        onClick={interactiva ? manejarClick : undefined}
        className={interactiva ? 'block w-full cursor-crosshair' : 'block w-full'}
        style={{ touchAction: 'manipulation' }}
      >
        <rect x="1" y="1" width="98" height="62" rx="0.5" fill="#176344" stroke="#E5F0E7" strokeWidth="0.7" />
        <line x1="50" y1="1" x2="50" y2="63" stroke="#E5F0E7" strokeWidth="0.55" />
        <circle cx="50" cy="32" r="9.2" fill="none" stroke="#E5F0E7" strokeWidth="0.55" />
        <circle cx="50" cy="32" r="0.7" fill="#E5F0E7" />
        <line x1="33.333" y1="1" x2="33.333" y2="63" stroke="#D1FAE5" strokeWidth="0.3" strokeDasharray="1.2 1.2" opacity="0.8" />
        <line x1="66.666" y1="1" x2="66.666" y2="63" stroke="#D1FAE5" strokeWidth="0.3" strokeDasharray="1.2 1.2" opacity="0.8" />
        <line x1="1" y1="21.333" x2="99" y2="21.333" stroke="#D1FAE5" strokeWidth="0.3" strokeDasharray="1.2 1.2" opacity="0.8" />
        <line x1="1" y1="42.666" x2="99" y2="42.666" stroke="#D1FAE5" strokeWidth="0.3" strokeDasharray="1.2 1.2" opacity="0.8" />
        <rect x="1" y="17" width="16" height="30" fill="none" stroke="#E5F0E7" strokeWidth="0.55" />
        <rect x="1" y="24" width="5.5" height="16" fill="none" stroke="#E5F0E7" strokeWidth="0.55" />
        <rect x="83" y="17" width="16" height="30" fill="none" stroke="#E5F0E7" strokeWidth="0.55" />
        <rect x="93.5" y="24" width="5.5" height="16" fill="none" stroke="#E5F0E7" strokeWidth="0.55" />
        <path d="M17 25 A7 7 0 0 1 17 39 M83 25 A7 7 0 0 0 83 39" fill="none" stroke="#E5F0E7" strokeWidth="0.55" />
        {eventos.map((evento) => {
          const punto = coordenadasEvento(evento)
          if (!punto) return null
          const cx = punto.x
          const cy = punto.y * 0.64
          return (
            <g
              key={evento.id}
              onClick={onEventClick ? (e) => { e.stopPropagation(); onEventClick(evento) } : undefined}
              style={{ cursor: onEventClick ? 'pointer' : 'default' }}
            >
              <title>{`${evento.tipo} · ${formatearTiempo(evento.segundo)} · ${evento.resultado || 'Pendiente'} · ${zonaEfectivaEvento(evento) || 'Sin zona'}`}</title>
              <circle cx={cx} cy={cy} r={punto.exacta ? 1.65 : 1.35} fill={colorTipo(evento.tipo)} stroke="#10251B" strokeWidth="0.35" opacity={punto.exacta ? 1 : 0.65} />
              {punto.exacta && <circle cx={cx} cy={cy} r="2.35" fill="none" stroke={colorTipo(evento.tipo)} strokeWidth="0.3" />}
            </g>
          )
        })}
        {coordenadas && (
          <g pointerEvents="none">
            <circle cx={coordenadas.x} cy={coordenadas.y * 0.64} r="2.2" fill="#F2C230" stroke="#FFFFFF" strokeWidth="0.7" />
            <path d={`M ${coordenadas.x - 3} ${coordenadas.y * 0.64} L ${coordenadas.x + 3} ${coordenadas.y * 0.64} M ${coordenadas.x} ${coordenadas.y * 0.64 - 3} L ${coordenadas.x} ${coordenadas.y * 0.64 + 3}`} stroke="#FFFFFF" strokeWidth="0.55" />
          </g>
        )}
      </svg>
      <div className="flex justify-between px-2 pb-2 text-[10px] font-black tracking-wide" style={{ color: '#E5F0E7' }}>
        <span>DEFENSA</span><span>MEDIO</span><span>ATAQUE</span>
      </div>
    </div>
  )
}

function CanchaInformePDF({ eventos = [] }) {
  const zonasVista = ZONAS

  const conteos = zonasVista.reduce((acc, nombre) => {
    acc[nombre] = 0
    return acc
  }, {})

  eventos.forEach((evento) => {
    const zona = zonaEfectivaEvento(evento)
    if (zona && Object.prototype.hasOwnProperty.call(conteos, zona)) conteos[zona] += 1
  })

  const totalConZona = Object.values(conteos).reduce((total, cantidad) => total + cantidad, 0)
  const maximoZona = Math.max(1, ...Object.values(conteos))
  const ubicacionesExactas = eventos.filter(tieneCoordenadasExactas).length

  return (
    <div className="pdf-zonas-layout grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="pdf-zonas-cancha rounded-xl border p-3" style={{ borderColor: '#D1D5DB', backgroundColor: '#F8FAFC' }}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: '#374151' }}>Mapa de acciones</p>
          <span className="text-[10px] font-semibold" style={{ color: '#6B7280' }}>Vista horizontal · Defensa → Ataque</span>
        </div>
        <svg viewBox="0 0 100 64" role="img" aria-label="Cancha horizontal: defensa a la izquierda, medio en el centro y ataque a la derecha" className="mx-auto block w-full" style={{ maxHeight: '350px' }}>
          <rect x="1" y="1" width="98" height="62" rx="0.5" fill="#176344" stroke="#F4F7F4" strokeWidth="0.8" />
          <line x1="50" y1="1" x2="50" y2="63" stroke="#E5F0E7" strokeWidth="0.55" />
          <circle cx="50" cy="32" r="9.2" fill="none" stroke="#E5F0E7" strokeWidth="0.55" />
          <circle cx="50" cy="32" r="0.7" fill="#E5F0E7" />
          <rect x="1" y="17" width="16" height="30" fill="none" stroke="#E5F0E7" strokeWidth="0.55" />
          <rect x="1" y="24" width="5.5" height="16" fill="none" stroke="#E5F0E7" strokeWidth="0.55" />
          <rect x="83" y="17" width="16" height="30" fill="none" stroke="#E5F0E7" strokeWidth="0.55" />
          <rect x="93.5" y="24" width="5.5" height="16" fill="none" stroke="#E5F0E7" strokeWidth="0.55" />
          <path d="M17 25 A7 7 0 0 1 17 39 M83 25 A7 7 0 0 0 83 39" fill="none" stroke="#E5F0E7" strokeWidth="0.55" />
          <line x1="33.333" y1="1" x2="33.333" y2="63" stroke="#D1FAE5" strokeWidth="0.3" strokeDasharray="1.2 1.2" opacity="0.8" />
          <line x1="66.666" y1="1" x2="66.666" y2="63" stroke="#D1FAE5" strokeWidth="0.3" strokeDasharray="1.2 1.2" opacity="0.8" />
          <line x1="1" y1="21.333" x2="99" y2="21.333" stroke="#D1FAE5" strokeWidth="0.3" strokeDasharray="1.2 1.2" opacity="0.8" />
          <line x1="1" y1="42.666" x2="99" y2="42.666" stroke="#D1FAE5" strokeWidth="0.3" strokeDasharray="1.2 1.2" opacity="0.8" />
          {eventos.map((evento) => {
            const punto = coordenadasEvento(evento)
            if (!punto) return null
            const cx = Math.max(1.5, Math.min(98.5, punto.x))
            const cy = Math.max(1.5, Math.min(62.5, punto.y * 0.64))
            return (
              <g key={evento.id}>
                <circle cx={cx} cy={cy} r={punto.exacta ? 1.65 : 1.35} fill={colorTipo(evento.tipo)} stroke="#FFFFFF" strokeWidth="0.35" opacity={punto.exacta ? 1 : 0.68} />
                {punto.exacta && <circle cx={cx} cy={cy} r="2.35" fill="none" stroke="#FFFFFF" strokeWidth="0.3" />}
              </g>
            )
          })}
        </svg>
        <div className="mt-2 flex justify-between text-[10px] font-bold" style={{ color: '#374151' }}>
          <span>DEFENSA</span><span>MEDIO</span><span>ATAQUE</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-[10px]" style={{ color: '#4B5563' }}>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#F2C230', border: '1px solid #9CA3AF' }} />Ataque / remate / gol</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#4ADE80', border: '1px solid #9CA3AF' }} />Acción positiva</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#F87171', border: '1px solid #9CA3AF' }} />Pérdida / negativa</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#60A5FA', border: '1px solid #9CA3AF' }} />Duelo / otra acción</span>
        </div>
        <p className="mt-2 text-[10px]" style={{ color: '#6B7280' }}>Puntos con aro blanco: ubicación exacta. Puntos sin aro: ubicación aproximada a partir de la zona histórica.</p>
      </div>

      <div className="pdf-zonas-resumen">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-black uppercase tracking-wide" style={{ color: '#374151' }}>Distribución por sector</p>
            <p className="mt-1 text-xs" style={{ color: '#6B7280' }}>{totalConZona} acciones con zona identificada</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-black" style={{ color: '#171717' }}>{eventos.length}</p>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: '#6B7280' }}>acciones totales</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {zonasVista.map((nombre) => {
            const cantidad = conteos[nombre]
            const porcentaje = totalConZona ? Math.round((cantidad / totalConZona) * 100) : 0
            return (
              <div key={nombre} className="pdf-zona-celda rounded-lg border p-2" style={{ borderColor: '#D1D5DB', backgroundColor: '#FFFFFF' }}>
                <p className="text-[10px] font-semibold leading-tight" style={{ color: '#4B5563' }}>{nombre}</p>
                <p className="mt-1 text-xl font-black" style={{ color: '#171717' }}>{cantidad}</p>
                <div className="pdf-zona-barra-fondo mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: '#E5E7EB' }}>
                  <div className="pdf-zona-barra h-full rounded-full" style={{ width: `${(cantidad / maximoZona) * 100}%`, backgroundColor: '#F2C230' }} />
                </div>
                <p className="mt-1 text-[10px]" style={{ color: '#6B7280' }}>{porcentaje}% de las ubicadas</p>
              </div>
            )
          })}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-3" style={{ borderColor: '#D1D5DB', backgroundColor: '#FFFBEB' }}>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#6B7280' }}>Ubicación exacta</p>
            <p className="mt-1 text-lg font-black" style={{ color: '#171717' }}>{ubicacionesExactas}</p>
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: '#D1D5DB', backgroundColor: '#F3F4F6' }}>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#6B7280' }}>Sin zona / ubicación</p>
            <p className="mt-1 text-lg font-black" style={{ color: '#171717' }}>{Math.max(0, eventos.length - totalConZona)}</p>
          </div>
        </div>
        <p className="mt-3 text-[10px] leading-relaxed" style={{ color: '#6B7280' }}>Los porcentajes se calculan sobre las acciones que tienen una zona identificada. Las acciones antiguas se representan en el centro aproximado de su zona y no se modifican los registros guardados.</p>
      </div>
    </div>
  )
}

let youtubeApiPromise = null

function cargarYouTubeAPI() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube solo puede iniciarse en el navegador.'))
  }

  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (youtubeApiPromise) return youtubeApiPromise

  youtubeApiPromise = new Promise((resolve, reject) => {
    const callbackAnterior = window.onYouTubeIframeAPIReady

    window.onYouTubeIframeAPIReady = () => {
      if (typeof callbackAnterior === 'function') callbackAnterior()

      if (window.YT?.Player) {
        resolve(window.YT)
      } else {
        youtubeApiPromise = null
        reject(new Error('YouTube no pudo inicializar el reproductor.'))
      }
    }

    let script = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]',
    )

    if (!script) {
      script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true

      script.onerror = () => {
        youtubeApiPromise = null
        reject(new Error('No se pudo cargar la API de YouTube.'))
      }

      document.head.appendChild(script)
    }
  })

  return youtubeApiPromise
}

export default function AnalisisSection() {
  const [usuario, setUsuario] = useState(null)
  const [esAdmin, setEsAdmin] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  const [partidos, setPartidos] = useState([])
  const [partidosCalendario, setPartidosCalendario] = useState([])
  const [eventos, setEventos] = useState([])
  const [jugadoras, setJugadoras] = useState([])
  const [citaciones, setCitaciones] = useState([])

  const [partidoId, setPartidoId] = useState('')
  const [partidoCalendarioId, setPartidoCalendarioId] = useState('')

  const [alcanceEstadisticas, setAlcanceEstadisticas] = useState('partido')

  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [notas, setNotas] = useState('')

  const [tipo, setTipo] = useState('Pase correcto')
  const [jugadorId, setJugadorId] = useState('')
  const [segundo, setSegundo] = useState('0')
  const [zona, setZona] = useState('Medio centro')
  const [coordenadasAccion, setCoordenadasAccion] = useState(null)
  const [resultado, setResultado] = useState('Exitoso')
  const [observaciones, setObservaciones] = useState('')

  const [filtroJugador, setFiltroJugador] = useState('todos')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroResultado, setFiltroResultado] = useState('todos')
  const [seccion, setSeccion] = useState('video')
  const [filtroExploradorPartido, setFiltroExploradorPartido] = useState('todos')
  const [filtroExploradorJugadora, setFiltroExploradorJugadora] = useState('todos')
  const [filtroExploradorTipo, setFiltroExploradorTipo] = useState('todos')
  const [filtroExploradorResultado, setFiltroExploradorResultado] = useState('todos')
  const [filtroExploradorZona, setFiltroExploradorZona] = useState('todos')
  const [filtroExploradorMinutoDesde, setFiltroExploradorMinutoDesde] = useState('')
  const [filtroExploradorMinutoHasta, setFiltroExploradorMinutoHasta] = useState('')
  const [segundoPendiente, setSegundoPendiente] = useState(null)

  const [alcanceMapa, setAlcanceMapa] = useState('partido')
  const [filtroMapaPartido, setFiltroMapaPartido] = useState('todos')
  const [filtroMapaJugadora, setFiltroMapaJugadora] = useState('todos')
  const [filtroMapaTipo, setFiltroMapaTipo] = useState('todos')
  const [filtroMapaResultado, setFiltroMapaResultado] = useState('todos')
  const [filtroMapaZona, setFiltroMapaZona] = useState('todos')

  const [tipoRapido, setTipoRapido] = useState('')
  const [busquedaJugadora, setBusquedaJugadora] = useState('')
  const [mostrarEdicionEvento, setMostrarEdicionEvento] = useState(false)
  const [editandoEventoId, setEditandoEventoId] = useState(null)
  const [edicionEvento, setEdicionEvento] = useState({
    tipo: 'Pase correcto',
    jugador_id: '',
    segundo: '0',
    zona: '',
    resultado: '',
    observaciones: '',
    coordenada_x: null,
    coordenada_y: null,
  })

  const iframeRef = useRef(null)
  const playerRef = useRef(null)

  const [videoListo, setVideoListo] = useState(false)
  const [videoReproduciendo, setVideoReproduciendo] = useState(false)
  const [tiempoVideo, setTiempoVideo] = useState(0)
  const [segundoIr, setSegundoIr] = useState('0')

  const partidoActual = partidos.find((p) => p.id === partidoId)

  const partidoCalendarioActual =
    partidoActual?.partido_calendario ||
    partidosCalendario.find(
      (p) => p.id === partidoActual?.partido_calendario_id,
    )

  const videoUrlActual =
    partidoActual?.video_url || videoCalendario(partidoCalendarioActual)

  const videoActual = youtubeEmbed(videoUrlActual)

  const cargarDatos = useCallback(async () => {
    setCargando(true)
    setError('')

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError

      const authUser = authData?.user

      if (!authUser?.email) {
        setUsuario(null)
        setEsAdmin(false)
        setPartidos([])
        setPartidosCalendario([])
        setEventos([])
        setJugadoras([])
        setCitaciones([])
        setPartidoId('')
        setError('Iniciá sesión para consultar Análisis.')
        return
      }

      const { data: perfil, error: perfilError } = await supabase
        .from('perfiles')
        .select('email, nombre, rol, categoria_id')
        .eq('email', authUser.email)
        .maybeSingle()

      if (perfilError) throw perfilError

      setUsuario(perfil || null)

      const admin =
        perfil?.rol === 'coordinacion' &&
        perfil?.nombre?.trim().toLowerCase() === 'kevin garay' &&
        perfil?.email?.toLowerCase() === authUser.email.toLowerCase()

      setEsAdmin(Boolean(admin))

      const { data: calendario, error: calendarioError } = await supabase
        .from('partidos')
        .select(`
          id, categoria_id, rival, fecha, hora, lugar, local_visitante,
          numero_fecha, video_partido_completo, video_resumen,
          video_analisis_propio, video_analisis_rival, video_pelota_parada,
          video_gps, video_charla_dt, video_arenga, video_resumen_vigilancias,
          link, formacion
        `)
        .eq('categoria_id', CATEGORIA_ID)
        .order('fecha', { ascending: false })

      if (calendarioError) throw calendarioError

      const calendarioLista = calendario || []
      setPartidosCalendario(calendarioLista)

      const { data: lista, error: partidosError } = await supabase
        .from('analisis_partidos')
        .select('*')
        .order('fecha', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (partidosError) throw partidosError

      const listaPartidos = (lista || []).map((analisis) => {
        let calendarioPartido = calendarioLista.find(
          (p) => p.id === analisis.partido_calendario_id,
        ) || null

        if (!calendarioPartido && analisis.fecha && analisis.rival) {
          const coincidencias = calendarioLista.filter(
            (p) =>
              p.fecha === analisis.fecha &&
              p.rival?.trim().toLowerCase() ===
                analisis.rival.trim().toLowerCase(),
          )

          if (coincidencias.length === 1) {
            calendarioPartido = coincidencias[0]
          }
        }

        return {
          ...analisis,
          partido_calendario: calendarioPartido,
        }
      })

      setPartidos(listaPartidos)

      const ids = listaPartidos.map((p) => p.id)

      if (!ids.length) {
        setEventos([])
      } else {
        const { data: listaEventos, error: eventosError } = await supabase
          .from('analisis_eventos')
          .select('*')
          .in('partido_id', ids)
          .order('segundo', { ascending: true })

        if (eventosError) throw eventosError
        setEventos(listaEventos || [])
      }

      const categoriaIds = [
        ...new Set(
          listaPartidos.map((p) => p.categoria_id).filter(Boolean),
        ),
      ]

      let listaJugadoras = []

      if (categoriaIds.length) {
        const { data: jugadoresData, error: jugadoresError } = await supabase
          .from('jugadores')
          .select('id, nombre, apellido, categoria_id, estado')
          .in('categoria_id', categoriaIds)
          .order('apellido', { ascending: true })

        if (jugadoresError) {
          console.warn('No se pudieron cargar las jugadoras:', jugadoresError)
        } else {
          listaJugadoras = jugadoresData || []
        }
      }

      setJugadoras(listaJugadoras)

      setPartidoId((actual) =>
        listaPartidos.some((p) => p.id === actual)
          ? actual
          : listaPartidos[0]?.id || '',
      )
    } catch (e) {
      console.error('Error en Análisis:', e)
      setError(e.message || 'No se pudieron cargar los datos.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  // Convocadas del encuentro seleccionado: se obtienen desde la pestaña Convocados.
  useEffect(() => {
    let cancelado = false

    async function cargarCitaciones() {
      setCitaciones([])
      setJugadorId('')

      const calendarioId =
        partidoActual?.partido_calendario_id ||
        partidoActual?.partido_calendario?.id

      if (!calendarioId) return

      const { data, error: citacionesError } = await supabase
        .from('citaciones')
        .select('*')
        .eq('partido_id', calendarioId)

      if (cancelado) return

      if (citacionesError) {
        console.error('Error al cargar convocadas:', citacionesError)
        setError(
          'No se pudieron cargar las convocadas. Revisá los permisos de la tabla citaciones.',
        )
        return
      }

      const filas = (data || []).map((c) => {
        const jugadora = jugadoras.find((j) => j.id === c.jugador_id)
        const coordenadas = obtenerCoordenadas(c.posicion_cancha)

        return {
          ...c,
          jugadora: jugadora || null,
          coordenadas,
          titular: Boolean(c.titular || coordenadas),
        }
      }).filter((c) => c.jugadora)

      filas.sort((a, b) => {
        const dorsalA = Number(a.dorsal)
        const dorsalB = Number(b.dorsal)

        if (Number.isFinite(dorsalA) && Number.isFinite(dorsalB)) {
          return dorsalA - dorsalB
        }

        return nombreJugadora(a.jugadora).localeCompare(
          nombreJugadora(b.jugadora),
          'es',
        )
      })

      setCitaciones(filas)
    }

    cargarCitaciones()

    return () => {
      cancelado = true
    }
  }, [
    partidoActual?.partido_calendario_id,
    partidoActual?.partido_calendario?.id,
    jugadoras,
  ])

  useEffect(() => {
    const iframe = iframeRef.current

    if (!videoActual || seccion !== 'video' || !iframe) {
      return undefined
    }

    let cancelado = false

    setVideoListo(false)
    setVideoReproduciendo(false)
    setTiempoVideo(0)

    cargarYouTubeAPI()
      .then((YT) => {
        if (cancelado || !iframe.isConnected) return

        playerRef.current = new YT.Player(iframe, {
          events: {
            onReady: (evento) => {
              if (cancelado) return
              setVideoListo(true)
              setTiempoVideo(
                Math.floor(evento.target.getCurrentTime() || 0),
              )
            },
            onStateChange: (evento) => {
              if (!cancelado) {
                setVideoReproduciendo(
                  evento.data === YT.PlayerState.PLAYING,
                )
              }
            },
            onError: () => {
              if (!cancelado) {
                setError(
                  'YouTube no permite reproducir este video incrustado. Probá abrirlo directamente en YouTube.',
                )
              }
            },
          },
        })
      })
      .catch((e) => {
        if (!cancelado) {
          setError(
            e.message || 'No se pudo conectar el reproductor de YouTube.',
          )
        }
      })

    return () => {
      cancelado = true

      if (playerRef.current) {
        try {
          playerRef.current.destroy()
        } catch (e) {
          console.warn('No se pudo cerrar el reproductor:', e)
        }

        playerRef.current = null
      }

      setVideoListo(false)
      setVideoReproduciendo(false)
    }
  }, [videoActual, partidoId, seccion])

  useEffect(() => {
    if (!videoListo || !playerRef.current) return undefined

    const intervalo = window.setInterval(() => {
      try {
        const tiempoActual = playerRef.current?.getCurrentTime?.()

        if (Number.isFinite(tiempoActual)) {
          setTiempoVideo(Math.floor(tiempoActual))
        }
      } catch {
        // El reproductor puede estar cambiando de estado.
      }
    }, 500)

    return () => window.clearInterval(intervalo)
  }, [videoListo, partidoId])

  useEffect(() => {
    if (
      !segundoPendiente ||
      !videoListo ||
      !playerRef.current ||
      seccion !== 'video' ||
      partidoId !== segundoPendiente.partidoId
    ) return

    try {
      playerRef.current.seekTo(segundoPendiente.segundo, true)
      playerRef.current.playVideo()
      setTiempoVideo(segundoPendiente.segundo)
      setSegundoIr(String(segundoPendiente.segundo))
      setSegundoPendiente(null)
    } catch (e) {
      console.error('No se pudo abrir la acción desde el explorador:', e)
      setError('No se pudo saltar a ese momento del video.')
      setSegundoPendiente(null)
    }
  }, [segundoPendiente, videoListo, seccion, partidoId])

  const eventosPartido = useMemo(
    () => eventos.filter((e) => e.partido_id === partidoId),
    [eventos, partidoId],
  )

  const eventosMapa = useMemo(() => {
    const base = alcanceMapa === 'acumulado' ? eventos : eventosPartido
    return base.filter((evento) =>
      (alcanceMapa !== 'acumulado' || filtroMapaPartido === 'todos' || evento.partido_id === filtroMapaPartido) &&
      (filtroMapaJugadora === 'todos' || evento.jugador_id === filtroMapaJugadora) &&
      (filtroMapaTipo === 'todos' || evento.tipo === filtroMapaTipo) &&
      (filtroMapaResultado === 'todos' ||
        (filtroMapaResultado === 'Pendiente' ? !evento.resultado : evento.resultado === filtroMapaResultado)) &&
      (filtroMapaZona === 'todos' || zonaEfectivaEvento(evento) === filtroMapaZona)
    )
  }, [
    alcanceMapa,
    eventos,
    eventosPartido,
    filtroMapaPartido,
    filtroMapaJugadora,
    filtroMapaTipo,
    filtroMapaResultado,
    filtroMapaZona,
  ])

  const eventosMapaOrdenados = useMemo(() => [...eventosMapa].sort((a, b) => {
    const partidoA = partidos.find((p) => p.id === a.partido_id)
    const partidoB = partidos.find((p) => p.id === b.partido_id)
    const fechaA = partidoA?.fecha || partidoA?.created_at || ''
    const fechaB = partidoB?.fecha || partidoB?.created_at || ''
    return fechaB.localeCompare(fechaA) || Number(a.segundo || 0) - Number(b.segundo || 0)
  }), [eventosMapa, partidos])

  const resumenMapa = useMemo(() => {
    const conUbicacion = eventosMapa.filter((evento) => Boolean(coordenadasEvento(evento)))
    const exactas = conUbicacion.filter(tieneCoordenadasExactas).length
    const zonas = ZONAS.map((nombre) => ({
      nombre,
      total: eventosMapa.filter((evento) => zonaEfectivaEvento(evento) === nombre).length,
    }))
    return {
      total: eventosMapa.length,
      conUbicacion: conUbicacion.length,
      exactas,
      aproximadas: conUbicacion.length - exactas,
      sinUbicacion: eventosMapa.length - conUbicacion.length,
      zonas,
    }
  }, [eventosMapa])

  const eventosFiltrados = useMemo(
    () => eventosPartido.filter((e) =>
      (filtroJugador === 'todos' || e.jugador_id === filtroJugador) &&
      (filtroTipo === 'todos' || e.tipo === filtroTipo) &&
      (filtroResultado === 'todos' ||
        (filtroResultado === 'Pendiente'
          ? !e.resultado
          : e.resultado === filtroResultado)),
    ),
    [eventosPartido, filtroJugador, filtroTipo, filtroResultado],
  )

  const eventosExplorador = useMemo(() => {
    const desde = filtroExploradorMinutoDesde === ''
      ? null
      : Number(filtroExploradorMinutoDesde) * 60
    const hasta = filtroExploradorMinutoHasta === ''
      ? null
      : (Number(filtroExploradorMinutoHasta) + 1) * 60 - 1

    return eventos
      .filter((evento) => {
        const partido = partidos.find((p) => p.id === evento.partido_id)
        const nombre = nombreJugadora(jugadoras.find((j) => j.id === evento.jugador_id)).toLowerCase()
        const minuto = Math.floor(Number(evento.segundo || 0) / 60)

        return (
          (filtroExploradorPartido === 'todos' || evento.partido_id === filtroExploradorPartido) &&
          (filtroExploradorJugadora === 'todos' || evento.jugador_id === filtroExploradorJugadora) &&
          (filtroExploradorTipo === 'todos' || evento.tipo === filtroExploradorTipo) &&
          (filtroExploradorResultado === 'todos' ||
            (filtroExploradorResultado === 'Pendiente' ? !evento.resultado : evento.resultado === filtroExploradorResultado)) &&
          (filtroExploradorZona === 'todos' || evento.zona === filtroExploradorZona) &&
          (desde === null || Number(evento.segundo) >= desde) &&
          (hasta === null || Number(evento.segundo) <= hasta) &&
          Boolean(partido)
        )
      })
      .sort((a, b) => {
        const partidoA = partidos.find((p) => p.id === a.partido_id)
        const partidoB = partidos.find((p) => p.id === b.partido_id)
        const fechaA = partidoA?.fecha || ''
        const fechaB = partidoB?.fecha || ''
        return fechaB.localeCompare(fechaA) || Number(a.segundo) - Number(b.segundo)
      })
  }, [
    eventos,
    partidos,
    jugadoras,
    filtroExploradorPartido,
    filtroExploradorJugadora,
    filtroExploradorTipo,
    filtroExploradorResultado,
    filtroExploradorZona,
    filtroExploradorMinutoDesde,
    filtroExploradorMinutoHasta,
  ])

  const eventosEstadisticos = useMemo(
    () => alcanceEstadisticas === 'acumulado' ? eventos : eventosPartido,
    [alcanceEstadisticas, eventos, eventosPartido],
  )

  const estadisticas = useMemo(() => {
    const acumulado = {}

    for (const evento of eventosEstadisticos) {
      if (!acumulado[evento.tipo]) {
        acumulado[evento.tipo] = {
          total: 0,
          exitosos: 0,
          fallidos: 0,
          pendientes: 0,
        }
      }

      acumulado[evento.tipo].total += 1

      if (['Exitoso', 'Gol', 'Atajada'].includes(evento.resultado)) {
        acumulado[evento.tipo].exitosos += 1
      }

      if (['Fallido', 'Fuera', 'Bloqueado'].includes(evento.resultado)) {
        acumulado[evento.tipo].fallidos += 1
      }

      if (!evento.resultado) {
        acumulado[evento.tipo].pendientes += 1
      }
    }

    return Object.entries(acumulado).sort(
      (a, b) => b[1].total - a[1].total,
    )
  }, [eventosEstadisticos])

  const estadisticasJugadoras = useMemo(() => {
    const acumulado = {}

    for (const evento of eventosEstadisticos) {
      if (!evento.jugador_id) continue

      if (!acumulado[evento.jugador_id]) {
        acumulado[evento.jugador_id] = { total: 0, tipos: {} }
      }

      acumulado[evento.jugador_id].total += 1
      acumulado[evento.jugador_id].tipos[evento.tipo] =
        (acumulado[evento.jugador_id].tipos[evento.tipo] || 0) + 1
    }

    return Object.entries(acumulado)
      .map(([id, datos]) => {
        const jugadora = jugadoras.find((j) => j.id === id)

        return {
          id,
          ...datos,
          nombre: nombreJugadora(jugadora),
        }
      })
      .sort((a, b) => b.total - a.total)
  }, [eventosEstadisticos, jugadoras])

  const estadisticasZonas = useMemo(
    () => ZONAS.map((nombre) => ({
      nombre,
      total: eventosPartido.filter((e) => e.zona === nombre).length,
    })),
    [eventosPartido],
  )

  const estadisticasInforme = useMemo(() => {
    const resumen = {}
    for (const evento of eventosPartido) {
      if (!resumen[evento.tipo]) resumen[evento.tipo] = { total: 0, efectivas: 0, noEfectivas: 0, pendientes: 0 }
      const item = resumen[evento.tipo]
      item.total += 1
      if (['Exitoso', 'Gol', 'Atajada'].includes(evento.resultado)) item.efectivas += 1
      else if (['Fallido', 'Fuera', 'Bloqueado'].includes(evento.resultado)) item.noEfectivas += 1
      else if (!evento.resultado || evento.resultado === 'Neutro') item.pendientes += 1
    }
    return Object.entries(resumen).sort((a, b) => b[1].total - a[1].total)
  }, [eventosPartido])

  const jugadorasInforme = useMemo(() => {
    const resumen = {}
    for (const evento of eventosPartido) {
      if (!evento.jugador_id) continue
      if (!resumen[evento.jugador_id]) resumen[evento.jugador_id] = { total: 0, efectivas: 0, noEfectivas: 0 }
      resumen[evento.jugador_id].total += 1
      if (['Exitoso', 'Gol', 'Atajada'].includes(evento.resultado)) resumen[evento.jugador_id].efectivas += 1
      if (['Fallido', 'Fuera', 'Bloqueado'].includes(evento.resultado)) resumen[evento.jugador_id].noEfectivas += 1
    }
    return Object.entries(resumen).map(([id, datos]) => ({
      id,
      nombre: nombreJugadora(jugadoras.find((j) => j.id === id)),
      ...datos,
      evaluadas: datos.efectivas + datos.noEfectivas,
      efectividad: datos.efectivas + datos.noEfectivas
        ? Math.round((datos.efectivas / (datos.efectivas + datos.noEfectivas)) * 100)
        : null,
    })).sort((a, b) => b.total - a.total)
  }, [eventosPartido, jugadoras])

  const resumenGraficoInforme = useMemo(() => {
    const efectivas = eventosPartido.filter((e) => ['Exitoso', 'Gol', 'Atajada'].includes(e.resultado)).length
    const noEfectivas = eventosPartido.filter((e) => ['Fallido', 'Fuera', 'Bloqueado'].includes(e.resultado)).length
    const pendientes = eventosPartido.filter((e) => !e.resultado || e.resultado === 'Neutro').length
    const evaluables = efectivas + noEfectivas
    return {
      efectivas,
      noEfectivas,
      pendientes,
      evaluables,
      porcentaje: evaluables ? Math.round((efectivas / evaluables) * 100) : null,
    }
  }, [eventosPartido])

  const accionesGraficoInforme = useMemo(
    () => estadisticasInforme.slice(0, 7),
    [estadisticasInforme],
  )

  const resumenEfectividad = useMemo(() => {
    const exitosas = eventosEstadisticos.filter((e) => ['Exitoso', 'Gol', 'Atajada'].includes(e.resultado)).length
    const fallidas = eventosEstadisticos.filter((e) => ['Fallido', 'Fuera', 'Bloqueado'].includes(e.resultado)).length
    const evaluadas = exitosas + fallidas
    const pendientes = eventosEstadisticos.filter((e) => !e.resultado).length
    const conUbicacionExacta = eventosEstadisticos.filter((e) => Number.isFinite(Number(e.coordenada_x)) && Number.isFinite(Number(e.coordenada_y)) && e.coordenada_x !== null && e.coordenada_y !== null).length
    return {
      exitosas,
      fallidas,
      evaluadas,
      pendientes,
      porcentaje: evaluadas ? Math.round((exitosas / evaluadas) * 100) : 0,
      conUbicacionExacta,
    }
  }, [eventosEstadisticos])

  const partidosDisponibles = useMemo(
    () => [...partidosCalendario].sort((a, b) =>
      (b.fecha || '').localeCompare(a.fecha || ''),
    ),
    [partidosCalendario],
  )

  const titulares = useMemo(
    () => citaciones.filter((c) => c.titular || c.coordenadas),
    [citaciones],
  )

  const suplentes = useMemo(
    () => citaciones.filter((c) => !c.titular && !c.coordenadas),
    [citaciones],
  )

  const jugadorasVisibles = useMemo(() => {
    const busqueda = busquedaJugadora.trim().toLowerCase()

    if (!busqueda) return citaciones

    return citaciones.filter((c) => {
      const nombre = nombreJugadora(c.jugadora).toLowerCase()
      const dorsal = String(c.dorsal ?? '').toLowerCase()

      return nombre.includes(busqueda) || dorsal.includes(busqueda)
    })
  }, [citaciones, busquedaJugadora])

  function abrirEventoEnVideo(evento) {
    const partido = partidos.find((p) => p.id === evento.partido_id)
    const partidoCalendario = partido?.partido_calendario || partidosCalendario.find((p) => p.id === partido?.partido_calendario_id)
    const urlVideo = partido?.video_url || videoCalendario(partidoCalendario)

    setPartidoId(evento.partido_id)
    setSeccion('video')
    setError('')

    if (!youtubeEmbed(urlVideo)) {
      setSegundoPendiente(null)
      setError('Este partido no tiene un video válido asociado. Podés revisar la etiqueta, pero no saltar al video hasta agregarlo.')
      return
    }

    setSegundoPendiente({
      partidoId: evento.partido_id,
      segundo: Math.max(0, Number(evento.segundo) || 0),
    })
  }

  function irAlSegundo(valor) {
    const tiempo = Number(valor)

    if (!Number.isFinite(tiempo) || tiempo < 0) {
      setError('Ingresá un segundo válido.')
      return
    }

    if (!videoListo || !playerRef.current) {
      setError('Esperá a que el reproductor de YouTube esté listo.')
      return
    }

    try {
      playerRef.current.seekTo(Math.floor(tiempo), true)
      playerRef.current.playVideo()
      setTiempoVideo(Math.floor(tiempo))
      setError('')
    } catch (e) {
      console.error('No se pudo saltar al tiempo:', e)
      setError('No se pudo ir a ese momento del video.')
    }
  }

  function tomarTiempoActual() {
    if (!videoListo || !playerRef.current) {
      setError('Esperá a que el reproductor de YouTube esté listo.')
      return
    }

    const tiempo = Math.floor(playerRef.current.getCurrentTime() || 0)

    setSegundo(String(tiempo))
    setSegundoIr(String(tiempo))
    setError('')
  }

  function alternarReproduccion() {
    if (!videoListo || !playerRef.current) {
      setError('Esperá a que el reproductor de YouTube esté listo.')
      return
    }

    if (videoReproduciendo) playerRef.current.pauseVideo()
    else playerRef.current.playVideo()
  }

  async function registrarAccionRapida(tipoSeleccionado, idJugadora) {
    if (!esAdmin || !partidoActual || guardando) return

    if (!videoListo || !playerRef.current) {
      setError('Esperá a que el video esté conectado antes de etiquetar.')
      return
    }

    setGuardando(true)
    setError('')
    setMensaje('')

    try {
      const tiempo = Math.floor(playerRef.current.getCurrentTime() || 0)

      const { data, error: insertError } = await supabase
        .from('analisis_eventos')
        .insert({
          partido_id: partidoId,
          jugador_id: idJugadora,
          segundo: tiempo,
          tipo: tipoSeleccionado,
          zona: null,
          resultado: null,
          observaciones: null,
        })
        .select()
        .single()

      if (insertError) throw insertError

      setEventos((actuales) =>
        [...actuales, data].sort(
          (a, b) => Number(a.segundo) - Number(b.segundo),
        ),
      )

      setTipoRapido('')
      setMensaje(
        `${tipoSeleccionado} registrada para ${nombreJugadora(
          jugadoras.find((j) => j.id === idJugadora),
        )}. Resultado pendiente.`,
      )
    } catch (e) {
      console.error('Error al etiquetar acción:', e)
      setError(
        e.message ||
        'No se pudo guardar la acción rápida. Verificá que la base de datos permita resultado y zona nulos.',
      )
    } finally {
      setGuardando(false)
    }
  }

  function abrirEdicionEvento(evento) {
    if (!esAdmin) return

    setEditandoEventoId(evento.id)
    setEdicionEvento({
      tipo: evento.tipo || TIPOS[0],
      jugador_id: evento.jugador_id || '',
      segundo: String(evento.segundo ?? 0),
      zona: evento.zona || '',
      resultado: evento.resultado || '',
      observaciones: evento.observaciones || '',
      coordenada_x: evento.coordenada_x ?? null,
      coordenada_y: evento.coordenada_y ?? null,
    })

    setMostrarEdicionEvento(true)
    setError('')
    setMensaje('')
  }

  async function guardarEdicionEvento(e) {
    e.preventDefault()

    if (!esAdmin || !editandoEventoId || guardando) return

    setGuardando(true)
    setError('')
    setMensaje('')

    try {
      const tiempo = Number(edicionEvento.segundo)

      if (!Number.isInteger(tiempo) || tiempo < 0) {
        throw new Error('El tiempo debe ser un número entero de segundos.')
      }

      const { data, error: updateError } = await supabase
        .from('analisis_eventos')
        .update({
          tipo: edicionEvento.tipo,
          jugador_id: edicionEvento.jugador_id || null,
          segundo: tiempo,
          zona: edicionEvento.zona || null,
          resultado: edicionEvento.resultado || null,
          observaciones: edicionEvento.observaciones.trim() || null,
          coordenada_x: edicionEvento.coordenada_x,
          coordenada_y: edicionEvento.coordenada_y,
        })
        .eq('id', editandoEventoId)
        .select()
        .single()

      if (updateError) throw updateError

      setEventos((actuales) =>
        actuales.map((ev) => ev.id === data.id ? data : ev).sort(
          (a, b) => Number(a.segundo) - Number(b.segundo),
        ),
      )

      setMostrarEdicionEvento(false)
      setEditandoEventoId(null)
      setMensaje('Acción actualizada correctamente.')
    } catch (e) {
      console.error('Error al editar acción:', e)
      setError(e.message || 'No se pudo actualizar la acción.')
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarEvento(evento) {
    if (!esAdmin) return

    if (!window.confirm('¿Querés eliminar esta acción etiquetada?')) return

    const { error: deleteError } = await supabase
      .from('analisis_eventos')
      .delete()
      .eq('id', evento.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setEventos((actuales) => actuales.filter((e) => e.id !== evento.id))
    setMensaje('Acción eliminada.')
  }

  function limpiarFormulario() {
    setVideoUrl('')
    setNotas('')
    setPartidoCalendarioId('')
    setEditandoId(null)
  }

  function abrirNuevoAnalisis() {
    limpiarFormulario()
    setMostrarFormulario(true)
    setError('')
    setMensaje('')
  }

  function seleccionarPartidoCalendario(id) {
    setPartidoCalendarioId(id)

    const seleccionado = partidosCalendario.find((p) => p.id === id)

    if (!seleccionado) {
      setVideoUrl('')
      setNotas('')
      return
    }

    const analisisExistente = partidos.find(
      (p) => p.partido_calendario_id === id,
    )

    setVideoUrl(
      analisisExistente?.video_url || videoCalendario(seleccionado),
    )
    setNotas(analisisExistente?.notas || '')
  }

  function editarPartido(partido) {
    if (!esAdmin) return

    setEditandoId(partido.id)
    setPartidoCalendarioId(
      partido.partido_calendario_id ||
      partido.partido_calendario?.id ||
      '',
    )
    setVideoUrl(partido.video_url || '')
    setNotas(partido.notas || '')
    setMostrarFormulario(true)
    setError('')
    setMensaje('')
  }

  async function guardarPartido(e) {
    e.preventDefault()

    if (!esAdmin || guardando) return

    setGuardando(true)
    setError('')
    setMensaje('')

    try {
      const encuentro = partidosCalendario.find(
        (p) => p.id === partidoCalendarioId,
      )

      if (!encuentro) {
        throw new Error('Seleccioná un partido del calendario.')
      }

      if (videoUrl.trim() && !youtubeEmbed(videoUrl.trim())) {
        throw new Error('Ingresá un enlace válido de YouTube.')
      }

      const duplicado = partidos.find(
        (p) =>
          p.partido_calendario_id === encuentro.id &&
          p.id !== editandoId,
      )

      if (duplicado) {
        throw new Error(
          'Este partido ya tiene un análisis. Seleccionalo en la biblioteca para editarlo.',
        )
      }

      const registro = {
        categoria_id: encuentro.categoria_id || CATEGORIA_ID,
        rival: encuentro.rival,
        fecha: encuentro.fecha || null,
        partido_calendario_id: encuentro.id,
        video_url: videoUrl.trim() || null,
        notas: notas.trim() || null,
        creado_por: usuario?.email || null,
      }

      let respuesta

      if (editandoId) {
        respuesta = await supabase
          .from('analisis_partidos')
          .update(registro)
          .eq('id', editandoId)
          .select()
          .single()
      } else {
        respuesta = await supabase
          .from('analisis_partidos')
          .insert(registro)
          .select()
          .single()
      }

      if (respuesta.error) throw respuesta.error

      const idGuardado = respuesta.data.id
      const estabaEditando = Boolean(editandoId)

      limpiarFormulario()
      setMostrarFormulario(false)

      await cargarDatos()

      setPartidoId(idGuardado)
      setSeccion('video')
      setMensaje(
        estabaEditando
          ? 'Análisis actualizado.'
          : 'Análisis creado y vinculado al calendario.',
      )
    } catch (e) {
      console.error('Error al guardar análisis:', e)
      setError(e.message || 'No se pudo guardar el análisis.')
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarPartido(partido) {
    if (!esAdmin) return

    const confirmar = window.confirm(
      `¿Querés eliminar el análisis de ${partido.rival}? También se eliminarán sus eventos.`,
    )

    if (!confirmar) return

    setError('')
    setMensaje('')

    const { error: deleteError } = await supabase
      .from('analisis_partidos')
      .delete()
      .eq('id', partido.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setMensaje('Análisis eliminado. El partido del calendario se conserva.')
    await cargarDatos()
  }

  async function guardarEvento(e) {
    e.preventDefault()

    if (!esAdmin || !partidoActual || guardando) return

    setGuardando(true)
    setError('')
    setMensaje('')

    try {
      const tiempo = Number(segundo)

      if (!Number.isInteger(tiempo) || tiempo < 0) {
        throw new Error('El tiempo debe ser un número entero de segundos.')
      }

      if (jugadorId && !jugadoras.some((j) => j.id === jugadorId)) {
        throw new Error('La jugadora seleccionada no está disponible.')
      }

      const { data, error: insertError } = await supabase
        .from('analisis_eventos')
        .insert({
          partido_id: partidoId,
          jugador_id: jugadorId || null,
          segundo: tiempo,
          tipo,
          zona: zona || null,
          resultado: resultado || null,
          observaciones: observaciones.trim() || null,
          coordenada_x: coordenadasAccion?.x ?? null,
          coordenada_y: coordenadasAccion?.y ?? null,
        })
        .select()
        .single()

      if (insertError) throw insertError

      setEventos((actuales) =>
        [...actuales, data].sort(
          (a, b) => Number(a.segundo) - Number(b.segundo),
        ),
      )

      setMensaje('Acción registrada correctamente.')
      setObservaciones('')
      setCoordenadasAccion(null)
    } catch (e) {
      console.error('Error al registrar acción:', e)
      setError(e.message || 'No se pudo registrar la acción.')
    } finally {
      setGuardando(false)
    }
  }

  function imprimirInforme() {
    window.print()
  }

  if (cargando) {
    return (
      <div className="p-6 text-sm" style={{ color: SECUNDARIO }}>
        Cargando módulo de Análisis...
      </div>
    )
  }

  return (
    <div
      className="min-h-screen space-y-5 p-3 md:p-6"
      style={{ backgroundColor: FONDO, color: TEXTO }}
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p
            className="mb-2 text-xs font-bold uppercase tracking-[0.2em]"
            style={{ color: AMARILLO }}
          >
            COMUNICACIONES · PERFORMANCE
          </p>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">
            Videoanálisis
          </h1>
          <p className="mt-2 text-sm" style={{ color: SECUNDARIO }}>
            Etiquetado de acciones, formación y análisis del rendimiento.
          </p>
          <p className="mt-2 text-xs" style={{ color: SECUNDARIO }}>
            {esAdmin
              ? 'Modo administrador · Gestión habilitada'
              : 'Modo consulta · Solo lectura'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Boton secundario onClick={cargarDatos}>
            ↻ Actualizar
          </Boton>

          {esAdmin && (
            <Boton
              onClick={() => {
                if (mostrarFormulario) {
                  limpiarFormulario()
                  setMostrarFormulario(false)
                } else {
                  abrirNuevoAnalisis()
                }
              }}
            >
              {mostrarFormulario ? 'Cancelar' : '+ Nuevo análisis'}
            </Boton>
          )}
        </div>
      </header>

      {error && (
        <div
          className="rounded-lg border p-3 text-sm"
          style={{
            backgroundColor: '#351D22',
            borderColor: '#85404B',
            color: '#FFD5DA',
          }}
        >
          {error}
        </div>
      )}

      {mensaje && (
        <div
          className="rounded-lg border p-3 text-sm"
          style={{
            backgroundColor: '#203326',
            borderColor: '#3B714A',
            color: '#D5F5DE',
          }}
        >
          {mensaje}
        </div>
      )}

      {mostrarFormulario && esAdmin && (
        <Panel>
          <h2 className="mb-2 text-lg font-bold">
            {editandoId ? 'Editar análisis' : 'Vincular análisis a un partido'}
          </h2>

          <p className="mb-4 text-sm" style={{ color: SECUNDARIO }}>
            Seleccioná un encuentro existente del calendario. No se creará otro
            partido en el calendario.
          </p>

          <form onSubmit={guardarPartido} className="space-y-4">
            <Campo label="Partido del calendario">
              <select
                className={inputClass}
                style={inputStyle}
                value={partidoCalendarioId}
                onChange={(e) => seleccionarPartidoCalendario(e.target.value)}
                required
                disabled={Boolean(editandoId)}
              >
                <option value="">Seleccioná un partido...</option>

                {partidosDisponibles.map((p) => {
                  const yaExiste = partidos.find(
                    (a) =>
                      a.partido_calendario_id === p.id &&
                      a.id !== editandoId,
                  )

                  return (
                    <option key={p.id} value={p.id}>
                      {p.rival} — {fechaLegible(p.fecha)}
                      {p.local_visitante ? ` · ${p.local_visitante}` : ''}
                      {p.numero_fecha ? ` · ${p.numero_fecha}` : ''}
                      {yaExiste ? ' (ya tiene análisis)' : ''}
                    </option>
                  )
                })}
              </select>
            </Campo>

            <Campo label="Enlace de YouTube específico del análisis">
              <input
                className={inputClass}
                style={inputStyle}
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              <span className="text-xs" style={{ color: SECUNDARIO }}>
                Si lo dejás vacío, se utilizará el video disponible en el
                calendario.
              </span>
            </Campo>

            <Campo label="Notas generales">
              <textarea
                className={inputClass}
                style={inputStyle}
                rows={3}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Observaciones generales del partido..."
              />
            </Campo>

            <div className="flex flex-wrap gap-2">
              <Boton submit disabled={guardando || !partidoCalendarioId}>
                {guardando ? 'Guardando...' : 'Guardar análisis'}
              </Boton>

              <Boton
                secundario
                onClick={() => {
                  limpiarFormulario()
                  setMostrarFormulario(false)
                }}
              >
                Cancelar
              </Boton>
            </div>
          </form>
        </Panel>
      )}

      <Panel
        className="overflow-hidden"
        style={{
          background:
            'linear-gradient(120deg, #202A38 0%, #151D29 70%, #242B30 100%)',
        }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl text-xl font-black"
            style={{ backgroundColor: AMARILLO, color: '#171717' }}
          >
            ▶
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">Biblioteca de análisis</h2>
            <p className="mt-1 text-sm" style={{ color: SECUNDARIO }}>
              {partidos.length} análisis · {partidosCalendario.length} partidos
              en el calendario
            </p>
          </div>

          {partidoActual && (
            <div className="text-right">
              <p className="text-xs" style={{ color: SECUNDARIO }}>
                PARTIDO ACTIVO
              </p>
              <p className="font-bold">{partidoActual.rival}</p>
          </div>

          )}
        </div>

        {partidos.length === 0 ? (
          <p className="mt-4 text-sm" style={{ color: SECUNDARIO }}>
            Todavía no hay análisis guardados. Usá «Nuevo análisis» para elegir
            un partido del calendario.
          </p>
        ) : (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {partidos.map((partido) => {
              const encuentro =
                partido.partido_calendario ||
                partidosCalendario.find(
                  (p) => p.id === partido.partido_calendario_id,
                )

              const activo = partido.id === partidoId

              return (
                <button
                  key={partido.id}
                  type="button"
                  onClick={() => {
                    setPartidoId(partido.id)
                    setFiltroJugador('todos')
                    setFiltroTipo('todos')
                    setFiltroResultado('todos')
                    setSeccion('video')
                    setTipoRapido('')
                    setError('')
                    setMensaje('')
                  }}
                  className="min-w-[190px] rounded-lg border p-3 text-left transition hover:border-yellow-400"
                  style={{
                    backgroundColor: activo ? '#303B4D' : FONDO,
                    borderColor: activo ? AMARILLO : BORDE,
                  }}
                >
                  <p className="font-bold">{encuentro?.rival || partido.rival}</p>
                  <p className="mt-1 text-xs" style={{ color: SECUNDARIO }}>
                    {datosEncuentro({
                      ...partido,
                      partido_calendario: encuentro,
                    })}
                  </p>
                  <p className="mt-2 text-xs" style={{ color: AMARILLO }}>
                    {eventos.filter((e) => e.partido_id === partido.id).length}{' '}
                    acciones
                  </p>
                </button>
              )
            })}
          </div>
        )}

        {esAdmin && partidoActual && (
          <div className="mt-4 flex flex-wrap gap-3 border-t pt-3" style={{ borderColor: BORDE }}>
            <button
              type="button"
              className="text-xs font-bold"
              style={{ color: AMARILLO }}
              onClick={() => editarPartido(partidoActual)}
            >
              Editar datos del análisis
            </button>
            <button
              type="button"
              className="text-xs font-bold text-red-300"
              onClick={() => eliminarPartido(partidoActual)}
            >
              Eliminar análisis
            </button>
          </div>
        )}
      </Panel>

      {partidoActual && (
        <>
          <nav className="flex flex-wrap gap-2">
            {[
              ['video', '▶ Video y etiquetas'],
              ['explorador', '⌕ Explorador de acciones'],
              ['estadisticas', '▥ Estadísticas'],
              ['mapa', '▦ Mapa de zonas'],
              ['informe', '▤ Informe'],
            ].map(([id, texto]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSeccion(id)}
                className="rounded-lg border px-4 py-2.5 text-sm font-bold"
                style={{
                  backgroundColor: seccion === id ? AMARILLO : PANEL,
                  color: seccion === id ? '#171717' : TEXTO,
                  borderColor: seccion === id ? AMARILLO : BORDE,
                }}
              >
                {texto}
              </button>
            ))}
          </nav>

          {seccion === 'video' && (
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(350px,0.9fr)]">
              <div className="space-y-5">
                <Panel>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p
                        className="text-xs font-bold uppercase tracking-widest"
                        style={{ color: AMARILLO }}
                      >
                        PARTIDO EN ANÁLISIS
                      </p>
                      <h2 className="mt-1 text-xl font-black">
                        {partidoActual.rival}
                      </h2>
                      <p className="mt-1 text-sm" style={{ color: SECUNDARIO }}>
                        {datosEncuentro(partidoActual)}
                      </p>
                    </div>

                    <div
                      className="rounded-lg border px-3 py-2 text-xs"
                      style={{
                        backgroundColor: FONDO,
                        borderColor: BORDE,
                        color: videoListo ? '#4ADE80' : SECUNDARIO,
                      }}
                    >
                      {videoListo ? '● Video conectado' : '○ Conectando video'}
                    </div>
                  </div>

                  {videoActual ? (
                    <div className="aspect-video overflow-hidden rounded-lg bg-black">
                      <iframe
                        key={`${partidoActual.id}-${videoActual}`}
                        ref={iframeRef}
                        title={`Video del partido contra ${partidoActual.rival}`}
                        src={videoActual}
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <div
                      className="flex aspect-video flex-col items-center justify-center rounded-lg border p-5 text-center"
                      style={{ backgroundColor: FONDO, borderColor: BORDE }}
                    >
                      <span className="text-4xl">▶</span>
                      <p className="mt-3 font-bold">No hay video disponible</p>
                      <p className="mt-1 text-sm" style={{ color: SECUNDARIO }}>
                        Agregá un enlace de YouTube desde los datos del análisis.
                      </p>
                      {esAdmin && (
                        <div className="mt-4">
                          <Boton onClick={() => editarPartido(partidoActual)}>
                            Agregar video
                          </Boton>
                        </div>
                      )}
                    </div>
                  )}

                  {videoActual && (
                    <div className="mt-4 space-y-3">
                      <div
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                        style={{ backgroundColor: FONDO, borderColor: BORDE }}
                      >
                        <div>
                          <p className="text-xs" style={{ color: SECUNDARIO }}>
                            TIEMPO ACTUAL
                          </p>
                          <p
                            className="font-mono text-3xl font-black"
                            style={{ color: AMARILLO }}
                          >
                            {formatearTiempo(tiempoVideo)}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Boton secundario disabled={!videoListo} onClick={alternarReproduccion}>
                            {videoReproduciendo ? 'Ⅱ Pausar' : '▶ Reproducir'}
                          </Boton>
                          <Boton secundario disabled={!videoListo} onClick={tomarTiempoActual}>
                            Tomar tiempo
                          </Boton>
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <Campo label="Ir a un segundo del video">
                          <input
                            className={inputClass}
                            style={inputStyle}
                            type="number"
                            min="0"
                            step="1"
                            value={segundoIr}
                            onChange={(e) => setSegundoIr(e.target.value)}
                            placeholder="Ej.: 754"
                          />
                        </Campo>
                        <div className="flex items-end">
                          <Boton
                            secundario
                            disabled={!videoListo}
                            onClick={() => irAlSegundo(segundoIr)}
                          >
                            Ir al momento
                          </Boton>
                        </div>
                      </div>

                      {videoUrlActual && (
                        <a
                          href={videoUrlActual}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block text-sm font-bold"
                          style={{ color: AMARILLO }}
                        >
                          Abrir video en YouTube ↗
                        </a>
                      )}
                    </div>
                  )}

                  {partidoActual.notas && (
                    <div
                      className="mt-4 rounded-lg border p-3"
                      style={{ backgroundColor: FONDO, borderColor: BORDE }}
                    >
                      <p className="mb-1 text-xs font-bold uppercase" style={{ color: SECUNDARIO }}>
                        Notas generales
                      </p>
                      <p className="whitespace-pre-wrap text-sm">
                        {partidoActual.notas}
                      </p>
                    </div>
                  )}
                </Panel>

                <Panel>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p
                        className="text-xs font-bold uppercase tracking-widest"
                        style={{ color: AMARILLO }}
                      >
                        CONVOCATORIA DEL PARTIDO
                      </p>
                      <h2 className="mt-1 text-lg font-bold">Formación y banco</h2>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black">{citaciones.length}</p>
                      <p className="text-xs" style={{ color: SECUNDARIO }}>
                        convocadas
                      </p>
                    </div>
                  </div>

                  {citaciones.length === 0 ? (
                    <div
                      className="rounded-lg border p-4 text-sm"
                      style={{
                        backgroundColor: FONDO,
                        borderColor: BORDE,
                        color: SECUNDARIO,
                      }}
                    >
                      No se encontraron convocadas para este encuentro. Revisá
                      la pestaña Convocados del partido seleccionado.
                    </div>
                  ) : (
                    <>
                      <div
                        className="relative overflow-hidden rounded-lg border p-3"
                        style={{
                          backgroundColor: '#173C32',
                          borderColor: '#3C7562',
                        }}
                      >
                        <div
                          className="pointer-events-none absolute inset-2 rounded border opacity-40"
                          style={{ borderColor: '#B8D9C7' }}
                        />
                        <div
                          className="pointer-events-none absolute left-1/2 top-2 bottom-2 border-l opacity-30"
                          style={{ borderColor: '#B8D9C7' }}
                        />
                        <div
                          className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border opacity-30"
                          style={{ borderColor: '#B8D9C7' }}
                        />
                        <div className="relative grid min-h-[280px] grid-cols-3 gap-2 sm:min-h-[320px]">
                          {titulares.length > 0 && titulares.some((c) => c.coordenadas) ? (
                            citaciones
                              .filter((c) => c.titular || c.coordenadas)
                              .map((c) => {
                                const pos = c.coordenadas
                                return (
                                  <div
                                    key={c.id}
                                    className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                                    style={{
                                      left: `${pos?.x ?? 50}%`,
                                      top: `${pos?.y ?? 50}%`,
                                      maxWidth: '30%',
                                    }}
                                  >
                                    <button
                                      type="button"
                                      disabled={!esAdmin}
                                      onClick={() => setJugadorId(c.jugador_id)}
                                      title={nombreJugadora(c.jugadora)}
                                      className="flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-black shadow-lg"
                                      style={{
                                        backgroundColor: jugadorId === c.jugador_id ? '#FFFFFF' : AMARILLO,
                                        borderColor: jugadorId === c.jugador_id ? '#171717' : '#FFF0B2',
                                        color: '#171717',
                                      }}
                                    >
                                      {c.dorsal ?? '—'}
                                    </button>
                                    <span
                                      className="mt-1 max-w-full truncate rounded px-1 text-center text-[10px] font-bold"
                                      style={{
                                        backgroundColor: '#0F1419DD',
                                        color: '#FFFFFF',
                                      }}
                                    >
                                      {c.jugadora?.apellido || c.jugadora?.nombre}
                                    </span>
                                  </div>
                                )
                              })
                          ) : (
                            <div className="col-span-3 flex flex-wrap content-center justify-center gap-3">
                              {titulares.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  disabled={!esAdmin}
                                  onClick={() => setJugadorId(c.jugador_id)}
                                  className="flex w-24 flex-col items-center rounded-lg p-2"
                                  style={{
                                    backgroundColor: jugadorId === c.jugador_id ? '#40513B' : '#205344',
                                    border: `1px solid ${jugadorId === c.jugador_id ? AMARILLO : '#568675'}`,
                                  }}
                                >
                                  <span
                                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-black"
                                    style={{ backgroundColor: AMARILLO, color: '#171717' }}
                                  >
                                    {c.dorsal ?? '—'}
                                  </span>
                                  <span className="mt-2 max-w-full truncate text-xs font-semibold">
                                    {c.jugadora?.apellido || c.jugadora?.nombre}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <h3 className="text-sm font-bold">Suplentes</h3>
                          <span className="text-xs" style={{ color: SECUNDARIO }}>
                            {suplentes.length} jugadoras
                          </span>
                        </div>

                        {suplentes.length ? (
                          <div className="flex flex-wrap gap-2">
                            {suplentes.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                disabled={!esAdmin}
                                onClick={() => setJugadorId(c.jugador_id)}
                                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left"
                                style={{
                                  backgroundColor: jugadorId === c.jugador_id ? '#3A3522' : FONDO,
                                  borderColor: jugadorId === c.jugador_id ? AMARILLO : BORDE,
                                }}
                              >
                                <span
                                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-black"
                                  style={{ backgroundColor: '#303B4D', color: TEXTO }}
                                >
                                  {c.dorsal ?? '—'}
                                </span>
                                <span className="text-xs font-semibold">
                                  {nombreJugadora(c.jugadora)}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm" style={{ color: SECUNDARIO }}>
                            No hay suplentes cargadas o todas tienen posición guardada en cancha.
                          </p>
                        )}
                      </div>

                      <p className="mt-3 text-xs" style={{ color: SECUNDARIO }}>
                        Seleccioná una jugadora para asignarla al próximo evento.
                        Las posiciones se muestran cuando están guardadas en Convocados.
                      </p>
                    </>
                  )}
                </Panel>
              </div>

              <div className="space-y-5">
                <Panel>
                  <div className="mb-4">
                    <p
                      className="text-xs font-bold uppercase tracking-widest"
                      style={{ color: AMARILLO }}
                    >
                      LIVE TAGGING
                    </p>
                    <h2 className="mt-1 text-xl font-black">Etiquetado rápido</h2>
                    <p className="mt-2 text-sm" style={{ color: SECUNDARIO }}>
                      1. Elegí una acción. 2. Elegí la jugadora. 3. Completá el
                      resultado cuando revises el evento.
                    </p>
                  </div>

                  {!esAdmin ? (
                    <p className="text-sm" style={{ color: SECUNDARIO }}>
                      Solo el administrador puede registrar acciones.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
                        {TIPOS_RAPIDOS.map((accion) => {
                          const activa = tipoRapido === accion.nombre

                          return (
                            <button
                              key={accion.nombre}
                              type="button"
                              disabled={guardando}
                              onClick={() => {
                                setTipoRapido(activa ? '' : accion.nombre)
                                setTipo(accion.nombre)
                                setError('')
                                setMensaje('')
                              }}
                              className="rounded-lg border p-3 text-left transition hover:brightness-125"
                              style={{
                                backgroundColor: activa ? '#303B4D' : FONDO,
                                borderColor: activa ? accion.color : BORDE,
                                boxShadow: activa ? `inset 0 0 0 1px ${accion.color}` : 'none',
                              }}
                            >
                              <span
                                className="flex h-7 w-7 items-center justify-center rounded-md text-base font-black"
                                style={{
                                  backgroundColor: `${accion.color}22`,
                                  color: accion.color,
                                }}
                              >
                                {accion.icono}
                              </span>
                              <span className="mt-2 block text-xs font-bold">
                                {accion.corto}
                              </span>
                            </button>
                          )
                        })}
                      </div>

                      {tipoRapido && (
                        <div
                          className="mt-4 rounded-lg border p-3"
                          style={{
                            backgroundColor: FONDO,
                            borderColor: AMARILLO,
                          }}
                        >
                          <p className="text-sm font-bold">
                            Acción seleccionada: {tipoRapido}
                          </p>
                          <p className="mt-1 text-xs" style={{ color: SECUNDARIO }}>
                            Tiempo: {formatearTiempo(tiempoVideo)} · Elegí una
                            convocada para guardar el evento.
                          </p>

                          <Campo label="Buscar jugadora por nombre o dorsal">
                            <input
                              className={`${inputClass} mt-3`}
                              style={inputStyle}
                              value={busquedaJugadora}
                              onChange={(e) => setBusquedaJugadora(e.target.value)}
                              placeholder="Nombre, apellido o dorsal..."
                            />
                          </Campo>

                          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
                            {jugadorasVisibles.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                disabled={guardando || !videoListo}
                                onClick={() =>
                                  registrarAccionRapida(tipoRapido, c.jugador_id)
                                }
                                className="flex w-full items-center gap-3 rounded-lg border p-2 text-left hover:border-yellow-400 disabled:opacity-40"
                                style={{
                                  backgroundColor: '#202A38',
                                  borderColor: BORDE,
                                }}
                              >
                                <span
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black"
                                  style={{
                                    backgroundColor: AMARILLO,
                                    color: '#171717',
                                  }}
                                >
                                  {c.dorsal ?? '—'}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-bold">
                                    {nombreJugadora(c.jugadora)}
                                  </span>
                                  <span className="text-xs" style={{ color: SECUNDARIO }}>
                                    {c.titular ? 'Titular' : 'Suplente'}
                                  </span>
                                </span>
                                <span style={{ color: AMARILLO }}>＋</span>
                              </button>
                            ))}

                            {jugadorasVisibles.length === 0 && (
                              <p className="py-3 text-sm" style={{ color: SECUNDARIO }}>
                                No hay convocadas que coincidan con la búsqueda.
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="my-5 border-t" style={{ borderColor: BORDE }} />

                      <details>
                        <summary className="cursor-pointer text-sm font-bold">
                          Registro manual / acción detallada
                        </summary>

                        <form onSubmit={guardarEvento} className="mt-4 space-y-4">
                          <Campo label="Acción">
                            <select
                              className={inputClass}
                              style={inputStyle}
                              value={tipo}
                              onChange={(e) => setTipo(e.target.value)}
                            >
                              {TIPOS.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </Campo>

                          <Campo label="Jugadora">
                            <select
                              className={inputClass}
                              style={inputStyle}
                              value={jugadorId}
                              onChange={(e) => setJugadorId(e.target.value)}
                            >
                              <option value="">Sin jugadora asignada</option>
                              {citaciones.map((c) => (
                                <option key={c.id} value={c.jugador_id}>
                                  {c.dorsal ?? '—'} · {nombreJugadora(c.jugadora)}
                                </option>
                              ))}
                            </select>
                          </Campo>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <Campo label="Tiempo en segundos">
                              <input
                                className={inputClass}
                                style={inputStyle}
                                type="number"
                                min="0"
                                step="1"
                                value={segundo}
                                onChange={(e) => setSegundo(e.target.value)}
                                required
                              />
                              <p className="mt-1 text-xs" style={{ color: SECUNDARIO }}>
                                {formatearTiempo(segundo)}
                              </p>
                            </Campo>

                            <Campo label="Resultado">
                              <select
                                className={inputClass}
                                style={inputStyle}
                                value={resultado}
                                onChange={(e) => setResultado(e.target.value)}
                              >
                                {RESULTADOS.map((r) => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                            </Campo>
                          </div>

                          <Boton
                            secundario
                            disabled={!videoListo}
                            onClick={tomarTiempoActual}
                          >
                            Tomar tiempo del video
                          </Boton>

                          <Campo label="Zona de cancha">
                            <select
                              className={inputClass}
                              style={inputStyle}
                              value={zona}
                              onChange={(e) => setZona(e.target.value)}
                            >
                              {ZONAS.map((z) => (
                                <option key={z} value={z}>{z}</option>
                              ))}
                            </select>
                          </Campo>

                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="text-sm font-medium" style={{ color: TEXTO }}>Ubicación exacta en cancha (opcional)</label>
                              <span className="text-xs" style={{ color: SECUNDARIO }}>
                                {coordenadasAccion ? `X ${coordenadasAccion.x}% · Y ${coordenadasAccion.y}%` : 'Tocá la cancha para ubicar la acción'}
                              </span>
                            </div>
                            <CanchaInteractiva
                              interactiva
                              coordenadas={coordenadasAccion}
                              onSelect={(punto) => {
                                setCoordenadasAccion(punto)
                                setZona(zonaDesdeCoordenadas(punto.x, punto.y))
                              }}
                            />
                            <div className="flex justify-between gap-2">
                              <p className="text-xs" style={{ color: SECUNDARIO }}>La ubicación se guarda junto con la acción.</p>
                              {coordenadasAccion && <button type="button" className="text-xs font-bold" style={{ color: AMARILLO }} onClick={() => setCoordenadasAccion(null)}>Quitar ubicación</button>}
                            </div>
                          </div>

                          <Campo label="Observaciones">
                            <textarea
                              className={inputClass}
                              style={inputStyle}
                              rows={2}
                              value={observaciones}
                              onChange={(e) => setObservaciones(e.target.value)}
                              placeholder="Detalle opcional..."
                            />
                          </Campo>

                          <Boton submit disabled={guardando}>
                            {guardando ? 'Guardando...' : 'Registrar acción'}
                          </Boton>
                        </form>
                      </details>
                    </>
                  )}
                </Panel>

                <Panel>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p
                        className="text-xs font-bold uppercase tracking-widest"
                        style={{ color: AMARILLO }}
                      >
                        RESUMEN
                      </p>
                      <h2 className="mt-1 text-lg font-bold">Actividad etiquetada</h2>
                    </div>
                    <span
                      className="rounded-lg px-3 py-2 text-xl font-black"
                      style={{ backgroundColor: FONDO, color: AMARILLO }}
                    >
                      {eventosPartido.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ['Pendientes', eventosPartido.filter((e) => !e.resultado).length],
                      ['Exitosas', eventosPartido.filter((e) =>
                        ['Exitoso', 'Gol', 'Atajada'].includes(e.resultado),
                      ).length],
                      ['Fallidas', eventosPartido.filter((e) =>
                        ['Fallido', 'Fuera', 'Bloqueado'].includes(e.resultado),
                      ).length],
                    ].map(([label, valor]) => (
                      <div
                        key={label}
                        className="rounded-lg border p-3"
                        style={{ backgroundColor: FONDO, borderColor: BORDE }}
                      >
                        <p className="text-xs" style={{ color: SECUNDARIO }}>{label}</p>
                        <p className="mt-1 text-2xl font-black">{valor}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>

              <Panel className="xl:col-span-2">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p
                      className="text-xs font-bold uppercase tracking-widest"
                      style={{ color: AMARILLO }}
                    >
                      EVENT LOG
                    </p>
                    <h2 className="mt-1 text-xl font-black">
                      Acciones registradas ({eventosFiltrados.length})
                    </h2>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <select
                      className="rounded-lg border p-2 text-xs"
                      style={inputStyle}
                      value={filtroJugador}
                      onChange={(e) => setFiltroJugador(e.target.value)}
                    >
                      <option value="todos">Todas las jugadoras</option>
                      {jugadoras.map((j) => (
                        <option key={j.id} value={j.id}>
                          {nombreJugadora(j)}
                        </option>
                      ))}
                    </select>

                    <select
                      className="rounded-lg border p-2 text-xs"
                      style={inputStyle}
                      value={filtroTipo}
                      onChange={(e) => setFiltroTipo(e.target.value)}
                    >
                      <option value="todos">Todas las acciones</option>
                      {TIPOS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>

                    <select
                      className="rounded-lg border p-2 text-xs"
                      style={inputStyle}
                      value={filtroResultado}
                      onChange={(e) => setFiltroResultado(e.target.value)}
                    >
                      <option value="todos">Todos los resultados</option>
                      <option value="Pendiente">Pendientes</option>
                      {RESULTADOS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {mostrarEdicionEvento && (
                  <form
                    onSubmit={guardarEdicionEvento}
                    className="mb-5 space-y-4 rounded-lg border p-4"
                    style={{ backgroundColor: FONDO, borderColor: AMARILLO }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-bold">Editar acción</h3>
                      <button
                        type="button"
                        onClick={() => setMostrarEdicionEvento(false)}
                        className="text-sm"
                        style={{ color: SECUNDARIO }}
                      >
                        Cerrar ×
                      </button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Campo label="Acción">
                        <select
                          className={inputClass}
                          style={inputStyle}
                          value={edicionEvento.tipo}
                          onChange={(e) => setEdicionEvento((a) => ({
                            ...a,
                            tipo: e.target.value,
                          }))}
                        >
                          {TIPOS.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </Campo>

                      <Campo label="Jugadora">
                        <select
                          className={inputClass}
                          style={inputStyle}
                          value={edicionEvento.jugador_id}
                          onChange={(e) => setEdicionEvento((a) => ({
                            ...a,
                            jugador_id: e.target.value,
                          }))}
                        >
                          <option value="">Sin jugadora</option>
                          {jugadoras.map((j) => (
                            <option key={j.id} value={j.id}>
                              {nombreJugadora(j)}
                            </option>
                          ))}
                        </select>
                      </Campo>

                      <Campo label="Tiempo (segundos)">
                        <input
                          className={inputClass}
                          style={inputStyle}
                          type="number"
                          min="0"
                          step="1"
                          required
                          value={edicionEvento.segundo}
                          onChange={(e) => setEdicionEvento((a) => ({
                            ...a,
                            segundo: e.target.value,
                          }))}
                        />
                      </Campo>

                      <Campo label="Zona">
                        <select
                          className={inputClass}
                          style={inputStyle}
                          value={edicionEvento.zona}
                          onChange={(e) => setEdicionEvento((a) => ({
                            ...a,
                            zona: e.target.value,
                          }))}
                        >
                          <option value="">Pendiente de completar</option>
                          {ZONAS.map((z) => (
                            <option key={z} value={z}>{z}</option>
                          ))}
                        </select>
                      </Campo>

                      <Campo label="Resultado">
                        <select
                          className={inputClass}
                          style={inputStyle}
                          value={edicionEvento.resultado}
                          onChange={(e) => setEdicionEvento((a) => ({
                            ...a,
                            resultado: e.target.value,
                          }))}
                        >
                          <option value="">Pendiente de completar</option>
                          {RESULTADOS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </Campo>

                      <Campo label="Observaciones">
                        <input
                          className={inputClass}
                          style={inputStyle}
                          value={edicionEvento.observaciones}
                          onChange={(e) => setEdicionEvento((a) => ({
                            ...a,
                            observaciones: e.target.value,
                          }))}
                          placeholder="Detalle..."
                        />
                      </Campo>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-sm font-medium" style={{ color: TEXTO }}>Ubicación exacta en cancha</label>
                        <span className="text-xs" style={{ color: SECUNDARIO }}>
                          {edicionEvento.coordenada_x != null && edicionEvento.coordenada_y != null
                            ? `X ${edicionEvento.coordenada_x}% · Y ${edicionEvento.coordenada_y}%`
                            : 'Sin ubicación exacta'}
                        </span>
                      </div>
                      <CanchaInteractiva
                        interactiva
                        coordenadas={edicionEvento.coordenada_x != null && edicionEvento.coordenada_y != null
                          ? { x: Number(edicionEvento.coordenada_x), y: Number(edicionEvento.coordenada_y) }
                          : null}
                        onSelect={(punto) => setEdicionEvento((a) => ({
                          ...a,
                          coordenada_x: punto.x,
                          coordenada_y: punto.y,
                          zona: zonaDesdeCoordenadas(punto.x, punto.y),
                        }))}
                      />
                      {(edicionEvento.coordenada_x != null || edicionEvento.coordenada_y != null) && (
                        <button type="button" className="text-xs font-bold" style={{ color: AMARILLO }} onClick={() => setEdicionEvento((a) => ({ ...a, coordenada_x: null, coordenada_y: null }))}>Quitar ubicación exacta</button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Boton submit disabled={guardando}>
                        {guardando ? 'Guardando...' : 'Guardar cambios'}
                      </Boton>
                      <Boton
                        secundario
                        onClick={() => setMostrarEdicionEvento(false)}
                      >
                        Cancelar
                      </Boton>
                    </div>
                  </form>
                )}

                {eventosFiltrados.length === 0 ? (
                  <div
                    className="rounded-lg border p-6 text-center text-sm"
                    style={{
                      backgroundColor: FONDO,
                      borderColor: BORDE,
                      color: SECUNDARIO,
                    }}
                  >
                    No hay acciones para mostrar con estos filtros.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {eventosFiltrados.map((ev) => {
                      const jugadora = jugadoras.find(
                        (j) => j.id === ev.jugador_id,
                      )

                      const accion = TIPOS_RAPIDOS.find(
                        (a) => a.nombre === ev.tipo,
                      )

                      const pendiente = !ev.resultado

                      return (
                        <article
                          key={ev.id}
                          className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                          style={{ backgroundColor: FONDO, borderColor: BORDE }}
                        >
                          <button
                            type="button"
                            disabled={!videoListo}
                            onClick={() => {
                              setSegundoIr(String(ev.segundo))
                              irAlSegundo(ev.segundo)
                            }}
                            className="min-w-[62px] rounded-md px-2 py-2 text-center font-mono text-sm font-black disabled:opacity-40"
                            style={{ backgroundColor: '#303B4D', color: AMARILLO }}
                            title="Ir a este momento del video"
                          >
                            {formatearTiempo(ev.segundo)}
                          </button>

                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-black"
                            style={{
                              backgroundColor: `${accion?.color || AMARILLO}20`,
                              color: accion?.color || AMARILLO,
                            }}
                          >
                            {accion?.icono || '•'}
                          </div>

                          <div className="min-w-[120px] flex-1">
                            <p className="font-bold">{ev.tipo}</p>
                            <p className="mt-1 text-xs" style={{ color: SECUNDARIO }}>
                              {jugadora ? nombreJugadora(jugadora) : 'Sin jugadora'}
                              {ev.zona ? ` · ${ev.zona}` : ''}
                            </p>
                            {ev.observaciones && (
                              <p className="mt-1 text-xs" style={{ color: SECUNDARIO }}>
                                {ev.observaciones}
                              </p>
                            )}
                          </div>

                          <span
                            className="rounded-md px-2 py-1 text-xs font-bold"
                            style={{
                              backgroundColor: pendiente ? '#3A3522' : '#202A38',
                              color: pendiente ? AMARILLO : TEXTO,
                            }}
                          >
                            {ev.resultado || 'Pendiente'}
                          </span>

                          {esAdmin && (
                            <div className="flex gap-3">
                              <button
                                type="button"
                                onClick={() => abrirEdicionEvento(ev)}
                                className="text-xs font-bold"
                                style={{ color: AMARILLO }}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => eliminarEvento(ev)}
                                className="text-xs font-bold text-red-300"
                              >
                                Eliminar
                              </button>
                            </div>
                          )}
                        </article>
                      )
                    })}
                  </div>
                )}
              </Panel>
            </div>
          )}

          {seccion === 'explorador' && (
            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: AMARILLO }}>
                    BIBLIOTECA DE JUGADAS
                  </p>
                  <h2 className="mt-1 text-xl font-black">Explorador de acciones</h2>
                  <p className="mt-1 text-sm" style={{ color: SECUNDARIO }}>
                    Buscá acciones de todos los partidos analizados y abrí el video directamente en el momento registrado.
                  </p>
                </div>
                <span className="rounded-lg px-3 py-2 text-sm font-black" style={{ backgroundColor: FONDO, color: AMARILLO }}>
                  {eventosExplorador.length} resultados
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Campo label="Partido / rival">
                  <select className={inputClass} style={inputStyle} value={filtroExploradorPartido} onChange={(e) => setFiltroExploradorPartido(e.target.value)}>
                    <option value="todos">Todos los partidos</option>
                    {partidos.map((p) => (
                      <option key={p.id} value={p.id}>{p.rival} · {fechaLegible(p.fecha)}</option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Jugadora">
                  <select className={inputClass} style={inputStyle} value={filtroExploradorJugadora} onChange={(e) => setFiltroExploradorJugadora(e.target.value)}>
                    <option value="todos">Todas las jugadoras</option>
                    {jugadoras.map((j) => <option key={j.id} value={j.id}>{nombreJugadora(j)}</option>)}
                  </select>
                </Campo>
                <Campo label="Tipo de acción">
                  <select className={inputClass} style={inputStyle} value={filtroExploradorTipo} onChange={(e) => setFiltroExploradorTipo(e.target.value)}>
                    <option value="todos">Todos los tipos</option>
                    {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Campo>
                <Campo label="Resultado">
                  <select className={inputClass} style={inputStyle} value={filtroExploradorResultado} onChange={(e) => setFiltroExploradorResultado(e.target.value)}>
                    <option value="todos">Todos los resultados</option>
                    <option value="Pendiente">Pendientes</option>
                    {RESULTADOS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Campo>
                <Campo label="Zona de cancha">
                  <select className={inputClass} style={inputStyle} value={filtroExploradorZona} onChange={(e) => setFiltroExploradorZona(e.target.value)}>
                    <option value="todos">Todas las zonas</option>
                    {ZONAS.map((z) => <option key={z} value={z}>{z}</option>)}
                  </select>
                </Campo>
                <div className="grid grid-cols-2 gap-2">
                  <Campo label="Minuto desde">
                    <input type="number" min="0" className={inputClass} style={inputStyle} value={filtroExploradorMinutoDesde} onChange={(e) => setFiltroExploradorMinutoDesde(e.target.value)} placeholder="Ej. 0" />
                  </Campo>
                  <Campo label="Minuto hasta">
                    <input type="number" min="0" className={inputClass} style={inputStyle} value={filtroExploradorMinutoHasta} onChange={(e) => setFiltroExploradorMinutoHasta(e.target.value)} placeholder="Ej. 90" />
                  </Campo>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Boton secundario onClick={() => {
                  setFiltroExploradorPartido('todos')
                  setFiltroExploradorJugadora('todos')
                  setFiltroExploradorTipo('todos')
                  setFiltroExploradorResultado('todos')
                  setFiltroExploradorZona('todos')
                  setFiltroExploradorMinutoDesde('')
                  setFiltroExploradorMinutoHasta('')
                }}>Limpiar filtros</Boton>
              </div>

              <div className="mt-5 overflow-x-auto rounded-lg border" style={{ borderColor: BORDE }}>
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead style={{ backgroundColor: FONDO, color: SECUNDARIO }}>
                    <tr>
                      <th className="p-3">Video</th>
                      <th className="p-3">Partido</th>
                      <th className="p-3">Jugadora</th>
                      <th className="p-3">Acción</th>
                      <th className="p-3">Zona</th>
                      <th className="p-3">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventosExplorador.map((ev) => {
                      const partido = partidos.find((p) => p.id === ev.partido_id)
                      const jugadora = jugadoras.find((j) => j.id === ev.jugador_id)
                      const accion = TIPOS_RAPIDOS.find((a) => a.nombre === ev.tipo)
                      return (
                        <tr key={ev.id} className="border-t" style={{ borderColor: BORDE }}>
                          <td className="p-3">
                            <button type="button" disabled={!youtubeEmbed(partido?.video_url || videoCalendario(partido?.partido_calendario))} className="rounded-md px-3 py-2 font-mono font-black disabled:cursor-not-allowed disabled:opacity-40" style={{ backgroundColor: '#303B4D', color: AMARILLO }}
                              title={youtubeEmbed(partido?.video_url || videoCalendario(partido?.partido_calendario)) ? 'Abrir el video en este momento' : 'Este partido no tiene un video válido'}
                              onClick={() => {
                                setError('')
                                setVideoListo(false)
                                setSegundoPendiente({ partidoId: ev.partido_id, segundo: Math.max(0, Number(ev.segundo) || 0) })
                                setPartidoId(ev.partido_id)
                                setSeccion('video')
                              }}>
                              {formatearTiempo(ev.segundo)}
                            </button>
                          </td>
                          <td className="p-3">
                            <span className="block font-bold">{partido?.rival || 'Partido sin nombre'}</span>
                            <span className="text-xs" style={{ color: SECUNDARIO }}>{fechaLegible(partido?.fecha)}</span>
                          </td>
                          <td className="p-3">{jugadora ? nombreJugadora(jugadora) : 'Sin jugadora'}</td>
                          <td className="p-3 font-bold" style={{ color: accion?.color || TEXTO }}>{ev.tipo}</td>
                          <td className="p-3">{ev.zona || '—'}</td>
                          <td className="p-3">
                            <span className="rounded-md px-2 py-1 text-xs font-bold" style={{ backgroundColor: ev.resultado ? '#202A38' : '#3A3522', color: ev.resultado ? TEXTO : AMARILLO }}>
                              {ev.resultado || 'Pendiente'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {eventosExplorador.length === 0 && (
                  <p className="p-6 text-center text-sm" style={{ color: SECUNDARIO }}>
                    No hay acciones que coincidan con los filtros seleccionados.
                  </p>
                )}
              </div>
              <p className="mt-3 text-xs" style={{ color: SECUNDARIO }}>
                Los minutos se calculan a partir del segundo guardado en cada acción. Las acciones sin zona o resultado también aparecen y se pueden revisar.
              </p>
            </Panel>
          )}

          {seccion === 'estadisticas' && (
            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black">Estadísticas</h2>
                  <p className="mt-1 text-sm" style={{ color: SECUNDARIO }}>
                    {alcanceEstadisticas === 'partido'
                      ? `Partido seleccionado · ${partidoActual?.rival || 'Sin rival'}`
                      : `Acumulado de ${partidos.length} partidos registrados`}
                  </p>
                  {alcanceEstadisticas === 'partido' && partidoActual && (
                    <p className="mt-1 text-xs" style={{ color: SECUNDARIO }}>
                      {datosEncuentro(partidoActual)}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Alcance de estadísticas">
                  <button
                    type="button"
                    onClick={() => setAlcanceEstadisticas('partido')}
                    className="rounded-lg border px-4 py-2 text-sm font-bold"
                    style={alcanceEstadisticas === 'partido'
                      ? { backgroundColor: AMARILLO, color: '#171717', borderColor: AMARILLO }
                      : { backgroundColor: FONDO, color: TEXTO, borderColor: BORDE }}
                  >Partido seleccionado</button>
                  <button
                    type="button"
                    onClick={() => setAlcanceEstadisticas('acumulado')}
                    className="rounded-lg border px-4 py-2 text-sm font-bold"
                    style={alcanceEstadisticas === 'acumulado'
                      ? { backgroundColor: AMARILLO, color: '#171717', borderColor: AMARILLO }
                      : { backgroundColor: FONDO, color: TEXTO, borderColor: BORDE }}
                  >Todos los partidos</button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ['Acciones totales', eventosEstadisticos.length],
                  ['Efectivas', resumenEfectividad.exitosas],
                  ['No efectivas', resumenEfectividad.fallidas],
                  ['Efectividad', resumenEfectividad.evaluadas ? `${resumenEfectividad.porcentaje}%` : '—'],
                  ['Pendientes', resumenEfectividad.pendientes],
                ].map(([label, valor]) => (
                  <div
                    key={label}
                    className="rounded-lg border p-4"
                    style={{ backgroundColor: FONDO, borderColor: BORDE }}
                  >
                    <p className="text-sm" style={{ color: SECUNDARIO }}>{label}</p>
                    <p className="mt-2 text-3xl font-black" style={{ color: AMARILLO }}>
                      {valor}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 rounded-lg border p-3 text-sm" style={{ backgroundColor: FONDO, borderColor: BORDE }}>
                <span style={{ color: SECUNDARIO }}>Partidos incluidos: <strong style={{ color: TEXTO }}>{alcanceEstadisticas === 'partido' ? (partidoActual ? 1 : 0) : partidos.length}</strong></span>
                <span style={{ color: SECUNDARIO }}>Acciones sin jugadora asignada: <strong style={{ color: TEXTO }}>{eventosEstadisticos.filter((e) => !e.jugador_id).length}</strong></span>
              </div>

              <div className="mt-6">
                <h3 className="mb-3 font-bold">Rendimiento colectivo · acciones por tipo</h3>
                {estadisticas.length === 0 ? (
                  <p className="text-sm" style={{ color: SECUNDARIO }}>
                    Todavía no hay acciones etiquetadas.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {estadisticas.map(([nombre, datos]) => {
                      const maximo = Math.max(
                        1,
                        ...estadisticas.map(([, d]) => d.total),
                      )

                      return (
                        <div key={nombre}>
                          <div className="mb-1 flex justify-between gap-3 text-sm">
                            <span>{nombre}</span>
                            <span className="font-bold">{datos.total}</span>
                          </div>
                          <div
                            className="h-2 overflow-hidden rounded-full"
                            style={{ backgroundColor: '#303B4D' }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{
                                backgroundColor: AMARILLO,
                                width: `${(datos.total / maximo) * 100}%`,
                              }}
                            />
                          </div>
                          <p className="mt-1 text-xs" style={{ color: SECUNDARIO }}>
                            Exitosos: {datos.exitosos} · Fallidos: {datos.fallidos}
                            {' · '}Pendientes: {datos.pendientes}
                            {' · '}Efectividad: {datos.exitosos + datos.fallidos > 0
                              ? `${Math.round((datos.exitosos / (datos.exitosos + datos.fallidos)) * 100)}%`
                              : 'Sin evaluar'}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="mt-7">
                <h3 className="mb-3 font-bold">Rendimiento individual · acciones por jugadora</h3>
                {estadisticasJugadoras.length === 0 ? (
                  <p className="text-sm" style={{ color: SECUNDARIO }}>
                    No hay acciones asignadas a jugadoras.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[500px] text-left text-sm">
                      <thead>
                        <tr style={{ color: SECUNDARIO }}>
                          <th className="p-2">Jugadora</th>
                          <th className="p-2">Acciones</th>
                          <th className="p-2">Efectivas</th>
                          <th className="p-2">No efectivas</th>
                          <th className="p-2">Efectividad</th>
                          <th className="p-2">Detalle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {estadisticasJugadoras.map((j) => (
                          <tr
                            key={j.id}
                            className="border-t"
                            style={{ borderColor: BORDE }}
                          >
                            <td className="p-2 font-bold">{j.nombre}</td>
                            <td className="p-2">{j.total}</td>
                            <td className="p-2 text-emerald-300">{eventosEstadisticos.filter((e) => e.jugador_id === j.id && ['Exitoso', 'Gol', 'Atajada'].includes(e.resultado)).length}</td>
                            <td className="p-2 text-red-300">{eventosEstadisticos.filter((e) => e.jugador_id === j.id && ['Fallido', 'Fuera', 'Bloqueado'].includes(e.resultado)).length}</td>
                            <td className="p-2">{(() => {
                              const positivas = eventosEstadisticos.filter((e) => e.jugador_id === j.id && ['Exitoso', 'Gol', 'Atajada'].includes(e.resultado)).length
                              const negativas = eventosEstadisticos.filter((e) => e.jugador_id === j.id && ['Fallido', 'Fuera', 'Bloqueado'].includes(e.resultado)).length
                              return positivas + negativas ? `${Math.round((positivas / (positivas + negativas)) * 100)}%` : '—'
                            })()}</td>
                            <td className="p-2">
                              {Object.entries(j.tipos)
                                .map(([t, n]) => `${t}: ${n}`)
                                .join(' · ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Panel>
          )}

          {seccion === 'mapa' && (
            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">Mapa táctico interactivo</h2>
                  <p className="mt-2 max-w-2xl text-sm" style={{ color: SECUNDARIO }}>
                    Filtrá las acciones del partido o de todos los encuentros. Tocá un punto o una acción para abrir el video en el segundo registrado.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ['Acciones', resumenMapa.total],
                    ['Con ubicación', resumenMapa.conUbicacion],
                    ['Exactas', resumenMapa.exactas],
                    ['Sin ubicación', resumenMapa.sinUbicacion],
                  ].map(([label, valor]) => (
                    <div key={label} className="rounded-lg border px-3 py-2" style={{ borderColor: BORDE, backgroundColor: FONDO }}>
                      <p className="text-[10px] uppercase tracking-wide" style={{ color: SECUNDARIO }}>{label}</p>
                      <p className="text-lg font-black" style={{ color: label === 'Exactas' ? AMARILLO : TEXTO }}>{valor}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Alcance del mapa">
                {[
                  ['partido', 'Partido seleccionado'],
                  ['acumulado', 'Todos los partidos'],
                ].map(([valor, etiqueta]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setAlcanceMapa(valor)}
                    className="rounded-lg border px-4 py-2 text-sm font-bold"
                    style={{
                      backgroundColor: alcanceMapa === valor ? AMARILLO : FONDO,
                      color: alcanceMapa === valor ? '#171717' : TEXTO,
                      borderColor: alcanceMapa === valor ? AMARILLO : BORDE,
                    }}
                  >
                    {etiqueta}
                  </button>
                ))}
                <span className="self-center text-xs" style={{ color: SECUNDARIO }}>
                  {alcanceMapa === 'partido' ? `Encuentro: ${partidoActual?.rival || 'seleccionado'}` : `${partidos.length} partidos disponibles`}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {alcanceMapa === 'acumulado' && (
                  <Campo label="Partido / rival">
                    <select className={inputClass} style={inputStyle} value={filtroMapaPartido} onChange={(e) => setFiltroMapaPartido(e.target.value)}>
                      <option value="todos">Todos los partidos</option>
                      {partidos.map((partido) => (
                        <option key={partido.id} value={partido.id}>{partido.rival || 'Rival sin nombre'} · {partido.fecha || 'Sin fecha'}</option>
                      ))}
                    </select>
                  </Campo>
                )}
                <Campo label="Jugadora">
                  <select className={inputClass} style={inputStyle} value={filtroMapaJugadora} onChange={(e) => setFiltroMapaJugadora(e.target.value)}>
                    <option value="todos">Todas las jugadoras</option>
                    {jugadoras.map((jugadora) => <option key={jugadora.id} value={jugadora.id}>{nombreJugadora(jugadora)}</option>)}
                  </select>
                </Campo>
                <Campo label="Tipo de acción">
                  <select className={inputClass} style={inputStyle} value={filtroMapaTipo} onChange={(e) => setFiltroMapaTipo(e.target.value)}>
                    <option value="todos">Todos los tipos</option>
                    {TIPOS.map((accion) => <option key={accion} value={accion}>{accion}</option>)}
                  </select>
                </Campo>
                <Campo label="Resultado">
                  <select className={inputClass} style={inputStyle} value={filtroMapaResultado} onChange={(e) => setFiltroMapaResultado(e.target.value)}>
                    <option value="todos">Todos los resultados</option>
                    <option value="Pendiente">Pendiente</option>
                    {RESULTADOS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Campo>
                <Campo label="Zona de cancha">
                  <select className={inputClass} style={inputStyle} value={filtroMapaZona} onChange={(e) => setFiltroMapaZona(e.target.value)}>
                    <option value="todos">Todas las zonas</option>
                    {ZONAS.map((z) => <option key={z} value={z}>{z}</option>)}
                  </select>
                </Campo>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs" style={{ color: SECUNDARIO }}>
                  {eventosMapa.length} acciones coinciden con los filtros · {resumenMapa.aproximadas} ubicación(es) aproximada(s)
                </p>
                <button
                  type="button"
                  className="rounded-lg border px-3 py-2 text-xs font-bold"
                  style={{ borderColor: BORDE, color: TEXTO, backgroundColor: FONDO }}
                  onClick={() => {
                    setFiltroMapaPartido('todos')
                    setFiltroMapaJugadora('todos')
                    setFiltroMapaTipo('todos')
                    setFiltroMapaResultado('todos')
                    setFiltroMapaZona('todos')
                  }}
                >
                  Limpiar filtros
                </button>
              </div>

              <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
                <div className="space-y-3">
                  <CanchaInteractiva
                    eventos={eventosMapa}
                    onEventClick={abrirEventoEnVideo}
                  />
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs" style={{ color: SECUNDARIO }}>
                    {[
                      ['#F2C230', 'Remate / centro / gol'],
                      ['#4ADE80', 'Acción positiva'],
                      ['#F87171', 'Pérdida / acción negativa'],
                      ['#60A5FA', 'Duelo / otras acciones'],
                    ].map(([color, label]) => (
                      <span key={label} className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{label}
                      </span>
                    ))}
                    <span className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: '#FFFFFF', backgroundColor: '#64748B', opacity: 0.7 }} />Ubicación aproximada</span>
                  </div>
                  <p className="text-xs" style={{ color: SECUNDARIO }}>
                    Los puntos sin coordenadas exactas se ubican en el centro de la zona registrada. Los eventos sin coordenadas ni zona no se dibujan, pero aparecen en el listado y pueden abrirse desde su segundo de video.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="font-bold">Acciones por zona</h3>
                    <div className="mt-3 space-y-2">
                      {resumenMapa.zonas.map((zona) => {
                        const maximo = Math.max(1, ...resumenMapa.zonas.map((item) => item.total))
                        const porcentaje = resumenMapa.conUbicacion ? Math.round((zona.total / resumenMapa.conUbicacion) * 100) : 0
                        return (
                          <button
                            key={zona.nombre}
                            type="button"
                            onClick={() => setFiltroMapaZona(filtroMapaZona === zona.nombre ? 'todos' : zona.nombre)}
                            className="w-full rounded-lg border p-2.5 text-left"
                            style={{ borderColor: filtroMapaZona === zona.nombre ? AMARILLO : BORDE, backgroundColor: filtroMapaZona === zona.nombre ? '#292719' : FONDO }}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                              <span>{zona.nombre}</span>
                              <span className="font-bold" style={{ color: AMARILLO }}>{zona.total} <span className="font-normal" style={{ color: SECUNDARIO }}>({porcentaje}%)</span></span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: '#303B4D' }}>
                              <div className="h-full rounded-full" style={{ width: `${(zona.total / maximo) * 100}%`, backgroundColor: AMARILLO }} />
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="font-bold">Acciones para revisar</h3>
                      <span className="text-xs" style={{ color: SECUNDARIO }}>{eventosMapaOrdenados.length}</span>
                    </div>
                    <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                      {eventosMapaOrdenados.map((evento) => {
                        const partido = partidos.find((p) => p.id === evento.partido_id)
                        const jugadora = jugadoras.find((j) => j.id === evento.jugador_id)
                        const punto = coordenadasEvento(evento)
                        const tieneVideo = Boolean(youtubeEmbed(partido?.video_url || videoCalendario(partido?.partido_calendario || partidosCalendario.find((p) => p.id === partido?.partido_calendario_id))))
                        return (
                          <button
                            key={evento.id}
                            type="button"
                            onClick={() => abrirEventoEnVideo(evento)}
                            className="w-full rounded-lg border p-3 text-left transition hover:border-yellow-400"
                            style={{ borderColor: BORDE, backgroundColor: FONDO }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold">{evento.tipo}</p>
                                <p className="mt-1 truncate text-xs" style={{ color: SECUNDARIO }}>
                                  {nombreJugadora(jugadora)} · {partido?.rival || 'Rival sin nombre'}
                                </p>
                                <p className="mt-1 text-xs" style={{ color: SECUNDARIO }}>
                                  {zonaEfectivaEvento(evento) || 'Sin zona'} · {evento.resultado || 'Pendiente'} · {punto?.exacta ? 'Exacta' : punto ? 'Aproximada' : 'Sin ubicación'}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-md px-2 py-1 font-mono text-xs font-black" style={{ backgroundColor: '#303B4D', color: AMARILLO }}>
                                {formatearTiempo(evento.segundo)}
                              </span>
                            </div>
                            <p className="mt-2 text-[10px]" style={{ color: tieneVideo ? AMARILLO : '#F87171' }}>
                              {tieneVideo ? '▶ Abrir video en esta acción' : 'Video no disponible para este partido'}
                            </p>
                          </button>
                        )
                      })}
                      {eventosMapaOrdenados.length === 0 && (
                        <div className="rounded-lg border p-4 text-sm" style={{ borderColor: BORDE, color: SECUNDARIO }}>
                          No hay acciones que coincidan con estos filtros.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Panel>
          )}

          {seccion === 'informe' && (
            <Panel id="informe-imprimible" className="pdf-informe">
              <div className="pdf-cabecera flex flex-wrap items-start justify-between gap-4 rounded-xl border-b-4 p-5" style={{ backgroundColor: '#171717', borderColor: AMARILLO, color: '#FFFFFF' }}>
                <div className="min-w-0">
                  <p className="pdf-acento text-xs font-black uppercase tracking-[0.22em]" style={{ color: AMARILLO }}>
                    COMUNICACIONES · VIDEOANÁLISIS
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight" style={{ color: '#FFFFFF' }}>Informe técnico de partido</h2>
                  <p className="mt-2 text-lg font-bold" style={{ color: '#FFFFFF' }}>{partidoActual.rival || 'Rival sin especificar'}</p>
                  <p className="mt-1 text-sm" style={{ color: '#E5E5E5' }}>{datosEncuentro(partidoActual)}</p>
                </div>
                <Boton onClick={imprimirInforme} className="no-imprimir">
                  Imprimir / Guardar PDF
                </Boton>
              </div>

              <div className="pdf-meta mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border p-3" style={{ borderColor: BORDE, backgroundColor: FONDO }}>
                  <p className="text-xs uppercase tracking-wide" style={{ color: SECUNDARIO }}>Acciones registradas</p>
                  <p className="mt-1 text-2xl font-black">{eventosPartido.length}</p>
                </div>
                <div className="rounded-lg border p-3" style={{ borderColor: BORDE, backgroundColor: FONDO }}>
                  <p className="text-xs uppercase tracking-wide" style={{ color: SECUNDARIO }}>Con jugadora</p>
                  <p className="mt-1 text-2xl font-black">{eventosPartido.filter((e) => e.jugador_id).length}</p>
                </div>
                <div className="rounded-lg border p-3" style={{ borderColor: BORDE, backgroundColor: FONDO }}>
                  <p className="text-xs uppercase tracking-wide" style={{ color: SECUNDARIO }}>Efectivas</p>
                  <p className="mt-1 text-2xl font-black">{eventosPartido.filter((e) => ['Exitoso', 'Gol', 'Atajada'].includes(e.resultado)).length}</p>
                </div>
                <div className="rounded-lg border p-3" style={{ borderColor: BORDE, backgroundColor: FONDO }}>
                  <p className="text-xs uppercase tracking-wide" style={{ color: SECUNDARIO }}>Pendientes / neutras</p>
                  <p className="mt-1 text-2xl font-black">{eventosPartido.filter((e) => !e.resultado || e.resultado === 'Neutro').length}</p>
                </div>
              </div>

              <div className="pdf-seccion mt-6 rounded-xl border p-4" style={{ borderColor: BORDE, backgroundColor: '#FFF9E6' }}>
                <h3 className="mb-3 text-base font-black" style={{ color: '#171717' }}>Resumen ejecutivo</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="border-l-4 pl-3" style={{ borderColor: AMARILLO }}>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6B7280' }}>Acción más registrada</p>
                    <p className="mt-1 text-sm font-black" style={{ color: '#171717' }}>{estadisticasInforme[0]?.[0] || 'Sin acciones registradas'}</p>
                    {estadisticasInforme[0] && <p className="text-xs" style={{ color: '#4B5563' }}>{estadisticasInforme[0][1].total} registro(s)</p>}
                  </div>
                  <div className="border-l-4 pl-3" style={{ borderColor: AMARILLO }}>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6B7280' }}>Jugadora con más acciones</p>
                    <p className="mt-1 text-sm font-black" style={{ color: '#171717' }}>{jugadorasInforme[0]?.nombre || 'Sin acciones asignadas'}</p>
                    {jugadorasInforme[0] && <p className="text-xs" style={{ color: '#4B5563' }}>{jugadorasInforme[0].total} acción(es) etiquetada(s)</p>}
                  </div>
                  <div className="border-l-4 pl-3" style={{ borderColor: AMARILLO }}>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6B7280' }}>Efectividad evaluable</p>
                    <p className="mt-1 text-sm font-black" style={{ color: '#171717' }}>{(() => { const ef = eventosPartido.filter((e) => ['Exitoso', 'Gol', 'Atajada'].includes(e.resultado)).length; const noEf = eventosPartido.filter((e) => ['Fallido', 'Fuera', 'Bloqueado'].includes(e.resultado)).length; return ef + noEf ? `${Math.round((ef / (ef + noEf)) * 100)}%` : 'Sin datos evaluables' })()}</p>
                    <p className="text-xs" style={{ color: '#4B5563' }}>Solo resultados evaluables</p>
                  </div>
                </div>
                <p className="mt-3 text-xs" style={{ color: '#4B5563' }}>Este resumen destaca volumen de registro; no sustituye la interpretación táctica del analista.</p>
              </div>

              <div className="pdf-seccion pdf-graficos mt-6">
                <h3 className="mb-3 border-b pb-2 text-base font-black" style={{ borderColor: BORDE }}>Panel visual del partido</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="pdf-grafico-card rounded-xl border p-4" style={{ borderColor: BORDE, backgroundColor: '#FFFFFF' }}>
                    <p className="text-xs font-black uppercase tracking-wide" style={{ color: '#4B5563' }}>Efectividad evaluable</p>
                    <div className="mt-3 flex items-center gap-3">
                      <svg viewBox="0 0 100 100" role="img" aria-label="Gráfico circular de efectividad" style={{ width: '96px', height: '96px', flexShrink: 0 }}>
                        <circle cx="50" cy="50" r="36" fill="none" stroke="#E5E7EB" strokeWidth="13" />
                        {resumenGraficoInforme.evaluables > 0 && <>
                          <circle cx="50" cy="50" r="36" fill="none" stroke="#F2C230" strokeWidth="13" strokeDasharray={`${(resumenGraficoInforme.efectivas / resumenGraficoInforme.evaluables) * 226.2} 226.2`} transform="rotate(-90 50 50)" />
                          <circle cx="50" cy="50" r="36" fill="none" stroke="#27272A" strokeWidth="13" strokeDasharray={`${(resumenGraficoInforme.noEfectivas / resumenGraficoInforme.evaluables) * 226.2} 226.2`} strokeDashoffset={`-${(resumenGraficoInforme.efectivas / resumenGraficoInforme.evaluables) * 226.2}`} transform="rotate(-90 50 50)" />
                        </>}
                        <text x="50" y="47" textAnchor="middle" fontSize="17" fontWeight="900" fill="#171717">{resumenGraficoInforme.porcentaje === null ? '—' : `${resumenGraficoInforme.porcentaje}%`}</text>
                        <text x="50" y="60" textAnchor="middle" fontSize="7" fill="#6B7280">EFECTIVIDAD</text>
                      </svg>
                      <div className="space-y-2 text-xs">
                        <p><span className="pdf-leyenda-amarilla inline-block mr-2 h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#F2C230' }} />Efectivas: <strong>{resumenGraficoInforme.efectivas}</strong></p>
                        <p><span className="pdf-leyenda-negra inline-block mr-2 h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#27272A' }} />No efectivas: <strong>{resumenGraficoInforme.noEfectivas}</strong></p>
                        <p><span className="pdf-leyenda-gris inline-block mr-2 h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#D1D5DB' }} />Pendientes/neutras: <strong>{resumenGraficoInforme.pendientes}</strong></p>
                      </div>
                    </div>
                    <p className="mt-2 text-[10px]" style={{ color: '#6B7280' }}>El porcentaje excluye acciones pendientes y neutras.</p>
                  </div>

                  <div className="pdf-grafico-card rounded-xl border p-4" style={{ borderColor: BORDE, backgroundColor: '#FFFFFF' }}>
                    <p className="text-xs font-black uppercase tracking-wide" style={{ color: '#4B5563' }}>Acciones más registradas</p>
                    <div className="mt-3 space-y-3">
                      {accionesGraficoInforme.length ? accionesGraficoInforme.map(([nombre, datos]) => {
                        const maximo = Math.max(...accionesGraficoInforme.map(([, d]) => d.total), 1)
                        return <div key={nombre}>
                          <div className="mb-1 flex items-center justify-between gap-2 text-xs"><span className="min-w-0 truncate font-semibold">{nombre}</span><strong>{datos.total}</strong></div>
                          <div className="pdf-barra-fondo h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: '#E5E7EB' }}><div className="pdf-barra-amarilla" style={{ width: `${(datos.total / maximo) * 100}%`, height: '100%', backgroundColor: '#F2C230', borderRadius: '999px' }} /></div>
                        </div>
                      }) : <p className="text-xs" style={{ color: '#6B7280' }}>Sin acciones registradas.</p>}
                    </div>
                  </div>

                  <div className="pdf-grafico-card rounded-xl border p-4" style={{ borderColor: BORDE, backgroundColor: '#FFFFFF' }}>
                    <p className="text-xs font-black uppercase tracking-wide" style={{ color: '#4B5563' }}>Jugadoras · volumen de acciones</p>
                    <div className="mt-3 space-y-3">
                      {jugadorasInforme.slice(0, 5).length ? jugadorasInforme.slice(0, 5).map((j) => {
                        const maximo = Math.max(...jugadorasInforme.slice(0, 5).map((item) => item.total), 1)
                        return <div key={j.id}>
                          <div className="mb-1 flex items-center justify-between gap-2 text-xs"><span className="min-w-0 truncate font-semibold">{j.nombre}</span><strong>{j.total}</strong></div>
                          <div className="pdf-barra-fondo h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: '#E5E7EB' }}><div className="pdf-barra-negra" style={{ width: `${(j.total / maximo) * 100}%`, height: '100%', backgroundColor: '#27272A', borderRadius: '999px' }} /></div>
                        </div>
                      }) : <p className="text-xs" style={{ color: '#6B7280' }}>Sin acciones asignadas a jugadoras.</p>}
                    </div>
                    <p className="mt-2 text-[10px]" style={{ color: '#6B7280' }}>Muestra las cinco con más etiquetas; no representa por sí solo calidad ni minutos jugados.</p>
                  </div>
                </div>
              </div>

              <div className="pdf-seccion mt-6">
                <h3 className="mb-3 border-b pb-2 text-base font-black" style={{ borderColor: BORDE }}>1. Rendimiento colectivo · acciones por tipo</h3>
                {estadisticasInforme.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm pdf-tabla">
                      <thead><tr style={{ color: SECUNDARIO }}>
                        <th className="p-2">Acción</th><th className="p-2 text-right">Total</th><th className="p-2 text-right">Efectivas</th><th className="p-2 text-right">No efectivas</th><th className="p-2 text-right">Pendientes</th><th className="p-2 text-right">Efectividad</th>
                      </tr></thead>
                      <tbody>{estadisticasInforme.map(([nombre, datos]) => (
                        <tr key={nombre} className="border-t" style={{ borderColor: BORDE }}>
                          <td className="p-2 font-semibold">{nombre}</td><td className="p-2 text-right">{datos.total}</td><td className="p-2 text-right">{datos.efectivas}</td><td className="p-2 text-right">{datos.noEfectivas}</td><td className="p-2 text-right">{datos.pendientes}</td>
                          <td className="p-2 text-right">{datos.efectivas + datos.noEfectivas ? `${Math.round(datos.efectivas / (datos.efectivas + datos.noEfectivas) * 100)}%` : '—'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <p className="text-sm">Todavía no hay acciones etiquetadas para este partido.</p>}
                <p className="mt-2 text-xs" style={{ color: SECUNDARIO }}>La efectividad se calcula sobre acciones con resultado evaluable: efectivas frente a no efectivas. Las acciones neutras o sin resultado no entran en ese porcentaje.</p>
              </div>

              <div className="pdf-seccion mt-6">
                <h3 className="mb-3 border-b pb-2 text-base font-black" style={{ borderColor: BORDE }}>2. Rendimiento individual · jugadoras</h3>
                {jugadorasInforme.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm pdf-tabla">
                      <thead><tr style={{ color: SECUNDARIO }}>
                        <th className="p-2">Jugadora</th><th className="p-2 text-right">Acciones</th><th className="p-2 text-right">Efectivas</th><th className="p-2 text-right">No efectivas</th><th className="p-2 text-right">Efectividad</th>
                      </tr></thead>
                      <tbody>{jugadorasInforme.map((j) => (
                        <tr key={j.id} className="border-t" style={{ borderColor: BORDE }}>
                          <td className="p-2 font-semibold">{j.nombre}</td><td className="p-2 text-right">{j.total}</td><td className="p-2 text-right">{j.efectivas}</td><td className="p-2 text-right">{j.noEfectivas}</td><td className="p-2 text-right">{j.efectividad === null ? '—' : `${j.efectividad}%`}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <p className="text-sm">No hay acciones asignadas a jugadoras en este partido.</p>}
              </div>

              <div className="pdf-seccion pdf-distribucion-zonas mt-6">
                <h3 className="mb-3 border-b pb-2 text-base font-black" style={{ borderColor: BORDE }}>3. Distribución de acciones por zona</h3>
                <CanchaInformePDF eventos={eventosPartido} />
              </div>

              {partidoActual.notas && (
                <div className="pdf-seccion mt-6">
                  <h3 className="mb-2 text-base font-black">4. Observaciones generales</h3>
                  <p className="whitespace-pre-wrap text-sm">{partidoActual.notas}</p>
                </div>
              )}

              <div className="pdf-seccion mt-6">
                <h3 className="mb-3 border-b pb-2 text-base font-black" style={{ borderColor: BORDE }}>Detalle cronológico de acciones</h3>
                {eventosPartido.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs pdf-tabla">
                      <thead><tr style={{ color: SECUNDARIO }}>
                        <th className="p-2">Tiempo</th><th className="p-2">Acción</th><th className="p-2">Jugadora</th><th className="p-2">Zona</th><th className="p-2">Resultado</th><th className="p-2">Observaciones</th>
                      </tr></thead>
                      <tbody>{[...eventosPartido].sort((a, b) => Number(a.segundo) - Number(b.segundo)).map((ev) => (
                        <tr key={ev.id} className="border-t" style={{ borderColor: BORDE }}>
                          <td className="p-2 font-mono">{formatearTiempo(ev.segundo)}</td><td className="p-2">{ev.tipo}</td><td className="p-2">{nombreJugadora(jugadoras.find((j) => j.id === ev.jugador_id))}</td><td className="p-2">{ev.zona || '—'}</td><td className="p-2">{ev.resultado || 'Pendiente'}</td><td className="p-2">{ev.observaciones || '—'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <p className="text-sm">Todavía no hay acciones registradas.</p>}
              </div>

              <div className="pdf-pie mt-7 border-t pt-3 text-xs" style={{ borderColor: BORDE, color: SECUNDARIO }}>
                Informe generado desde el módulo de videoanálisis de Comunicaciones. Los datos corresponden a las acciones guardadas para este partido.
              </div>
            </Panel>
          )}
        </>
      )}

      <footer
        className="border-t pt-4 text-xs"
        style={{ borderColor: BORDE, color: SECUNDARIO }}
      >
        {esAdmin
          ? 'Administrador: Kevin Garay · Gestión de análisis'
          : 'Modo consulta · Los cambios están restringidos'}
      </footer>

      <style>{`
        @page { size: A4; margin: 14mm 12mm 16mm; }
        @media print {
          html, body { background: #fff !important; color: #171717 !important; }
          body * { visibility: hidden !important; }
          #informe-imprimible, #informe-imprimible * { visibility: visible !important; }
          #informe-imprimible {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 100% !important; margin: 0 !important; padding: 0 !important;
            border: 0 !important; border-radius: 0 !important; box-shadow: none !important;
            background: #fff !important; color: #171717 !important;
            font-size: 10pt !important;
          }
          #informe-imprimible * { color: #171717 !important; background-color: transparent !important; border-color: #d1d5db !important; box-shadow: none !important; }
          #informe-imprimible .pdf-acento { color: #F2C230 !important; }
          #informe-imprimible .no-imprimir, #informe-imprimible button { display: none !important; }
          #informe-imprimible .pdf-cabecera { padding: 14pt !important; margin-bottom: 10pt !important; background: #171717 !important; border-bottom: 4pt solid #F2C230 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          #informe-imprimible .pdf-cabecera h2, #informe-imprimible .pdf-cabecera p:not(.pdf-acento) { color: #FFFFFF !important; }
          #informe-imprimible .pdf-meta > div { padding: 8pt !important; border: 1px solid #d1d5db !important; }
          #informe-imprimible .pdf-seccion { break-inside: auto; page-break-inside: auto; }
          #informe-imprimible .pdf-graficos { break-inside: avoid; page-break-inside: avoid; }
          #informe-imprimible .pdf-grafico-card { break-inside: avoid; page-break-inside: avoid; border: 1px solid #D1D5DB !important; }
          #informe-imprimible .pdf-distribucion-zonas { break-inside: auto; page-break-inside: auto; }
          #informe-imprimible .pdf-zonas-cancha, #informe-imprimible .pdf-zona-celda { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          #informe-imprimible .pdf-zonas-cancha { break-inside: avoid; page-break-inside: avoid; }
          #informe-imprimible .pdf-zonas-cancha { background-color: #F8FAFC !important; }
          #informe-imprimible .pdf-zona-celda { background-color: #FFFFFF !important; }
          #informe-imprimible .pdf-zonas-resumen > .grid > div:first-child { background-color: #FFFBEB !important; }
          #informe-imprimible .pdf-zonas-resumen > .grid > div:last-child { background-color: #F3F4F6 !important; }
          #informe-imprimible .pdf-zona-barra-fondo { background-color: #E5E7EB !important; }
          #informe-imprimible .pdf-zona-barra { background-color: #F2C230 !important; }
          #informe-imprimible .pdf-zonas-layout { grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.4fr) !important; gap: 10pt !important; }
          #informe-imprimible .pdf-zona-celda { padding: 5pt !important; break-inside: avoid; page-break-inside: avoid; }
          #informe-imprimible .pdf-zona-celda p { overflow-wrap: anywhere; }
          #informe-imprimible .pdf-graficos .grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
          #informe-imprimible .pdf-graficos .pdf-grafico-card { padding: 8pt !important; }
          #informe-imprimible .pdf-barra-fondo { background-color: #E5E7EB !important; }
          #informe-imprimible .pdf-barra-amarilla, #informe-imprimible .pdf-leyenda-amarilla { background-color: #F2C230 !important; }
          #informe-imprimible .pdf-barra-negra, #informe-imprimible .pdf-leyenda-negra { background-color: #27272A !important; }
          #informe-imprimible .pdf-leyenda-gris { background-color: #D1D5DB !important; }
          #informe-imprimible .pdf-seccion.rounded-xl { background: #FFF9E6 !important; border: 1px solid #E7D9A5 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          #informe-imprimible .pdf-seccion.rounded-xl * { color: #171717 !important; }
          #informe-imprimible h2, #informe-imprimible h3 { break-after: avoid; page-break-after: avoid; }
          #informe-imprimible table { width: 100% !important; border-collapse: collapse !important; font-size: 8.5pt !important; }
          #informe-imprimible thead { display: table-header-group; }
          #informe-imprimible tr { break-inside: avoid; page-break-inside: avoid; }
          #informe-imprimible th, #informe-imprimible td { padding: 4pt 5pt !important; vertical-align: top !important; }
          #informe-imprimible .pdf-pie { margin-top: 18pt !important; }
          a { color: #171717 !important; text-decoration: none !important; }
        }
      `}</style>
    </div>
  )
}
