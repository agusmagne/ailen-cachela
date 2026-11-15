import type { APIRoute } from 'astro';
import { fileResponse } from '../../../lib/downloads/response';
import { loadPress, qrFile } from '../../../lib/press/context';

/** QR (SVG, sin servicios externos) de la página de prensa en en, listo para carteles y tarjetas. */
export const GET: APIRoute = () => fileResponse(qrFile('en', loadPress('en').pageUrl), 'svg');
