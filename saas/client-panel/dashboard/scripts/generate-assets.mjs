// Gera favicon, app icons, OG image e manifest em /public.
// Uso: npm run assets
import { writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const OUT = new URL('../public/', import.meta.url);
await mkdir(OUT, { recursive: true });

// ---- Marca "N" ------------------------------------------------------------
const mark = ({ size = 64, rounded = true, padding = 0 } = {}) => {
  const s = 64, p = padding;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-p} ${-p} ${s + p * 2} ${s + p * 2}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#818cf8"/><stop offset="1" stop-color="#8b5cf6"/>
  </linearGradient></defs>
  ${p ? `<rect x="${-p}" y="${-p}" width="${s + p * 2}" height="${s + p * 2}" fill="#0b1120"/>` : ''}
  <rect width="64" height="64" rx="${rounded ? 16 : 0}" fill="url(#g)"/>
  <path d="M19 46V18h5.5l15.5 19.5V18H45v28h-5.5L24 26.5V46z" fill="#fff"/>
  <circle cx="47.5" cy="16.5" r="4" fill="#22c55e" stroke="#4f46e5" stroke-width="2"/>
</svg>`;
};

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

// ICO com payload PNG (suportado por todos os navegadores modernos)
function toIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const dir = [];
  for (const { size, buf } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(offset, 12);
    offset += buf.length; dir.push(e);
  }
  return Buffer.concat([header, ...dir, ...images.map((i) => i.buf)]);
}

const favSvg = mark();
await writeFile(new URL('favicon.svg', OUT), favSvg);
const ico = await Promise.all([16, 32, 48].map(async (size) => ({ size, buf: await png(favSvg, size) })));
await writeFile(new URL('favicon.ico', OUT), toIco(ico));
await writeFile(new URL('favicon-32x32.png', OUT), await png(favSvg, 32));
await writeFile(new URL('apple-touch-icon.png', OUT), await png(mark({ rounded: false }), 180));
await writeFile(new URL('icon-192.png', OUT), await png(favSvg, 192));
await writeFile(new URL('icon-512.png', OUT), await png(favSvg, 512));
// Maskable: marca dentro da safe zone (80%)
await writeFile(new URL('icon-maskable-512.png', OUT), await png(mark({ rounded: false, padding: 10 }), 512));

await writeFile(new URL('site.webmanifest', OUT), JSON.stringify({
  name: 'NAMY CONTROL',
  short_name: 'Namy',
  description: 'Painel de controle inteligente para seu bot de WhatsApp.',
  start_url: '/app/',
  display: 'standalone',
  background_color: '#080c17',
  theme_color: '#0b1120',
  lang: 'pt-BR',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));

// ---- Open Graph 1200x630 ---------------------------------------------------
const font = `font-family="Inter, 'Ubuntu Sans', 'DejaVu Sans', sans-serif"`;
const stats = [
  ['Total de Grupos', '12', '#22c55e'],
  ['Total de Contatos', '1.248', '#3b82f6'],
  ['Campanhas Enviadas', '8', '#8b5cf6'],
  ['Automações Ativas', '5', '#f59e0b'],
];
const pts = [480, 690, 1010, 610, 1290, 1180, 1580];
const cx0 = 640, cw = 500, cy0 = 560, ch = 150;
const px = (i) => cx0 + (i * cw) / (pts.length - 1);
const py = (v) => cy0 - (v / 2000) * ch;
const line = pts.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
const area = `${line} L${px(pts.length - 1)},${cy0} L${cx0},${cy0} Z`;

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
  <radialGradient id="glow" cx="0.85" cy="0.1" r="0.7"><stop offset="0" stop-color="#6366f1" stop-opacity="0.35"/><stop offset="1" stop-color="#6366f1" stop-opacity="0"/></radialGradient>
  <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6366f1" stop-opacity="0.5"/><stop offset="1" stop-color="#6366f1" stop-opacity="0.02"/></linearGradient>
  <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient>
</defs>
<rect width="1200" height="630" fill="#080c17"/>
<rect width="1200" height="630" fill="url(#glow)"/>

<g transform="translate(72,72)">${mark({ size: 64 }).replace(/<svg[^>]*>|<\/svg>/g, '').replace(/id="g"/, 'id="gm"').replace('url(#g)', 'url(#gm)')}</g>
<text x="156" y="104" ${font} font-size="34" font-weight="800" fill="#f8fafc">NAMY</text>
<text x="157" y="128" ${font} font-size="13" font-weight="500" letter-spacing="6" fill="#94a3b8">CONTROL</text>

<text x="72" y="250" ${font} font-size="50" font-weight="700" fill="#f8fafc">Seu bot de WhatsApp</text>
<text x="72" y="314" ${font} font-size="50" font-weight="700" fill="#f8fafc">sob <tspan fill="#a5b4fc">controle total.</tspan></text>
<text x="72" y="368" ${font} font-size="22" fill="#94a3b8">Grupos, campanhas, automações e IA em um só painel.</text>

<rect x="72" y="420" width="196" height="52" rx="14" fill="url(#brand)"/>
<text x="170" y="453" ${font} font-size="18" font-weight="600" fill="#fff" text-anchor="middle">Mais conversas.</text>
<text x="290" y="453" ${font} font-size="18" font-weight="500" fill="#94a3b8">Mais resultados.</text>

${stats.map(([label, value, color], i) => {
  const x = 640 + (i % 2) * 260, y = 120 + Math.floor(i / 2) * 120;
  return `<g><rect x="${x}" y="${y}" width="240" height="104" rx="16" fill="#131a2b" stroke="rgba(148,163,184,0.12)"/>
  <circle cx="${x + 32}" cy="${y + 34}" r="14" fill="${color}"/>
  <text x="${x + 56}" y="${y + 39}" ${font} font-size="14" fill="#94a3b8">${label}</text>
  <text x="${x + 22}" y="${y + 84}" ${font} font-size="34" font-weight="600" fill="#f8fafc">${value}</text></g>`;
}).join('')}

<rect x="620" y="370" width="540" height="210" rx="16" fill="#131a2b" stroke="rgba(148,163,184,0.12)"/>
<text x="640" y="402" ${font} font-size="15" font-weight="600" fill="#f8fafc">Mensagens Enviadas</text>
<text x="1140" y="402" ${font} font-size="12" fill="#64748b" text-anchor="end">últimos 7 dias</text>
${[0, 1, 2, 3].map((k) => `<line x1="${cx0}" x2="${cx0 + cw}" y1="${cy0 - (k * ch) / 3}" y2="${cy0 - (k * ch) / 3}" stroke="rgba(148,163,184,0.08)"/>`).join('')}
<path d="${area}" fill="url(#fill)"/>
<path d="${line}" fill="none" stroke="#818cf8" stroke-width="3" stroke-linejoin="round"/>
${pts.map((v, i) => `<circle cx="${px(i)}" cy="${py(v)}" r="5" fill="#818cf8" stroke="#131a2b" stroke-width="2"/>`).join('')}
</svg>`;

await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toFile(new URL('og-image.png', OUT).pathname);
console.log('✓ Assets gerados em /public');
