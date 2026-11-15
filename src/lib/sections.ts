import { site } from './content';

export type SectionId = 'escuchar' | 'musica' | 'proyectos' | 'fechas' | 'sobre' | 'contacto';

export interface SectionDef {
  id: SectionId;
  navKey: string;
  inNav: boolean;
  visible: boolean;
}

/** Orden del brief. Una sección sin datos desaparece también del nav. */
export const sections: SectionDef[] = [
  {
    id: 'escuchar',
    navKey: 'nav_listen',
    inNav: true,
    visible: site.listen.tracks.length > 0 || site.listen.profile_url !== '',
  },
  { id: 'musica', navKey: 'nav_music', inNav: true, visible: site.releases.length > 0 },
  { id: 'proyectos', navKey: 'nav_projects', inNav: true, visible: site.projects.some((p) => p.visible) },
  { id: 'fechas', navKey: 'nav_shows', inNav: true, visible: true },
  { id: 'sobre', navKey: 'nav_about', inNav: false, visible: site.about.bio.es !== '' },
  { id: 'contacto', navKey: 'nav_contact', inNav: true, visible: site.contact.email !== '' },
];

export const isVisible = (id: SectionId) => sections.find((s) => s.id === id)?.visible ?? false;
