import { COLORES as C } from '../theme'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'

const ESCUDO_CLUB_URL =
  'https://qvjviyjkxyngiggoeqlj.supabase.co/storage/v1/object/public/Biblioteca/escudos/Escudo%20simplificado.png'

const AMARILLO = '#F2C230'

// Paleta de pantalla; los generadores HTML conservan sus colores propios.

const ROLES_EVALUAN = ['tecnico', 'coordinacion', 'preparador_fisico']
const ROLES_VEN_TODO = ['tecnico', 'coordinacion', 'preparador_fisico', 'medico']

const REC = {
  continuidad: 'Continuidad',
  a_evaluar: 'A evaluar',
  no_continuidad: 'No continuidad',
}

const PUNTAJE_NO_EVALUADO = 'no_evaluo'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

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
      .map((e) => {
        const valor = e.puntajes && e.puntajes[c.id]

        if (valor === PUNTAJE_NO_EVALUADO || valor == null || valor === '') {
          return null
        }

        const n = Number(valor)
        return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null
      })
      .filter((n) => n != null)

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
    if (e.recomendacion) {
      cuenta[e.recomendacion] = (cuenta[e.recomendacion] || 0) + 1
    }
  })

  const claves = Object.keys(cuenta)

  if (!claves.length) return '—'

  claves.sort((a, b) => cuenta[b] - cuenta[a])

  if (claves.length > 1 && cuenta[claves[0]] === cuenta[claves[1]]) {
    return 'Dividida'
  }

  return REC[claves[0]] || claves[0]
}

/* ------------------------------ informes HTML ------------------------------ */

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
        '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="4" fill="#111"/>' +
        '<text x="' + x(i).toFixed(1) + '" y="' + (y(p.v) - 9).toFixed(1) + '" font-size="10" text-anchor="middle">' + p.v.toFixed(1) + '</text>' +
        '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" font-size="10" text-anchor="middle" fill="#555">' + esc(p.label) + '</text>'
    )
    .join('')

  return (
    '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%">' +
    '<line x1="' + P + '" y1="' + y(0) + '" x2="' + (W - P) + '" y2="' + y(0) + '" stroke="#ccc"/>' +
    '<line x1="' + P + '" y1="' + y(5) + '" x2="' + (W - P) + '" y2="' + y(5) + '" stroke="#eee"/>' +
    '<text x="4" y="' + (y(5) + 3) + '" font-size="10" fill="#777">5</text>' +
    '<text x="4" y="' + (y(0) + 3) + '" font-size="10" fill="#777">0</text>' +
    '<path d="' + path + '" fill="none" stroke="' + AMARILLO + '" stroke-width="3"/>' +
    puntosSvg +
    '</svg>'
  )
}

function htmlInforme({ j, criterios, evals, nombresEval, stats, escudo, modo, periodo, anio }) {
  const mias = evals.filter((e) => mismo(e.jugador_id, j.id))
  const periodoSel = modo === 'final' ? 'final-' + anio : periodo
  const anioRef = modo === 'final' ? anio : Number(String(periodo).slice(0, 4))
  const actuales = mias.filter((e) => e.periodo === periodoSel)
  const r = resumenJugador(actuales, criterios)
  const nombreEv = (id) => nombresEval[id] || 'Evaluador'

  const titulo = modo === 'final'
    ? 'Evaluación final de temporada ' + anio
    : 'Evaluación del período ' + periodo

  const foto = j.foto_url && String(j.foto_url).startsWith('http') ? j.foto_url : ''
  let cuerpo = cabecera(escudo, nombreJ(j), titulo + ' · Club Comunicaciones', foto)

  cuerpo += '<h2>Evaluación del cuerpo técnico</h2>'

  if (!actuales.length) {
    cuerpo += '<p class="vacio">Todavía no hay evaluaciones cargadas para este período.</p>'
  } else {
    cuerpo +=
      '<p><b>Promedio general: ' + f1(r.general) + ' / 5</b> · ' + actuales.length + ' evaluador(es)</p>'

    cuerpo += r.porCrit
      .map(
        (x) =>
          '<div class="fila"><span class="lab">' + esc(x.c.nombre) +
          '</span><div class="barra"><i style="width:' +
          (x.prom ? (x.prom / 5) * 100 : 0) +
          '%"></i></div><b>' + f1(x.prom) + '</b></div>'
      )
      .join('')

    cuerpo += '<h2>Detalle por evaluador</h2><table><tr><th>Evaluador</th>' +
      criterios.map((c) => '<th>' + esc(c.nombre) + '</th>').join('') + '</tr>' +
      actuales
        .map(
          (e) =>
            '<tr><td>' + esc(nombreEv(e.evaluador_id)) + '</td>' +
            criterios.map((c) => {
              const valor = e.puntajes && e.puntajes[c.id]
              const visible =
                valor === PUNTAJE_NO_EVALUADO
                  ? 'No evalúo'
                  : valor != null
                    ? valor
                    : '—'

              return '<td>' + esc(visible) + '</td>'
            }).join('') +
            '</tr>'
        )
        .join('') +
      '</table>'

    if (modo === 'final') {
      const cuenta = {}

      actuales.forEach((e) => {
        if (e.recomendacion) {
          cuenta[e.recomendacion] = (cuenta[e.recomendacion] || 0) + 1
        }
      })

      const txt = Object.keys(cuenta)
        .map((k) => (REC[k] || k) + ': ' + cuenta[k])
        .join(' · ')

      cuerpo += '<h2>Recomendación</h2><p>' +
        (txt ? esc(txt) : '<span class="vacio">Sin recomendaciones cargadas.</span>') +
        '</p>'
    }

    const coment = actuales
      .map((e) => {
        const partes = [
          ['Fortalezas', e.fortalezas],
          ['A mejorar', e.a_mejorar],
          ['Comentario', e.comentario],
          ['Proyección próxima temporada', e.proyeccion],
        ].filter((p) => p[1])

        const rec = e.recomendacion
          ? '<span class="tag">' + esc(REC[e.recomendacion] || e.recomendacion) + '</span>'
          : ''

        if (!partes.length && !rec) return ''

        return (
          '<div class="coment"><b>' + esc(nombreEv(e.evaluador_id)) + '</b>' + rec +
          partes.map((p) => '<p><u>' + p[0] + ':</u> ' + esc(p[1]) + '</p>').join('') +
          '</div>'
        )
      })
      .join('')

    if (coment) cuerpo += '<h2>Comentarios</h2>' + coment
  }

  const porMes = {}

  mias
    .filter((e) => !String(e.periodo).startsWith('final') && String(e.periodo).startsWith(String(anioRef)))
    .forEach((e) => {
      porMes[e.periodo] = porMes[e.periodo] || []
      porMes[e.periodo].push(e)
    })

  const puntos = Object.keys(porMes)
    .sort()
    .map((p) => ({
      label: MESES[Number(p.slice(5, 7)) - 1] || p,
      v: resumenJugador(porMes[p], criterios).general,
    }))
    .filter((p) => p.v != null)

  if (puntos.length) {
    cuerpo += '<h2>Evolución durante el año (promedio mensual)</h2>' + svgLinea(puntos)
  }

  if (modo === 'final') {
    const st = calcStats(stats, j.id)
    const kpi = (lab, v) => '<div class="kpi"><b>' + v + '</b>' + lab + '</div>'

    cuerpo +=
      '<h2>Rendimiento en la temporada</h2><div class="kpis">' +
      kpi('Partidos', st.pj) +
      kpi('Titular', st.titular) +
      kpi('Minutos', st.min) +
      kpi('Goles', st.goles) +
      kpi('Asistencias', st.asist) +
      kpi('Amarillas', st.am) +
      kpi('Rojas', st.ro) +
      '</div>'
  }

  cuerpo += '<div class="pie">Informe generado el ' +
    new Date().toLocaleDateString('es-AR') +
    ' · Uso interno del cuerpo técnico</div>'

  return docHtml('Informe ' + nombreJ(j), cuerpo)
}

function htmlPlantel({ jugadores, criterios, evals, stats, escudo, anio }) {
  const filas = jugadores
    .map((j) => {
      const actuales = evals.filter(
        (e) => mismo(e.jugador_id, j.id) && e.periodo === 'final-' + anio
      )
      const r = resumenJugador(actuales, criterios)

      return {
        j,
        n: actuales.length,
        g: r.general,
        st: calcStats(stats, j.id),
        rec: recPredominante(actuales),
      }
    })
    .sort((a, b) => (b.g == null ? -1 : b.g) - (a.g == null ? -1 : a.g))

  const cuerpo =
    cabecera(escudo, 'Evaluación final de temporada ' + anio, 'Resumen del plantel · Club Comunicaciones', '') +
    '<table><tr><th>Jugadora</th><th>Prom. final</th><th>Evaluadores</th><th>PJ</th><th>Min</th><th>Goles</th><th>Asist.</th><th>Recomendación</th></tr>' +
    filas
      .map(
        (f) =>
          '<tr><td>' + esc(nombreJ(f.j)) +
          '</td><td><b>' + f1(f.g) +
          '</b></td><td>' + f.n +
          '</td><td>' + f.st.pj +
          '</td><td>' + f.st.min +
          '</td><td>' + f.st.goles +
          '</td><td>' + f.st.asist +
          '</td><td>' + esc(f.rec) +
          '</td></tr>'
      )
      .join('') +
    '</table><div class="pie">Generado el ' +
    new Date().toLocaleDateString('es-AR') +
    ' · Uso interno del cuerpo técnico</div>'

  return docHtml('Resumen plantel ' + anio, cuerpo)
}

/* ------------------------------- estilos ------------------------------- */

const card = {
  background: C.fondoTarjeta,
  border: '1px solid ' + C.borde,
  borderRadius: 12,
  padding: 16,
}

const inputSt = {
  background: 'var(--evaluaciones-control-fondo, #fff)',
  color: 'var(--evaluaciones-control-texto, #111)',
  border: '1px solid var(--evaluaciones-control-borde, #ccc)',
  borderRadius: 8,
  padding: '8px 10px',
  width: '100%',
}

const btnPrim = {
  background: AMARILLO,
  color: '#111',
  fontWeight: 700,
  borderRadius: 8,
  padding: '8px 14px',
  border: 0,
  cursor: 'pointer',
}

const btnSec = {
  background: 'transparent',
  color: C.texto,
  border: '1px solid ' + C.borde,
  borderRadius: 8,
  padding: '8px 14px',
  cursor: 'pointer',
}

const etiqueta = {
  color: C.textoSecundario,
  fontSize: 13,
  marginBottom: 4,
  display: 'block',
}

/* ------------------------------ visor de informes ------------------------------ */

function Visor({ visor, onCerrar }) {
  const ref = useRef(null)

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      background: 'rgba(0,0,0,.88)',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', gap: 8, padding: 12, background: C.fondoTarjeta }}>
        <button
          type="button"
          style={btnPrim}
          onClick={() => {
            if (ref.current && ref.current.contentWindow) {
              ref.current.contentWindow.focus()
              ref.current.contentWindow.print()
            }
          }}
        >
          Imprimir / Guardar PDF
        </button>

        <button type="button" style={btnSec} onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      <iframe
        ref={ref}
        title={visor.titulo}
        srcDoc={visor.html}
        style={{
          flex: 1,
          border: 0,
          background: '#fff',
          margin: '0 12px 12px',
          borderRadius: 8,
        }}
      />
    </div>
  )
}

/* ------------------------------ panel de evaluación ------------------------------ */

function PanelEvaluar({ tipo, perfil, user, jugadores, criterios, evals, onGuardado }) {
  const [mes, setMes] = useState(hoyMes())
  const [anio, setAnio] = useState(anioActual())
  const [sel, setSel] = useState(null)
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState('')
  const [guardando, setGuardando] = useState(false)

  const esFinal = tipo === 'final'
  const periodo = esFinal ? 'final-' + anio : mes
  const mias = evals.filter((e) => e.evaluador_id === user.id && e.periodo === periodo)
  const hechas = mias.length

  function abrir(j) {
    const ex = mias.find((e) => mismo(e.jugador_id, j.id))

    setSel(j)
    setMsg('')

    setForm({
      puntajes: (ex && ex.puntajes) || {},
      fortalezas: (ex && ex.fortalezas) || '',
      a_mejorar: (ex && ex.a_mejorar) || '',
      comentario: (ex && ex.comentario) || '',
      recomendacion: (ex && ex.recomendacion) || '',
      proyeccion: (ex && ex.proyeccion) || '',
    })
  }

  function cambiarPeriodo(fn) {
    fn()
    setSel(null)
    setForm(null)
    setMsg('')
  }

  async function guardar() {
    const faltan = criterios.filter((c) => {
      const valor = form.puntajes[c.id]
      return valor == null || valor === ''
    })

    if (faltan.length) {
      setMsg('Falta puntuar o seleccionar «No evalúo»: ' + faltan.map((c) => c.nombre).join(', '))
      return
    }

    if (esFinal && !form.recomendacion) {
      setMsg('Elegí una recomendación para la próxima temporada')
      return
    }

    setGuardando(true)

    const fila = {
      jugador_id: sel.id,
      evaluador_id: user.id,
      evaluador_nombre: (perfil && perfil.nombre) || user.email,
      periodo,
      tipo: esFinal ? 'final' : 'periodica',
      puntajes: form.puntajes,
      fortalezas: form.fortalezas || null,
      a_mejorar: form.a_mejorar || null,
      comentario: form.comentario || null,
      recomendacion: esFinal ? form.recomendacion : null,
      proyeccion: esFinal ? form.proyeccion || null : null,
    }

    const { error } = await supabase
      .from('evaluaciones')
      .upsert(fila, { onConflict: 'jugador_id,evaluador_id,periodo' })

    setGuardando(false)

    if (error) {
      setMsg('Error al guardar: ' + error.message)
    } else {
      setMsg('Guardado ✓')
      await onGuardado()
    }
  }

  return (
    <div>
      <div style={{
        ...card,
        marginBottom: 16,
        display: 'flex',
        gap: 16,
        alignItems: 'flex-end',
        flexWrap: 'wrap',
      }}>
        {esFinal ? (
          <div>
            <label style={etiqueta}>Temporada (año)</label>
            <input
              type="number"
              style={{ ...inputSt, width: 120 }}
              value={anio}
              onChange={(e) => cambiarPeriodo(() => setAnio(Number(e.target.value)))}
            />
          </div>
        ) : (
          <div>
            <label style={etiqueta}>Mes</label>
            <input
              type="month"
              style={{ ...inputSt, width: 180 }}
              value={mes}
              onChange={(e) => cambiarPeriodo(() => setMes(e.target.value))}
            />
          </div>
        )}

        <div style={{ color: C.textoSecundario }}>
          Evaluadas por vos: <b style={{ color: C.texto }}>{hechas}</b> de {jugadores.length}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div style={card}>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {jugadores.map((j) => {
              const hecha = mias.some((e) => mismo(e.jugador_id, j.id))
              const activa = sel && mismo(sel.id, j.id)

              return (
                <button
                  type="button"
                  key={j.id}
                  onClick={() => abrir(j)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    marginBottom: 6,
                    borderRadius: 8,
                    border: '1px solid ' + (activa ? AMARILLO : C.borde),
                    background: 'transparent',
                    color: C.texto,
                    cursor: 'pointer',
                  }}
                >
                  <span>{nombreJ(j)}</span>
                  <span style={{ fontSize: 12, color: hecha ? C.exito : C.textoMuted }}>
                    {hecha ? 'Evaluada ✓' : 'Pendiente'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div style={card}>
          {!sel || !form ? (
            <p style={{ color: C.textoSecundario }}>Elegí una jugadora para evaluarla.</p>
          ) : (
            <div>
              <h3 style={{
                color: C.texto,
                fontWeight: 700,
                fontSize: 18,
                marginBottom: 12,
              }}>
                {nombreJ(sel)}
              </h3>

              {criterios.map((c) => (
                <div key={c.id} style={{ marginBottom: 14 }}>
                  <label style={etiqueta}>{c.nombre}</label>

                  <div style={{
                    display: 'flex',
                    gap: 6,
                    flexWrap: 'wrap',
                  }}>
                    {[1, 2, 3, 4, 5].map((n) => {
                      const activo = Number(form.puntajes[c.id]) === n

                      return (
                        <button
                          type="button"
                          key={n}
                         aria-label={`${c.nombre}: puntaje ${n}`}
                          aria-pressed={activo}
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              puntajes: { ...f.puntajes, [c.id]: n },
                            }))
                          }
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 8,
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: '1px solid ' + (activo ? AMARILLO : C.borde),
                            background: activo ? AMARILLO : 'transparent',
                            color: activo ? '#111' : C.texto,
                          }}
                        >
                          {n}
                        </button>
                      )
                    })}

                    <button
                      type="button"
                      aria-pressed={form.puntajes[c.id] === PUNTAJE_NO_EVALUADO}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          puntajes: {
                            ...f.puntajes,
                            [c.id]: PUNTAJE_NO_EVALUADO,
                          },
                        }))
                      }
                      style={{
                        minHeight: 40,
                        padding: '0 10px',
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: 'pointer',
                        border: '1px solid ' +
                          (form.puntajes[c.id] === PUNTAJE_NO_EVALUADO ? AMARILLO : C.borde),
                        background:
                          form.puntajes[c.id] === PUNTAJE_NO_EVALUADO ? AMARILLO : 'transparent',
                        color:
                          form.puntajes[c.id] === PUNTAJE_NO_EVALUADO ? '#111' : C.texto,
                      }}
                    >
                      No evalúo
                    </button>
                  </div>
                </div>
              ))}

              {[
                ['fortalezas', 'Fortalezas'],
                ['a_mejorar', 'A mejorar'],
                ['comentario', 'Comentario'],
              ].map(([k, lab]) => (
                <div key={k} style={{ marginBottom: 10 }}>
                  <label style={etiqueta}>{lab}</label>
                  <textarea
                    rows={2}
                    style={inputSt}
                    value={form[k]}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  />
                </div>
              ))}

              {esFinal && (
                <div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={etiqueta}>Recomendación para la próxima temporada</label>
                    <select
                      style={inputSt}
                      value={form.recomendacion}
                      onChange={(e) => setForm((f) => ({ ...f, recomendacion: e.target.value }))}
                    >
                      <option value="">— Elegir —</option>
                      <option value="continuidad">Continuidad</option>
                      <option value="a_evaluar">A evaluar</option>
                      <option value="no_continuidad">No continuidad</option>
                    </select>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <label style={etiqueta}>Rol y proyección para la próxima temporada</label>
                    <textarea
                      rows={2}
                      style={inputSt}
                      value={form.proyeccion}
                      onChange={(e) => setForm((f) => ({ ...f, proyeccion: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                style={btnPrim}
                onClick={guardar}
                disabled={guardando}
              >
                {guardando ? 'Guardando…' : 'Guardar evaluación'}
              </button>

              {msg && (
                <p style={{
                  marginTop: 8,
                  color: msg.startsWith('Guardado') ? C.exito : C.peligro,
                }}>
                  {msg}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ panel de informes ------------------------------ */

function PanelInformes({ jugadores, criterios, evals, nombresEval, escudo }) {
  const [modo, setModo] = useState('final')
  const [mes, setMes] = useState(hoyMes())
  const [anio, setAnio] = useState(anioActual())
  const [stats, setStats] = useState([])
  const [visor, setVisor] = useState(null)

  useEffect(() => {
    traerTodo('estadisticas_jugador').then(setStats)
  }, [])

  const periodoSel = modo === 'final' ? 'final-' + anio : mes
  const delPeriodo = evals.filter((e) => e.periodo === periodoSel)

  const filas = jugadores
    .map((j) => {
      const act = delPeriodo.filter((e) => mismo(e.jugador_id, j.id))
      const r = resumenJugador(act, criterios)
      return { j, n: act.length, r, rec: recPredominante(act) }
    })
    .sort((a, b) => (b.r.general == null ? -1 : b.r.general) - (a.r.general == null ? -1 : a.r.general))

  const avance = {}

  delPeriodo.forEach((e) => {
    avance[e.evaluador_id] = avance[e.evaluador_id] || new Set()
    avance[e.evaluador_id].add(String(e.jugador_id))
  })

  const abrirInforme = (j) =>
    setVisor({
      titulo: 'Informe ' + nombreJ(j),
      html: htmlInforme({
        j,
        criterios,
        evals,
        nombresEval,
        stats,
        escudo,
        modo,
        periodo: mes,
        anio,
      }),
    })

  const abrirPlantel = () =>
    setVisor({
      titulo: 'Resumen plantel',
      html: htmlPlantel({ jugadores, criterios, evals, stats, escudo, anio }),
    })

  const th = {
    textAlign: 'left',
    padding: '8px 6px',
    color: C.textoSecundario,
    fontSize: 12,
    borderBottom: '1px solid ' + C.borde,
  }

  const td = {
    padding: '8px 6px',
    borderBottom: '1px solid ' + C.borde,
    color: C.texto,
    fontSize: 14,
  }

  return (
    <div>
      <div style={{
        ...card,
        marginBottom: 16,
        display: 'flex',
        gap: 16,
        alignItems: 'flex-end',
        flexWrap: 'wrap',
      }}>
        <div>
          <label style={etiqueta}>Tipo</label>
          <select
            style={{ ...inputSt, width: 200 }}
            value={modo}
            onChange={(e) => setModo(e.target.value)}
          >
            <option value="final">Final de temporada</option>
            <option value="mensual">Mensual</option>
          </select>
        </div>

        {modo === 'final' ? (
          <div>
            <label style={etiqueta}>Temporada (año)</label>
            <input
              type="number"
              style={{ ...inputSt, width: 120 }}
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
            />
          </div>
        ) : (
          <div>
            <label style={etiqueta}>Mes</label>
            <input
              type="month"
              style={{ ...inputSt, width: 180 }}
              value={mes}
              onChange={(e) => setMes(e.target.value)}
            />
          </div>
        )}

        {modo === 'final' && (
          <button type="button" style={btnPrim} onClick={abrirPlantel}>
            Resumen del plantel (PDF)
          </button>
        )}
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{
          color: C.textoSecundario,
          fontSize: 13,
          marginBottom: 6,
        }}>
          Avance por evaluador
        </div>

        {Object.keys(avance).length === 0 ? (
          <span style={{ color: C.textoMuted }}>
            Todavía no hay evaluaciones en este período.
          </span>
        ) : (
          Object.keys(avance).map((id) => (
            <div key={id} style={{ color: C.texto }}>
              {nombresEval[id] || 'Evaluador'}: {avance[id].size}/{jugadores.length} jugadoras
            </div>
          ))
        )}
      </div>

      <div style={{ ...card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Jugadora</th>
              <th style={th}>Eval.</th>
              <th style={th}>Prom.</th>

              {criterios.map((c) => (
                <th key={c.id} style={th}>{c.nombre}</th>
              ))}

              {modo === 'final' && <th style={th}>Recomendación</th>}
              <th style={th}></th>
            </tr>
          </thead>

          <tbody>
            {filas.map((f) => (
              <tr key={f.j.id}>
                <td style={td}>{nombreJ(f.j)}</td>
                <td style={td}>{f.n}</td>
                <td style={{ ...td, fontWeight: 700 }}>{f1(f.r.general)}</td>

                {f.r.porCrit.map((x) => (
                  <td key={x.c.id} style={td}>{f1(x.prom)}</td>
                ))}

                {modo === 'final' && <td style={td}>{f.rec}</td>}

                <td style={td}>
                  <button
                    type="button"
                    style={btnSec}
                    onClick={() => abrirInforme(f.j)}
                  >
                    Informe
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visor && <Visor visor={visor} onCerrar={() => setVisor(null)} />}
    </div>
  )
}

/* ------------------------------ componente principal ------------------------------ */

export default function EvaluacionesSection({ perfil }) {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [user, setUser] = useState(null)
  const [jugadores, setJugadores] = useState([])
  const [criterios, setCriterios] = useState([])
  const [evals, setEvals] = useState([])
  const [nombresEval, setNombresEval] = useState({})
  const [tab, setTab] = useState('')

  const escudo = ESCUDO_CLUB_URL
  const rol = (perfil && perfil.rol) || ''

  async function cargar() {
    setCargando(true)
    setError('')

    const { data: ud } = await supabase.auth.getUser()
    const u = ud && ud.user

    if (!u) {
      setError('No hay una sesión iniciada.')
      setCargando(false)
      return
    }

    setUser(u)

    const c = await supabase
      .from('evaluacion_criterios')
      .select('*')
      .eq('activo', true)
      .order('orden')

    if (c.error) {
      setError('Error al cargar los criterios: ' + c.error.message + ' (¿ya corriste el SQL en Supabase?)')
      setCargando(false)
      return
    }

    let lista = []

    try {
      const categoriaPrimera = await obtenerCategoriaPrimeraDivision()

      if (categoriaPrimera) {
        const { data: categoriasData } = await supabase
          .from('categorias')
          .select('id, es_reserva')

        const res = await obtenerJugadoresDeCategoria(
          supabase,
          categoriaPrimera.id,
          categoriasData
        )

        lista = (res && res.data) || []
      }
    } catch (e) {
      lista = []
    }

    if (!lista.length) {
      const { data } = await supabase.from('jugadores').select('*')
      lista = data || []
    }

    setJugadores([...lista].sort((a, b) => nombreJ(a).localeCompare(nombreJ(b))))
    setCriterios(c.data || [])

    const todas = await traerTodo('evaluaciones')
    setEvals(todas)
    setNombresEval(armarNombres(todas))
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (cargando) {
    return <p style={{ color: C.textoSecundario }}>Cargando…</p>
  }

  if (error) {
    return <p style={{ color: C.peligro }}>{error}</p>
  }

  const puedeEvaluar = ROLES_EVALUAN.includes(rol)
  const verTodo = ROLES_VEN_TODO.includes(rol)
  const tabs = []

  if (puedeEvaluar) {
    tabs.push(['mensual', 'Evaluación mensual'])
    tabs.push(['final', 'Final de temporada'])
  }

  if (verTodo) {
    tabs.push(['informes', 'Informes'])
  }

  const activa = tab || (tabs[0] && tabs[0][0])

  if (!tabs.length) {
    return <p style={{ color: C.textoSecundario }}>Tu rol no tiene acceso a las evaluaciones.</p>
  }

  const recargarEvals = async () => {
    const todas = await traerTodo('evaluaciones')
    setEvals(todas)
    setNombresEval(armarNombres(todas))
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 style={{
        color: C.texto,
        fontSize: 24,
        fontWeight: 700,
        marginBottom: 12,
      }}>
        Evaluaciones
      </h1>

      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 16,
        flexWrap: 'wrap',
      }}>
        {tabs.map(([id, lab]) => (
          <button
            type="button"
            key={id}
            onClick={() => setTab(id)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
              border: '1px solid ' + (activa === id ? AMARILLO : C.borde),
              background: activa === id ? AMARILLO : 'transparent',
              color: activa === id ? '#111' : C.texto,
            }}
          >
            {lab}
          </button>
        ))}
      </div>

      {activa === 'mensual' && (
        <PanelEvaluar
          tipo="mensual"
          perfil={perfil}
          user={user}
          jugadores={jugadores}
          criterios={criterios}
          evals={evals}
          onGuardado={recargarEvals}
        />
      )}

      {activa === 'final' && (
        <PanelEvaluar
          tipo="final"
          perfil={perfil}
          user={user}
          jugadores={jugadores}
          criterios={criterios}
          evals={evals}
          onGuardado={recargarEvals}
        />
      )}

      {activa === 'informes' && (
        <PanelInformes
          jugadores={jugadores}
          criterios={criterios}
          evals={evals}
          nombresEval={nombresEval}
          escudo={escudo}
        />
      )}
    </div>
  )
}
