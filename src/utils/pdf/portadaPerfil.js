// Página 1 del PDF de perfil: identidad de la jugadora y sus números principales.
// armarPortadaPerfil decide qué se muestra (lógica pura); dibujarPortadaPerfil lo dibuja.
import { AMARILLO, BLANCO, GRIS, GRIS_CLARO, GRIS_LINEA, GRIS_SOBRE_NEGRO, NEGRO } from './paleta.js'

const dosDigitos = (n) => String(n).padStart(2, '0')
const fechaTexto = (fecha) => `${dosDigitos(fecha.getDate())}/${dosDigitos(fecha.getMonth() + 1)}/${fecha.getFullYear()}`
const numero = (valor, decimales = 0) => Number(valor).toLocaleString('es-AR', { maximumFractionDigits: decimales })

export function calcularEdad(fechaNacimiento, hoy = new Date()) {
  if (!fechaNacimiento) return null
  const [anio, mes, dia] = fechaNacimiento.slice(0, 10).split('-').map(Number)
  let edad = hoy.getFullYear() - anio
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)) edad--
  return edad
}

// Lesionada y enferma son ausencias justificadas: no cuentan en el total.
function tarjetaAsistencia(resumen = {}, totalMarcado = 0) {
  const sesiones = totalMarcado - (resumen.lesionado || 0) - (resumen.enfermo || 0)
  if (sesiones <= 0) return null
  const presentes = (resumen.presente || 0) + (resumen.tarde || 0)
  return {
    clave: 'asistencia',
    etiqueta: 'Asistencia a entrenamientos',
    valor: `${Math.round((presentes / sesiones) * 100)}%`,
    detalle: `sobre ${sesiones} ${sesiones === 1 ? 'sesión' : 'sesiones'}`,
  }
}

function tarjetaCMJ(historial = []) {
  const validas = historial.filter((m) => m?.fecha && Number.isFinite(Number(m.valor_cm)) && m.valor_cm !== null)
  if (!validas.length) return null
  const ultima = validas.reduce((a, b) => (b.fecha > a.fecha ? b : a))
  const [anio, mes, dia] = ultima.fecha.slice(0, 10).split('-')
  return { clave: 'cmj', etiqueta: 'Último CMJ (cm)', valor: numero(ultima.valor_cm, 1), detalle: `${dia}/${mes}/${anio}` }
}

export function armarPortadaPerfil({ jugador, dorsal, totales = {}, resumenAsistencia, totalAsistenciaMarcada, cmjHistorial }, hoy = new Date()) {
  const edad = calcularEdad(jugador.fecha_nacimiento, hoy)
  const partido = (clave, etiqueta, valor) => ({ clave, etiqueta, valor: numero(valor || 0), detalle: '' })
  const tarjetas = [
    // Sin partidos cargados no se muestra ninguna; con partidos, un 0 es un dato real.
    ...(totales.partidos > 0 ? [
      partido('partidos', 'Partidos', totales.partidos),
      partido('minutos', 'Minutos', totales.minutos),
      partido('goles', 'Goles', totales.goles),
      partido('asistencias', 'Asistencias', totales.asistencias),
    ] : []),
    tarjetaAsistencia(resumenAsistencia, totalAsistenciaMarcada),
    tarjetaCMJ(cmjHistorial),
  ].filter(Boolean)

  const nombre = (jugador.nombre || '').trim()
  const apellido = (jugador.apellido || '').trim()
  return {
    apellido: apellido.toLocaleUpperCase('es-AR'),
    nombre,
    iniciales: `${nombre[0] || ''}${apellido[0] || ''}`.toLocaleUpperCase('es-AR'),
    dorsal: dorsal === null || dorsal === undefined || dorsal === '' ? null : String(dorsal),
    chips: [jugador.posicion, edad !== null ? `${edad} años` : null, jugador.categorias?.nombre].filter(Boolean),
    tarjetas,
    fecha: fechaTexto(hoy),
  }
}

function formatoImagen(dataUrl) {
  const match = /^data:image\/(\w+);/.exec(dataUrl || '')
  return match ? match[1].toUpperCase() : 'PNG'
}

function imagen(doc, dataUrl, x, y, ancho, alto) {
  if (!dataUrl) return false
  try {
    doc.addImage(dataUrl, formatoImagen(dataUrl), x, y, ancho, alto)
    return true
  } catch {
    return false
  }
}

export function dibujarPortadaPerfil(doc, portada, { foto, escudo } = {}) {
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  const margen = 40

  // Encabezado negro con escudo y franja amarilla.
  doc.setFillColor(...NEGRO)
  doc.rect(0, 0, ancho, 96, 'F')
  doc.setFillColor(...AMARILLO)
  doc.rect(0, 96, ancho, 8, 'F')
  const conEscudo = imagen(doc, escudo, margen, 22, 52, 52)
  const textoX = conEscudo ? margen + 68 : margen
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...BLANCO)
  doc.text('CLUB COMUNICACIONES', textoX, 46)
  doc.setFontSize(9)
  doc.setTextColor(...AMARILLO)
  doc.text('INFORME DE JUGADORA', textoX, 64, { charSpace: 1.5 })
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRIS_CLARO)
  doc.text(portada.fecha, ancho - margen, 46, { align: 'right' })

  // Foto grande con marco amarillo; sin foto, las iniciales.
  const fotoY = 136
  const fotoLado = 190
  if (!imagen(doc, foto, margen, fotoY, fotoLado, fotoLado)) {
    doc.setFillColor(...NEGRO)
    doc.rect(margen, fotoY, fotoLado, fotoLado, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(64)
    doc.setTextColor(...AMARILLO)
    doc.text(portada.iniciales || '—', margen + fotoLado / 2, fotoY + fotoLado / 2 + 22, { align: 'center' })
  }
  doc.setDrawColor(...AMARILLO)
  doc.setLineWidth(3)
  doc.rect(margen, fotoY, fotoLado, fotoLado, 'S')

  // Dorsal, nombre y chips.
  const colX = margen + fotoLado + 28
  const colAncho = ancho - margen - colX
  let y = fotoY
  if (portada.dorsal) {
    doc.setFillColor(...NEGRO)
    doc.roundedRect(colX, y, 78, 78, 8, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(44)
    doc.setTextColor(...AMARILLO)
    doc.text(portada.dorsal, colX + 39, y + 55, { align: 'center' })
    y += 78 + 34
  } else {
    y += 30
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(...NEGRO)
  doc.text(portada.apellido, colX, y, { maxWidth: colAncho })
  y += 24
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(17)
  doc.setTextColor(...GRIS)
  doc.text(portada.nombre, colX, y, { maxWidth: colAncho })
  y += 22

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  let chipX = colX
  for (const chip of portada.chips) {
    const texto = chip.toLocaleUpperCase('es-AR')
    const chipAncho = doc.getTextWidth(texto) + 18
    if (chipX + chipAncho > ancho - margen) {
      chipX = colX
      y += 26
    }
    doc.setFillColor(...NEGRO)
    doc.roundedRect(chipX, y, chipAncho, 20, 10, 10, 'F')
    doc.setTextColor(...BLANCO)
    doc.text(texto, chipX + 9, y + 13.5)
    chipX += chipAncho + 8
  }

  // Rendimiento: tarjetas negras con números grandes, sin huecos.
  if (portada.tarjetas.length) {
    let tarjetaY = fotoY + fotoLado + 48
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...NEGRO)
    doc.text('RENDIMIENTO', margen, tarjetaY, { charSpace: 1 })
    doc.setDrawColor(...AMARILLO)
    doc.setLineWidth(2.5)
    doc.line(margen, tarjetaY + 6, margen + 34, tarjetaY + 6)
    tarjetaY += 22

    const columnas = 3
    const separacion = 12
    const tarjetaAncho = (ancho - margen * 2 - separacion * (columnas - 1)) / columnas
    const tarjetaAlto = 100
    portada.tarjetas.forEach((tarjeta, i) => {
      const x = margen + (i % columnas) * (tarjetaAncho + separacion)
      const yT = tarjetaY + Math.floor(i / columnas) * (tarjetaAlto + separacion)
      doc.setFillColor(...NEGRO)
      doc.roundedRect(x, yT, tarjetaAncho, tarjetaAlto, 8, 8, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(34)
      doc.setTextColor(...AMARILLO)
      doc.text(tarjeta.valor, x + tarjetaAncho / 2, yT + 50, { align: 'center' })
      doc.setFontSize(8)
      doc.setTextColor(...GRIS_CLARO)
      doc.text(tarjeta.etiqueta.toLocaleUpperCase('es-AR'), x + tarjetaAncho / 2, yT + 70, { align: 'center', maxWidth: tarjetaAncho - 16 })
      if (tarjeta.detalle) {
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...GRIS_SOBRE_NEGRO)
        doc.text(tarjeta.detalle, x + tarjetaAncho / 2, yT + 85, { align: 'center' })
      }
    })
  }

  // Pie.
  doc.setDrawColor(...GRIS_LINEA)
  doc.setLineWidth(0.8)
  doc.line(margen, alto - 44, ancho - margen, alto - 44)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRIS)
  doc.text('Club Comunicaciones · Informe de jugadora', margen, alto - 30)
  doc.text('Página 1', ancho - margen, alto - 30, { align: 'right' })
}
