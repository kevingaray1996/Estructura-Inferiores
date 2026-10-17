import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'

const ESCUDO_CLUB_URL =
  'https://qvjviyjkxyngiggoeqlj.supabase.co/storage/v1/object/public/Biblioteca/escudos/Escudo%20simplificado.png'

// Paleta del club (la misma que usa InicioSection.jsx)
const AMARILLO = '#F2C230'
const C = {
  fondoTarjeta: '#242422',
  borde: '#2C2C2A',
  texto: '#FFFFFF',
  textoSecundario: '#B4B2A9',
  textoMuted: '#8A8A82',
  acento: '#F2C230',
  exito: '#97C459',
  peligro: '#E24B4A',
}

// Deben coincidir con las listas del SQL (puede_evaluar / ve_todas_evaluaciones).
const ROLES_EVALUAN = ['tecnico', 'coordinacion', 'preparador_fisico']
const ROLES_VEN_TODO = ['coordinacion']

// Cambiar a true si querés habilitar la pestaña de final de temporada
const MOSTRAR_FINAL = false

const REC = {
  continuidad: 'Continuidad',
  a_evaluar: 'A evaluar',
  no_continuidad: 'No continuidad',
}
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/* ------------------------------ helpers ------------------------------ */

const hoyMes = () => {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}
const anioActual = () => new Date().getFullYear()
const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
const prom = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const f1 = (n) => (n == null ? '—' : n.toFixed(1))
const mismo = (a, b) => String(a) === String(b)
const nombreJ = (j) =>
  j.nombre_completo || [j.apellido, j.nombre].filter(Boolean).join(', ') || 'Jugadora ' + j.id
const num = (r, keys) => {
  for (const k of keys) {
    if (r[k] != null && r[k] !== '') return Number(r[k]) || 0
  }
  return 0
}

const armarNombres = (lista) => {
  const m = {}
  lista.forEach((e) => {
    if (e.evaluador_nombre) m[e.evaluador_id] = e.evaluador_nombre
  })
  return m
}

async function traerTodo(tabla) {
  let todo = []
  let desde = 0
  while (true) {
    const { data, error } = await supabase
      .from(tabla)
      .select('*')
      .order('id')
      .range(desde, desde + 999)
    if (error || !data) break
    todo = todo.concat(data)
    if (data.length < 1000) break
    desde += 1000
  }
  return todo
}

function resumenJugador(evals, criterios) {
  const porCrit = criterios.map((c) => {
    const vals = evals
      .map((e) => Number(e.puntajes && e.puntajes[c.id]))
      .filter((n) => n > 0)
    return { c, prom: prom(vals) }
  })
  const general = prom(porCrit.map((x) => x.prom).filter((n) => n != null))
  return { porCrit, general }
}

function calcStats(rows, jugadorId) {
  const mine = rows.filter((r) => mismo(r.jugador_id, jugadorId))
  const mins = (r) => num(r, ['minutos', 'minutos_jugados'])
  return {
    pj: mine.filter((r) => mins(r) > 0 || r.titular === true).length,
    titular: mine.filter((r) => r.titular === true).length,
    min: mine.reduce((a, r) => a + mins(r), 0),
    goles: mine.reduce((a, r) => a + num(r, ['goles']), 0),
    asist: mine.reduce((a, r) => a + num(r, ['asistencias']), 0),
    am: mine.reduce((a, r) => a + num(r, ['amarillas', 'tarjetas_amarillas']), 0),
    ro: mine.reduce((a, r) => a + num(r, ['rojas', 'tarjetas_rojas']), 0),
  }
}

function recPredominante(actuales) {
  const cuenta = {}
  actuales.forEach((e) => {
    if (e.recomendacion) cuenta[e.recomendacion] = (cuenta[e.recomendacion] || 0) + 1
  })
  const claves = Object.keys(cuenta)
  if (!claves.length) return '—'
  claves.sort((a, b) => cuenta[b] - cuenta[a])
  if (claves.length > 1 && cuenta[claves[0]] === cuenta[claves[1]]) return 'Dividida'
  return REC[claves[0]] || claves[0]
}

/* --------------------------- informes (HTML) --------------------------- */

const CSS = `
@page{size:A4;margin:12mm}
*{box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:16px;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.head{background:#111;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:14px;border-radius:8px 8px 0 0}
.head img.esc{width:56px;height:56px;object-fit:contain}
.head img.foto{width:64px;height:64px;border-radius:50%;object-fit:cover;margin-left:auto;border:2px solid ${AMARILLO}}
.head h1{margin:0;font-size:20px}
.head p{margin:2px 0 0;color:${AMARILLO};font-size:12px}
.franja{height:6px;background:${AMARILLO};margin-bottom:14px}
h2{font-size:13px;margin:16px 0 6px;padding-left:8px;border-left:4px solid ${AMARILLO};text-transform:uppercase;letter-spacing:.5px}
table{width:100%;border-collapse:collapse;margin-top:4px}
th{background:#111;color:${AMARILLO};text-align:left;padding:5px 6px;font-size:11px}
td{padding:5px 6px;border-bottom:1px solid #ddd}
.fila{display:flex;align-items:center;gap:8px;margin:4px 0}
.lab{width:170px}
.barra{flex:1;height:10px;background:#eee;border-radius:5px;overflow:hidden}
.barra i{display:block;height:100%;background:${AMARILLO}}
.kpis{display:flex;flex-wrap:wrap;gap:8px}
.kpi{border:1px solid #ddd;border-radius:6px;padding:6px 10px;text-align:center;min-width:70px}
.kpi b{display:block;font-size:16px}
.coment{border:1px solid #ddd;border-radius:6px;padding:8px;margin:6px 0;page-break-inside:avoid}
.coment p{margin:4px 0 0;white-space:pre-wrap}
.tag{background:${AMARILLO};padding:1px 7px;border-radius:10px;font-weight:700;font-size:10px;margin-left:6px}
.pie{margin-top:18px;color:#777;font-size:10px;text-align:center}
.vacio{color:#777;font-style:italic}
`

const docHtml = (titulo, cuerpo) =>
  '<!doctype html><html><head><meta charset="utf-8"><title>' +
  esc(titulo) +
  '</title><style>' +
  CSS +
  '</style></head><body>' +
  cuerpo +
  '</body></html>'

const cabecera = (escudo, titulo, sub, foto) =>
  '<div class="head">' +
  (escudo ? '<img class="esc" src="' + esc(escudo) + '" onerror="this.style.display=\'none\'">' : '') +
  '<div><h1>' + esc(titulo) + '</h1><p>' + esc(sub) + '</p></div>' +
  (foto ? '<img class="foto" src="' + esc(foto) + '" onerror="this.style.display=\'none\'">' : '') +
  '</div><div class="franja"></div>'

function svgLinea(puntos) {
  const W = 520
  const H = 150
  const P = 28
  const n = puntos.length
  const x = (i) => P + (n === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (n - 1))
  const y = (v) => H - P - (v / 5) * (H - 2 * P)
  const path = puntos
    .map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1))
    .join(' ')
  const puntosSvg = puntos
    .map(
      (p, i) =>
        '<circle cx="' + x(i).toFixed(1) + '" cy="' +
