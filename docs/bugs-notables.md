# Bugs notables

Registro de fallos encontrados, cómo se detectaron y cómo se verificó el arreglo. Sirve para recordar el razonamiento, no solo el parche.

Formato: qué pasaba, por qué, cómo se detectó, arreglo, cómo se verificó.

---

## 1. Los tests de Stripe solo pasaban en el portátil del autor

- **Fecha**: 2026-10-08
- **Qué pasaba**: En local pasaban los 156 tests del backend. En una máquina sin `backend/.env`, fallaban 3 tests del webhook de Stripe con un 500.
- **Por qué**: `config/settings.py` carga `.env` con `load_dotenv`. La vista del webhook devuelve 500 si `STRIPE_WEBHOOK_SECRET` está vacío, que es lo correcto, y los tests mockeaban la verificación de firma pero nunca fijaban el secreto. Funcionaban por casualidad: el `.env` local tenía uno.
- **Cómo se detectó**: Ejecutando la suite con las variables sensibles vaciadas (`STRIPE_WEBHOOK_SECRET= pytest`). `load_dotenv` no pisa variables que ya existen en el entorno, así que así se simula una máquina limpia sin tocar el `.env`.
- **Arreglo**: Un fixture `autouse` en `billing/tests/test_billing_views.py` fija un secreto de prueba con el fixture `settings` de pytest-django. Además, un test nuevo cubre el caso "secreto sin configurar → 500, sin intentar verificar la firma".
- **Cómo se verificó**: Suite completa con las variables vaciadas: 157/157. El CI se ejecuta sin `.env`, así que una dependencia oculta de este tipo vuelve a aparecer como fallo.

## 2. Una actualización menor de DRF cambió el contrato de errores de la API

- **Fecha**: 2026-10-08
- **Qué pasaba**: En una instalación limpia fallaban 2 tests de validación de URLs peligrosas (`javascript:`), aunque la validación seguía funcionando.
- **Por qué**: `requirements.txt` solo tenía rangos (`>=3.15,<4.0`). En local había DRF 3.16.1; una instalación nueva traía la 3.18.3. Desde la 3.17, los errores de un serializer de lista ya no son una lista con un hueco por elemento (`[{...}]`), sino un diccionario indexado por la posición del elemento que falla (`{0: {...}}`). Cambia la forma de la respuesta 400 de la API.
- **Cómo se detectó**: Creando un entorno virtual limpio con uv a partir de `requirements.txt` y ejecutando la suite. Fallaba sin tocar código.
- **Arreglo**: Lockfile con versiones exactas (ADR-011) y tests actualizados al formato nuevo. Se comprobó que el frontend no lee `details` de los errores, así que el cambio no rompe ninguna pantalla.
- **Cómo se verificó**: Instalación desde el lock con `--require-hashes` en un venv nuevo: 157/157.

## 3. 109 clases de Tailwind que no hacían nada

- **Fecha**: 2026-10-08
- **Qué pasaba**: No había hover ni foco visible en muchos botones y paneles del editor. El interruptor del inspector, cuando estaba apagado, no tenía fondo y no se veía. Los separadores del login no aparecían y la pestaña activa no mostraba su subrayado.
- **Por qué**: Los tokens de color se habían escrito como clases a mano dentro de `@layer utilities`. Tailwind v4 no genera variantes (`hover:`, `focus-visible:`) ni opacidades (`/50`) para clases escritas a mano, y no avisa: una clase que no entiende simplemente no produce CSS. Además, 202 usos escribían `bg-x\/50` en atributos JSX, donde la barra invertida no es un escape sino un carácter más del nombre de la clase. Y algunas clases nunca existieron (`bg-default`, `border-primary-color`).
- **Cómo se detectó**: Revisando la interfaz en modo claro y oscuro, y después con un script que pasa cada clase del código por el design system de Tailwind (`candidatesToCss`): las que devuelven `null` no generan CSS. Con el CSS antiguo, el script encontraba 109.
- **Arreglo**: Tokens registrados con `@theme inline` (ADR-012), escapes `\/` eliminados y las clases inexistentes corregidas.
- **Cómo se verificó**: Capturas deterministas de 16 pantallas en claro y oscuro antes y después, comparadas píxel a píxel. Dos tandas del "antes" dieron un 0,000 % de diferencia entre sí, así que el método no tiene ruido. Después del cambio, en oscuro solo cambian los bordes y fondos que antes no se pintaban. El script queda en el CI (`npm run check:classes`).

## 4. Las páginas publicadas ignoraban el tema de su plantilla

- **Fecha**: 2026-10-08
- **Qué pasaba**: Una página creada con la plantilla SaaS (tema oscuro) se veía oscura en el editor y clara una vez publicada.
- **Por qué**: Hay dos sistemas de tema: `theme_id` (temas predefinidos) y `design_tokens` (tokens editables, que mandan si existen). El backend guarda `design_tokens = {}` por defecto. El editor convertía primero con `apiToTokens({})`, que devuelve `undefined`, y usaba `theme_id`. La página pública preguntaba por el valor crudo: `{}` es *truthy* en JavaScript, así que aplicaba los tokens por defecto (claros). La lógica estaba copiada en cuatro sitios (lienzo, editor móvil, preview y página pública) y una copia había divergido.
- **Cómo se detectó**: Comparando capturas del editor y de `/p/<slug>` de la misma página, y trazando de dónde sale cada variable CSS que leen los bloques.
- **Arreglo**: Una única función, `pageThemeVars()` en `lib/page-theme.ts`, que usan los cuatro sitios. Recibe los tokens ya convertidos, así que "sin tokens" significa lo mismo en todas partes.
- **Cómo se verificó**: Test unitario que reproduce el caso del `{}` y diff de capturas: la página publicada pasa a verse igual que en el editor.

## 5. "<10ms" se mostraba como "&lt;10ms"

- **Fecha**: 2026-10-08
- **Qué pasaba**: En la plantilla SaaS, la estadística "<10ms" se veía como "&lt;10ms". Lo mismo con cualquier texto con `&`, `<` o `>` ("Tom & Jerry" → "Tom &amp; Jerry").
- **Por qué**: El backend sanea los campos de texto con `bleach.clean()`, que además de quitar etiquetas devuelve el texto escapado como HTML. Esos campos los pinta React como texto, y React vuelve a escapar, así que las entidades se veían literalmente.
- **Cómo se detectó**: Revisando las capturas del editor.
- **Arreglo**: Los campos de texto plano se guardan como texto: se quitan las etiquetas y se desescapan las entidades (`html.unescape`). Es seguro porque solo el bloque Custom HTML se inyecta como HTML; el resto lo escapa React al pintar. Las páginas antiguas se corrigen en su siguiente guardado.
- **Cómo se verificó**: Test parametrizado con `<10ms`, `Tom & Jerry`, `a > b` y `5 &lt; 6`: fallaba antes del cambio y pasa después. El test que comprueba que se eliminan las etiquetas `<script>` sigue pasando.

## 6. Un botón que podía borrar la página real

- **Fecha**: 2026-10-08
- **Qué pasaba**: Junto al nombre de la página había un icono "Resetear a demo inicial". Tras un `confirm()`, sustituía la página del store por la de ejemplo.
- **Por qué era grave**: El autosave detecta cualquier cambio del store y hace `PUT` a los 3 segundos. Resetear la demo sobrescribía la página real del usuario en el servidor. Era un resto de cuando el editor funcionaba sin backend.
- **Arreglo**: Botón y acción del store eliminados.

## 7. Dos bloques con el mismo ID tras guardar

- **Fecha**: 2026-10-08
- **Qué pasaba**: Tras cada autosave, el cliente copiaba a sus bloques los IDs que devolvía el servidor, emparejándolos por posición. Si añadías un bloque arriba mientras el guardado estaba en vuelo, el bloque nuevo recibía el ID del primero, el primero el del segundo, y el último se quedaba con el suyo: dos bloques con el mismo ID. En el siguiente guardado el servidor actualizaba uno encima del otro y borraba el que sobraba.
- **Por qué**: El cliente usaba IDs temporales (`blk_…`) que el servidor descartaba. Había dos IDs por bloque y había que reconciliarlos.
- **Cómo se detectó**: Leyendo `usePageSync` al preparar los tests: el emparejamiento por índice solo es correcto si el array local no cambia durante la petición.
- **Arreglo**: IDs UUID generados en el cliente y conservados por el servidor (ADR-014), que además los valida: rechaza los que no son UUID, los repetidos y los de bloques de otra página. Ya no hay reconciliación tras guardar.
- **Cómo se verificó**: Un test de `usePageSync` reproduce la carrera (guardado en vuelo, se añade un bloque, el servidor responde con otro orden). Con el código anterior el resultado era `[A, B, B]`; con el nuevo los IDs no cambian. Tests de backend para el ID de otra página (el bloque ajeno no se toca) y, en el navegador, los IDs se mantienen tras varios guardados.

## 8. Restaurar una versión desconectaba a todos los editores

- **Fecha**: 2026-10-08
- **Qué pasaba**: Al restaurar una versión, el servidor avisaba por WebSocket con un mensaje `page.restored`. Channels lo despacha al método `page_restored` del consumer, que no existía: el consumer lanzaba una excepción y se cerraban las conexiones de todos los que editaban esa página.
- **Arreglo**: Handler `page_restored`, que reenvía el aviso; el cliente recarga la página y muestra quién la restauró.
- **Cómo se verificó**: Un test recorre el código del backend, encuentra cada tipo de mensaje que se envía a un grupo y comprueba que el consumer tiene su handler. Falla con el código anterior (`['page.restored']`) y pasa con el arreglo, así que cualquier mensaje nuevo sin handler también lo romperá.

## 9. Restaurar una versión se aplicaba a medias y el autosave lo deshacía

- **Fecha**: 2026-10-08
- **Qué pasaba**: El servidor restauraba bloques, tema, tokens y SEO, pero el cliente solo copiaba nombre, bloques y estado. El siguiente autosave enviaba el tema, los tokens y el SEO antiguos y deshacía esa parte de la restauración.
- **Arreglo**: El cliente recarga la página entera desde el servidor con el mismo mapper que la carga normal (`reloadFromApi`). La carga se marca como remota para que el autosave no la reenvíe, y vacía el historial de deshacer.
- **Actualización (S10)**: El aviso ahora es `page_updated` con motivo `restore`, y quien no restauró fusiona la página restaurada con sus cambios sin guardar en lugar de recargarla entera (ADR-024, entrada 22).
- **Cómo se verificó**: Test de `usePageSync` y prueba en el navegador: se guarda una versión, se cambia el título SEO, se restaura y, pasados los 3 segundos del autosave, el servidor sigue teniendo el título de la versión.

## 10. Renovar la sesión solo con la cookie daba un 500

- **Fecha**: 2026-10-08
- **Qué pasaba**: El endpoint de refresh aceptaba el token en el cuerpo o en la cookie. Con solo la cookie y un cuerpo JSON, devolvía 500.
- **Por qué**: Para inyectar el token de la cookie hacía `request.data._mutable = True`, un truco que solo funciona con el `QueryDict` de un formulario. Con JSON, `request.data` es un `dict` normal y lanza `AttributeError`. No se notaba porque el frontend mandaba también el token en el cuerpo, sacado de localStorage, que era justo lo que había que quitar.
- **Arreglo**: Vista de refresh propia que lee la cookie, valida con `TokenRefreshSerializer`, rota el refresh token y nunca devuelve tokens en el cuerpo (ADR-008).
- **Cómo se verificó**: El test nuevo falla con la vista anterior (`'dict' object has no attribute '_mutable'`) y pasa con la nueva. Otros tests cubren que un refresh token rotado o revocado en el logout ya no sirve.

## 11. Una cookie de Google impedía conectar el WebSocket

- **Fecha**: 2026-10-08
- **Qué pasaba**: Tras pasar la autenticación del WebSocket a la cookie de sesión, los tests unitarios pasaban, pero en el navegador el socket se cerraba nada más abrirse (código 1006).
- **Por qué**: El navegador también enviaba `g_state`, una cookie del login de Google cuyo valor es JSON. `http.cookies.SimpleCookie`, el parser estándar de Python, deja de leer al encontrar un valor que no le gusta y descarta en silencio todas las cookies siguientes, incluida `bp_access`. El socket llegaba sin usuario y se rechazaba.
- **Cómo se detectó**: Abriendo el socket a mano desde la página para ver el código de cierre y comparando los dos parsers con la cabecera real del navegador.
- **Arreglo**: Usar `django.http.cookie.parse_cookie`, el mismo parser tolerante que Django usa en las peticiones HTTP.
- **Cómo se verificó**: Test con la cabecera real (`g_state` con JSON delante de `bp_access`) y prueba en el navegador: el servidor responde con el mensaje `connected`. Lección: el test unitario usaba una cabecera "limpia"; la prueba en un navegador real fue lo que lo destapó.

## 12. El rewrite de /api perdía la barra final (detectado antes de desplegar)

- **Fecha**: 2026-10-08
- **Qué pasaba**: Para que las cookies de sesión sean del mismo sitio en producción, el frontend reenvía `/api/*` a Django con un rewrite de Next. Al probarlo en local, los GET devolvían 301 y los POST, 500.
- **Por qué**: El patrón `/api/:path*` captura la ruta sin la barra final. Django exige la barra (`APPEND_SLASH`), así que redirigía los GET y no podía redirigir un POST sin perder el cuerpo, de ahí el 500. Además, Next redirige por defecto `/api/pages/` a `/api/pages` antes de aplicar el rewrite.
- **Arreglo**: Destino del rewrite con barra final (`/api/:path*/`), ya que todas las rutas de la API terminan en `/`, y `skipTrailingSlashRedirect` en `next.config.ts`.
- **Cómo se verificó**: Login por `/api/auth/login/` a través de Next (200 con las dos cookies), una consulta con *query string* intacta y los dos recorridos completos en el navegador (sesión y editor, 24/24) en modo rewrite. Ahora el modo rewrite es el de desarrollo por defecto, así que local y producción se comportan igual.

## 13. Un colaborador podía ejecutar código en el editor del dueño

- **Fecha**: 2026-10-08
- **Qué pasaba**: La edición en tiempo real reenviaba por WebSocket los datos de un bloque a los demás editores sin pasar por el saneado que sí hacía el guardado REST. Bastaba con mandar a un bloque Custom HTML un `<img src=x onerror="...">`: el editor del dueño lo inyectaba con `dangerouslySetInnerHTML` y el código se ejecutaba con su sesión.
- **Arreglo**: Una única función de validación para REST y WebSocket, con tipo de bloque leído de la base de datos y lista blanca de campos, y Custom HTML dentro de un `<iframe sandbox>` sin scripts (ADR-016).
- **Cómo se verificó**: Tests del consumer con el payload real (`onerror` y `<script>` no llegan a los demás), con un `javascript:` en una URL (rechazado) y con el ID de un bloque de otra página (rechazado). Tests del componente: el HTML va al `srcdoc` del iframe y el sandbox no incluye `allow-scripts`.

## 14. El límite de intentos de login se saltaba con una cabecera

- **Fecha**: 2026-10-08
- **Qué pasaba**: El login tenía un límite de 10 intentos por minuto por IP, pero enviando una cabecera `X-Forwarded-For` distinta en cada petición nunca se alcanzaba.
- **Por qué**: Sin `NUM_PROXIES`, DRF usa la cabecera `X-Forwarded-For` entera como identificador del cliente, y esa cabecera la escribe el propio cliente.
- **Arreglo**: `NUM_PROXIES` configurable (0 por defecto, la IP de la conexión) y un segundo límite por nombre de usuario (5 por minuto), que repartir el ataque entre muchas IPs no esquiva.
- **Cómo se verificó**: Con la configuración anterior, 12 intentos con cabeceras distintas daban todos 401 y ninguno 429. Con la nueva, el límite salta, y otra cuenta sigue pudiendo entrar.

## 15. Se podía preparar el secuestro de una cuenta antes de que existiera

- **Fecha**: 2026-10-08
- **Qué pasaba**: Alguien podía registrarse con el email de otra persona, ya que el registro no verifica el email. Cuando la víctima entraba después con Google, el sistema vinculaba su Google a esa cuenta ya existente, y el atacante seguía entrando con su contraseña.
- **Arreglo**: Google solo se vincula a cuentas sin contraseña (las creadas por enlace mágico, que sí demuestra el control del email). Si la cuenta tiene contraseña, responde 409 y pide entrar con usuario y contraseña. El test anterior comprobaba justo el comportamiento vulnerable y se sustituyó.
- **Pendiente conocido**: El enlace mágico tenía el mismo problema de fondo. Se cerró en la entrada 18, que sustituye también el 409 de Google.

## 16. Un HTML subido como si fuera una imagen

- **Fecha**: 2026-10-08
- **Qué pasaba**: La subida de imágenes comprobaba el `Content-Type` que declara el navegador. Un fichero `evil.html` declarado como `image/png` se aceptaba y se guardaba con su nombre y extensión originales, listo para servirse como HTML desde nuestro dominio.
- **Arreglo**: El tipo se detecta por la firma de los primeros bytes (JPEG, PNG, GIF, WebP) y el fichero se guarda con un nombre aleatorio y la extensión del tipo detectado. El nombre original solo se conserva como etiqueta.
- **Cómo se verificó**: Tests con un HTML declarado como PNG (rechazado), un PNG real llamado `evil.html` (guardado como `.png` con un nombre aleatorio) y un SVG con `onload` (rechazado).

## 17. La vista previa habría dejado de publicar (detectado al integrar)

- **Fecha**: 2026-10-09
- **Qué pasaba**: Con la publicación congelada (ADR-017), el estado de la página dejó de poder cambiarse por `PUT`. La página `/preview/[id]` tenía su propio botón "Publicar", que hacía justo eso: `PUT {status: 'published'}`. Ningún test la cubría y no estaba en los recorridos automáticos.
- **Cómo se detectó**: Al integrar el trabajo de los enlaces, que también tocaba esa página, buscando en todo el frontend cualquier otro sitio que escribiera `status`.
- **Arreglo**: La vista previa usa el endpoint `/publish/`, igual que el editor.
- **Lección**: Al cambiar un contrato de la API, buscar todos sus usos (`grep`) además de confiar en los tests: el código sin tests es justo donde se esconden estas roturas.

## 18. El enlace mágico abría una cuenta que otra persona también controlaba

- **Fecha**: 2026-10-09
- **Qué pasaba**: Es la otra mitad de la entrada 15. Alguien se registra con el email de otra persona y una contraseña suya. Cuando la dueña del email entra con un enlace mágico, el sistema la mete en esa cuenta. Ella trabaja ahí creyendo que la cuenta es suya, y el atacante sigue entrando con su contraseña, con las sesiones que ya tenía abiertas y a través de las páginas que hubiera compartido con otra cuenta suya.
- **Arreglo** (ADR-018): La cuenta guarda si el email está demostrado. El enlace mágico y Google lo demuestran; registrarse con contraseña no. La primera vez que alguien lo demuestra en una cuenta con contraseña sin confirmar, esa contraseña se desactiva, se cierran todas las sesiones (los refresh tokens van a la lista negra y los access tokens emitidos antes se rechazan, también en el WebSocket) y las páginas dejan de estar compartidas. La persona ve una pantalla que le explica qué ha pasado. Google ya no responde 409: sigue el mismo camino.
- **Cómo se verificó**: 14 tests reproducen el ataque completo (contraseña, cookie, cabecera Authorization, refresh, WebSocket y colaboradores). Con el arreglo desactivado fallan 9; con el arreglo, pasan todos. Hay otros tests que comprueban que una cuenta ya verificada conserva su contraseña y sus sesiones.
- **Lección**: Un access token JWT no se puede "borrar": para cerrar sesiones hay que guardar desde cuándo dejan de valer y comprobarlo en cada sitio donde se autentica (HTTP y WebSocket).

## 19. Una página despublicada respondía 200 en lugar de 404

- **Fecha**: 2026-10-09
- **Qué pasaba**: Al despublicar una página, su dirección seguía respondiendo 200: mostraba la pantalla de "no encontrada", pero con código de éxito y un `noindex`. Pasaba también con slugs que nunca habían existido, y también para Googlebot. Además, cada visita a una página publicada enviaba primero la pantalla de carga de Paxl.
- **Cómo se detectó**: Lo encontró la prueba de caché de la semana 7, que comprueba que despublicar retira la página al momento. El contenido desaparecía, pero el código seguía siendo 200.
- **Causa**: `app/loading.tsx`, en la raíz, envuelve todas las rutas en un Suspense. Next envía ese esqueleto con 200 en cuanto empieza a responder, y cuando la página llama a `notFound()` el código ya no se puede cambiar.
- **Arreglo**: Se quitó ese `loading.tsx`. Las rutas que lo necesitan (dashboard, editor, ajustes) tienen el suyo, y el resto son estáticas o cargan los datos en el cliente.
- **Lección**: Un `loading.tsx` no es solo una pantalla: decide cuándo se envía la cabecera de la respuesta, y eso afecta a los códigos de estado de todo lo que cuelga de él.

## 20. Editar un color convertía una página oscura en clara

- **Fecha**: 2026-10-09
- **Qué pasaba**: Las páginas creadas desde una plantilla oscura usaban el tema antiguo (`theme_id: 'dark'`) y no tenían design tokens. El panel de Estilos partía de los tokens por defecto, que son claros. Al tocar un solo color se guardaban todos los demás claros, y la página entera cambiaba de aspecto.
- **Cómo se detectó**: Al revisar cómo convivían los dos sistemas de tema antes de unificarlos. En la base de datos de pruebas había una página así, con `theme_id: 'dark'` y tokens claros.
- **Arreglo**: Un solo sistema (ADR-020). Toda página tiene tokens desde que se crea, y la migración se los dio a las antiguas a partir de su tema. Un test edita un color de una página con la paleta oscura y comprueba que lo demás no cambia.
- **Lección**: Dos fuentes de verdad para lo mismo acaban discrepando justo en la frontera entre ellas, que es donde nadie mira.

## 21. El registro mostraba "Error de validación" en vez del motivo

- **Fecha**: 2026-10-09
- **Qué pasaba**: Al registrarse con un nombre de usuario ocupado o una contraseña demasiado común, la página decía solo "Error de validación.". El backend envía los errores de cada campo dentro de `details`, desde que se unificó el formato de errores, pero la página seguía leyendo el formato antiguo y tomaba el mensaje genérico.
- **Cómo se detectó**: Al construir el formulario para convertir una sesión de invitado en cuenta, que reutiliza las mismas reglas del registro y sí lee `details`.
- **Arreglo**: El registro lee los errores de campo de `ApiError.details` y muestra el primero.
- **Lección**: Cuando cambia el formato de los errores de la API, hay que revisar también los formularios que ya existían, no solo los nuevos.

## 22. Dos personas editando a la vez se borraban el trabajo

- **Fecha**: 2026-10-09
- **Qué pasaba**: Cada autoguardado reemplazaba la página entera y el servidor no comprobaba sobre qué versión se había hecho el cambio, así que ganaba el último. Añadir, borrar o mover bloques no se avisaba por WebSocket. Si A borraba un bloque y B guardaba después, el bloque resucitaba. Si B añadía uno y A guardaba, desaparecía. Un cambio de tema o de SEO de un editor desfasado pisaba el de los demás, y un guardado en vuelo podía deshacer una restauración de versión. Además, dos pestañas de la misma persona se quitaban los bloqueos entre sí, porque la presencia iba por usuario y no por conexión.
- **Cómo se detectó**: Revisando la colaboración contra las cinco condiciones que el plan exigía para sacarla en la demo. El fallo de fondo era de diseño, no un caso raro.
- **Arreglo** (ADR-024): Cada página tiene `version`. Un guardado hecho sobre una versión antigua recibe 409 con la página actual, y el cliente fusiona en tres vías (`lib/page-merge.ts`: lo que tenía el servidor, sus cambios y lo nuevo) sin perder nunca una edición. Tras cada escritura el servidor emite `page_updated`, y los demás traen la página y la fusionan igual. Presencia y bloqueos van por conexión.
- **Cómo se verificó**: Tests de la fusión, incluidas propiedades con ediciones aleatorias (no se pierde ninguna edición ni se duplica ningún bloque). Tests del consumer con `WebsocketCommunicator`, incluida una carrera real entre dos guardados. Y una prueba con dos navegadores reales (propietario e invitado colaborador): 13 comprobaciones, tres pasadas seguidas sin un fallo.
- **Lección**: Sin versión, "guardar la página entera" es "borrar lo que no sabías que había cambiado". La concurrencia optimista es barata de añadir y lo que la hace usable es la fusión en el cliente.

## 23. El editor mostraba tu propio cursor como si fuera de otra persona

- **Fecha**: 2026-10-10
- **Qué pasaba**: Con el editor abierto en una sola pestaña, aparecía un cursor con tu nombre siguiendo al ratón, como si hubiera otra persona en la página. La pestaña había abierto dos conexiones WebSocket y cada una recibía los movimientos de la otra.
- **Cómo se detectó**: Al rehacer las capturas de la landing salía un cursor "demo" en una página recién creada en la que no había nadie más. Escuchando los mensajes del WebSocket se veían dos `connected` con dos `connection_id` distintos desde la misma pestaña.
- **Causa**: Para conectar, el hook primero pide un ticket (ADR-010), lo que es asíncrono. Si el efecto se limpiaba mientras esperaba (React monta los efectos dos veces en desarrollo, y también pasa al cambiar de página), al llegar el ticket comprobaba `mountedRef`, que la ejecución nueva ya había vuelto a poner a `true`, y abría un segundo socket que nadie cerraba.
- **Arreglo**: Cada ejecución del efecto tiene su propio indicador `disposed`. Una ejecución limpiada no abre socket, y si su socket se cierra más tarde, no toca los temporizadores ni los bloqueos de la ejecución nueva.
- **Cómo se verificó**: Un test cambia de página mientras el primer ticket está pendiente y comprueba que solo se abre un socket, el de la página nueva. Falla sin el arreglo. En el navegador: una sola conexión y ningún cursor propio. La prueba con dos navegadores de la S10 sigue en 13/13.
- **Lección**: Un ref compartido entre ejecuciones de un efecto no sirve para saber si *esta* ejecución sigue viva. Lo asíncrono dentro de un efecto necesita su propia bandera de cancelación.

## 24. Lo escrito justo antes de salir del editor se perdía

- **Fecha**: 2026-10-10
- **Qué pasaba**: El autoguardado espera 3 s (0,8 s con alguien más en la página) desde la última tecla. Si en ese rato la persona pulsaba el logo para ir al dashboard, recargaba o cerraba la pestaña, el cambio no llegaba nunca: al desmontarse, el hook solo cancelaba el temporizador, no había ningún manejador de `pagehide` ni `visibilitychange`, el logo era un `<a href>` que recargaba la página entera, y la copia local no se escribía hasta que se intentaba guardar.
- **Cómo se detectó**: Ronda 1 de QA (EDITOR-003, COLLAB-004): editar el título y pulsar el logo en menos de un segundo; al volver, el título era el anterior.
- **Arreglo** (ADR-031): Cada edición se copia al momento en la copia local. Al desmontar el editor, ocultar la pestaña o cerrarla, el cambio pendiente se envía (con `keepalive` al cerrar). El logo espera a que se guarde antes de navegar y, si no puede, pregunta. Al volver a abrir la página, los cambios de la copia local que el servidor no tiene se fusionan sobre su página.
- **Cómo se verificó**: Tests del hook (desmontar antes de los 3 s envía una vez; `pagehide` y `visibilitychange` envían; la copia se escribe sin esperar) y del controlador (`keepalive`). Playwright: escribir y pulsar el logo enseguida, y escribir y salir del sitio enseguida; en los dos casos el servidor tiene el título.
- **Lección**: Un debounce es una promesa de guardar más tarde; cada salida posible tiene que cumplirla o dejar el cambio en un sitio del que se recupere.

## 25. Un solo campo no válido bloqueaba todos los guardados y se mostraba como "Sin conexión"

- **Fecha**: 2026-10-10
- **Qué pasaba**: Un valor que el servidor rechaza (lo más habitual: un enlace escrito como `example.com`, sin `https://`) hacía que el PUT devolviera 400. Como cada autoguardado envía la página entera, todos los guardados siguientes llevaban el mismo valor y fallaban también. La barra superior mostraba "Sin conexión" para cualquier error, y al recargar se perdía todo lo escrito desde el último guardado bueno.
- **Cómo se detectó**: Ronda 1 de QA (EDITOR-002; COLLAB-013 para el "Sin conexión" de un 404).
- **Arreglo** (ADR-031): Los campos que el 400 nombra en `details` se dejan fuera de los guardados siguientes mientras conserven el valor rechazado, y el resto de la página se guarda. El campo muestra la regla en el idioma de la interfaz, la barra dice qué campo de qué bloque falló, con "Ir al campo", y "Sin conexión" solo aparece si no hubo respuesta. Los campos del inspector se paran en el límite del servidor (`lib/field-limits.ts`, comprobado contra el Python) y los enlaces sin esquema se completan al salir del campo.
- **Cómo se verificó**: Tests del controlador (el 400 deja fuera solo ese campo, las ediciones siguientes se guardan sin otro 400, al corregirlo se envía), de la barra (sin conexión frente a error HTTP, nombre del campo y regla en inglés) y de los campos (límite, enlace completado, mensaje en el campo). Playwright: un enlace `javascript:` y un título nuevo; el título llega al servidor, el enlace no, y el campo y el aviso explican por qué.
- **Lección**: Cuando se guarda todo de una vez, un error de validación tiene que poder aislarse; si no, un detalle bloquea el trabajo entero. Y un mensaje de error genérico es peor que ninguno si dice algo falso.

## 26. Un guardado fallido no se reintentaba y la copia local más nueva se ignoraba

- **Fecha**: 2026-10-10
- **Qué pasaba**: Si un guardado fallaba (sin red, servidor caído), nada lo volvía a intentar: ni un temporizador, ni el evento `online`, ni la reconexión del WebSocket, que salía antes si la versión del servidor no había cambiado. "Error al guardar" se quedaba aunque un guardado posterior funcionara, porque solo el autoguardado actualizaba ese estado. Al cargar, la copia local solo se usaba si la página no cargaba, aunque tuviera cambios que el servidor no tenía.
- **Cómo se detectó**: Ronda 1 de QA (EDITOR-003, COLLAB-005, MOBILE-010).
- **Arreglo** (ADR-031): El controlador pone el estado en todos los caminos de guardado y reintenta a los 2, 5, 15 y cada 30 s, al volver `online` y al reconectar aunque la versión sea la misma. La copia local guarda su base y si tiene cambios sin confirmar; al cargar, esos cambios se fusionan sobre la página del servidor y se guardan, como un paso que se puede deshacer.
- **Cómo se verificó**: Tests del controlador (reintento al volver `online`, espera creciente, reconexión con la misma versión, copia local fusionada sobre una página que otra persona cambió). Playwright: sin red, editar, ver "Sin conexión", volver a tener red y comprobar que el servidor tiene el cambio.
- **Lección**: Un error que nadie vuelve a intentar es una pérdida de datos aplazada.

## 27. Los "&", "<" y ">" de los textos largos se veían como "&amp;", "&lt;" y "&gt;"

- **Fecha**: 2026-10-10
- **Qué pasaba**: Escribir `Q&A` en el subtítulo de un hero, en la respuesta de una pregunta frecuente, en las características de un plan o en una cita y guardar hacía que el editor, el inspector y la página publicada mostraran `Q&amp;A`. Pasaba en todos los bloques con texto largo.
- **Cómo se detectó**: En la ronda 1 de QA (QA-001), escribiendo texto con símbolos en cada bloque y comparándolo con lo que salía en la página publicada.
- **Causa**: Los campos de texto largo pasaban por `sanitize_text`, que devuelve HTML saneado por bleach (conserva `<strong>`, `<a>`... y escribe `&` como `&amp;`). Todos los bloques los pintan como texto de React, que escapa al mostrar, así que el escape se veía dos veces. Ya habíamos arreglado lo mismo en los campos cortos (ADR-029), pero estos quedaron fuera.
- **Arreglo**: Esos campos son texto plano (ADR-029, seguimiento): se guardan tal como se escriben y guardar dos veces no los cambia. La migración `pages/0018` quita las etiquetas y decodifica las entidades una sola vez en los bloques y en todas las instantáneas de versiones, las publicadas incluidas.
- **Cómo se verificó**: Tests de que `'Q&A <3 "x" 5>3'` se guarda igual en doce campos de diez tipos de bloque y no cambia en un segundo guardado, y de que la migración convierte `A &amp; B` en `A & B`, deja un `&amp;lt;` literal como `&lt;` y cambia también las versiones publicadas sin tocar `updated_at`. Fallan sin el arreglo.
- **Lección**: Cuando un dato se escapa al guardar y otra vez al mostrar, el fallo solo aparece con los caracteres que se escapan; los tests con "Hola mundo" nunca lo ven. Hay que probar cada campo con `& < > "`.

## 28. El propietario recibía un error 500 en versiones y analítica cuando la página tenía dos colaboradores

- **Fecha**: 2026-10-10
- **Qué pasaba**: En cuanto una página tenía dos o más colaboradores, el historial de versiones del propietario no cargaba (decía "Sin versiones guardadas"), no se podían guardar ni restaurar versiones y la analítica daba un error.
- **Cómo se detectó**: En la ronda 1 de QA (QA-002), al probar la colaboración con varias cuentas.
- **Causa**: Las vistas buscaban la página con `Q(owner=user) | Q(collaborators=user)` y `.get()`. La unión con la tabla de colaboradores devuelve una fila por colaborador, así que `.get()` encontraba varias y lanzaba `MultipleObjectsReturned`. Con un colaborador o ninguno funcionaba, y por eso las pruebas con una sola cuenta no lo vieron.
- **Arreglo**: Una única función, `pages_accessible_to(user)`, con `.distinct()`, usada por todas las vistas que buscan una página por acceso (versiones, analítica, mensajes, IA).
- **Cómo se verificó**: Un test con dos colaboradores que lista, crea, restaura y borra versiones y pide la analítica como propietario y como cada colaborador. Daba 500 antes. Un segundo test confirma que quien no tiene acceso recibe 404.
- **Lección**: Un `.get()` sobre una consulta con unión a una relación muchos-a-muchos solo es seguro con `.distinct()`, y el caso que lo rompe (dos filas relacionadas) es justo el que los datos de prueba mínimos no tienen.

## 29. Una URL de imagen podía tapar toda la página, incluido el aviso de página de prueba

- **Fecha**: 2026-10-10
- **Qué pasaba**: Una persona invitada podía poner en el fondo de un hero una URL como `https://x.test/a.png);position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647`, publicar, y la página pública mostraba un bloque a pantalla completa por encima del aviso "página creada por un invitado" (ADR-022): una suplantación posible en el dominio de la propia app.
- **Cómo se detectó**: En la ronda 1 de QA (QA-005), probando qué hacía el servidor con los valores de los campos de imagen.
- **Causa**: `validate_safe_url` solo comprobaba el esquema (`http`, `https` o vacío), y el hero escribía el valor sin comillas dentro de `url(...)`. El `)` cerraba la función y lo que seguía eran declaraciones CSS nuevas.
- **Arreglo**: El servidor acepta solo `http(s)://host/...` o una ruta del sitio, sin espacios, comillas, paréntesis, `;`, llaves ni barras invertidas, en todos los campos de imagen y en `og_image` (ADR-034). La migración vacía las que ya estaban guardadas. El frontend cita el valor al pintarlo (otro lote).
- **Cómo se verificó**: Tests con veinte URLs aceptadas o rechazadas, la inyección rechazada en los cuatro campos de imagen y en `og_image` por el endpoint, y la migración sobre bloques, instantáneas y páginas.
- **Lección**: Validar el esquema no es validar el uso. Un valor que va dentro de otro lenguaje (CSS, HTML, SQL) se valida contra los caracteres de ese lenguaje y se cita al escribirlo; las dos cosas, no una.

## 30. Un robot pidiendo páginas que no existen dejaba todas las páginas publicadas en error 500

- **Fecha**: 2026-10-10
- **Qué pasaba**: Con unas 60 peticiones por minuto a direcciones inexistentes, todas las páginas publicadas empezaban a dar error 500, también para visitantes normales.
- **Cómo se detectó**: En la ronda 1 de QA (QA-006), repitiendo peticiones a `/p/<slug>` mientras se miraba qué respondía la API.
- **Causa**: El endpoint público heredaba el límite de 60 peticiones por minuto para anónimos, y su único cliente es el servidor de Next, que llega siempre desde la misma IP. Next no guarda en caché los 404, así que cada petición inexistente gastaba el mismo cupo que todas las páginas reales, y el 429 resultante se convertía en un 500. La recogida de analítica compartía además el cubo `anon`.
- **Arreglo**: Sin límite de peticiones en los endpoints públicos de solo lectura (página pública, sitemap, resolución de dominio) y un cubo propio (`analytics`) para la recogida de eventos (ADR-034). El frontend guarda en caché los "no encontrada" (otro lote).
- **Cómo se verificó**: Un test con el límite de 60/min restaurado hace cien peticiones a slugs inexistentes y a uno publicado y comprueba que ninguna da 429; otro comprueba que 70 envíos de analítica no gastan el cupo del resto. Fallan sin el arreglo.
- **Lección**: Un límite por IP delante de un proxy limita al proxy. Antes de poner un límite hay que preguntarse quién es "el cliente" en ese endpoint.

## 31. Restaurar una versión duplicaba el bloque que otra persona estaba editando

- **Fecha**: 2026-10-10
- **Qué pasaba**: Si alguien restauraba una versión mientras otra persona tenía un cambio sin guardar en un bloque, al sincronizar a las dos les aparecía ese bloque dos veces.
- **Cómo se detectó**: En la ronda 1 de QA (QA-012), con dos navegadores editando la misma página.
- **Causa**: Restaurar borraba todos los bloques y los recreaba con ids nuevos aunque la instantánea guarda el id original. La fusión del cliente veía "editado aquí, borrado allí" y conservaba el bloque local junto a las copias restauradas.
- **Arreglo**: Restaurar conserva los ids de la instantánea (uno nuevo solo si otra página lo usa, se repite o está mal formado) y toma el bloqueo de la página, igual que la generación con IA y las instantáneas, para que dos escrituras de página entera se pongan en cola (ADR-034).
- **Cómo se verificó**: Tests de que los ids restaurados son los de la instantánea (y los casos raros), de que el bloque que existe ahora y en la instantánea conserva el id, y, en el trabajo de PostgreSQL, de que cuatro generaciones simultáneas dejan un solo resultado sin errores 500 (falla sin el bloqueo).
- **Lección**: Si el modelo de fusión se apoya en ids estables, cualquier operación que "borra y recrea" tiene que respetarlos; si no, la fusión interpreta el cambio como borrado.

## 32. Cualquier colaborador podía publicar la página y borrar la versión publicada

- **Fecha**: 2026-10-10
- **Qué pasaba**: Una persona invitada a editar podía publicar, despublicar, duplicar la página del propietario, regenerarla entera con IA y borrar versiones, incluida la que veía el público, que dejaba la página pública en 404 mientras seguía "publicada". El propietario veía cómo su barra pasaba a "Publicada" sin saber por qué.
- **Cómo se detectó**: En la ronda 1 de QA (QA-023 y QA-013), probando qué acciones permitía el servidor a una cuenta que solo era colaboradora.
- **Causa**: La consulta de páginas incluye a los colaboradores en todas las acciones y solo cuatro de ellas comprobaban al propietario; el resto de reglas vivían solo en la interfaz.
- **Arreglo**: Decisión del propietario del producto (ADR-031): publicar, despublicar, duplicar, borrar la página o una versión, regenerar con IA, compartir e invitar son solo del propietario (`403 NOT_OWNER`), y la versión publicada no se puede borrar para nadie (`400 PUBLISHED_VERSION`). La página devuelve `is_owner` para que la interfaz oculte esas acciones.
- **Cómo se verificó**: Un test parametrizado por acción que comprueba el 403 y que no cambió nada, los mismos casos como propietario (200), lo que el colaborador sí puede hacer, y que borrar la versión publicada se rechaza y la página pública sigue en 200.
- **Lección**: Los permisos que solo existen en la interfaz son sugerencias. Cada acción que cambia lo que ve el público necesita su propia comprobación en el servidor, y la lista de qué puede cada rol tiene que estar escrita en un solo sitio.

## 33. Un bloque que otra persona estaba editando se podía seleccionar, editar y borrar

- **Fecha**: 2026-10-10
- **Qué pasaba**: Con un bloque bloqueado por otra persona, el lienzo lo rechazaba, pero desde el panel Capas, el teclado (Supr) o Quick Edit se seleccionaba igual: el inspector se abría con los campos editables y el texto de uno pisaba al del otro sin aviso. Si dos personas hacían clic casi a la vez, la que perdía seguía con el bloque seleccionado. Desde Capas se podía incluso borrar el bloque mientras el otro escribía, y el borrado se deshacía solo cuando el otro seguía escribiendo.
- **Cómo se detectó**: Ronda 1 de QA (COLLAB-002, QA-011), con dos y tres navegadores y latencia añadida en el WebSocket.
- **Causa**: La comprobación del bloqueo vivía en `BlockWrapper` (el lienzo). `selectBlock` y `requestDeleteBlock` del store no la hacían, y al llegar `lock_rejected` solo se mostraba un aviso: la selección seguía.
- **Arreglo**: La regla está en el store: `selectBlock` devuelve `false` y no selecciona un bloque cuyo bloqueo es de otra conexión, `requestDeleteBlock` y `confirmDeleteBlock` lo rechazan, y las acciones de edición no tocan ese bloque. `lock_rejected` quita la selección. `useCollaboration` anuncia el rechazo y pregunta al servidor por si el bloqueo había caducado (ADR-035).
- **Cómo se verificó**: Tests del store (seleccionar, borrar y editar un bloque ajeno no hacen nada; un borrado confirmado tras perder el bloque se rechaza), del hook (`lock_rejected` quita la selección, el rechazo se anuncia una vez) y una prueba e2e con dos navegadores: el propietario no puede seleccionar desde Capas, ni con Intro ni con Supr, el Hero que edita el invitado. Fallan sin el arreglo.
- **Lección**: Una regla de seguridad de datos que se comprueba en la interfaz se comprueba en un sitio y se olvida en otro. Va en la capa por la que pasan todos los caminos.
## 34. Todos los visitantes compartían el mismo límite de peticiones

- **Fecha**: 2026-10-10
- **Qué pasaba**: Los límites de peticiones (cinco sesiones de invitado por hora, cinco mensajes de contacto por minuto, intentos de registro y de acceso) y el identificador anónimo de la analítica se calculan con la IP del cliente. Con `NUM_PROXIES=0`, que era el valor del `.env.example`, Django ve la dirección del proxy que tiene delante (el frontend que reescribe `/api` y el router de la plataforma), así que todas las personas caían en el mismo cupo: tras cinco invitados en una hora nadie más podía pulsar "Probar sin registrarse". Subir el número a ciegas tampoco vale: deja a cualquiera falsear su IP con `X-Forwarded-For`.
- **Cómo se detectó**: Ronda 1 de QA, auditoría de seguridad. No se reprodujo en local (allí no hay proxy): se dedujo de la cadena de saltos y de cómo DRF lee la cabecera.
- **Arreglo**: Comprobaciones de sistema (`config/checks.py`): con `DJANGO_DEBUG=False`, `manage.py check` (y por tanto `migrate`, que es el paso de release) y el arranque de Daphne (`config/asgi.py` las ejecuta) se niegan a seguir si `NUM_PROXIES` es 0. El mensaje explica cómo medir el valor real en el despliegue y está documentado en los dos `.env.example`. ADR-038.
- **Cómo se verificó**: Pruebas de la comprobación (0 en producción es un error, un recuento real pasa, en desarrollo no se exige) y ejecución manual de `manage.py check` con `DJANGO_DEBUG=False`. Lo que no se puede probar en local es el número correcto: queda por medir en el primer despliegue.
- **Lección**: Un valor por defecto que es correcto en el portátil puede ser un fallo silencioso en producción. Si el valor seguro depende de dónde se despliega, el arranque tiene que negarse a continuar, no confiar en que alguien lea el comentario.

## 35. En el móvil no había forma de iniciar sesión

- **Fecha**: 2026-10-10
- **Qué pasaba**: La cabecera de la portada ocultaba "Iniciar sesión" y la navegación por debajo de 768 px, y la de las páginas de marketing por debajo de 640 px, sin menú que las sustituyera. Una persona con cuenta que abría Paxl en el móvil solo veía "Crear cuenta". Tema e idioma estaban igual de escondidos, también dentro de la aplicación.
- **Cómo se detectó**: Ronda 1 de QA, recorrido a 390 px: ninguna página de marketing tenía un enlace a `/login`.
- **Arreglo**: "Iniciar sesión" se muestra siempre (con 44 px de alto), y por debajo de `md` un botón de menú (`MobileMenu`) abre la navegación, el tema y el idioma, con Escape para cerrar y `aria-expanded`. Las pantallas de acceso, el panel (cajón lateral) y los ajustes tienen tema e idioma. Una prueba de extremo a extremo con un viewport de 390 px comprueba el enlace, el menú y que no haya desplazamiento horizontal.
- **Cómo se verificó**: Pruebas de componente de las dos cabeceras y la prueba de extremo a extremo a 390 px (falla con la cabecera anterior).
- **Lección**: `hidden md:block` sin una alternativa móvil convierte una pantalla en una puerta cerrada. Revisar cada clase responsive que oculta algo con la pregunta "¿dónde está esto en el móvil?".

## 36. El panel solo cargaba las primeras 20 páginas

- **Fecha**: 2026-10-10
- **Qué pasaba**: `usePageList` se quedaba con `results` y tiraba `next` y `count`. A partir de la página 21 no se veían las páginas, los totales ("N páginas", "publicadas", "bloques") eran los de las 20 cargadas, y el buscador solo filtraba esas 20.
- **Cómo se detectó**: Ronda 1 de QA, cuenta con más de 20 páginas.
- **Arreglo**: El hook sigue la paginación del servidor (botón "Cargar más páginas"), la búsqueda se hace en el servidor (`?search=` por nombre o slug, con una espera de 300 ms al teclear) y los totales vienen de la API (`usage` en la suscripción: páginas propias para el límite del plan, y visibles, publicadas y bloques para las tarjetas). Recargar al volver a la pestaña vuelve a pedir todas las páginas ya cargadas, para que la lista no se encoja. Una carga fallida muestra el error con "Reintentar" y no el estado vacío.
- **Cómo se verificó**: Pruebas del hook (paginación, búsqueda, recarga de varias páginas, fallo y reintento), de la página (totales, "cargar más", búsqueda al servidor) y del backend (`search`, `usage` con páginas compartidas).
- **Lección**: Una lista paginada que se trata como si fuera completa miente en cuanto crece. Los totales, los buscadores y los límites tienen que salir del servidor, no de lo que se haya cargado.

## 37. Dos cuentas con el mismo email en distinta capitalización

- **Fecha**: 2026-10-10
- **Qué pasaba**: El email y el usuario se comparaban con mayúsculas y minúsculas. Se podía registrar `Demo@Example.com` teniendo `demo@example.com`, y un enlace mágico pedido con otra capitalización no entraba en la cuenta existente: creaba una nueva y vacía.
- **Cómo se detectó**: Ronda 1 de QA: cuentas duplicadas en la base de pruebas (`Magic.Tester6663` y `magic.tester6663`).
- **Arreglo**: ADR-037. El email se guarda en minúsculas, restricciones únicas sobre `Lower(email)` y `Lower(username)`, búsquedas `iexact` y entrada que ignora las mayúsculas del usuario. La migración se niega a continuar si ya hay duplicados y los lista, en vez de elegir a quién borrar.
- **Cómo se verificó**: Pruebas de registro, acceso, enlace mágico, Google y las restricciones de la base de datos; pruebas de la migración (lista las colisiones, pone en minúsculas lo demás); y una prueba de extremo a extremo que intenta registrar de nuevo con otra capitalización y entra con el usuario en minúsculas.
- **Lección**: "Único" es una propiedad de la base de datos, no de un `filter()`. Y una migración que arregla datos ambiguos debe parar y avisar, no adivinar.

## 38. "Mejorar a Pro" terminaba en un error 500 con el texto de Stripe

- **Fecha**: 2026-10-10
- **Qué pasaba**: Sin clave de Stripe (la demo se despliega sin cuenta) checkout y portal devolvían 500 con `{"error":"STRIPE_SECRET_KEY not configured"}` y la página lo mostraba tal cual. Los webhooks, además, respondían 200 aunque su manejador fallara, así que Stripe no reintentaba, y dos eventos iguales a la vez podían procesarse dos veces.
- **Cómo se detectó**: Ronda 1 de QA: el fallo más visible que puede encontrar quien pulsa "Mejorar plan".
- **Arreglo**: ADR-036. La facturación es una función apagada sin clave de prueba (`GET /api/features/` → `billing`): 503 `FEATURE_DISABLED`, botones ocultos y la interfaz dice que los pagos no están activos en esta demo; con clave de prueba avisa de que es modo de prueba. Las claves reales se rechazan. Los webhooks se procesan una sola vez bajo un bloqueo de fila, se deshacen si fallan y Stripe los reintenta.
- **Cómo se verificó**: Pruebas de la API sin clave, con clave de prueba y con clave real; de idempotencia (duplicado, misma factura, fallo y reintento); de la interfaz con los dos estados; y de extremo a extremo (503 y nota visible, sin botón de mejorar).
- **Lección**: "No configurado" es un estado normal del producto, no un error del servidor. Debe tener respuesta, texto y diseño propios.

## 39. En el móvil no se podía volver a publicar

- **Fecha**: 2026-10-10
- **Qué pasaba**: En Quick Edit la hoja de publicar solo miraba `status`: una página ya publicada mostraba "Página publicada" y el enlace, sin "Publicar cambios" ni "Despublicar", y la barra no avisaba de cambios sin publicar. Quien editaba desde el móvil creía que su cambio estaba en línea, pero los visitantes seguían viendo la copia congelada (ADR-017).
- **Cómo se detectó**: Ronda 1 de QA, recorrido en webkit (iPhone 13) y chromium (Pixel 7): publicar, editar el título, volver a abrir la hoja. La API decía `has_unpublished_changes: true` y la página pública conservaba el título viejo.
- **Arreglo**: `MobilePublishSheet` tiene los tres estados de la barra de escritorio (borrador → "Publicar"; publicada con cambios → aviso y "Publicar cambios"; publicada → enlace) y "Despublicar" con confirmación, a través de `usePublishActions` (solo el propietario; un colaborador lee por qué). El globo de la barra lleva un punto y su nombre dice que hay cambios sin publicar. ADR-040.
- **Cómo se verificó**: Pruebas de componente de los tres estados y del colaborador, y una prueba de extremo a extremo a 390 px: publicar, editar, "Publicar cambios" y la página pública muestra el título nuevo.
- **Lección**: Dos interfaces para la misma acción divergen. El estado de publicación tiene tres casos, no dos, y cada pantalla que publica tiene que usar la misma lógica (aquí, el mismo hook).

## 40. Un teléfono en horizontal recibía el editor de escritorio

- **Fecha**: 2026-10-10
- **Qué pasaba**: El editor elegía Quick Edit solo por el ancho (menos de 768 px). Un teléfono girado (844 × 390 en un iPhone, 863 × 360 en un Pixel 7) pasaba al editor de escritorio, con un lienzo de 240 px de alto y la barra superior pisada, y al girar se perdía la hoja abierta.
- **Cómo se detectó**: Ronda 1 de QA, Pixel 7 en horizontal.
- **Arreglo**: `QUICK_EDIT_MEDIA_QUERY`: menos de 768 px de ancho, o pantalla táctil de hasta 500 px de alto. Las tabletas, que tienen 768 px o más en las dos orientaciones, siguen con el editor completo (que otro lote adapta al tacto, D4). ADR-040.
- **Cómo se verificó**: Pruebas del hook con `matchMedia` simulado (ancho, alto y tipo de puntero: teléfono vertical y horizontal, tableta en las dos orientaciones, ventana de escritorio baja) y de extremo a extremo con 844 × 390 táctil (Quick Edit) y 768 × 1024 (editor completo).
- **Lección**: "Móvil" no es un ancho. Una media query de solo `max-width` describe la ventana, no el dispositivo: para decidir la interfaz hay que mirar también el alto y el tipo de puntero.

## 41. Elegir "Producto" como tipo Open Graph tumbaba la página publicada

- **Fecha**: 2026-10-10
- **Qué pasaba**: El panel SEO ofrecía `product`, el servidor lo guardaba y `generateMetadata` lo pasaba tal cual a Next, que lanza un error con un tipo Open Graph que no conoce. Los robots de LinkedIn, Slack o Facebook recibían un 500 y cualquier visitante una página sin `<title>`.
- **Cómo se detectó**: Ronda 1 de QA (QA-009).
- **Arreglo**: El servidor solo acepta `website` y `article` y migró los valores viejos (lote del backend). En el frontend, `ogTypeOf()` (`lib/public-metadata.ts`) convierte cualquier otro valor en `website` antes de llegar a Next, el panel ya no ofrece `product` y muestra un valor antiguo como `website`, que es lo que la página publica. La etiqueta "OG type" pasa a "Tipo de contenido".
- **Cómo se verificó**: Prueba de `publicPageMetadata` con `og_type: 'product'` (sale `website`) y del panel (solo dos opciones, valor antiguo mostrado como `website`).
- **Lección**: Un valor que acaba en una API que lanza excepciones (aquí los metadatos de Next) se filtra con una lista cerrada en el último paso, aunque el servidor ya valide: los datos guardados antes de la validación siguen ahí.

## 42. El bloque de HTML personalizado no se veía en la página publicada

- **Fecha**: 2026-10-10
- **Qué pasaba**: El marco del bloque empezaba con altura 0 y solo se medía en su evento `load`. El HTML del servidor trae el marco con `srcdoc`, que carga antes de que React se enganche, y React nunca dispara `onLoad` para un marco ya cargado: el bloque ocupaba 0 px en casi todas las visitas (y siempre sin JavaScript). Además su título era la clave del mensaje sin traducir.
- **Cómo se detectó**: Ronda 1 de QA (QA-010, QA-041), en Chromium, WebKit y Firefox.
- **Arreglo**: El marco empieza con una altura razonable (150 px), se mide al montar si el documento ya está completo, se vuelve a medir cuando cambia de ancho (`ResizeObserver`) y se mide la altura del contenido, no `scrollHeight`, que nunca baja de la del marco. Recibe del tema el color del texto, de los enlaces y la fuente. La clave `blocks.customHtmlPreview` existe y un test comprueba todas las claves que usan los bloques.
- **Cómo se verificó**: Prueba de componente con un marco ya cargado antes de montar (altura medida), prueba del HTML del servidor (altura inicial y título traducido) y prueba de extremo a extremo: cinco cargas seguidas de `/p/<slug>` con el contenido visible y sin avisos de la política de contenido.
- **Lección**: Con renderizado en el servidor, cualquier evento que pueda ocurrir antes de la hidratación (`load`, `error` de imágenes y marcos) hay que comprobarlo también al montar.

## 43. Las páginas publicadas no llegaban a AA de contraste en ninguna paleta

- **Fecha**: 2026-10-10
- **Qué pasaba**: El pie, las estadísticas y el plan destacado usaban el color del texto como fondo y encima el texto secundario de la página (hasta 1,27:1, prácticamente invisible); los logos y las etiquetas se atenuaban con opacidad; los botones primarios eran blancos aunque la paleta dijera otra cosa (2,5:1 en nueve de catorce paletas); y en las paletas oscuras el pie salía claro.
- **Cómo se detectó**: Ronda 1 de QA (QA-019, QA-024), con axe sobre una página con todos los bloques en cada paleta: entre 12 y 31 fallos de contraste por página.
- **Arreglo**: ADR-041. Los bloques pintan con colores derivados del tema (`deriveThemeColors`): el color elegido si ya cumple, y si no el más parecido que llegue a 4,5:1 (3:1 en texto grande y bordes de campos). Variables nuevas para el texto sobre el primario y para las secciones inversas, que en las paletas oscuras siguen siendo oscuras. Sin opacidad sobre texto ni blancos fijos.
- **Cómo se verificó**: Prueba de cada par pintado en los catorce presets y en 300 paletas al azar; pruebas de componente (sin `text-white` ni opacidad sobre texto, variables inversas); prueba de extremo a extremo con la regla `color-contrast` de axe en cada preset a 390 y 1280 px; capturas antes y después de cada preset y plantilla.
- **Lección**: Un comprobador de contraste solo vale si mira los pares que de verdad se pintan. El panel comprobaba texto sobre fondo y sobre superficie, pero los bloques inventaban otros pares (texto sobre "texto", blanco sobre primario) que nadie medía.

## 44. La biblioteca de medios se abría metida en la columna del inspector

- **Fecha**: 2026-10-10
- **Qué pasaba**: Al pulsar "Seleccionar imagen" el diálogo `fixed inset-0` aparecía dentro de los 320 px del inspector, con el pie cortado ("N") y el resto del editor sin oscurecer.
- **Cómo se detectó**: Ronda 1 de QA (QA-020).
- **Arreglo**: El inspector tiene `backdrop-filter`, y un antecesor con `backdrop-filter` (o `transform`, `filter`) se convierte en el bloque contenedor de los `position: fixed`. El diálogo se pinta con `createPortal` en `document.body`.
- **Cómo se verificó**: Prueba de componente (un `ImageField` dentro de un elemento con `backdrop-filter`: el diálogo cuelga de `body`) y prueba de extremo a extremo (centrado y más ancho que 600 px a 1440 px).
- **Lección**: Un modal no debe vivir dentro del árbol del botón que lo abre si ese árbol puede tener efectos visuales. Portal siempre.

## 45. La biblioteca de medios no se podía usar con teclado ni lector de pantalla

- **Fecha**: 2026-10-10
- **Qué pasaba**: El diálogo no tenía `role="dialog"`, el foco no entraba ni quedaba dentro, y las miniaturas y la zona de subida eran `div` con `onClick`: con teclado no se podía elegir ni subir una imagen. Borrar una imagen no pedía confirmación y dejaba imágenes rotas en las páginas; el SVG se anunciaba como válido y el servidor lo rechazaba con el JSON a la vista.
- **Cómo se detectó**: Ronda 1 de QA (QA-021, QA-072, QA-074).
- **Arreglo**: Diálogo modal con nombre y `useDialogFocus` (foco dentro, Tab atrapado, Esc cierra y devuelve el foco), miniaturas como botones `aria-pressed` con el borrar como botón aparte, zona de subida como botón, confirmación antes de borrar, sin SVG y errores por código traducidos. Se añadió "Pegar URL" (QA-079). La firma (`onSelect`, `onClose`) no cambia; `onSelectUrl` es opcional.
- **Cómo se verificó**: Pruebas de componente (rol, foco, Tab, Esc, selección con teclado, confirmación, SVG, error traducido, URL) y de extremo a extremo.
- **Lección**: Un `div` clicable nunca es un control. Si se puede pulsar, es un `button`.

## 46. El editor no se podía usar en una tableta

- **Fecha**: 2026-10-10
- **Qué pasaba**: Con el dedo el lienzo no se desplazaba, pellizcar ampliaba toda la interfaz, arrastrar un componente se cancelaba, un toque a veces arrastraba en vez de seleccionar, a 1024 px el lienzo se cortaba y a 768 px quedaba en 320 px.
- **Cómo se detectó**: Ronda 1 de QA (QA-022, MOBILE-003/004, EDITOR-014).
- **Arreglo**: ADR-043. Gestos propios en el lienzo con `touch-action: none` (desplazar, pellizcar, toque, doble toque), arrastre táctil por asa, pulsación larga o movimiento lateral, botones Subir/Bajar, zoom mínimo 0,25, objetivos de 44 px con puntero grueso, e inspector y barra lateral sobre el lienzo en pantallas estrechas.
- **Cómo se verificó**: Pruebas unitarias de las reglas (zoom, decisión de arrastre) y de los gestos sobre el lienzo; prueba de extremo a extremo con toques reales (Chrome DevTools Protocol) a 1024×768 y 768×1024; y comprobación en WebKit y Chromium con capturas.
- **Lección**: "Funciona con ratón" no implica "funciona con dedos": un dedo que se mueve suele querer desplazar, no arrastrar. Cada arrastre táctil necesita una intención clara (asa, pulsación larga o dirección).
