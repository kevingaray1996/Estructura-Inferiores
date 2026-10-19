
import { useState } from 'react'

const AMARILLO = '#F2C230'
const PANEL = '#151D29'
const BORDE = '#2A3548'
const TEXTO = '#F0F2F5'
const SECUNDARIO = '#8A9BB8'

const accesos = [
  {
    titulo: 'Partidos',
    descripcion: 'Cargá el partido, el rival y el enlace de YouTube.',
    icono: '⚽',
  },
  {
    titulo: 'Etiquetado',
    descripcion: 'Registrá pases, pérdidas, recuperaciones, remates y duelos.',
    icono: '🎯',
  },
  {
    titulo: 'Estadísticas',
    descripcion: 'Consultá el rendimiento individual y colectivo.',
    icono: '📊',
  },
  {
    titulo: 'Informes',
    descripcion: 'Prepará informes y comparaciones entre partidos.',
    icono: '📄',
  },
]

export default function AnalisisSection() {
  const [mostrarFormulario, setMostrarFormulario] = useState(false)

  return (
    <div className="space-y-6 p-4 md:p-6" style={{ color: TEXTO }}>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p
            className="mb-2 text-xs font-bold uppercase tracking-widest"
            style={{ color: AMARILLO }}
          >
            CUERPO TÉCNICO
          </p>
          <h1 className="text-3xl font-bold">Análisis</h1>
          <p className="mt-2 text-sm" style={{ color: SECUNDARIO }}>
            Análisis de partidos, rendimiento y estadísticas.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setMostrarFormulario((actual) => !actual)}
          className="rounded-xl px-5 py-3 text-sm font-bold transition-opacity hover:opacity-80"
          style={{ backgroundColor: AMARILLO, color: '#171717' }}
        >
          {mostrarFormulario ? 'Cancelar' : '+ Nuevo análisis'}
        </button>
      </header>

      {mostrarFormulario && (
        <section
          className="rounded-2xl border p-5"
          style={{ backgroundColor: PANEL, borderColor: BORDE }}
        >
          <h2 className="mb-2 text-lg font-bold">Nuevo análisis de partido</h2>
          <p className="mb-4 text-sm" style={{ color: SECUNDARIO }}>
            Este formulario es la estructura inicial. La carga y el guardado
            definitivo se conectarán a Supabase en la siguiente etapa.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span>Rival</span>
              <input
                type="text"
                placeholder="Nombre del rival"
                disabled
                className="w-full rounded-xl border p-3 opacity-70"
                style={{
                  backgroundColor: '#0F1419',
                  borderColor: BORDE,
                  color: TEXTO,
                }}
              />
            </label>

            <label className="space-y-2 text-sm">
              <span>Fecha del partido</span>
              <input
                type="date"
                disabled
                className="w-full rounded-xl border p-3 opacity-70"
                style={{
                  backgroundColor: '#0F1419',
                  borderColor: BORDE,
                  color: TEXTO,
                }}
              />
            </label>

            <label className="space-y-2 text-sm md:col-span-2">
              <span>Enlace de YouTube</span>
              <input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                disabled
                className="w-full rounded-xl border p-3 opacity-70"
                style={{
                  backgroundColor: '#0F1419',
                  borderColor: BORDE,
                  color: TEXTO,
                }}
              />
            </label>
          </div>

          <p className="mt-4 text-xs" style={{ color: SECUNDARIO }}>
            Los campos se habilitarán cuando definamos la conexión con la base
            de datos y las categorías existentes.
          </p>
        </section>
      )}

      <section
        className="rounded-2xl border p-5 md:p-6"
        style={{
          background: 'linear-gradient(135deg, #202A38 0%, #151D29 100%)',
          borderColor: BORDE,
        }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
            style={{ backgroundColor: AMARILLO, color: '#171717' }}
          >
            ▶
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold">Tu espacio de análisis</h2>
            <p className="mt-1 text-sm" style={{ color: SECUNDARIO }}>
              Desde acá vas a poder analizar partidos completos sin modificar
              el módulo actual de Videoanálisis.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold">Herramientas de análisis</h2>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {accesos.map((acceso) => (
            <article
              key={acceso.titulo}
              className="rounded-2xl border p-5"
              style={{ backgroundColor: PANEL, borderColor: BORDE }}
            >
              <div className="mb-4 text-2xl">{acceso.icono}</div>
              <h3 className="font-bold">{acceso.titulo}</h3>
              <p
                className="mt-2 text-sm leading-6"
                style={{ color: SECUNDARIO }}
              >
                {acceso.descripcion}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="rounded-2xl border p-5"
        style={{ backgroundColor: PANEL, borderColor: BORDE }}
      >
        <h2 className="font-bold">Partidos analizados</h2>
        <p className="mt-2 text-sm leading-6" style={{ color: SECUNDARIO }}>
          Todavía no hay partidos cargados en este nuevo módulo. Cuando
          conectemos el guardado, acá aparecerán los partidos, sus análisis y
          el acceso a sus estadísticas.
        </p>
      </section>
    </div>
  )
}
