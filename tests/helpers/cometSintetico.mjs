// Textos de un «Informe del partido» de COMET inventado (nombres ficticios), con las mismas posiciones que los PDFs
// reales: dos columnas, nombres cortados en dos renglones en SUSTITUCIONES, íconos sin texto, encabezado y pie.
// Sirve para probar el lector y la importación sin usar los PDFs reales (que no van a GitHub).

const A = 595.92, H = 842.88
const ICONO = '' // ícono (carácter de uso privado de la fuente de íconos)

export function cometSintetico({
  local = 'ESTRELLA DEL SUR', visitante = 'COMUNICACIONES', marcador = '2:1', fechaHora = '19.04.2026 14:00 ART',
  estadio = 'CANCHA DE PRUEBA (LOCALIDAD)', numeroFecha = '2', numeroPartido = '10',
  arbitra = ': GOMEZ, LAURA INES (CIUDAD)', asistente1 = ': DIAZ, MARTA', asistente2 = ': RUIZ, ELENA', cuarta = null,
  // [dorsal, nombre, marcas] marcas: 'AR', 'CP'
  titularesLocal = [[1, 'ARQUERA, UNO LOCAL', 'AR'], [9, 'NUEVE, GOLEADORA LOCAL'], [6, 'SEIS, CAPITANA LOCAL', 'CP']],
  titularesVisitante = [[1, 'PORTERA, NUESTRA UNO', 'AR'], [7, 'PRUEBA, ANA'], [10, 'DIEZ, CAPITANA NUESTRA', 'CP']],
  suplentesLocal = [[18, 'DIECIOCHO, SUPLENTE LOCAL']],
  suplentesVisitante = [[13, 'ENSAYO, BEA MARIA']],
  // [columna 0/1, minuto, 'DORSAL NOMBRE']
  goles = [[0, "21'", '9 NUEVE, GOLEADORA LOCAL'], [0, "23'", '9 NUEVE, GOLEADORA LOCAL'], [1, "30'", '7 PRUEBA, ANA']],
  // [columna, minuto, 'DORSAL NOMBRE', motivo]
  amarillas = [[1, "90+4'", '13 ENSAYO, BEA MARIA', 'Conducta antideportiva']],
  rojas = [],
  // [columna, minuto, dorsalSale, nombreSale (| corta renglón), dorsalEntra, nombreEntra]
  cambios = [[0, "50'", 9, 'NUEVE, GOLEADORA|LOCAL', 18, 'DIECIOCHO, SUPLENTE LOCAL'], [1, "62'", 7, 'PRUEBA, ANA', 13, 'ENSAYO, BEA|MARIA']],
  medicas = 'médica local : Persona Inventada M.N 1 médica visitante : Otra Persona M.N 2',
} = {}) {
  const t = []
  const poner = (pagina, x, y, texto, ancho = texto.length * 4) => t.push({ pagina, x, y, ancho, texto, anchoPagina: A, altoPagina: H })
  const pie = (pagina) => {
    poner(pagina, 18, 22, 'COMET - Asociación del Fútbol Argentino')
    poner(pagina, 239, 22, 'Fecha/Hora: 22.11.2026 13:41:27 ART Impreso por: Persona Que Imprime (1)')
    poner(pagina, 18, 826, `Informe del partido: ${local} - ${visitante}`)
    poner(pagina, 518, 826, 'Página')
  }
  // Página 1
  pie(1)
  poner(1, 269, 41, 'Informe del partido', 58)
  poner(1, 210, 55, 'PRIMERA DIVISIÓN "B" 2026 - ZONA "B"', 176)
  for (const x of [30, 544]) { poner(1, x, 84, 'N/A', 8); poner(1, x + 3, 97, 'J', 2); poner(1, x + 15, 97, 'AR', 6) }
  poner(1, 159, 88, local, 89); poner(1, 288, 89, marcador, 18); poner(1, 347, 88, visitante, 88)
  poner(1, 33, 120, ICONO, 8); poner(1, 45, 118, 'Fecha/Hora:', 38); poner(1, 88, 118, fechaHora, 68)
  poner(1, 302, 120, ICONO, 8); poner(1, 315, 118, 'Categoría de edad:', 57); poner(1, 376, 118, 'Seniores F Fútbol', 53)
  poner(1, 45, 134, 'Estadio:', 25); poner(1, 74, 134, estadio, 128)
  poner(1, 315, 134, 'Fecha:', 20); poner(1, 339, 134, numeroFecha, 4)
  poner(1, 315, 151, 'Número de partido:', 59); poner(1, 378, 151, numeroPartido, 8)
  poner(1, 262, 173, 'OFICIALES DE PARTIDO', 71)
  poner(1, 26, 191, 'Árbitro', 21); poner(1, 47, 191, arbitra, 117)
  poner(1, 304, 191, '1° árbitro asistente', 58); poner(1, 362, 191, asistente1, 67)
  poner(1, 26, 205, '2° árbitro asistente', 58); poner(1, 83, 205, asistente2, 81)
  if (cuarta) { poner(1, 304, 205, 'Cuarto árbitro', 50); poner(1, 360, 205, cuarta, 80) }
  poner(1, 274, 229, 'ALINEACIONES', 47)
  poner(1, 26, 247, local, 59); poner(1, 304, 247, visitante, 59)
  const filas = (lista, x0, y0) => lista.forEach(([dorsal, nombre, marca], i) => {
    const y = y0 + i * 14
    poner(1, x0, y, String(dorsal), 8); poner(1, x0 + 12, y, nombre, 90)
    if (marca) poner(1, x0 + 110, y - 1, marca, 6)
    poner(1, x0 + 248, y + 2, ICONO, 9); poner(1, x0 + 257, y, "60'", 8)
  })
  filas(titularesLocal, 26, 261); filas(titularesVisitante, 304, 261)
  poner(1, 271, 420, 'SUBSTITUCIONES', 54)
  filas(suplentesLocal, 26, 438); filas(suplentesVisitante, 304, 438)
  poner(1, 270, 574, 'CUERPO TÉCNICO', 56)
  poner(1, 26, 592, 'Delegado de campo', 61); poner(1, 87, 592, ': DELEGADO, INVENTADO', 88)
  poner(1, 288, 620, 'GOLES', 20)
  const cuenta = [0, 0]
  for (const [col, minuto, texto] of goles) {
    const y = 642 + cuenta[col]++ * 23
    poner(1, col ? 311 : 32, y, minuto, 8); poner(1, col ? 329 : 51, y + 1, texto, 78)
  }
  poner(1, 275, 694, 'DISCIPLINARIO', 46)
  let y = 708
  for (const [titulo, lista] of [['TARJETAS AMARILLAS', amarillas], ['TARJETAS ROJAS', rojas]]) {
    if (!lista.length) continue
    poner(1, 263, y, titulo, 70)
    const c = [0, 0]
    let max = 0
    for (const [col, minuto, quien, motivo] of lista) {
      const yy = y + 18 + c[col]++ * 24
      poner(1, col ? 307 : 28, yy, minuto, 14); poner(1, col ? 349 : 70, yy - 4, quien, 71); poner(1, col ? 349 : 70, yy + 5, motivo, 58)
      max = Math.max(max, yy)
    }
    y = max + 20
  }
  // Página 2
  pie(2)
  poner(2, 273, 39, 'SUSTITUCIONES', 50)
  const c2 = [0, 0]
  for (const [col, minuto, ds, ns, de, ne] of cambios) {
    const yy = 58 + c2[col]++ * 22
    const x = col ? 279 : 0
    poner(2, 32 + x, yy, minuto, 8); poner(2, 56 + x, yy, String(ds), 3)
    const partes = (n, xx) => {
      const [a, b] = n.split('|')
      if (b) { poner(2, xx, yy - 4, a, 70); poner(2, xx, yy + 5, b, 30) } else poner(2, xx, yy + 1, a, 70)
    }
    partes(ns, 69 + x)
    poner(2, 170 + x, yy + 2, ICONO, 8); poner(2, 186 + x, yy, String(de), 7)
    partes(ne, 200 + x)
  }
  if (medicas) { poner(2, 261, 168, 'RESUMEN DEL PARTIDO', 73); poner(2, 24, 187, medicas, 438) }
  poner(2, 24, 213, ICONO, 7); poner(2, 35, 211, 'JUGADO', 27); poner(2, 387, 211, 'LAURA INES GOMEZ 19.04.2026 23:33:26 ART', 185)
  return t
}
