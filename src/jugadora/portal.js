import { supabase } from '../supabaseClient'

// La app de la jugadora nunca lee tablas: todo pasa por las funciones portal_* de la base, que toman la
// identidad de la sesión (supabase/migrations/20261116120000_cuentas_jugadoras_etapa1.sql).
// Cada envoltorio devuelve { data, error }; error.code es 'cuenta_inactiva' cuando la base responde 42501.
async function llamar(nombre, args) {
  try {
    const { data, error } = await supabase.rpc(nombre, args)
    // Solo se muestran los mensajes propios de las funciones (RAISE, código P0001), que ya están en castellano. Los
    // demás errores técnicos quedan sin mensaje y la pantalla usa su texto de «revisá la conexión».
    if (error) return { data: null, error: { code: error.code === '42501' ? 'cuenta_inactiva' : 'error', mensaje: error.code === 'P0001' ? error.message : '' } }
    return { data, error: null }
  } catch {
    return { data: null, error: { code: 'sin_conexion', mensaje: '' } }
  }
}

export const obtenerPerfil = () => llamar('portal_mi_perfil')
export const obtenerNumeros = (anio) => llamar('portal_mis_numeros', { p_anio: anio ?? null })
export const wellnessRespondio = () => llamar('portal_wellness_respondio')
export const entrenamientoHoy = () => llamar('portal_entrenamiento_hoy')

export function guardarWellness(valores) {
  return llamar('portal_wellness_guardar', {
    p_sueno: valores.sueno,
    p_dolor_muscular: valores.dolor_muscular,
    p_fatiga: valores.fatiga,
    p_estres: valores.estres,
    p_animo_entrenar: valores.animo_entrenar,
    p_zona_dolor: valores.zona_dolor ?? null,
    p_fase_ciclo: valores.fase_ciclo ?? null,
  })
}

export function guardarRpe({ fecha, tipo, rpe }) {
  return llamar('portal_rpe_guardar', { p_fecha: fecha, p_tipo: tipo, p_rpe: rpe })
}

// Rol del staff de quien está logueado (o null). Solo se usa para orientar a alguien del staff que abrió esta app.
export async function rolStaff() {
  const { data } = await llamar('mi_rol')
  return data || null
}

// Avisos (etapa 2). La identidad sale de la cuenta: nunca se manda el id de la jugadora.
export const avisosEstado = () => llamar('portal_avisos_estado')

export function avisosSuscribir({ endpoint, p256dh, auth, dispositivo }) {
  return llamar('portal_avisos_suscribir', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_dispositivo: dispositivo })
}

export const avisosDesuscribir = (endpoint) => llamar('portal_avisos_desuscribir', { p_endpoint: endpoint })

export function avisosPreferencias({ wellness, rpe, entrenamiento, convocatoria, mensajes }) {
  return llamar('portal_avisos_preferencias', {
    p_wellness: wellness, p_rpe: rpe, p_entrenamiento: entrenamiento, p_convocatoria: convocatoria, p_mensajes: mensajes,
  })
}
