# Rankings de Rendimiento

Comparativas y Rankings comparten la misma lectura paginada, limitada por categoría
y sesión, y los filtros de fechas civiles y partido. Cambiar de pestaña no duplica
consultas. No hay persistencia global ni nuevas operaciones de guardado. Un cambio
de cuenta invalida los resultados visibles y las respuestas anteriores se ignoran.

## Criterios

- Se reutilizan `construirRendimiento` y `detalleMetrica`. Las dos clases de duelos
  usan el mismo conteo por tipo que Comparativas. No se calculan puntajes globales.
- Minutos: participación deportiva del conjunto filtrado, sin multiplicarla por
  la cantidad de análisis del partido. Partidos jugados: filas únicas de ese
  conjunto con minutos mayores a cero. Si falta participación en algún partido,
  no se presume cero y el agregado de participación no es calculable.
- Porcentajes: se muestran numerador y denominador reales; precisión usa tipos
  de pases, efectividad usa resultados evaluados, excluyendo neutros y pendientes.
- Por 90: se exigen análisis vinculados y minutos positivos de los mismos partidos,
  con las reglas ya utilizadas por Comparativas. No se completan denominadores.
- Cada métrica admite únicamente modalidades compatibles. Minutos y partidos solo
  cantidades; precisión y efectividad solo porcentaje; conteos absoluta o por 90.
- Se excluyen valores ausentes, no finitos o negativos. Un cero confirmado de
  acciones registradas sigue siendo cero registrado, nunca una nota de calidad.
- Los rankings de acciones requieren participación positiva confirmada o eventos
  propios en el alcance. Sin ambas evidencias, la jugadora se excluye, aunque el
  conteo técnico fuera cero. La evidencia de eventos admite cantidades absolutas
  con aviso de participación incompleta, sin habilitar tasas por 90 inválidas.
- Se advierte muestra pequeña si faltan minutos/partidos, hay menos de 180 minutos,
  menos de tres partidos o, en porcentajes, menos de diez acciones del denominador.
  Son avisos, no exclusiones de valores calculables. La cobertura es desconocida.
- Orden descendente sin redondeo previo. Empates exactos comparten puesto mediante
  numeración de competición (1, 1, 3). Nombre e ID solo estabilizan la presentación.
- Podio: primeras tres filas calculables, o únicamente una/dos si ese es el número
  disponible. Nunca hay lugares rellenados. Los empates se conservan en el podio y
  la clasificación completa; puede haber más jugadoras empatadas fuera del Top 3.
- Barras: proporción del valor respecto del máximo de la métrica y filtros actuales.
  Si todos son cero, las barras tienen ancho cero. El valor numérico sigue visible.

## Pendientes de revisión real

Probar con sesión autorizada a 1440, 768 y 390 px en claro/oscuro/sistema. Verificar
fotografías, nombres largos, filtros compartidos, cambios de pestaña y ausencia de
desbordamientos. Las pruebas automatizadas usan fuentes simuladas, no producción.
