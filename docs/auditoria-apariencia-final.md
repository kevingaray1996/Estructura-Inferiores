# Auditoría final de apariencia — Fases 1 a 8

Rama: `desarrollo-comunicaciones`. Revisión estática del árbol activo desde `App.jsx` y del arranque/proveedor desde `main.jsx`, más renderizados con datos simulados. No se consultó ni escribió Supabase. Esta revisión no sustituye la prueba visual con sesiones reales.

## Inventario conectado: 50 componentes

| Grupo | Componentes revisados |
| --- | --- |
| Compartidos (6) | Layout, Login, InicioSection, TablaDataFem, BuscadorGlobal, CategoriaFiltro |
| Plantel y evaluaciones (7) | PlantelSection, ListaJugadores, AgregarJugador, CargaMasiva, PerfilJugador, PdfPerfilModal, EvaluacionesSection |
| Gestión y salud (13) | CalendarioSection, EntrenamientosSection, AsistenciaSection, MedicosSection, NutricionSection, PsicologiaSection, CaptacionSection, UsuariosSection, RepresentantesSection, PensionesSection, ContratosSection, PaseCategoriaSection, ConvocatoriasSeleccionSection |
| Partidos y video (8) | PartidosSection, AgregarPartido, ListaPartidos, ConvocarPartido, ComparativaJugadoras, EquiposSection, VideoSection, EstadisticasEquipo |
| Wellness y físico (5) | FisicoSection, CargaWellness, BienestarComparativo, BienestarPublico, CicloComparativo |
| Cargas y riesgo (6) | CargaEntrenamiento, RPEComparativo, CargaCMJ, CMJComparativo, SemaforoRiesgo, AlertasDatosFisicos |
| Análisis (4) | AnalisisSection (video, explorador, estadísticas, mapa e informe), DetalleDestinatariaPase, DetalleDestinoPase, FlechasPases |
| Informes (1) | InformesAutomaticosSection |

También se revisaron el selector, proveedor, gestor, paletas, variables CSS, estados de App y estilos globales. CanchaPlantel, CargarEstadisticas, FormacionPartido y Formaciones no tienen importación en el árbol activo: no se modificaron; revisar su apariencia si se vuelven a conectar. El aviso técnico de arranque sin configuración local conserva sus colores propios.

## Cambios de Fase 8

- Informes: tarjetas blancas en claro, títulos y selección con contraste, error legible y foco visible en temporada. Las consultas, cálculos, roles y reglas de impresión permanecen iguales.
- Inicio: las transparencias del estado sin último resultado admiten variables CSS mediante el helper ya existente. Los colores hexadecimales conservan su transparencia original.
- Físico: el resumen de pegado deja de tener un fondo oscuro fijo con texto oscuro al usar claro. Su respaldo oscuro sigue siendo #1A1A18.
- Se preservan fondos negros de video, superposiciones, canchas verdes, colores de puntos/flechas, chips funcionales y documentos imprimibles. No corresponden a errores de tema.
- Los sufijos hexadecimales restantes se aplican a paletas hexadecimales deportivas/institucionales; no se reemplazaron indiscriminadamente.

## Verificación técnica

- Resultado final: 64 pruebas aprobadas secuencialmente; compilación normal y bundle completo en memoria correctos. `git diff --check` sin errores.
- Ejecutar `node --test --test-concurrency=1 tests/*.test.mjs` y `npm.cmd run build`.
- La compilación normal sin configuración local valida el aviso de arranque. Se verifica además el bundle completo en memoria con valores ficticios, sin modificar .env ni conectar al backend.
- ESLint completo: 22 errores y 3 avisos, todos preexistentes en HEAD; ningún diagnóstico nuevo en las ocho fases. No se corrigieron reglas de hooks, variables sin uso ni permisos fuera del alcance visual.
- Se compararon las reglas de impresión y generadores existentes contra HEAD. Las variables claras se declaran dentro de `@media screen`; no se agregaron reglas globales con `!important`.
- Los tests de apariencia incluyen persistencia por usuario, automático y cambios del dispositivo, almacenamiento bloqueado, contraste y renderizado con datos simulados.

## Revisión visual manual pendiente

Usar escritorio de 1366–1440 px, móvil de 360–390 px y, si está disponible, tableta de 768 px. Repetir cada grupo en Claro y Oscuro. En Automático, alternar el esquema del dispositivo y confirmar el cambio en vivo.

1. Iniciar sesión, elegir Claro, navegar y volver a ingresar: debe conservar la preferencia. Repetir con Oscuro. Cambiar de usuario: no debe heredar la preferencia ajena. Sin sesión, comprobar Login y enlace público de bienestar con inicio legible.
2. Abrir menú lateral normal/compacto y móvil. Comprobar selector, foco por teclado, usuario, búsqueda global, filtros y desplazamiento. Cambiar tema con un formulario escrito: no deben perderse campos ni selección.
3. Inicio: escudo/marca de agua visible sin tapar texto; tarjetas, alertas y DataFem legibles. Revisar el estado sin partidos y el último resultado cuando exista.
4. Plantel: búsqueda, filtros, fotos, estados, cancha táctica, ficha completa y enlaces. Abrir alta/edición, carga masiva y modal de PDF sin guardar datos. Evaluaciones: pestañas, formulario, puntajes, selección y vista previa.
5. Gestión/salud: calendarios, formularios abiertos, tablas, filas alternas, mensajes, estados vacíos y botones. Comprobar tablas anchas en móvil sin perder columnas mediante desplazamiento horizontal.
6. Partidos/video: lista, resultado, convocatoria y sus pestañas, formación verde, comparativa y biblioteca. Los enlaces y el reproductor deben abrir y funcionar igual. Cambiar tema con video reproduciéndose: no debe reiniciarse.
7. Físico: todas las pestañas permitidas, carga manual, resumen de pegado, tablas, comparativos y gráficos. Revisar RPE, CMJ, alertas y semáforo con registros normales, moderados, de alerta y sin datos. Los números, etiquetas y colores deben distinguirse sin depender sólo del color.
8. Análisis: cinco vistas internas, video y controles de tiempo, etiquetado, explorador, filtros, selección y navegación a una acción, estadísticas, mapa y ambos editores de pases. Cambiar tema no debe reiniciar video, selección ni formularios. Verificar que puntos y flechas conserven significado y posiciones. No guardar durante una revisión exclusivamente visual.
9. Informes: minutos, sin participación, goles/asistencias y registros médicos cuando corresponda; temporada, estados vacíos, error y actualización. Comparar resultados entre temas.
10. Vista previa de impresión/PDF: revisar Análisis, Evaluaciones, perfil e Informes. Contrastar con una salida anterior: colores, paginado y contenido deben mantenerse. Esta comprobación visual de documentos aún no se realizó.

### Roles

| Cuenta | Qué revisar |
| --- | --- |
| Coordinación | Todos los módulos habilitados; Informes médicos; edición de análisis sólo si la cuenta tiene el UUID autorizado |
| Cuerpo técnico | Categoría asignada, convocadas de Reserva cuando corresponda, Informes sin opción médica y mismos controles permitidos antes del cambio |
| Médico | Menú médico/salud, bienestar y consulta de Evaluaciones; ausencia de acceso ampliado a Informes |
| Preparador físico | Cargas, CMJ, semáforo y módulos permitidos; ausencia de acceso ampliado a Informes |
| Público sin sesión | Selección de jugadora, formulario de bienestar y RPE, selección de valores y mensajes; no enviar respuestas reales durante la revisión visual |

## Pendientes y límites

- Falta ejecutar esta revisión visual con datos y roles reales, incluyendo teclado, móvil y vista de impresión. Los renderizados de prueba no comprueban composición real en navegador ni reproducción de YouTube.
- Los errores históricos de ESLint requieren una intervención funcional separada si se decide resolverlos.
- No se realizaron commits, merges, push ni despliegues. Los tres SQL sin seguimiento y los datos existentes permanecen intactos.
