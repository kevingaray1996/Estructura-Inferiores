import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'

function hojaDesdeFilas(filas) {
  return XLSX.utils.json_to_sheet(filas)
}

export async function exportarBackupCompleto() {
  const libro = XLSX.utils.book_new()

  // --- Jugadores ---
  const { data: jugadoresData } = await supabase
    .from('jugadores')
    .select('*, categorias(nombre)')
    .order('apellido')
  const filasJugadores = (jugadoresData || []).map((j) => ({
    Apellido: j.apellido,
    Nombre: j.nombre,
    Categoría: j.categorias?.nombre || '',
    Posición: j.posicion || '',
    'Fecha nacimiento': j.fecha_nacimiento || '',
    Estado: j.estado || '',
    'Pie hábil': j.pie_habil || '',
    Nacionalidad: j.nacionalidad || '',
  }))
  XLSX.utils.book_append_sheet(libro, hojaDesdeFilas(filasJugadores), 'Jugadores')

  // --- Partidos ---
  const { data: partidosData } = await supabase
    .from('partidos')
    .select('*, categorias(nombre)')
    .order('fecha', { ascending: false })
  const filasPartidos = (partidosData || []).map((p) => ({
    Fecha: p.fecha,
    Hora: p.hora || '',
    Categoría: p.categorias?.nombre || '',
    Rival: p.rival || '',
    'Local/Visitante': p.local_visitante || '',
    Lugar: p.lugar || '',
    'Goles local': p.goles_local ?? '',
    'Goles visitante': p.goles_visitante ?? '',
    'Nro. fecha': p.numero_fecha || '',
  }))
  XLSX.utils.book_append_sheet(libro, hojaDesdeFilas(filasPartidos), 'Partidos')

  // --- Estadísticas por jugador y partido ---
  const { data: statsData } = await supabase
    .from('estadisticas_jugador')
    .select('*, jugadores(nombre, apellido), partidos(fecha, rival)')
  const filasStats = (statsData || []).map((s) => ({
    Jugadora: s.jugadores ? `${s.jugadores.apellido}, ${s.jugadores.nombre}` : '',
    Partido: s.partidos ? `vs ${s.partidos.rival} (${s.partidos.fecha})` : '',
    Titular: s.titular ? 'Sí' : 'No',
    Minutos: s.minutos_jugados ?? '',
    Goles: s.goles ?? '',
    Asistencias: s.asistencias ?? '',
    Amarillas: s.tarjetas_amarillas ?? '',
    Rojas: s.tarjetas_rojas ?? '',
  }))
  XLSX.utils.book_append_sheet(libro, hojaDesdeFilas(filasStats), 'Estadisticas')

  // --- Asistencia ---
  const { data: asistenciasData } = await supabase
    .from('asistencias')
    .select('*, jugadores(nombre, apellido, categorias(nombre))')
    .order('fecha', { ascending: false })
  const filasAsistencias = (asistenciasData || []).map((a) => ({
    Fecha: a.fecha,
    Jugadora: a.jugadores ? `${a.jugadores.apellido}, ${a.jugadores.nombre}` : '',
    Categoría: a.jugadores?.categorias?.nombre || '',
    Estado: a.estado,
  }))
  XLSX.utils.book_append_sheet(libro, hojaDesdeFilas(filasAsistencias), 'Asistencia')

  // --- Bienestar ---
  const { data: bienestarData } = await supabase
    .from('bienestar')
    .select('*, jugadores(nombre, apellido)')
    .order('fecha', { ascending: false })
  const filasBienestar = (bienestarData || []).map((b) => ({
    Fecha: b.fecha,
    Jugadora: b.jugadores ? `${b.jugadores.apellido}, ${b.jugadores.nombre}` : '',
    Sueño: b.sueno ?? '',
    'Dolor muscular': b.dolor_muscular ?? '',
    Fatiga: b.fatiga ?? '',
    Estrés: b.estres ?? '',
    'Ánimo entrenar': b.animo_entrenar ?? '',
  }))
  XLSX.utils.book_append_sheet(libro, hojaDesdeFilas(filasBienestar), 'Bienestar')

  const hoy = new Date()
  const fechaArchivo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  XLSX.writeFile(libro, `Backup_ClubComunicaciones_${fechaArchivo}.xlsx`)
}
