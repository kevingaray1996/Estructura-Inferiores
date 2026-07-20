# Guía paso a paso: clonar la app para un club nuevo

Esta guía es para que tu amigo la siga de punta a punta con su propia cuenta de GitHub, Supabase y Vercel. No hace falta que sepa programar — son todo pasos de clickear y copiar/pegar.

Antes de arrancar, tu amigo necesita crear (gratis) estas tres cuentas, si no las tiene:
- GitHub → github.com
- Supabase → supabase.com
- Vercel → vercel.com (puede entrar directo con su cuenta de GitHub)

---

## 1) Conseguir el código

Opción más simple, si el repositorio es público:
1. Andá a `https://github.com/gastonpaolorossi-eng/Estructura-Inferiores`
2. Arriba a la derecha, click en **Fork**.
3. Elegí tu cuenta de GitHub como destino y confirmá. Ya tenés tu propia copia del código, independiente de la mía.

Si el repositorio es privado (no se ve sin estar logueado como vos):
- Opción A: entrá a GitHub → el repo → **Settings → Collaborators** → agregá el email/usuario de tu amigo como colaborador. Después él hace **Fork** o simplemente trabaja directo sobre una rama.
- Opción B (más prolija para separar del todo los proyectos): descargá el código como ZIP (botón verde **Code → Download ZIP**), pasáselo a tu amigo, y que él cree un repositorio nuevo y vacío en su GitHub y suba esos archivos ahí (se puede arrastrar el ZIP descomprimido directo en la web de GitHub, "uploading an existing file").

---

## 2) Crear el proyecto en Supabase

1. Entrá a supabase.com → **New project**.
2. Elegí una organización (o creá una nueva, es automático).
3. Nombre del proyecto: el nombre del club (por ejemplo "Club XYZ").
4. Database password: que genere una contraseña fuerte y **la guarde en un lugar seguro** (no hace falta acordársela para usar la app, pero puede servir después).
5. Región: la más cercana (ej. South America).
6. Click en **Create new project** y esperá 1-2 minutos a que termine de aprovisionar.

---

## 3) Cargar la base de datos

1. En el proyecto de Supabase, andá al menú lateral → **SQL Editor** → **New query**.
2. Abrí el archivo `script_maestro.sql` que te paso adjunto, copiá **todo** el contenido y pegalo en el editor.
3. Click en **Run** (o Ctrl/Cmd + Enter). Tiene que terminar sin errores — crea todas las tablas, los permisos y las políticas de seguridad de una sola vez.

---

## 4) Crear el bucket de Storage (para fotos, escudos, informes y videos)

1. Menú lateral → **Storage** → **New bucket**.
2. Nombre exacto: `Biblioteca` (con B mayúscula, tiene que ser igual porque el código lo busca así).
3. Marcá **Public bucket: ON**.
4. Create bucket.

(Las políticas de quién puede subir/editar archivos en ese bucket ya quedaron creadas por el script del paso 3.)

---

## 5) Habilitar el login por email/contraseña

Por defecto ya viene habilitado, pero conviene chequear:
1. Menú lateral → **Authentication → Providers**.
2. Confirmá que **Email** esté en verde/activado.
3. Opcional pero recomendado: en **Authentication → Settings**, desactivar "Confirm email" si no quieren que cada usuario nuevo tenga que confirmar por mail antes de poder entrar (como ustedes cargan los usuarios a mano, no hace falta ese paso extra).

---

## 6) Crear el primer usuario (el que va a ser "coordinación")

1. Menú lateral → **Authentication → Users → Add user → Create new user**.
2. Cargá el email real de tu amigo y una contraseña.
3. Volvé a **SQL Editor → New query** y corré esto, reemplazando el email y el nombre:

```sql
insert into perfiles (email, nombre, rol)
values ('email-de-tu-amigo@ejemplo.com', 'Nombre Apellido', 'coordinacion')
on conflict (email) do update set rol = 'coordinacion';
```

Con eso, ese usuario va a poder loguearse en la app y va a tener el rol de coordinación (acceso a todo).

---

## 7) Conseguir las credenciales del proyecto

1. Menú lateral → **Settings → API**.
2. Copiá dos datos, los vas a necesitar en el paso siguiente:
   - **Project URL** (algo como `https://xxxxx.supabase.co`)
   - **anon public key** (una key larga, empieza distinto según la versión pero está claramente etiquetada "anon public")

---

## 8) Publicar la app en Vercel

1. Entrá a vercel.com, logueate con GitHub.
2. **Add New → Project**.
3. Elegí el repositorio que forkeaste/creaste en el paso 1 → **Import**.
4. Vercel detecta automáticamente que es un proyecto Vite, no hace falta tocar nada de configuración de build.
5. Antes de darle a Deploy, abrí **Environment Variables** y cargá estas dos:
   - `VITE_SUPABASE_URL` = el Project URL que copiaste en el paso 7
   - `VITE_SUPABASE_ANON_KEY` = el anon public key del paso 7
6. Click en **Deploy** y esperá 1-2 minutos.
7. Cuando termina, te da una URL tipo `nombre-del-proyecto.vercel.app` — esa es la app ya funcionando.

---

## 9) Cambiar el nombre del club en el código

Estos son los únicos lugares donde el nombre "Estructura Inferiores" está escrito en el código. Se puede editar directo desde GitHub (lápiz de editar en cada archivo) sin instalar nada:

- `src/components/Login.jsx` → línea con el texto "Estructura Inferiores" (arriba del formulario de login).
- `src/components/Layout.jsx` → línea con "Estructura Inferiores" (encabezado de la app, arriba de todo).
- `src/utils/generarCitacion.js` → dos lugares: el texto `'EI'` que son las iniciales del escudo propio en el PDF de citación, y el texto "Estructura Inferiores" que arma el nombre del club junto con la categoría.
- `src/utils/generarPerfilPDF.js` → el pie de página "Estructura Inferiores — generado el ..." del PDF de perfil de jugador.

**Importante**: en `src/data/formaciones.js` también aparece el texto `'EI'` varias veces, pero ahí **no hay que tocarlo** — es el código de posición "Extremo Izquierdo" en la cancha, no tiene nada que ver con el nombre del club.

Cada vez que edite un archivo en GitHub, tiene que hacer **Commit changes** — eso dispara automáticamente un redeploy en Vercel (tarda 1-2 minutos en verse reflejado).

---

## 10) Cargar las categorías del club

1. Entrá a la app ya publicada (la URL de Vercel) y logueate con el usuario del paso 6.
2. Andá a la sección donde se administran categorías (o si todavía no hay pantalla para eso, se puede cargar por SQL Editor):

```sql
insert into categorias (nombre, orden, es_reserva) values
  ('Novena', 1, false),
  ('Octava', 2, false),
  ('Séptima', 3, false);
  -- etc, una fila por categoría del club, "orden" define el orden en que aparecen
```

---

## 11) Probar que todo funcione

- Login con el usuario de coordinación.
- Crear una categoría y un jugador de prueba.
- Subir una foto (confirma que el bucket Biblioteca quedó bien configurado).
- Copiar el link público de bienestar (botón 🔗 en el encabezado) y probar que abra sin pedir login.

Si algo de esto falla, lo más común es: variables de entorno mal copiadas en Vercel (paso 8), o el bucket con nombre distinto a `Biblioteca` (paso 4).
