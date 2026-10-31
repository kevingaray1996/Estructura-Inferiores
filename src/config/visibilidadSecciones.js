// Solo visibilidad de navegación; no reemplaza ni modifica permisos.
// Cambiar a true para volver a mostrar una sección con sus accesos existentes.
export const VISIBILIDAD_SECCIONES = Object.freeze({
  representantes: false,
  pensiones: false,
  seleccion: false,
  contratos: false,
  psicologia: false,
  nutricion: false,
})

export const esSeccionVisible = id => VISIBILIDAD_SECCIONES[id] !== false
export const resolverSeccionVisible = id => esSeccionVisible(id) ? id : 'inicio'
export const filtrarSeccionesVisibles = (items, clave = 'seccion') => items.filter(item => esSeccionVisible(item[clave]))
