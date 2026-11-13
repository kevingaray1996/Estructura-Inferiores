// Arma supabase/esquema/esquema_real.sql a partir de los CSV exportados con consultas_exportar.sql.
//
// Uso (desde la raíz del repo):
//   node supabase/esquema/armar_esquema.mjs [carpeta de los CSV] [fecha de la exportación AAAA-MM-DD]
// Por defecto lee supabase/auditoria-seguridad (fuera de git) y usa la fecha de hoy.
//
// Controla que cada CSV esté completo (cantidad declarada y "-- fin eN") y frena si encuentra algo que parezca
// un dato sensible (emails, tokens, claves). El repo es público: el archivo generado no puede tener datos.
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const carpeta = process.argv[2] || join(aqui, '..', 'auditoria-seguridad')
const fecha = process.argv[3] || new Date().toISOString().slice(0, 10)

// Orden para que el archivo se pueda leer (y rearmar) de arriba hacia abajo.
export const SECCIONES = [
  ['e1', 'Esquemas, extensiones, tipos y secuencias'],
  ['e2', 'Tablas: columnas, restricciones, RLS activado, secuencias asociadas y comentarios'],
  ['e3', 'Índices (los que no salen de una clave primaria o única)'],
  ['e5', 'Funciones y procedimientos'],
  ['e4', 'Vistas'],
  ['e6', 'Triggers'],
  ['e7a', 'Políticas RLS (esquemas propios y storage)'],
  ['e7b', 'Configuración de los buckets de Storage'],
  ['e8', 'Dueños, permisos (GRANT) y privilegios por defecto'],
]

// CSV estándar (RFC 4180): comillas dobles, comillas escapadas y saltos de línea dentro de los campos.
export function leerCsv(texto) {
  const filas = []
  let campo = '', fila = [], entreComillas = false
  texto = texto.replace(/^﻿/, '')
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') entreComillas = false
      else campo += c
    } else if (c === '"') entreComillas = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo); filas.push(fila); fila = []; campo = ''
    } else campo += c
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila) }
  return filas
}

export function leerSeccion(clave, texto) {
  const filas = leerCsv(texto)
  if (filas[0]?.length !== 1 || filas[0][0] !== 'ddl') throw new Error(`${clave}: la primera fila tiene que ser "ddl"`)
  const lineas = filas.slice(1).map(f => {
    if (f.length !== 1) throw new Error(`${clave}: se esperaba una sola columna`)
    return f[0]
  })
  const cabecera = lineas[0]?.match(new RegExp(`^-- ${clave}: (\\d+) (sentencias|buckets)`))
  if (!cabecera) throw new Error(`${clave}: falta la fila con la cantidad`)
  if (lineas.at(-1) !== `-- fin ${clave}`) throw new Error(`${clave}: falta "-- fin ${clave}" (¿CSV cortado?)`)
  const cuerpo = lineas.slice(1, -1)
  if (cuerpo.length !== Number(cabecera[1])) throw new Error(`${clave}: dice ${cabecera[1]} y hay ${cuerpo.length}`)
  return { cabecera: lineas[0], cuerpo }
}

// e7b trae cada bucket como JSON; se convierte en el INSERT equivalente.
export function bucketComoSql(linea) {
  const b = JSON.parse(linea)
  const lit = v => v === null ? 'NULL' : "'" + String(v).replaceAll("'", "''") + "'"
  const tipos = b.allowed_mime_types === null ? 'NULL' : 'ARRAY[' + b.allowed_mime_types.map(lit).join(', ') + ']::text[]'
  return `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)\n  VALUES (${lit(b.id)}, ${lit(b.name)}, ${b.public}, ${b.file_size_limit ?? 'NULL'}, ${tipos})\n  ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;`
}

// Lo que no puede entrar a un repo público.
export const PATRONES_SENSIBLES = [
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  ['token JWT', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['clave de API', /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}|\bsb_(secret|publishable)_[A-Za-z0-9_-]{8,}/g],
  ['contraseña escrita', /(password|contrase[nñ]a|passwd|secret)\s*(=|:=|:)\s*'[^']+'/gi],
  ['URL con credenciales', /[a-z]+:\/\/[^/\s:@]+:[^/\s@]+@/gi],
  ['hash bcrypt', /\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}/g],
]

// Los UUID escritos en el código (por ejemplo, las cuentas administradoras de Análisis en
// puede_administrar_analisis) son filas de auth.users u otras tablas: se reemplazan por marcadores numerados.
// gen_random_uuid() y los tipos uuid no se tocan; solo los valores fijos.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
export function ocultarUuids(texto) {
  const vistos = new Map()
  const salida = texto.replace(UUID, uuid => {
    const clave = uuid.toLowerCase()
    if (!vistos.has(clave)) vistos.set(clave, `00000000-0000-4000-8000-${String(vistos.size + 1).padStart(12, '0')}`)
    return vistos.get(clave)
  })
  return { salida, cantidad: vistos.size }
}

export function buscarSensibles(texto) {
  const hallazgos = []
  for (const [tipo, patron] of PATRONES_SENSIBLES) for (const m of texto.matchAll(patron)) hallazgos.push(`${tipo}: ${m[0]}`)
  return hallazgos
}

export function armar(leer, fechaExportacion) {
  const partes = [
    '-- =====================================================================================================',
    '-- ESQUEMA REAL DE LA BASE (Supabase) — solo estructura, SIN DATOS',
    `-- Exportado de la base de producción el ${fechaExportacion} con supabase/esquema/consultas_exportar.sql`,
    '-- y armado con supabase/esquema/armar_esquema.mjs. Ver supabase/esquema/README.md.',
    '--',
    '-- Es la referencia de cómo está la base. No es una migración: no correrlo sobre producción.',
    '-- Incluye los esquemas propios (public y los *_privado), las políticas de storage y la configuración de',
    '-- los buckets. No incluye auth, storage (salvo políticas), realtime ni ningún otro esquema de Supabase.',
    '-- Los nombres de public aparecen sin prefijo porque se exportó con el search_path del editor de Supabase.',
    '-- =====================================================================================================',
    '',
    'SET check_function_bodies = off;',
    'SET search_path = public, extensions;',
  ]
  const resumen = []
  for (const [clave, titulo] of SECCIONES) {
    const { cabecera, cuerpo } = leerSeccion(clave, leer(clave))
    const sentencias = clave === 'e7b' ? cuerpo.map(bucketComoSql) : cuerpo
    resumen.push(`${titulo}: ${cuerpo.length}`)
    partes.push('', '', `-- ${'='.repeat(100)}`, `-- ${titulo}`, `-- (${cabecera.replace(/^-- /, '')})`, `-- ${'='.repeat(100)}`, '')
    partes.push(...sentencias.map(s => s.replace(/\r\n/g, '\n')))
  }
  const { salida, cantidad } = ocultarUuids(partes.join('\n') + '\n')
  const aviso = cantidad
    ? `-- Los ${cantidad} UUID fijos que aparecen en el código de la base (IDs de cuentas o filas) se reemplazaron por\n` +
      `-- marcadores 00000000-0000-4000-8000-00000000000N. Los valores reales están solo en la base.\n`
    : ''
  const texto = salida.replace('\nSET check_function_bodies', `\n${aviso}SET check_function_bodies`)
  if (cantidad) resumen.push(`UUID fijos reemplazados por marcadores: ${cantidad}`)
  return { texto, resumen, sensibles: buscarSensibles(texto) }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { texto, resumen, sensibles } = armar(clave => readFileSync(join(carpeta, `${clave}.csv`), 'utf8'), fecha)
  if (sensibles.length) {
    console.error('Se encontraron posibles datos sensibles. No se escribió nada:\n  ' + sensibles.join('\n  '))
    process.exit(1)
  }
  writeFileSync(join(aqui, 'esquema_real.sql'), texto)
  console.log('esquema_real.sql generado:\n  ' + resumen.join('\n  '))
}
