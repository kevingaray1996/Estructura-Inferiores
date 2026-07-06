import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function CargaMasiva({ onVolver, onGuardado }) {
  const [categorias, setCategorias] = useState([])
  const [texto, setTexto] = useState('')
  const [filas, setFilas] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase.from('categorias').select('*').order('orden')
      setCategorias(data || [])
    }
    cargar()
  }, [])

  function buscarCategoria(nombreCategoria) {
    if (!nombreCategoria) return null
    const limpio = nombreCategoria.trim().toLowerCase()
    const encontrada = categorias.find(
      (c) => c.nombre.toLowerCase() === limpio || c.nombre.toLowerCase().includes(limpio)
    )
    return encontrada || null
  }

  function normalizarPieHabil(valor) {
    const v = (valor || '').trim().toLowerCase()
    if (v.startsWith('der')) return 'derecho'
    if (v.startsWith('izq')) return 'izquierdo'
    if (v.startsWith('amb')) return 'ambidiestro'
    return null
  }

  function normalizarFecha(valor) {
    const v = (valor || '').trim()
    if (!v) return null
    // Acepta DD/MM/AAAA
    const match = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
    if (match) {
      const [, dia, mes, anio] = match
      return `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
    }
    // Ya viene en formato AAAA-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
    return null
  }

  function handlePrevisualizar() {
    const lineas = texto.split('\n').filter((l) => l.trim() !== '')
    const parseadas = lineas.map((linea, i) => {
      const partes = linea.includes('\t') ? linea.split('\t') : linea.split(',')
      const [apellido, nombre, categoriaTexto, fechaTexto, posicion, pieHabilTexto] = partes.map(
        (p) => (p || '').trim()
      )

      const categoria = buscarCategoria(categoriaTexto)
      const fecha = normalizarFecha(fechaTexto)
      const pieHabil = normalizarPieHabil(pieHabilTexto)

      const errores = []
      if (!apellido) errores.push('falta apellido')
      if (!nombre) errores.push('falta nombre')
      if (!categoria) errores.push(`categoría "${categoriaTexto}" no encontrada`)

      return {
        fila: i + 1,
        apellido,
        nombre,
        categoriaTexto,
        categoriaId: categoria?.id || null,
        fecha,
        posicion: posicion || null,
        pieHabil,
        errores,
      }
    })
    setFilas(parseadas)
    setResultado(null)
  }

  async function handleConfirmar() {
    const validas = filas.filter((f) => f.errores.length === 0)
    if (validas.length === 0) return

    setGuardando(true)
    const registros = validas.map((f) => ({
      apellido: f.apellido,
      nombre: f.nombre,
      categoria_id: f.categoriaId,
      fecha_nacimiento: f.fecha,
      posicion: f.posicion,
      pie_habil: f.pieHabil,
      estado: 'disponible',
    }))

    const { error } = await supabase.from('jugadores').insert(registros)
    setGuardando(false)

    if (error) {
      setResultado({ ok: false, mensaje: error.message })
    } else {
      setResultado({ ok: true, cantidad: validas.length })
      setTexto('')
      setFilas([])
    }
  }

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  const validas = filas.filter((f) => f.errores.length === 0)
  const invalidas = filas.filter((f) => f.errores.length > 0)

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={onVolver}
          className="text-sm mb-6 flex items-center gap-1 hover:opacity-70 transition-opacity"
          style={{ color: '#8A9BB8' }}
        >
          ← Volver al plantel
        </button>

        <h1
          className="text-2xl md:text-3xl mb-2"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
        >
          Carga masiva de jugadores
        </h1>
        <p className="text-sm mb-6" style={{ color: '#5B6B85' }}>
          Pegá los datos copiados desde Excel/Sheets, una fila por jugador. Columnas en este orden: Apellido, Nombre, Categoría, Fecha de nacimiento (DD/MM/AAAA), Posición, Pie hábil.
        </p>

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={'Pérez\tJuan\t7ma\t12/05/2011\tDelantero centro\tderecho\nGómez\tMartín\t7ma\t03/02/2011\tArquero\tizquierdo'}
          rows={8}
          className="w-full p-3 rounded-xl outline-none text-sm font-mono resize-none mb-4"
          style={inputStyle}
        />

        <button
          onClick={handlePrevisualizar}
          disabled={!texto.trim()}
          className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 disabled:opacity-50 mb-6"
          style={{ backgroundColor: '#1A2332', color: '#F0F2F5', border: '1px solid #2A3548' }}
        >
          Previsualizar
        </button>

        {filas.length > 0 && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm" style={{ color: '#4ADE80' }}>
                {validas.length} listos para cargar
              </span>
              {invalidas.length > 0 && (
                <span className="text-sm" style={{ color: '#F87171' }}>
                  {invalidas.length} con errores
                </span>
              )}
            </div>

            <div className="space-y-2 mb-6 max-h-96 overflow-y-auto">
              {filas.map((f) => (
                <div
                  key={f.fila}
                  className="p-3 rounded-xl text-sm"
                  style={{
                    backgroundColor: '#1A2332',
                    border: `1px solid ${f.errores.length > 0 ? '#F87171' : '#2A3548'}`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <p style={{ color: '#F0F2F5' }}>
                      {f.apellido}, {f.nombre}
                    </p>
                    <span className="text-xs" style={{ color: '#8A9BB8' }}>
                      {f.categoriaTexto}
                    </span>
                  </div>
                  {f.errores.length > 0 && (
                    <p className="text-xs mt-1" style={{ color: '#F87171' }}>
                      Fila {f.fila}: {f.errores.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={handleConfirmar}
              disabled={guardando || validas.length === 0}
              className="w-full p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
            >
              {guardando ? 'Cargando...' : `Confirmar carga de ${validas.length} jugador${validas.length !== 1 ? 'es' : ''}`}
            </button>
          </>
        )}

        {resultado && (
          <p
            className="text-sm mt-4"
            style={{ color: resultado.ok ? '#4ADE80' : '#F87171' }}
          >
            {resultado.ok
              ? `✅ Se cargaron ${resultado.cantidad} jugadores correctamente.`
              : `Error: ${resultado.mensaje}`}
          </p>
        )}
      </div>
    </div>
  )
}

export default CargaMasiva