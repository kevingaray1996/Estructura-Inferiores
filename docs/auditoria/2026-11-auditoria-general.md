# Auditoría general de la plataforma — noviembre 2026

Fecha: 20/11/2026. Rama: `auditoria-general`. **No se cambió nada** del código ni de la base: solo se leyó,
se compiló la app y se abrieron las pantallas de ingreso en el navegador.

## Cómo se hizo y qué no se pudo ver

- Se revisó el código de la app del staff, el portal de jugadoras, las Edge Functions y la copia de la estructura
  de la base que está en el repo (`supabase/esquema/esquema_real.sql`).
- Se usaron las pautas de las skills de UX de VectorLab (viewports, tipografía, colores, errores, formularios,
  teclado, superficies), web-design-guidelines, frontend-design, dataviz, las buenas prácticas de React (Vercel) y
  de Postgres (Supabase), y una revisión de seguridad.
- Se compiló la app (`npm run build`) para medir cuánto pesa.
- Se abrieron en el navegador, en celular (375 px) y en compu (1280 px), solo las pantallas que se ven **sin
  iniciar sesión**: el ingreso del staff y el ingreso de jugadoras. Las dos se ven bien y no se desbordan.
- **No se pudo ver por dentro** ninguna sección con sesión iniciada (no hay usuario de prueba para la auditoría).
  Todo lo visual de adentro sale de leer el código. Lo que necesita confirmarse con el celular en la mano está
  marcado como "a confirmar".
- La base real no se consultó. La copia de la estructura del repo es del 13/11, así que no muestra los cambios
  posteriores (cuentas de jugadoras, avisos, DataFem, etapa C de la pizarra).

## Las 10 mejoras de más impacto

1. **Hacer que la app cargue por partes.** Hoy, al entrar, el celular baja de una sola vez todas las secciones,
   más las herramientas de PDF y de Excel. Son unos 1,6 MB (460 KB comprimidos) antes de mostrar nada. Cargar cada
   sección recién cuando se abre, y el PDF y el Excel recién cuando se tocan esos botones, haría que la app abra
   bastante más rápido, sobre todo con datos móviles.
2. **Arreglar las goleadoras y asistidoras de "Estadísticas del equipo".** Esa pantalla trae las estadísticas de
   todas las categorías y después filtra en el teléfono. Supabase devuelve como máximo 1000 filas por consulta, así
   que cuando haya más, los totales van a salir incompletos sin ningún aviso. Además, si la consulta falla, no
   muestra el error.
3. **Borrar el respaldo de DataFem después del 27/11.** Quedó guardado el comando viejo, que tiene el secreto
   anterior. Ya no sirve, pero no conviene dejarlo. Hay que borrar la tabla de respaldo y el historial viejo de esa
   tarea (los pasos están en `supabase/functions/README.md`).
4. **Volver a exportar la estructura real de la base.** La copia del repo es del 13/11 y le faltan cuatro cambios
   grandes. Sin una copia al día, cada revisión de seguridad trabaja a ciegas.
5. **Sacar los colores fijos que no son del club.** Análisis tiene 156 colores escritos a mano, incluidos azul y
   violeta. Las formaciones del plantel y otras pantallas usan fondos oscuros fijos que en el modo claro se van a
   ver mal. Todo tendría que salir de la paleta del club (negro, amarillo y blanco; rojo y verde solo para errores
   y semáforo).
6. **Agrandar la letra chica.** Hay alrededor de 100 textos de 9, 10 y 11 px en más de 20 pantallas. En el
   celular, en la cancha, cuestan leerse. El mínimo recomendado es 12 px.
7. **Mensajes de error y confirmaciones claras.** Unas 15 pantallas muestran el error técnico de la base tal cual
   (en inglés). Además, varias confirmaciones de borrado dicen solo "¿eliminar este registro?", sin decir cuál. Lo
   ideal es usar mensajes en castellano que digan qué pasó y qué hacer, y confirmar diciendo qué se borra.
8. **Partir el archivo de Análisis.** `AnalisisSection.jsx` tiene 3527 líneas. Cualquier cambio ahí puede romper
   otra parte de la sección, y es la más usada en los partidos. Conviene separarlo en partes, como ya se hizo con
   Perfil y Plantel.
9. **Poner al día las pruebas automáticas.** Más de 20 pruebas viejas ya fallaban antes de los últimos cambios.
   Mientras sigan rojas, una prueba que falla no avisa de nada nuevo. Arreglarlas o darlas de baja devuelve la red
   de seguridad.
10. **Una sola consulta para categorías y jugadoras.** La lista de categorías se pide a la base desde 30 archivos
    distintos y la de jugadoras desde 46 lugares. Cargarlas una vez y compartirlas ahorra esperas al cambiar de
    sección y evita que dos pantallas muestren datos distintos.

## Tabla de hallazgos

Impacto: cuánto mejora la plataforma si se arregla. Esfuerzo: cuánto trabajo lleva. Riesgo: qué tan probable es
romper algo al arreglarlo.

### 1. Visual y facilidad de uso

| Sección | Problema | Por qué importa | Impacto | Esfuerzo | Riesgo |
| --- | --- | --- | --- | --- | --- |
| Varias (Análisis, Calendario, Físico, Wellness, Partidos, Evaluaciones, Médicos y otras) | Unos 100 textos de 9 a 11 px | En el celular no se leen bien, sobre todo al aire libre | Alto | Mediano | Bajo |
| Análisis | 156 colores escritos a mano, incluidos azul y violeta para tipos de acción | Se sale de los colores del club y no cambia con el modo claro | Alto | Mediano | Medio |
| Plantel (Formaciones), Perfil (gráficos de acciones), Evaluaciones, Calendario | Colores fijos y fondos oscuros escritos a mano | En modo claro pueden quedar manchas oscuras o poco contraste | Medio | Chico | Bajo |
| Perfil (gráfico de acciones) | "Otros" usa violeta | Violeta no es un color del club | Bajo | Chico | Bajo |
| Varias (unas 15 pantallas) | Los errores muestran el mensaje técnico de la base | El cuerpo técnico no entiende qué pasó ni qué hacer | Alto | Mediano | Bajo |
| Médicos, Nutrición, Psicología, Videos, Captación, Convocatorias | Confirmaciones de borrado genéricas ("este registro") con la ventanita del navegador | Es fácil borrar lo que no era; la ventanita no sigue el diseño | Medio | Mediano | Bajo |
| Varias | 164 lugares quitan el borde de foco y solo 77 ponen uno visible | Con teclado (en la compu) no se ve dónde se está parado | Medio | Mediano | Bajo |
| Análisis (Explorador y Estadísticas) | Tablas de 500 a 760 px de ancho mínimo | En el celular hay que deslizar de costado. A confirmar que se deslice solo la tabla y no toda la página | Medio | Chico | Bajo |
| Ingreso del staff | En el celular, el título grande queda pegado al recuadro, y la nota "¿No tenés usuario?" se lee poco | Detalle de terminación en la primera pantalla que se ve | Bajo | Chico | Bajo |
| Ingreso del staff y portal | Se ven bien en 375 y 1280 px, sin desbordes, y los botones tienen buen tamaño para el dedo | Está bien, sin cambios | — | — | — |
| Todas las secciones de adentro | No se pudieron ver con sesión iniciada | Falta un recorrido por rol en el celular | Medio | Chico | — |

### 2. Rendimiento

| Sección | Problema | Por qué importa | Impacto | Esfuerzo | Riesgo |
| --- | --- | --- | --- | --- | --- |
| Toda la app del staff | Todas las secciones se bajan juntas al entrar: 1,6 MB (460 KB comprimidos) | La app tarda en abrir, sobre todo con datos móviles | Alto | Mediano | Medio |
| Botones de PDF y Excel | Las herramientas de PDF, Excel e imagen (jsPDF, SheetJS, html2canvas) se bajan aunque nadie las use | Peso extra en cada ingreso | Alto | Chico | Bajo |
| Secciones ocultas (Representantes, Pensiones, Selección, Contratos, Psicología, Nutrición) | Están ocultas en el menú, pero se bajan igual | Peso que no se usa | Medio | Chico | Bajo |
| Estadísticas del equipo | Trae las estadísticas de todas las categorías y filtra en el teléfono | Lento, y con más de 1000 filas los totales salen mal (ver Información) | Alto | Chico | Bajo |
| Varias | Categorías pedidas desde 30 archivos; jugadoras desde 46 lugares | Esperas repetidas al moverse entre secciones | Medio | Mediano | Medio |
| Varias (40 archivos) | Consultas que traen todas las columnas (`select('*')`) aunque se usen pocas | Más datos por el celular de los necesarios | Medio | Mediano | Bajo |
| Estilos | La hoja de estilos principal pesa 130 KB | Aporta a la demora inicial | Bajo | Mediano | Medio |
| Pizarra (exportar video) | La herramienta de video (730 KB) se baja solo al exportar | Está bien hecho; sirve de modelo para el resto | — | — | — |

### 3. Información y gráficos

| Sección | Problema | Por qué importa | Impacto | Esfuerzo | Riesgo |
| --- | --- | --- | --- | --- | --- |
| Estadísticas del equipo | Goleadoras y asistidoras salen de una consulta que se corta en 1000 filas, y si falla no avisa | Los totales pueden quedar incompletos sin que nadie lo note | Alto | Chico | Bajo |
| Portal de jugadoras (Mis números) | La base calcula un porcentaje de asistencia que no se usa: la pantalla calcula otro con la regla nueva | Dos cálculos distintos del mismo número; si alguien usa el de la base, no coincide | Bajo | Chico | Bajo |
| Gráficos de Bienestar, CMJ y RPE | Comparativos hechos a mano, cada uno con su estilo | Cada gráfico se lee distinto; conviene un mismo estilo de leyenda, ejes y tooltip | Medio | Mediano | Bajo |
| Dorsal | El número sale de la última citación, no de un dato propio | Si una jugadora nunca fue citada, no tiene dorsal | Bajo | Mediano | Medio |
| Estructura de la base guardada en el repo | Es del 13/11 y le faltan cambios posteriores | Cualquiera que la lea se lleva una idea equivocada de la base | Medio | Chico | Bajo |
| `schema_completo.sql` y `script_maestro.sql` (raíz) | Son históricos y no reflejan la base | Confunden: parecen la base actual y no lo son | Bajo | Chico | Bajo |

### 4. Seguridad (lo que queda pendiente)

| Sección | Problema | Por qué importa | Impacto | Esfuerzo | Riesgo |
| --- | --- | --- | --- | --- | --- |
| DataFem | Después del 27/11 hay que borrar la tabla de respaldo con el comando viejo y el historial viejo de la tarea | Guardan el secreto anterior. Ya no sirve, pero no conviene dejarlo | Medio | Chico | Bajo |
| Base completa | La copia de la estructura del repo no está al día | No se puede revisar la seguridad actual sin entrar a la base | Medio | Chico | Bajo |
| Tablas nuevas | Algunos permisos automáticos de Supabase todavía le dan acceso a usuarios sin sesión en las tablas que se crean con ciertos usuarios internos | Una tabla nueva podría quedar abierta si no se revisa al crearla | Medio | Chico | Medio |
| Formularios públicos de Wellness y RPE | Con el link de la categoría se ven los nombres y las fotos del plantel sin iniciar sesión | Fue una decisión tomada a propósito; se anota para tenerla presente si el link circula fuera del plantel | Bajo | — | — |
| Biblioteca | El link de video de un ejercicio se usa sin el control de "link seguro" que sí tiene Entrenamiento de hoy | React ya bloquea los links peligrosos; es un control de más que conviene igualar | Bajo | Chico | Bajo |
| Edge Function de DataFem | La comparación del secreto no es de tiempo constante, como sí lo es en Avisos | Defensa extra; el riesgo real es muy bajo | Bajo | Chico | Bajo |
| Carpeta `.playwright-mcp` | Las capturas del navegador quedan en el repo y no están ignoradas por git | Podrían subirse a GitHub capturas con datos de la app | Medio | Chico | Bajo |
| Sin hallazgos graves | No se encontraron claves en el código, ni HTML inyectado, ni funciones de la base sin `search_path` | — | — | — | — |

### 5. Orden del código

| Sección | Problema | Por qué importa | Impacto | Esfuerzo | Riesgo |
| --- | --- | --- | --- | --- | --- |
| Análisis | `AnalisisSection.jsx` tiene 3527 líneas | Cada cambio es riesgoso y lento de revisar | Alto | Grande | Medio |
| Evaluaciones, Convocar partido, Carga de entrenamiento | Archivos de 900 a 1200 líneas | Lo mismo, en menor medida | Medio | Grande | Medio |
| PDFs | Nueve generadores de PDF, cada uno con su propia forma de cargar el escudo y las fotos | Un arreglo en un PDF no llega a los otros | Medio | Mediano | Bajo |
| Pruebas automáticas | Más de 20 pruebas viejas fallan desde antes, y una se corta por tiempo | Las pruebas dejan de avisar cuando algo se rompe | Alto | Mediano | Bajo |
| Revisión de estilo (lint) | 8 errores y 1 aviso, por ejemplo en Convocar partido | Señalan lugares donde la pantalla puede recargarse de más o quedar desfasada | Medio | Chico | Bajo |
| Secciones ocultas | Seis secciones ocultas siguen en el código y hay que mantenerlas | Trabajo extra en cada cambio general | Bajo | Chico | Bajo |
| `README.md` | Es el texto de ejemplo de Vite, no describe el proyecto | Quien llega al repo no sabe qué es ni cómo arrancar | Bajo | Chico | Bajo |

## Qué queda por confirmar en el celular

- Recorrer cada sección con un usuario de cada rol (coordinación, técnico, PF, médico) en 375 px y en compu.
- Que las tablas anchas se deslicen dentro de su recuadro y no muevan toda la página.
- Cómo se ven las secciones con colores fijos en el modo claro.
- La foto de la pantalla de compu quedó en "Cargando…", que muestra la demora del punto 1 de las mejoras.
