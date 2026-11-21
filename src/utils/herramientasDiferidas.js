// Herramientas pesadas (PDF con jsPDF, Excel con SheetJS, imagen de la citación) que se bajan recién cuando se usan.
// Cada función tiene el mismo nombre y los mismos parámetros que la original: las pantallas solo cambian de dónde
// la importan. Si el archivo es de una versión vieja (después de un deploy), recarga una vez (cargaDiferida.js).
import { importarConRecarga } from './cargaDiferida'

function diferida(importador, nombre) {
  return (...args) => importarConRecarga(importador).then((modulo) => modulo[nombre](...args))
}

export const generarAsistenciaPDF = diferida(() => import('./generarAsistenciaPDF'), 'generarAsistenciaPDF')
export const generarBienestarPDF = diferida(() => import('./generarBienestarPDF'), 'generarBienestarPDF')
export const generarBienestarCategoriaPDF = diferida(() => import('./generarBienestarCategoriaPDF'), 'generarBienestarCategoriaPDF')
export const generarCMJIndividualPDF = diferida(() => import('./generarCMJPDF'), 'generarCMJIndividualPDF')
export const generarCMJCategoriaPDF = diferida(() => import('./generarCMJPDF'), 'generarCMJCategoriaPDF')
export const generarPlantelPDF = diferida(() => import('./generarPlantelPDF'), 'generarPlantelPDF')
export const generarCitacionPDF = diferida(() => import('./generarCitacion'), 'generarCitacionPDF')
export const generarImagenCitacion = diferida(() => import('./generarImagenCitacion'), 'generarImagenCitacion')
export const generarPerfilPDF = diferida(() => import('./generarPerfilPDF'), 'generarPerfilPDF')
export const generarRPEIndividualPDF = diferida(() => import('./generarRPEPDF'), 'generarRPEIndividualPDF')
export const generarRPECategoriaPDF = diferida(() => import('./generarRPEPDF'), 'generarRPECategoriaPDF')
export const generarSemaforoIndividualPDF = diferida(() => import('./generarSemaforoPDF'), 'generarSemaforoIndividualPDF')
export const generarSemaforoCategoriaPDF = diferida(() => import('./generarSemaforoPDF'), 'generarSemaforoCategoriaPDF')
export const exportarBackupCompleto = diferida(() => import('./exportarBackup'), 'exportarBackupCompleto')
