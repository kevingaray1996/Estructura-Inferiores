import { idYoutube, miniaturaYoutube } from '../utils/biblioteca'
import { validarPizarra } from '../utils/pizarra'
import PizarraCancha from './PizarraCancha'

// Miniatura de un ejercicio de la biblioteca (o de una sesión): la pizarra en su primer paso, la imagen o la
// demostración de gimnasio. La usan la Biblioteca y el selector de los entrenamientos.
export default function BibliotecaVista({ e }) {
  const gimnasio = e.ambito === 'gimnasio' || e.tecnica != null
  const demo = e.demostracion || (e.demo_url ? { tipo: e.demo_tipo, url: e.demo_url } : null)
  if (gimnasio && demo) {
    const yt = demo.tipo === 'youtube' && idYoutube(demo.url)
    const src = demo.tipo === 'imagen' ? demo.url : yt ? miniaturaYoutube(yt) : null
    if (src) return <img src={src} alt="" loading="lazy" />
  }
  let doc = null
  try { if (e.pizarra) doc = validarPizarra(e.pizarra) } catch { doc = null }
  if (doc) return <PizarraCancha miniatura doc={doc} poses={doc.pasos[0].poses} />
  if (e.imagen_url) return <img src={e.imagen_url} alt="" loading="lazy" />
  return <span className="bib-vista-vacia" aria-hidden="true">{gimnasio ? '🏋️' : '🏟️'}</span>
}
