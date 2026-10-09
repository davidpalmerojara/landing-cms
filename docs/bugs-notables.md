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
