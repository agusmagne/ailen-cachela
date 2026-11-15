/**
 * Proyectos: une los proyectos reales de site.yaml con el enriquecimiento de collective.yaml por `id`.
 * Lógica pura (sin Astro/Vite): se prueba con node:test. Los datos reales NO se copian: se leen de site.
 */
import type { Show } from '../show-map.ts';

export interface SiteProjectLike {
  id: string;
  name: string;
  visible: boolean;
  status: { es: string; en: string };
  text: { es: string; en: string };
  handle: string;
  platform: string;
  url: string;
}

export interface EnrichmentLike {
  id: string;
}

export interface MergedProject<S extends SiteProjectLike, E extends EnrichmentLike> {
  slug: string;
  project: S;
  extra: E;
}

/**
 * Proyectos visibles de site.yaml que tienen enriquecimiento. El orden es el de site.yaml.
 * Un enriquecimiento sin proyecto real se ignora (nunca crea una página); un proyecto sin enriquecimiento no tiene página propia.
 */
export function mergeProjects<S extends SiteProjectLike, E extends EnrichmentLike>(siteProjects: readonly S[], extras: readonly E[]): MergedProject<S, E>[] {
  const byId = new Map(extras.map((e) => [e.id, e]));
  return siteProjects
    .filter((p) => p.visible && byId.has(p.id))
    .map((p) => ({ slug: p.id, project: p, extra: byId.get(p.id) as E }));
}

/** Ids de enriquecimiento que no corresponden a ningún proyecto real (el test lo exige vacío). */
export const orphanExtras = (siteProjects: readonly SiteProjectLike[], extras: readonly EnrichmentLike[]): string[] =>
  extras.filter((e) => !siteProjects.some((p) => p.id === e.id)).map((e) => e.id);

/** Show mínimo para que el Flyer generativo dibuje una edición de ejemplo (la semilla sale del id). */
export function editionShow(ed: { id: string; title: { es: string; en: string }; date: string }, projectId: string): Show {
  return {
    id: `demo-${projectId}-${ed.id}`,
    source: 'manual',
    title: ed.title.es,
    status: 'scheduled',
    allDay: true,
    start: ed.date,
    end: null,
    tz: 'America/Argentina/Buenos_Aires',
    address: null,
    city: null,
    region: null,
    country: null,
    countryCode: null,
    location: null,
    mapUrl: null,
    url: null,
    notes: null,
  };
}
