import { supabase } from '../supabaseClient'

const ESCUDO_CLUB_URL = 'https://qvjviyjkxyngiggoeqlj.supabase.co/storage/v1/object/public/Biblioteca/escudos/Escudo%20simplificado.png'
const WIDTH = 1080
const PADDING = 42
const COLUMNS = 3
const GAP = 22
const HEADER_HEIGHT = 260
const INFO_HEIGHT = 118
const CARD_HEIGHT = 160
const CARD_RADIUS = 26
const DARK_BG = '#0F1419'
const PANEL_BG = '#141B24'
const TEXT = '#F3F4F6'
const MUTED = '#8A9BB8'
const GOLD = '#FBBF24'
const WHITE = '#FFFFFF'
const BLACK = '#111827'

function formatearFecha(fechaStr) {
  if (!fechaStr) return ''
  const [anio, mes, dia] = fechaStr.split('-')
  const fecha = new Date(Number(anio), Number(mes) - 1, Number(dia))
  const dias = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']
  const diaSemana = dias[fecha.getDay()] || ''
  return `${diaSemana} ${dia}/${mes}`
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

function roundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function drawRoundedRect(ctx, x, y, w, h, r, fillStyle, strokeStyle = null) {
  roundedRectPath(ctx, x, y, w, h, r)
  ctx.fillStyle = fillStyle
  ctx.fill()
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle
    ctx.stroke()
  }
}

function drawShield(ctx, x, y, size, dataUrl, fallbackText, fill = '#1A2332', textColor = '#FFFFFF') {
  if (dataUrl) {
    const img = new Image()
    img.src = dataUrl
    ctx.save()
    roundedRectPath(ctx, x - size / 2, y - size / 2, size, size, 18)
    ctx.clip()
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size)
    ctx.restore()
    return
  }

  drawRoundedRect(ctx, x - size / 2, y - size / 2, size, size, 16, fill)
  ctx.fillStyle = textColor
  ctx.font = 'bold 28px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(fallbackText || 'CC', x, y + 1)
}

function drawAvatar(ctx, x, y, radius, dataUrl, initials) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()

  if (dataUrl) {
    const img = new Image()
    img.src = dataUrl
    ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2)
  } else {
    ctx.fillStyle = '#1A2332'
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 38px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials || '–', x, y + 2)
  }

  ctx.restore()

  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.lineWidth = 4
  ctx.strokeStyle = '#FBBF24'
  ctx.stroke()
}

function wrapText(ctx, text, maxWidth) {
  const words = (text || '').split(/\s+/).filter(Boolean)
  if (!words.length) return ['']

  const lines = []
  let currentLine = words[0]

  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${currentLine} ${words[i]}`
    if (ctx.measureText(candidate).width <= maxWidth) {
      currentLine = candidate
    } else {
      lines.push(currentLine)
      currentLine = words[i]
    }
  }
  lines.push(currentLine)
  return lines.slice(0, 2)
}

export async function generarImagenCitacion(partidoId) {
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
        fotosPorJugador[c.jugador_id] = await cargarImagenDataURL(c.jugadores.foto_url)
      }
    })
  )

  const convocadas = [...citaciones].sort((a, b) => {
    const aNombre = `${a.jugadores?.apellido || ''} ${a.jugadores?.nombre || ''}`.trim().toLowerCase()
    const bNombre = `${b.jugadores?.apellido || ''} ${b.jugadores?.nombre || ''}`.trim().toLowerCase()
    return aNombre.localeCompare(bNombre)
  })

  const rows = Math.ceil(convocadas.length / COLUMNS)
  const cardWidth = (WIDTH - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS
  const canvasHeight = HEADER_HEIGHT + INFO_HEIGHT + 60 + rows * cardHeight + 70

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = canvasHeight
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = DARK_BG
  ctx.fillRect(0, 0, WIDTH, canvasHeight)

  drawRoundedRect(ctx, 0, 0, WIDTH, HEADER_HEIGHT, 0, '#111111')
  drawRoundedRect(ctx, 0, HEADER_HEIGHT - 8, WIDTH, 8, 0, GOLD)

  drawShield(ctx, 90, 85, 86, escudoClubDataUrl, 'CC', '#0F1419', '#FFFFFF')
  drawShield(ctx, WIDTH - 90, 85, 86, escudoRivalDataUrl, (partido.rival?.[0] || '?').toUpperCase(), '#1A2332', '#FFFFFF')

  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 76px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('VS', WIDTH / 2, 105)

  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 36px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(partido.rival || 'Rival', WIDTH / 2, 165)

  ctx.fillStyle = '#FBBF24'
  ctx.font = 'bold 26px Arial'
  ctx.textAlign = 'left'
  ctx.fillText('CITACIÓN', 120, 52)

  const infoY = HEADER_HEIGHT + 34
  const infoBlockWidth = (WIDTH - PADDING * 2 - GAP * 2) / 3

  const infoItems = [
    { label: 'DÍA', value: formatearFecha(partido.fecha) || '—' },
    { label: 'HORA', value: partido.hora ? `${partido.hora} hs` : '—' },
    { label: 'LUGAR', value: partido.lugar || '—' },
  ]

  infoItems.forEach((item, index) => {
    const x = PADDING + index * (infoBlockWidth + GAP)
    const y = infoY
    drawRoundedRect(ctx, x, y, infoBlockWidth, INFO_HEIGHT, 18, '#1A2332')
    ctx.fillStyle = GOLD
    ctx.fillRect(x, y, 6, INFO_HEIGHT)
    ctx.fillStyle = '#8A9BB8'
    ctx.font = 'bold 20px Arial'
    ctx.textAlign = 'left'
    ctx.fillText(item.label, x + 18, y + 28)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 28px Arial'
    const maxWidth = infoBlockWidth - 36
    const lines = wrapText(ctx, item.value, maxWidth)
    lines.forEach((line, lineIndex) => {
      ctx.fillText(line, x + 18, y + 66 + lineIndex * 27)
    })
  })

  const gridStartY = HEADER_HEIGHT + INFO_HEIGHT + 56
  ctx.fillStyle = '#F0F2F5'
  ctx.font = 'bold 26px Arial'
  ctx.textAlign = 'left'
  ctx.fillText('Convocadas', PADDING, gridStartY - 18)

  convocadas.forEach((c, index) => {
    const col = index % COLUMNS
    const row = Math.floor(index / COLUMNS)
    const x = PADDING + col * (cardWidth + GAP)
    const y = gridStartY + row * cardHeight

    drawRoundedRect(ctx, x, y, cardWidth, cardHeight, CARD_RADIUS, '#141B24', '#223048')

    const avatarX = x + 58
    const avatarY = y + 52
    const initials = `${(c.jugadores?.nombre?.[0] || '')}${(c.jugadores?.apellido?.[0] || '')}`.toUpperCase()
    drawAvatar(ctx, avatarX, avatarY, 46, fotosPorJugador[c.jugador_id], initials)

    const nombre = `${c.jugadores?.apellido || ''} ${c.jugadores?.nombre || ''}`.trim()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 26px Arial'
    ctx.textAlign = 'left'
    const lines = wrapText(ctx, nombre || 'Sin nombre', cardWidth - 26)
    lines.forEach((line, lineIndex) => {
      ctx.fillText(line, x + 18, y + 112 + lineIndex * 28)
    })
  })

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) {
    alert('No se pudo generar la imagen de citación.')
    return
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Citacion_vs_${(partido.rival || 'rival').replace(/\s+/g, '_')}.png`
  link.click()
  URL.revokeObjectURL(url)
}
