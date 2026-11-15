import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { inflateRawSync, crc32 } from 'node:zlib';
import { parse } from 'yaml';
import { loadDomain } from '../src/lib/content-loader.ts';
import { countDemo } from '../src/lib/demo-core.ts';
import { schema } from '../src/lib/schemas/press.ts';
import { BIO_WORDS, bioSet, countWords, factSheet, kitEntries, paragraphs, timelineEntries, type Bio, type KitInput } from '../src/lib/press/model.ts';
import { paletteFrom, parseTokens, PALETTE_IDS } from '../src/lib/press/tokens.ts';
import { isotipoSvg, isotipoFile } from '../src/lib/press/logo.ts';
import { PIECE_SIZE, hashSeed, pressPieceSvg, rng } from '../src/lib/press/art.ts';
import { createZip } from '../src/lib/downloads/zip.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const yaml = read('src/content/press.yaml');
const on = loadDomain('press', yaml, schema, true);
const off = loadDomain('press', yaml, schema, false);
const palette = paletteFrom(read('src/styles/tokens.css'));

function readZip(buf: Buffer) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: Record<string, Buffer> = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const off2 = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
    const lnlen = buf.readUInt16LE(off2 + 26);
    const data = buf.subarray(off2 + 30 + lnlen, off2 + 30 + lnlen + csize);
    const raw = method === 8 ? inflateRawSync(data) : data;
    assert.equal(crc32(raw), crc, `crc de ${name}`);
    out[name] = Buffer.from(raw);
    p += 46 + nlen;
  }
  return out;
}

/* ---- Datos ----------------------------------------------------------------------------------------------------- */

test('press.yaml: todo es de ejemplo y desaparece con el interruptor apagado', () => {
  assert.ok(countDemo(on) > 20, 'el contenido de muestra es rico');
  assert.equal(countDemo(off), 0);
  for (const k of Object.keys(off) as (keyof typeof off)[]) assert.deepEqual(off[k], [], `${k} queda vacío sin demo`);
  for (const list of Object.values(on)) for (const it of list as { demo: boolean }[]) assert.equal(it.demo, true);
});

test('press.yaml: sin medios, clubes ni marcas reales y sin textos de relleno', () => {
  assert.doesNotMatch(yaml, /lorem|xxx/i);
  assert.doesNotMatch(yaml, /\bTODO\b|\bTBD\b/);
  assert.doesNotMatch(yaml, /boiler room|resident advisor|cercle|pioneer|beatport|spotify|mixmag|dj mag|tomorrowland|berghain/i);
  for (const q of on.quotes) assert.match(q.outlet.es + q.outlet.en, /ejemplo|sample/i);
  for (const s of on.supports) assert.match(s.name.es + s.name.en, /ejemplo|example|sample/i);
  for (const c of on.contacts) assert.match(c.email, /\.invalid$/);
});

test('bios: los largos de ejemplo cumplen su rango de palabras en es y en', () => {
  for (const lang of ['es', 'en'] as const) {
    for (const id of ['medium', 'long'] as const) {
      const bio = on.bios.find((b) => b.id === id)!;
      const n = countWords(bio.text[lang]);
      const [min, max] = BIO_WORDS[id];
      assert.ok(n >= min && n <= max, `${id}/${lang}: ${n} palabras fuera de ${min}-${max}`);
    }
  }
});

/* ---- Bios, ficha, línea de tiempo --------------------------------------------------------------------------------- */

const short = 'DJ y productora de Buenos Aires, Argentina. Co-fundadora de fragmento.techno.';
test('bioSet: orden por largo, la corta real siempre, las de ejemplo solo si existen', () => {
  const inputOn = { tagline: 'Frase.', short, extra: on.bios.map((b) => ({ id: b.id, text: b.text, demo: b.demo })) };
  const a = bioSet('es', inputOn);
  assert.deepEqual(a.map((b) => b.id), ['tagline', 'short', 'medium', 'long']);
  assert.equal(a[1].demo, false);
  assert.equal(a[1].words, countWords(short));
  assert.ok(a[2].demo && a[3].demo);
  const b = bioSet('en', { tagline: 'Line.', short: 'Short.', extra: off.bios.map((x) => ({ id: x.id, text: x.text, demo: x.demo })) });
  assert.deepEqual(b.map((x) => x.id), ['tagline', 'short']);
  assert.deepEqual(bioSet('es', { tagline: '', short: '  ', extra: [] }), []);
});

test('paragraphs y countWords', () => {
  assert.deepEqual(paragraphs('Uno.\n\n\nDos.\n\n  \nTres.'), ['Uno.', 'Dos.', 'Tres.']);
  assert.equal(countWords('  una   dos\ntres '), 3);
  assert.equal(countWords(''), 0);
});

const factInput = {
  labels: { role: 'Rol', city: 'Base', label: 'Sello', collective: 'Colectivo', project: 'Proyecto', languages: 'Idioma' },
  role: 'DJ y productora',
  city: 'Buenos Aires',
  country: 'Argentina',
  labelValue: 'ROOM · “Ahogo” en ROOM.004 (2017)',
  labelUrl: 'https://roomarg.bandcamp.com/',
  collective: 'fragmento.techno (co-fundadora)',
  project: 'SENKA',
  languages: 'Español',
};
test('factSheet: primero lo verificado, después lo de ejemplo; filas vacías se omiten', () => {
  const rows = factSheet('en', { ...factInput, extra: on.facts });
  assert.deepEqual(rows.slice(0, 6).map((r) => r.id), ['role', 'city', 'label', 'collective', 'project', 'languages']);
  assert.ok(rows.slice(0, 6).every((r) => !r.demo));
  assert.equal(rows[1].value, 'Buenos Aires, Argentina');
  assert.equal(rows[2].href, 'https://roomarg.bandcamp.com/');
  assert.ok(rows.slice(6).every((r) => r.demo));
  assert.equal(rows.find((r) => r.id === 'bpm')?.label, 'Usual BPM');
  const sparse = factSheet('es', { ...factInput, labelValue: '', collective: '', project: '', extra: [] });
  assert.deepEqual(sparse.map((r) => r.id), ['role', 'city', 'languages']);
});

test('timelineEntries: el hito real primero, orden cronológico, textos por idioma', () => {
  const real = [{ id: 'room-004', year: 2017, title: 'Publica “Ahogo”', place: 'ROOM · Buenos Aires' }];
  const list = timelineEntries('en', real, on.timeline);
  assert.equal(list[0].year, 2017);
  assert.equal(list[0].demo, false);
  assert.deepEqual(list.map((e) => e.year), [...list.map((e) => e.year)].sort((a, b) => a - b));
  assert.ok(list.slice(1).every((e) => e.demo));
  assert.match(list[1].title, /First|Closing|Sample|Residency/);
  assert.equal(timelineEntries('es', real, off.timeline).length, 1);
  // a igual año el real va antes
  const tie = timelineEntries('es', real, [{ id: 'x', year: 2017, title: { es: 'x', en: 'x' }, place: { es: 'y', en: 'y' }, demo: true }]);
  assert.deepEqual(tie.map((e) => e.demo), [false, true]);
});

/* ---- Paleta, logo, arte --------------------------------------------------------------------------------------------- */

test('paleta: sale de tokens.css y falla si falta un color', () => {
  for (const id of PALETTE_IDS) assert.match(palette[id], /^#[0-9a-f]{6}$/);
  assert.equal(palette['chrome-50'], '#f4f6f9');
  assert.deepEqual(parseTokens('--a: #ABCDEF;\n--b: var(--a);\n--a: #000000;'), { a: '#abcdef' });
  assert.throws(() => paletteFrom('--void: #000000;'), /ya no define/);
});

test('isotipo: tres versiones, sin fondo en negro y blanco, XML escapado', () => {
  const color = isotipoSvg('color', palette);
  assert.match(color, /<rect[^>]*fill="#050506"/);
  for (const v of ['negro', 'blanco'] as const) {
    const svg = isotipoSvg(v, palette, { title: 'A & B <x>' });
    assert.doesNotMatch(svg, /<rect/);
    assert.match(svg, /<title>A &amp; B &lt;x&gt;<\/title>/);
    assert.match(svg, v === 'negro' ? /#020203/ : /#f4f6f9/);
  }
  assert.ok(isotipoFile('negro', palette, 't').startsWith('<?xml'));
});

test('piezas generativas: determinista por semilla, distinta entre semillas, solo colores de la paleta', () => {
  for (const shape of ['landscape', 'portrait', 'square'] as const) {
    const a = pressPieceSvg('press-ailen-01', shape, palette);
    assert.equal(a, pressPieceSvg('press-ailen-01', shape, palette));
    assert.notEqual(a, pressPieceSvg('press-ailen-02', shape, palette));
    const { w, h } = PIECE_SIZE[shape];
    assert.ok(a.includes(`viewBox="0 0 ${w} ${h}"`));
    const hexes = new Set(a.match(/#[0-9a-f]{6}/g));
    for (const hx of hexes) assert.ok(Object.values(palette).includes(hx), `${hx} no está en la paleta`);
  }
  assert.equal(hashSeed('a'), hashSeed('a'));
  const r1 = rng('s'), r2 = rng('s');
  assert.deepEqual([r1(), r1(), r1()], [r2(), r2(), r2()]);
});

/* ---- ZIP del press kit ------------------------------------------------------------------------------------------------ */

const labels = {
  demoNote: 'CONTENIDO DE EJEMPLO',
  bioTitle: { tagline: 'Frase', short: 'Corta', medium: 'Media', long: 'Larga' },
  factsTitle: 'Ficha técnica',
  readmeTitle: 'Press kit',
  readmeIntro: 'Intro.',
  readmeFiles: 'Archivos:',
  contact: 'Contacto',
  generated: 'Generado',
};
function kit(demoOn: boolean): KitInput {
  const data = demoOn ? on : off;
  const bios: Bio[] = bioSet('es', { tagline: 'Frase.', short, extra: data.bios.map((b) => ({ id: b.id, text: b.text, demo: b.demo })) });
  return {
    lang: 'es',
    labels,
    demoOn,
    bios,
    facts: factSheet('es', { ...factInput, extra: data.facts }),
    names: { bio: { tagline: 'bio-tagline.txt', short: 'bio-corta.txt', medium: 'bio-media.txt', long: 'bio-larga.txt' }, facts: 'ficha-tecnica.txt', readme: 'LEEME.txt', vcard: 'booking.vcf', qr: 'qr.svg' },
    logos: [{ name: 'isotipo-negro.svg', data: isotipoFile('negro', palette, 'x') }],
    pieces: data.photos.map((p, i) => ({ name: `pieza-${i + 1}.svg`, data: pressPieceSvg(p.seed, p.shape, palette) })),
    vcard: 'BEGIN:VCARD\r\nEND:VCARD\r\n',
    qr: '<svg/>',
    binaries: [
      { name: 'wordmark.png', data: new Uint8Array([137, 80, 78, 71]) },
      { name: 'epk.pdf', data: new Uint8Array([37, 80, 68, 70]) },
      { name: 'falta.pdf', data: null },
    ],
    contactLine: 'ailen.cachela@gmail.com',
  };
}

test('press kit: entradas completas, ZIP determinista y legible, aviso de ejemplo solo con demo', () => {
  const entries = kitEntries(kit(true));
  const names = entries.map((e) => e.name);
  for (const n of ['LEEME.txt', 'bios/bio-tagline.txt', 'bios/bio-corta.txt', 'bios/bio-media.txt', 'bios/bio-larga.txt', 'ficha-tecnica.txt', 'logos/isotipo-negro.svg', 'logos/wordmark.png', 'contacto/booking.vcf', 'contacto/qr.svg', 'pdf/epk.pdf']) assert.ok(names.includes(n), `falta ${n}`);
  assert.ok(!names.some((n) => n.includes('falta.pdf')), 'un binario ausente se omite');
  assert.equal(names.filter((n) => n.startsWith('fotos-ejemplo/')).length, 5);
  assert.equal(new Set(names).size, names.length);

  const zip = createZip(entries);
  assert.deepEqual(zip, createZip(kitEntries(kit(true))), 'determinista');
  const files = readZip(zip);
  assert.ok(files['bios/bio-media.txt'].toString().startsWith('[CONTENIDO DE EJEMPLO]'));
  assert.ok(!files['bios/bio-corta.txt'].toString().includes('CONTENIDO DE EJEMPLO'), 'la corta es real');
  assert.match(files['bios/bio-corta.txt'].toString(), /Corta \(\d+\)/);
  assert.match(files['ficha-tecnica.txt'].toString(), /Rol\s+DJ y productora\n/);
  assert.match(files['ficha-tecnica.txt'].toString(), /\[\*\] CONTENIDO DE EJEMPLO/);
  assert.match(files['LEEME.txt'].toString(), /- bios\/bio-larga\.txt/);
  assert.deepEqual([...files['logos/wordmark.png']], [137, 80, 78, 71]);
});

test('press kit con el interruptor apagado: sin piezas, sin bios ni filas de ejemplo, sin avisos', () => {
  const entries = kitEntries(kit(false));
  const names = entries.map((e) => e.name);
  assert.ok(!names.some((n) => n.startsWith('fotos-ejemplo/')));
  assert.ok(!names.includes('bios/bio-media.txt') && !names.includes('bios/bio-larga.txt'));
  const files = readZip(createZip(entries));
  for (const [n, buf] of Object.entries(files)) if (n.endsWith('.txt')) assert.doesNotMatch(buf.toString(), /EJEMPLO/, n);
});

test('press kit: lo abre un descompresor real (unzip -t)', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'press-zip-'));
  try {
    writeFileSync(join(dir, 'kit.zip'), createZip(kitEntries(kit(true))));
    let out: string;
    try {
      out = execFileSync('unzip', ['-t', join(dir, 'kit.zip')], { encoding: 'utf8' });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return t.skip('unzip no está instalado');
      throw e;
    }
    assert.match(out, /No errors detected/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ---- Textos de interfaz --------------------------------------------------------------------------------------------- */

test('textos press_: toda clave usada existe en es y en, y no sobran claves con prefijo equivocado', () => {
  const ui = parse(read('src/content/ui/press.yaml')) as Record<string, { es: string; en: string }>;
  const base = parse(read('src/content/ui/base.yaml')) as Record<string, unknown>;
  const site = parse(read('src/content/site.yaml')) as { ui: Record<string, unknown> };
  for (const [k, v] of Object.entries(ui)) {
    assert.ok(k.startsWith('press_'), k);
    assert.ok(v.es.trim() && v.en.trim(), `${k} sin es/en`);
  }
  const walk = (d: string): string[] => readdirSync(join(root, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
  const files = [...walk('src/components/press'), ...walk('src/lib/press'), ...walk('src/pages/prensa'), ...walk('src/pages/en/press'), ...walk('src/pages/downloads/press')];
  const known = (k: string) => k in ui || k in base || k in site.ui;
  for (const f of files) {
    const src = read(f);
    for (const m of src.matchAll(/\bt\(\s*'([a-z_0-9]+)'/g)) assert.ok(known(m[1]), `${f}: falta la clave ${m[1]}`);
  }
  // claves dinámicas
  for (const id of ['tagline', 'short', 'medium', 'long']) assert.ok(`press_bio_${id}` in ui);
  for (const id of ['space', 'size', 'colors', 'photos']) assert.ok(`press_rule_${id}_title` in ui && `press_rule_${id}_text` in ui);
  for (const id of ['landscape', 'portrait', 'square']) assert.ok(`press_shape_${id}` in ui);
  for (const id of PALETTE_IDS) assert.ok(`press_sw_${id.replaceAll('-', '_')}` in ui, id);
});
