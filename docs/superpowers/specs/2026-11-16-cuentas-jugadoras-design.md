# Cuentas de jugadoras: diseño (etapas 1 a 3)

Rama `notificaciones`, desde origin/main 9acc69b. Este documento cubre las tres etapas. El plan que lo implementa
cubre solo la etapa 1: `docs/superpowers/plans/2026-11-16-cuentas-jugadoras-etapa1.md`.

## Para qué

Las jugadoras hoy completan el Wellness y el RPE desde un link público por categoría y eligen su nombre de una lista.
Cualquiera que tenga el link puede cargar a nombre de otra. Se pide:

- Cada jugadora con su cuenta, creada por coordinación.
- Que vea solo lo suyo.
- Más adelante, avisos al celular atados a esa cuenta (etapa 2) y un portal con análisis, clips y devoluciones (etapa 3).

El usuario descartó los avisos sin cuenta: la identidad tiene que ser real antes de mandar nada.

## Etapas

1. **Cuentas y perfil básico.** Coordinación crea la cuenta y la jugadora entra con un mail que trae link y código.
   Ve su perfil básico (partidos, titularidades, minutos y asistencia con porcentaje) y completa el Wellness y el RPE
   desde la cuenta. El link público sigue como respaldo.
2. **Avisos al celular atados a la cuenta.** Recordatorio de Wellness, recordatorio de RPE, entrenamiento publicado,
   botón "Avisar convocatoria", avisos manuales y una pantalla de coordinación. Se diseña aparte, cuando la etapa 1
   esté en producción.
3. **Portal ampliado.** Análisis, clips y devoluciones del cuerpo técnico. No se construye ahora; la etapa 1 deja
   el lugar preparado.

## Objetivos de la etapa 1

- Solo coordinación crea, desactiva y reactiva cuentas. El registro abierto sigue apagado.
- Entrada sin contraseña: un mail con link y código de 6 dígitos. El mail sale por el SMTP de la cuenta de Gmail
  exclusiva de la plataforma, cargado como SMTP propio en Supabase (ver «Restricciones → Mails»).
- En iPhone y Android, la app instalada abre directo en la cuenta de la jugadora, nunca en el login del staff.
- La jugadora ve:
  - Su nombre, foto y categoría.
  - **Partidos:** jugados, titularidades y minutos.
  - **Entrenamientos:** presentes, ausentes, tardes y justificadas, con su porcentaje.
  - El entrenamiento publicado de hoy, igual que en el link público.
- Completa el Wellness y el RPE desde la cuenta, con las mismas reglas que el link público: hoy para el Wellness,
  hoy y 3 días antes para el RPE.

## Lo que no se hace (non-goals)

- Avisos y service worker de envío: van en la etapa 2. La etapa 1 solo deja la app instalable en su propia ruta.
- Análisis, clips, devoluciones, evolución del Wellness y respuestas anteriores.
- Que la jugadora edite sus datos personales.
- Sacar el link público.

## Lo que haría fracasar la etapa aunque funcione (anti-goals)

- Que una jugadora pueda leer, por cualquier camino (tabla, vista, función o cadena de políticas), algo de otra
  jugadora, datos médicos, evaluaciones, el semáforo o el análisis. Esto incluye sus propias evaluaciones y su
  propio análisis.
- Que una clave secreta (service_role o la contraseña de aplicación de Gmail) quede en el repo o en el navegador.
- Que una cuenta de jugadora pueda entrar al sistema del staff, o que un mail del staff termine como jugadora.
- Que el staff pierda algún acceso que tiene hoy.

## Restricciones

- **anon:** sigue limitado a las 5 funciones públicas actuales.
- **Plan gratis de Supabase:**
  - Edge Functions: 500.000 llamadas por mes.
  - Auth con SMTP propio. Los límites de mails por hora se cambian en el panel.
- **Mails:** salen por el SMTP de una cuenta de Gmail nueva y exclusiva de la plataforma, con verificación en dos
  pasos y una contraseña de aplicación cargada solo en el panel de Supabase (decisión del usuario del 2026-11-16,
  en lugar de Resend). No tiene costo y no necesita dominio. Los primeros mails de una cuenta nueva pueden caer en
  spam.
- **SQL:**
  - Cada script en un solo bloque DO, con respaldo, verificación que simula cada rol, y reversión aparte.
  - Lo corre el usuario en el editor de Supabase. No se usa la terminal de Supabase.
- **Forma de trabajo:**
  - Colores desde `src/theme.js`, mobile primero.
  - Sin commits ni push del asistente: el usuario commitea con GitHub Desktop. A main solo con su OK.
- **Revisión de pantallas:** al terminar cada una se corre ux-audit y viewports de VectorLab, a 375 px y a
  1280 px. Antes de decir que algo está listo, se usa verification-before-completion.

## Cómo está hoy (relevado 2026-11-16)

- `perfiles` (PK email; CHECK de rol: coordinacion, medico, tecnico, preparador_fisico) más `mi_rol()` por email del JWT.
  Casi todas las políticas exigen un rol, así que un logueado sin perfil no ve nada en la mayoría de las tablas.
- La etapa C ya cerró `cmj` y `entrenamiento_bloques`. Según el repo, todavía puede leer cualquier logueado:
  - `categorias`: la política "leer categorias" pide solo `auth.role() = 'authenticated'`.
  - `datafem_tablas`, `evaluacion_criterios` y `analisis_tipos_accion`: tienen `USING (true)`.

  `esquema_real.sql` es anterior a la etapa C. El estado real sale de
  `supabase/verification/20261116_auditoria_logueado_sin_rol.sql`, que hay que correr antes de escribir la migración.
- **Cadena peligrosa:** `analisis_eventos` deja leer cuando hay un `EXISTS (SELECT … FROM jugadores …)`. Si una
  jugadora pudiera leer su propia fila de `jugadores`, vería su análisis. Por eso la jugadora **no recibe permisos
  sobre ninguna tabla**.
- **Asistencias:** los estados son presente, tarde, ausente, lesionado y enfermo. "Justificada" no existe como estado.
- **Partidos:** el perfil del staff cuenta una fila de `estadisticas_jugador` como un partido jugado
  (`PerfilJugador.jsx:335-344`).
- **Instalación:** el manifest abre `/` (el login del staff) y no hay service worker. En iPhone, la app instalada
  guarda sus datos aparte de Safari.

## Enfoques considerados

1. **Jugadoras dentro de `perfiles`, con rol 'jugadora' y políticas propias en cada tabla (descartado).** Mezcla
   staff y jugadoras en la tabla que decide todos los permisos. Además, cada política nueva sobre su propia fila
   abre cadenas como la de análisis.
2. **Tabla aparte, `cuentas_jugadoras`, y acceso solo por funciones de la base (elegido).** La jugadora no tiene
   permisos sobre ninguna tabla: todo lo que ve sale de funciones `portal_*` que filtran por su cuenta y devuelven
   solo campos elegidos. Es el mismo modelo que ya funciona para anon. Además, una política RESTRICTIVE en todas las
   tablas de `public` bloquea a cualquier cuenta de jugadora, aunque una migración futura agregue una política
   permisiva por error.
3. **Login de jugadora con código propio guardado en la base, sin Supabase Auth (descartado).** Habría que
   reinventar sesiones y tokens, y la etapa 2 necesita una identidad real para atar los avisos.

## Decisiones

Las marcadas como *(asistente)* las propuso el asistente y esperan confirmación del usuario.

- **Mail con link y código** *(asistente)*. El link solo sirve si se abre en el mismo navegador donde está la app.
  En iPhone, el link del mail abre Safari y la sesión queda en Safari, no en la app instalada. Por eso la pantalla
  de ingreso pide el código de 6 dígitos, y el mail trae los dos.
- **App propia en `/jugadora/`** *(asistente)*. Se hace con otra entrada de Vite (`jugadora/index.html`) y tiene:
  - Su propio manifest: `start_url` y `scope` son `/jugadora/`, con íconos locales.
  - Un service worker mínimo, sin caché, con scope `/jugadora/`. Sirve para que la instalación y el scope no
    cambien cuando la etapa 2 agregue los avisos.

  Así carga solo lo de la jugadora, no todo el sistema del staff. Si alguien con cuenta de jugadora abre `/`, lo
  redirige a `/jugadora/`. Si alguien del staff abre `/jugadora/`, le avisa y le ofrece volver a `/`.
- **Tabla `public.cuentas_jugadoras`** *(asistente)*:
  - `jugador_id` (PK, FK a `jugadores`, ON DELETE CASCADE).
  - `usuario_id` (único, FK a `auth.users`, ON DELETE CASCADE).
  - `email` (único, en minúsculas).
  - `activa`, `creada_por` y `creada_at`.

  Tiene RLS activado y ningún permiso para anon ni authenticated. En la etapa 2, las suscripciones a avisos se
  atan a `usuario_id`.
- **Crear cuentas con la Edge Function `cuentas-jugadoras`** *(asistente)*:
  - Solo la puede usar coordinación, y la función lo comprueba con `mi_rol()` usando el token de quien llama.
  - La clave `service_role` es un secreto que Supabase le pone a la función. No pasa por el repo ni por el navegador.
  - **Crear:** usa `auth.admin.createUser` con el email confirmado.
  - **Desactivar:** bloquea la cuenta en Auth (`ban_duration`) y pone `activa=false`.
  - **Reactivar:** hace lo contrario.

  Rechaza los mails que ya están en `perfiles` o en `auth.users`.
- **Justificadas** *(asistente)*. Se suman lesionado y enfermo, sin mostrar el motivo, para no exponer datos médicos.
- **Porcentaje de asistencia** *(asistente)*. Es (presentes + tardes) / total de registros, redondeado a entero.
  Sin registros, se muestra "Sin registros" en lugar del porcentaje.
- **Partidos** *(asistente)*. Se usa el mismo criterio que el perfil del staff: cada fila de
  `estadisticas_jugador` es un partido jugado. Se filtra por año, con el año actual por defecto y un selector con
  los años que tienen datos.
- **Wellness y RPE desde la cuenta.** Las funciones `portal_*` reutilizan las funciones públicas existentes, con la
  categoría y el id que salen de la cuenta, así que las validaciones son las mismas. El formulario arranca vacío,
  igual que el público.
- **Mensajes de ingreso.** Nunca dicen si un mail tiene cuenta: "Si tu mail está registrado, te llegó un link y un
  código".

## Preparado para las etapas 2 y 3

- La identidad sale siempre de `portal_privado.mi_jugadora_id()`. Las funciones nuevas de avisos, clips y
  devoluciones la reutilizan y siguen el prefijo `portal_`.
- La app `/jugadora/` tiene navegación por pestañas (Inicio, Wellness, Mis números). Videos y Devoluciones se suman
  como pestañas nuevas.
- El service worker con scope `/jugadora/` ya existe. La etapa 2 le agrega el manejo de los avisos sin cambiar la URL.

## Limitaciones reales

- **iPhone:**
  - Para instalar la app hay que abrir `/jugadora/` en Safari (no desde Chrome ni desde el navegador de otra app)
    y usar Compartir → Agregar a pantalla de inicio.
  - Adentro de la app instalada hay que usar el código, no el link.
  - Los avisos de la etapa 2 van a pedir iOS 16.4 o más y la app instalada.
- **Android:** en general el link funciona, pero si Gmail lo abre en su propio navegador puede quedar fuera de la
  app instalada. El código siempre funciona.
- **Mail:**
  - Algunos servicios (sobre todo Outlook) abren los links para revisarlos, y eso puede gastar el link antes que la
    jugadora: queda el código.
  - El link y el código vencen a la hora.
- **Gmail tiene un límite diario de envíos** y los primeros mails de la cuenta nueva pueden caer en spam. Para un
  plantel alcanza; por eso «emails por hora» queda en 30.
- **Una jugadora sin mail** no puede tener cuenta. Sigue usando el link público.

## Lo que queda a criterio del implementador

Los textos de ayuda, el diseño de las tarjetas dentro de las reglas de VectorLab, y los nombres de las clases CSS.
