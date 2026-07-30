import { jsPDF } from 'jspdf'
import { supabase } from '../supabaseClient'
import { obtenerJugadoresDeCategoria } from './jugadoresCategoria'

const NEGRO = [23, 23, 23]
const AMARILLO = [251, 191, 36]
const BLANCO = [255, 255, 255]
const GRIS = [90, 100, 115]
const TEXTO_OSCURO = [30, 30, 30]
const AMARILLO_CLARO = [255, 251, 235]
const ROJO_CLARO = [255, 235, 235]
const ROJO = [200, 60, 60]

const ESCUDO_CLUB_URL = 'https://qvjviyjkxyngiggoeqlj.supabase.co/storage/v1/object/public/Biblioteca/escudos/Escudo%20simplificado.png'

const ESTADO_LABEL = {
  presente: 'Presente',
  tarde: 'Tarde',
  ausente: 'Ausente',
  lesionado: 'Lesionado',
  enfermo: 'Enfermo',
}
const ESTADO_COLOR = {
  presente: [74, 222, 128],
  tarde: [251, 191, 36],
  ausente: [248, 113, 113],
  lesionado: [251, 146, 60],
  enfermo: [125, 211, 252],
}

async function cargarImagenDataURL(url) {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function formatoDeDataUrl(dataUrl) {
  const match = /^data:image\/(\w+);/.exec(dataUrl || '')
  return match ? match[1].toUpperCase() : 'PNG'
}

function formatearFechaCorta(fechaStr) {
  const partes = (fechaStr || '').split('-')
  if (partes.length !== 3) return fechaStr || ''
  return `${partes[2]}/${partes[1]}`
}

export async function generarAsistenciaPDF(categoriaId, categoriaNombre, desdeISO, hastaISO) {
  const escudoDataUrl = await cargarImagenDataURL(ESCUDO_CLUB_URL)

  const { data: categoriasData } = await supabase.from('categorias').select('id, es_reserva')
  const { data: jugadoresData } = await obtenerJugadoresDeCategoria(supabase, categoriaId, categoriasData)
  const jugadores = jugadoresData || []

  const ids = jugadores.map((j) => j.id)
  let asistencias = []
  if (ids.length > 0) {
    const { data } = await supabase
      .from('asistencias')
      .select('*')
      .in('jugador_id', ids)
      .gte('fecha', desdeISO)
      .lte('fecha', hastaISO)
      .order('fecha', { ascending: true })
    asistencias = data || []
  }

  const porJugador = {}
  jugadores.forEach((j) => {
    porJugador[j.id] = {
      registros: [],
      conteo: { presente: 0, tarde: 0, ausente: 0, lesionado: 0, enfermo: 0 },
    }
  })
  asistencias.forEach((a) => {
    if (!porJugador[a.jugador_id]) return
    porJugador[a.jugador_id].registros.push(a)
    if (porJugador[a.jugador_id].conteo[a.estado] !== undefined) {
      porJugador[a.jugador_id].conteo[a.estado]++
    }
  })

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40

  function dibujarEncabezado() {
    doc.setFillColor(...NEGRO)
    doc.rect(0, 0, pageWidth, 90, 'F')
    doc.setFillColor(...AMARILLO)
    doc.rect(0, 90, pageWidth, 4, 'F')
    if (escudoDataUrl) {
      try {
        const formato = formatoDeDataUrl(escudoDataUrl)
        doc.addImage(escudoDataUrl, formato, pageWidth - margin - 44, 22, 44, 44)
      } catch {
        // ignorar
      }
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(...BLANCO)
    doc.text('Reporte de asistencia', margin, 40)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(...AMARILLO)
    doc.text(
      `${categoriaNombre || ''} — ${formatearFechaCorta(desdeISO)} al ${formatearFechaCorta(hastaISO)}`,
      margin,
      58
    )
    const hoy = new Date()
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(200, 200, 200)
    doc.text(
      `Club Comunicaciones — generado el ${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`,
      margin,
      76
    )
  }

  dibujarEncabezado()

  let y = 118

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...NEGRO)
  doc.text('RESUMEN', margin, y)
  y += 16

  const colX = [margin, margin + 190, margin + 250, margin + 310, margin + 375, margin + 440]
  doc.setFillColor(...NEGRO)
  doc.rect(margin, y, pageWidth - margin * 2, 20, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...AMARILLO)
  doc.text('Jugadora', colX[0] + 8, y + 14)
  doc.text('Presente', colX[1], y + 14)
  doc.text('Tarde', colX[2], y + 14)
  doc.text('Ausente', colX[3], y + 14)
  doc.text('Lesion.', colX[4], y + 14)
  doc.text('Enfermo', colX[5], y + 14)
  y += 20

  doc.setFont('helvetica', 'normal')
  jugadores.forEach((j, i) => {
    if (y > pageHeight - 60) {
      doc.addPage()
      dibujarEncabezado()
      y = 118
    }
    const c = porJugador[j.id].conteo
    const alerta = c.ausente >= 2
    doc.setFillColor(...(alerta ? ROJO_CLARO : i % 2 === 0 ? AMARILLO_CLARO : [255, 255, 255]))
    doc.rect(margin, y, pageWidth - margin * 2, 18, 'F')

    doc.setFontSize(8.5)
    doc.setTextColor(...(alerta ? ROJO : NEGRO))
    doc.text(`${j.apellido}, ${j.nombre}`, colX[0] + 8, y + 13)

    doc.setTextColor(...TEXTO_OSCURO)
    doc.text(String(c.presente), colX[1], y + 13)
    doc.text(String(c.tarde), colX[2], y + 13)
    doc.setTextColor(...(alerta ? ROJO : TEXTO_OSCURO))
    doc.text(String(c.ausente), colX[3], y + 13)
    doc.setTextColor(...TEXTO_OSCURO)
    doc.text(String(c.lesionado), colX[4], y + 13)
    doc.text(String(c.enfermo), colX[5], y + 13)

    y += 18
  })

  y += 28

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...NEGRO)
  if (y > pageHeight - 80) {
    doc.addPage()
    dibujarEncabezado()
    y = 118
  }
  doc.text('DETALLE DÍA POR DÍA', margin, y)
  y += 20

  jugadores.forEach((j) => {
    const info = porJugador[j.id]
    if (info.registros.length === 0) return

    if (y > pageHeight - 90) {
      doc.addPage()
      dibujarEncabezado()
      y = 118
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...NEGRO)
    doc.text(`${j.apellido}, ${j.nombre}`, margin, y)
    doc.setDrawColor(...AMARILLO)
    doc.setLineWidth(1.5)
    doc.line(margin, y + 5, margin + 28, y + 5)
    y += 18

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    let x = margin
    info.registros.forEach((r) => {
      const texto = `${formatearFechaCorta(r.fecha)}: ${ESTADO_LABEL[r.estado] || r.estado}`
      const ancho = doc.getTextWidth(texto) + 16
      if (x + ancho > pageWidth - margin) {
        x = margin
        y += 18
        if (y > pageHeight - 60) {
          doc.addPage()
          dibujarEncabezado()
          y = 118
        }
      }
      const color = ESTADO_COLOR[r.estado] || GRIS
      doc.setFillColor(...color)
      doc.roundedRect(x, y - 10, ancho - 4, 14, 4, 4, 'F')
      doc.setTextColor(...NEGRO)
      doc.text(texto, x + 8, y)
      x += ancho
    })
    y += 28
  })

  doc.save(
    `Asistencia_${(categoriaNombre || 'categoria').replace(/\s+/g, '_')}_${desdeISO}_a_${hastaISO}.pdf`
  )
}
