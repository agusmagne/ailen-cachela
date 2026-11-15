# Sitio de Ailén Cachela

Astro estático, una sola página con anclas, español (`/`) e inglés (`/en/`). Sin cookies ni trackers; los embeds de SoundCloud cargan recién al hacer clic.

## Correr

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # astro check + build a dist/
npm run preview    # sirve dist/
```

El dominio no está confirmado: se define al construir con `SITE_URL=https://ejemplo.com npm run build` (canonical, hreflang, sitemap, robots y JSON-LD lo usan).

## Editar contenido

Todo vive en **`src/content/site.yaml`** (textos, links, tracks, release, proyectos, fechas, bio, email y textos de interfaz es/en). Se valida en build con `src/lib/schema.ts`: un campo faltante, una fecha mal escrita o una URL inválida frenan el build con el detalle.

- Una `url` vacía oculta el botón; una lista vacía oculta la sección (salvo Fechas, que muestra "Sin fechas anunciadas por ahora.").
- Fechas: agregar ítems a `shows` (`date: YYYY-MM-DD`, `venue`, `city`, `country` de 2 letras, `url` opcional). Las próximas y las pasadas se separan solas al construir.
- Solo datos verificados. Lo pendiente de la artista está comentado en el mismo archivo.

## Sistema visual ("cromo negro")

Dirección: negro casi absoluto, metal líquido y vidrio, líneas concéntricas/moiré, grano y scanlines, un único acento iridiscente (rosa) con mucha moderación. Se recrea 100% con código propio (shader, canvas, SVG, CSS y tipografía); nada de `_research/` ni imágenes de terceros entra a `src/`, `public/` o `dist/`.

- **`src/styles/tokens.css`**: único lugar con colores, familias, escala, espaciado, radios, movimiento y textura (grano y scanlines se generan ahí). Las constantes de shader/canvas son las variables `--gl-*` (hex). No quedan `TODO-tablero`.
- **Tipografía** (SIL OFL 1.1, autoalojadas, subseteadas): Archivo en versión expandida (display y texto) y Martian Mono (datos y etiquetas). Los woff2 están en `src/assets/fonts/` junto con sus licencias; se regeneran con `node scripts/subset-fonts.mjs`.
- **Hero**: `src/scripts/chrome.ts` (fragment shader de metal líquido, WebGL directo, sin librerías). Se carga después del primer pintado, pausa fuera de pantalla y con la pestaña oculta, baja la resolución si el cuadro se atrasa, y con `prefers-reduced-motion` o sin WebGL queda un cuadro fijo o el fondo CSS.
- **Media sin foto**: `Media.astro` genera una portada (`variant="cover"`) o un retrato (`variant="portrait"`) a partir de una semilla; con `src` real sigue mostrando imagen o video.
- **Movimiento por sección**: hero (metal líquido + glitch único del nombre), Escuchar (disco zoótropo a saltos ligado al scroll y al estado del reproductor, marquee), Música/Sobre (piezas generativas, reveal por máscara), Proyectos (glitch RGB y semitono al pasar), Fechas (campo moiré en canvas 2D), Contacto y pie (aros estáticos, calma).
- **Identidad**: `public/favicon.svg` (geometría pura), `public/og.png` y `public/apple-touch-icon.png` se regeneran con `node scripts/make-og.mjs` (requiere Google Chrome; usa el mismo shader y los mismos tokens).
- **Fotos y videos**: dejarlos en **`src/assets/media/`** y referenciarlos por nombre en `site.yaml` (`hero.media`, `about.photo`, `releases[].cover`). Imágenes: jpg/png/webp/avif (se optimizan solas). Video: `.mp4` (+ `.webm` con el mismo nombre) y un póster obligatorio en la misma carpeta. Con `hero.media` cargado, el hero muestra la foto/video en lugar del shader.

## Móvil

Experiencia propia para teléfono (no es el escritorio apilado). Todo el escritorio con mouse queda igual; la capa móvil entra con `@media (max-width: 52rem)` (más, para el teléfono en horizontal, `(pointer: coarse) and (max-height: 32rem)`). Los números y tokens móviles viven en `tokens.css`; el comportamiento, en `src/scripts/mobile.ts`.

- **Menú**: hoja a pantalla completa que sube desde abajo, con todas las secciones, email, idioma y redes. Bloquea el scroll con `html.is-menu-open` (la clase y su `overflow:hidden` viven en la misma consulta, no puede quedar colgada al rotar), deja `inert` el resto de la página, atrapa el foco y cierra con Escape, el botón, un link o al pasar a escritorio.
- **Dock inferior** (`Dock.astro`): Escuchar + Booking al alcance del pulgar. Se esconde en el hero (que ya tiene esas CTA), con el menú abierto y en Contacto/pie; con el reproductor cargado y fuera de pantalla pasa a ser un mini reproductor que vuelve al reproductor.
- **Táctil**: `:active` propio en todo (se hunde y se ilumina), glitch RGB al soltar el dedo, vibración corta donde existe (Android), hero que se abolla con el dedo (más un "dedo fantasma" a los 3 s y la inclinación del teléfono si no pide permiso), disco del reproductor que se arrastra, portadas generativas que se animan al estar centradas, moiré que reacciona al toque y al scroll.
- **Proyectos** es un carrusel con `scroll-snap` (foco de teclado en la lista, flechas, botones Anterior/Siguiente, indicador y aviso para lectores).
- **Rendimiento**: sin `backdrop-filter` en la barra móvil, una sola capa de grano estática (sin scanlines), shader del hero con DPR hasta 2 pero tope de píxeles y degradación si los cuadros caen, y un solo canvas animado a la vez (`active.ts`).
- Textos de interfaz nuevos (es/en) en `site.yaml`, bajo `ui`.
