import { jsPDF } from 'jspdf'

const NEGRO = [23, 23, 23]
const AMARILLO = [251, 191, 36]
const BLANCO = [255, 255, 255]
const GRIS = [90, 100, 115]
const TEXTO_OSCURO = [30, 30, 30]
const AMARILLO_CLARO = [255, 251, 235]

const ESCUDO_CLUB_URL = 'https://qvjviyjkxyngiggoeqlj.supabase.co/storage/v1/object/public/Biblioteca/escudos/Escudo%20simplificado.png'

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

const SEMAFORO_COLOR = {
  verde: [74, 222, 128],
  amarillo: [251, 191, 36],
  rojo: [248, 113, 113],
}
const SEMAFORO_LABEL = { verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo' }

function dibujarEncabezado(doc, pageWidth, titulo, subtitulo, escudoDataUrl) {
  doc.setFillColor(...NEGRO)
  doc.rect(0, 0, pageWidth, 90, 'F')
  doc.setFillColor(...AMARILLO)
  doc.rect(0, 90, pageWidth, 4, 'F')

  if (escudoDataUrl) {
    try {
      const formato = formatoDeDataUrl(escudoDataUrl)
      doc.addImage(escudoDataUrl, formato, pageWidth - 40 - 44, 22, 44, 44)
    } catch {
      // ignorar
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...BLANCO)
  doc.text(titulo, 40, 40)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...AMARILLO)
  doc.text(subtitulo, 40, 58)

  const hoy = new Date()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(200, 200, 200)
  doc.text(
    `Club Comunicaciones — generado el ${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`,
    40,
    76
  )
}

export async function generarSemaforoIndividualPDF(jugador, resultado) {
  const escudoDataUrl = await cargarImagenDataURL(ESCUDO_CLUB_URL)
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40

  dibujarEncabezado(doc, pageWidth, 'Semáforo de riesgo', `${jugador.apellido}, ${jugador.nombre}`, escudoDataUrl)

  let y = 130

  if (resultado) {
    const colorSemaforo = SEMAFORO_COLOR[resultado.semaforo]
    doc.setFillColor(...colorSemaforo)
    doc.roundedRect(margin, y, pageWidth - margin * 2, 34, 8, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(...NEGRO)
    doc.text(`${SEMAFORO_LABEL[resultado.semaforo]} — ${resultado.puntos} / 6 puntos`, pageWidth / 2, y + 22, {
      align: 'center',
    })
    y += 55

    const filas = [
      ['Wellness (z-score)', resultado.wellness.z !== null ? resultado.wellness.z.toFixed(2) : '—', resultado.wellness.nivel || '—'],
      ['sRPE / ACWR', resultado.carga.acwr !== null ? resultado.carga.acwr.toFixed(2) : '—', resultado.carga.nivel || '—'],
      ['CMJ (% de baja)', resultado.cmj.porcentaje !== null ? `${resultado.cmj.porcentaje.toFixed(1)}%` : '—', resultado.cmj.nivel || '—'],
    ]

    doc.setFillColor(...NEGRO)
    doc.rect(margin, y, pageWidth - margin * 2, 22, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...AMARILLO)
    doc.text('Fuente', margin + 10, y + 14)
    doc.text('Valor', margin + 220, y + 14)
    doc.text('Nivel', margin + 320, y + 14)
    y += 22

    filas.forEach(([fuente, valor, nivel], i) => {
      doc.setFillColor(...(i % 2 === 0 ? AMARILLO_CLARO : [255, 255, 255]))
      doc.rect(margin, y, pageWidth - margin * 2, 24, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      doc.setTextColor(...NEGRO)
      doc.text(fuente, margin + 10, y + 16)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...TEXTO_OSCURO)
      doc.text(valor, margin + 220, y + 16)
      doc.text(nivel, margin + 320, y + 16)
      y += 24
    })
  } else {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(...GRIS)
    doc.text('No hay datos suficientes para calcular el semáforo.', margin, y)
  }

  doc.save(`Semaforo_${jugador.apellido}_${jugador.nombre}`.replace(/\s+/g, '_') + '.pdf')
}

export async function generarSemaforoCategoriaPDF(categoriaNombre, filas) {
  const escudoDataUrl = await cargarImagenDataURL(ESCUDO_CLUB_URL)
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40

  dibujarEncabezado(doc, pageWidth, 'Semáforo de riesgo', categoriaNombre || '', escudoDataUrl)

  let y = 120

  const columnas = [
    { label: 'Jugadora', x: margin },
    { label: 'Wellness', x: margin + 240 },
    { label: 'sRPE/ACWR', x: margin + 380 },
    { label: 'CMJ', x: margin + 520 },
    { label: 'Semáforo', x: margin + 620 },
  ]

  function dibujarCabecera() {
    doc.setFillColor(...NEGRO)
    doc.rect(margin, y, pageWidth - margin * 2, 22, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...AMARILLO)
    columnas.forEach((c) => doc.text(c.label, c.x + 8, y + 14))
    y += 22
  }

  dibujarCabecera()

  doc.setFont('helvetica', 'normal')
  filas.forEach(({ jugador, resultado }, i) => {
    if (y > pageHeight - 60) {
      doc.addPage()
      y = 40
      dibujarCabecera()
    }
    doc.setFillColor(...(i % 2 === 0 ? AMARILLO_CLARO : [255, 255, 255]))
    doc.rect(margin, y, pageWidth - margin * 2, 22, 'F')

    doc.setFontSize(9.5)
    doc.setTextColor(...NEGRO)
    doc.text(`${jugador.apellido}, ${jugador.nombre}`, columnas[0].x + 8, y + 15)

    doc.setTextColor(...TEXTO_OSCURO)
    doc.text(resultado?.wellness?.nivel || '—', columnas[1].x + 8, y + 15)
    doc.text(resultado?.carga?.nivel || '—', columnas[2].x + 8, y + 15)
    doc.text(resultado?.cmj?.nivel || '—', columnas[3].x + 8, y + 15)

    if (resultado?.semaforo) {
      const color = SEMAFORO_COLOR[resultado.semaforo]
      doc.setFillColor(...color)
      doc.roundedRect(columnas[4].x + 8, y + 4, 70, 14, 6, 6, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...NEGRO)
      doc.text(`${SEMAFORO_LABEL[resultado.semaforo]} (${resultado.puntos})`, columnas[4].x + 43, y + 14, {
        align: 'center',
      })
      doc.setFont('helvetica', 'normal')
    } else {
      doc.setTextColor(...GRIS)
      doc.text('Sin datos', columnas[4].x + 8, y + 15)
    }

    y += 22
  })

  doc.save(`Semaforo_${(categoriaNombre || 'categoria').replace(/\s+/g, '_')}.pdf`)
}
