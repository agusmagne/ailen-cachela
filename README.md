# Sitio de Ailén Cachela

Astro estático, español (`/`) e inglés (`/en/`). La **home** es la portada fuerte (hero con metal líquido, reproductor con el disco de cromo, anclas) y
cada sección resume y enlaza a su página. La rama `pro-features` lo amplía a un sitio de ~60 páginas por idioma sobre una base común (registro de rutas,
`PageLayout`, componentes en `src/components/ui/`, datos por dominio, contenido de ejemplo con interruptor y descargables). Cómo se usa la base:
`src/components/README.md`. Plan y reglas: `_research/plan-pro.md`. Sin backend, sin cookies, sin trackers ni terceros: SoundCloud y YouTube cargan
recién tras un clic; todos los formularios arman un `mailto:` y ofrecen copiar el texto; el audio del Lab se sintetiza en el navegador y nunca arranca solo.

## Correr

```sh
npm install
npm run dev          # http://localhost:4321 (kit de componentes en /kit/ y /kit/en/, solo desarrollo)
npm test             # node --test: lógica pura de todos los paquetes, sin red
npx astro check      # tipos y .astro, sin errores ni warnings
npm run build        # astro check + build a dist/ (reescribe src/content/shows.snapshot.json; ver "Fechas")
npm run preview      # sirve dist/
npm run verify -- dist [--demo-off] [--base /prefijo]   # revisa un build ya generado (ver más abajo)
npm run downloads    # regenera los PDF con Chrome (ver "Descargables")
```

El dominio no está confirmado: `SITE_URL=https://ejemplo.com npm run build` (canonical, hreflang, sitemap, robots, JSON-LD y feeds lo usan). Para publicar en
una subcarpeta (GitHub Pages de proyecto): `SITE_URL=https://usuario.github.io BASE_PATH=/repo npm run build`. Todos los enlaces, el manifest, el service worker,
las descargas y el sitemap respetan `BASE_PATH`.

## Mapa del sitio

| Grupo | es | en |
|---|---|---|
| Home | `/` | `/en/` |
| Música | `/musica/`, `/musica/<slug>/` | `/en/music/`, `/en/music/<slug>/` |
| Mixes | `/mixes/`, `/mixes/<slug>/`, `/mixes/feed.xml` | `/en/mixes/`, `/en/mixes/<slug>/`, `/en/mixes/feed.xml` |
| Videos | `/videos/` | `/en/videos/` |
| Lab | `/lab/`, `/lab/secuenciador/`, `/lab/visualizador/`, `/lab/scratch/`, `/lab/generador/`, `/lab/en-vivo/` | `/en/lab/`, `…/sequencer/`, `…/visualizer/`, `…/scratch/`, `…/generator/`, `…/live/` |
| Fechas | `/fechas/`, `/fechas/archivo/`, `/fechas/archivo/<año>/`, `/fechas/calendario.ics` | `/en/shows/`, `…/archive/`, `…/archive/<year>/`, `…/calendar.ics` |
| Prensa | `/prensa/` | `/en/press/` |
| Booking | `/booking/`, `/booking/rider-tecnico/`, `/booking/rider-hospitalidad/`, `/booking/condiciones/` | `/en/booking/`, `…/technical-rider/`, `…/hospitality-rider/`, `…/terms/` |
| Oficio | `/estudio/`, `/servicios/`, `/clases/`, `/proyectos/`, `/proyectos/<slug>/` | `/en/studio/`, `…/services/`, `…/lessons/`, `…/projects/`, `…/projects/<slug>/` |
| Comunidad | `/tienda/`, `/newsletter/`, `/comunidad/`, `/links/` | `/en/shop/`, `…/newsletter/`, `…/community/`, `…/links/` |
| Legales | `/privacidad/`, `/accesibilidad/`, `/creditos/`, `/aviso-legal/` | `/en/privacy/`, `…/accessibility/`, `…/credits/`, `…/legal-notice/` |
| Otros | `/404.html`, `/manifest.webmanifest`, `/sitemap-index.xml`, `/robots.txt`, `/downloads/**`; vistas de impresión `…/imprimir/` y `…/print/` (`noindex`) | |

La fuente de verdad de las rutas es `src/lib/routes-core.ts`; `tests/routes.test.ts` falla si falta la gemela en otro idioma o si hay una página sin registrar.

**Navegación.** Escritorio, home: anclas Escuchar · Música · Fechas · Contacto + Prensa · Booking · Lab (`homeNav: true`). Escritorio, páginas interiores: Música · Mixes · Fechas ·
Prensa · Booking · Lab (`main: true`). Móvil: la hoja del menú lista las secciones y, debajo, "Todo el sitio" con el índice completo por grupos; el pie repite el
índice con los legales. El selector de idioma lleva siempre a la misma página en el otro idioma. Una página sin contenido (con el interruptor demo apagado) sale del
menú, de la hoja y del pie, pero existe con un estado vacío y `noindex`.

## Editar contenido (por dominio)

Cada dominio es un YAML en `src/content/` con su esquema en `src/lib/schemas/` (se valida en el build: un campo faltante, una fecha mal escrita o una URL inválida frenan
la compilación con el detalle). Los textos de interfaz es/en están en `src/content/ui/<paquete>.yaml` (cada clave empieza con `<paquete>_`).

| Archivo | Qué contiene |
|---|---|
| `site.yaml` | **Datos reales**: nombre, bio, email, redes, tracks de SoundCloud, ROOM.004, proyectos, calendario de fechas, interruptor `demo_content`, textos de la home |
| `releases.yaml`, `mixes.yaml` | Discografía y serie de mixes (ROOM.004 y los sets reales se leen de `site.yaml`; el resto es de ejemplo) |
| `tour.yaml` | Fechas del archivo, residencias y coordenadas del mapa (ejemplo). Las fechas reales vienen del calendario de iCloud |
| `press.yaml`, `booking.yaml` | Bios, ficha, citas, línea de tiempo / agentes, riders, condiciones, formularios |
| `studio.yaml`, `services.yaml`, `lessons.yaml`, `videos.yaml`, `collective.yaml` | Estudio, servicios, clases, videos y proyectos / colectivo |
| `shop.yaml`, `newsletter.yaml`, `community.yaml`, `links.yaml`, `legal.yaml` | Tienda, newsletter, comunidad, link-in-bio, textos legales y datos de la titular |
| `lab.yaml` | Tarjetas del hub del Lab |

Una `url` vacía oculta el botón; una lista vacía oculta la sección. Solo datos verificados: lo pendiente de la artista está comentado en cada archivo.

## Interruptor de contenido de ejemplo

Todo lo inventado lleva `demo: true` y se muestra con una marca visible ("Contenido de ejemplo"), una nota por sección y un aviso global en el pie; las páginas con ejemplo salen
`noindex` y fuera del sitemap. **Un solo interruptor**: `demo_content` en `site.yaml` (o `DEMO_CONTENT=0|1` al construir). Apagado, desaparecen los ítems de ejemplo, los
textos que los mencionan, las secciones que quedan vacías (tienda, estudio, servicios, clases, videos salen del menú y muestran un estado vacío), los JSON-LD/feeds de ejemplo y los PDF
con sello (el build los borra de `dist/downloads`). `npm run verify -- <carpeta> --demo-off` falla si queda alguna marca real de ejemplo en el HTML.

## Descargables

- **Generados en el build** (sin binarios): ZIP del press kit, vCard, QR en SVG, isotipos, `.ics` por fecha y `fechas/calendario.ics` (solo fechas reales). Salen de `src/pages/downloads/**`.
- **PDF** (EPK, one-sheet, riders técnico y de hospitalidad, advance sheet): se generan con Chrome headless desde las vistas de impresión y **se versionan** en
  `public/downloads/`. Regenerarlos con `npm run downloads` (o `npm run downloads -- --only epk-es`) cada vez que cambie el contenido o el estado del interruptor.
  Los generados con demo encendido llevan el sello "contenido de ejemplo". Con `demo_content: false` ninguna página los enlaza y el build los elimina de `dist/`; antes de publicar sin
  ejemplos hay que regenerarlos con el interruptor apagado (`DEMO_CONTENT=0 npm run downloads`) si se quiere ofrecerlos.
- Los `.ics` y `.vcf` escapan `;` `,` `\` y saltos de línea según RFC 5545 / 6350 (probado en `tests/downloads*.test.ts`).

## Verificación y SEO

`npm run verify -- dist` revisa cada HTML: título, descripción, canonical absoluta, un solo `h1`, `lang` correcto, hreflang es/en/x-default, imágenes con `alt`, JSON-LD que parsee,
cero recursos de terceros al abrir, enlaces internos que existan y, con `--demo-off`, ninguna marca de ejemplo. Con `--base /prefijo` valida un build con `BASE_PATH`.
El sitemap excluye las páginas `noindex` (vistas de impresión, páginas con ejemplo, kit de desarrollo). La PWA (`manifest.webmanifest`, `public/sw.js`) se registra solo en
producción; el service worker pide siempre la página nueva a la red (las fechas se recompilan cada 3 horas) y jamás guarda audio, descargas, `blob:` ni nada de otro origen;
`?sw=off` lo da de baja.

## Cómo reemplazar cada dato de ejemplo por uno real

1. **Releases y mixes**: agregar el ítem en `releases.yaml` / `mixes.yaml` sin `demo: true` (con sus links reales); borrar los de ejemplo.
2. **Bios, ficha, citas, apoyos, línea de tiempo, statement, pronunciación**: `press.yaml` (quitar `demo: true` del texto que la artista apruebe). Fotos reales en `src/assets/media/` y en `press.photos`.
3. **Riders, hospitalidad, condiciones, agentes**: `booking.yaml`; confirmar equipo, fee, depósito y cancelación con la artista y su contador/abogado; regenerar los PDF.
4. **Estudio, servicios, clases, videos**: sus YAML; los ids de video de ejemplo se reemplazan por reales (la fachada `Embed` carga `youtube-nocookie` solo tras el clic).
5. **Tienda, newsletter, comunidad**: `shop.yaml`, `newsletter.yaml`, `community.yaml`; conectar un servicio real implica revisar `/privacidad/`.
6. **Datos de la titular** del aviso legal: `legal.yaml` (`items`, campos "a completar").
7. **Fechas**: calendario de iCloud (ver más abajo); el archivo por año suma `tour.yaml` solo mientras haya ejemplo.
8. Al terminar, `demo_content: false`.

## Checklist antes de publicar

- [ ] Decidir `demo_content` (con `true` el sitio sale como versión de prueba, `noindex`).
- [ ] Datos reales: bios media/larga, ficha, fotos de prensa con crédito, links de Spotify/Beatport/YouTube, handle de fragmento.techno y SENKA, email de prensa.
- [ ] Riders y condiciones revisados por la artista y un profesional; datos de la titular completos en el aviso legal; revisar privacidad y accesibilidad.
- [ ] `SITE_URL` definitivo (y `BASE_PATH` si va en subcarpeta); íconos y OG regenerados si cambia la marca.
- [ ] `npm test`, `npx astro check`, `npm run build`, `npm run verify -- dist`; y con `DEMO_CONTENT=0`: build + `npm run verify -- <carpeta> --demo-off`.
- [ ] PDF regenerados con el estado del interruptor que se publica (`npm run downloads`).
- [ ] Probar en un teléfono real: menú, dock, reproductor, Lab con sonido (iOS: silencio físico y `AudioContext`), instalación como app.
- [ ] `git checkout src/content/shows.snapshot.json` si el build local lo reescribió con fechas que no se quieren versionar.
- [ ] Nada se publica en `main` sin decisión de la artista.

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
