import type { APIRoute } from 'astro';
import { fileResponse } from '../../../lib/downloads/response';
import { vcardText } from '../../../lib/press/context';

/** Contacto de booking (vCard 3.0): solo el email real, sin teléfono. */
export const GET: APIRoute = () => fileResponse(vcardText(), 'vcf');
