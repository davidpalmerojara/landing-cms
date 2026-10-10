// Records the 65-second walkthrough in docs/video/ against the real app, with on-screen captions.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
// Run against a running app (make dev, or next start in rewrite mode): BASE=http://localhost:3000 node scripts/record-demo.mjs
const BASE = process.env.BASE ?? 'http://localhost:3000';
const W = 1440, H = 900;
const OUT = process.env.OUT ?? 'demo-video';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: W, height: H }, locale: 'es-ES', colorScheme: 'dark', recordVideo: { dir: OUT, size: { width: W, height: H } } });
await ctx.addCookies([{ name: 'paxl-locale', value: 'es', url: BASE }]);
await ctx.addInitScript(() => {
  const style = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;max-width:80%;padding:12px 22px;border-radius:12px;background:rgba(10,15,26,.88);color:#F9FAFB;font:600 22px/1.35 system-ui,sans-serif;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.4);pointer-events:none;transition:opacity .3s';
  window.__caption = (text) => {
    let el = document.getElementById('__cap');
    if (!el) { el = document.createElement('div'); el.id = '__cap'; el.setAttribute('style', style); document.documentElement.appendChild(el); }
    el.textContent = text; el.style.opacity = text ? '1' : '0';
  };
  const hide = document.createElement('style');
  hide.textContent = 'nextjs-portal{display:none!important}';
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(hide));
});
const p = await ctx.newPage();
const caption = async (text, ms = 0) => { await p.evaluate((t) => window.__caption(t), text); if (ms) await wait(ms); };
const slowType = async (locator, text) => { await locator.click(); await p.keyboard.press('ControlOrMeta+a'); await p.keyboard.type(text, { delay: 45 }); };

// 1. Landing
await p.goto(BASE, { waitUntil: 'networkidle' });
await caption('Paxl: un editor visual de landing pages', 3000);
await caption('Se prueba sin registrarse', 1500);
await p.getByRole('button', { name: 'Probar sin registrarse' }).first().click();
await p.waitForURL('**/editor/**', { timeout: 30000 });
await p.waitForLoadState('networkidle');
await wait(1500);
const pageId = p.url().split('/editor/')[1];

// 2. Edit the hero
await caption('Una sesión de invitado de 24 horas, con una plantilla para empezar', 2800);
const h1 = p.locator('[data-canvas-viewport] h1').first();
const hb = await h1.boundingBox();
await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height + 60, { steps: 15 });
await p.mouse.click(hb.x + hb.width / 2, hb.y + hb.height + 60);
await caption('Bloques con contenido tipado, editados desde el inspector', 600);
await slowType(p.locator('aside textarea').first(), 'Tu producto, explicado en una página');
await wait(1500);

// 3. Devices
await caption('Móvil, tablet y escritorio con el mismo CSS (container queries)', 500);
const deviceButton = async (re) => {
  const names = await p.locator('header [aria-label], [role="radiogroup"] [aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  return p.getByLabel(names.find((n) => re.test(n || '')), { exact: true }).first();
};
await (await deviceButton(/m[oó]vil|mobile/i)).click();
await wait(2200);
await (await deviceButton(/tablet/i)).click();
await wait(1800);
await (await deviceButton(/escritorio|desktop/i)).click();
await wait(1200);

// 4. Theme
await caption('El tema manda: colores y tipografía para toda la página', 500);
await p.getByRole('radio', { name: 'Estilos' }).click();
await wait(900);
await p.getByRole('button', { name: 'Bosque', exact: true }).click();
await wait(1800);
await p.getByRole('button', { name: 'Atardecer', exact: true }).click();
await wait(1800);
await p.getByRole('radio', { name: 'Diseño' }).click();
await wait(700);

// 5. Lists
const faq = p.locator('[data-canvas-viewport] [role="group"][aria-label*="Preguntas frecuentes"]').first();
await faq.scrollIntoViewIfNeeded();
const fb = await faq.boundingBox();
await p.mouse.click(fb.x + fb.width / 2, fb.y + 30);
await caption('Listas que se añaden, se reordenan y se deshacen paso a paso', 600);
await p.getByRole('button', { name: /Añadir pregunta/i }).click();
await p.keyboard.press('ControlOrMeta+a');
await p.keyboard.type('¿Puedo editarla con mi equipo?', { delay: 40 });
await wait(1200);
const qCount = await p.getByRole('button', { name: /^Mover pregunta \d+ arriba$/ }).count();
await p.getByRole('button', { name: `Mover pregunta ${qCount} arriba` }).click();
await wait(1500);

// 6. Real-time collaboration: a second person joins with an invite link
await p.mouse.click(1100, 860);
await caption('Edición en tiempo real: invitas a otra persona con un enlace', 500);
await p.getByRole('button', { name: 'Compartir' }).first().click();
await p.getByRole('button', { name: 'Crear enlace de invitación' }).click();
const link = await p.getByLabel('Enlace de invitación').inputValue();
await wait(1800);
await p.keyboard.press('Escape');
await p.locator('[data-canvas-viewport] h1').first().scrollIntoViewIfNeeded();
const other = await (await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-ES' })).newPage();
await other.goto(link.startsWith('http') ? link : `${BASE}${link}`, { waitUntil: 'networkidle' });
await other.waitForURL(`**/editor/${pageId}`, { timeout: 30000 });
await other.waitForLoadState('networkidle');
await wait(2500);
await caption('Ves quién está conectado y qué bloque está editando', 800);
const oh1 = other.locator('[data-canvas-viewport] h1').first();
const ob = await oh1.boundingBox();
await other.mouse.click(ob.x + ob.width / 2, ob.y + ob.height + 60);
await wait(600);
const otherField = other.locator('aside textarea').first();
await otherField.click();
await other.keyboard.press('ControlOrMeta+a');
await other.keyboard.type('Hecha a cuatro manos', { delay: 70 });
await wait(2500);
await caption('Si dos personas guardan a la vez, se fusionan los cambios sin perder ninguno', 3200);

// 7. Publish
await caption('Publicar congela una copia; la página se renderiza en el servidor', 600);
await p.getByRole('button', { name: /^Publicar/ }).click();
await wait(2500);
const slug = (await (await p.request.get(`${BASE}/api/pages/${pageId}/`)).json()).slug;
await other.context().close();
await p.goto(`${BASE}/p/${slug}`, { waitUntil: 'networkidle' });
await caption('La página publicada, con su propia dirección', 2500);
await p.mouse.wheel(0, 700);
await wait(1500);
await p.mouse.wheel(0, 900);
await wait(1500);
await caption('Paxl: Next.js, TypeScript, Django y Channels', 2500);
await caption('', 400);
const video = p.video();
await ctx.close();
await b.close();
fs.copyFileSync(await video.path(), `${OUT}/paxl-demo.webm`);
console.log(`saved ${OUT}/paxl-demo.webm (convert: ffmpeg -i ${OUT}/paxl-demo.webm -vf scale=1280:-2 -c:v libx264 -crf 26 -pix_fmt yuv420p -movflags +faststart -an docs/video/paxl-demo.mp4)`);
