import type { APIRoute } from 'astro';
import { fileResponse } from '../../../lib/downloads/response';
import { bookingVCard } from '../../../components/booking/ui';
import { absolute } from '../../../lib/content';
import { router } from '../../../lib/routes';

/** vCard del contacto de booking (es/en): solo el email verificado, sin teléfono. */
export function getStaticPaths() {
  return [{ params: { lang: 'es' } }, { params: { lang: 'en' } }];
}
export const GET: APIRoute = ({ params, site }) => {
  const lang = params.lang === 'en' ? 'en' : 'es';
  const origin = site ?? new URL('https://ailencachela.com');
  return fileResponse(bookingVCard(lang, absolute(router.home(lang), origin)), 'vcf');
};
