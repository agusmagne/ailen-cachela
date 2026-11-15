/** vCard 3.0 (compatible con iOS, Android, Outlook y Google Contactos). Texto escapado y líneas plegadas (RFC 6350/2426). */

export interface VCardData {
  /** Nombre visible ("Ailén Cachela" o "Booking · Ailén Cachela"). */
  name: string;
  org?: string;
  title?: string;
  email?: string;
  tel?: string;
  url?: string;
  note?: string;
  city?: string;
  country?: string;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\;').replace(/,/g, '\\,');

/** Pliega a 75 octetos por línea (continuación: CRLF + espacio), sin partir caracteres UTF-8. */
export function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildVCard(d: VCardData): string {
  const parts = d.name.trim().split(/\s+/);
  const family = parts.length > 1 ? parts[parts.length - 1] : '';
  const given = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0];
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${esc(family)};${esc(given)};;;`,
    `FN:${esc(d.name)}`,
    d.org && `ORG:${esc(d.org)}`,
    d.title && `TITLE:${esc(d.title)}`,
    d.email && `EMAIL;TYPE=INTERNET:${esc(d.email)}`,
    d.tel && `TEL;TYPE=VOICE:${esc(d.tel)}`,
    d.url && `URL:${d.url}`,
    (d.city || d.country) && `ADR;TYPE=WORK:;;;${esc(d.city ?? '')};;;${esc(d.country ?? '')}`,
    d.note && `NOTE:${esc(d.note)}`,
    'END:VCARD',
  ].filter((l): l is string => Boolean(l));
  return lines.map(fold).join('\r\n') + '\r\n';
}
