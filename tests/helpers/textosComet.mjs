// Lee los textos (con su posición) de un PDF de COMET con pdfjs-dist en Node, igual que cometPdf.js en el navegador.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

export async function textosComet(ruta) {
  const pdfjs = await import(pathToFileURL(join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href)
  const { extraerTextos } = await import('../../src/utils/analisis/cometPdf.js')
  return extraerTextos(pdfjs, new Uint8Array(readFileSync(ruta)))
}
