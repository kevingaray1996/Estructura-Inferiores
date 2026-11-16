// Alguien logueado en el sistema del staff sin perfil: si es una jugadora con cuenta activa, su lugar es /jugadora/.
// Devuelve la ruta a la que hay que ir, o null para mostrar el mensaje de siempre. Nunca lanza.
export async function destinoSinPerfil(supabase) {
  try {
    const { data, error } = await supabase.rpc('portal_mi_perfil')
    return !error && data ? '/jugadora/' : null
  } catch {
    return null
  }
}
