# Sitio de Ailén Cachela

Astro estático, una sola página con anclas, español (`/`) e inglés (`/en/`). Sin cookies ni trackers; los embeds de SoundCloud cargan recién al hacer clic.

## Correr

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # astro check + build a dist/
npm test           # pruebas del lector de calendario (node --test, sin red)
npm run preview    # sirve dist/
```

El dominio no está confirmado: se define al construir con `SITE_URL=https://ejemplo.com npm run build` (canonical, hreflang, sitemap, robots y JSON-LD lo usan).

## Editar contenido

Todo vive en **`src/content/site.yaml`** (textos, links, tracks, release, proyectos, fechas, bio, email y textos de interfaz es/en). Se valida en build con `src/lib/schema.ts`: un campo faltante, una fecha mal escrita o una URL inválida frenan el build con el detalle.

- Una `url` vacía oculta el botón; una lista vacía oculta la sección (salvo Fechas, que muestra "Sin fechas anunciadas por ahora.").
- Fechas: salen solas del calendario de iCloud (ver **Cómo cargar una fecha**). En `shows.manual` se pueden sumar fechas sueltas (`date: YYYY-MM-DD`, `venue`, `city`, `country` de 2 letras, `url` opcional). Las próximas y las pasadas se separan solas al construir.
- Solo datos verificados. Lo pendiente de la artista está comentado en el mismo archivo.

## Cómo cargar una fecha

Para Ailén: las fechas se cargan como eventos en el calendario **FECHAS - AILEN CACHELA** de la app Calendario del iPhone. No hay que tocar GitHub ni ningún archivo.

1. Creá un evento nuevo en ese calendario.
2. **Título**: el nombre del evento o del lugar (ej. `Amazonia`). Si está **agotado**, escribí `[AGOTADO]` adelante (`[AGOTADO] Amazonia`). Si se **cancela**, `[CANCELADO]` adelante (o borrá el evento). Funciona con mayúsculas o minúsculas, con o sin tilde, y también `[SOLD OUT]` / `[CANCELLED]`. El prefijo no se ve en el sitio: se transforma en una etiqueta.
3. **Fecha y hora**: la de inicio del show, en hora de Argentina. Si no ponés hora (evento de "todo el día"), el sitio muestra solo el día. Si el show termina después de medianoche no pasa nada: se muestra solo la hora de inicio.
4. **Ubicación**: elegí el lugar desde el buscador de la app (así quedan calle, ciudad y mapa) o escribí `Calle 123, Ciudad, País`. Con la ubicación completa el sitio muestra la ciudad y el botón **Cómo llegar**. Si la ubicación no se entiende bien, se muestra tal cual la escribiste.
5. **URL**: el link de entradas (ej. el de Passline/Eventbrite). Es el botón **Entradas**. Si lo dejás vacío, el sitio usa el primer link que encuentre en las notas; si tampoco hay, no hay botón.
6. **Notas**: texto corto opcional que aparece bajo la fecha (horarios, invitadxs, aclaraciones). Los links se vuelven clickeables.

Cuándo aparece: el sitio se actualiza solo **cada 3 horas, más o menos** (puede tardar un poco más en horas de mucha carga de GitHub). Las fechas pasan solas al archivo cuando el show termina.

Importante:
- El calendario es **público**: cualquiera que tenga el link puede leerlo. Usalo **solo para shows** y no pongas nada privado (teléfonos, datos personales, notas internas).
- Las **imágenes o archivos adjuntos** de un evento **no se publican** (el sitio los ignora).
- Si el calendario no responde justo cuando se actualiza, el sitio sigue mostrando la última lista buena.

### Cómo funciona (para quien mantiene el sitio)

- **`src/lib/ics.ts`** parsea el `.ics` (sin dependencias); **`src/lib/show-map.ts`** convierte cada evento en un show (estado por prefijo, ubicación, links, notas, saneado); **`src/lib/show-list.ts`** combina con `shows.manual`, deduplica y separa próximas/pasadas según el *fin* del evento en hora argentina; **`src/lib/show-source.ts`** hace la política de fallos; **`src/lib/shows.ts`** une todo con Astro. El contenido del calendario se trata como no confiable: todo se renderiza como texto, los links deben ser `http(s)`, y los largos están acotados.
- La URL del calendario está en `shows.calendar_url` (`site.yaml`). Vacía = solo `shows.manual`.
- Recurrencias: se expanden las simples (diaria, semanal, mensual por día del mes, anual; con intervalo, cantidad, fecha límite, exclusiones y excepciones). Las reglas complejas (ej. "el primer lunes de cada mes") no se expanden: queda solo la primera fecha y se avisa en el log.
- **Respaldo**: `src/content/shows.snapshot.json` guarda la última lectura buena; se actualiza solo al compilar en local (`npm run build`), y hay que commitearlo. Si el calendario falla, el build usa esa copia y deja un `[fechas]` en el log. Un calendario válido pero vacío se toma como "sin fechas" (no es una falla).
- **Modo estricto** (`SHOWS_STRICT=1`): si el calendario falla, el build falla. El workflow lo activa solo en las corridas programadas, así queda publicado el sitio anterior.
- Variables de entorno: `SHOWS_CALENDAR_URL` (pisa la URL del YAML; `off` la apaga), `SHOWS_STRICT=1`, `SHOWS_ICS_FILE=/ruta/a/prueba.ics` (lee un `.ics` local en vez de la red; para probar el diseño, no toca el respaldo).
- **Workflow** (`.github/workflows/deploy.yml`): además del push, corre `17 */3 * * *` (UTC). GitHub desactiva los workflows programados de repos públicos tras 60 días sin actividad; el comentario del archivo detalla qué se verificó en la documentación y qué no.

## Sistema visual ("cromo negro")

Dirección: negro casi absoluto, metal líquido y vidrio, líneas concéntricas/moiré, grano y scanlines, un único acento iridiscente (rosa) con mucha moderación. Se recrea 100% con código propio (shader, canvas, SVG, CSS y tipografía); nada de `_research/` ni imágenes de terceros entra a `src/`, `public/` o `dist/`.

- **`src/styles/tokens.css`**: único lugar con colores, familias, escala, espaciado, radios, movimiento y textura (grano y scanlines se generan ahí). Las constantes de shader/canvas son las variables `--gl-*` (hex). No quedan `TODO-tablero`.
- **Tipografía** (SIL OFL 1.1, autoalojadas, subseteadas): Archivo en versión expandida (display y texto) y Martian Mono (datos y etiquetas). Los woff2 están en `src/assets/fonts/` junto con sus licencias; se regeneran con `node scripts/subset-fonts.mjs`.
- **Hero**: `src/scripts/chrome.ts` (fragment shader de metal líquido, WebGL directo, sin librerías). Se carga después del primer pintado, pausa fuera de pantalla y con la pestaña oculta, baja la resolución si el cuadro se atrasa, y con `prefers-reduced-motion` o sin WebGL queda un cuadro fijo o el fondo CSS.
- **Media sin foto**: `Media.astro` genera una portada (`variant="cover"`) o un retrato (`variant="portrait"`) a partir de una semilla; con `src` real sigue mostrando imagen o video.
- **Flyer de cada fecha**: `Flyer.astro` + `src/lib/flyer.ts` (puro, con pruebas). La semilla sale solo del `id` del evento (mismo arte en es/en y en cada build); el día del mes marca el único trazo de acento, el día de la semana gira el conjunto, la hora de inicio (si hay) da una muesca y las coordenadas del lugar (si existen) fijan el foco. Lo dibuja el mismo motor de `gen-media.ts` (un único contexto WebGL compartido, lazy y de a un cuadro por frame); sin WebGL ni JS queda un degradé CSS con los trazos SVG. Agotado cierra el anillo y desatura; cancelado lo cruza, lo vuelve punteado y lo apaga. Para exportarlo, `flyerSpec(show)` es la única fuente de verdad (ver el comentario del archivo).
- **Vinilo del reproductor**: `Disc.astro` (CSS: cuñas anisotrópicas fijas con la luz, surcos, canto biselado, etiqueta, rayones y un punto de acento en una capa que gira) + `scripts/disc.ts` (un solo ángulo de giro para todos los discos: fachada, sello y mini del dock; rampas de velocidad, hover, estado `data-disc-state="live"`, arrastre con inercia que no dispara el play). La cara de la fachada la dibuja `chrome.ts` en un modo "disco" del mismo shader (polares, surcos, cuña anisotrópica, metal líquido muy lento) sobre el contexto WebGL compartido: no hay un tercer contexto. Velocidades en `tokens.css` (`--disc-*`). Sin WebGL o sin JS queda el disco CSS completo; con `prefers-reduced-motion`, cuadro fijo.
- **Movimiento por sección**: hero (metal líquido + glitch único del nombre), Escuchar (vinilo de cromo líquido que insinúa el giro con el hover, gira a 33 rpm al reproducir y se arrastra, marquee), Música/Sobre (piezas generativas, reveal por máscara), Proyectos (glitch RGB y semitono al pasar), Fechas (campo moiré en canvas 2D), Contacto y pie (aros estáticos, calma).
- **Identidad**: `public/favicon.svg` (geometría pura), `public/og.png` y `public/apple-touch-icon.png` se regeneran con `node scripts/make-og.mjs` (requiere Google Chrome; usa el mismo shader y los mismos tokens).
- **Fotos y videos**: dejarlos en **`src/assets/media/`** y referenciarlos por nombre en `site.yaml` (`hero.media`, `about.photo`, `releases[].cover`). Imágenes: jpg/png/webp/avif (se optimizan solas). Video: `.mp4` (+ `.webm` con el mismo nombre) y un póster obligatorio en la misma carpeta. Con `hero.media` cargado, el hero muestra la foto/video en lugar del shader.

## Móvil

Experiencia propia para teléfono (no es el escritorio apilado). Todo el escritorio con mouse queda igual; la capa móvil entra con `@media (max-width: 52rem)` (más, para el teléfono en horizontal, `(pointer: coarse) and (max-height: 32rem)`). Los números y tokens móviles viven en `tokens.css`; el comportamiento, en `src/scripts/mobile.ts`.

- **Menú**: hoja a pantalla completa que sube desde abajo, con todas las secciones, email, idioma y redes. Bloquea el scroll con `html.is-menu-open` (la clase y su `overflow:hidden` viven en la misma consulta, no puede quedar colgada al rotar), deja `inert` el resto de la página, atrapa el foco y cierra con Escape, el botón, un link o al pasar a escritorio.
- **Dock inferior** (`Dock.astro`): Escuchar + Booking al alcance del pulgar. Se esconde en el hero (que ya tiene esas CTA), con el menú abierto y en Contacto/pie; con el reproductor cargado y fuera de pantalla pasa a ser un mini reproductor que vuelve al reproductor.
- **Táctil**: `:active` propio en todo (se hunde y se ilumina), glitch RGB al soltar el dedo, vibración corta donde existe (Android), hero que se abolla con el dedo (más un "dedo fantasma" a los 3 s y la inclinación del teléfono si no pide permiso), vinilo del reproductor que se arrastra con inercia (`touch-action: pan-y`: el scroll vertical sigue siendo del navegador), portadas generativas que se animan al estar centradas, moiré que reacciona al toque y al scroll.
- **Proyectos** es un carrusel con `scroll-snap` (foco de teclado en la lista, flechas, botones Anterior/Siguiente, indicador y aviso para lectores).
- **Rendimiento**: sin `backdrop-filter` en la barra móvil, una sola capa de grano estática (sin scanlines), shader del hero con DPR hasta 2 pero tope de píxeles y degradación si los cuadros caen, y un solo canvas animado a la vez (`active.ts`).
- Textos de interfaz nuevos (es/en) en `site.yaml`, bajo `ui`.
