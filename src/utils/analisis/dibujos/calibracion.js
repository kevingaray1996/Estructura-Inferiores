// Calibración de la cancha (etapa 5, docs/analisis-etapa5.md): con 4 o más puntos conocidos marcados en el video se
// calcula la transformación del video a la cancha vista desde arriba (homografía). Lógica pura.
// Cancha en metros: x a lo largo (0 = arco de la izquierda de la cámara), y a lo ancho (0 = lateral de arriba).
// Video: x, y de 0 a 1 relativos al cuadro (como el resto de los dibujos).

export const CANCHA_POR_DEFECTO = Object.freeze({ largo: 100, ancho: 64 })
export const LIMITES_CANCHA = Object.freeze({ largo: [50, 120], ancho: [30, 90] })
export const MINIMO_PUNTOS = 4
export const MAXIMO_PUNTOS = 20
export const MAXIMO_CALIBRACIONES = 20
// Error (en % del ancho del video) desde el que un punto se marca para revisar.
export const ERROR_REVISAR = 1.5

// Medidas reglamentarias (las mismas en canchas más chicas).
const AREA = { fondo: 16.5, mitad: 20.16 }
const CHICA = { fondo: 5.5, mitad: 9.16 }
const PENAL = 11
const RADIO = 9.15

const entre = (v, [min, max]) => Math.min(max, Math.max(min, v))
const numero = (v, base) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : base)

export function medidasCancha(c) {
  return {
    largo: Math.round(entre(numero(c?.largo, CANCHA_POR_DEFECTO.largo), LIMITES_CANCHA.largo) * 10) / 10,
    ancho: Math.round(entre(numero(c?.ancho, CANCHA_POR_DEFECTO.ancho), LIMITES_CANCHA.ancho) * 10) / 10,
  }
}

// Puntos conocidos para elegir al calibrar: { ref, nombre, grupo, x, y } en metros.
export function puntosConocidos(cancha) {
  const { largo: L, ancho: W } = medidasCancha(cancha)
  const c = W / 2
  const lista = [
    { ref: 'banderin_ai', grupo: 'Banderines', nombre: 'Banderín de arriba a la izquierda', x: 0, y: 0 },
    { ref: 'banderin_bi', grupo: 'Banderines', nombre: 'Banderín de abajo a la izquierda', x: 0, y: W },
    { ref: 'banderin_ad', grupo: 'Banderines', nombre: 'Banderín de arriba a la derecha', x: L, y: 0 },
    { ref: 'banderin_bd', grupo: 'Banderines', nombre: 'Banderín de abajo a la derecha', x: L, y: W },
    { ref: 'mitad_a', grupo: 'Mitad de cancha', nombre: 'Mitad de cancha con el lateral de arriba', x: L / 2, y: 0 },
    { ref: 'mitad_b', grupo: 'Mitad de cancha', nombre: 'Mitad de cancha con el lateral de abajo', x: L / 2, y: W },
    { ref: 'centro', grupo: 'Mitad de cancha', nombre: 'Centro de la cancha', x: L / 2, y: c },
    { ref: 'circulo_a', grupo: 'Círculo central', nombre: 'Círculo central, punto de arriba', x: L / 2, y: c - RADIO },
    { ref: 'circulo_b', grupo: 'Círculo central', nombre: 'Círculo central, punto de abajo', x: L / 2, y: c + RADIO },
    { ref: 'circulo_i', grupo: 'Círculo central', nombre: 'Círculo central, punto de la izquierda', x: L / 2 - RADIO, y: c },
    { ref: 'circulo_d', grupo: 'Círculo central', nombre: 'Círculo central, punto de la derecha', x: L / 2 + RADIO, y: c },
  ]
  for (const [lado, x0, s, texto] of [['i', 0, 1, 'izquierda'], ['d', L, -1, 'derecha']]) {
    const grupo = `Área de la ${texto}`
    lista.push(
      { ref: `area_${lado}_la`, grupo, nombre: `Área grande (${texto}): esquina en la línea de fondo, arriba`, x: x0, y: c - AREA.mitad },
      { ref: `area_${lado}_lb`, grupo, nombre: `Área grande (${texto}): esquina en la línea de fondo, abajo`, x: x0, y: c + AREA.mitad },
      { ref: `area_${lado}_fa`, grupo, nombre: `Área grande (${texto}): esquina del frente, arriba`, x: x0 + s * AREA.fondo, y: c - AREA.mitad },
      { ref: `area_${lado}_fb`, grupo, nombre: `Área grande (${texto}): esquina del frente, abajo`, x: x0 + s * AREA.fondo, y: c + AREA.mitad },
      { ref: `chica_${lado}_la`, grupo, nombre: `Área chica (${texto}): esquina en la línea de fondo, arriba`, x: x0, y: c - CHICA.mitad },
      { ref: `chica_${lado}_lb`, grupo, nombre: `Área chica (${texto}): esquina en la línea de fondo, abajo`, x: x0, y: c + CHICA.mitad },
      { ref: `chica_${lado}_fa`, grupo, nombre: `Área chica (${texto}): esquina del frente, arriba`, x: x0 + s * CHICA.fondo, y: c - CHICA.mitad },
      { ref: `chica_${lado}_fb`, grupo, nombre: `Área chica (${texto}): esquina del frente, abajo`, x: x0 + s * CHICA.fondo, y: c + CHICA.mitad },
      { ref: `penal_${lado}`, grupo, nombre: `Punto penal (${texto})`, x: x0 + s * PENAL, y: c },
    )
  }
  return lista
}

export const REFS = Object.freeze(puntosConocidos(CANCHA_POR_DEFECTO).map((p) => p.ref))

// ---------- Álgebra chica (matrices 3×3 como arreglos de 9) ----------
export function multiplicar(a, b) {
  const r = new Array(9).fill(0)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]
  return r
}

export function invertir(m) {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g
  const det = a * A + b * B + c * C
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null
  const inv = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det)
  return inv.every(Number.isFinite) ? inv : null
}

// Aplica la transformación a un punto: { x, y, w } o null si queda «en el infinito» (sobre el horizonte).
export function aplicar(H, p) {
  if (!H || !p) return null
  const w = H[6] * p.x + H[7] * p.y + H[8]
  if (!Number.isFinite(w) || Math.abs(w) < 1e-9) return null
  const x = (H[0] * p.x + H[1] * p.y + H[2]) / w
  const y = (H[3] * p.x + H[4] * p.y + H[5]) / w
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y, w } : null
}

// Normalización de Hartley: centro en el origen y distancia media √2 (la cuenta queda estable).
function normalizacion(puntos) {
  const n = puntos.length
  const cx = puntos.reduce((s, p) => s + p.x, 0) / n
  const cy = puntos.reduce((s, p) => s + p.y, 0) / n
  const media = puntos.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / n
  if (!(media > 1e-9)) return null
  const k = Math.SQRT2 / media
  return [k, 0, -k * cx, 0, k, -k * cy, 0, 0, 1]
}

// Sistema lineal chico por eliminación de Gauss con pivoteo parcial.
function resolver(A, b) {
  const n = b.length
  const M = A.map((fila, i) => [...fila, b[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let f = col + 1; f < n; f++) if (Math.abs(M[f][col]) > Math.abs(M[piv][col])) piv = f
    if (Math.abs(M[piv][col]) < 1e-10) return null
    ;[M[col], M[piv]] = [M[piv], M[col]]
    for (let f = col + 1; f < n; f++) {
      const k = M[f][col] / M[col][col]
      for (let c = col; c <= n; c++) M[f][c] -= k * M[col][c]
    }
  }
  const x = new Array(n).fill(0)
  for (let f = n - 1; f >= 0; f--) {
    let s = M[f][n]
    for (let c = f + 1; c < n; c++) s -= M[f][c] * x[c]
    x[f] = s / M[f][f]
  }
  return x.every(Number.isFinite) ? x : null
}

// Homografía que lleva cada `origen[i]` a `destino[i]` (4 o más pares; con más, por mínimos cuadrados).
export function homografia(origen, destino) {
  if (!Array.isArray(origen) || origen.length < 4 || origen.length !== destino.length) return null
  const To = normalizacion(origen), Td = normalizacion(destino)
  if (!To || !Td) return null
  const o = origen.map((p) => aplicar(To, p)), d = destino.map((p) => aplicar(Td, p))
  // Ecuaciones normales (AᵀA) h = Aᵀb con h33 = 1.
  const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0))
  const Atb = new Array(8).fill(0)
  const sumar = (fila, valor) => {
    for (let i = 0; i < 8; i++) {
      Atb[i] += fila[i] * valor
      for (let j = 0; j < 8; j++) AtA[i][j] += fila[i] * fila[j]
    }
  }
  for (let i = 0; i < o.length; i++) {
    const { x, y } = o[i], { x: u, y: v } = d[i]
    sumar([x, y, 1, 0, 0, 0, -u * x, -u * y], u)
    sumar([0, 0, 0, x, y, 1, -v * x, -v * y], v)
  }
  const h = resolver(AtA, Atb)
  if (!h) return null
  const TdInv = invertir(Td)
  if (!TdInv) return null
  const H = multiplicar(TdInv, multiplicar([...h, 1], To))
  if (!H.every(Number.isFinite) || Math.abs(H[8]) < 1e-12) return null
  return H.map((v) => v / H[8])
}

// Doble del área del triángulo (con signo).
const area2 = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

// ¿Hay 4 puntos sin 3 en línea? Si todos están casi en una o dos líneas, la cuenta no sirve.
function hayCuatroSueltos(puntos, tolerancia) {
  const n = puntos.length
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) {
    if (Math.abs(area2(puntos[a], puntos[b], puntos[c])) < tolerancia) continue
    for (let d = c + 1; d < n; d++) {
      const p = [puntos[a], puntos[b], puntos[c], puntos[d]]
      if ([[0, 1, 3], [0, 2, 3], [1, 2, 3]].every(([i, j, k]) => Math.abs(area2(p[i], p[j], p[k])) >= tolerancia)) return true
    }
  }
  return false
}

// Calcula una calibración: { ok, H (video → cancha), inversa (cancha → video), errores: [{ ref, error }], motivo }.
// error: distancia entre donde se marcó cada punto y donde lo pone la cuenta, en % del ancho del video.
export function resolverCalibracion(calibracion, cancha) {
  const conocidos = new Map(puntosConocidos(cancha).map((p) => [p.ref, p]))
  const pares = (calibracion?.puntos || []).filter((p) => conocidos.has(p.ref))
  if (pares.length < MINIMO_PUNTOS) {
    return { ok: false, motivo: `Faltan puntos: marcá al menos ${MINIMO_PUNTOS} (van ${pares.length}).`, errores: [] }
  }
  const video = pares.map((p) => ({ x: p.x, y: p.y }))
  const metros = pares.map((p) => ({ x: conocidos.get(p.ref).x, y: conocidos.get(p.ref).y }))
  if (!hayCuatroSueltos(metros, 4)) {
    return { ok: false, motivo: 'Los puntos elegidos están casi en una misma línea de la cancha. Sumá alguno de otra línea (por ejemplo, del área o del círculo).', errores: [] }
  }
  if (!hayCuatroSueltos(video, 1e-4)) {
    return { ok: false, motivo: 'Los puntos marcados en el video están muy juntos o en línea. Marcá puntos más separados.', errores: [] }
  }
  const H = homografia(video, metros)
  const inversa = H && invertir(H)
  if (!H || !inversa) return { ok: false, motivo: 'No se pudo calcular con esos puntos. Revisá que cada uno esté marcado en su lugar.', errores: [] }
  const errores = pares.map((p) => {
    const q = aplicar(inversa, conocidos.get(p.ref))
    return { ref: p.ref, error: q ? Math.round(Math.hypot(q.x - p.x, (q.y - p.y) * 9 / 16) * 1000) / 10 : 999 }
  })
  // Todos los puntos marcados tienen que quedar del mismo lado del horizonte.
  const signos = video.map((p) => Math.sign(H[6] * p.x + H[7] * p.y + H[8]))
  if (new Set(signos).size > 1) return { ok: false, motivo: 'Algún punto quedó cruzado (por ejemplo, izquierda por derecha). Revisá los puntos marcados.', errores }
  return { ok: true, H, inversa, errores, motivo: '' }
}

// Cada calibración se resuelve una vez (el dibujo es inmutable: cada cambio crea objetos nuevos).
const memoria = new WeakMap()
function resueltaDe(cal, cancha) {
  const clave = `${cancha.largo}x${cancha.ancho}`
  const previa = memoria.get(cal)
  if (previa && previa.clave === clave) return previa.r
  const r = resolverCalibracion(cal, cancha)
  memoria.set(cal, { clave, r })
  return r
}

export const estaCalibrado = (dibujo) => (dibujo?.calibraciones || []).some((c) => resueltaDe(c, medidasCancha(dibujo.cancha)).ok)

// La calibración válida más cercana al instante t: { cal, H, inversa } o null.
export function calibracionEn(dibujo, t) {
  const cancha = medidasCancha(dibujo?.cancha)
  let mejor = null
  for (const cal of dibujo?.calibraciones || []) {
    const r = resueltaDe(cal, cancha)
    if (!r.ok) continue
    const d = Math.abs(cal.t - t)
    if (!mejor || d < mejor.d) mejor = { d, cal, H: r.H, inversa: r.inversa }
  }
  return mejor && { cal: mejor.cal, H: mejor.H, inversa: mejor.inversa }
}

// Punto del video en t → metros de la cancha (o null sin calibración).
export function aCancha(dibujo, t, p) {
  const c = calibracionEn(dibujo, t)
  const q = c && aplicar(c.H, p)
  return q ? { x: q.x, y: q.y } : null
}

export const distanciaMetros = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null)
export const textoMetros = (m) => (Number.isFinite(m) ? `${m < 10 ? m.toFixed(1).replace('.', ',') : Math.round(m)} m` : '')

// ---------- Control de calidad: líneas de la cancha proyectadas sobre el video ----------
function arco(cx, cy, r, desde = 0, hasta = 2 * Math.PI, n = 48) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = desde + (hasta - desde) * i / n
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  })
}

// Líneas de la cancha (polilíneas en metros).
export function lineasCancha(cancha) {
  const { largo: L, ancho: W } = medidasCancha(cancha)
  const c = W / 2
  const lineas = [
    [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W }, { x: 0, y: W }, { x: 0, y: 0 }],
    [{ x: L / 2, y: 0 }, { x: L / 2, y: W }],
    arco(L / 2, c, RADIO),
  ]
  const medialuna = Math.acos((AREA.fondo - PENAL) / RADIO)
  for (const [x0, s] of [[0, 1], [L, -1]]) {
    lineas.push(
      [{ x: x0, y: c - AREA.mitad }, { x: x0 + s * AREA.fondo, y: c - AREA.mitad }, { x: x0 + s * AREA.fondo, y: c + AREA.mitad }, { x: x0, y: c + AREA.mitad }],
      [{ x: x0, y: c - CHICA.mitad }, { x: x0 + s * CHICA.fondo, y: c - CHICA.mitad }, { x: x0 + s * CHICA.fondo, y: c + CHICA.mitad }, { x: x0, y: c + CHICA.mitad }],
      s > 0 ? arco(x0 + PENAL, c, RADIO, -medialuna, medialuna, 16) : arco(x0 - PENAL, c, RADIO, Math.PI - medialuna, Math.PI + medialuna, 16),
    )
  }
  return lineas
}

// Proyecta las líneas al video (polilíneas de 0 a 1). Corta donde la línea pasa detrás del horizonte o muy lejos.
export function lineasEnVideo(inversa, cancha, pedazos = 24) {
  if (!inversa) return []
  const salida = []
  for (const linea of lineasCancha(cancha)) {
    let actual = []
    const cerrar = () => { if (actual.length > 1) salida.push(actual); actual = [] }
    const n = linea.length > 8 ? 1 : pedazos // los arcos ya vienen con muchos puntos
    for (let i = 0; i < linea.length - 1; i++) {
      const a = linea[i], b = linea[i + 1]
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        const q = aplicar(inversa, { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n })
        if (!q || q.w <= 0 || q.x < -1 || q.x > 2 || q.y < -1 || q.y > 2) { cerrar(); continue }
        actual.push({ x: q.x, y: q.y })
      }
    }
    cerrar()
  }
  return salida
}

// Calibración nueva en t: copia los puntos de la más cercana (para corregir solo los que cambiaron).
export function nuevaCalibracion(dibujo, t, id) {
  const cercana = (dibujo?.calibraciones || []).reduce((m, c) => (!m || Math.abs(c.t - t) < Math.abs(m.t - t) ? c : m), null)
  return { id, t: Math.round(t * 1000) / 1000, puntos: cercana ? cercana.puntos.map((p) => ({ ...p })) : [] }
}

// Marca (o vuelve a marcar) un punto conocido en el video.
export function marcarPunto(cal, ref, p) {
  if (!REFS.includes(ref)) return cal
  const punto = { ref, x: Math.round(Math.min(1, Math.max(0, p.x)) * 10000) / 10000, y: Math.round(Math.min(1, Math.max(0, p.y)) * 10000) / 10000 }
  const otros = cal.puntos.filter((q) => q.ref !== ref)
  if (otros.length >= MAXIMO_PUNTOS) return cal
  return { ...cal, puntos: [...otros, punto] }
}

export const quitarPunto = (cal, ref) => ({ ...cal, puntos: cal.puntos.filter((q) => q.ref !== ref) })
