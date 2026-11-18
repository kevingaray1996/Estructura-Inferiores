# Avisos al celular para las jugadoras (etapa 2): diseño

Rama `avisos`, desde origin/main 1286a13. Se construye sobre la etapa 1: las cuentas de jugadoras, la app
`/jugadora/` y su service worker con scope `/jugadora/`
(ver `docs/superpowers/specs/2026-11-16-cuentas-jugadoras-design.md`).

## Para qué
Que las jugadoras completen el Wellness y el RPE sin que el cuerpo técnico tenga que perseguirlas por WhatsApp,
y que se enteren del entrenamiento del día, de la convocatoria y de los mensajes del staff. Los avisos están
atados a su cuenta: nadie puede activarlos a nombre de otra.

## Lo que pidió el usuario
- **Activación.** La jugadora activa los avisos desde su app, con su cuenta. Instrucciones claras:
  - En iPhone solo funcionan con la app instalada desde Safari, iOS 16.4 o más.
  - En Android, desde Chrome.
  - Puede desactivarlos cuando quiera y elegir cuáles recibe.
- **Avisos:**
  1. Recordatorio de Wellness a la mañana, solo a quien no lo completó.
  2. Recordatorio de RPE, solo a quien no lo cargó.
  3. Entrenamiento del día publicado.
  4. Convocatoria, con un botón «Avisar convocatoria». No sale sola en cada cambio.
  5. Aviso manual de coordinación y cuerpo técnico, a todo el plantel o a jugadoras elegidas, con la advertencia
     de no poner datos personales.
- **Tocar el aviso** abre la app de la jugadora en la pestaña que corresponde.
- **Pantalla de coordinación:** avisos activos y sus horarios, cuántas y cuáles jugadoras tienen avisos
  activados, e historial de lo enviado.
- **Textos** cortos y sin datos sensibles.

### Calendario (decidido por el usuario el 2026-11-17, hora de Argentina, configurable por categoría)
- **Días fijos de entrenamiento por categoría.** Hoy son miércoles, jueves y viernes.
- **Esos días salen SIEMPRE**, aunque nadie haya cargado o publicado la sesión:
  - a las **7:10**, el recordatorio de Wellness, solo a quien no lo completó;
  - a las **10:15**, el recordatorio de RPE, solo a quien no lo cargó.
- **Aviso combinado.** Si ese día hay una sesión publicada, el de las 7:10 es **uno solo combinado**
  («Ya está tu entrenamiento de hoy · Completá tu Wellness»).
- **Publicación tardía.** Si la sesión se publica el mismo día después de las 7:10, el aviso de entrenamiento sale
  en el momento.
- **Día extra.** Si un día que no es de entrenamiento hay una sesión publicada (partido o práctica extra), ese día
  también salen los dos recordatorios.
- **Cuándo no sale ningún recordatorio automático:**
  - el día está marcado en la planificación como **Descanso**;
  - coordinación **pausó** los avisos para esa fecha o rango (feriados, vacaciones, entrenamiento suspendido).
- **Lo configurable desde la pantalla de coordinación:** los horarios y los días.
- **No se calcula el fin de la sesión:** se usan los horarios fijos.

## Reglas
- **Claves VAPID:** son secretos de Supabase. Nunca van en el repo ni en el navegador. La clave pública sí va al
  navegador, porque es pública por definición.
- **Quién manda:** solo coordinación y cuerpo técnico, con un límite para no mandar de más.
- **Tablas nuevas:** todas llevan la red RESTRICTIVE `sin_cuentas_jugadoras` (regla de la etapa 1).
- **Plan gratis de Supabase:** Edge Functions, `pg_cron` y `pg_net`, que ya están instalados en la base. Los push
  de la web son gratis. **No hay costos.**
- **Panel sin terminal:** todo se hace desde el panel. El SQL va en un solo bloque DO, con respaldo, verificación y
  reversión.
- **Forma de trabajo:**
  - colores del tema y mobile primero;
  - rama propia, y nada pasa a main sin el OK del usuario;
  - en cada pantalla: ux-audit y viewports a 375 y 1280 px, más verification-before-completion.

## Lo que no se hace
- Una bandeja de avisos dentro de la app: si la jugadora pierde la notificación, el mensaje no queda guardado en
  su app.
- Avisos para el staff.
- Calcular el fin de la sesión con hora y duración.
- Avisos por el link público de Wellness, sin cuenta.

## Lo que haría fracasar esto aunque funcione
- Que lleguen avisos a quien los desactivó, o el mismo aviso dos veces el mismo día.
- Que un técnico pueda mandar a otra categoría, o que alguien sin rol pueda mandar.
- Que una clave privada quede en el repo, en el navegador o en un log.
- Que un aviso muestre datos sensibles: estado médico, resultados de Wellness, nombres de otras jugadoras.
- Que los recordatorios lleguen tarde y fuera de contexto, por ejemplo un «Completá tu Wellness» a la noche.

## Enfoques considerados
1. **Cola de envíos en la base y una sola función que despacha (elegido).**
   - Toda alta de aviso es una fila en `avisos_envios`, que tiene una clave única para no duplicar. Las altas
     pueden ser automáticas, por publicación, por convocatoria o manuales.
   - Una tarea de `pg_cron` corre cada minuto. Programa los recordatorios que tocan y, solo si hay algo pendiente,
     llama a la Edge Function `avisos-enviar`.
   - La función resuelve los destinatarios en el momento del envío (quién completó el Wellness, quién cargó el
     RPE), manda los push y registra el resultado.
   - Un solo camino para todo: el historial, el límite y los duplicados quedan en la base.
2. **Que el navegador del staff llame a la función para los manuales y convocatorias, y el cron para lo
   automático (descartado).** Son dos caminos para lo mismo, y el límite y el historial se reparten.
3. **Programar en la base cada aviso con su propia tarea de `pg_cron` (descartado).** Hay que crear y borrar tareas
   cuando cambia la configuración, y eso es frágil.

## Decisiones

**Tomadas por el usuario:** el calendario completo.

**Propuestas por el asistente, a confirmar:**
- **Día de descanso.** Vale una sesión de jornada «Descanso» de esa categoría y fecha, **publicada o en borrador**.
  La pantalla de coordinación muestra por qué no salen recordatorios ese día.
- **Sesión publicada.** Cuenta una sesión de jornada «Entrenamiento» o «Partido» en estado publicado.
  - Si es partido, el texto combinado dice «Hoy hay partido · Completá tu Wellness».
- **Ventana de 90 minutos.** El recordatorio de las 7:10 sale entre las 7:10 y las 8:40, y el de las 10:15 hasta
  las 11:45. Si el sistema estuvo caído más tiempo, ese día no sale, para que no llegue fuera de contexto.
- **RPE cargado.** Se considera cargado si la jugadora tiene cualquier RPE de hoy (entrenamiento o partido).
- **Combinado para quien ya completó el Wellness.** Recibe solo «Ya está tu entrenamiento de hoy». Las preferencias
  se respetan por separado (Wellness y Entrenamiento).
- **Preferencias.** Hay cinco: Wellness, RPE, Entrenamiento, Convocatoria y Mensajes. Todas arrancan activadas.
- **Hasta 3 celulares por jugadora.** Al sumar el cuarto se reemplaza el más viejo.
- **Celular compartido.** Al tocar «Salir», la app intenta borrar la suscripción de ese celular. Al abrir la app
  logueada, la vuelve a asociar a la cuenta actual.
- **Quién puede mandar avisos manuales:**
  - coordinación, a cualquier categoría;
  - técnico y PF, solo a la suya (`mi_categoria()`);
  - un PF sin categoría, no puede.
- **Avisar convocatoria:** coordinación, o un técnico de la categoría del partido.
- **Límites:**

  | Qué | Límite |
  |---|---|
  | Mensajes manuales por remitente | 5 por día |
  | Mensajes manuales por categoría | 10 por día |
  | Avisos de convocatoria por partido | 3 por día |
  | Largo del texto manual | de 3 a 140 caracteres |
- **Textos fijos** (título · cuerpo · pestaña que abre):

  | Aviso | Título | Cuerpo | Abre |
  |---|---|---|---|
  | Wellness | «Wellness» | «Completá tu Wellness de hoy.» | Wellness |
  | Combinado | «Hoy entrenás» o «Hoy hay partido» | «Ya está tu entrenamiento de hoy · Completá tu Wellness.» (o «Hoy hay partido · Completá tu Wellness.») | Wellness |
  | Solo entrenamiento | «Entrenamiento» | «Ya está tu entrenamiento de hoy.» | Inicio |
  | RPE | «RPE» | «Cargá tu RPE de hoy.» | Wellness, en la vista RPE |
  | Convocatoria | «Convocatoria» | «Estás convocada: vs {rival} · {dd/mm} {hh:mm}.» (sin hora si no la hay) | Inicio |
  | Manual | «Mensaje de coordinación» o «Mensaje del cuerpo técnico» | el texto que escribió el staff | Inicio |
- **Vencimiento (TTL).** Es lo que espera el servicio de push si el celular está apagado:
  - recordatorios: 3 horas;
  - entrenamiento: 6 horas;
  - convocatoria y mensajes: 24 horas.
- **Agrupación.** Cada aviso lleva una etiqueta (`tag`) por tipo y fecha: uno nuevo del mismo tipo reemplaza al
  anterior en el celular.
- **Biblioteca de envío:** `jsr:@negrel/webpush`. Es nativa de Deno y usa WebCrypto.
  - Las claves se generan en el navegador con un fragmento de consola: la privada va directo a un secreto de
    Supabase y la pública a una variable de Vercel.
- **Cómo llama la tarea programada a la función.** Le pasa un secreto propio en el encabezado `x-avisos-secreto`,
  guardado en el Vault de Supabase y en los secretos de la función.
  - La función tiene «Verify JWT» apagado, porque la autentica ese secreto.
- **Pantalla del staff.** Es la sección **Avisos**, en el grupo Equipo, con estas pestañas:

  | Pestaña | Quién la ve |
  |---|---|
  | Mandar aviso | coordinación, técnico y PF con categoría |
  | Horarios | coordinación |
  | Pausas | coordinación |
  | Jugadoras | coordinación |
  | Historial | coordinación ve todo; técnico y PF, su categoría |

- **App de la jugadora.** Suma una cuarta pestaña, **Avisos**. Un aviso abre `/jugadora/?seccion=...` y la app va
  a esa pestaña.

## Limitaciones reales
- **iPhone:**
  - Solo funciona con la app instalada desde Safari («Agregar a pantalla de inicio»), con iOS 16.4 o más.
  - El permiso se pide al tocar un botón adentro de la app instalada.
  - Si la jugadora borra el ícono, la suscripción muere y tiene que volver a activarla.
  - Los modos de concentración, como No molestar, silencian los avisos.
- **Android:** funciona desde Chrome, instalada o no. Algunas marcas (Xiaomi, Samsung con ahorro de batería) pueden
  demorar avisos o bloquearlos.
- **Sin app o sin activar:** a las jugadoras que no instalaron la app o no activaron los avisos no les llega
  nada. La pantalla de coordinación muestra quiénes son.
- **La entrega no está garantizada:**
  - El servicio de Apple, Google o Mozilla puede demorar o descartar avisos.
  - «Entregados» en el historial significa que el servicio los aceptó, no que la jugadora los vio.
  - Si el celular estuvo apagado más que el vencimiento, el aviso se pierde.
- **Precisión de la hora:**
  - La tarea corre cada minuto, así que un aviso sale hasta un minuto después de la hora fijada.
  - El aviso de «publicado en el momento» también tarda hasta un minuto.
- **Preview y producción:**
  - Las suscripciones son por dominio: activar los avisos en la preview no sirve para producción.
  - En la preview protegida de Vercel, la prueba de push se hace con Chrome en una computadora o en Android.
  - El iPhone se prueba en producción.
- **Proyecto pausado:** si el proyecto de Supabase se pausara por inactividad (plan gratis, 7 días sin uso), la
  tarea programada se detiene. Con el uso diario no pasa.
