import type { APIRoute } from 'astro';
import { getShows } from '../../lib/shows';
import { buildFeed } from '../../lib/agenda/calendar';
import { fileResponse } from '../../lib/downloads/response';
import { calendarOptions } from '../../components/agenda/feed';

/** Calendario suscribible (webcal://): SOLO fechas reales del calendario de iCloud, nunca las de ejemplo. */
export const GET: APIRoute = async ({ site }) => {
  const { upcoming, past } = await getShows();
  return fileResponse(buildFeed([...past, ...upcoming], calendarOptions('es', site)), 'ics');
};
