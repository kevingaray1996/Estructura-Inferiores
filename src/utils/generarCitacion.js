import { jsPDF } from 'jspdf'
import { supabase } from '../supabaseClient'

const AZUL = [23, 23, 23]
const AZUL_CLARO = [251, 191, 36]
const NAVY = [26, 35, 50]
const VERDE_CANCHA = [19, 66, 48]
const GRIS = [107, 114, 128]
const GRIS_CLARO = [243, 244, 246]
const GRIS_PLACEHOLDER = [156, 163, 175]
const BLANCO = [255, 255, 255]
const NEGRO = [23, 28, 38]

const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']

const ESCUDO_CLUB_URL = 'https://qvjviyjkxyngiggoeqlj.supabase.co/storage/v1/object/public/Biblioteca/escudos/Escudo%20simplificado.png'

function formatearFecha(fechaStr) {
  if (!fechaStr) return { diaSemana: '', fechaCorta: '' }
  const [anio, mes, dia] = fechaStr.split('-')
  const d = new Date(Number(anio), Number(mes) - 1, Number(dia))
  const diaSemana = DIAS[d.getDay()] || ''
  return { diaSemana, fechaCorta: `${dia}/${mes}` }
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

async function cargarImagenCuadradaDataURL(url) {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          const size = Math.min(img.width, img.height)
          const sx = (img.width - size) / 2
          const sy = (img.height - size) / 2
          const canvas = document.createElement('canvas')
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size)
          resolve(canvas.toDataURL('image/png'))
        }
        img.onerror = reject
        img.src = objectUrl
      })
      return dataUrl
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    return null
  }
}

function formatoDeDataUrl(dataUrl) {
  const match = /^data:image\/(\w+);/.exec(dataUrl || '')
  return match ? match[1].toUpperCase() : 'PNG'
}

function dibujarEscudo(doc, cx, cy, size, colorFondo, letra, colorTexto) {
  doc.setFillColor(...colorFondo)
  doc.roundedRect(cx - size / 2, cy - size / 2, size, size, 8, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(size * 0.32)
  doc.setTextColor(...colorTexto)
  doc.text(letra, cx, cy + size * 0.11, { align: 'center' })
}

function dibujarAvatarCircular(doc, dataUrl, cx, cy, radio, iniciales) {
  if (dataUrl) {
    try {
      const formato = formatoDeDataUrl(dataUrl)
      doc.saveGraphicsState()
      doc.circle(cx, cy, radio, null)
      doc.clip()
      doc.discardPath()
      doc.addImage(dataUrl, formato, cx - radio, cy - radio, radio * 2, radio * 2)
      doc.restoreGraphicsState()
      return true
    } catch {
      // sigue al placeholder
    }
  }
  doc.setFillColor(...AZUL)
  doc.circle(cx, cy, radio, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(radio * 0.9)
  doc.setTextColor(...BLANCO)
  doc.text(iniciales || '–', cx, cy + radio * 0.32, { align: 'center' })
  return false
}

function parsePosicion(c) {
  if (!c.titular || !c.posicion_cancha || !c.posicion_cancha.includes(',')) return null
  const [xStr, yStr] = c.posicion_cancha.split(',')
  const x = parseFloat(xStr)
  const y = parseFloat(yStr)
  if (Number.isNaN(x) || Number.isNaN(y)) return null
  return { x, y }
}

export async function generarCitacionPDF(partidoId) {
  const { data: partido } = await supabase
    .from('partidos')
    .select('*, categorias(nombre)')
    .eq('id', partidoId)
    .single()

  const { data: citaciones } = await supabase
    .from('citaciones')
    .select('*, jugadores(nombre, apellido, foto_url)')
    .eq('partido_id', partidoId)

  if (!partido || !citaciones || citaciones.length === 0) {
    alert('Todavía no hay convocatoria cargada para este partido.')
    return
  }

  const escudoRivalDataUrl = partido.escudo_url ? await cargarImagenDataURL(partido.escudo_url) : null
  const escudoClubDataUrl = await cargarImagenDataURL(ESCUDO_CLUB_URL)

  const fotosPorJugador = {}
  await Promise.all(
    citaciones.map(async (c) => {
      if (c.jugadores?.foto_url) {
        fotosPorJugador[c.jugador_id] = await cargarImagenCuadradaDataURL(c.jugadores.foto_url)
      }
    })
  )

  const { data: staffData } = await supabase
    .from('perfiles')
    .select('*')
    .eq('aparece_en_pdf', true)
    .order('orden_pdf', { ascending: true, nullsFirst: false })

  const staff = staffData || []
  const fotosPorStaff = {}
  await Promise.all(
    staff.map(async (s) => {
      if (s.foto_url) {
        fotosPorStaff[s.email] = await cargarImagenCuadradaDataURL(s.foto_url)
      }
    })
  )

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40

  const categoriaNombre = partido.categorias?.nombre || ''
  const nombreLocalVisitante = partido.local_visitante === 'visitante' ? 'de visitante' : 'de local'

  // ===== Encabezado =====
  const headerH = 108
  doc.setFillColor(...AZUL)
  doc.rect(0, 0, pageWidth, headerH, 'F')
  doc.setFillColor(...AZUL_CLARO)
  doc.rect(0, headerH - 5, pageWidth, 5, 'F')

  const iconoSize = 46
  const iconoCX = margin + iconoSize / 2
  const iconoCY = 40
  if (escudoClubDataUrl) {
    try {
      const formato = formatoDeDataUrl(escudoClubDataUrl)
      doc.addImage(escudoClubDataUrl, formato, iconoCX - iconoSize / 2, iconoCY - iconoSize / 2, iconoSize, iconoSize)
    } catch {
      doc.setFillColor(...AZUL_CLARO)
      doc.roundedRect(iconoCX - iconoSize / 2, iconoCY - iconoSize / 2, iconoSize, iconoSize, 10, 10, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(...BLANCO)
      doc.text('CC', iconoCX, iconoCY + 4, { align: 'center' })
    }
  } else {
    doc.setFillColor(...AZUL_CLARO)
    doc.roundedRect(iconoCX - iconoSize / 2, iconoCY - iconoSize / 2, iconoSize, iconoSize, 10, 10, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...BLANCO)
    doc.text('CC', iconoCX, iconoCY + 4, { align: 'center' })
  }

  const tituloX = margin + iconoSize + 14
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(21)
  doc.setTextColor(...BLANCO)
  doc.text('CITACIÓN', tituloX, iconoCY - 2)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(...AZUL_CLARO)
  const subtituloHeader = [
    `Partido ${nombreLocalVisitante}`,
    categoriaNombre ? `Categoría ${categoriaNombre}` : null,
    partido.numero_fecha ? `Fecha ${partido.numero_fecha}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  doc.text(subtituloHeader, tituloX, iconoCY + 16)

  if (categoriaNombre || partido.formacion) {
    const etiqueta = [categoriaNombre.toUpperCase(), partido.formacion].filter(Boolean).join(' · ')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    const wTxt = doc.getTextWidth(etiqueta)
    const wPill = wTxt + 26
    const pillH = 26
    doc.setFillColor(...AZUL_CLARO)
    doc.roundedRect(pageWidth - margin - wPill, iconoCY - pillH / 2, wPill, pillH, 13, 13, 'F')
    doc.setTextColor(...AZUL)
    doc.text(etiqueta, pageWidth - margin - wPill / 2, iconoCY + 4, { align: 'center' })
  }

  // ===== Fila de equipos =====
  const filaEquiposY = headerH + 48
  const shieldSize = 40

  const propioShieldCX = margin + shieldSize / 2
  if (escudoClubDataUrl) {
    try {
      const formato = formatoDeDataUrl(escudoClubDataUrl)
      doc.addImage(escudoClubDataUrl, formato, propioShieldCX - shieldSize / 2, filaEquiposY - shieldSize / 2, shieldSize, shieldSize)
    } catch {
      dibujarEscudo(doc, propioShieldCX, filaEquiposY, shieldSize, NAVY, 'CC', BLANCO)
    }
  } else {
    dibujarEscudo(doc, propioShieldCX, filaEquiposY, shieldSize, NAVY, 'CC', BLANCO)
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...NEGRO)
  doc.text('Club Comunicaciones', propioShieldCX + shieldSize / 2 + 12, filaEquiposY + 4, { maxWidth: 210 })

  const rivalShieldCX = pageWidth - margin - shieldSize / 2
  if (escudoRivalDataUrl) {
    try {
      const formato = formatoDeDataUrl(escudoRivalDataUrl)
      doc.addImage(escudoRivalDataUrl, formato, rivalShieldCX - shieldSize / 2, filaEquiposY - shieldSize / 2, shieldSize, shieldSize)
    } catch {
      dibujarEscudo(doc, rivalShieldCX, filaEquiposY, shieldSize, GRIS_PLACEHOLDER, (partido.rival?.[0] || '?').toUpperCase(), BLANCO)
    }
  } else {
    dibujarEscudo(doc, rivalShieldCX, filaEquiposY, shieldSize, GRIS_PLACEHOLDER, (partido.rival?.[0] || '?').toUpperCase(), BLANCO)
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...NEGRO)
  doc.text(partido.rival || 'Rival', rivalShieldCX - shieldSize / 2 - 12, filaEquiposY + 4, { align: 'right', maxWidth: 210 })

  const vsCX = pageWidth / 2
  doc.setFillColor(...AZUL_CLARO)
  doc.circle(vsCX, filaEquiposY, 18, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...AZUL)
  doc.text('VS', vsCX, filaEquiposY + 4, { align: 'center' })

  // ===== Franja FECHA / HORA / LUGAR =====
  const { diaSemana, fechaCorta } = formatearFecha(partido.fecha)
  const franjaY = filaEquiposY + 42
  const franjaH = 46
  const gapFranja = 12
  const franjaW = (pageWidth - margin * 2 - gapFranja * 2) / 3
  const datosFranja = [
    { label: 'FECHA', valor: fechaCorta ? `${diaSemana.slice(0, 1)}${diaSemana.slice(1).toLowerCase()} ${fechaCorta}` : '—' },
    { label: 'HORA', valor: partido.hora ? `${partido.hora} hs` : '—' },
    { label: 'LUGAR', valor: partido.lugar || '—' },
  ]
  datosFranja.forEach((d, i) => {
    const bx = margin + i * (franjaW + gapFranja)
    doc.setFillColor(...GRIS_CLARO)
    doc.roundedRect(bx, franjaY, franjaW, franjaH, 8, 8, 'F')
    doc.setFillColor(...AZUL_CLARO)
    doc.rect(bx, franjaY, 4, franjaH, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...AZUL)
    doc.text(d.label, bx + 14, franjaY + 17)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...NEGRO)
    doc.text(String(d.valor), bx + 14, franjaY + 34, { maxWidth: franjaW - 24 })
  })

  // ===== Tres columnas: Titulares (izq) · Cancha (centro) · Suplentes (der) =====
  const ordenados = [...citaciones].sort((a, b) => (a.dorsal || 99) - (b.dorsal || 99))
  const suplentes = ordenados.filter((c) => !c.titular)

  const titularesConPos = citaciones
    .map((c) => ({ c, pos: parsePosicion(c) }))
    .filter((t) => t.pos)
    .sort((a, b) => b.pos.y - a.pos.y)

  const contenidoY = franjaY + franjaH + 26
  const contenidoAncho = pageWidth - margin * 2
  const gapColumnas = 16
  const canchaW = 220
  const columnaW = (contenidoAncho - canchaW - gapColumnas * 2) / 2

  const titularesX = margin
  const canchaX = margin + columnaW + gapColumnas
  const suplentesX = canchaX + canchaW + gapColumnas

  const canchaH = canchaW * 1.5
  const filaAltura = 26
  const filaGap = 4

  // --- Títulos de columna ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...AZUL)
  doc.text('TITULARES', titularesX, contenidoY)
  doc.text('SUPLENTES', suplentesX, contenidoY)

  // --- Cancha (centro) ---
  doc.setFillColor(...VERDE_CANCHA)
  doc.roundedRect(canchaX, contenidoY + 6, canchaW, canchaH, 10, 10, 'F')
  doc.setDrawColor(...BLANCO)
  doc.setLineWidth(0.7)
  doc.roundedRect(canchaX + 8, contenidoY + 14, canchaW - 16, canchaH - 16, 4, 4)
  doc.line(canchaX + 8, contenidoY + 6 + canchaH / 2, canchaX + canchaW - 8, contenidoY + 6 + canchaH / 2)
  doc.circle(canchaX + canchaW / 2, contenidoY + 6 + canchaH / 2, canchaW * 0.14)
  doc.setFillColor(...BLANCO)
  doc.circle(canchaX + canchaW / 2, contenidoY + 6 + canchaH / 2, 1.4, 'F')

  if (titularesConPos.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...BLANCO)
    doc.text('Formación no definida', canchaX + canchaW / 2, contenidoY + 6 + canchaH / 2, {
      align: 'center',
      maxWidth: canchaW - 30,
    })
  }

  titularesConPos.forEach(({ c, pos }) => {
    const px = canchaX + (pos.x / 100) * canchaW
    const py = contenidoY + 6 + (pos.y / 100) * canchaH
    const radio = 13

    const iniciales = `${(c.jugadores?.nombre?.[0] || '')}${(c.jugadores?.apellido?.[0] || '')}`.toUpperCase()
    doc.setFillColor(...AZUL_CLARO)
    doc.circle(px, py, radio + 1.5, 'F')
    dibujarAvatarCircular(doc, fotosPorJugador[c.jugador_id], px, py, radio, iniciales)

    doc.setFillColor(...AZUL)
    doc.circle(px + radio * 0.72, py - radio * 0.72, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...BLANCO)
    doc.text(c.dorsal ? String(c.dorsal) : '–', px + radio * 0.72, py - radio * 0.72 + 2.5, { align: 'center' })

    const inicialNombre = c.jugadores?.nombre ? `${c.jugadores.nombre[0]}.` : ''
    const etiqueta = `${c.jugadores?.apellido || ''} ${inicialNombre}`.trim() || '–'
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.3)
    const anchoTexto = Math.min(doc.getTextWidth(etiqueta) + 8, 60)
    doc.setFillColor(...BLANCO)
    doc.roundedRect(px - anchoTexto / 2, py + radio + 3, anchoTexto, 11, 3, 3, 'F')
    doc.setTextColor(...NEGRO)
    doc.text(etiqueta.slice(0, 16), px, py + radio + 11, { align: 'center', maxWidth: anchoTexto - 2 })
  })

  // --- Lista de titulares (izquierda), compacta, sin puesto ---
  let yTitular = contenidoY + 22
  if (titularesConPos.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    doc.setTextColor(...GRIS)
    doc.text('Sin formación armada', titularesX, yTitular, { maxWidth: columnaW })
  }
  titularesConPos.forEach(({ c }) => {
    doc.setFillColor(...GRIS_CLARO)
    doc.roundedRect(titularesX, yTitular - filaAltura + 7, columnaW, filaAltura, 6, 6, 'F')

    const badgeCX = titularesX + 15
    const badgeCY = yTitular - filaAltura / 2 + 7
    const iniciales = `${(c.jugadores?.nombre?.[0] || '')}${(c.jugadores?.apellido?.[0] || '')}`.toUpperCase()
    dibujarAvatarCircular(doc, fotosPorJugador[c.jugador_id], badgeCX, badgeCY, 9, iniciales)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...NEGRO)
    const nombreJugador = `${c.dorsal ? `#${c.dorsal} ` : ''}${c.jugadores?.apellido || ''}, ${c.jugadores?.nombre || ''}`
    doc.text(nombreJugador, badgeCX + 13, badgeCY + 3, { maxWidth: columnaW - 30 })

    yTitular += filaAltura + filaGap
  })

  // --- Lista de suplentes (derecha), mismo formato ---
  let ySuplente = contenidoY + 22
  if (suplentes.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    doc.setTextColor(...GRIS)
    doc.text('Sin suplentes cargados', suplentesX, ySuplente, { maxWidth: columnaW })
  }
  suplentes.forEach((c) => {
    doc.setFillColor(...GRIS_CLARO)
    doc.roundedRect(suplentesX, ySuplente - filaAltura + 7, columnaW, filaAltura, 6, 6, 'F')

    const badgeCX = suplentesX + 15
    const badgeCY = ySuplente - filaAltura / 2 + 7
    const iniciales = `${(c.jugadores?.nombre?.[0] || '')}${(c.jugadores?.apellido?.[0] || '')}`.toUpperCase()
    dibujarAvatarCircular(doc, fotosPorJugador[c.jugador_id], badgeCX, badgeCY, 9, iniciales)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...NEGRO)
    const nombreCompleto = `${c.dorsal ? `#${c.dorsal} ` : ''}${c.jugadores?.apellido || ''}, ${c.jugadores?.nombre || ''}`
    doc.text(nombreCompleto, badgeCX + 13, badgeCY + 3, { maxWidth: columnaW - 30 })

    ySuplente += filaAltura + filaGap
  })

  // ===== Cuerpo técnico (pie) =====
  if (staff.length > 0) {
    const pageHeight = doc.internal.pageSize.getHeight()
    const staffRadio = 20
    const staffColW = 82
    const staffRowH = 78
    const porFila = Math.max(1, Math.floor(contenidoAncho / staffColW))
    const filas = Math.ceil(staff.length / porFila)
    const altoNecesario = 30 + filas * staffRowH

    let staffY = Math.max(contenidoY + canchaH + 30, yTitular, ySuplente) + 20

    if (staffY + altoNecesario > pageHeight - margin) {
      doc.addPage()
      staffY = margin + 20
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...AZUL)
    doc.text('CUERPO TÉCNICO', margin, staffY)

    let cursorX = margin
    let cursorY = staffY + 34
    let enFila = 0

    staff.forEach((s) => {
      if (enFila >= porFila) {
        enFila = 0
        cursorX = margin
        cursorY += staffRowH
      }
      const cx = cursorX + staffRadio
      const cy = cursorY
      const inicialesStaff = (s.nombre || s.email || '?')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase()
      dibujarAvatarCircular(doc, fotosPorStaff[s.email], cx, cy, staffRadio, inicialesStaff)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...NEGRO)
      doc.text(s.nombre || s.email, cx, cy + staffRadio + 12, { align: 'center', maxWidth: staffColW - 6 })

      if (s.cargo_pdf) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(...GRIS)
        doc.text(s.cargo_pdf, cx, cy + staffRadio + 22, { align: 'center', maxWidth: staffColW - 6 })
      }

      cursorX += staffColW
      enFila++
    })
  }

  doc.save(`Citacion_vs_${partido.rival.replace(/\s+/g, '_')}.pdf`)
}
