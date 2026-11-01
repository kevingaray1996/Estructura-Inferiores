import { esComunicaciones as identificarComunicaciones, resumenComunicaciones } from '../utils/datafem'

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { PALETA_INICIO as C, textoInicio } from '../appearance/paletaInicio'

const TABLAS = [
  { key: 'zona_a', titulo: 'Zona A', icono: '🟡' },
  { key: 'zona_b', titulo: 'Zona B', icono: '⚽' },
  { key: 'general', titulo: 'Tabla General', icono: '🏆' },
]

function fechaActualizacion(fecha) {
  if (!fecha) return 'Todavía sin fecha registrada'

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(fecha))
}

export function TablaPosiciones({ titulo, filas = [], destacarComunicaciones = false }) {
  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ background: C.fondo, border: `1px solid ${C.borde}` }}
    >
      <div
        className="px-4 py-3 font-bold"
        style={{
          color: textoInicio(C.amarillo),
          background: C.amarilloSuave,
          borderBottom: `1px solid ${C.borde}`,
        }}
      >
        {titulo}
      </div>

      {filas.length === 0 ? (
        <p className="p-4 text-sm" style={{ color: C.tenue }}>
          No hay posiciones disponibles.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: C.tenue, borderBottom: `1px solid ${C.borde}` }}>
                {['Pos.', 'Equipo', 'Pts', 'PJ', 'PG', 'PE', 'PP', 'DG'].map((col) => (
                  <th key={col} className="px-3 py-3 text-center whitespace-nowrap font-semibold">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, indice) => {
                const esComunicaciones =
                  destacarComunicaciones &&
                  identificarComunicaciones(fila.equipo)

                return (
                  <tr
                    key={`${fila.equipo}-${indice}`}
                    style={{
                      color: esComunicaciones ? textoInicio(C.amarillo) : C.blanco,
                      background: esComunicaciones ? C.amarilloSuave : 'transparent',
                      borderBottom: `1px solid ${C.borde}`,
                      fontWeight: esComunicaciones ? 800 : 400,
                    }}
                  >
                    <td className="px-3 py-3 text-center">{fila.posicion ?? '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {esComunicaciones && '★ '}
                      {fila.equipo || '—'}
                    </td>
                    <td className="px-3 py-3 text-center font-bold">{fila.puntos ?? '—'}</td>
                    <td className="px-3 py-3 text-center">{fila.partidos ?? '—'}</td>
                    <td className="px-3 py-3 text-center">{fila.ganados ?? '—'}</td>
                    <td className="px-3 py-3 text-center">{fila.empatados ?? '—'}</td>
                    <td className="px-3 py-3 text-center">{fila.perdidos ?? '—'}</td>
                    <td className="px-3 py-3 text-center">{fila.diferencia ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function TablaDataFem({ compacto = false }) {
  const [expandido, setExpandido] = useState(false)
  const [datos, setDatos] = useState(null)
  const resumen = resumenComunicaciones(datos)
  const partidos = resumen && datos?.[resumen.zona === 'Zona A' ? 'zona_a' : 'zona_b']
    ?.find(fila => identificarComunicaciones(fila.equipo))?.partidos
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true

    async function cargarTablas() {
      const { data, error: errorConsulta } = await supabase
        .from('datafem_tablas')
        .select('zona_a, zona_b, general, updated_at, source_url')
        .eq('id', 1)
        .maybeSingle()

      if (!activo) return

      if (errorConsulta) {
        console.error('Error al cargar las tablas de DataFem:', errorConsulta)
        setError('No se pudieron cargar las tablas. Revisá los permisos de Supabase.')
      } else if (!data) {
        setError('Todavía no hay tablas guardadas en Supabase.')
      } else {
        setDatos(data)
        setError('')
      }

      setCargando(false)
    }

    cargarTablas()

    return () => {
      activo = false
    }
  }, [])

  return (
    <section className={`inicio-bloque${compacto ? ' inicio-datafem-compacta' : ''}`} aria-label="Posiciones DataFem">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
            style={{
              background: C.amarilloSuave,
              border: `1px solid ${C.amarillo}35`,
            }}
          >
            🏆
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-bold" style={{ color: C.blanco }}>
              Primera B · Fútbol femenino
            </h2>
            <p className="text-sm mt-0.5" style={{ color: C.tenue }}>
              Tablas de posiciones de DataFem
            </p>
          </div>
        </div>

        <a
          href={datos?.source_url || 'https://datafem.com.ar/primera-b'}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-bold hover:underline"
          style={{ color: textoInicio(C.amarillo) }}
        >
          Ver en DataFem ↗
        </a>
      </div>

      <div
        className="rounded-2xl p-4 md:p-5"
        style={{ background: C.tarjeta, border: `1px solid ${C.borde}` }}
      >
        {cargando ? (
          <p className="py-6 text-center" style={{ color: C.gris }}>
            Cargando tablas de posiciones…
          </p>
        ) : error ? (
          <p className="py-6 text-center text-sm" style={{ color: textoInicio('#F07171') }}>
            {error}
          </p>
        ) : (
          <>
            <div className="inicio-datafem-resumen">
              {resumen ? <><span>{resumen.zona}</span><span>Posición <strong>{resumen.posicion}</strong></span><span>Puntos <strong>{resumen.puntos}</strong></span>{compacto && partidos != null && <span>Jugados <strong>{partidos}</strong></span>}</> :
                <p className="text-sm">No se pudo identificar inequívocamente la posición de Comunicaciones.</p>}
              <button type="button" className="inicio-enlace" aria-expanded={expandido} aria-controls="inicio-datafem-tablas"
                onClick={() => setExpandido(v => !v)}>{expandido ? 'Contraer posiciones' : 'Ver todas las posiciones'}</button>
            </div>
            {expandido && <div id="inicio-datafem-tablas" className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
              {TABLAS.map((tabla) => (
                <TablaPosiciones
                  key={tabla.key}
                  titulo={`${tabla.icono} ${tabla.titulo}`}
                  filas={datos?.[tabla.key] || []}
                  destacarComunicaciones={true}
                />
              ))}
            </div>}

            <div
              className="mt-4 pt-4 flex flex-wrap items-center justify-between gap-2 text-xs"
              style={{ color: C.tenue, borderTop: `1px solid ${C.borde}` }}
            >
              <span>{resumen ? '★ Comunicaciones · ' + resumen.zona : 'Fuente: DataFem'}</span>
              <span>Última actualización: {fechaActualizacion(datos?.updated_at)}</span>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
