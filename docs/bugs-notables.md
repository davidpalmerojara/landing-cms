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
