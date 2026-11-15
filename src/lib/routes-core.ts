/**
 * Registro central de rutas del sitio (puro, sin Vite: se prueba con node:test).
 *
 * Todas las páginas de todos los paquetes están RESERVADAS acá desde ahora: ningún paquete edita este
 * archivo. Una ruta "existe" cuando existen sus dos archivos de página (es y en) en src/pages; hasta
 * entonces no se enlaza desde ningún lado (menú, hoja móvil, pie, migas), así el build pasa en todo momento.
 * Una ruta con `requires` además se oculta de la navegación si su dominio de datos queda vacío (por ejemplo
 * con el interruptor de contenido de ejemplo apagado); la página igual se genera y muestra un estado vacío.
 *
 * Convención de archivos para una ruta con path { es: 'prensa', en: 'press' }:
 *   src/pages/prensa/index.astro        -> /prensa/
 *   src/pages/en/press/index.astro      -> /en/press/
 * Con parámetro (:slug):  src/pages/musica/[slug].astro  y  src/pages/en/music/[slug].astro
 */

export type Lang = 'es' | 'en';
export const LANGS: readonly Lang[] = ['es', 'en'];

/** Paquetes de trabajo (dueños de rutas). Cada uno tiene su archivo de textos src/content/ui/<id>.yaml. */
export type PackageId = 'press' | 'booking' | 'disco' | 'agenda' | 'lab' | 'oficio' | 'fans' | 'base';

/** Grupos del índice completo (hoja móvil y pie). */
export type GroupId = 'sound' | 'live' | 'work' | 'fans' | 'legal';
export const GROUPS: readonly GroupId[] = ['sound', 'live', 'work', 'fans', 'legal'];

export interface RouteDef {
  id: string;
  pkg: PackageId;
  /** Sin barras extremas. Puede llevar :parámetros. La versión en inglés se publica bajo /en/. */
  path: { es: string; en: string };
  group: GroupId;
  /** Aparece en el menú principal de las páginas interiores (mantenerlo corto: 6 como máximo). */
  main?: boolean;
  /** Aparece también en el menú de la home (además de sus anclas). Lo decide el paquete de integración. */
  homeNav?: boolean;
  /** Ruta madre: define las migas de pan y la saca del índice completo. */
  parent?: string;
  /** Oculta la ruta de la navegación mientras el dominio no tenga contenido visible (alguna de las claves). */
  requires?: { domain: string; keys: readonly string[] };
  /** Pantalla completa (sin Nav/Footer propios del layout): la define la página. */
  bare?: boolean;
}

/** Endpoints que no son páginas pero el <head> anuncia si existen. Se declaran acá para que Base los enlace solo. */
export interface EndpointDef {
  id: string;
  /** Un archivo para todos los idiomas (manifest) o uno por idioma (feeds, calendario). */
  shared?: boolean;
  path: { es: string; en: string };
  rel: 'manifest' | 'alternate';
  type?: string;
  /** Clave de interfaz del título del link (alternate). */
  titleKey?: string;
}

export const ROUTES: RouteDef[] = [
  // ---- Música y sonido ------------------------------------------------------
  { id: 'music', pkg: 'disco', path: { es: 'musica', en: 'music' }, group: 'sound', main: true, requires: { domain: 'releases', keys: ['items'] } },
  { id: 'release', pkg: 'disco', path: { es: 'musica/:slug', en: 'music/:slug' }, group: 'sound', parent: 'music' },
  { id: 'mixes', pkg: 'disco', path: { es: 'mixes', en: 'mixes' }, group: 'sound', main: true, requires: { domain: 'mixes', keys: ['items'] } },
  { id: 'mix', pkg: 'disco', path: { es: 'mixes/:slug', en: 'mixes/:slug' }, group: 'sound', parent: 'mixes' },
  { id: 'videos', pkg: 'oficio', path: { es: 'videos', en: 'videos' }, group: 'sound', requires: { domain: 'videos', keys: ['items'] } },

  // ---- En vivo --------------------------------------------------------------
  { id: 'shows', pkg: 'agenda', path: { es: 'fechas', en: 'shows' }, group: 'live', main: true },
  { id: 'shows-archive', pkg: 'agenda', path: { es: 'fechas/archivo', en: 'shows/archive' }, group: 'live', parent: 'shows' },
  { id: 'shows-year', pkg: 'agenda', path: { es: 'fechas/archivo/:year', en: 'shows/archive/:year' }, group: 'live', parent: 'shows-archive' },

  // ---- Trabajo: prensa, booking, estudio -------------------------------------
  { id: 'press', pkg: 'press', path: { es: 'prensa', en: 'press' }, group: 'work', main: true, homeNav: true },
  { id: 'booking', pkg: 'booking', path: { es: 'booking', en: 'booking' }, group: 'work', main: true, homeNav: true },
  { id: 'booking-tech', pkg: 'booking', path: { es: 'booking/rider-tecnico', en: 'booking/technical-rider' }, group: 'work', parent: 'booking' },
  { id: 'booking-hospitality', pkg: 'booking', path: { es: 'booking/rider-hospitalidad', en: 'booking/hospitality-rider' }, group: 'work', parent: 'booking' },
  { id: 'booking-terms', pkg: 'booking', path: { es: 'booking/condiciones', en: 'booking/terms' }, group: 'work', parent: 'booking' },
  { id: 'studio', pkg: 'oficio', path: { es: 'estudio', en: 'studio' }, group: 'work', requires: { domain: 'studio', keys: ['gear', 'notes'] } },
  { id: 'services', pkg: 'oficio', path: { es: 'servicios', en: 'services' }, group: 'work', requires: { domain: 'services', keys: ['items'] } },
  { id: 'lessons', pkg: 'oficio', path: { es: 'clases', en: 'lessons' }, group: 'work', requires: { domain: 'lessons', keys: ['items'] } },
  { id: 'projects', pkg: 'oficio', path: { es: 'proyectos', en: 'projects' }, group: 'work', requires: { domain: 'collective', keys: ['items'] } },
  { id: 'project', pkg: 'oficio', path: { es: 'proyectos/:slug', en: 'projects/:slug' }, group: 'work', parent: 'projects' },

  // ---- Lab (grupo sound; va al final del menú principal) ----------------------
  { id: 'lab', pkg: 'lab', path: { es: 'lab', en: 'lab' }, group: 'sound', main: true, homeNav: true, requires: { domain: 'lab', keys: ['items'] } },
  { id: 'lab-sequencer', pkg: 'lab', path: { es: 'lab/secuenciador', en: 'lab/sequencer' }, group: 'sound', parent: 'lab' },
  { id: 'lab-visualizer', pkg: 'lab', path: { es: 'lab/visualizador', en: 'lab/visualizer' }, group: 'sound', parent: 'lab' },
  { id: 'lab-scratch', pkg: 'lab', path: { es: 'lab/scratch', en: 'lab/scratch' }, group: 'sound', parent: 'lab' },
  { id: 'lab-generator', pkg: 'lab', path: { es: 'lab/generador', en: 'lab/generator' }, group: 'sound', parent: 'lab' },
  { id: 'lab-live', pkg: 'lab', path: { es: 'lab/en-vivo', en: 'lab/live' }, group: 'sound', parent: 'lab', bare: true },

  // ---- Comunidad -------------------------------------------------------------
  { id: 'shop', pkg: 'fans', path: { es: 'tienda', en: 'shop' }, group: 'fans', requires: { domain: 'shop', keys: ['items'] } },
  { id: 'newsletter', pkg: 'fans', path: { es: 'newsletter', en: 'newsletter' }, group: 'fans' },
  { id: 'community', pkg: 'fans', path: { es: 'comunidad', en: 'community' }, group: 'fans' },
  { id: 'links', pkg: 'fans', path: { es: 'links', en: 'links' }, group: 'fans', bare: true },

  // ---- Legales ---------------------------------------------------------------
  { id: 'privacy', pkg: 'fans', path: { es: 'privacidad', en: 'privacy' }, group: 'legal' },
  { id: 'accessibility', pkg: 'fans', path: { es: 'accesibilidad', en: 'accessibility' }, group: 'legal' },
  { id: 'credits', pkg: 'fans', path: { es: 'creditos', en: 'credits' }, group: 'legal' },
  { id: 'legal-notice', pkg: 'fans', path: { es: 'aviso-legal', en: 'legal-notice' }, group: 'legal' },
];

export const ENDPOINTS: EndpointDef[] = [
  { id: 'manifest', shared: true, path: { es: 'manifest.webmanifest', en: 'manifest.webmanifest' }, rel: 'manifest' },
  { id: 'feed-mixes', path: { es: 'mixes/feed.xml', en: 'mixes/feed.xml' }, rel: 'alternate', type: 'application/rss+xml', titleKey: 'base_feed_mixes' },
  { id: 'calendar', path: { es: 'fechas/calendario.ics', en: 'shows/calendar.ics' }, rel: 'alternate', type: 'text/calendar', titleKey: 'base_feed_calendar' },
];

/**
 * Rutas de archivos que NO son páginas del registro pero están permitidas en src/pages (las verifica
 * tests/routes.test.ts): la home, el 404, robots, descargables, vistas de impresión (PDF) y el kit de componentes.
 */
export const RESERVED_PATTERNS: readonly RegExp[] = [
  /^$/, // home es
  /^en$/, // home en
  /^404$/,
  /^en\/404$/,
  /^robots\.txt$/,
  /^downloads\/.+/, // descargables generados en build: src/pages/downloads/<paquete>/...
  // Vistas de impresión para PDF (PrintLayout): <ruta>/imprimir (es) y en/<ruta>/print (en), noindex, fuera de la navegación
  /^(?!en\/)(?:[a-z0-9-]+\/)+imprimir(?:\/.*)?$/,
  /^en\/(?:[a-z0-9-]+\/)+print(?:\/.*)?$/,
  /^kit(\/.*)?$/, // kit de componentes (solo desarrollo)
];

/* ---- Páginas existentes ---------------------------------------------------- */

/**
 * Convierte rutas de archivo relativas a src/pages (con "/") en patrones de URL:
 *   musica/index.astro -> musica   |   musica/[slug].astro -> musica/:slug   |   en/music/feed.xml.ts -> en/music/feed.xml
 */
export function pagePatterns(files: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const f of files) {
    if (f.split('/').some((seg) => seg.startsWith('_'))) continue; // Astro ignora lo que empieza con "_"
    if (!/\.(astro|ts|js|md|mdx|html)$/.test(f)) continue;
    const p = f
      .replace(/\.(astro|md|mdx|html|ts|js)$/, '')
      .replace(/(^|\/)index$/, '')
      .replace(/\[\.\.\.(\w+)\]/g, '*$1')
      .replace(/\[(\w+)\]/g, ':$1');
    out.add(p);
  }
  return out;
}

/* ---- Router ------------------------------------------------------------------- */

export interface RouterDeps {
  /** Patrones de páginas existentes (ver pagePatterns). Función: en desarrollo se vuelve a leer. */
  pages: () => ReadonlySet<string>;
  hasContent: (domain: string, keys: readonly string[]) => boolean;
  /** Prefijo de publicación sin barra final ('' en la raíz). */
  base: string;
}

export type Params = Record<string, string | number>;

export function createRouter(routes: readonly RouteDef[], endpoints: readonly EndpointDef[], deps: RouterDeps) {
  const byId = new Map(routes.map((r) => [r.id, r]));
  const get = (id: string): RouteDef => {
    const r = byId.get(id);
    if (!r) throw new Error(`Ruta desconocida "${id}". Las rutas se reservan en src/lib/routes-core.ts.`);
    return r;
  };
  const pattern = (r: RouteDef, lang: Lang) => (lang === 'es' ? r.path.es : `en/${r.path.en}`);
  const fill = (pat: string, params: Params = {}) =>
    pat.replace(/:(\w+)/g, (_, k: string) => {
      if (params[k] === undefined) throw new Error(`Falta el parámetro "${k}" para la ruta "${pat}".`);
      return encodeURIComponent(String(params[k]));
    });

  /** Ruta absoluta del sitio (con BASE_PATH) a una ruta del registro. */
  function path(id: string, lang: Lang, params?: Params): string {
    return `${deps.base}/${fill(pattern(get(id), lang), params)}/`;
  }
  /** Home por idioma. */
  const home = (lang: Lang) => `${deps.base}${lang === 'es' ? '/' : '/en/'}`;
  /** Existen las páginas de los dos idiomas. */
  function exists(id: string): boolean {
    const r = get(id);
    const pages = deps.pages();
    return LANGS.every((l) => pages.has(pattern(r, l)));
  }
  /** Existe y tiene contenido visible: se puede enlazar desde la navegación. */
  function listed(id: string): boolean {
    const r = get(id);
    if (!exists(id)) return false;
    return !r.requires || deps.hasContent(r.requires.domain, r.requires.keys);
  }
  const hasParams = (r: RouteDef) => r.path.es.includes(':') || r.path.en.includes(':');
  const isTopLevel = (r: RouteDef) => !r.parent && !hasParams(r);

  const listedRoutes = (pred: (r: RouteDef) => boolean) => routes.filter((r) => pred(r) && listed(r.id));

  return {
    routes,
    get,
    path,
    home,
    exists,
    listed,
    /** Mismas páginas en el otro idioma (hreflang y selector de idioma). */
    alternates: (id: string, params?: Params): Record<Lang, string> => ({ es: path(id, 'es', params), en: path(id, 'en', params) }),
    /** Menú principal de páginas interiores. */
    main: () => listedRoutes((r) => !!r.main && !r.bare),
    /** Rutas de página sumadas al menú de la home. */
    homeNav: () => listedRoutes((r) => !!r.homeNav),
    /** Índice completo (hoja móvil y pie): top-level con página, por grupo y en el orden del registro. */
    index: (group?: GroupId) => listedRoutes((r) => isTopLevel(r) && (!group || r.group === group)),
    /** Migas de pan: de la raíz a la ruta (sin incluir Home). */
    trail(id: string): RouteDef[] {
      const out: RouteDef[] = [];
      for (let r: RouteDef | undefined = get(id); r; r = r.parent ? get(r.parent) : undefined) out.unshift(r);
      return out;
    },
    /** Posición (1-based) de la ruta en el menú principal; null si no es principal. Sirve de numeral de página. */
    numeral(id: string): number | null {
      const root = (() => {
        let r = get(id);
        while (r.parent) r = get(r.parent);
        return r;
      })();
      const i = routes.filter((x) => x.main && !x.bare).findIndex((x) => x.id === root.id);
      return i < 0 ? null : i + 1;
    },
    endpointExists(id: string, lang: Lang): boolean {
      const e = endpoints.find((x) => x.id === id);
      if (!e) return false;
      const pages = deps.pages();
      return e.shared ? pages.has(e.path.es) : pages.has(lang === 'es' ? e.path.es : `en/${e.path.en}`);
    },
    endpointHref(id: string, lang: Lang): string {
      const e = endpoints.find((x) => x.id === id);
      if (!e) throw new Error(`Endpoint desconocido "${id}"`);
      return `${deps.base}/${e.shared || lang === 'es' ? e.path.es : `en/${e.path.en}`}`;
    },
    endpoints,
  };
}

export type Router = ReturnType<typeof createRouter>;
