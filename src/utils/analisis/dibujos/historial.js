// Deshacer / rehacer del editor de dibujos. Lógica pura: cada estado es un dibujo completo (son chicos).

export const LIMITE_HISTORIAL = 100

export function crearHistorial(presente, limite = LIMITE_HISTORIAL) {
  return { pasado: [], presente, futuro: [], limite }
}

// Un cambio nuevo: se puede deshacer; lo que estaba para rehacer se pierde.
export function aplicar(h, nuevo) {
  if (nuevo === h.presente) return h
  return { ...h, pasado: [...h.pasado, h.presente].slice(-h.limite), presente: nuevo, futuro: [] }
}

// Cambia el presente sin agregar un paso (mientras se arrastra: un arrastre entero es un solo paso).
export function reemplazar(h, nuevo) {
  return nuevo === h.presente ? h : { ...h, presente: nuevo }
}

export function deshacer(h) {
  if (!h.pasado.length) return h
  return { ...h, pasado: h.pasado.slice(0, -1), presente: h.pasado[h.pasado.length - 1], futuro: [h.presente, ...h.futuro] }
}

export function rehacer(h) {
  if (!h.futuro.length) return h
  return { ...h, pasado: [...h.pasado, h.presente].slice(-h.limite), presente: h.futuro[0], futuro: h.futuro.slice(1) }
}

export const puedeDeshacer = (h) => h.pasado.length > 0
export const puedeRehacer = (h) => h.futuro.length > 0
