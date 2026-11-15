/**
 * Datos de Música listos para las páginas (depende de Astro/Vite: no se importa desde las pruebas).
 * Mezcla los dominios `releases` y `mixes` con site.yaml (el release y los sets reales no se duplican).
 * Con el interruptor demo apagado, el cargador ya sacó los ítems de ejemplo.
 */
import { domain } from '../data';
import { site } from '../content';
import { schema as releasesSchema } from '../schemas/releases';
import { schema as mixesSchema } from '../schemas/mixes';
import { resolveRelease, sortReleases } from './releases';
import { resolveMix, sortSeries } from './mixes';

const relDomain = domain('releases', releasesSchema);
const mixDomain = domain('mixes', mixesSchema);

export const releases = sortReleases(relDomain.items.map((i) => resolveRelease(i, site.releases)));
export const charts = relDomain.charts;
const allMixes = mixDomain.items.map((i) => resolveMix(i, site.listen.tracks));
export const series = sortSeries(allMixes);
export const soundcloudMixes = allMixes.filter((m) => m.kind === 'soundcloud');
/** Todos los mixes visibles (para generar páginas). */
export const mixes = [...series, ...soundcloudMixes];
