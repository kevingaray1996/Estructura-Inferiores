# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Reglas fijas del usuario

- Responder siempre en español rioplatense simple, sin tecnicismos innecesarios. El usuario no es programador.
- Respuestas cortas y al grano: resumir lo hecho y lo que se necesita del usuario, sin repetir todo el detalle.
- Antes de programar algo nuevo, mandar una propuesta corta y esperar su OK.
- Trabajar siempre en una rama nueva. Se puede hacer commit y push de la rama de trabajo sin pedir permiso cada
  vez. Lo único que necesita su OK explícito es pasar a `main`; al pasar, fast-forward sin force.
  Producción (Vercel) sale de `main`.
- No tocar la base de datos. Los cambios de base van en SQL de **un único bloque `DO`** (el editor de Supabase
  ignora `BEGIN`/`COMMIT`; no usar tablas temporales), con respaldo en `seguridad_privado`, verificación y script
  de reversión. Los corre el usuario en Supabase.
- Nunca escribir secretos en el chat, en el código ni en commits. Los secretos se cargan a mano en Supabase o Vercel.
- `INFORME.md` y `supabase/auditoria-seguridad/` nunca van a GitHub (están en `.gitignore`; no forzarlos).
- Nunca abrir PR ni hacer push al repo `gastonpaolorossi-eng` (es el remoto `upstream`). Solo `origin`.
- Colores del club: negro y amarillo, blanco de apoyo; rojo y verde solo para errores o semáforo. Todo tiene
  que funcionar bien en celular (el cuerpo técnico usa la app desde el teléfono).

## Qué es

App del Club Comunicaciones (fútbol femenino, inferiores) para el cuerpo técnico: plantel, asistencia, partidos,
físico/wellness, médicos, análisis de video, pizarra táctica, planificación, avisos, etc. Más un portal aparte
para las jugadoras. React 19 + Vite + Tailwind 4, JavaScript (sin TypeScript), backend en Supabase.

## Comandos

```
npm run dev       # servidor de desarrollo
npm run build     # compilar (siempre verificar que compile antes de dar algo por terminado)
npm run lint      # ESLint
node --test tests/<archivo>.mjs   # correr un test
```

No hay script de tests en `package.json`: se corren con `node --test`, de a uno o varios.

- `*.test.mjs`: lógica pura y lectura de archivos fuente; no necesitan nada extra.
- `*.interaccion.mjs`: montan componentes con jsdom y un servidor Vite de prueba (`tests/helpers/servidorVite.mjs`).
  jsdom se carga desde `%TEMP%/comunicaciones-pizarra-dom` (o `PIZARRA_DOM_PATH`).
- `*.postgres.mjs`: prueban migraciones, reversiones y verificaciones de `supabase/` en PGlite en memoria, con
  `%TEMP%/comunicaciones-planificacion-pg` (o `PLANIFICACION_PG_PATH`). Nunca tocan la base real.
- En Windows, correr los tests desde `C:\` con mayúscula: con `c:\` React se carga dos veces y fallan las
  interacciones.
- Hay tests viejos que ya fallaban antes de los cambios recientes; comparar contra `main` antes de atribuir una falla.

## Arquitectura

**Tres entradas de Vite** (`vite.config.js`):
- `index.html` → `src/main.jsx` → `src/App.jsx`: la app del staff. `App.jsx` maneja sesión, perfil y rol, y
  elige la sección a mostrar (no hay router). `src/config/visibilidadSecciones.js` oculta secciones de la
  navegación sin tocar permisos.
- `jugadora/index.html` → `src/jugadora/`: portal de jugadoras (cuentas propias, wellness, avisos push).
- `analisis-ventana.html` → `src/analisisVentana.jsx`: ventana auxiliar del videoanálisis en dos ventanas.

**Código:**
- `src/components/`: secciones (`*Section.jsx`) y subcarpetas por área (`hoy`, `inicio`, `perfil`, `avisos`, `ui`…).
- `src/utils/`: la lógica de negocio va acá, separada de los componentes, para poder testearla con `node --test`
  (rendimiento, semáforo de riesgo, pizarra, planificación, generadores de PDF con jsPDF, etc.).
- `src/hooks/`: hooks compartidos (permisos de Análisis, ventana de análisis).
- `src/config/club.js`: nombre y escudo del club, única fuente para pantallas y documentos.

**Colores y apariencia:** la fuente única de color son los tokens de `src/appearance/apariencia.css`.
`src/theme.js` (`COLORES`) solo los expone como `var(--ui-...)`. No escribir colores sueltos en componentes.

**Supabase:**
- Cliente en `src/supabaseClient.js` (lee `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` de `.env.local`).
  Manda el header `x-client-info` de `src/config/protocoloEscritura.js`. No es una credencial: un trigger de la
  base lo usa para rechazar versiones viejas de la app al modificar datos vinculados a partidos. Si se cambia el
  valor, hay que cambiarlo también en la base.
- La seguridad está en RLS. Toda tabla nueva de `public` necesita también la política RESTRICTIVE
  `sin_cuentas_jugadoras`, para que las cuentas de jugadoras no lean datos del staff.
- Hay esquemas privados para funciones y datos sensibles: `analisis_privado`, `medicos_privado`,
  `pizarra_privado`, `planificacion_privado`, `seguridad_privado` (respaldos).
- `supabase/migrations/` (cambios), `supabase/rollback/` (reversión con el mismo nombre),
  `supabase/verification/` (consultas de control y pruebas manuales). Cada cambio de base trae los tres y su test
  `*.postgres.mjs`.
- `supabase/esquema/esquema_real.sql`: estructura real de producción, sin datos. Es referencia, no se corre;
  ver `supabase/esquema/README.md` para regenerarlo. `schema_completo.sql` y `script_maestro.sql` de la raíz son
  históricos y no reflejan la base.
- `supabase/functions/`: Edge Functions (`cuentas-jugadoras`, `avisos-enviar`, `actualizar-datafem`). Son copias
  versionadas de lo publicado; no se publican desde acá. `supabase/functions/README.md` explica cómo se protege
  cada una (dos tienen Verify JWT apagado a propósito y usan un secreto del Vault llamado desde pg_cron).

**Docs:** `docs/` tiene los diseños de cada funcionalidad grande (`docs/*.md`, `docs/superpowers/`).
