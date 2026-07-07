export function sanitizarNombreArchivo(nombre) {
  const sinTildes = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '')
  return sinTildes.replace(/[^a-zA-Z0-9._-]/g, '_')
}
