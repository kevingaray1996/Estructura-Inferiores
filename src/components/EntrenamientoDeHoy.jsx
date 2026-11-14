import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { AMBITOS_BLOQUE, ambitoBloque, bloqueConContenido, cargarEntrenamientoHoy, enlaceSeguro, fechaArgentina, lineasTecnica, recetaGimnasio, resumenBloques } from '../utils/planificacion'
import { demoValida, embedYoutube, idYoutube, miniaturaYoutube } from '../utils/biblioteca'
import BibliotecaVista from './BibliotecaVista'
import PizarraEjercicio from './PizarraEjercicio'
import './entrenamientoHoy.css'

const ICONO = { gimnasio: '🏋️', cancha: '⚽' }
const datos = (partes) => partes.filter(Boolean).join(' · ')

// Demostración de gimnasio: el video se carga recién al abrirla (no gasta datos ni llama a YouTube antes).
function Demostracion({ demo, nombre }) {
  const [abierta, setAbierta] = useState(false)
  if (!demo || !demoValida(demo.tipo, demo.url)) return null
  const yt = demo.tipo === 'youtube' ? idYoutube(demo.url) : null
  const credito = demo.credito ? <p className="eh-credito">Crédito: {demo.credito}</p> : null
  if (!yt) return <figure className="eh-demo-imagen"><img src={demo.url} alt={`Demostración: ${nombre}`} loading="lazy" />{credito}</figure>
  return <details className="eh-demo" onToggle={(ev) => setAbierta(ev.currentTarget.open)}>
    <summary><img src={miniaturaYoutube(yt)} alt="" loading="lazy" /><span>▶ Ver demostración</span></summary>
    {abierta && <div className="eh-video"><iframe src={embedYoutube(yt)} title={`Demostración: ${nombre}`} loading="lazy"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" /></div>}
    {credito}
  </details>
}

function EjercicioGimnasio({ e, j }) {
  const nombre = e.nombre || `Ejercicio ${j + 1}`, receta = recetaGimnasio(e), tecnica = lineasTecnica(e.tecnica)
  return <li className="eh-ejercicio">
    <div className="eh-ejercicio-cabeza"><strong>{nombre}</strong>{receta && <span className="eh-receta">{receta}</span>}</div>
    {(e.duracion || e.objetivo) && <p className="eh-meta">{datos([e.duracion ? `${e.duracion} min` : '', e.objetivo])}</p>}
    {e.materiales && <p className="eh-meta">Materiales: {e.materiales}</p>}
    {e.indicaciones && <p className="eh-texto">{e.indicaciones}</p>}
    {tecnica.length > 0 && <div className="eh-tecnica"><span>Técnica</span><ul>{tecnica.map((l, k) => <li key={k}>{l}</li>)}</ul></div>}
    <Demostracion demo={e.demostracion} nombre={nombre} />
    {enlaceSeguro(e.link_video) && <a className="eh-enlace" href={enlaceSeguro(e.link_video)} target="_blank" rel="noreferrer">Ver ejercicio</a>}
  </li>
}

function EjercicioCancha({ e, j, plantel }) {
  const nombre = e.nombre || `Tarea ${j + 1}`
  const volumen = datos([e.series ? `Series: ${e.series}` : '', e.repeticiones ? `Repeticiones: ${e.repeticiones}` : ''])
  return <li className="eh-ejercicio">
    <div className="eh-ejercicio-cabeza"><strong>{nombre}</strong>{e.duracion && <span className="eh-receta">{e.duracion} min</span>}</div>
    {(e.objetivo || volumen) && <p className="eh-meta">{datos([e.objetivo, volumen])}</p>}
    {e.materiales && <p className="eh-meta">Materiales: {e.materiales}</p>}
    {e.indicaciones && <p className="eh-texto">{e.indicaciones}</p>}
    {e.pizarra && <div className="eh-pizarra" aria-hidden="true"><BibliotecaVista e={{ pizarra: e.pizarra }} /></div>}
    {e.pizarra && <PizarraEjercicio valor={e.pizarra} nombre={e.nombre} objetivo={e.objetivo} indicaciones={e.indicaciones} plantel={plantel} soloLectura />}
    {enlaceSeguro(e.imagen_url) && <img className="eh-imagen" src={enlaceSeguro(e.imagen_url)} alt={nombre} loading="lazy" />}
    {enlaceSeguro(e.link_video) && <a className="eh-enlace" href={enlaceSeguro(e.link_video)} target="_blank" rel="noreferrer">Ver ejercicio</a>}
  </li>
}

// `plantel`: jugadoras de la categoría con foto (Wellness público); la pizarra las muestra en sus fichas.
export function ContenidoEntrenamientoHoy({ sesiones, plantel = null }) {
  if (!sesiones?.some((s) => Array.isArray(s.bloques) && s.bloques.some(bloqueConContenido))) return null
  return <section aria-label="Tu entrenamiento de hoy" className="eh">
    <h2 className="eh-titulo">Tu entrenamiento de hoy</h2>
    {sesiones.map((s) => {
      const bloques = (Array.isArray(s.bloques) ? s.bloques : []).filter(bloqueConContenido)
      if (!bloques.length) return null
      const resumen = resumenBloques(bloques)
      return <div key={s.id} className="eh-sesion">
        <p className="eh-cuando">
          {new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${s.fecha}T12:00:00Z`))}
          {s.hora ? ` · ${s.hora.slice(0, 5)}` : ''}{s.lugar ? ` · ${s.lugar}` : ''}
        </p>
        {s.objetivo && <p className="eh-texto">{s.objetivo}</p>}
        {resumen.length > 1 && <ul className="eh-resumen" aria-label="Bloques de hoy">
          {resumen.map((r, i) => <li key={i} className={r.ambito ? `eh-chip eh-${r.ambito}` : 'eh-chip'}>{ICONO[r.ambito] ? `${ICONO[r.ambito]} ` : ''}{r.texto}</li>)}
        </ul>}
        {bloques.map((b, i) => {
          const ambito = ambitoBloque(b), etiqueta = AMBITOS_BLOQUE[ambito]
          const titulo = b.nombre && b.nombre !== etiqueta ? b.nombre : etiqueta || b.nombre
          return <article key={i} className={`eh-bloque${ambito ? ` eh-${ambito}` : ''}`}>
            <header>
              <span className="eh-etiqueta">{ICONO[ambito] ? `${ICONO[ambito]} ` : ''}Bloque {i + 1}{etiqueta && titulo !== etiqueta ? ` · ${etiqueta}` : ''}</span>
              {titulo && <h3>{titulo}</h3>}
              {(b.objetivo || b.duracion) && <p className="eh-meta">{datos([b.objetivo, b.duracion ? `${b.duracion} min estimados` : ''])}</p>}
            </header>
            {b.indicaciones && <p className="eh-texto">{b.indicaciones}</p>}
            {b.ejercicios?.length > 0 && <ol className="eh-ejercicios">
              {b.ejercicios.map((e, j) => ambito === 'gimnasio' ? <EjercicioGimnasio key={j} e={e} j={j} /> : <EjercicioCancha key={j} e={e} j={j} plantel={plantel} />)}
            </ol>}
          </article>
        })}
      </div>
    })}
  </section>
}

export default function EntrenamientoDeHoy({ categoriaId, jugadoraId, plantel = null }) {
  const [lectura, setLectura] = useState(null)
  useEffect(() => {
    if (!categoriaId || !jugadoraId) return
    let activo = true
    let peticion = 0
    async function actualizar() {
      const numero = ++peticion
      try {
        const sesiones = await cargarEntrenamientoHoy(supabase, categoriaId, jugadoraId)
        if (activo && numero === peticion) setLectura({ categoriaId, jugadoraId, fecha: fechaArgentina(), sesiones })
      } catch {
        // Un fallo del módulo opcional nunca bloquea ni altera el formulario Wellness.
        if (activo && numero === peticion) setLectura(null)
      }
    }
    void actualizar()
    const intervalo = window.setInterval(() => { if (document.visibilityState === 'visible') void actualizar() }, 30000)
    window.addEventListener('focus', actualizar)
    const visible = () => { if (document.visibilityState === 'visible') void actualizar() }
    document.addEventListener('visibilitychange', visible)
    return () => {
      activo = false
      window.clearInterval(intervalo)
      window.removeEventListener('focus', actualizar)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [categoriaId, jugadoraId])
  if (!lectura || lectura.categoriaId !== categoriaId || lectura.jugadoraId !== jugadoraId || lectura.fecha !== fechaArgentina()) return null
  return <ContenidoEntrenamientoHoy sesiones={lectura.sesiones} plantel={plantel} />
}
