#!/usr/bin/env node
/**
 * scripts/ig-sniper.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * 🎯 Instagram Sniper — Pegasos Volleyball UIO
 *
 * Usa Playwright (Chromium headless) para burlar las defensas de Instagram
 * y extraer de un perfil público:
 *   • Screenshot completo del perfil
 *   • Fotos del grid (hasta N posts)
 *   • Imagen de perfil (avatar) en alta resolución
 *   • Stories highlight covers
 *   • Colores dominantes de cada imagen (via sharp)
 *   • Metadata: bio, followers, posts count
 *
 * TODO antes de usar:
 *   1. npm run ig-sniper                      ← perfil por defecto
 *   2. npm run ig-sniper -- --user otrousuario ← perfil personalizado
 *   3. npm run ig-sniper -- --posts 12         ← cuántos posts descargar
 *
 * Salida:
 *   context/referencias/  ← screenshots y fotos descargadas
 *   context/paleta/       ← imagen de perfil para extraer colores
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { chromium } from 'playwright';
import sharp from 'sharp';
import { writeFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

// ── CONFIGURACIÓN ──────────────────────────────────────────────────────────
const DEFAULTS = {
  username:    'clubpegasosuio',         // ← usuario de Instagram a snipear
  maxPosts:    9,                        // cuántos posts del grid descargar
  headless:    true,                     // false = ver el navegador en acción
  slowMo:      80,                       // ms entre acciones (simula humano)
  timeout:     30_000,                   // timeout por operación (ms)
};

// ── ARGS CLI ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : def;
};

const USERNAME  = getArg('--user',  DEFAULTS.username);
const MAX_POSTS = parseInt(getArg('--posts', DEFAULTS.maxPosts), 10);
const HEADLESS  = !args.includes('--show');   // --show abre el browser visible
const IG_URL    = `https://www.instagram.com/${USERNAME}/`;

// ── DIRECTORIOS ────────────────────────────────────────────────────────────
const OUT = {
  refs:    path.join(ROOT, 'context', 'referencias'),
  paleta:  path.join(ROOT, 'context', 'paleta'),
  fotos:   path.join(ROOT, 'context', 'fotos'),
};

// ── HELPERS ────────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',  green: '\x1b[32m',  blue:   '\x1b[34m',
  yellow: '\x1b[33m', red:   '\x1b[31m',  gray:   '\x1b[90m',
  bold:   '\x1b[1m',  cyan:  '\x1b[36m',  magenta:'\x1b[35m',
};

const log = {
  info:    (m) => console.log(`${C.blue}ℹ${C.reset}  ${m}`),
  ok:      (m) => console.log(`${C.green}✔${C.reset}  ${m}`),
  warn:    (m) => console.log(`${C.yellow}⚠${C.reset}  ${m}`),
  error:   (m) => console.log(`${C.red}✖${C.reset}  ${m}`),
  step:    (m) => console.log(`\n${C.bold}${C.cyan}▶ ${m}${C.reset}`),
  dim:     (m) => console.log(`${C.gray}  ${m}${C.reset}`),
  color:   (hex, label) => console.log(`  ${C.bold}${hex}${C.reset}  ← ${label}`),
};

async function ensureDir(d) {
  if (!existsSync(d)) await mkdir(d, { recursive: true });
}

async function downloadBuffer(url, page) {
  // Usa la sesión de Playwright para descargar con las cookies/headers correctas
  const response = await page.request.get(url, {
    headers: {
      'accept':          'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'accept-language': 'es-EC,es;q=0.9,en;q=0.8',
      'sec-fetch-dest':  'image',
      'sec-fetch-mode':  'no-cors',
      'referer':         IG_URL,
    },
  });
  if (!response.ok()) throw new Error(`HTTP ${response.status()} para ${url}`);
  return Buffer.from(await response.body());
}

async function saveOptimized(buffer, destPath, label) {
  const origSize = buffer.length;
  const parsed = path.parse(destPath);

  // Convertir a PNG
  const pngBuf = await sharp(buffer)
    .resize({ width: 1200, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const pngPath = path.join(parsed.dir, `${parsed.name}.png`);
  await writeFile(pngPath, pngBuf);

  // Convertir a JPG
  const jpgBuf = await sharp(buffer)
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  const jpgPath = path.join(parsed.dir, `${parsed.name}.jpg`);
  await writeFile(jpgPath, jpgBuf);

  log.ok(`Guardado: ${path.basename(pngPath)} (${(origSize/1024).toFixed(0)}KB → ${(pngBuf.length/1024).toFixed(0)}KB) y ${path.basename(jpgPath)} (→ ${(jpgBuf.length/1024).toFixed(0)}KB)`);
  return pngBuf;
}

async function extractDominantColors(buffer) {
  try {
    const { dominant, channels } = await sharp(buffer)
      .resize(150, 150, { fit: 'cover' })
      .removeAlpha()
      .stats();
    const { r, g, b } = dominant;
    const hex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;

    // Generar variante oscura y clara
    const darker  = `#${Math.max(0,r-40).toString(16).padStart(2,'0')}${Math.max(0,g-40).toString(16).padStart(2,'0')}${Math.max(0,b-40).toString(16).padStart(2,'0')}`;
    const lighter = `#${Math.min(255,r+80).toString(16).padStart(2,'0')}${Math.min(255,g+80).toString(16).padStart(2,'0')}${Math.min(255,b+80).toString(16).padStart(2,'0')}`;

    return { hex, darker, lighter, r, g, b };
  } catch {
    return null;
  }
}

async function humanDelay(min = 600, max = 1400) {
  const ms = Math.floor(Math.random() * (max - min) + min);
  await new Promise(r => setTimeout(r, ms));
}

// ── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${C.magenta}🎯 Instagram Sniper — ${USERNAME}${C.reset}`);
  console.log(`${C.gray}Target: ${IG_URL}${C.reset}\n`);

  await Promise.all(Object.values(OUT).map(ensureDir));

  // ── Lanzar Chromium ─────────────────────────────────────────────────────
  log.step('Lanzando Chromium...');
  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: DEFAULTS.slowMo,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--lang=es-EC,es',
    ],
  });

  const context = await browser.newContext({
    viewport:           { width: 1280, height: 900 },
    locale:             'es-EC',
    timezoneId:         'America/Guayaquil',
    userAgent:          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'Accept-Language': 'es-EC,es;q=0.9,en;q=0.8',
      'Sec-CH-UA':       '"Chromium";v="128", "Google Chrome";v="128"',
    },
  });

  // Ocultar huellas de automatización
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins',   { get: () => [1,2,3,4,5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['es-EC','es','en'] });
    window.chrome = { runtime: {} };
  });

  const page = await context.newPage();

  const allColors = [];
  let metadata = {};

  try {
    // ── 1. Navegar al perfil ─────────────────────────────────────────────
    log.step(`Navegando a @${USERNAME}...`);
    await page.goto(IG_URL, { waitUntil: 'networkidle', timeout: DEFAULTS.timeout });
    await humanDelay(1500, 2500);

    // Cerrar popups de cookie/login si aparecen
    const popupSelectors = [
      '[aria-label="Rechazar cookies opcionales"]',
      '[aria-label="Only allow essential cookies"]',
      'button:has-text("Rechazar")',
      'button:has-text("No ahora")',
      '[role="dialog"] button:last-child',
    ];
    for (const sel of popupSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          log.dim(`Popup cerrado: ${sel}`);
          await humanDelay(800, 1200);
        }
      } catch { /* ignorar */ }
    }

    // ── 2. Screenshot del perfil completo ────────────────────────────────
    log.step('Capturando screenshot del perfil...');
    await humanDelay(1000, 2000);

    const screenshotPath = path.join(OUT.refs, `ig-${USERNAME}-perfil.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    log.ok(`Screenshot guardado: ig-${USERNAME}-perfil.png`);

    // También optimizar screenshot
    const screenshotPng = await sharp(screenshotPath).png().toBuffer();
    await writeFile(path.join(OUT.paleta, `ig-${USERNAME}-screenshot.png`), screenshotPng);
    const screenshotJpg = await sharp(screenshotPath).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    await writeFile(path.join(OUT.paleta, `ig-${USERNAME}-screenshot.jpg`), screenshotJpg);
    log.ok('Copia en context/paleta/ para extracción de colores');

    // ── 3. Extraer metadata del perfil ───────────────────────────────────
    log.step('Extrayendo metadata...');
    try {
      metadata = await page.evaluate(() => {
        const getMeta = (prop) => {
          const el = document.querySelector(`meta[property="${prop}"]`) ||
                     document.querySelector(`meta[name="${prop}"]`);
          return el?.content || '';
        };

        // Bio desde og:description
        const description = getMeta('og:description');
        const title       = getMeta('og:title');

        // Intentar leer stats del DOM de Instagram
        const statEls = [...document.querySelectorAll('li')].filter(
          li => li.innerText && /\d/.test(li.innerText)
        );

        return {
          title,
          description,
          url:        window.location.href,
          stats:      statEls.slice(0, 3).map(el => el.innerText?.trim()),
          pageTitle:  document.title,
        };
      });

      if (metadata.title)       log.ok(`Título:      ${metadata.title}`);
      if (metadata.description) log.ok(`Bio:         ${metadata.description.slice(0, 80)}...`);
      if (metadata.stats?.length) log.ok(`Stats:       ${metadata.stats.join(' | ')}`);
    } catch (err) {
      log.warn(`No se pudo extraer metadata: ${err.message}`);
    }

    // ── 4. Descargar avatar (imagen de perfil) ───────────────────────────
    log.step('Descargando imagen de perfil (avatar)...');
    try {
      // Instagram carga el avatar en varias resoluciones
      const avatarSrc = await page.evaluate(() => {
        // Buscar la imagen de perfil más grande
        const imgs = [...document.querySelectorAll('img')];
        const avatar = imgs.find(img =>
          img.alt?.toLowerCase().includes('photo') ||
          img.alt?.toLowerCase().includes('foto') ||
          (img.src?.includes('profile') && img.width > 50)
        );
        if (avatar) return avatar.src;

        // Fallback: og:image del meta tag
        return document.querySelector('meta[property="og:image"]')?.content || null;
      });

      if (avatarSrc) {
        log.dim(`Avatar URL: ${avatarSrc.slice(0, 80)}...`);
        const buf = await downloadBuffer(avatarSrc, page);
        const webpBuf = await saveOptimized(
          buf,
          path.join(OUT.paleta, `ig-${USERNAME}-avatar.webp`),
          'avatar'
        );

        // Extraer colores del avatar
        const colors = await extractDominantColors(webpBuf);
        if (colors) {
          allColors.push({ source: 'avatar', ...colors });
        }
      } else {
        log.warn('No se encontró imagen de perfil');
      }
    } catch (err) {
      log.warn(`No se pudo descargar avatar: ${err.message}`);
    }

    // ── 5. Descargar fotos del grid ──────────────────────────────────────
    log.step(`Descargando grid de posts (máx. ${MAX_POSTS})...`);
    await humanDelay(1000, 2000);

    let downloaded = 0;
    try {
      // Hacer scroll para cargar más posts
      await page.evaluate(() => window.scrollBy(0, 500));
      await humanDelay(800, 1200);

      // Recoger todas las URLs de imagen del grid
      const gridImages = await page.evaluate((max) => {
        const imgs = [...document.querySelectorAll('article img, main img, [role="main"] img')];
        return imgs
          .filter(img => img.src && img.src.startsWith('http') && img.naturalWidth > 100)
          .slice(0, max)
          .map(img => ({
            src:    img.src,
            srcset: img.srcset || '',
            alt:    img.alt || '',
            width:  img.naturalWidth,
            height: img.naturalHeight,
          }));
      }, MAX_POSTS);

      log.dim(`Encontradas ${gridImages.length} imágenes en el grid`);

      for (let i = 0; i < gridImages.length && downloaded < MAX_POSTS; i++) {
        const img = gridImages[i];

        // Preferir la URL de mayor resolución del srcset
        let bestUrl = img.src;
        if (img.srcset) {
          const srcsetParts = img.srcset.split(',')
            .map(s => s.trim().split(' '))
            .filter(p => p.length >= 1);
          const highRes = srcsetParts.reduce((best, curr) => {
            const w = parseInt(curr[1] || '0');
            const bw = parseInt(best[1] || '0');
            return w > bw ? curr : best;
          }, srcsetParts[0]);
          if (highRes?.[0]) bestUrl = highRes[0];
        }

        try {
          await humanDelay(400, 800);
          const buf = await downloadBuffer(bestUrl, page);
          const outPath = path.join(OUT.fotos, `ig-post-${String(i+1).padStart(2,'0')}.webp`);
          const webpBuf = await saveOptimized(buf, outPath, `post ${i+1}`);

          // Colores del post
          const colors = await extractDominantColors(webpBuf);
          if (colors) allColors.push({ source: `post-${i+1}`, ...colors });

          downloaded++;
        } catch (err) {
          log.warn(`Post ${i+1} falló: ${err.message.slice(0, 60)}`);
        }
      }
    } catch (err) {
      log.warn(`Error en grid: ${err.message}`);
    }

    // ── 6. Capturar highlights covers ────────────────────────────────────
    log.step('Buscando Stories Highlights...');
    try {
      const highlightImgs = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll('canvas, img')];
        return imgs
          .filter(el => {
            const parent = el.closest('[aria-label]');
            return parent && el.src;
          })
          .slice(0, 5)
          .map(el => el.src);
      });

      if (highlightImgs.length > 0) {
        log.dim(`Encontrados ${highlightImgs.length} highlights`);
        for (let i = 0; i < highlightImgs.length; i++) {
          try {
            const buf = await downloadBuffer(highlightImgs[i], page);
            const outPath = path.join(OUT.refs, `ig-highlight-${i+1}.webp`);
            await saveOptimized(buf, outPath, `highlight ${i+1}`);
          } catch { /* ignorar */ }
        }
      } else {
        log.dim('No se encontraron highlights o no son accesibles');
      }
    } catch { /* ignorar */ }

  } catch (err) {
    log.error(`Error principal: ${err.message}`);
    // Guardar screenshot de error para diagnóstico
    try {
      await page.screenshot({
        path: path.join(OUT.refs, `ig-error-${Date.now()}.png`),
        fullPage: false,
      });
      log.dim('Screenshot de error guardado en context/referencias/');
    } catch { /* ignorar */ }
  } finally {
    await browser.close();
  }

  // ── 7. Resumen de colores ──────────────────────────────────────────────
  if (allColors.length > 0) {
    console.log(`\n${C.bold}${C.cyan}── 🎨 PALETA DE COLORES DETECTADA ──${C.reset}`);
    console.log(`${C.gray}Copia estos valores en src/styles/global.css → :root${C.reset}\n`);

    const unique = [...new Map(allColors.map(c => [c.hex, c])).values()];

    for (const c of unique) {
      log.color(c.hex, `${c.source} — oscuro: ${c.darker}  claro: ${c.lighter}`);
    }

    const primaryCandidate = unique[0];
    if (primaryCandidate) {
      console.log(`\n${C.yellow}/* Sugerencia para global.css */
:root {
  --color-primary:       ${primaryCandidate.hex};
  --color-primary-dark:  ${primaryCandidate.darker};
  --color-primary-light: ${primaryCandidate.lighter};
}${C.reset}\n`);
    }
  }

  // ── 8. Guardar reporte JSON ────────────────────────────────────────────
  const report = {
    scraped_at: new Date().toISOString(),
    username:   USERNAME,
    url:        IG_URL,
    metadata,
    colors:     allColors,
    files_saved: (await readdir(OUT.refs).catch(() => [])).length +
                 (await readdir(OUT.fotos).catch(() => [])).length +
                 (await readdir(OUT.paleta).catch(() => [])).length,
  };

  await writeFile(
    path.join(ROOT, 'context', 'ig-report.json'),
    JSON.stringify(report, null, 2)
  );
  log.ok('Reporte guardado: context/ig-report.json');

  console.log(`\n${C.bold}${C.green}🎯 Snipe completo.${C.reset}`);
  console.log(`${C.gray}Próximo paso: npm run images  (procesar y comprimir todo)${C.reset}\n`);
}

main().catch(err => {
  log.error(`Fatal: ${err.message}`);
  console.error(err);
  process.exit(1);
});
