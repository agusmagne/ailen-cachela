# Base común del sitio multipágina

Todo lo que un paquete necesita para agregar páginas **sin editar archivos compartidos**. Los componentes viven en
`src/components/ui/`; los layouts, en `src/layouts/`; la lógica, en `src/lib/`. Leé también `_research/plan-pro.md`
(sección "Reglas para los paquetes").

## 1. Cómo se agrega una página

1. **La ruta ya está reservada** en `src/lib/routes-core.ts` (id, rutas es/en, grupo, paquete dueño). No se edita.
2. Creá las **dos páginas** (es y en). Una ruta con `path: { es: 'prensa', en: 'press' }` son estos dos archivos:

```astro
---
// src/pages/prensa/index.astro   (la gemela en inglés: src/pages/en/press/index.astro, con lang = 'en')
import PageLayout from '../../layouts/PageLayout.astro';
import SectionHead from '../../components/ui/SectionHead.astro';
import { domain } from '../../lib/data';
import { schema } from '../../lib/schemas/press';
import { t } from '../../lib/content';
const lang = 'es';
const press = domain('press', schema); // ya viene sin ítems de ejemplo si el interruptor está apagado
---
<PageLayout lang={lang} route="press" title={t('press_title', lang)} description={t('press_desc', lang)}
            demo={press.items.some((i) => i.demo)} empty={press.items.length === 0}>
  <p slot="lead">{t('press_lead', lang)}</p>
  <SectionHead lang={lang} title={t('press_bios', lang)} demo />
  ...
</PageLayout>
```

Para no duplicar lógica, el cuerpo real va en un componente del paquete (`src/components/press/PressPage.astro`
con `lang` como prop) y las dos páginas son de 6 líneas que lo invocan.

3. Mientras falte una de las dos páginas, la ruta **no se enlaza** desde ningún lado. Cuando existen las dos, aparece
   sola en el menú principal (si `main: true`), en el índice de la hoja móvil y en el pie. Si además tiene
   `requires` (dominio de datos) y ese dominio queda vacío (p. ej. con el interruptor demo apagado), se oculta de la
   navegación pero la página se sigue generando con un estado vacío digno.
4. Páginas con parámetro (`musica/:slug`): `src/pages/musica/[slug].astro` + `getStaticPaths`; `PageLayout` recibe
   `params={{ slug }}` y `crumbTail={título del ítem}`.
5. `tests/routes.test.ts` falla si creás una página que no está en el registro o si falta su gemela en otro idioma.

Enlaces entre páginas: `router.path('press', lang)` (con `BASE_PATH`), `router.path('release', lang, { slug })`,
`router.alternates(id, params)`. Nunca escribas `/prensa/` a mano.

## 2. Contenido: dominios, textos de interfaz y contenido de ejemplo

| Pieza | Archivo propio del paquete | Notas |
|---|---|---|
| Datos | `src/content/<dominio>.yaml` | Lista principal siempre bajo la clave `items`. Cada ítem inventado lleva `demo: true`. |
| Esquema | `src/lib/schemas/<dominio>.ts` | **Puro** (solo `astro/zod` y `_shared.ts`), exporta `schema`. Usá `item({...})` e `items(...)` de `_shared.ts`. El dominio vacío (sin archivo) debe ser válido. |
| Textos es/en | `src/content/ui/<paquete>.yaml` | Cada clave empieza con `<paquete>_`. Una clave repetida o sin prefijo frena el build. |
| Tokens nuevos | `src/styles/tokens/<paquete>.css` | Se importan solos (Base y PrintLayout). Nunca `tokens.css`. |
| Módulos de cliente | `src/scripts/modules/<paquete>-<nombre>.ts` | Ver "Carga diferida". |

Dominios reservados y claves que el registro de rutas consulta: `releases.items`, `mixes.items`, `videos.items`,
`lab.items`, `studio.gear|notes`, `services.items`, `lessons.items`, `collective.items`, `shop.items`.
Los demás dominios (`press`, `booking`, `tour`, `newsletter`, `community`, `links`, `legal`) son libres.

### Contenido de ejemplo (regla del proyecto)

- Un solo interruptor: `demo_content` en `site.yaml` (o `DEMO_CONTENT=0|1` al construir).
- **Arreglos**: el cargador saca solo todo elemento `demo: true` cuando está apagado (a cualquier profundidad). Se
  valida siempre el dato completo, así un error en un ítem de ejemplo se ve en las dos versiones.
- **Objetos sueltos** con `demo: true` (una bio, un rider): decidí con `visibleOrNull(obj)` de `src/lib/demo.ts`.
- **Pantalla**: `<DemoBadge variant="item">` en cada ítem (o `demo` en `Card`, `Download`, `Embed`, `ComingSoon`),
  `<SectionHead demo>` o `<PageLayout demo>` para la nota de sección/página. El pie de todas las páginas muestra el
  aviso global (`DemoNotice`). `PageLayout demo` además pone `noindex` mientras el interruptor esté encendido.
- **JSON-LD y feeds**: nunca con ítems de ejemplo (`isDemo`). **PDF y ZIP**: los generados con contenido de ejemplo
  llevan el sello (`PrintLayout demo`).
- Sin citas atribuidas a personas, medios, clubes, sellos o marcas reales no verificadas: "Medio de ejemplo",
  "Club Ejemplo · Ciudad".

## 3. Componentes (`src/components/ui/`)

| Componente | Para qué | Props principales |
|---|---|---|
| `PageHead` | Cabecera de página (migas, numeral, título display, bajada). La usa `PageLayout`. | `lang title crumbs kicker numeral total demo` · slots `lead`, `meta` |
| `Breadcrumbs` | Migas semánticas. | `lang items[{label,href?}]` |
| `SectionHead` | `h2` de una sección dentro de una página, con filete y nota demo. | `lang title id kicker lead demo level` |
| `Card` | Tarjeta (clickeable entera con `href`). | `lang title href external kicker demo as level` · slots `media`, default, `footer` |
| `DataList` | Ficha técnica (`dl`): BPM, sello, formato. | `items[{label,value,href?,wide?}] layout('grid'\|'rows')` o slot |
| `DataTable` | Tabla responsiva (en teléfono, filas "etiqueta: valor"). | `lang caption columns[{key,label,numeric,nowrap}] rows` |
| `Button` | Botón/enlace con el aspecto `.btn`. | `href variant('primary'\|'default') size('xl') external arrow download lang` |
| `Chip` | Etiqueta mono, o filtro con `href`/`selected`. | `href tone('accent') selected` |
| `Tabs` | Pestañas accesibles (sin JS: paneles apilados). Paneles por slot con el nombre del `id`. | `lang tabs[{id,label}] label initial` |
| `Accordion` | `details` nativos, panel por slot. | `items[{id,title,open}] exclusive` |
| `Download` | Bloque de descarga con tipo y peso. | `lang href label kind size description filename demo` |
| `Embed` | Fachada de SoundCloud / YouTube nocookie; el iframe nace al clic. | `lang provider title url\|id demo` |
| `QrCode` | QR en SVG generado en build, sin servicios externos. | `text label size ecc plain` |
| `EmptyState` | Estado vacío digno. | `lang title text` · slot de acción |
| `ComingSoon` | Bloque "próximamente" (tienda, newsletter, membresía sin conectar). | `lang title text demo` |
| `DemoBadge` | Marca de contenido de ejemplo. Invisible con el interruptor apagado. | `lang variant('item'\|'section'\|'inline')` |
| `DemoNotice` | Aviso global discreto (ya está en el pie). | `lang` |
| `LazyModule` | Carga un script al entrar en pantalla. | `name props when('visible'\|'idle') as class` |
| `SiteIndex` | Índice completo del sitio (hoja móvil y pie). | `lang variant current` |

Reutilizá también lo existente de `src/components/`: `Media` (portadas/retratos generativos por semilla),
`Flyer`, `Disc`, `Glitch`, `SplitText`, `Marquee`, `Section` (solo para la home).
Utilidades globales de `src/styles/ui.css`: `.prose`, `.grid-cards`, `.page-block`, `.is-demo`, `.field`, `.input`.

### Layouts

- `PageLayout` (`route`, `params`, `title`, `description`, `kicker`, `crumbTail`, `demo`, `empty`, `jsonLd`, `ogImage`,
  `ogType`, `dock`): resuelve `<title>`, canonical, hreflang es/en/x-default, OG, JSON-LD (WebPage + BreadcrumbList +
  nodos extra), Nav, migas, numeral, pie con índice y dock móvil. Slot `head` para `<link>`/`<meta>` propios.
- `Base`: para páginas a pantalla completa (`bare: true` en el registro: Lab en vivo, link-in-bio). Props `alternates`,
  `ogImage`, `ogType`, `jsonLd` (un nodo o lista), `noindex`.
- `PrintLayout`: vista A4 para PDF (ver "Descargables").

Un `<link>` al manifest, a los feeds RSS de mixes y al calendario `.ics` se agrega solo en el `<head>` si el
endpoint existe (`ENDPOINTS` en `routes-core.ts`): `src/pages/manifest.webmanifest.ts`,
`src/pages/mixes/feed.xml.ts` + `src/pages/en/mixes/feed.xml.ts`,
`src/pages/fechas/calendario.ics.ts` + `src/pages/en/shows/calendar.ics.ts`.

## 4. Scripts de cliente

- **Carga diferida**: `<LazyModule name="lab-sequencer" props={{...}}>`; el módulo `src/scripts/modules/lab-sequencer.ts`
  exporta por defecto `(el, props) => void | Promise<void>` y se importa recién cuando el elemento se acerca al
  viewport. El marcado base dentro del slot tiene que funcionar sin JS. Un módulo que falla no rompe la página.
- **Copiar al portapapeles**: `<button data-copy="texto" data-done="Copiado"><span data-copy-label>Copiar</span></button>`
  (ya implementado en `motion.ts`).
- **Mails sin backend**: `src/lib/mailto.ts` (`buildMailto`, `fitsMailto`, `plainDraft`): `mailto:` con cuerpo prellenado
  y respaldo de copia del texto.
- **WebGL**: hay un contexto en el hero y uno compartido (`chrome.ts`). Lo nuevo reutiliza el compartido
  (`drawChromeStill`, `drawChromeDisc`) y se registra en `active.ts` (un solo canvas animado a la vez).
- **Audio**: nunca arranca solo; siempre tras un gesto y con control de silencio visible. Solo sonido sintetizado
  con Web Audio (`base_sound_*` en los textos de la base).

## 5. Descargables

Mecanismo en dos carriles, y el workflow de GitHub Actions no necesita nada extra:

**A) Generados por Astro en `astro build` (sin binarios, funcionan en CI):** endpoints `src/pages/downloads/<paquete>/…`
con helpers de `src/lib/downloads/`:

| Helper | Archivo |
|---|---|
| `createZip(entries)` | ZIP determinista (deflate, nombres UTF-8) |
| `buildIcs(events, opts)` | `.ics` de eventos (también para suscripción `webcal://`) |
| `buildVCard(data)` | `.vcf` de contacto |
| `qrSvg(text)` / `qrMatrix(text)` | QR sin dependencias (versiones 1–12, L/M) |
| `fileResponse(body, 'zip'\|'ics'\|…)`, `publicFileSize`, `formatBytes` | respuesta tipada y peso para `<Download>` |

```ts
// src/pages/downloads/press/press-kit.zip.ts
import type { APIRoute } from 'astro';
import { createZip } from '../../../lib/downloads/zip';
import { fileResponse } from '../../../lib/downloads/response';
export const GET: APIRoute = () => fileResponse(createZip([{ name: 'bio.txt', data: '…' }]), 'zip');
```

URL final: `router`-independiente, `withBase('/downloads/press/press-kit.zip')`. Un endpoint con idioma lleva el
idioma en el nombre (`…-es.zip`, `…-en.zip`).

**B) PDF con Chrome headless (EPK, riders, one-sheet):**

1. El paquete crea una **página de impresión** real, `noindex`, con `PrintLayout` (A4, papel claro, sin texturas):
   `src/pages/prensa/imprimir/index.astro` (es) y `src/pages/en/press/print/index.astro` (en). Las subrutas `imprimir`
   (es) y `print` (en) de cualquier ruta están permitidas sin registrarlas y nunca entran en la navegación.
2. Declara el trabajo en `scripts/pdf/<paquete>.mjs`:
   `export const jobs = [{ name: 'epk-es', route: '/prensa/imprimir/', out: 'public/downloads/ailen-cachela-epk-es.pdf' }]`.
3. `npm run downloads` (o `-- --only epk-es`): construye el sitio en una carpeta temporal, lo sirve en local y le pide a
   Chrome que imprima cada ruta. Usa un perfil propio de Chrome (si no, con otro Chrome abierto el comando no termina).
4. Los PDF **se versionan** en `public/downloads/`. Regenerarlos solo cuando cambie el contenido y con el interruptor
   demo en el estado que se va a publicar (un PDF con ejemplos lleva el sello).

CI (`ubuntu-latest`): `npm test` y `npm run build` no necesitan Chrome (los PDF ya están en `public/`). Si algún día se
quiere regenerar en CI, `npm run downloads -- --if-chrome` sale sin error cuando no hay Chrome. Que `ubuntu-latest`
trae Google Chrome está documentado en `actions/runner-images`, pero **no se verificó en esta sesión**.

## 6. Verificación sin pisarse (paquetes en paralelo)

No usar el navegador ni `npm run build` sobre `dist/`. Correr:

```sh
npm test
npx astro check
CI=1 npx astro build --outDir "$(mktemp -d)"               # con el interruptor encendido
CI=1 DEMO_CONTENT=0 npx astro build --outDir "$(mktemp -d)" # y apagado
```

`CI=1` evita que el build reescriba `src/content/shows.snapshot.json` (no se toca).
Kit de componentes (solo desarrollo): `npm run dev` → `/kit/` y `/kit/en/`.
