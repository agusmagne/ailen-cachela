/** Respuestas de endpoints estáticos para descargables (src/pages/downloads/<paquete>/...). */
import { statSync } from 'node:fs';
import { join } from 'node:path';

const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  zip: 'application/zip',
  ics: 'text/calendar; charset=utf-8',
  vcf: 'text/vcard; charset=utf-8',
  svg: 'image/svg+xml; charset=utf-8',
  png: 'image/png',
  txt: 'text/plain; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
};

/** Body de un endpoint con el tipo correcto según la extensión (`kind`: 'zip', 'ics', 'vcf'...). */
export function fileResponse(body: string | Uint8Array, kind: keyof typeof TYPES | (string & {})): Response {
  const type = TYPES[kind];
  if (!type) throw new Error(`fileResponse: tipo desconocido "${kind}"`);
  return new Response(body as BodyInit, { headers: { 'Content-Type': type } });
}

/** Peso en bytes de un archivo de public/ (ruta relativa, "downloads/epk.pdf"). null si todavía no existe. */
export function publicFileSize(rel: string): number | null {
  try {
    return statSync(join(process.cwd(), 'public', rel)).size;
  } catch {
    return null;
  }
}

export function formatBytes(n: number): string {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}
