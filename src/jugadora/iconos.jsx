// Íconos de línea del portal de la jugadora. Toman el color del texto (currentColor) y son decorativos:
// el nombre de cada pestaña o estado ya está escrito al lado.
const TRAZOS = {
  inicio: <><path d="M4 11.5 12 5l8 6.5" /><path d="M6.5 10v9h11v-9" /><path d="M10 19v-5h4v5" /></>,
  wellness: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  numeros: <><path d="M5 20V12" /><path d="M10 20V5" /><path d="M15 20v-9" /><path d="M20 20V8" /></>,
  avisos: <><path d="M6.5 16V11a5.5 5.5 0 0 1 11 0v5l1.5 2h-14z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>,
  listo: <path d="m5 12.5 4.5 4.5L19 7.5" />,
}

function Icono({ nombre, className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {TRAZOS[nombre]}
    </svg>
  )
}

export default Icono
