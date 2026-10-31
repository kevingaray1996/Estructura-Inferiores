// Iconos locales de navegación: sin fuentes, emojis ni dependencias externas.
const TRAZOS = {
  inicio: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  plantel: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 7M22 21v-2a4 4 0 0 0-3-3.9',
  medicos: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z',
  video: 'M3 4h18v16H3ZM10 8l6 4-6 4Z',
  analisis: 'M4 3v18h17M8 17v-5M13 17V8M18 17V5',
  partidos: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7l5 4-2 6H9l-2-6ZM12 7V3M17 11l4-1M15 17l2 3M9 17l-2 3M7 11l-4-1',
  calendario: 'M4 5h16v16H4ZM8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 17h2',
  entrenamientos: 'M3 8v8M7 5v14M17 5v14M21 8v8M7 12h10',
  planificacion: 'M4 4h16v17H4ZM8 2v4M16 2v4M8 10h8M8 14h8M8 18h4',
  asistencia: 'M9 3H4v18h16V3h-5M9 2h6v4H9ZM8 13l3 3 5-6',
  fisico: 'M2 12h5l3-8 4 16 3-8h5',
  captacion: 'M21 12a9 9 0 1 1-9-9M17 12a5 5 0 1 1-5-5M12 12l9-9M17 3h4v4',
  pases: 'M3 7h17l-4-4M21 17H4l4 4M20 7l-4 4M4 17l4-4',
  informes: 'M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8M8 16h8',
  usuarios: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2',
  evaluaciones: 'M9 6h12M9 12h12M9 18h12M2 5l2 2 3-4M2 11l2 2 3-4M2 17l2 2 3-4',
  bienestar: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  nutricion: 'M12 7c-7-6-13 5-6 13 2 2 4-1 6 0 2-1 4 2 6 0 7-8 1-19-6-13ZM12 7V3l4-1',
  psicologia: 'M9 21v-3H6a2 2 0 0 1-2-2v-3H2l3-5a8 8 0 1 1 14 8v5M9 8h6M12 5v6',
  representantes: 'M3 7h18v14H3ZM8 7V3h8v4M3 12h18M10 12v3h4v-3',
  pensiones: 'M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7',
  seleccion: 'm12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',
  contratos: 'M13 3H4v18h16v-9M9 15l1-4 8-8 3 3-8 8ZM16 5l3 3',
  buscar: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0ZM15 15l6 6',
  enlace: 'M10 13a5 5 0 0 0 7 0l4-4a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-4 4a5 5 0 0 0 7 7l2-2',
  salir: 'M9 3H3v18h6M9 12h12M16 7l5 5-5 5',
  expandir: 'm8 6 6 6-6 6M18 4v16',
  plegar: 'm16 6-6 6 6 6M6 4v16',
  cerrar: 'm6 6 12 12M6 18 18 6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  apariencia: 'M12 3a9 9 0 1 0 0 18ZM12 3a9 9 0 0 1 0 18',
}

export default function IconoNavegacion({ nombre, size = 20, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
    <path d={TRAZOS[nombre] || TRAZOS.inicio} />
  </svg>
}
