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
