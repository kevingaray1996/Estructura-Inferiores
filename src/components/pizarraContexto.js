import { createContext } from 'react'

// Id del degradé de brillo de la cancha donde se dibuja una ficha (lo provee PizarraCancha).
// Sin cancha (íconos de la paleta), las fichas se dibujan planas.
export const ContextoCancha = createContext(null)
