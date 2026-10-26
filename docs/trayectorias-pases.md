# Trayectorias de pases

## Persistencia

- Origen: `analisis_eventos.coordenada_x/coordenada_y`, sin copiar, invertir ni modificar.
- Destino observado: `analisis_pases_detalle.destino_x/destino_y`, double precision,
  ambos NULL o ambos finitos en [0, 100]. No se deduce desde la zona o destinataria.
- Una fila sigue correspondiendo al mismo `evento_id`. Autora, periodo, segundo y
  partido se consultan en el evento; no se duplican en el detalle.
- La RPC nueva `guardar_destino_pase(uuid,double precision,double precision,bigint)`
  comparte `revision` y auditoria con `guardar_detalle_pase`.
- Revision esperada NULL: crear detalle si no existe (destinataria pendiente).
  Revision N: modificar solo si la actual es N. Toda escritura incrementa revision.
- Para quitar destino: enviar ambos puntos NULL y la revision actual. No se elimina
  la fila ni la destinataria. Quitar un destino sin fila previa se rechaza, no crea
  un detalle vacio. Guardar destino no requiere destinataria identificada.
- La RPC anterior no se reemplaza. Sus INSERT omiten destino (queda NULL), y sus
  UPDATE solo de destinataria conservan destino. Su retorno compuesto incorpora
  las columnas nuevas; el cliente existente selecciona campos explicitos y sigue
  utilizando revision. Validar esta compatibilidad tras aplicar, antes de publicar UI.
- Autorizacion: solo `auth.uid()` f7562d52-a16a-48b5-95a0-efbcc70080d3.
  Sin permisos directos de escritura. Bloqueos: evento -> detalle, igual que RPC anterior.
- No hay conversion, backfill ni cambios de filas existentes. Solo se agregan
  columnas opcionales, restriccion y RPC con sus permisos.

## Direccion existente y ambiguedad historica

El codigo calcula la direccion del primer tiempo desde
`partido.direccion_primer_tiempo`; para el segundo usa `direccionOpuesta`.
Se debe consultar el partido de CADA evento y `evento.periodo`, nunca el tiempo
activo del reproductor ni la configuracion del partido seleccionado en otra vista.

Sin embargo, `zonaDesdeCoordenadas`, las etiquetas DEFENSA/MEDIO/ATAQUE y el texto
de la interfaz describen una cancha normalizada: defensa a la izquierda, ataque a
la derecha. `CanchaInteractiva.manejarClick` guarda porcentajes del SVG sin hacer
conversiones segun la direccion. Los datos no registran la convencion utilizada
por la persona que etiqueto. No se puede determinar solo por X/Y si los puntos
historicos fueron interpretados como posiciones reales o ya normalizadas.

Antes de habilitar clasificacion automatica, contrastar algunos origenes exactos
de ambos tiempos con el video y confirmar una unica referencia espacial.
No cambiar direccion, invertir registros historicos ni crear otra configuracion.
Si no se puede confirmar la referencia, mostrar trayectoria sin clasificacion.

### Regla para una referencia FIJA de cancha real (ejemplos solicitados)

1. Validar periodo 1 o 2 y direccion registrada derecha/izquierda. Si falta o es
   invalida, no clasificar; no adoptar silenciosamente el default de la pantalla.
2. Direccion efectiva: primer tiempo = valor guardado; segundo = opuesta.
3. `deltaX = destino_x - origen_x`.
4. `avance = deltaX * (direccionEfectiva === 'derecha' ? 1 : -1)`.
5. Tolerancia lateral: 3 puntos porcentuales del largo de cancha, inclusivos.
   `abs(avance) <= 3`: lateral; `avance > 3`: adelante; `avance < -3`: atras.
   Es un criterio operacional (aprox. 3,15 m con largo de 105 m), no una medicion
   exacta del campo. No requiere configurar dimensiones nuevas.
6. Si ambos extremos coinciden, mostrar 'sin desplazamiento', no inferir pase lateral.

Ejemplos: X 20 -> 60 es atras con ataque izquierda y adelante con ataque derecha.
Con primer tiempo izquierda, el mismo desplazamiento es adelante en segundo tiempo.
X 50 -> 53 es lateral; X 50 -> 53,1 supera la tolerancia.

### Si se confirma que los datos YA estan normalizados al ataque

En esa referencia, `deltaX > 0` ya significa avance. Multiplicarlo otra vez por la
direccion real invierte incorrectamente los pases del tiempo con ataque izquierda.
Para interpretar con direccion real se puede transformar AMBOS extremos, solo en
memoria, a la referencia fija antes de aplicar la regla anterior. No transformar
solo uno de los extremos, ni persistir esa conversion. Esto debe quedar resuelto
antes de rotular automaticamente adelante/atras en la interfaz.

## Integracion del mapa

- Mantener eventos y filtros actuales; cargar detalles por evento separadamente.
- No usar el centro aproximado de `coordenadasEvento()` para dibujar flechas.
  Validar explicitamente ambos origenes/destinos finitos y dentro de [0, 100].
- Destino puede registrarse sin origen exacto, pero no genera flecha hasta contar
  con ambos puntos exactos. Las acciones conservan su representacion actual.
- Mostrar flecha SVG sobre la misma cancha: X en [0,100], Y multiplicado por 0,64.
  Conservar el punto de origen; verde correcto y rojo incorrecto segun `evento.tipo`.
- Clic en flecha abre ficha con autora, destinataria/estado, periodo y segundo del
  video; boton de video reutiliza `abrirEventoEnVideo` sin cambiar el reproductor.
- Editor de destino separado, solo UUID autorizado; mostrar origen exacto o aviso
  de ausencia. Clic manual marca destino; guardar/corregir/quitar via RPC nueva.
- Tras cualquier guardado de destinataria o destino, usar revision devuelta. Conflicto
  40001 o respuesta incierta: recargar antes de reintentar, sin sobrescritura automatica.
- No tocar estadisticas, informes, CanchaInformePDF ni etiquetado rapido.

Implementacion del cliente: `DetalleDestinoPase.jsx`, `FlechasPases.jsx` y
`utils/trayectoriasPases.js`, integrados solo en Mapa de zonas. La cancha compartida
admite una capa SVG opcional; el registro y la edicion habitual no reciben esa capa.
La ficha informa direccion real por partido/periodo sin clasificar referencias
historicas no verificadas. Los detalles se cargan separados de los eventos.
Las firmas de ambas RPC y los retornos ampliados se comprobaron contra los archivos
SQL y mediante clientes simulados, no invocando escrituras en produccion.

## Comprobaciones necesarias antes/despues de aplicar

Antes: confirmar cuerpo real de RPC anterior, FK/RLS/propietario, permisos y hashes
de filas de eventos, partidos y detalles. La migracion falla si faltan precondiciones
o ya existen columnas/RPC. No sustituye una auditoria remota actualizada.

Despues: verificar columnas NULL, CHECK validado, EXECUTE nuevo solo authenticated
(con UUID validado internamente), sin escritura directa, hashes de datos preexistentes
equivalentes proyectando columnas originales. Verificar que la RPC anterior no cambio.

Pruebas futuras autorizadas: limites 0/100, NULL/NULL, mezcla NULL/numero, fuera de
rango, NaN e infinitos; correcto/incorrecto y otro tipo; UUID permitido/denegado;
crear destino sin destinataria, editar, quitar conservando destinataria; conflictos
cruzados destinataria/destino; carrera contra borrado y cambios de tipo/autora;
origen ausente, solo zona, punto coincidente y orientacion por ambos tiempos.
No ejecutar estas escrituras contra produccion sin autorizacion explicita.
