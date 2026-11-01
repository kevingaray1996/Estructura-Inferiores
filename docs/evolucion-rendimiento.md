# Evolución Premium

## Datos y filtros

Evolución utiliza la misma lectura de Rendimiento que Comparativas y Rankings.
No consulta nuevas tablas ni escribe datos. Fechas civiles y partido se comparten
entre las tres pestañas. Se puede restringir además a un conjunto propio de partidos;
sin selección se utiliza todo el rango, y el filtro de partido único tiene prioridad.
Las selecciones de jugadoras reutilizan el límite común de seis, sin duplicados.

Los partidos con fecha válida se ordenan por fecha y luego ID. Los que no tienen
fecha válida se informan aparte y no se posicionan artificialmente en el gráfico.
Solo se asocian análisis por el vínculo deportivo auditado. No se infieren vínculos
por rival ni por fecha, ni cobertura completa por existencia de eventos.

## Gráfico y ausencia de datos

Cada punto corresponde a un partido deportivo. Varias fichas de análisis no duplican
los minutos de participación. Minutos pueden existir aunque falte un análisis;
las métricas de acciones necesitan su análisis vinculado y accesible.
No se dibujan puntos faltantes ni se unen tramos a través de ellos. Un cero registrado
es válido y no representa una calificación deportiva. El eje vertical usa el máximo
de las series visibles, con mínimo técnico de 1 si todos los valores son cero.
Resaltar una jugadora atenúa las demás sin quitarlas ni cambiar la escala vertical.
La escala conserva el máximo de todas las series disponibles con los filtros activos;
se recalcula ante nuevos datos, filtros o indicadores. Los colores coinciden con la leyenda.

Fechas y rivales se presentan en una lista HTML numerada para no encogerlos dentro
del SVG móvil. Se incluyen tabla completa, motivos de ausencia, interacción por
teclado y controles HTML ampliados para consultar puntos sin depender de precisión
táctil. Las tablas se desplazan dentro de su contenedor, no a nivel de toda la página.

## Comparación de períodos

A y B se definen por fechas o grupos de partidos y se intersectan con el alcance
actual del gráfico. Ambos deben estar definidos antes de mostrar resultados.
Los grupos vacíos no se convierten en todos los partidos. Se informa solapamiento.

Cada período se recalcula con el motor compartido sobre sus eventos y participación:

- Precisión: suma de pases correctos / suma de correctos e incorrectos.
- Efectividad: suma de resultados exitosos / suma de exitosos y fallidos.
  Neutros, pendientes y desconocidos quedan fuera del denominador.
- Por 90: acciones registradas del período × 90 / minutos de exactamente esos
  partidos; no es el promedio de las tasas por partido.
- Diferencia: B − A. En porcentajes se expresa en puntos porcentuales.
- Variación relativa: (B − A) / A × 100, solo con valores calculables y A distinto
  de cero. No se inventan variaciones con base cero o registros ausentes.

Se muestran partidos incluidos, partidos con minutos confirmados, minutos,
numeradores y denominadores. Se advierte muestra pequeña con menos de 180 minutos,
tres partidos o, en porcentajes, diez acciones del denominador; y si la participación
está incompleta. La cobertura se mantiene desconocida. Ninguna diferencia se presenta
como mejora o empeoramiento definitivo, ni se mezclan goles oficiales y etiquetados.

## Validación pendiente

Inspección visual real a 1440, 768 y 390 px en claro/oscuro, y lectura con una cuenta
autorizada. Las pruebas automatizadas usan datos simulados sin servicios reales.
