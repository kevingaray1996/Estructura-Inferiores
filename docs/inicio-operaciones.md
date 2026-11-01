# Inicio: centro de operaciones (cambios locales)

## Fuentes y alcance

- Wellness diario reutiliza la lectura que ya tenía Inicio: Primera para Coordinación,
  Preparación Física y técnicos asignados a Primera. Médico mantiene su acceso contextual
  a Bienestar, sin incorporar respuestas individuales al resumen. No se amplía RLS.
- Primera se identifica con `obtenerCategoriaPrimeraDivision`; las jugadoras se obtienen
  con `obtenerJugadoresDeCategoria`, conservando sus reglas de elegibilidad.
  Los totales describen únicamente los registros accesibles a la sesión, no un censo
  que permita inferir filas ocultas por RLS. Lesionadas no se excluyen automáticamente.
- La lectura diaria de `bienestar` solicita solo ID y cinco indicadores. No obtiene
  observaciones, zonas de dolor ni respuestas de otras categorías. No hay escrituras.
- Los errores se distinguen de ausencia; una respuesta con al menos un indicador numérico
  cuenta como respuesta parcial, advirtiendo los campos faltantes. Sin indicadores válidos
  queda pendiente. No equivale a bienestar normal ni a una alerta médica.
- Umbrales diarios originales: promedio > 3 o algún indicador >= 4; alerta alta si promedio
  > 4 o algún indicador = 5. Se conserva el aviso grupal de diez o más respuestas con
  estrés > 3. No se sustituye este criterio por el Z-score histórico de BienestarComparativo.
- Actualización manual y fecha seleccionable, sin polling. Las respuestas de solicitudes
  anteriores se descartan. No se reconsulta al cambiar solamente la apariencia.

## Agenda y navegación

- Los partidos futuros provienen de la lectura existente de Inicio y no se consultan otra
  vez para la agenda. Planificaciones usan `cargarSesionesAgenda`, sin bloques ni notas
  internas. Videos usan los mismos campos y tipo de Calendario. `normalizarEventos`
  conserva IDs independientes, varias sesiones y la distinción entre video y entrenamiento.
- Actividad de hoy y próximas actividades no repiten eventos. Se conserva el alcance
  anterior de hoy/mañana para planificación, ampliándolo a los tipos de sesión disponibles;
  el próximo partido posterior se conserva. Calendario permite consultar fechas posteriores.
- La fecha actual se calcula con `fechaArgentina`. Los horarios se muestran tal como están
  registrados. Los enlaces de partidos y videos abren su fecha/categoría en Calendario;
  los de planificación abren la sesión exacta con el callback y el permiso existentes.
- Wellness individual utiliza el callback existente hacia Físico. No monta Físico en Inicio
  ni inicia sincronizaciones offline desde este panel. El selector de fecha de Inicio no
  impone una fecha a BienestarComparativo, que conserva sus filtros históricos existentes.
- Plantel y Rendimiento comparten acceso a Plantel: no se crea una ruta ni un mecanismo
  paralelo para la pestaña interna. Planificación solo aparece cuando `puedePlanificar`.

## Presentación y preservación

- Se conservan cumpleaños, avisos existentes, estado del plantel, último resultado y
  resumen deportivo acumulado (ahora desplegable). DataFem conserva la misma consulta,
  identificación, tablas desplegables, fuente y fecha de actualización; la variante compacta
  muestra partidos jugados únicamente cuando el registro identificado ya los contiene.
- CSS de pantalla aislado bajo Inicio, tokens existentes, controles de 44 px y foco visible.
  Tres columnas en escritorio, dos en tablet y una en celular. Sin cambios de impresión/PDF.
- Se reutilizan las pelotas originales sin alterar sus bytes. La portada usa
  `inicio-equipo-cuerpo-tecnico-original.jpeg`, con degradados CSS y encuadre al 18 % en
  escritorio/tablet. En celular se muestra completa arriba con el texto debajo.
  `entrenamientos-abrazo-equipo-original.jpeg` queda reservada sin uso en otras pantallas.
  Ambos archivos se copiaron byte a byte desde los originales adjuntos de Descargas y se
  verificaron con SHA-256. No se emplean sustitutos ni variantes editadas.
- Pendiente inspección visual real a 1440/768/390 px, en claro/oscuro/automático, y validación
  de lecturas con una sesión autorizada. Las pruebas usan datos simulados sin servicios reales.
