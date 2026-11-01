import './panelDeportivo.css'

const ESTADOS = {
  cargando: { titulo: 'Cargando', mensaje: 'Estamos consultando la información.' },
  vacio: { titulo: 'Sin registros', mensaje: 'Todavía no hay registros para mostrar.' },
  error: { titulo: 'No se pudo cargar', mensaje: 'Ocurrió un error al consultar la información.' },
  denegado: { titulo: 'Acceso denegado', mensaje: 'Tu cuenta no tiene acceso a esta información.' },
  insuficiente: { titulo: 'Datos insuficientes', mensaje: 'No hay información suficiente para mostrar este indicador.' },
}

/** No identifica errores ni decide permisos: recibe un estado explícito del padre. */
export default function EstadoContenido({ estado = 'vacio', titulo, mensaje, onReintentar, textoReintento = 'Reintentar', reintentando = false, children }) {
  const configuracion = ESTADOS[estado] || ESTADOS.error
  const esError = estado === 'error' || estado === 'denegado' || !ESTADOS[estado]
  return <div className="dp-estado" data-estado={ESTADOS[estado] ? estado : 'error'}>
    <div role={esError ? 'alert' : 'status'} aria-live={esError ? 'assertive' : 'polite'} aria-atomic="true">
      <p className="dp-estado-titulo">{titulo || configuracion.titulo}</p>
      <p className="dp-descripcion">{mensaje || configuracion.mensaje}</p>
    </div>
    {children}
    {onReintentar && <button className="dp-boton" type="button" onClick={onReintentar} disabled={reintentando} aria-busy={reintentando}>
      {reintentando ? 'Reintentando…' : textoReintento}
    </button>}
  </div>
}
