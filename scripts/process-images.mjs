#!/usr/bin/env node
/**
 * scripts/process-images.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Procesa y comprime AUTOMÁTICAMENTE todas las imágenes de la carpeta
 * `context/` y las copia optimizadas a `src/assets/images/` y `public/images/`.
 *
 * Uso:
 *   node scripts/process-images.mjs
 *   npm run images
 *
 * Carpetas de entrada:
 *   context/referencias/   → imágenes de referencia visual del club
 *   context/logos/         → logos del club (fondo transparente si es PNG)
 *   context/fotos/         → fotos de jugadores, entrenamientos, canchas
 *   context/paleta/        → capturas para extraer la paleta de colores
 *
 * Salidas:
 *   src/assets/images/     → imágenes optimizadas que Astro puede importar
 *   public/images/         → copia estática accesible desde la web directamente
 * ─────────────────────────────────────────────────────────────────────────────
 */

import sharp from "sharp";
import { readdir, mkdir, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── CONFIGURACIÓN ──────────────────────────────────────────────────────────
const CONFIG = {
  // Carpetas de contexto → destinos
  sources: [
    { dir: "context/logos", dest: "src/assets/images/logos", type: "logo" },
    { dir: "context/fotos", dest: "src/assets/images/fotos", type: "photo" },
    {
      dir: "context/referencias",
      dest: "src/assets/images/ref",
      type: "reference",
    },
    {
      dir: "context/paleta",
      dest: "src/assets/images/paleta",
      type: "reference",
    },
  ],

  // Configuración por tipo de imagen
  presets: {
    logo: {
      maxWidth: 400,
      quality: 95,
      formats: ["png", "webp"], // logos mantienen transparencia
    },
    photo: {
      maxWidth: 1200,
      quality: 82,
      formats: ["jpg", "webp"],
    },
    reference: {
      maxWidth: 1600,
      quality: 88,
      formats: ["jpg"],
    },
  },

  // Extensiones soportadas
  supportedExts: [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".avif",
    ".gif",
    ".tiff",
    ".bmp",
  ],
};

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
};

const log = {
  info: (m) => console.log(`${COLORS.blue}ℹ${COLORS.reset}  ${m}`),
  success: (m) => console.log(`${COLORS.green}✔${COLORS.reset}  ${m}`),
  warn: (m) => console.log(`${COLORS.yellow}⚠${COLORS.reset}  ${m}`),
  error: (m) => console.log(`${COLORS.red}✖${COLORS.reset}  ${m}`),
  section: (m) =>
    console.log(`\n${COLORS.bold}${COLORS.cyan}── ${m} ──${COLORS.reset}`),
  dim: (m) => console.log(`${COLORS.gray}   ${m}${COLORS.reset}`),
};

// ── HELPERS ────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

function formatSaving(orig, opt) {
  const saving = (((orig - opt) / orig) * 100).toFixed(1);
  const color =
    saving > 50 ? COLORS.green : saving > 20 ? COLORS.yellow : COLORS.gray;
  return `${color}−${saving}%${COLORS.reset}`;
}

async function ensureDir(dir) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

async function getFileSize(fp) {
  try {
    return (await stat(fp)).size;
  } catch {
    return 0;
  }
}

// ── PROCESAR UNA IMAGEN ────────────────────────────────────────────────────

async function processImage(srcPath, destDir, preset, filename) {
  await ensureDir(destDir);
  // También copiar a public/images/ para acceso estático
  const publicDir = path.join(ROOT, "public", "images", path.basename(destDir));
  await ensureDir(publicDir);

  const origSize = await getFileSize(srcPath);
  const baseName = path.parse(filename).name;
  const results = [];

  for (const fmt of preset.formats) {
    const outName = `${baseName}.${fmt}`;
    const outPath = path.join(destDir, outName);
    const pubPath = path.join(publicDir, outName);

    try {
      let pipeline = sharp(srcPath).resize({
        width: preset.maxWidth,
        withoutEnlargement: true,
      });

      switch (fmt) {
        case "webp":
          pipeline = pipeline.webp({ quality: preset.quality, effort: 4 });
          break;
        case "jpg":
        case "jpeg":
          pipeline = pipeline.jpeg({ quality: preset.quality, mozjpeg: true });
          break;
        case "png":
          pipeline = pipeline.png({
            quality: preset.quality,
            compressionLevel: 8,
          });
          break;
        case "avif":
          pipeline = pipeline.avif({ quality: preset.quality - 5, effort: 4 });
          break;
      }

      const buffer = await pipeline.toBuffer();
      const optSize = buffer.length;

      // Guardar en src/assets y public/images
      await sharp(buffer).toFile(outPath);
      await sharp(buffer).toFile(pubPath);

      results.push({ format: fmt, outPath, pubPath, origSize, optSize });
    } catch (err) {
      log.error(`Error procesando ${filename} → ${fmt}: ${err.message}`);
    }
  }

  return results;
}

// ── EXTRAER COLORES DOMINANTES ─────────────────────────────────────────────

async function extractColors(srcPath) {
  try {
    const { dominant } = await sharp(srcPath)
      .resize(200, 200, { fit: "inside" })
      .stats();
    const { r, g, b } = dominant;
    const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    return { r, g, b, hex };
  } catch {
    return null;
  }
}

// ── MAIN ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `\n${COLORS.bold}${COLORS.cyan}🏐 Pegasos Volleyball UIO — Procesador de imágenes${COLORS.reset}`,
  );
  console.log(`${COLORS.gray}${"─".repeat(55)}${COLORS.reset}\n`);

  let totalOrig = 0;
  let totalOpt = 0;
  let totalFiles = 0;
  const colorSuggestions = [];

  for (const source of CONFIG.sources) {
    const srcDir = path.join(ROOT, source.dir);
    const destDir = path.join(ROOT, source.dest);
    const preset = CONFIG.presets[source.type];

    if (!existsSync(srcDir)) {
      log.warn(
        `Carpeta no encontrada: ${source.dir} — créala y agrega imágenes`,
      );
      continue;
    }

    let files;
    try {
      files = (await readdir(srcDir)).filter((f) =>
        CONFIG.supportedExts.includes(path.extname(f).toLowerCase()),
      );
    } catch {
      log.warn(`No se pudo leer: ${source.dir}`);
      continue;
    }

    if (files.length === 0) {
      log.dim(`${source.dir}/ — vacío (agrega imágenes aquí)`);
      continue;
    }

    log.section(source.dir.replace("context/", "").toUpperCase());

    for (const file of files) {
      const srcPath = path.join(srcDir, file);
      log.info(`Procesando: ${COLORS.bold}${file}${COLORS.reset}`);

      // Extraer colores de paleta
      if (source.type === "reference" || source.type === "logo") {
        const color = await extractColors(srcPath);
        if (color) {
          colorSuggestions.push({ file, ...color });
          log.dim(
            `Color dominante: ${color.hex}  rgb(${color.r}, ${color.g}, ${color.b})`,
          );
        }
      }

      const results = await processImage(srcPath, destDir, preset, file);

      for (const r of results) {
        totalOrig += r.origSize;
        totalOpt += r.optSize;
        totalFiles++;
        log.success(
          `→ ${path.relative(ROOT, r.outPath).padEnd(45)} ` +
            `${formatBytes(r.origSize).padStart(9)} → ${formatBytes(r.optSize).padStart(9)} ` +
            `${formatSaving(r.origSize, r.optSize)}`,
        );
      }
    }
  }

  // ── RESUMEN ──────────────────────────────────────────────────────────────
  log.section("RESUMEN");

  if (totalFiles === 0) {
    log.warn(
      "No se procesaron imágenes. Agrega archivos a las carpetas context/",
    );
    console.log(`
${COLORS.gray}Carpetas disponibles:
  context/logos/         ← Logo del club (PNG con transparencia)
  context/fotos/         ← Fotos de jugadores y entrenamientos
  context/referencias/   ← Referencias visuales / captura de redes sociales
  context/paleta/        ← Capturas de pantalla para extraer colores
${COLORS.reset}`);
  } else {
    log.success(`${totalFiles} archivo(s) procesado(s)`);
    log.success(`Tamaño original total:  ${formatBytes(totalOrig)}`);
    log.success(`Tamaño optimizado total: ${formatBytes(totalOpt)}`);
    log.success(
      `Ahorro total: ${formatSaving(totalOrig, totalOpt)} (${formatBytes(totalOrig - totalOpt)})`,
    );

    if (colorSuggestions.length > 0) {
      log.section("COLORES DETECTADOS (para global.css)");
      for (const c of colorSuggestions) {
        console.log(
          `  ${COLORS.bold}${c.file}${COLORS.reset}: ${c.hex}  →  rgb(${c.r}, ${c.g}, ${c.b})`,
        );
      }
      console.log(
        `\n${COLORS.yellow}  💡 Copia estos colores en src/styles/global.css → variables :root${COLORS.reset}\n`,
      );
    }

    console.log(`\n${COLORS.gray}Imágenes disponibles en:
  src/assets/images/  → importar en componentes Astro
  public/images/      → referenciar como /images/... en HTML${COLORS.reset}\n`);
  }
}

main().catch((err) => {
  log.error(`Error fatal: ${err.message}`);
  process.exit(1);
});
