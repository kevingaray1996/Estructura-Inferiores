import { jsPDF } from 'jspdf'

const NAVY = [26, 35, 50]
const VERDE = [74, 222, 128]
const BLANCO = [255, 255, 255]
const GRIS = [90, 100, 115]
const GRIS_CLARO = [235, 238, 243]
const NEGRO = [30, 30, 30]

async function cargarImagenDataURL(url) {
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
  } = datos

  const fotoDataUrl = jugador.foto_url ? await cargarImagenDataURL(jugador.foto_url) : null

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40

  // ===== Encabezado =====
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, pageWidth, 100, 'F')
  doc.setFillColor(...VERDE)
  doc.rect(0, 0, pageWidth, 4, 'F')

  if (fotoDataUrl) {
    try {
      const formato = formatoDeDataUrl(fotoDataUrl)
      doc.setDrawColor(...VERDE)
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
  doc.setTextColor(200, 208, 220)
  doc.text(subtitulo, textoX, 62)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRIS)
  const hoy = new Date()
  doc.text(
    `Estructura Inferiores — generado el ${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`,
    pageWidth - margin,
    90,
    { align: 'right' }
  )

  let y = 130

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
    doc.setTextColor(...NAVY)
    doc.text(texto.toUpperCase(), margin, y)
    doc.setDrawColor(...VERDE)
    doc.setLineWidth(1.5)
    doc.line(margin, y + 5, margin + 28, y + 5)
    y += 24
  }

  function lineaTexto(texto, opciones = {}) {
    chequearSalto(16)
    doc.setFont('helvetica', opciones.bold ? 'bold' : 'normal')
    doc.setFontSize(opciones.size || 10)
    doc.setTextColor(...(opciones.color || NEGRO))
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
      doc.setTextColor(...NEGRO)
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
    doc.setFillColor(...GRIS_CLARO)
    doc.rect(margin, y - 12, pageWidth - margin * 2, 20, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...GRIS)
    stats.forEach((s, i) => doc.text(s[0], margin + 10 + i * 75, y, { maxWidth: 72 }))
    y += 24
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...NAVY)
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
        doc.setTextColor(...NAVY)
        doc.text(formatearFecha(f.fecha), margin, y)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...(f.recuperado ? [74, 160, 100] : [200, 90, 90]))
        doc.text(f.recuperado ? 'Recuperado' : 'Activo', margin + 80, y)
        y += 14
        doc.setTextColor(...NEGRO)
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
        doc.setTextColor(...NAVY)
        doc.text(formatearFecha(f.fecha), margin, y)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...NEGRO)
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
          doc.setTextColor(...NEGRO)
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
        doc.setTextColor(...NAVY)
        doc.text(formatearFecha(f.fecha), margin, y)
        y += 14
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...NEGRO)
        doc.text(f.descripcion || '—', margin, y, { maxWidth: pageWidth - margin * 2 })
        y += 18
      })
    }
    y += 8
  }

  // ===== Físico (GPS) =====
  if (secciones.fisico) {
    tituloSeccion('Físico (GPS)')
    if (sesionesFisicas.length === 0) {
      lineaTexto('Sin datos físicos cargados.', { color: GRIS })
    } else {
      chequearSalto(20)
      doc.setFillColor(...GRIS_CLARO)
      doc.rect(margin, y - 12, pageWidth - margin * 2, 20, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...GRIS)
      const columnas = ['Fecha', 'Tipo', 'Dist. (m)', 'Dist. alta int.', 'Sprints', 'Vel. máx', 'Load']
      const xs = [margin + 5, margin + 65, margin + 130, margin + 195, margin + 270, margin + 330, margin + 400]
      columnas.forEach((c, i) => doc.text(c, xs[i], y))
      y += 20
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...NEGRO)
      sesionesFisicas
        .slice()
        .reverse()
        .forEach((s, i) => {
          chequearSalto(18)
          if (i % 2 === 0) {
            doc.setFillColor(248, 249, 250)
            doc.rect(margin, y - 12, pageWidth - margin * 2, 18, 'F')
          }
          doc.setFontSize(8.5)
          doc.text(formatearFecha(s.fecha), xs[0], y)
          doc.text(s.tipo || '—', xs[1], y)
          doc.text(s.distancia_total_m !== null ? String(s.distancia_total_m) : '—', xs[2], y)
          doc.text(s.distancia_alta_intensidad_m !== null ? String(s.distancia_alta_intensidad_m) : '—', xs[3], y)
          doc.text(s.sprints !== null ? String(s.sprints) : '—', xs[4], y)
          doc.text(s.velocidad_maxima_kmh !== null ? String(s.velocidad_maxima_kmh) : '—', xs[5], y)
          doc.text(s.player_load !== null ? String(s.player_load) : '—', xs[6], y)
          y += 18
        })
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
        doc.setTextColor(...NAVY)
        doc.text(`${label}:`, margin + i * 100, y)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...NEGRO)
        doc.text(String(valor), margin + i * 100 + 55, y)
        doc.setFont('helvetica', 'bold')
      })
      y += 24
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
        doc.setTextColor(...NEGRO)
        const texto = `${formatearFecha(h.fecha)} — ${h.categoria_anterior?.nombre || '—'} → ${h.categoria_nueva?.nombre || '—'}${h.temporada ? ` (temporada ${h.temporada})` : ''}`
        doc.text(texto, margin, y)
        y += 16
      })
    }
  }

  doc.save(`Perfil_${jugador.apellido}_${jugador.nombre}`.replace(/\s+/g, '_') + '.pdf')
}
