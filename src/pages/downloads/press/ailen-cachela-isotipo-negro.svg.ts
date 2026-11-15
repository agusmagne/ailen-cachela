import type { APIRoute } from 'astro';
import { fileResponse } from '../../../lib/downloads/response';
import { isotipoFile, palette } from '../../../lib/press/context';
import { t } from '../../../lib/content';

/** Isotipo en negro, sin fondo (SVG vectorial). */
export const GET: APIRoute = () => fileResponse(isotipoFile('negro', palette(), t('press_logo_title', 'es')), 'svg');
