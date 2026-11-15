import type { APIRoute } from 'astro';
import { fileResponse } from '../../../lib/downloads/response';
import { loadPress, qrFile } from '../../../lib/press/context';

/** QR (SVG, sin servicios externos) de la página de prensa en es, listo para carteles y tarjetas. */
export const GET: APIRoute = () => fileResponse(qrFile('es', loadPress('es').pageUrl), 'svg');
