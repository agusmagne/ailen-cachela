/**
 * Escritor de ZIP sin dependencias (método deflate, nombres UTF-8). Es determinista: misma entrada, mismos
 * bytes (la fecha de cada entrada es fija, no la del reloj), así un build repetido no cambia el ZIP.
 *   const buf = createZip([{ name: 'bio/bio-corta.txt', data: 'Texto' }, { name: 'logo.svg', data: svgString }]);
 * Úsalo desde un endpoint (src/pages/downloads/<paquete>/*.zip.ts) con fileResponse().
 */
import { crc32, deflateRawSync } from 'node:zlib';

export interface ZipEntry {
  /** Ruta dentro del ZIP, con "/" (sin barra inicial). */
  name: string;
  data: Uint8Array | string;
}

/** 2026-01-01 00:00:00 (formato MS-DOS). */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const u16 = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};

export function createZip(entries: readonly ZipEntry[]): Buffer {
  const seen = new Set<string>();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    if (!e.name || e.name.startsWith('/') || e.name.includes('..') || seen.has(e.name)) {
      throw new Error(`createZip: nombre inválido o repetido "${e.name}"`);
    }
    seen.add(e.name);
    const name = Buffer.from(e.name, 'utf8');
    const raw = typeof e.data === 'string' ? Buffer.from(e.data, 'utf8') : Buffer.from(e.data);
    const packed = deflateRawSync(raw, { level: 9 });
    const useDeflate = packed.length < raw.length;
    const body = useDeflate ? packed : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);
    const common = [u16(20), u16(0x0800), u16(method), u16(DOS_TIME), u16(DOS_DATE), u32(crc), u32(body.length), u32(raw.length), u16(name.length), u16(0)];
    const local = Buffer.concat([u32(0x04034b50), ...common, name, body]);
    const central = Buffer.concat([u32(0x02014b50), u16(0x031e), ...common, u16(0), u16(0), u16(0), u32(0), u32(offset), name]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(dir.length), u32(offset), u16(0)]);
  return Buffer.concat([...locals, dir, end]);
}
