# Comparativas de Rendimiento

## Lectura y alcance

La galería no consulta nuevas fuentes. Comparativas lee, al abrirse, partidos de
la categoría del plantel, sus estadísticas oficiales, análisis de esa categoría
y eventos de esos análisis. Las lecturas son paginadas, sin escrituras. RLS
conserva la decisión de acceso. Los resultados se mantienen en el componente y
se descartan ante cierre/cambio de sesión; las respuestas tardías se ignoran.
Los filtros de fecha civil y partido se aplican localmente a las cuatro fuentes.
Una lectura vacía puede reflejar RLS y no acredita ausencia de registros global.

Solo `partido_calendario_id` verifica el vínculo entre un análisis y el partido
deportivo. No se infieren vínculos por fecha ni rival. Varios análisis del mismo
partido no multiplican sus minutos. No se deduplican acciones distintas por su
tipo o segundo; solo se identifican duplicados por ID de evento.

## Métricas

- Precisión: pases de tipo correcto / (correcto + incorrecto), independientemente
  del resultado evaluado. Sin pases, porcentaje no disponible.
- Efectividad: resultados exitosos / resultados exitosos y fallidos. Neutros,
  pendientes y resultados desconocidos no entran en el denominador.
- Cantidades: acciones registradas de cada tipo. Los goles etiquetados no se
  agregan a los goles oficiales.
- Tasas por 90: numerador y minutos de exactamente los mismos partidos
  deportivos. Faltan tasas si algún partido carece de vínculo/análisis o minutos
  positivos válidos. No se sustituyen datos ausentes por cero.
- Menos de 180 minutos genera advertencia, sin impedir una comparación.
- La cobertura del etiquetado siempre se declara desconocida.

## Radar

No es una calificación global ni ordena jugadoras por calidad.
Porcentajes: escala fija 0–100. Cantidades: escala 0–máximo del grupo de referencia
completo bajo los mismos filtros, con máximo mínimo de 1 cuando todos son cero.
Modo por puesto usa la posición principal exacta; el grupo futbolístico determina
los ejes. Modo libre usa ejes comunes. La búsqueda solo modifica las opciones
visibles; nunca la muestra estadística.

Percentiles: tanto la evaluada como la referencia necesitan minutos positivos
confirmados y un valor válido del indicador. Si la evaluada no cumple, se muestra
«Percentil no disponible» y se mantienen sus valores reales en la tabla.
La referencia usa rango medio de empates, al menos diez IDs distintos con valor válido
en cada eje y minutos positivos confirmados en todo el alcance filtrado. El grupo
de referencia no se limita a las seis seleccionadas. No ajusta por calidad ni
cobertura y no sustituye las cantidades y denominadores de la tabla.
Si un eje carece de dato se omite ese punto; las series incompletas no dibujan
polígonos. El valor ausente jamás se transforma en cero.

## Revisión manual pendiente

En 1440, 768 y 390 px, probar temas claro/oscuro/sistema, búsqueda, selección de
dos/seis, reemplazo, filtros, resaltado y desplazamiento horizontal de la tabla.
Verificar con cuentas reales autorizadas las lecturas permitidas por RLS, sin
crear ni modificar información. Las pruebas automatizadas usan fuentes simuladas.
