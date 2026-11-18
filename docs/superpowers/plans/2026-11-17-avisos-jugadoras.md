# Avisos al celular para las jugadoras (etapa 2): plan de implementación

> **Para quien ejecute el plan:** usar superpowers:subagent-driven-development (recomendado) o
> superpowers:executing-plans, tarea por tarea. Los pasos tienen casillas (`- [ ]`) para ir marcando.

**Objetivo.** Avisos push atados a la cuenta de cada jugadora:
- recordatorios automáticos de Wellness y RPE según el calendario de cada categoría;
- entrenamiento publicado;
- convocatoria con botón;
- mensajes manuales del staff;
- una pantalla de coordinación con horarios, pausas, quiénes los activaron e historial.

**Arquitectura.**
- **Cola en la base.** Toda alta de aviso es una fila en `avisos_envios`, con una clave única para no duplicar.
- **Tarea cada minuto.** Una tarea de `pg_cron` corre `avisos_privado.tick()`: programa los recordatorios que tocan
  y, si hay pendientes, llama por `pg_net` a la Edge Function `avisos-enviar` con un secreto propio.
- **Despacho.** La función toma los pendientes, resuelve los destinatarios en ese momento, manda los push con VAPID
  y registra el resultado.
- **Jugadora.** Se suscribe desde su app con las funciones `portal_avisos_*`. **Staff.** Usa funciones con control
  de rol.

**Tecnologías.** Supabase (Postgres con `pg_cron`, `pg_net` y Vault; Edge Functions en Deno con
`jsr:@negrel/webpush`), React 19 y Vite. La app de la jugadora usa Web Push API y su service worker. Tests con
node:test, PGlite y jsdom, como en la etapa 1.

**Diseño:** `docs/superpowers/specs/2026-11-17-avisos-jugadoras-design.md`.

## Reglas para todo el plan
- **Commits.** No se commitea sin pedido del usuario. Cuando lo pide, se agregan los archivos uno por uno y se
  pushea solo a `origin/avisos`. Antes de cada commit se comprueba que no entren `INFORME.md`,
  `supabase/auditoria-seguridad/`, `.superpowers/`, `.env*` ni claves.
- **SQL:**
  - un único bloque `DO` por archivo, sin BEGIN/COMMIT ni tablas temporales;
  - `set_config('lock_timeout','5s',true)` y `pg_notify('pgrst','reload schema')` adentro;
  - respaldo en `seguridad_privado`, reversión en `supabase/rollback/` y verificación que simula cada rol.
- **Tablas nuevas.** Cada tabla de `public` lleva RLS, ningún permiso para anon ni authenticated, y la política
  RESTRICTIVE `sin_cuentas_jugadoras` con
  `FOR ALL TO authenticated USING/WITH CHECK (NOT (SELECT portal_privado.es_cuenta_jugadora()))`.
- **Funciones.** SECURITY DEFINER, `SET search_path = ''`, nombres calificados y `REVOKE ALL … FROM PUBLIC, anon`.
  Se otorga EXECUTE solo al rol que corresponde. anon no gana nada.
- **Claves.**
  - La clave privada VAPID y el secreto de la tarea viven solo en los secretos de la función y en el Vault.
  - La clave pública va en la variable de Vercel `VITE_AVISOS_VAPID_PUBLICA`.
  - Los logs nunca muestran mails, endpoints completos, claves ni textos de mensajes.
- **Hora.** Todo se calcula en hora de Argentina (`America/Argentina/Buenos_Aires`) dentro de la base.
- **Textos de los avisos.** Son exactamente los de la tabla «Textos fijos» del diseño.
- **Pantallas.**
  - Colores solo con `var(--ui-*)` o `src/theme.js`, mobile primero, controles de 44 px o más.
  - Al terminar cada una: ux-audit y viewports a 375 y 1280 px, y verification-before-completion.
- **PGlite.** La variable `PLANIFICACION_PG_PATH` apunta a la copia de PGlite que funciona, la misma de la etapa 1.

## Qué revisar con más cuidado
1. **El mismo aviso dos veces.** Si se publica, se retira y se vuelve a publicar, o si la tarea corre dos veces en
   el mismo minuto, sale una sola vez. Lo prueban la clave única de la Tarea 1 y su test.
2. **Recordatorio fuera de hora.** Si la tarea no corrió entre las 7:10 y las 8:40, ese día no sale. Lo prueba la
   Tarea 1.
3. **Una jugadora que desactivó un tipo, o que cambió de categoría.** No le llega ese tipo, y recibe según su
   categoría actual. Lo prueba la Tarea 1 (`avisos_destinos`).
4. **Celular compartido o suscripción vencida.** Un endpoint que pasa a otra cuenta queda solo en la nueva. Un 404
   o 410 del servicio de push borra la suscripción. Lo prueban las Tareas 1 y 2.
5. **Un técnico que manda a otra categoría o pasa el límite.** Recibe un rechazo con un mensaje claro. Lo prueban
   las Tareas 1 y 4.

## Archivos

| Archivo | Para qué |
|---|---|
| `supabase/migrations/20261117120000_avisos_etapa2.sql` + `supabase/rollback/…` | Tablas, funciones, trigger, tick y tarea de cron |
| `tests/avisos.postgres.mjs` | Migración, reglas del calendario, destinatarios, límites y reversión |
| `supabase/functions/avisos-enviar/index.js` | Despacho de push (exporta `procesar` para Node) |
| `tests/avisosEnviar.test.mjs` | Despacho con clientes simulados |
| `public/jugadora/sw.js` | Recibir el push y abrir la pestaña |
| `src/jugadora/avisos.js` | Plataforma, soporte, conversión de la clave y suscripción |
| `src/jugadora/AvisosJugadora.jsx` | Pestaña Avisos |
| `src/jugadora/AppJugadora.jsx`, `WellnessJugadora.jsx`, `portal.js`, `jugadora.css` | Cuarta pestaña, `?seccion=` y vista RPE inicial |
| `tests/avisosJugadora.interaccion.mjs`, `tests/avisosJugadora.test.mjs` | App de la jugadora |
| `src/components/avisos/AvisosSection.jsx` + `MandarAviso.jsx`, `HorariosAvisos.jsx`, `PausasAvisos.jsx`, `JugadorasAvisos.jsx`, `HistorialAvisos.jsx`, `avisos.css` | Sección Avisos del staff |
| `src/utils/avisos.js` | Mensajes de error y formatos |
| `src/components/Layout.jsx`, `src/App.jsx` | Registrar la sección `avisos` |
| `src/components/ConvocarPartido.jsx` | Botón «Avisar convocatoria» |
| `tests/avisosStaff.interaccion.mjs` | Pantallas del staff y botón de convocatoria |

---

### Task 1 (Tarea 1): migración de avisos

**Archivos:** la migración, su reversión y `tests/avisos.postgres.mjs`.

**Interfaces que produce.** Todas las funciones son SECURITY DEFINER.

**Tablas** (todas con RLS, la red RESTRICTIVE y sin permisos para anon ni authenticated):
- `avisos_config(categoria_id uuid PK → categorias ON DELETE CASCADE, activo boolean NOT NULL DEFAULT true, dias smallint[] NOT NULL DEFAULT '{3,4,5}', hora_wellness time NOT NULL DEFAULT '07:10', hora_rpe time NOT NULL DEFAULT '10:15', actualizado_por uuid, actualizado_at timestamptz)`
  - `dias` usa la numeración ISO (1 = lunes). CHECK: cada día va entre 1 y 7, sin repetidos, y la lista no está
    vacía.
  - La migración crea una fila por cada categoría existente.
- `avisos_pausas(id uuid PK, categoria_id uuid NULL → categorias ON DELETE CASCADE, desde date NOT NULL, hasta date NOT NULL CHECK (hasta >= desde), motivo text CHECK (length(btrim(motivo)) BETWEEN 1 AND 80), creada_por uuid, creada_at timestamptz DEFAULT now())`
  - Una pausa con `categoria_id` NULL vale para todas las categorías.
- `avisos_suscripciones(id uuid PK, jugador_id uuid NOT NULL → jugadores ON DELETE CASCADE, usuario_id uuid NOT NULL → auth.users ON DELETE CASCADE, endpoint text NOT NULL UNIQUE, p256dh text NOT NULL, auth text NOT NULL, dispositivo text NOT NULL CHECK IN ('iphone','android','compu','otro'), creada_at timestamptz DEFAULT now(), ultimo_ok_at timestamptz)`
- `avisos_preferencias(jugador_id uuid PK → jugadores ON DELETE CASCADE, wellness, rpe, entrenamiento, convocatoria, mensajes boolean NOT NULL DEFAULT true, actualizada_at timestamptz DEFAULT now())`
- `avisos_envios(id uuid PK, tipo text NOT NULL CHECK IN ('wellness','combinado','entrenamiento','rpe','convocatoria','manual'), categoria_id uuid NOT NULL → categorias ON DELETE CASCADE, fecha date NOT NULL, clave text UNIQUE, partido_id uuid → partidos ON DELETE SET NULL, jugadoras uuid[], texto text, enviado_por uuid, rol_remitente text, estado text NOT NULL DEFAULT 'pendiente' CHECK IN ('pendiente','enviando','enviado','error'), tomado_at timestamptz, destinatarias int, entregados int, fallidos int, sin_avisos int, creado_at timestamptz DEFAULT now(), enviado_at timestamptz)`

**Funciones de la jugadora** (EXECUTE para authenticated). La identidad sale de `portal_privado.mi_jugadora_id()`;
si no hay cuenta activa, error 42501 «Esta cuenta no está activa.».
- `portal_avisos_estado() → jsonb`: `{preferencias:{wellness,rpe,entrenamiento,convocatoria,mensajes}, dispositivos:int}`.
  Si no tiene fila de preferencias, todo va en true.
- `portal_avisos_suscribir(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text) → void`
  - El endpoint tiene que ser `https://` y su host tiene que coincidir con
    `^(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)$`.
    Largo máximo: 1000.
  - `p256dh` y `auth` son base64url: entre 80 y 100 caracteres y entre 16 y 32 caracteres.
  - Si algo no cumple, error 22023 `suscripcion_invalida`.
  - Hace upsert por endpoint. Si el endpoint era de otra jugadora, pasa a esta.
  - Deja como máximo 3 por jugadora y borra las más viejas.
- `portal_avisos_desuscribir(p_endpoint text) → void`: borra solo si el endpoint es suyo; si no, no hace nada.
- `portal_avisos_preferencias(p_wellness bool, p_rpe bool, p_entrenamiento bool, p_convocatoria bool, p_mensajes bool) → void`: upsert.

**Funciones del staff** (EXECUTE para authenticated). Cada una controla el rol con `mi_rol()` y `mi_categoria()`.
- `avisos_panel() → jsonb`, solo coordinación:
  `{categorias:[{categoria_id, nombre, activo, dias, hora_wellness, hora_rpe, jugadoras, con_avisos, hoy:{aplica, motivo}}], pausas:[{id, categoria_id, categoria, desde, hasta, motivo}]}`.
  - `motivo` puede ser: 'dia_de_entrenamiento', 'sesion_publicada', 'descanso', 'pausa', 'sin_entrenamiento' o
    'inactivo'.
- `avisos_jugadoras(p_categoria_id uuid) → jsonb`, solo coordinación:
  `[{jugador_id, nombre, apellido, cuenta:'activa'|'desactivada'|null, dispositivos:int, tipos:text[], preferencias:{…}}]`.
- `avisos_guardar_config(p_categoria_id uuid, p_activo boolean, p_dias smallint[], p_hora_wellness time, p_hora_rpe time) → void`,
  solo coordinación. Error 22023 `config_invalida`.
- `avisos_crear_pausa(p_categoria_id uuid, p_desde date, p_hasta date, p_motivo text) → uuid` y
  `avisos_borrar_pausa(p_id uuid) → void`, solo coordinación. Error 22023 `pausa_invalida`.
- `avisos_mandar(p_categoria_id uuid, p_jugadoras uuid[], p_texto text) → uuid`
  - Lo pueden usar coordinación, cualquier categoría, y técnico o PF solo con `p_categoria_id = mi_categoria()`.
    Si no corresponde: 42501 `sin_permiso`.
  - Texto: entre 3 y 140 caracteres después de quitar espacios. Si no: 22023 `texto_invalido`.
  - `p_jugadoras` NULL significa todo el plantel. Si se pasan, tienen que ser de esa categoría: si no, 22023
    `jugadoras_invalidas`.
  - Límites: 5 por remitente por día (P0001 `limite_remitente`) y 10 por categoría por día (P0001
    `limite_categoria`).
  - Guarda el tipo 'manual' y `rol_remitente` = `mi_rol()`.
- `avisos_avisar_convocatoria(p_partido_id uuid) → uuid`
  - Lo pueden usar coordinación o el técnico de la categoría del partido; si no, 42501.
  - `jugadoras` son las citadas del partido. Sin citadas: 22023 `sin_convocadas`.
  - Hasta 3 por partido por día: P0001 `limite_partido`.
- `avisos_historial(p_categoria_id uuid, p_limite int DEFAULT 50) → jsonb`
  - Coordinación ve cualquier categoría (NULL = todas). Técnico y PF ven solo la suya.
  - Devuelve `[{id, tipo, categoria, fecha, texto, remitente, estado, destinatarias, entregados, fallidos, sin_avisos, creado_at}]`.
  - `remitente` es el nombre del perfil, o «Automático».

**Funciones de service_role** (EXECUTE solo para service_role):
- `avisos_tomar_pendientes(p_max int DEFAULT 10) → jsonb`: marca como 'enviando' con
  `FOR UPDATE SKIP LOCKED`. También vuelve a tomar los que quedaron en 'enviando' hace más de 10 minutos.
- `avisos_destinos(p_envio_id uuid) → TABLE(suscripcion_id uuid, jugador_id uuid, endpoint text, p256dh text, auth text, titulo text, cuerpo text, url text, tag text, ttl int)`.
  Aplica las reglas de destinatarios del diseño y los textos fijos. Solo cuentas activas, y según la categoría
  actual de la jugadora.
- `avisos_cerrar_envio(p_envio_id uuid, p_entregados int, p_fallidos int, p_sin_avisos int, p_ok uuid[], p_vencidas uuid[]) → void`:
  borra las vencidas, actualiza `ultimo_ok_at` y deja el estado en 'enviado', o en 'error' si no entregó a nadie
  habiendo destinos.

**Esquema privado `avisos_privado`:**
- `programar(p_ahora timestamptz DEFAULT now()) → int`. Para cada categoría con config activa calcula:
  - `aplica = (día ISO ∈ dias OR hay una sesión publicada de Entrenamiento o Partido) AND NOT hay Descanso (publicado o borrador) AND NOT hay pausa`;
  - si aplica, la hora local está entre `hora_wellness` y `hora_wellness + 90 min`, y no existe la clave
    `manana:{cat}:{fecha}`, inserta tipo 'combinado' (si hay publicada) o 'wellness';
  - lo mismo con `hora_rpe` y la clave `rpe:{cat}:{fecha}`, tipo 'rpe'.
  - Devuelve cuántos envíos creó.
- Trigger `entrenamiento_publicado` (AFTER INSERT OR UPDATE OF estado, tipo, fecha ON `planificacion_sesiones`).
  Inserta 'entrenamiento' con la clave `entrenamiento:{cat}:{fecha}` (ON CONFLICT DO NOTHING) si se cumple todo
  esto:
  - la sesión quedó publicada, es Entrenamiento o Partido y su fecha es hoy en Argentina;
  - la hora actual es igual o posterior a `hora_wellness`;
  - la config de la categoría está activa;
  - no hay pausa ni Descanso;
  - no existe un envío 'combinado' con la clave `manana:{cat}:{fecha}`.
- `tick() → void`: hace `PERFORM programar()` y, si hay envíos pendientes o tomados hace más de 10 minutos, llama
  a `net.http_post`.
  - URL: `vault.decrypted_secrets` con nombre `avisos_funcion_url`.
  - Encabezados: `{'Content-Type':'application/json','x-avisos-secreto': <vault avisos_secreto>}`.
  - Si falta algún secreto del Vault, `RAISE NOTICE` y no llama.
- Tarea de cron: `cron.schedule('avisos-tick', '* * * * *', 'SELECT avisos_privado.tick()')`. La migración aborta
  si ya existe.

**Pasos:**
- [ ] **1.** Escribir el test que falla, `tests/avisos.postgres.mjs`.
  - Base: `supabase/esquema/esquema_real.sql`, la migración de la etapa C y la de la etapa 1, más stubs de `cron`,
    `net` y `vault`. `net.http_post` anota la llamada en una tabla.
  - Casos con hora fija, usando `programar('2026-11-19 10:10:00+00')`, que son las 7:10 del jueves en Argentina:

    | Caso | Esperado |
    |---|---|
    | día de entrenamiento sin sesión | 'wellness' |
    | con sesión publicada | 'combinado' |
    | segunda corrida | 0 nuevos (no duplica) |
    | Descanso en borrador | nada |
    | pausa de todas o de la categoría | nada |
    | martes con partido publicado | 'combinado' |
    | martes sin nada | nada |
    | 8:41 | nada (fuera de ventana) |
    | 10:15 | 'rpe' |
    | config inactiva | nada |
  - Trigger:
    - publicar a las 9:00 un día con 'wellness' a la mañana crea 'entrenamiento' una sola vez, aunque se retire y
      se vuelva a publicar;
    - con 'combinado' no crea nada;
    - publicar a las 6:00 no crea nada.
  - `avisos_destinos`:
    - Wellness excluye a quien completó.
    - En el combinado, quien completó recibe solo el texto de entrenamiento.
    - RPE excluye a quien tiene RPE de hoy.
    - Respeta cada preferencia, excluye cuentas desactivadas y usa la categoría actual.
    - La convocatoria va solo a las citadas, con el texto «Estás convocada: vs Rival · 22/11 10:00.».
  - Jugadora:
    - suscribir con un host que no está permitido da 22023;
    - el cuarto celular reemplaza al más viejo;
    - un endpoint de otra jugadora pasa a la nueva;
    - desuscribir un endpoint ajeno no hace nada;
    - no puede leer ninguna tabla nueva (0 filas o 42501).
  - Staff:
    - un técnico no puede mandar a otra categoría (42501);
    - el sexto aviso del día da `limite_remitente`;
    - el undécimo de la categoría da `limite_categoria`;
    - el cuarto aviso de convocatoria da `limite_partido`;
    - texto de 2 caracteres: `texto_invalido`;
    - un médico no puede nada;
    - anon no puede nada;
    - el historial del técnico solo muestra su categoría.
  - `tick`:
    - con un pendiente y los secretos del Vault, llama a `net.http_post` con el encabezado;
    - sin secretos, no llama.
  - Además: un solo DO por archivo; la reversión vuelve el catálogo a la foto anterior y desagenda la tarea; la red
    está en todas las tablas nuevas.
- [ ] **2.** Correrlo: tiene que fallar porque el archivo no existe.
- [ ] **3.** Escribir la migración y la reversión.
  - Patrón de la etapa 1: controles previos, respaldo y verificación dentro del DO, simulando una jugadora de
    prueba, coordinación, técnico, médico y anon, todo deshecho al final.
  - La verificación también llama a `programar` con horas fijas sobre datos de prueba que se deshacen.
- [ ] **4.** Correr el test (PASS) y después los de la etapa 1: `cuentasJugadoras`, `seguridadWellnessPublico`,
  `seguridadPasoB` y `pizarraEtapaC`.

### Task 2 (Tarea 2): Edge Function `avisos-enviar`

**Archivos:** `supabase/functions/avisos-enviar/index.js` y `tests/avisosEnviar.test.mjs`.

**Interfaces:**
- **Usa** de la Tarea 1: `avisos_tomar_pendientes`, `avisos_destinos` y `avisos_cerrar_envio`.
- **Produce** `export async function procesar({ admin, enviar, max = 10 }) → { envios:int, entregados:int, fallidos:int }`.
  - `enviar(destino, payload, { ttl, topic, urgency:'normal' })` devuelve `'ok' | 'vencida' | 'falla'`.
  - `payload` es `{titulo, cuerpo, url, tag}`.
- **Produce** `export async function atender(request, deps) → Response`:
  - OPTIONS: CORS. Otro método que no sea POST: 405.
  - Si el encabezado `x-avisos-secreto` no es igual a `AVISOS_SECRETO` (comparación de tiempo constante): 401.
  - Si todo está bien: `procesar` y 200 `{ok:true, envios, entregados, fallidos}`.
- **Deno.serve**, solo con `globalThis.Deno`:
  - importa dinámicamente `jsr:@supabase/supabase-js@2` y `jsr:@negrel/webpush`;
  - secretos que usa: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AVISOS_SECRETO`, `AVISOS_VAPID_KEYS` (JSON
    `{publicKey, privateKey}` en JWK) y `AVISOS_VAPID_SUBJECT` (`mailto:`);
  - arma el `ApplicationServer` una vez por pedido;
  - el resultado del envío depende de la respuesta del servicio: 201 o 2xx es ok, 404 o 410 es vencida, y
    cualquier otro error es falla.
- Logs con el patrón de la etapa 1: solo la etapa, el código y el mensaje. Nunca el endpoint, el texto ni claves.

**Pasos:**
- [ ] **1.** Escribir el test que falla, con clientes simulados:
  - un pendiente con 3 destinos (ok, vencida y falla) cierra con `(1, 1, 1)`, `p_ok=[id1]` y `p_vencidas=[id2]`;
  - sin destinos, cierra con `sin_avisos` y `entregados = 0`;
  - si `enviar` tira una excepción, cuenta como falla y sigue con los demás;
  - un secreto incorrecto o ausente da 401 sin tocar la base;
  - GET da 405;
  - ningún `console.error` incluye el endpoint ni el texto;
  - el archivo cumple la forma de la etapa 1 (sin imports arriba de todo, claves solo desde `Deno.env`).
- [ ] **2.** Correrlo: FAIL. **3.** Implementar. **4.** Correrlo: PASS.

### Task 3 (Tarea 3): app de la jugadora (pestaña Avisos, service worker y link a pestaña)

**Archivos:** `public/jugadora/sw.js`, `src/jugadora/avisos.js`, `src/jugadora/AvisosJugadora.jsx`,
`AppJugadora.jsx`, `WellnessJugadora.jsx`, `portal.js`, `jugadora.css` y sus tests.

**Interfaces:**
- **`portal.js`** suma `avisosEstado()`, `avisosSuscribir({endpoint, p256dh, auth, dispositivo})`,
  `avisosDesuscribir(endpoint)` y `avisosPreferencias({wellness, rpe, entrenamiento, convocatoria, mensajes})`.
- **`avisos.js`** exporta:
  - `plataforma(navigator, window) → 'iphone' | 'android' | 'compu' | 'otro'`;
  - `soporte({ plataforma, standalone, tienePush, permiso }) → 'listo' | 'instalar_iphone' | 'sin_soporte' | 'bloqueado'`;
  - `claveAplicacion(base64url) → Uint8Array`;
  - `suscribir(registro, clavePublica) → PushSubscription`;
  - `sincronizar()`: al abrir la app logueada, si hay suscripción y permiso, vuelve a llamar a
    `avisosSuscribir`.
- **Service worker:**
  - `push` muestra la notificación con el título, el cuerpo, `icon:'/iconos/jugadora-192.png'`, el `tag` y
    `data.url`;
  - `notificationclick` enfoca una ventana abierta del scope y la lleva a `data.url`, o abre una nueva.
  - Siguen sin caché y sin manejo de fetch.
- **`AppJugadora`:**
  - lee `?seccion=inicio|wellness|rpe|numeros|avisos` una sola vez después de entrar, abre esa pestaña (`rpe` es
    Wellness en la vista RPE) y limpia la URL con `history.replaceState`;
  - suma la pestaña **Avisos**: la barra pasa a 4 columnas;
  - al tocar «Salir», antes de cerrar la sesión intenta `avisosDesuscribir` y `subscription.unsubscribe()`.
- **`WellnessJugadora`** recibe `vistaInicial`.

**Pantalla Avisos**, según el soporte:
- **`instalar_iphone`:** «En el iPhone los avisos funcionan con la app instalada: Safari → Compartir → Agregar a
  pantalla de inicio, y abrila desde el ícono (iOS 16.4 o más).»
- **`sin_soporte`:** «Este navegador no recibe avisos. En Android usá Chrome; en iPhone, la app instalada desde
  Safari.»
- **`bloqueado`:** cómo volver a permitirlos en los ajustes del celular.
- **`listo` sin suscripción:** botón «Activar avisos», que pide el permiso al tocarlo.
- **Con suscripción:**
  - cinco interruptores con etiqueta visible: Wellness, RPE, Entrenamiento del día, Convocatoria y Mensajes del
    cuerpo técnico;
  - botón «Desactivar avisos en este celular»;
  - una línea aclaratoria: «Pueden tardar unos minutos y no llegan si el celular está sin conexión mucho tiempo.»
- **Sin `VITE_AVISOS_VAPID_PUBLICA`:** «Los avisos todavía no están disponibles.»

**Pasos:**
- [ ] **1. Tests que fallan:**
  - Unitarios de `plataforma` y `soporte`:
    - iPhone en Safari sin standalone da `instalar_iphone`;
    - iPhone con standalone y PushManager da `listo`;
    - permiso denegado da `bloqueado`;
    - Firefox iOS da `instalar_iphone`.
  - `claveAplicacion` con un vector conocido.
  - Interacción, con un navegador simulado (`Notification`, `serviceWorker.ready` y `pushManager` falsos):
    - activar llama a `portal_avisos_suscribir` con los campos del endpoint;
    - un interruptor llama a `portal_avisos_preferencias`;
    - desactivar llama a desuscribir;
    - `?seccion=rpe` abre Wellness en la vista RPE;
    - «Salir» desuscribe antes de `signOut`.
- [ ] **2.** Correrlos: FAIL. **3.** Implementar. **4.** Correrlos: PASS, más `npm run build` y lint.
- [ ] **5.** ux-audit y viewports de la pestaña Avisos, en todos sus estados, a 375 y 1280 px.

### Task 4 (Tarea 4): sección Avisos del staff

**Archivos:** `src/components/avisos/*`, `src/utils/avisos.js`, `Layout.jsx`, `App.jsx` y
`tests/avisosStaff.interaccion.mjs`.

**Interfaces:**
- **Usa** de la Tarea 1: `avisos_panel`, `avisos_jugadoras`, `avisos_guardar_config`, `avisos_crear_pausa`,
  `avisos_borrar_pausa`, `avisos_mandar` y `avisos_historial`.
- **Registro.** `seccionesParaRol` suma `{id:'avisos', label:'Avisos'}` para coordinación, técnico y
  preparador_fisico, en el grupo `equipo` después de `asistencia`. `App.jsx` muestra
  `<AvisosSection perfil={perfil} />`.
- **`src/utils/avisos.js`** exporta `mensajeErrorAvisos(error)`, que traduce cada código de la Tarea 1 a un texto.
  Por ejemplo, `limite_remitente` es «Ya mandaste 5 avisos hoy. Probá mañana.».

**Pestañas:**
- **Mandar aviso:**
  - categoría: fija para técnico y PF, selector para coordinación;
  - destinatarias: «Todo el plantel» o una lista con casillas;
  - campo «Mensaje» con contador hasta 140;
  - advertencia fija: «No pongas datos personales ni de salud: el aviso se ve en la pantalla bloqueada.»;
  - botón «Mandar aviso», con confirmación que dice a cuántas jugadoras va y cuántas tienen los avisos activados.
- **Horarios (coordinación):**
  - por categoría: interruptor Activos, días (lunes a domingo), hora de Wellness y hora de RPE;
  - «Guardar horarios»;
  - estado de hoy en una línea, por ejemplo «Hoy salen: día de entrenamiento» o «Hoy no salen: pausa
    (Vacaciones)».
- **Pausas (coordinación):** lista y alta (categoría o todas, desde, hasta, motivo); «Quitar pausa» pide
  confirmación con el motivo.
- **Jugadoras (coordinación):** por categoría, cada una con «Avisos activos en N celulares», «Sin avisos» o «Sin
  cuenta», y sus tipos activos.
- **Historial:** últimos 50, con tipo, categoría, fecha y hora, remitente, texto (solo en los manuales) y
  `entregados/destinatarias`. Se explica que «entregado» no significa «leído».

**Pasos:**
- [ ] **1. Test de interacción que falla:**
  - un técnico ve solo Mandar aviso e Historial, con la categoría fija;
  - mandar llama a `avisos_mandar` con el texto sin espacios de más;
  - `limite_remitente` muestra su mensaje;
  - guardar horarios llama a `avisos_guardar_config` con `dias` en ISO;
  - crear y quitar una pausa funciona, con confirmación;
  - el panel muestra el motivo de hoy.
- [ ] **2.** Correrlo: FAIL. **3.** Implementar. **4.** Correrlo: PASS, más build y lint.
- [ ] **5.** ux-audit y viewports de cada pestaña, a 375 y 1280 px.

### Task 5 (Tarea 5): «Avisar convocatoria»

**Archivos:** `src/components/ConvocarPartido.jsx` y `tests/avisosStaff.interaccion.mjs` (se suma un caso).

**Comportamiento:**
- El botón «Avisar convocatoria» está junto a guardar los convocados.
- Si hay cambios sin guardar, está deshabilitado y lo explica: «Guardá la convocatoria antes de avisar.»
- Pide confirmación: «Avisar a las N convocadas.»
- Llama a `avisos_avisar_convocatoria(partidoId)` y muestra «Aviso en camino a N convocadas.» o el error
  traducido por `mensajeErrorAvisos`.

**Pasos:**
- [ ] **1.** Escribir el caso de test que falla.
- [ ] **2.** Correrlo: FAIL. **3.** Implementar. **4.** Correrlo: PASS, más los tests existentes de convocatoria si
  los hay, build y lint.
- [ ] **5.** ux-audit y viewports.

---

## Puesta en producción (en este orden; todo desde el panel)

**A. Claves VAPID y secreto de la tarea.** Se generan en tu navegador y no pasan por el chat ni por el repo.
1. En una pestaña nueva de Chrome (puede ser `about:blank`), abrí la consola: F12 → Console.
2. Pegá este fragmento y apretá Enter:
   ```js
   (async () => {
     const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
     const publicKey = await crypto.subtle.exportKey('jwk', par.publicKey)
     const privateKey = await crypto.subtle.exportKey('jwk', par.privateKey)
     const raw = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey))
     const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
     console.log('1) AVISOS_VAPID_KEYS (secreto de Supabase):\n' + JSON.stringify({ publicKey, privateKey }))
     console.log('2) VITE_AVISOS_VAPID_PUBLICA (variable de Vercel):\n' + b64(raw))
     console.log('3) AVISOS_SECRETO (secreto de Supabase y del Vault):\n' + b64(crypto.getRandomValues(new Uint8Array(32))))
   })()
   ```
3. Dejá esa pestaña abierta hasta terminar los pasos B, C y E, y después cerrala. Lo que imprime no se guarda en
   ningún archivo.

**B. Secretos de la función.** En **Edge Functions → Secrets → Add new secret**:
- `AVISOS_VAPID_KEYS`: el texto 1, completo.
- `AVISOS_SECRETO`: el texto 3.
- `AVISOS_VAPID_SUBJECT`: `mailto:` seguido del Gmail de la plataforma.

**C. Vault.** En **Integrations → Vault** (o **Project Settings → Vault**) → **Add new secret**:
- Nombre `avisos_funcion_url`: `https://qvjviyjkxyngiggoeqlj.supabase.co/functions/v1/avisos-enviar`.
- Nombre `avisos_secreto`: el texto 3, el mismo del paso B.

**D. Función.**
1. Ir a **Edge Functions → Deploy a new function → Via Editor**.
2. Ponerle de nombre `avisos-enviar`, pegar `supabase/functions/avisos-enviar/index.js` y hacer **Deploy**.
3. En sus ajustes, **apagar** «Verify JWT». La protege el secreto: sin él responde 401.
4. **Prueba de humo:** abrir la URL de la función en el navegador tiene que dar 405, que es lo esperado para un GET.

**E. Vercel.** En **Settings → Environment Variables**, agregar `VITE_AVISOS_VAPID_PUBLICA` con el texto 2, para
**Preview** y **Production**. Se aplica en el próximo deploy.

**F. SQL.** Correr completo `supabase/migrations/20261117120000_avisos_etapa2.sql` en el editor SQL, con poco uso de
la app, y pasarme el resumen.
- Crea la tarea `avisos-tick`. En **Integrations → Cron** tiene que aparecer y correr cada minuto.
- Reversión: `supabase/rollback/20261117120000_avisos_etapa2.sql`.

**G. Preview.** El usuario autoriza el commit y el push a `origin/avisos`.

**H. Ajustes de la revisión final.** Correr completo `supabase/migrations/20261118120000_avisos_ajustes.sql` en el
editor SQL, con poco uso de la app, y pasarme el resumen. Se puede correr antes o después del merge a main: es
compatible con el código de las dos versiones.
- Agrega el corte de las 20:00 al aviso de una sesión publicada tarde, hace que `tick()` marque como error lo
  vencido (el historial ya no muestra «En cola» por horas) y deja la tarea `avisos-limpieza` buscando
  `avisos-tick` por nombre.
- No hace falta volver a desplegar la función `avisos-enviar` ni tocar Vercel.
- Reversión: `supabase/rollback/20261118120000_avisos_ajustes.sql` (si se revierte también la etapa 2, primero
  esta).
- Después, correr `supabase/verification/20261118_prueba_calendario_avisos.sql` (ver «Cómo probarlo»).

## Cómo probarlo con la cuenta de prueba (Esmilse Acosta)

**En vivo, en la preview, con Chrome en la compu o en Android.** El push funciona sin instalar nada. Esmilse es
una jugadora de prueba.
- [ ] **1. Activar.** Entrar a `/jugadora/` con Esmilse → pestaña Avisos → «Activar avisos» → permitir. En el
  staff, Avisos → Jugadoras, tiene que aparecer «Avisos activos en 1 celular».
- [ ] **2. Un manual solo a Esmilse.** Avisos → Mandar aviso → «Jugadoras elegidas» → Esmilse. Tiene que llegar en
  menos de 2 minutos y, al tocarlo, abrir Inicio. En Historial: «1 de 1».
- [ ] **3. Mensajes apagados.** En la pestaña Avisos de Esmilse, apagar «Mensajes» y mandarle otro manual: no tiene
  que llegar, y el historial lo cuenta como «sin avisos». Volver a prender «Mensajes».
- [ ] **4. Convocatoria.** En un partido donde Esmilse está convocada (guardada), tocar «Avisar convocatoria»: tiene
  que llegar «Estás convocada: vs …».
- [ ] **5. Un recordatorio de Wellness y uno de RPE, en una categoría de prueba** (así nunca se toca la
  planificación real de Primera):
  1. Crear la categoría «Prueba avisos» en la app.
  2. Pasar a Esmilse a «Prueba avisos» por un rato (es jugadora de prueba).
  3. En Avisos → Horarios, en «Prueba avisos»: marcar el día de hoy y poner la hora de Wellness 2 minutos más
     tarde que la hora actual. Tiene que llegar «Completá tu Wellness de hoy.».
  4. Lo mismo con la hora de RPE: tiene que llegar «Cargá tu RPE de hoy.» y, al tocarlo, abrir Wellness en la
     vista RPE.
  - Cada recordatorio sale **una sola vez por categoría y por día**: si hay que repetirlo, es al día siguiente
    (o con otra categoría de prueba).
- [ ] **6. Publicación tarde.** Publicar una sesión de hoy en «Prueba avisos» después de su hora de Wellness (y
  antes de las 20:00): tiene que llegar «Ya está tu entrenamiento de hoy.». Solo sirve si ese día no salió a la
  mañana el combinado («Ya está tu entrenamiento de hoy · Completá tu Wellness.»), porque ese ya avisó.
- [ ] **7. Dejar todo como estaba.** Borrar las sesiones de prueba, volver a pasar a Esmilse a Primera y borrar la
  categoría «Prueba avisos».

**Lo que no se puede probar en vivo** (que no se repita, que no le llegue a quien completó, la pausa, el Descanso,
la ventana de 90 minutos, que una sesión no se anuncia antes de su día y el corte de las 20:00): correr
`supabase/verification/20261118_prueba_calendario_avisos.sql` en el editor SQL, después de los ajustes (paso H).
No toca datos reales: todo lo de prueba se deshace. Todas las filas del resultado tienen que decir **OK**. Para
borrar la tabla de resultados después: `DROP TABLE seguridad_privado.prueba_calendario_avisos;`.

**En iPhone, en producción después del OK para main:** instalar la app, activar los avisos desde el ícono y recibir
un manual. Si se borra el ícono, el aviso deja de llegar hasta volver a activarlo. Con un iOS anterior a 16.4, la
pestaña Avisos pide actualizar el iPhone.
