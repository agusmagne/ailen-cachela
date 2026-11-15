import type { APIRoute } from 'astro';
import { getShows } from '../../../lib/shows';
import { buildFeed } from '../../../lib/agenda/calendar';
import { fileResponse } from '../../../lib/downloads/response';
import { calendarOptions } from '../../../components/agenda/feed';

/** Subscribable calendar (webcal://): REAL dates only, from the iCloud calendar; never the sample ones. */
export const GET: APIRoute = async ({ site }) => {
  const { upcoming, past } = await getShows();
  return fileResponse(buildFeed([...past, ...upcoming], calendarOptions('en', site)), 'ics');
};
