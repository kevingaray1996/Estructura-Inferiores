# Cuentas de jugadoras, etapa 1: plan de implementación

> **Para quien ejecute el plan:** usar superpowers:subagent-driven-development (recomendado) o
> superpowers:executing-plans, tarea por tarea. Los pasos tienen casillas (`- [ ]`) para ir marcando.

**Objetivo.** Coordinación crea cuentas de jugadoras. Cada jugadora entra con un mail que trae link y código, ve
solo su perfil básico y completa el Wellness y el RPE desde su cuenta.

**Arquitectura.**
- **Cuentas:** una tabla `cuentas_jugadoras` une `jugadores` con `auth.users`.
- **Acceso de la jugadora:** no tiene permisos sobre ninguna tabla. Todo pasa por funciones `portal_*` (SECURITY
  DEFINER) y una política RESTRICTIVE en cada tabla de `public` la bloquea igual.
- **Alta de cuentas:** la hace la Edge Function `cuentas-jugadoras`, que usa la clave `service_role` que Supabase
  le inyecta.
- **App de la jugadora:** es una entrada aparte de Vite en `/jugadora/`, con su propio manifest y su service worker.

**Tecnologías.** React 19, Vite 8 (multipágina), supabase-js 2 y Supabase (Auth con OTP por mail, Edge Functions en
Deno, Postgres). Los mails salen por el SMTP de la cuenta de Gmail exclusiva de la plataforma. Tests con node:test, PGlite y jsdom, siguiendo el patrón actual de `tests/`.

**Diseño:** `docs/superpowers/specs/2026-11-16-cuentas-jugadoras-design.md`.

## Reglas para todo el plan

- **Sin commits:** el asistente no commitea ni pushea. Al cerrar cada tarea, deja los cambios listos y el usuario
  commitea con GitHub Desktop.
- **SQL:**
  - Un único bloque `DO` por archivo, sin BEGIN/COMMIT y sin tablas temporales.
  - `set_config('lock_timeout','5s',true)` y `pg_notify('pgrst','reload schema')` adentro.
  - Respaldo en `seguridad_privado` y reversión en `supabase/rollback/`.
  - Un test comprueba que cada archivo tiene un solo `DO`.
- **Funciones nuevas:** SECURITY DEFINER, `SET search_path = ''`, nombres calificados (`public.`, `auth.`),
  `REVOKE ALL … FROM PUBLIC, anon` y `GRANT EXECUTE` solo al rol que corresponde.
- **anon no gana nada.** Sigue con las 5 funciones públicas actuales.
- **Claves:** ninguna clave secreta en el repo ni en `src/`. La `service_role` vive solo en la Edge Function y la
  contraseña de aplicación de Gmail solo en el panel de Supabase (SMTP Settings).
- **Pantallas:** colores solo desde `src/theme.js` y las variables `--ui-*`, diseño mobile primero.
- **Mensaje de ingreso:** siempre el mismo: «Si tu mail está registrado, te llegó un link y un código de 6 dígitos.»
- **Cierre de cada pantalla:**
  - ux-audit y viewports de VectorLab, a 375 px y a 1280 px.
  - `npm run build` y `npm run lint` sin errores.
  - Revisar que no haya tags `<a>` rotos.
  - superpowers:verification-before-completion antes de decir que algo está listo.
- **Variable para los tests de base:** `PLANIFICACION_PG_PATH` apunta a una instalación de PGlite que funcione. La
  de `%TEMP%\comunicaciones-planificacion-pg` puede estar rota.

## Qué revisar con más cuidado

1. **Una jugadora que intenta leer otra tabla, vista o cadena de políticas.** Tiene que ver 0 filas o recibir
   «sin permiso», en todas. Lo prueban la Tarea 1 (verificación que recorre todas las tablas) y su test con PGlite.
2. **Una cuenta desactivada con la sesión todavía abierta** (el token dura hasta 1 hora). Todas las `portal_*` la
   rechazan enseguida, porque `mi_jugadora_id()` mira `activa`. Lo prueba la Tarea 1.
3. **Un mail que ya es del staff, o un perfil de staff con el mail de una jugadora.** Se rechaza en los dos
   sentidos: la Edge Function rechaza el mail y un trigger en `perfiles` rechaza el perfil. Lo prueban las
   Tareas 1 y 2.
4. **Una jugadora que cambia de categoría.** El Wellness y el RPE se guardan con su categoría actual, no con la
   que tenía cuando se creó la cuenta. Lo prueba la Tarea 1.
5. **Un mail desconocido en el ingreso.** Muestra el mismo mensaje que un mail registrado y no crea ninguna
   cuenta, porque el registro sigue cerrado. Lo prueba la Tarea 5.

## Archivos

| Archivo | Para qué |
|---|---|
| `supabase/verification/20261116_auditoria_logueado_sin_rol.sql` | (ya escrito) Qué ve hoy un logueado sin rol |
| `supabase/migrations/20261116120000_cuentas_jugadoras_etapa1.sql` | Cierre, red RESTRICTIVE, tabla, funciones, verificación |
| `supabase/rollback/20261116120000_cuentas_jugadoras_etapa1.sql` | Reversión |
| `tests/cuentasJugadoras.postgres.mjs` | Migración, reversión y un solo DO |
| `supabase/functions/cuentas-jugadoras/index.js` | Edge Function: crear, desactivar y reactivar (exporta la validación) |
| `tests/cuentasJugadorasFuncion.test.mjs` | Validación y flujo de la Edge Function con cliente simulado |
| `src/components/usuarios/CuentasJugadorasPanel.jsx` | Pantalla de coordinación |
| `src/components/UsuariosSection.jsx` | Selector Staff / Jugadoras |
| `src/components/wellness/FormularioWellness.jsx`, `FormularioRpe.jsx` | Formularios separados de BienestarPublico |
| `src/components/BienestarPublico.jsx` | Usa los formularios separados (sin cambios de comportamiento) |
| `jugadora/index.html`, `public/jugadora/manifest.webmanifest`, `public/jugadora/sw.js`, `public/iconos/*` | App instalable propia |
| `src/jugadora/main.jsx`, `AppJugadora.jsx`, `IngresoJugadora.jsx`, `InicioJugadora.jsx`, `MisNumeros.jsx`, `WellnessJugadora.jsx`, `portal.js`, `jugadora.css` | App de la jugadora |
| `vite.config.js` | Entrada `jugadora: 'jugadora/index.html'` |
| `src/App.jsx` | Redirige a `/jugadora/` las cuentas de jugadora |
| `tests/portalJugadora.interaccion.mjs`, `tests/cuentasJugadorasPanel.interaccion.mjs` | Pruebas de pantalla |

---

### Task 0 (Tarea 0): estado real de la base y registro cerrado (lo hace el usuario, sin código)

- [ ] **Paso 1.** En el editor SQL de Supabase, correr completo
  `supabase/verification/20261116_auditoria_logueado_sin_rol.sql` y pasar el resultado (son nombres y
  cantidades, sin datos personales).
- [ ] **Paso 2.** En el panel, ir a **Authentication → Sign In / Providers** y confirmar que **Allow new users to
  sign up** está **apagado** y que el proveedor **Email** está activo.
- [x] **Paso 3.** Hecho el 2026-11-16 (resultado en `supabase/auditoria-seguridad/sinrol.csv`, ignorado por git).
  Ninguna tabla de `public` tiene RLS desactivado. Las funciones que escriben y que authenticated puede ejecutar
  (planificación y pases) ya exigen un rol por adentro. Lista definitiva de `c_tablas_abiertas`, con sus políticas
  actuales:
  - `analisis_tipos_accion` · `tipos_accion_lectura` · FOR SELECT TO authenticated USING (true)
  - `categorias` · `"leer categorias"` · FOR SELECT TO public USING (auth.role() = 'authenticated')
  - `datafem_tablas` · `"Usuarios autenticados pueden leer DataFem"` · FOR SELECT TO authenticated USING (true)
  - `evaluacion_criterios` · `criterios_select` · FOR SELECT TO authenticated USING (true)

### Task 1 (Tarea 1): migración de cuentas, cierre y funciones del portal

**Archivos:**
- Crear: `supabase/migrations/20261116120000_cuentas_jugadoras_etapa1.sql`
- Crear: `supabase/rollback/20261116120000_cuentas_jugadoras_etapa1.sql`
- Test: `tests/cuentasJugadoras.postgres.mjs`

**Interfaces que produce** (las usan las Tareas 2, 3, 5 y 6).

Todas son SECURITY DEFINER. Si la cuenta no es válida, devuelven el error `42501` con el mensaje
«Esta cuenta no está activa.».

- `public.cuentas_jugadoras(jugador_id uuid PK → jugadores ON DELETE CASCADE, usuario_id uuid UNIQUE NOT NULL → auth.users ON DELETE CASCADE, email text UNIQUE NOT NULL CHECK (email = lower(btrim(email))), activa boolean NOT NULL DEFAULT true, creada_por uuid, creada_at timestamptz NOT NULL DEFAULT now())`
  - RLS activado, sin políticas.
  - `REVOKE ALL` a PUBLIC, anon y authenticated. `GRANT ALL` a service_role.
- `portal_privado.mi_jugadora_id() RETURNS uuid`
  - Devuelve el `jugador_id` de la cuenta cuyo `usuario_id = auth.uid()` y `activa`, o NULL.
  - EXECUTE para authenticated, porque la usan las políticas.
- **Funciones de la jugadora** (EXECUTE solo para authenticated):
  - `public.portal_mi_perfil() RETURNS jsonb` → `{nombre, apellido, foto_url, categoria}`, donde `categoria` es el
    nombre de la categoría actual.
  - `public.portal_mis_numeros(p_anio integer DEFAULT NULL) RETURNS jsonb` →
    `{anios: int[] desc, anio: int, partidos: {jugados, titularidades, minutos}, asistencia: {presentes, tardes, ausentes, justificadas, total, porcentaje}}`
    - `anio` NULL significa el año actual de Argentina.
    - `jugados` es la cantidad de filas de `estadisticas_jugador` cuyo partido es de ese año.
    - `justificadas` es lesionado + enfermo.
    - `porcentaje` es round(100 × (presentes + tardes) / total), y NULL si `total` = 0.
  - `public.portal_wellness_respondio() RETURNS boolean` → delega en `wellness_publico_respondio(categoría actual, mi_jugadora_id())`.
  - `public.portal_wellness_guardar(p_sueno int, p_dolor_muscular int, p_fatiga int, p_estres int, p_animo_entrenar int, p_zona_dolor text DEFAULT NULL, p_fase_ciclo text DEFAULT NULL) RETURNS void` → delega en `wellness_publico_guardar`.
  - `public.portal_rpe_guardar(p_fecha date, p_tipo text, p_rpe int) RETURNS void` → delega en `rpe_publico_guardar`.
  - `public.portal_entrenamiento_hoy() RETURNS jsonb` → delega en `planificacion_publica_hoy`.
- `public.cuentas_jugadoras_listar(p_categoria_id uuid) RETURNS jsonb`
  - Devuelve `[{jugador_id, nombre, apellido, foto_url, email, activa, ultimo_ingreso}]`, donde `email`, `activa`
    y `ultimo_ingreso` son NULL si la jugadora no tiene cuenta. `ultimo_ingreso` sale de
    `auth.users.last_sign_in_at`.
  - Solo la puede usar alguien con `mi_rol() = 'coordinacion'`; con otro rol da `42501`.
- `public.cuentas_jugadoras_registrar(p_jugador_id uuid, p_usuario_id uuid, p_email text, p_creada_por uuid) RETURNS void`
  - EXECUTE solo para service_role.
  - Errores:
    - `P0002` «jugadora_inexistente»: la jugadora no existe.
    - `23505` «ya_tiene_cuenta»: la jugadora ya tiene cuenta.
    - `23505` «email_en_uso»: el mail ya está en una cuenta o en `perfiles`.
- `public.cuentas_jugadoras_estado(p_jugador_id uuid, p_activa boolean) RETURNS uuid`
  - Devuelve el `usuario_id`. EXECUTE solo para service_role.
  - Error `P0002` «sin_cuenta» si la jugadora no tiene cuenta.
- **Trigger** `portal_privado.perfil_no_es_jugadora` (BEFORE INSERT OR UPDATE OF email ON `public.perfiles`):
  error `23505` «email_en_uso» si el email está en `cuentas_jugadoras`.
- **Política RESTRICTIVE** `sin_cuentas_jugadoras` FOR ALL TO authenticated, con
  `USING/WITH CHECK ((SELECT portal_privado.mi_jugadora_id()) IS NULL)`. Va en **todas** las tablas de `public`
  con RLS, incluida `cuentas_jugadoras`.
- **Cierre de lectura:** las políticas SELECT abiertas de `c_tablas_abiertas` (salen de la Tarea 0) se reemplazan
  por otras con el mismo nombre y `USING (public.mi_rol() IS NOT NULL)`. Antes se guarda la definición exacta en
  `seguridad_privado.respaldo_cuentas_jugadoras`.

Pasos:

- [ ] **Paso 1: escribir el test que falla.** En `tests/cuentasJugadoras.postgres.mjs`, armar una base parecida a
  Supabase: roles, `auth.uid()` y `auth.jwt()` sacados de `request.jwt.claims`, una tabla `auth.users` mínima y
  las tablas y políticas del repo para `perfiles`, `jugadores`, `bienestar`, `sesiones_fisicas`, `asistencias`,
  `estadisticas_jugador`, `partidos`, `analisis_eventos` y las 4 de lectura abierta. Después aplicar los pasos 0,
  A y B de seguridad y esta migración. Tests:
  - `un solo DO en migración y reversión`: hay exactamente un `DO $` en cada archivo y ningún `BEGIN;`/`COMMIT;`.
  - `jugadora no ve ninguna tabla`: como Ana (con cuenta), `count(*)` da 0 o 42501 en **cada** tabla y vista de
    `public`, recorridas desde `pg_class`, incluida `analisis_eventos` con un evento de Ana.
  - `jugadora ve sus números`: Ana tiene 3 filas de estadísticas (2 titular, minutos 90, 45 y 10) y asistencias
    presente ×4, tarde ×1, ausente ×2, lesionado ×1, enfermo ×1. `portal_mis_numeros(2026)` da
    `{jugados:3, titularidades:2, minutos:145}` y `{presentes:4, tardes:1, ausentes:2, justificadas:2, total:9, porcentaje:56}`.
  - `sin registros`: con una jugadora sin asistencias, `porcentaje` es `null` y `total` es `0`.
  - `wellness y rpe por la cuenta`: `portal_wellness_guardar(4,3,3,2,5)` crea la fila de hoy de Ana y
    `portal_wellness_respondio()` da `true`. `portal_rpe_guardar(hoy - 4, 'entrenamiento', 7)` da 22023.
  - `cambio de categoría`: se cambia `jugadores.categoria_id` de Ana y el guardado sigue funcionando.
  - `cuenta desactivada`: con `cuentas_jugadoras_estado(ana, false)`, todas las `portal_*` dan 42501.
  - `staff igual que antes`: las cantidades visibles para coordinación, técnico, PF y médico en todas las tablas
    son las mismas antes y después de la migración.
  - `logueado sin rol`: en las 4 tablas abiertas ve 0 filas.
  - `anon`: `portal_mi_perfil` y `cuentas_jugadoras_listar` dan 42501.
  - `mails cruzados`: insertar en `perfiles` el mail de Ana da 23505. Registrar una cuenta con el mail de un perfil
    da 23505 «email_en_uso».
  - `solo coordinación lista`: el técnico recibe 42501 en `cuentas_jugadoras_listar`.
  - `reversión`: con cuentas existentes, la reversión aborta con «Hay cuentas de jugadoras». Sin cuentas, deja las
    políticas, funciones y permisos iguales que antes; se compara una foto de `pg_policies`, `pg_proc` y los
    permisos tomada antes de la migración.
- [ ] **Paso 2: comprobar que falla.**
  `node --test tests/cuentasJugadoras.postgres.mjs` tiene que fallar al leer el archivo de migración, porque
  todavía no existe.
- [ ] **Paso 3: escribir la migración.** Lleva el mismo encabezado que los pasos de seguridad (qué hace, cuándo
  correrla, cómo revertir) y estas secciones:
  1. **Controles previos:** que corra como `postgres`, que exista `mi_rol()`, que la migración no se haya aplicado
     ya y que no haya tablas de `public` sin RLS con algún permiso para authenticated.
  2. Respaldo.
  3. Tabla, esquema `portal_privado`, funciones y trigger.
  4. Red RESTRICTIVE, que se recorre desde `pg_class`.
  5. Cierre de `c_tablas_abiertas`.
  6. **Verificación**, con el patrón de la etapa C (`set_config('request.jwt.claims'…)` + `SET LOCAL ROLE` +
     `RAISE 'DESHACER_PRUEBA'`):
     - Crea dentro del bloque que se deshace un usuario de prueba en `auth.users` y su cuenta, atada a la primera
       jugadora.
     - Recorre todas las tablas como esa jugadora y comprueba que ve 0 filas o recibe 42501.
     - Compara las cantidades del staff antes y después, con un usuario real de cada rol.
     - Llama cada `portal_*`.
     - Si algo falla, no se aplica nada.
  7. `pg_notify`.

  Después, un `SELECT` de solo lectura con el resumen. La reversión es lo inverso, con un único DO, y aborta si
  hay cuentas.
- [ ] **Paso 4: comprobar que pasa.** Correr `node --test tests/cuentasJugadoras.postgres.mjs` (todos en PASS) y
  también los tests anteriores para confirmar que no se rompió nada:
  `node --test tests/seguridadWellnessPublico.postgres.mjs tests/seguridadPasoB.postgres.mjs tests/pizarraEtapaC.postgres.mjs`.
- [ ] **Paso 5.** Dejarlo listo para que el usuario revise y commitee. El SQL se corre en producción recién en el
  orden de la sección «Puesta en producción».

### Task 2 (Tarea 2): Edge Function `cuentas-jugadoras`

**Archivos:**
- Crear: `supabase/functions/cuentas-jugadoras/index.js`
- Test: `tests/cuentasJugadorasFuncion.test.mjs`

**Interfaces:**
- **Usa** (de la Tarea 1): `cuentas_jugadoras_registrar`, `cuentas_jugadoras_estado` y `mi_rol()`.
- **Produce** un `POST /functions/v1/cuentas-jugadoras` que se llama con `supabase.functions.invoke`:
  - **Cuerpo:** `{accion:'crear', jugador_id, email}` o `{accion:'desactivar'|'reactivar', jugador_id}`.
  - **Respuesta correcta:** `200 {ok:true}`.
  - **Errores:** `{error:<código>}`:

    | HTTP | Código |
    |---|---|
    | 401 | `sin_sesion` |
    | 403 | `sin_permiso` |
    | 400 | `pedido_invalido` |
    | 409 | `email_en_uso` |
    | 409 | `ya_tiene_cuenta` |
    | 404 | `jugadora_inexistente` |
    | 404 | `sin_cuenta` |
    | 500 | `error_interno` |

- **Exportaciones** del módulo, para poder testearlo en Node:
  - `validarPedido(cuerpo) → {accion, jugador_id, email?} | {error:'pedido_invalido'}`. El email se normaliza con
    trim y minúsculas y tiene que cumplir `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, con 254 caracteres como máximo. El
    `jugador_id` tiene que ser un uuid.
  - `atender(request, {clienteUsuario, clienteAdmin}) → Response`.
  - `Deno.serve` se ejecuta solo si existe `globalThis.Deno`. El cliente se carga con
    `import('jsr:@supabase/supabase-js@2')` y usa `SUPABASE_URL`, `SUPABASE_ANON_KEY` y
    `SUPABASE_SERVICE_ROLE_KEY`, que Supabase inyecta. Responde OPTIONS con los encabezados CORS.

Pasos:

- [ ] **Paso 1: escribir el test que falla.** Usa clientes simulados. Tests:
  - `rechaza sin token` → 401.
  - `rechaza técnico` → 403, sin llamar a `auth.admin`.
  - `pedido_invalido` para un email sin @, un uuid mal formado y una acción desconocida.
  - `crear`: llama a `createUser({email, email_confirm:true, app_metadata:{tipo:'jugadora'}})` y después a
    `cuentas_jugadoras_registrar` con `p_creada_por` = id de coordinación.
  - Si `registrar` falla con «ya_tiene_cuenta», borra el usuario recién creado (`deleteUser`) y responde 409.
  - Un mail que ya existe en Auth → 409 `email_en_uso`, sin llamar a `registrar`.
  - `desactivar` → `updateUserById(id, {ban_duration:'876000h'})`. `reactivar` → `{ban_duration:'none'}`.
  - Grep sobre `src/` y `dist/`: no aparecen `SERVICE_ROLE` ni `re_` (formato de las API keys de Resend; se deja como resguardo aunque los mails ahora salen por
    el SMTP de Gmail de la plataforma).
- [ ] **Paso 2.** `node --test tests/cuentasJugadorasFuncion.test.mjs` tiene que fallar porque el módulo no existe.
- [ ] **Paso 3.** Escribir `index.js` con esas exportaciones.
- [ ] **Paso 4.** Correr el mismo comando: todos en PASS.
- [ ] **Paso 5.** Dejarlo listo para revisión.

### Task 3 (Tarea 3): pantalla de coordinación «Cuentas de jugadoras»

**Archivos:**
- Crear: `src/components/usuarios/CuentasJugadorasPanel.jsx`
- Modificar: `src/components/UsuariosSection.jsx` (selector «Staff | Jugadoras» arriba de la lista; la parte del
  staff no cambia)
- Test: `tests/cuentasJugadorasPanel.interaccion.mjs`, con el patrón de `tests/conexionIndividual.interaccion.mjs`
  (jsdom, Vite y cliente simulado)

**Interfaces:**
- **Usa:** `cuentas_jugadoras_listar(p_categoria_id)` y `supabase.functions.invoke('cuentas-jugadoras', {body})`.
- **Produce:** `CuentasJugadorasPanel({ perfil })`, que solo se muestra si `perfil.rol === 'coordinacion'`.

**Comportamiento:**
- Selector de categoría y una fila por jugadora, con foto, nombre, estado y acción. Los estados son: «Sin cuenta»,
  «Activa · último ingreso 12/11» o «Activa · nunca ingresó», y «Desactivada».
- **«Crear cuenta»** abre un campo de email en la misma fila (sin modal), con etiqueta visible «Email de la
  jugadora». Se valida al salir del campo y el error se borra en cuanto se corrige. El botón dice «Crear cuenta».
- **«Desactivar cuenta»** pide confirmación con el nombre: «Desactivar la cuenta de Ana Pérez», con los botones
  «Desactivar cuenta» y «Cancelar».
- **«Reactivar cuenta»** no pide confirmación.
- **Errores, en criollo y con salida:**
  - `email_en_uso`: «Ese mail ya está en uso por otra cuenta. Usá otro.»
  - `ya_tiene_cuenta`: «Esta jugadora ya tiene cuenta. Actualizá la lista.»
  - Sin conexión: «No se pudo guardar. Revisá la conexión y probá de nuevo.»
- Una línea fija de ayuda: «La jugadora entra en `<origen>/jugadora/` con su mail. No hace falta mandarle nada: le
  llega un link y un código cuando lo pide.», con el link completo y un botón «Copiar link».

Pasos:

- [ ] **Paso 1: escribir el test que falla.** Casos:
  - La lista muestra los 3 estados.
  - «Crear cuenta» con un mail inválido muestra el error recién al salir del campo, y no llama a `invoke`.
  - Con un mail válido, llama a `invoke` con `{accion:'crear', jugador_id, email}` y recarga la lista.
  - `email_en_uso` muestra su mensaje.
  - Desactivar exige la confirmación con el nombre.
  - Un técnico no ve el selector «Jugadoras».
- [ ] **Paso 2.** Correr `node --test tests/cuentasJugadorasPanel.interaccion.mjs`: tiene que dar FAIL.
- [ ] **Paso 3.** Implementar el panel y el selector.
- [ ] **Paso 4.** Correr el mismo test (PASS) y después `npm run build` y `npm run lint`.
- [ ] **Paso 5.** ux-audit y viewports de VectorLab sobre esta pantalla, a 375 px y a 1280 px. Corregir lo que
  marquen y aplicar verification-before-completion.

### Task 4 (Tarea 4): separar los formularios de Wellness y RPE (sin cambiar el link público)

**Archivos:**
- Crear: `src/components/wellness/FormularioWellness.jsx`, `src/components/wellness/FormularioRpe.jsx`
- Modificar: `src/components/BienestarPublico.jsx` (pasa a usarlos)

**Interfaces:**
- `FormularioWellness({ onGuardar: (valores) => Promise<{error?: string}>, onListo })`
  - `valores` = `{sueno, dolor_muscular, fatiga, estres, animo_entrenar, zona_dolor, fase_ciclo}`.
  - Se mueven sin cambios las preguntas, la ayuda del ciclo y las validaciones de hoy.
- `FormularioRpe({ fechaHoy, fechaMinima, onGuardar: ({fecha, tipo, rpe}) => Promise<{error?: string}> })`

Pasos:

- [ ] **Paso 1.** Antes de tocar nada, correr los tests que hoy cubren el Wellness y anotar el resultado (si alguno
  ya fallaba antes, se deja dicho):
  `node --test tests/aparienciaWellness.test.mjs tests/inicioWellness.interaccion.mjs tests/auditoriaAccesos.interaccion.mjs`.
- [ ] **Paso 2.** Mover el código. BienestarPublico pasa `onGuardar` con las RPC públicas que ya usa.
- [ ] **Paso 3.** Correr los mismos tests: el resultado tiene que ser igual. Correr `npm run build`.
- [ ] **Paso 4.** Abrir `/?bienestar=<categoría>` en el navegador a 375 px y comprobar que el flujo es idéntico:
  elegir el nombre, completar el formulario, ver «ya completaste» y cargar el RPE.

### Task 5 (Tarea 5): app `/jugadora/`, instalación e ingreso

**Archivos:**
- Crear: `jugadora/index.html`, `public/jugadora/manifest.webmanifest`, `public/jugadora/sw.js`,
  `public/iconos/jugadora-192.png`, `jugadora-512.png`, `apple-touch-icon-180.png`, `src/jugadora/main.jsx`,
  `src/jugadora/AppJugadora.jsx`, `src/jugadora/IngresoJugadora.jsx`, `src/jugadora/portal.js`,
  `src/jugadora/jugadora.css`
- Modificar: `vite.config.js` (`input` suma `jugadora: 'jugadora/index.html'`)
- Test: `tests/portalJugadora.interaccion.mjs`

**Interfaces:**
- **`portal.js`** exporta envoltorios de las RPC de la Tarea 1. Cada uno devuelve `{data, error}`, con
  `error.code` igual a `'cuenta_inactiva'` cuando la base responde 42501:
  - `obtenerPerfil()`
  - `obtenerNumeros(anio)`
  - `wellnessRespondio()`
  - `guardarWellness(valores)`
  - `guardarRpe({fecha, tipo, rpe})`
  - `entrenamientoHoy()`
- **`AppJugadora`** decide qué mostrar según la sesión:
  - Sin sesión → `IngresoJugadora`.
  - Con sesión y `obtenerPerfil` correcto → las pestañas de la Tarea 6.
  - `cuenta_inactiva` → «Esta cuenta no está activa. Hablá con coordinación.», con «Cerrar sesión».
  - Si además `mi_rol()` no es NULL, agrega «Esta es la app de jugadoras. Abrí el sistema del club» con un link a `/`.

**Valores fijos:**
- **Manifest:** `name` «Club Comunicaciones · Jugadoras», `short_name` «Comunicaciones», `start_url` «/jugadora/»,
  `scope` «/jugadora/», `display` «standalone», íconos locales de 192 y 512 px.
- **Íconos:** salen de `public/Escudo simplificado.png`, sobre el fondo de `--ui-fondo-pagina`.
- **Service worker:** sin caché ni manejo de fetch; en esta etapa solo hace `install` y `activate`. Se registra con
  `{scope:'/jugadora/'}`.
- **Ingreso, paso 1:**
  - Campo «Tu email» y botón «Enviar link y código».
  - Llama a `signInWithOtp({email, options:{shouldCreateUser:false, emailRedirectTo: origin + '/jugadora/'}})`.
  - Pase lo que pase (salvo un error de red), muestra el mensaje fijo de las reglas generales.
- **Ingreso, paso 2:**
  - Campo «Código de 6 dígitos» (`inputmode="numeric"`, `autocomplete="one-time-code"`) y botón «Entrar».
  - Llama a `verifyOtp({email, token, type:'email'})`.
  - Si falla: «El código no es válido o venció. Pedí uno nuevo.», con el botón «Pedir otro código».
- **Ayuda de instalación** (desplegable «Instalar en el celular»):
  - **iPhone:** abrir en Safari, Compartir, Agregar a pantalla de inicio. Adentro de la app, entrar con el código.
  - **Android:** menú ⋮ de Chrome, Instalar app o Agregar a pantalla de inicio.

Pasos:

- [ ] **Paso 1: escribir el test que falla.** Casos:
  - Un mail desconocido (el cliente simulado devuelve «Signups not allowed for otp») muestra el mismo mensaje que
    un mail registrado.
  - Un código incorrecto muestra el error y el botón para pedir otro.
  - Un código correcto con la cuenta activa muestra la navegación.
  - `cuenta_inactiva` muestra su mensaje.
  - Con un perfil de staff aparece el link a `/`.
  - Leer `public/jugadora/manifest.webmanifest`: `start_url` y `scope` son `/jugadora/`, y ningún ícono apunta a
    `supabase.co`.
- [ ] **Paso 2.** Correr `node --test tests/portalJugadora.interaccion.mjs`: tiene que dar FAIL.
- [ ] **Paso 3.** Implementar.
- [ ] **Paso 4.** Correr el test (PASS). Después, `npm run build` tiene que generar `dist/jugadora/index.html`, y
  `npm run lint` tiene que pasar.
- [ ] **Paso 5.** ux-audit y viewports sobre la pantalla de ingreso, a 375 px y a 1280 px, y
  verification-before-completion.

### Task 6 (Tarea 6): pestañas de la jugadora (Inicio, Wellness, Mis números)

**Archivos:**
- Crear: `src/jugadora/InicioJugadora.jsx`, `src/jugadora/WellnessJugadora.jsx`, `src/jugadora/MisNumeros.jsx`
- Modificar: `src/jugadora/AppJugadora.jsx` (barra de pestañas abajo, mobile primero, con objetivos táctiles de
  44 px o más)
- Test: `tests/portalJugadora.interaccion.mjs` (se agregan casos)

**Interfaces:**
- Usa `portal.js` (Tarea 5), `FormularioWellness` y `FormularioRpe` (Tarea 4), y `EntrenamientoDeHoy`, que ya existe.

**Pantallas:**
- **Inicio:** foto, nombre y categoría. Una tarjeta «Wellness de hoy» con «Completar Wellness» o
  «Ya completaste el Wellness de hoy», y el entrenamiento de hoy si está publicado.
- **Wellness:** los dos formularios, con las mismas reglas de fecha que el link público.
- **Mis números:**
  - Selector de año, con los `anios` que devuelve la base.
  - **Partidos:** jugados, titularidades y minutos.
  - **Entrenamientos:** presentes, tardes, ausentes y justificadas, más el porcentaje grande. Sin registros se
    muestra «Sin registros este año».
  - No aparece ningún otro dato.

Pasos:

- [ ] **Paso 1: escribir el test que falla.** Casos:
  - Con los números de la Tarea 1, se ven `3`, `2`, `145'` y `56 %`.
  - `porcentaje:null` muestra «Sin registros este año».
  - Guardar el Wellness llama a `guardarWellness` y la tarjeta pasa a «Ya completaste».
  - El texto de la página no contiene «semáforo», «evaluación» ni «médic».
- [ ] **Paso 2.** Correr `node --test tests/portalJugadora.interaccion.mjs`: tiene que dar FAIL en los casos nuevos.
- [ ] **Paso 3.** Implementar.
- [ ] **Paso 4.** Correr el test (PASS), `npm run build` y `npm run lint`.
- [ ] **Paso 5.** ux-audit y viewports de cada pestaña, a 375 px y a 1280 px, y verification-before-completion.

### Task 7 (Tarea 7): el sistema del staff deriva las cuentas de jugadora

**Archivos:**
- Modificar: `src/App.jsx`, en el bloque `perfil === null` (`App.jsx:185`)
- Test: se agrega un caso en `tests/auditoriaAccesos.interaccion.mjs` o en un archivo nuevo
  `tests/derivarJugadora.interaccion.mjs`

**Comportamiento:** si no hay perfil, se llama a `supabase.rpc('portal_mi_perfil')`:
- Si responde bien, se ejecuta `window.location.replace('/jugadora/')`.
- Si no, se muestra el mensaje actual sin cambios.

Pasos:

- [ ] **Paso 1.** Escribir el test que falla con los dos casos: con cuenta, redirige; sin cuenta, mensaje actual.
- [ ] **Paso 2.** Correrlo: FAIL.
- [ ] **Paso 3.** Implementar.
- [ ] **Paso 4.** Correrlo: PASS.

---

## Puesta en producción (en este orden)

Todo se hace en el panel web. No hace falta la terminal de Supabase.

**A. Gmail** (cambio del 2026-11-16: se usa una cuenta de Gmail nueva y exclusiva de la plataforma, con
verificación en dos pasos, en lugar de Resend). La contraseña de aplicación nunca pasa por el chat ni por el repo.

1. Entrar a myaccount.google.com con la cuenta de la plataforma → **Seguridad** → **Contraseñas de aplicaciones**.
   Si no aparece, buscar «contraseñas de aplicaciones» en el buscador de la cuenta.
2. Ponerle de nombre «Supabase Club» y apretar **Crear**. Google muestra 16 letras **una sola vez**: se pegan
   directo en el paso B.1, sin guardarlas en ningún archivo.

**B. Supabase Auth**

1. **Authentication → Emails → SMTP Settings**: activar **Enable custom SMTP** y completar:
   - Sender email: la dirección de Gmail de la plataforma. Tiene que ser la misma cuenta, porque Gmail reescribe
     cualquier otro remitente.
   - Sender name: `Club Comunicaciones`
   - Host: `smtp.gmail.com`
   - Port: `465`
   - Username: la dirección de Gmail completa
   - Password: las 16 letras del paso A.2, sin espacios

   Guardar.
2. **Authentication → Rate Limits**: dejar «emails por hora» en 30. Alcanza para un plantel y queda lejos del
   límite diario de Gmail.
3. **Authentication → Emails → Templates → Magic Link**:
   - Asunto: `Tu acceso al Club Comunicaciones`
   - Cuerpo: un saludo, el link `{{ .ConfirmationURL }}` con el texto «Entrar», y el código `{{ .Token }}`, con la
     aclaración «Si usás la app instalada en el iPhone, escribí este código adentro de la app». Sumar el aviso de
     que vence en 1 hora y de que, si no lo pediste, ignores el mail.
4. **Authentication → Sign In / Providers → Email**: dejar **Email OTP Expiration** en `3600` y **Email OTP Length**
   en `6`. Volver a confirmar que **Allow new users to sign up** sigue apagado.
5. **Authentication → URL Configuration**: dejar la **Site URL** en la URL de producción. En **Redirect URLs**,
   agregar:
   - `https://<produccion>/jugadora/`
   - `https://*-<tu-equipo>.vercel.app/jugadora/`, para las previews de Vercel.
   - `http://localhost:5173/jugadora/`
6. La prueba del mail se hace en el paso E.2, porque `/jugadora/` recién existe cuando el código está publicado.

**C. SQL** (cuando la Tarea 1 esté revisada)

Se puede correr antes de publicar el código: solo agrega cosas y cierra 4 lecturas que solo usaba alguien sin rol.

1. En el editor SQL, correr completo `supabase/migrations/20261116120000_cuentas_jugadoras_etapa1.sql` y mandarme
   el resumen final.
2. Si algo sale mal, la reversión es `supabase/rollback/20261116120000_cuentas_jugadoras_etapa1.sql`. Aborta si ya
   hay cuentas creadas: primero se desactivan y se borran en **Authentication → Users**.

**D. Edge Function**

1. Ir a **Edge Functions → Deploy a new function → Via Editor**.
2. Ponerle de nombre `cuentas-jugadoras`, pegar el contenido de `supabase/functions/cuentas-jugadoras/index.js` y
   hacer **Deploy**.
3. En los ajustes de la función, dejar **Enforce JWT verification** (o «Verify JWT») **activado**.
   - Si todas las llamadas de coordinación fallan con 401 o con un error genérico, y los **Logs** de la función
     muestran que el gateway rechaza el token (pasa en los proyectos que usan las nuevas claves de firma de JWT),
     apagar ese interruptor. Es seguro: la función igual valida el token con `auth.getUser` y el rol con `mi_rol()`.
4. No hay que cargar secretos: `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los pone Supabase.
   Igual, comprobar en **Edge Functions → Secrets** que aparezcan los tres. Si falta alguno, la función responde
   `error_interno` y su log dice «faltan secretos» con el nombre (nunca el valor).
5. **Prueba de humo**, porque la función nunca corrió en Deno real. Con la preview abierta:
   - **Edge Functions → Secrets** lista `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`.
   - Una llamada sin sesión tiene que dar 401.
   - Con un usuario técnico, intentar crear una cuenta tiene que dar 403 «sin_permiso».
   - Con coordinación, la pantalla de Jugadoras carga la lista sin errores de CORS en la consola.

   Si algo falla, mirar **Edge Functions → cuentas-jugadoras → Logs** y pasarle el error al asistente.

**E. Preview de Vercel** (rama `notificaciones`). Lo commitea y pushea el usuario.

1. Crear en el plantel una jugadora «Prueba Portal», en una categoría.
2. **Prueba del mail:** abrir `/jugadora/` en la URL de la preview y pedir el código con tu mail de staff. Tiene
   que llegar desde la cuenta de Gmail de la plataforma (la del paso B.1). Si no llega, revisar spam y
   **Authentication → Emails → SMTP Settings**. La app va a decir «Esta es la app de jugadoras»; es lo esperado.
3. Desde Usuarios → Jugadoras, crearle una cuenta con un mail tuyo distinto del de staff.
4. Seguir la lista de prueba de abajo.
5. Al terminar, desactivar la cuenta y borrar a «Prueba Portal». Después borrar también su usuario en
   **Authentication → Users**: si queda ahí, ese mail no se puede volver a usar para otra cuenta.

**F. Pasar a main** solo con tu OK.

## Regla para migraciones futuras

Toda tabla nueva en `public` con RLS tiene que llevar la política RESTRICTIVE `sin_cuentas_jugadoras`. Sin ella,
una jugadora logueada (que es `authenticated`) podría leer la tabla si alguna política permisiva la deja pasar:

```sql
CREATE POLICY sin_cuentas_jugadoras ON public.<tabla> AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT portal_privado.es_cuenta_jugadora()))
  WITH CHECK (NOT (SELECT portal_privado.es_cuenta_jugadora()));
```

Para comprobarlo, correr en el editor SQL `supabase/verification/20261116_tablas_sin_red_jugadoras.sql` (solo
lectura). Tiene que devolver 0 filas; cada fila es una tabla de `public` con RLS que no tiene la política:

```sql
SELECT c.relname AS tabla
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND c.relrowsecurity
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = c.relname
      AND p.policyname = 'sin_cuentas_jugadoras'
      AND p.permissive = 'RESTRICTIVE'
  )
ORDER BY c.relname;
```

## Cómo probarlo (lista para la preview)

**iPhone (Safari, iOS 16.4 o más):**
- [ ] Abrir `/jugadora/` → Compartir → Agregar a pantalla de inicio. El ícono tiene que ser el escudo local.
- [ ] Abrir desde el ícono: tiene que aparecer el ingreso de la jugadora, no el login del staff.
- [ ] Pedir el código, escribirlo y entrar. Inicio tiene que mostrar el nombre y la categoría.
- [ ] Cerrar la app del todo y volver a abrirla: sigue adentro.
- [ ] Abrir el link del mail en Safari: entra en Safari, no en la app. Es lo esperado y se explica en la ayuda.

**Android (Chrome):**
- [ ] Instalar y entrar con el link y, aparte, con el código.

**Datos:**
- [ ] Completar el Wellness desde la cuenta. Tiene que aparecer en el sistema del staff para esa jugadora, con la
  fecha de hoy.
- [ ] Cargar el RPE de ayer. Si se elige una fecha de hace 4 días, la base lo tiene que rechazar.
- [ ] Mis números: tiene que coincidir con el perfil de la jugadora en el sistema del staff (partidos, titularidades,
  minutos y conteo de asistencias).

**Bordes:**
- [ ] Un mail que no existe: mismo mensaje y no llega nada. En Authentication → Users no aparece ningún usuario
  nuevo.
- [ ] Desactivar la cuenta con la app abierta: la siguiente acción muestra «Esta cuenta no está activa».
- [ ] Entrar con la cuenta de jugadora en `/`: redirige a `/jugadora/`.

**Staff:**
- [ ] Coordinación, técnico, PF y médico ven lo mismo que antes en Plantel, Wellness, Asistencia y Análisis.

**Link público:**
- [ ] `/?bienestar=<categoría>` sigue funcionando igual.
