import type { APIRoute } from 'astro';
import { fileResponse } from '../../../lib/downloads/response';
import { buildKitZip } from '../../../lib/press/context';

/** Press kit en ZIP (en): bios .txt, ficha técnica, isotipo SVG, wordmark PNG, piezas de ejemplo, vCard, QR y los PDF si existen. */
export const GET: APIRoute = () => fileResponse(buildKitZip('en'), 'zip');
