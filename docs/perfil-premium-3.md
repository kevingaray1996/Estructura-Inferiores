# Perfil de rendimiento Premium 3.0

## Entrega visual

Se conserva el controlador del perfil 2.0 y sus seis pestañas. La portada utiliza
la fotografía institucional original existente y el mismo escudo público usado en
Inicio. Los degradados se aplican con CSS; no se modificaron imágenes.

Resumen combina los siete acumulados originales con barras por año, última evaluación
y contexto autorizado de asistencia, Wellness y RPE. Rendimiento conserva el detalle
por estadística y la tabla anual. Los gráficos muestran los mismos agregados: no agregan
tasas por 90 ni porcentajes de participación. Un solo año se presenta como acumulado;
los registros sin fecha permanecen en los totales, fuera del gráfico cronológico.

La última evaluación se elige por período: un final corresponde al cierre de su año,
después de sus meses. Se identifica mensual/final y se conserva el promedio original
por criterio y el promedio de esos criterios. No es una calificación nueva ni la fecha
de edición del registro. Asistencia es acumulada; Wellness/RPE usan sus 7 días originales.

Los bloques nuevos respetan las condiciones de presentación del perfil 2.0 y distinguen
errores, denegación y ausencia. No se realizaron nuevas lecturas, cambios de permisos
ni pruebas con cuentas reales. RLS continúa siendo la autoridad de acceso.

## Viabilidad de Videoanálisis individual — solo auditoría de código

### Fuentes y vínculos comprobados

- `analisis_eventos`: `id`, `jugador_id`, `partido_id`, `tipo`, `resultado`, `segundo`,
  `periodo`, `coordenada_x`, `coordenada_y`, `zona`, según las lecturas existentes.
- `jugador_id` identifica la autora. `partido_id` identifica `analisis_partidos`,
  no directamente el encuentro deportivo.
- El vínculo deportivo fiable es `analisis_partidos.partido_calendario_id` hacia
  `partidos.id`. No asociar por coincidencia de rival/fecha: Análisis tiene un fallback
  visual histórico así, pero el motor de Rendimiento ya exige el vínculo por ID.
- La fuente de minutos es `estadisticas_jugador`, no el segundo de la última acción.
  Varios análisis del mismo partido no justifican duplicar minutos.
- Análisis obtiene el video de `video_url` o de los campos del partido asociado.
  `abrirEventoEnVideo` realiza el salto y espera a que esté listo el reproductor del
  partido correcto. El perfil no tiene actualmente un contrato para abrir una acción
  exacta en Análisis; debe diseñarse explícitamente antes de habilitar ese acceso.

### Métricas existentes reutilizables

`utils/rendimiento/metricas.js` ya separa lectura fallida/null de lectura correcta/[]:

- Precisión: Pase correcto / (Pase correcto + Pase incorrecto), por tipos.
- Efectividad: exitosos / (exitosos + fallidos), por resultados.
- Exitosos: Exitoso, Gol, Atajada. Fallidos: Fallido, Fuera, Bloqueado.
- Neutro, resultado pendiente/vacío y valores desconocidos no entran al denominador.
- Los tipos disponibles abarcan pases, pérdida, recuperación, remate, centro, duelos
  ofensivo/defensivo/aéreo, atajada, salida de arquera, gol, faltas, intercepción y despeje.
- `construirRendimiento` ya filtra fechas/partidos/período, detecta vínculos no fiables,
  duplicados e información ausente. No acredita etiquetado completo ni suma goles
  etiquetados a goles oficiales.

### Coordenadas y mapas

`AnalisisSection.jsx` contiene CanchaInteractiva y funciones locales de coordenadas.
Su mapa limita valores al campo y representa zonas antiguas mediante centros aproximados
con `exacta:false`. Esa representación no demuestra que exista un origen exacto.

`utils/trayectoriasPases.js` ofrece `puntoExacto`, que exige ambos valores finitos en
[0,100], y `trayectoriaExacta`, que exige origen y destino de un pase. `FlechasPases`
es reutilizable como capa SVG. Destinataria/destino proceden de `analisis_pases_detalle`.
No inferir destino desde una zona, destinataria o posición.

La dirección inicial y el período existen, pero la convención espacial histórica
no está acreditada por cada registro (ver `docs/trayectorias-pases.md`). No invertir
ni clasificar automáticamente puntos históricos. Un mapa de acciones no es un mapa
de desplazamientos ni una medición GPS.

### Permisos, carga y propuesta posterior

El acceso del perfil a Video es un enlace existente; no prueba autorización para
consultar Análisis. La navegación y filtros actuales de Análisis tampoco sustituyen
RLS. No se consultó producción ni se verificaron políticas desplegadas en esta tarea.
El menú actual ofrece Análisis a Coordinación y al recorrido técnico, no al recorrido
Médico ni al de Preparación Física. Análisis consulta la sesión/perfil y calcula su
edición administrativa; además, la consulta de partidos deportivos usa una categoría
fija. No trasladar esas condiciones automáticamente a un perfil de otra categoría.

Una futura integración autorizada debería:

1. Definir roles habilitados según reglas existentes, sin ampliar RLS.
2. Reutilizar/adaptar el lector paginado `utils/rendimiento/lecturas.js` a un alcance
   individual y categoría autorizada, sin cargar toda la categoría innecesariamente.
3. Reutilizar el motor, con carga diferida única al entrar al área; cancelación de
   respuestas antiguas y errores de cada fuente separados de cero o vacío.
4. Mostrar eventos del ID de jugadora, partido y período seleccionados; solo coordenadas
   exactas para el mapa preciso y advertencias explícitas para ubicaciones por zona.
5. Extraer componentes de cancha únicamente si se autoriza intervenir Análisis,
   preservando su etiquetado/reproductor. Conectar un contrato de navegación por
   ID de análisis + ID de evento + segundo, no abrir un segundo reproductor.
6. Probar permisos por rol, varios análisis/partido, acciones sin jugadora, coordenadas
   inválidas/ausentes, cobertura desconocida y saltos de video.

Es viable con fuentes y utilidades existentes; no hace falta SQL para una primera
consulta individual si las políticas actuales lo permiten. Confirmar acceso real,
vínculos y referencia espacial antes de implementar. En esta entrega no hay mapas,
pestañas ficticias, controles vacíos ni consultas de Videoanálisis nuevas.

## Revisión pendiente

La comprobación automatizada con datos simulados no equivale a inspección visual.
Revisar en Preview a 1440, 768 y 390 px, ambos temas: portada, fotos reales, barras,
evaluaciones por evaluador/período, selección de sesión física y documentos existentes.
No se modificaron generadores PDF ni el flujo de eliminación; se conserva el riesgo
anterior de operaciones de borrado consecutivas no transaccionales.
