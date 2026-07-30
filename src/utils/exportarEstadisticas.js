import { jsPDF } from 'jspdf'
import { supabase } from '../supabaseClient'

const NAVY = [26, 35, 50]
const VERDE = [74, 222, 128]
const BLANCO = [240, 242, 245]
const GRIS = [138, 155, 184]
const GRIS_CLARO = [42, 53, 72]

export async function obtenerEstadisticasCategoria(categoriaId) {
  const { data: jugadores } = await supabase
    .from('jugadores')
    .select('id, nombre, apellido')
    .eq('categoria_id', categoriaId)
    .order('apellido')

  const ids = (jugadores || []).map((j) => j.id)
  let estadisticas = []
  if (ids.length > 0) {
    const { data } = await supabase
      .from('estadisticas_jugador')
      .select('*')
      .in('jugador_id', ids)
    estadisticas = data || []
  }

  return (jugadores || []).map((j) => {
    const propias = estadisticas.filter((e) => e.jugador_id === j.id)
    const totales = propias.reduce(
      (acc, e) => ({
        partidos: acc.partidos + 1,
        titularidades: acc.titularidades + (e.titular ? 1 : 0),
        minutos: acc.minutos + (e.minutos_jugados || 0),
        goles: acc.goles + (e.goles || 0),
        asistencias: acc.asistencias + (e.asistencias || 0),
        amarillas: acc.amarillas + (e.tarjetas_amarillas || 0),
        rojas: acc.rojas + (e.tarjetas_rojas || 0),
      }),
      { partidos: 0, titularidades: 0, minutos: 0, goles: 0, asistencias: 0, amarillas: 0, rojas: 0 }
    )
    return { nombre: j.nombre, apellido: j.apellido, ...totales }
  })
}

export async function exportarEstadisticasPDF(categoriaId, categoriaNombre) {
  const filas = await obtenerEstadisticasCategoria(categoriaId)

  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
  const anchoPagina = doc.internal.pageSize.getWidth()
  const margen = 40

  doc.setFillColor(...NAVY)
  doc.rect(0, 0, anchoPagina, 70, 'F')
  doc.setFillColor(...VERDE)
  doc.rect(0, 0, anchoPagina, 4, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...BLANCO)
  doc.text('Estadísticas de la temporada', margen, 35)
  doc.setFontSize(11)
  doc.setTextColor(...GRIS)
  doc.text(categoriaNombre || '', margen, 54)

  const columnas = [
    { label: 'Jugador', x: margen },
    { label: 'PJ', x: margen + 220 },
    { label: 'Titular', x: margen + 270 },
    { label: 'Min', x: margen + 330 },
    { label: 'Goles', x: margen + 380 },
    { label: 'Asist.', x: margen + 430 },
    { label: 'Amar.', x: margen + 480 },
    { label: 'Rojas', x: margen + 530 },
  ]

  let y = 100
  doc.setFillColor(...GRIS_CLARO)
  doc.rect(margen, y - 14, anchoPagina - margen * 2, 20, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  columnas.forEach((c) => doc.text(c.label, c.x, y))
  y += 22

  doc.setFont('helvetica', 'normal')
  filas.forEach((f, i) => {
    if (y > 550) {
      doc.addPage()
      y = 50
    }
    if (i % 2 === 0) {
      doc.setFillColor(248, 249, 250)
      doc.rect(margen, y - 14, anchoPagina - margen * 2, 20, 'F')
    }
    doc.setFontSize(9)
    doc.setTextColor(30, 30, 30)
    doc.text(`${f.apellido}, ${f.nombre}`, columnas[0].x, y)
    doc.text(String(f.partidos), columnas[1].x, y)
    doc.text(String(f.titularidades), columnas[2].x, y)
    doc.text(String(f.minutos), columnas[3].x, y)
    doc.text(String(f.goles), columnas[4].x, y)
    doc.text(String(f.asistencias), columnas[5].x, y)
    doc.text(String(f.amarillas), columnas[6].x, y)
    doc.text(String(f.rojas), columnas[7].x, y)
    y += 20
  })

  if (filas.length === 0) {
    doc.setTextColor(...GRIS)
    doc.text('No hay jugadores cargados en esta categoría.', margen, y)
  }

  doc.save(`Estadisticas_${(categoriaNombre || 'categoria').replace(/\s+/g, '_')}.pdf`)
}

export async function exportarEstadisticasCSV(categoriaId, categoriaNombre) {
  const filas = await obtenerEstadisticasCategoria(categoriaId)

  const encabezado = ['Jugador', 'Partidos', 'Titularidades', 'Minutos', 'Goles', 'Asistencias', 'Amarillas', 'Rojas']
  const lineas = [encabezado.join(',')]
  filas.forEach((f) => {
    lineas.push(
      [
        `"${f.apellido}, ${f.nombre}"`,
        f.partidos,
        f.titularidades,
        f.minutos,
        f.goles,
        f.asistencias,
        f.amarillas,
        f.rojas,
      ].join(',')
    )
  })

  const csv = '﻿' + lineas.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Estadisticas_${(categoriaNombre || 'categoria').replace(/\s+/g, '_')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
