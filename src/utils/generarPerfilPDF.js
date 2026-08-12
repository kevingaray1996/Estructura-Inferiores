import { jsPDF } from 'jspdf'

const NEGRO = [23, 23, 23]
const AMARILLO = [251, 191, 36]
const BLANCO = [255, 255, 255]
const GRIS = [90, 100, 115]
const AMARILLO_CLARO = [255, 251, 235]
const TEXTO_OSCURO = [30, 30, 30]
const ROJO = [226, 75, 74]
const ROJO_CLARO = [252, 228, 227]

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

function formatearFecha(fechaStr) {
  if (!fechaStr) return ''
  const [anio, mes, dia] = fechaStr.split('-')
  return `${dia}/${mes}/${anio}`
}

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null
  const hoy = new Date()
  const nacimiento = new Date(fechaNacimiento)
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const mes = hoy.getMonth() - nacimiento.getMonth()
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad--
  return edad
}

function dibujarGraficoCMJ(doc, x, y, width, height, historial) {
  doc.setDrawColor(220, 220, 220)
  doc.setFillColor(...BLANCO)
  doc.roundedRect(x, y, width, height, 8, 8, 'FD')

  const datos = [...historial].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))

  if (datos.length < 2) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(...GRIS)
    doc.text('Hace falta al menos 2 mediciones para mostrar el gráfico.', x + width / 2, y + height / 2, {
      align: 'center',
    })
    return
  }

  const padX = 16
  const padTop = 16
  const padBottom = 22
  const plotW = width - padX * 2
  const plotH = height - padTop - padBottom

  const valores = datos.map((d) => d.valor_cm)
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const rango = max - min || 1

  const puntos = datos.map((d, i) => {
    const px = x + padX + (datos.length === 1 ? plotW / 2 : (i / (datos.length - 1)) * plotW)
    const py = y + padTop + (1 - (d.valor_cm - min) / rango) * plotH
    return { x: px, y: py }
  })

  const baseY = y + padTop + plotH
  const areaPuntos = [{ x: puntos[0].x, y: baseY }, ...puntos, { x: puntos[puntos.length - 1].x, y: baseY }]
  const areaLines = []
  for (let i = 1; i < areaPuntos.length; i++) {
    areaLines.push([areaPuntos[i].x - areaPuntos[i - 1].x, areaPuntos[i].y - areaPuntos[i - 1].y])
  }
  doc.setFillColor(...ROJO_CLARO)
  doc.lines(areaLines, areaPuntos[0].x, areaPuntos[0].y, [1, 1], 'F', true)

  const lineLines = []
  for (let i = 1; i < puntos.length; i++) {
    lineLines.push([puntos[i].x - puntos[i - 1].x, puntos[i].y - puntos[i - 1].y])
  }
  doc.setDrawColor(...ROJO)
  doc.setLineWidth(1.6)
  doc.lines(lineLines, puntos[0].x, puntos[0].y, [1, 1], 'S', false)

  puntos.forEach((p) => {
    doc.setFillColor(...ROJO)
    doc.circle(p.x, p.y, 2.2, 'F')
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRIS)
  doc.text(datos[0].fecha, x + padX, y + height - 8)
  doc.text(datos[datos.length - 1].fecha, x + width - padX, y + height - 8, { align: 'right' })
}

export async function generarPerfilPDF(datos, secciones) {
  const {
    jugador,
    totales,
    fichasMedicas,
    fichasNutricion,
    fichasPsicologicas,
    historialCategorias,
    resumenAsistencia,
    totalAsistenciaMarcada,
    sesionesFisicas,
    cmjHistorial,
    resumenBienestarMensual,
    asistenciaReciente,
  } = datos

  const fotoDataUrl = jugador.foto_url ? await cargarImagenDataURL(jugador.foto_url) : null
  const escudoDataUrl = await cargarImagenDataURL(ESCUDO_CLUB_URL)

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40

  // ===== Encabezado =====
  doc.setFillColor(...NEGRO)
  doc.rect(0, 0, pageWidth, 100, 'F')
  doc.setFillColor(...AMARILLO)
  doc.rect(0, 100, pageWidth, 4, 'F')

  if (escudoDataUrl) {
    try {
      const formato = formatoDeDataUrl(escudoDataUrl)
      doc.addImage(escudoDataUrl, formato, pageWidth - margin - 44, 28, 44, 44)
    } catch {
      // sin escudo si falla
    }
  }

  if (fotoDataUrl) {
    try {
      const formato = formatoDeDataUrl(fotoDataUrl)
      doc.setDrawColor(...AMARILLO)
      doc.setLineWidth(1.2)
      doc.rect(margin - 1, 29, 52, 52, 'S')
      doc.addImage(fotoDataUrl, formato, margin, 30, 50, 50)
    } catch {
      // si falla la foto, seguimos sin ella
    }
  }

  const textoX = fotoDataUrl ? margin + 65 : margin
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...BLANCO)
  doc.text(`${jugador.apellido}, ${jugador.nombre}`, textoX, 45)

  const edad = calcularEdad(jugador.fecha_nacimiento)
  const subtitulo = [
    jugador.categorias?.nombre,
    jugador.posicion,
    edad !== null ? `${edad} años` : null,
  ]
    .filter(Boolean)
    .join('  ·  ')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...AMARILLO)
  doc.text(subtitulo, textoX, 62)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(200, 200, 200)
  const hoy = new Date()
  doc.text(
    `Club Comunicaciones — generado el ${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`,
    textoX,
    82
  )

  let y = 134

  function chequearSalto(alturaNecesaria) {
    if (y + alturaNecesaria > pageHeight - 40) {
      doc.addPage()
      y = 40
    }
  }

  function tituloSeccion(texto) {
    chequearSalto(30)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...NEGRO)
    doc.text(texto.toUpperCase(), margin, y)
    doc.setDrawColor(...AMARILLO)
    doc.setLineWidth(2)
    doc.line(margin, y + 5, margin + 28, y + 5)
    y += 24
  }

  function lineaTexto(texto, opciones = {}) {
    chequearSalto(16)
    doc.setFont('helvetica', opciones.bold ? 'bold' : 'normal')
    doc.setFontSize(opciones.size || 10)
    doc.setTextColor(...(opciones.color || TEXTO_OSCURO))
    doc.text(texto, margin + (opciones.indent || 0), y, { maxWidth: pageWidth - margin * 2 - (opciones.indent || 0) })
    y += opciones.salto || 16
  }

  // ===== Datos generales =====
  if (secciones.generales) {
    tituloSeccion('Datos generales')
    const filas = [
      ['Categoría', jugador.categorias?.nombre || '—'],
      ['Posición', jugador.posicion || '—'],
      ['Fecha de nacimiento', jugador.fecha_nacimiento ? `${formatearFecha(jugador.fecha_nacimiento)}${edad !== null ? ` (${edad} años)` : ''}` : '—'],
      ['Pie hábil', jugador.pie_habil || '—'],
      ['Estado', jugador.estado || '—'],
    ]
    filas.forEach(([label, valor]) => {
      chequearSalto(16)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...GRIS)
      doc.text(label, margin, y)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...TEXTO_OSCURO)
      doc.text(String(valor), margin + 160, y)
      y += 16
    })
    y += 10
  }

  // ===== Estadísticas =====
  if (secciones.estadisticas) {
    tituloSeccion('Estadísticas de partidos')
    const stats = [
      ['Partidos jugados', totales.partidos],
      ['Titularidades', totales.titularidades],
      ['Minutos', totales.minutos],
      ['Goles', totales.goles],
      ['Asistencias', totales.asistencias],
      ['Tarjetas amarillas', totales.amarillas],
      ['Tarjetas rojas', totales.rojas],
    ]
    chequearSalto(20)
    doc.setFillColor(...NEGRO)
    doc.rect(margin, y - 12, pageWidth - margin * 2, 20, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...AMARILLO)
    stats.forEach((s, i) => doc.text(s[0], margin + 10 + i * 75, y, { maxWidth: 72 }))
    y += 24
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...NEGRO)
    stats.forEach((s, i) => doc.text(String(s[1]), margin + 10 + i * 75, y))
    y += 30
  }

  // ===== Médico =====
  if (secciones.medico) {
    tituloSeccion('Historial médico')
    if (fichasMedicas.length === 0) {
      lineaTexto('Sin registros médicos.', { color: GRIS })
    } else {
      fichasMedicas.forEach((f) => {
        chequearSalto(30)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(...NEGRO)
        doc.text(formatearFecha(f.fecha), margin, y)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...(f.recuperado ? [74, 160, 100] : [200, 90, 90]))
        doc.text(f.recuperado ? 'Recuperado' : 'Activo', margin + 80, y)
        y += 14
        doc.setTextColor(...TEXTO_OSCURO)
        doc.setFontSize(9)
        doc.text(f.descripcion || '—', margin, y, { maxWidth: pageWidth - margin * 2 })
        y += 18
      })
    }
    y += 8
  }

  // ===== Nutrición =====
  if (secciones.nutricion) {
    tituloSeccion('Nutrición')
    if (fichasNutricion.length === 0) {
      lineaTexto('Sin registros nutricionales.', { color: GRIS })
    } else {
      fichasNutricion.forEach((f) => {
        chequearSalto(30)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(...NEGRO)
        doc.text(formatearFecha(f.fecha), margin, y)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...TEXTO_OSCURO)
        const medidas = [f.peso ? `${f.peso} kg` : null, f.altura ? `${f.altura} cm` : null]
          .filter(Boolean)
          .join(' · ')
        doc.text(medidas, margin + 80, y)
        if (f.alerta_peso) {
          doc.setTextColor(200, 90, 90)
          doc.text('Alerta de peso', margin + 200, y)
        }
        y += 14
        if (f.descripcion) {
          doc.setTextColor(...TEXTO_OSCURO)
          doc.setFontSize(9)
          doc.text(f.descripcion, margin, y, { maxWidth: pageWidth - margin * 2 })
          y += 18
        } else {
          y += 4
        }
      })
    }
    y += 8
  }

  // ===== Psicología =====
  if (secciones.psicologia) {
    tituloSeccion('Psicología')
    if (fichasPsicologicas.length === 0) {
      lineaTexto('Sin registros de psicología.', { color: GRIS })
    } else {
      fichasPsicologicas.forEach((f) => {
        chequearSalto(30)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(...NEGRO)
        doc.text(formatearFecha(f.fecha), margin, y)
        y += 14
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...TEXTO_OSCURO)
        doc.text(f.descripcion || '—', margin, y, { maxWidth: pageWidth - margin * 2 })
        y += 18
      })
    }
    y += 8
  }

  // ===== Evolución de CMJ =====
  if (secciones.cmj) {
    tituloSeccion('Evolución de CMJ')
    if (!cmjHistorial || cmjHistorial.length === 0) {
      lineaTexto('Sin mediciones de CMJ cargadas.', { color: GRIS })
    } else {
      const alturaGrafico = 130
      chequearSalto(alturaGrafico + 10)
      dibujarGraficoCMJ(doc, margin, y, pageWidth - margin * 2, alturaGrafico, cmjHistorial)
      y += alturaGrafico + 16
      const ultimos = [...cmjHistorial].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 3)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...TEXTO_OSCURO)
      doc.text(
        `Últimas mediciones: ${ultimos.map((m) => `${m.valor_cm} cm (${formatearFecha(m.fecha)})`).join('  ·  ')}`,
        margin,
        y,
        { maxWidth: pageWidth - margin * 2 }
      )
      y += 20
    }
    y += 8
  }

  // ===== Wellness (últimos 30 días) =====
  if (secciones.wellness) {
    tituloSeccion('Wellness (últimos 30 días)')
    if (!resumenBienestarMensual) {
      lineaTexto('Sin datos de wellness cargados en los últimos 30 días.', { color: GRIS })
    } else {
      chequearSalto(55)
      const cardW = (pageWidth - margin * 2 - 40) / 5
      resumenBienestarMensual.forEach((m, i) => {
        const x = margin + i * (cardW + 10)
        doc.setFillColor(...AMARILLO_CLARO)
        doc.roundedRect(x, y, cardW, 46, 8, 8, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(13)
        doc.setTextColor(...NEGRO)
        doc.text(m.promedio !== null ? m.promedio.toFixed(1) : '—', x + cardW / 2, y + 20, { align: 'center' })
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(...GRIS)
        doc.text(m.label, x + cardW / 2, y + 34, { align: 'center' })
      })
      y += 66
    }
    y += 8
  }

  // ===== Físico (GPS) =====
  if (secciones.fisico) {
    tituloSeccion('Físico (GPS)')
    const sesionesConDatos = (sesionesFisicas || []).filter(
      (s) =>
        s.distancia_total_m !== null ||
        s.distancia_alta_intensidad_m !== null ||
        s.sprints !== null ||
        s.velocidad_maxima_kmh !== null ||
        s.player_load !== null
    )
    if (sesionesConDatos.length === 0) {
      lineaTexto('Sin datos físicos cargados.', { color: GRIS })
    } else {
      chequearSalto(20)
      doc.setFillColor(...NEGRO)
      doc.rect(margin, y - 12, pageWidth - margin * 2, 20, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...AMARILLO)
      const columnas = ['Fecha', 'Tipo', 'Dist. (m)', 'Dist. alta int.', 'Sprints', 'Vel. máx', 'Load']
      const xs = [margin + 5, margin + 65, margin + 130, margin + 195, margin + 270, margin + 330, margin + 400]
      columnas.forEach((c, i) => doc.text(c, xs[i], y))
      y += 20
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...TEXTO_OSCURO)
      sesionesConDatos
        .slice(-20)
        .reverse()
        .forEach((s, i) => {
          chequearSalto(18)
          if (i % 2 === 0) {
            doc.setFillColor(...AMARILLO_CLARO)
            doc.rect(margin, y - 12, pageWidth - margin * 2, 18, 'F')
          }
          doc.setFontSize(8.5)
          doc.text(formatearFecha(s.fecha), xs[0], y)
          const etiquetaTipo = s.partidos ? `Partido (vs ${s.partidos.rival})` : s.tipo || '—'
          doc.text(etiquetaTipo, xs[1], y, { maxWidth: 60 })
          doc.text(s.distancia_total_m !== null ? String(s.distancia_total_m) : '—', xs[2], y)
          doc.text(s.distancia_alta_intensidad_m !== null ? String(s.distancia_alta_intensidad_m) : '—', xs[3], y)
          doc.text(s.sprints !== null ? String(s.sprints) : '—', xs[4], y)
          doc.text(s.velocidad_maxima_kmh !== null ? String(s.velocidad_maxima_kmh) : '—', xs[5], y)
          doc.text(s.player_load !== null ? String(s.player_load) : '—', xs[6], y)
          y += 18
        })
      if (sesionesConDatos.length > 20) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(8)
        doc.setTextColor(...GRIS)
        doc.text(`Mostrando las últimas 20 sesiones de ${sesionesConDatos.length} con datos cargados.`, margin, y + 4)
        y += 16
      }
    }
    y += 8
  }

  // ===== Asistencia =====
  if (secciones.asistencia) {
    tituloSeccion('Asistencia')
    if (totalAsistenciaMarcada === 0) {
      lineaTexto('Sin registros de asistencia.', { color: GRIS })
    } else {
      const filas = [
        ['Presente', resumenAsistencia.presente],
        ['Tarde', resumenAsistencia.tarde],
        ['Ausente', resumenAsistencia.ausente],
        ['Lesionado', resumenAsistencia.lesionado],
        ['Enfermo', resumenAsistencia.enfermo],
      ]
      chequearSalto(20)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      filas.forEach(([label, valor], i) => {
        doc.setTextColor(...NEGRO)
        doc.text(`${label}:`, margin + i * 100, y)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...TEXTO_OSCURO)
        doc.text(String(valor), margin + i * 100 + 55, y)
        doc.setFont('helvetica', 'bold')
      })
      y += 24

      if (asistenciaReciente && asistenciaReciente.total > 0) {
        chequearSalto(20)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.5)
        doc.setTextColor(...GRIS)
        doc.text('Últimos 14 días:', margin, y)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...TEXTO_OSCURO)
        const r = asistenciaReciente.resumen
        const texto = `${r.presente} presente(s) · ${r.tarde} tarde(s) · ${r.ausente} ausente(s) · ${r.lesionado} lesionado(s) · ${r.enfermo} enfermo(s)`
        doc.text(texto, margin + 90, y, { maxWidth: pageWidth - margin * 2 - 90 })
        y += 20
      }
    }
  }

  // ===== Trayectoria =====
  if (secciones.trayectoria) {
    tituloSeccion('Trayectoria entre categorías')
    if (historialCategorias.length === 0) {
      lineaTexto('Sin cambios de categoría registrados.', { color: GRIS })
    } else {
      historialCategorias.forEach((h) => {
        chequearSalto(16)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(...TEXTO_OSCURO)
        const texto = `${formatearFecha(h.fecha)} — ${h.categoria_anterior?.nombre || '—'} → ${h.categoria_nueva?.nombre || '—'}${h.temporada ? ` (temporada ${h.temporada})` : ''}`
        doc.text(texto, margin, y)
        y += 16
      })
    }
  }

  doc.save(`Perfil_${jugador.apellido}_${jugador.nombre}`.replace(/\s+/g, '_') + '.pdf')
}
