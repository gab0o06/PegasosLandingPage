# 📁 Carpeta de Contexto — Pegasos Volleyball UIO

Esta carpeta es donde **tú agregas imágenes de referencia** del club para que yo pueda:

1. **Ver los colores reales** del club y ajustar `global.css`
2. **Usar las fotos** dentro de la landing page (comprimidas automáticamente)
3. **Detectar la paleta** de colores exacta desde logos/capturas

---

## 📂 Estructura

```
context/
├── logos/         ← Logo del club (PNG con fondo transparente, ideal)
├── fotos/         ← Fotos de jugadores, entrenamientos, cancha, vacacionales
├── referencias/   ← Capturas de redes sociales, diseños del club, banners
└── paleta/        ← Capturas de pantalla del Instagram/Facebook para extraer colores
```

## ▶️ Cómo usar

1. **Agrega tus imágenes** en las carpetas correspondientes
2. **Ejecuta el procesador:**

```bash
npm run images
```

Esto hará automáticamente:
- ✅ Comprime todas las imágenes con **sharp** (librería profesional)
- ✅ Convierte a **WebP** (30-70% más ligero que JPG/PNG)
- ✅ **Detecta los colores dominantes** de logos y referencias
- ✅ Copia las imágenes optimizadas a `src/assets/images/` y `public/images/`
- ✅ Muestra el ahorro de tamaño y los **códigos de color HEX** para actualizar `global.css`

---

## 🎨 Ejemplo de output

```
── LOGOS ──
✔ src/assets/images/logos/logo-pegasos.webp       45.2 KB → 12.1 KB  −73%
   Color dominante: #0d8f7c  rgb(13, 143, 124)

── RESUMEN ──
✔ 3 archivo(s) procesado(s)
✔ Ahorro total: −68% (210 KB)

── COLORES DETECTADOS ──
  logo-pegasos.png: #0d8f7c  →  rgb(13, 143, 124)
  💡 Copia estos colores en src/styles/global.css → variables :root
```

---

## 💡 Tipos de imágenes recomendadas

| Carpeta | Qué poner | Formato ideal |
|---|---|---|
| `logos/` | Logo oficial del club | PNG (con transparencia) |
| `fotos/` | Fotos de entrenamientos, jugadores, cancha | JPG / PNG |
| `referencias/` | Screenshots de Instagram/Facebook del club | JPG / PNG |
| `paleta/` | Captura de la paleta de colores del club | JPG / PNG |

> **Tip**: Puedes hacer una captura de pantalla del Instagram/Facebook del club
> y ponerla en `referencias/` para que yo analice los colores exactos.

---

## 📦 Dónde quedan las imágenes procesadas

- **`src/assets/images/`** → para usar con el componente `<Image>` de Astro (optimización automática)
- **`public/images/`** → para referenciar directamente como `/images/foto.webp`

---

## 🔧 Configuración del procesador

Edita `scripts/process-images.mjs` para ajustar:
- **Calidad** de compresión (por defecto 82% para fotos, 95% para logos)
- **Ancho máximo** de las imágenes (por defecto 1200px para fotos)
- **Formatos de salida** (WebP, JPG, PNG)
