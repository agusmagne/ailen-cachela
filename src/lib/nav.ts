import { t, type Lang } from './content';
import { router, GROUPS, type GroupId } from './routes';

/** Texto de interfaz del nombre de una ruta del registro (clave base_route_<id>). */
export const routeLabel = (id: string, lang: Lang) => t(`base_route_${id.replaceAll('-', '_')}`, lang);
export const groupLabel = (g: GroupId, lang: Lang) => t(`base_group_${g}`, lang);

export interface NavLink {
  id: string;
  href: string;
  label: string;
}

export const linkFor = (id: string, lang: Lang): NavLink => ({ id, href: router.path(id, lang), label: routeLabel(id, lang) });

/** Índice completo agrupado (solo páginas que existen y tienen contenido). Grupos vacíos no aparecen. */
export function indexGroups(lang: Lang, opts: { legal?: boolean } = {}): { group: GroupId; label: string; links: NavLink[] }[] {
  return GROUPS.filter((g) => opts.legal !== false || g !== 'legal')
    .map((g) => ({ group: g, label: groupLabel(g, lang), links: router.index(g).map((r) => linkFor(r.id, lang)) }))
    .filter((g) => g.links.length > 0);
}
