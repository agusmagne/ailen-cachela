import type { APIRoute, GetStaticPaths } from 'astro';
import { getShows } from '../../../lib/shows';
import type { Show } from '../../../lib/show-map';
import { buildShowIcs, showIcsFile } from '../../../lib/agenda/calendar';
import { fileResponse } from '../../../lib/downloads/response';
import { calendarOptions } from '../../../components/agenda/feed';
import type { Lang } from '../../../lib/content';

/** "Agregar a mi calendario": un .ics por fecha real próxima y por idioma (/downloads/agenda/<fecha>-<lugar>-<id>-es.ics). */
export const getStaticPaths = (async () => {
  const { upcoming } = await getShows();
  const langs: Lang[] = ['es', 'en'];
  return upcoming.flatMap((show) => langs.map((lang) => ({ params: { file: showIcsFile(show, lang) }, props: { show, lang } })));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props, site }) => {
  const { show, lang } = props as { show: Show; lang: Lang };
  return fileResponse(buildShowIcs(show, calendarOptions(lang, site)), 'ics');
};
