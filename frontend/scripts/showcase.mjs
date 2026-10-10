// Creates (or updates) and publishes the two showcase landings built with Paxl:
// Mara Vey and Picklet. Content comes from davidpalmero.dev/mara-vey and
// davidpalmero.dev/picklet; images are served from that site.
//
//   BASE=http://localhost:3000 PAXL_USER=demo PAXL_PASSWORD=... node scripts/showcase.mjs
//
// It talks to the public API only (login, pages, publish), so the same command
// works against a deployed instance.
import { randomUUID } from 'node:crypto';

const BASE = (process.env.BASE ?? 'http://localhost:3000').replace(/\/$/, '');
const USER = process.env.PAXL_USER;
const PASSWORD = process.env.PAXL_PASSWORD;
if (!USER || !PASSWORD) {
  console.error('Set PAXL_USER and PAXL_PASSWORD');
  process.exit(1);
}

const IMG = 'https://davidpalmero.dev/assets/projects';
const typography = (headingFont, bodyFont) => ({
  heading_font: headingFont, body_font: bodyFont, base_size: 16, scale_ratio: 1.25,
  heading_weight: 700, body_weight: 400, line_height_heading: 1.2, line_height_body: 1.6,
});
const spacing = { section_padding_y: '80px', section_padding_x: '24px', max_content_width: '1200px' };
const borders = { radius_sm: '4px', radius_md: '8px', radius_lg: '16px', radius_full: '9999px' };

const maraVey = {
  name: 'Mara Vey',
  design_tokens: {
    colors: {
      primary: '#d9a93f', secondary: '#2f9e7a', accent: '#86590b', background: '#0f1712', surface: '#17241c',
      text_primary: '#f3ead3', text_secondary: '#c2bca6', text_on_primary: '#1a1408', border: '#2b3a30',
      success: '#10b981', error: '#ef4444',
    },
    typography: typography('Playfair Display', 'Work Sans'),
    spacing,
    borders,
  },
  seo_title: 'Mara Vey y las Piedras del Sol',
  seo_description: 'Juego de plataformas en 2.5D para navegador y móvil. La versión 1.0 será gratuita.',
  blocks: [
    ['navbar', {
      brandName: 'Mara Vey',
      links: [
        { label: 'El juego', url: '#features' },
        { label: 'Cifras', url: '#stats' },
        { label: 'Galería', url: '#gallery' },
        { label: 'Preguntas', url: '#faq' },
      ],
      ctaText: 'Ficha del proyecto',
      ctaLink: 'https://davidpalmero.dev/mara-vey',
    }],
    ['hero', {
      badgeText: 'Próximamente · navegador y móvil',
      title: 'Mara Vey y las Piedras del Sol',
      subtitle: 'Un juego de plataformas en 2.5D. Mara Vey, cartógrafa, busca lo que queda de una civilización que adoraba al Sol, y su viaje empieza en la Costa de Jade.',
      buttonText: 'Ver la galería',
      buttonLink: '#gallery',
      secondaryButtonText: 'Cómo se hizo',
      secondaryButtonLink: '#timeline',
      backgroundImage: `${IMG}/mara-vey/mv-poster-1024.jpg`,
      alignment: 'center',
    }],
    ['features', {
      title: 'El primer mundo: la Costa de Jade',
      features: [
        { title: 'Nueve fases', description: 'Seis niveles, un campamento de práctica, un nivel secreto y un jefe en tres fases, unidos por un mapa en 3D.' },
        { title: 'Una historia en un diario', description: 'La aventura se cuenta en las páginas ilustradas del diario de Mara.' },
        { title: 'Hecho con código', description: '44 modelos 3D creados con scripts de Blender, y música y efectos generados en el navegador con Web Audio. Sin arte ni sonido de terceros.' },
        { title: 'Pensado para el móvil', description: 'Controles táctiles, teclado o mando, y se instala como app. Con 4G, la pantalla de título aparece en unos 3 segundos.' },
        { title: 'Accesible', description: 'Tres dificultades, foco visible, botones táctiles grandes, avisos visuales y por vibración, y menos animaciones si el sistema lo pide.' },
        { title: 'En español e inglés', description: 'La interfaz y la historia, en los dos idiomas.' },
      ],
    }],
    ['stats', {
      title: 'En cifras',
      subtitle: '',
      stats: [
        { value: '9', label: 'fases en el Mundo 1' },
        { value: '44', label: 'modelos 3D generados por código' },
        { value: '165', label: 'pruebas automáticas' },
        { value: '~3 s', label: 'hasta la pantalla de título con 4G' },
      ],
    }],
    ['gallery', {
      title: 'Galería',
      subtitle: 'Capturas del juego en el navegador.',
      columns: '3',
      images: [
        { src: `${IMG}/mara-vey/mv-1-1-1600.jpg`, alt: '1-1 Umbral Esmeralda: ruinas en la selva junto a una cascada' },
        { src: `${IMG}/mara-vey/mv-liana-1600.jpg`, alt: '1-2 El Camino Colgante: Mara se balancea en lianas sobre las nubes' },
        { src: `${IMG}/mara-vey/mv-disc-1600.jpg`, alt: '1-5 La Calzada del Sol Caído: un disco de piedra persigue a Mara' },
        { src: `${IMG}/mara-vey/mv-summit-1600.jpg`, alt: '1-6 La Escalinata del Ocaso: salto sobre una terraza de piedra' },
        { src: `${IMG}/mara-vey/mv-l1s-1600.jpg`, alt: '1-S El Santuario de Jade, el nivel secreto' },
        { src: `${IMG}/mara-vey/mv-boss-1600.jpg`, alt: 'El Guardián del Sol, jefe del Mundo 1' },
        { src: `${IMG}/mara-vey/mv-story-es-1248.jpg`, alt: 'Una página ilustrada del diario de Mara' },
        { src: `${IMG}/mara-vey/mv-title-es-1600.jpg`, alt: 'La pantalla de título del juego' },
        { src: `${IMG}/mara-vey/mv-devices-1600.jpg`, alt: 'El juego en un monitor, una tableta y un móvil' },
      ],
    }],
    ['timeline', {
      title: 'Cómo se hizo',
      events: [
        { date: '25 sep 2026', title: 'Primer commit', description: 'Arranca el proyecto con Three.js y Vite.' },
        { date: '28 sep 2026', title: 'Mundo 1 completo', description: 'Las nueve fases, jugables de principio a fin.' },
        { date: '5 oct 2026', title: 'Pulido', description: 'Partidas en móvil y PC, y bots que completan todos los niveles en cada dificultad. Cada fallo encontrado se convirtió en una prueba automática.' },
        { date: 'Próximamente', title: 'Versión 1.0', description: 'Gratis en el navegador. Hay cinco mundos más planificados.' },
      ],
    }],
    ['faq', {
      title: 'Preguntas frecuentes',
      questions: [
        { question: '¿Dónde se juega?', answer: 'En el navegador del ordenador, la tableta o el móvil. También se puede instalar como app.' },
        { question: '¿Cuánto cuesta?', answer: 'La versión 1.0 será gratuita en el navegador.' },
        { question: '¿Cuándo sale?', answer: 'La versión 1.0 está terminada y saldrá próximamente.' },
        { question: '¿Qué opciones de accesibilidad tiene?', answer: 'Tres dificultades, audio mono, menos intensidad sonora, avisos visuales y por vibración, ajuste de retardo para auriculares Bluetooth y menos animaciones si el sistema lo pide.' },
        { question: '¿Habrá más mundos?', answer: 'Hay cinco mundos más planificados que todavía no están construidos.' },
      ],
    }],
    ['cta', {
      title: 'La Costa de Jade está terminada',
      subtitle: 'La versión 1.0 será gratuita en el navegador. Mientras tanto, la ficha del proyecto cuenta cómo se hizo.',
      buttonText: 'Leer la ficha completa',
      buttonLink: 'https://davidpalmero.dev/mara-vey',
    }],
    ['footer', {
      brandName: 'Mara Vey y las Piedras del Sol',
      description: 'Videojuego para navegador y móvil, 2026. Hecho con Three.js, Vite, Web Audio, Blender y Playwright.',
      copyright: '© 2026 David Palmero Jara',
      links: [
        { label: 'Ficha del proyecto', url: 'https://davidpalmero.dev/mara-vey' },
        { label: 'Picklet', url: 'https://davidpalmero.dev/picklet' },
      ],
    }],
  ],
};

const picklet = {
  name: 'Picklet',
  design_tokens: {
    colors: {
      primary: '#3d7a2b', secondary: '#2d5c20', accent: '#a3c84b', background: '#ffffff', surface: '#f4f7f2',
      text_primary: '#14210f', text_secondary: '#4b5a46', text_on_primary: '#ffffff', border: '#dfe7da',
      success: '#10b981', error: '#ef4444',
    },
    typography: typography('Space Grotesk', 'Inter'),
    spacing,
    borders,
  },
  seo_title: 'Picklet: capturas para QA en Chrome',
  seo_description: 'Extensión de Chrome que captura la página completa con su contexto: URL, navegador, pantalla y errores de consola.',
  blocks: [
    ['navbar', {
      brandName: 'Picklet',
      links: [
        { label: 'Funciones', url: '#features' },
        { label: 'Cifras', url: '#stats' },
        { label: 'Capturas', url: '#gallery' },
        { label: 'Preguntas', url: '#faq' },
      ],
      ctaText: 'Ficha del proyecto',
      ctaLink: 'https://davidpalmero.dev/picklet',
    }],
    ['hero', {
      badgeText: 'Extensión de Chrome · aún sin publicar',
      title: 'Captura la página. Termina el trabajo en Studio',
      subtitle: 'Picklet hace capturas de página completa o de un elemento y guarda con ellas la URL, el navegador, el tamaño de pantalla y los errores de consola. Para testers de QA, desarrolladores y agencias.',
      buttonText: 'Ver las funciones',
      buttonLink: '#features',
      secondaryButtonText: 'Ver capturas',
      secondaryButtonLink: '#gallery',
      backgroundImage: '',
      alignment: 'center',
    }],
    ['features', {
      title: 'Qué hace',
      features: [
        { title: 'Página completa', description: 'Hace scroll y une las capturas, también con contenedores con scroll o contenido que carga al bajar. Las cabeceras fijas salen una sola vez.' },
        { title: 'Captura con contexto', description: 'Se edita en la misma pestaña y se exporta como imagen, PDF o informe de evidencia: un HTML sin scripts con la captura, la URL, el entorno y los avisos de consola.' },
        { title: 'Sin cuenta ni servidor', description: 'Todo se procesa en tu navegador. Solo actúa cuando pulsas el icono o el atajo.' },
        { title: 'Editor integrado', description: 'Recorte, flechas, rectángulos, dibujo a mano alzada, texto y pixelado, con deshacer y rehacer. Exporta a PNG, JPEG, WebP o PDF.' },
        { title: 'Comparar y probar en varios tamaños', description: 'Compara dos capturas píxel a píxel y captura la página a 375, 768 y 1280 px.' },
        { title: 'Picklet Studio', description: 'La web complementaria: guarda informes y monta mockups con marcos de navegador, portátil, tableta o móvil.' },
      ],
    }],
    ['stats', {
      title: 'En cifras',
      subtitle: '',
      stats: [
        { value: '+200', label: 'pruebas unitarias en la extensión' },
        { value: '6', label: 'permisos, sin acceso a las webs que visitas' },
        { value: '120.000 px', label: 'de alto como máximo en una captura' },
        { value: '200 MiB', label: 'de biblioteca local' },
      ],
    }],
    ['gallery', {
      title: 'Capturas',
      subtitle: 'Capturas reales de la extensión y de Studio, con datos de ejemplo.',
      columns: '3',
      images: [
        { src: `${IMG}/picklet/pk-popup-1280.jpg`, alt: 'El popup de Picklet con las pestañas Capturar, HTML y Comparar' },
        { src: `${IMG}/picklet/pk-evidence-1280.jpg`, alt: 'Un informe de evidencia con la captura, el entorno y la consola' },
        { src: `${IMG}/picklet/pk-editor-640.jpg`, alt: 'El editor de Picklet con sus herramientas' },
        { src: `${IMG}/picklet/pk-studio-640.jpg`, alt: 'El editor de mockups de Picklet Studio' },
        { src: `${IMG}/picklet/pk-library-1280.jpg`, alt: 'La biblioteca de Studio con datos de ejemplo' },
        { src: `${IMG}/picklet/pk-fullpage-640.jpg`, alt: 'Una captura de página completa en curso' },
      ],
    }],
    ['timeline', {
      title: 'Cómo se hizo',
      events: [
        { date: 'Julio 2026', title: 'Empieza el proyecto', description: 'La extensión, en TypeScript estricto, React y WXT sobre Manifest V3.' },
        { date: 'Agosto 2026', title: 'La extensión, lista', description: 'Probada en Chrome con GitHub, Wikipedia, Notion y Stripe, y con escalas de pantalla de 1,25 y 2.' },
        { date: 'Agosto 2026', title: 'Nace Picklet Studio', description: 'Primero como biblioteca de informes; después suma un editor de mockups.' },
        { date: 'Octubre 2026', title: 'Extensión y Studio, conectados', description: 'Los envíos a Studio usan un permiso de un solo uso que caduca a los diez minutos.' },
      ],
    }],
    ['faq', {
      title: 'Preguntas frecuentes',
      questions: [
        { question: '¿Necesito una cuenta?', answer: 'No. Todo se procesa en tu navegador. Solo si quieres guardar tus informes de Studio en la nube inicias sesión con tu correo.' },
        { question: '¿Qué permisos pide?', answer: 'Seis, y usa activeTab: actúa solo cuando pulsas el icono o el atajo y no tiene acceso a las webs que visitas.' },
        { question: '¿Funciona en todas las páginas?', answer: 'Chrome no permite extensiones en las páginas chrome:// ni en la Chrome Web Store. Live Capture, que guarda la página como HTML estático, sigue en beta.' },
        { question: '¿Cuándo sale?', answer: 'La extensión pasa todas sus comprobaciones. Falta repetir las pruebas manuales con el paquete final y publicarla en la Chrome Web Store.' },
        { question: '¿Y después?', answer: 'Firefox y Edge, y enviar capturas a Jira, GitHub o Linear.' },
      ],
    }],
    ['cta', {
      title: 'Gratis y completa',
      subtitle: 'Picklet será gratuita, en español e inglés. La ficha del proyecto cuenta los problemas técnicos que resolvió.',
      buttonText: 'Leer la ficha completa',
      buttonLink: 'https://davidpalmero.dev/picklet',
    }],
    ['footer', {
      brandName: 'Picklet',
      description: 'Extensión de Chrome y web, 2026. TypeScript, React, WXT, Next.js y Supabase.',
      copyright: '© 2026 David Palmero Jara',
      links: [
        { label: 'Ficha del proyecto', url: 'https://davidpalmero.dev/picklet' },
        { label: 'Mara Vey', url: 'https://davidpalmero.dev/mara-vey' },
      ],
    }],
  ],
};

// --- API ---

let cookies = '';
async function call(method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: cookies },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  if (setCookies.length) {
    const jar = new Map(cookies.split('; ').filter(Boolean).map((c) => c.split(/=(.*)/s).slice(0, 2)));
    for (const c of setCookies) { const [pair] = c.split(';'); const [k, v] = pair.split(/=(.*)/s); jar.set(k, v); }
    cookies = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return data;
}

function payload(page) {
  return {
    name: page.name,
    design_tokens: page.design_tokens,
    seo_title: page.seo_title,
    seo_description: page.seo_description,
    blocks: page.blocks.map(([type, data], order) => ({ id: randomUUID(), type, order, data, styles: {} })),
  };
}

await call('POST', '/auth/login/', { username: USER, password: PASSWORD });
const list = await call('GET', '/pages/?page_size=100');
const existing = list.results ?? list;
for (const page of [maraVey, picklet]) {
  const found = existing.find((p) => p.name === page.name);
  let saved;
  if (found) {
    const current = await call('GET', `/pages/${found.id}/`);
    saved = await call('PUT', `/pages/${found.id}/`, { ...payload(page), version: current.version });
  } else {
    saved = await call('POST', '/pages/', payload(page));
  }
  const published = await call('POST', `/pages/${saved.id}/publish/`);
  console.log(`${page.name}: ${BASE}/p/${published.slug} (${found ? 'updated' : 'created'})`);
}
