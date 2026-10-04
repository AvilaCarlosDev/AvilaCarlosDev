#!/usr/bin/env node
// Genera las tarjetas SVG del README de perfil a partir de datos reales de GitHub.
// Uso:  GITHUB_TOKEN=xxx node scripts/generate.mjs            (datos en vivo, GraphQL)
//       node scripts/generate.mjs --data scripts/fixture.json  (datos locales, para previsualizar)
import { writeFile, readFile, mkdir } from 'node:fs/promises';

const LOGIN = process.env.PROFILE_LOGIN || 'AvilaCarlosDev';
const OUT = 'assets/profile';
const SANS = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace`;
const C = { text: '#f0f6fc', dim: '#8b98ad', line: '#2b4a78', blue: '#58a6ff', cyan: '#22d3ee', purple: '#a371f7', green: '#3fb950' };

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cut = (s = '', n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const fmt = (n) => Number(n).toLocaleString('en-US');

function wrap(text = '', perLine, maxLines) {
  const lines = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > perLine) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = cut(lines[maxLines - 1] + '…', perLine); }
  return lines;
}

function ago(iso) {
  const d = Math.floor((Date.now() - new Date(iso)) / 864e5);
  if (d < 1) return 'today';
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

// Marco común: panel oscuro con brillos azul / verde / violeta y borde interior.
function frame(w, h, body, id) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
<defs>
  <radialGradient id="${id}a" cx="18%" cy="0%" r="60%"><stop offset="0" stop-color="#2f6fd6" stop-opacity=".55"/><stop offset="1" stop-color="#2f6fd6" stop-opacity="0"/></radialGradient>
  <radialGradient id="${id}b" cx="88%" cy="12%" r="45%"><stop offset="0" stop-color="#1f9d6b" stop-opacity=".35"/><stop offset="1" stop-color="#1f9d6b" stop-opacity="0"/></radialGradient>
  <radialGradient id="${id}c" cx="68%" cy="100%" r="45%"><stop offset="0" stop-color="#8b5cf6" stop-opacity=".45"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></radialGradient>
  <clipPath id="${id}k"><rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="14"/></clipPath>
</defs>
<g clip-path="url(#${id}k)">
  <rect width="${w}" height="${h}" fill="#0b1220"/>
  <rect width="${w}" height="${h}" fill="url(#${id}a)"/><rect width="${w}" height="${h}" fill="url(#${id}b)"/><rect width="${w}" height="${h}" fill="url(#${id}c)"/>
  <rect x="26" y="24" width="${w - 52}" height="${h - 48}" rx="12" fill="#070b14" fill-opacity=".86"/>
</g>
<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="14" fill="none" stroke="${C.line}"/>
<rect x="26" y="24" width="${w - 52}" height="${h - 48}" rx="12" fill="none" stroke="${C.line}" stroke-opacity=".8"/>
${body}
</svg>`;
}

const chip = (x, y, label, font = SANS) => {
  const w = Math.round(label.length * 6.6 + 24);
  return [`<rect x="${x}" y="${y}" width="${w}" height="24" rx="12" fill="#0d1626" stroke="#3a5f96"/><text x="${x + 12}" y="${y + 16}" font-family="${font}" font-size="11" font-weight="600" fill="#c9d7ea">${esc(label)}</text>`, w];
};

function hero(d) {
  const u = d.user;
  const initials = (u.name || u.login).split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const avatar = u.avatarDataUri
    ? `<clipPath id="hav"><circle cx="100" cy="106" r="44"/></clipPath><image href="${u.avatarDataUri}" x="56" y="62" width="88" height="88" clip-path="url(#hav)" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="100" cy="106" r="44" fill="#13233d"/><text x="100" y="118" text-anchor="middle" font-family="${SANS}" font-size="32" font-weight="700" fill="${C.blue}">${esc(initials)}</text>`;
  let x = 56;
  const chips = d.topLangs.slice(0, 4).map((l) => { const [s, w] = chip(x, 162, l); x += w + 10; return s; }).join('');
  return frame(860, 240, `
${avatar}<circle cx="100" cy="106" r="46" fill="none" stroke="${C.blue}" stroke-width="2"/>
<text x="166" y="72" font-family="${MONO}" font-size="13" font-weight="700" letter-spacing="2" fill="${C.dim}">@${esc(u.login.toLowerCase())}</text>
<text x="166" y="118" font-family="${SANS}" font-size="42" font-weight="800" fill="${C.text}">${esc(u.name || u.login)}</text>
<text x="168" y="146" font-family="${SANS}" font-size="13" fill="${C.dim}">${esc(cut((u.bio || '').replace(/\s+/g, ' ').trim(), 86))}</text>
${chips}
<text x="760" y="108" text-anchor="middle" font-family="${SANS}" font-size="30" font-weight="800" fill="${C.blue}">${fmt(d.stars)}</text>
<text x="760" y="130" text-anchor="middle" font-family="${SANS}" font-size="10" font-weight="600" letter-spacing="2" fill="${C.dim}">TOTAL STARS</text>`, 'h');
}

function ring(cx, cy, langs) {
  const r = 24, circ = 2 * Math.PI * r, total = langs.reduce((a, l) => a + l.size, 0) || 1;
  let off = 0;
  const arcs = langs.map((l) => {
    const len = (l.size / total) * circ;
    const s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${l.color || C.blue}" stroke-width="7" stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    off += len;
    return s;
  }).join('');
  const pct = langs.length ? Math.round((langs[0].size / total) * 100) : 0;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1b2a44" stroke-width="7"/>${arcs}<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="${MONO}" font-size="11" font-weight="700" fill="${C.text}">${pct}%</text>`;
}

function projects(d) {
  const cards = d.pinned.slice(0, 4).map((p, i) => {
    const x = 44 + (i % 2) * 392, y = 88 + Math.floor(i / 2) * 170, w = 380, h = 156;
    const desc = wrap(p.description || 'Sin descripción', 40, 2).map((l, j) => `<text x="${x + 18}" y="${y + 76 + j * 16}" font-family="${MONO}" font-size="11" fill="${C.dim}">${esc(l)}</text>`).join('');
    let cx = x + 18;
    const chips = (p.topics || []).slice(0, 3).map((t) => { const [s, cw] = chip(cx, y + 100, cut(t, 16), MONO); cx += cw + 8; return cx > x + w - 80 ? '' : s; }).join('');
    const nm = cut(p.name, 24);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#0a111e" stroke="${C.line}"/>
<line x1="${x}" y1="${y + 28}" x2="${x + w}" y2="${y + 28}" stroke="${C.line}"/>
<text x="${x + 14}" y="${y + 19}" font-family="${MONO}" font-size="10" fill="${C.dim}">• ${esc(cut(p.nameWithOwner, 44))}</text>
<circle cx="${x + w - 16}" cy="${y + 14}" r="4" fill="${C.green}"/>
<text x="${x + 18}" y="${y + 54}" font-family="${MONO}" font-size="16" font-weight="700" fill="${C.text}">${esc(nm)}</text>
<rect x="${x + 26 + nm.length * 9.7}" y="${y + 53}" width="9" height="2" fill="${C.purple}"><animate attributeName="opacity" values="1;0;1" dur="1.2s" repeatCount="indefinite"/></rect>
${desc}${chips}
<text x="${x + 18}" y="${y + 144}" font-family="${MONO}" font-size="10" fill="${C.dim}">★ ${fmt(p.stars)}   updated ${ago(p.pushedAt)}</text>
${ring(x + w - 46, y + 82, p.langs || [])}`;
  }).join('\n');
  return frame(860, 452, `
<text x="44" y="56" font-family="${MONO}" font-size="13" letter-spacing="2" fill="${C.blue}">PROJECTS.LIST</text>
<text x="196" y="56" font-family="${MONO}" font-size="11" fill="${C.dim}">./projects.sh --all</text>
<text x="816" y="56" text-anchor="end" font-family="${MONO}" font-size="11" fill="${C.dim}">${Math.min(d.pinned.length, 4)} pinned</text>
<line x1="44" y1="68" x2="816" y2="68" stroke="${C.line}"/>
${cards}`, 'p');
}

function stats(d) {
  const items = [['Stars', d.stars, C.blue], ['Contributions', d.calendar.total, C.cyan], ['Repos', d.user.repos, C.purple], ['Followers', d.user.followers, C.green]];
  const max = Math.max(...items.map((i) => i[1]), 1);
  const tiles = items.map(([label, v, col], i) => {
    const x = 44 + i * 196, w = 184, bw = w - 40;
    const f = Math.max(0.06, Math.log10(v + 1) / Math.log10(max + 1));
    return `<rect x="${x}" y="100" width="${w}" height="120" rx="12" fill="#0a111e" stroke="${C.line}"/>
<text x="${x + 20}" y="132" font-family="${SANS}" font-size="12" font-weight="600" letter-spacing="1" fill="${C.dim}">${label}</text>
<text x="${x + 20}" y="174" font-family="${SANS}" font-size="32" font-weight="800" fill="${col}">${fmt(v)}</text>
<rect x="${x + 20}" y="192" width="${bw}" height="6" rx="3" fill="#1b2a44"/><rect x="${x + 20}" y="192" width="${(bw * f).toFixed(1)}" height="6" rx="3" fill="${col}"/>`;
  }).join('\n');
  return frame(860, 260, `
<text x="46" y="62" font-family="${SANS}" font-size="24" font-weight="800" fill="${C.text}">Profile Signal</text>
<text x="47" y="84" font-family="${SANS}" font-size="12" font-weight="600" letter-spacing="1" fill="${C.dim}">Live GitHub stats · actualizado ${new Date().toISOString().slice(0, 10)}</text>
${tiles}`, 's');
}

function heatmap(d) {
  const pal = ['#141d2e', '#1d3d6b', '#2a5ea3', '#3d82d6', '#7ab8ff'];
  const cell = 11, gap = 3, x0 = 46, y0 = 96;
  const cells = d.calendar.weeks.map((wk, i) => wk.map((day) => {
    const dow = new Date(day.date + 'T00:00:00Z').getUTCDay();
    return `<rect x="${x0 + i * (cell + gap)}" y="${y0 + dow * (cell + gap)}" width="${cell}" height="${cell}" rx="2" fill="${pal[day.level]}"/>`;
  }).join('')).join('');
  const legend = pal.map((c, i) => `<rect x="${712 + i * 15}" y="54" width="11" height="11" rx="2" fill="${c}"/>`).join('');
  return frame(860, 230, `
<text x="46" y="62" font-family="${SANS}" font-size="24" font-weight="800" fill="${C.text}">Contribution Activity</text>
<text x="47" y="84" font-family="${SANS}" font-size="12" font-weight="600" letter-spacing="1" fill="${C.dim}">${fmt(d.calendar.total)} contributions in the last year</text>
<text x="704" y="64" text-anchor="end" font-family="${SANS}" font-size="10" fill="${C.dim}">Less</text>${legend}<text x="792" y="64" font-family="${SANS}" font-size="10" fill="${C.dim}">More</text>
${cells}`, 'm');
}

function pill(label, value) {
  const w = Math.round(Math.max(label.length * 6, value.length * 7.6) + 78);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="52" viewBox="0 0 ${w} 52" role="img" aria-label="${esc(label)}: ${esc(value)}">
<rect x="1" y="1" width="${w - 2}" height="50" rx="25" fill="#0b1220" stroke="#5a7fb5" stroke-width="1.5"/>
<circle cx="28" cy="26" r="13" fill="#1b2a44"/><text x="28" y="30.500" text-anchor="middle" font-family="${SANS}" font-size="12" font-weight="800" fill="${C.text}">${esc(label[0])}</text>
<text x="52" y="22" font-family="${SANS}" font-size="10" fill="${C.dim}">${esc(label)}</text>
<text x="52" y="38" font-family="${SANS}" font-size="13" font-weight="700" fill="${C.text}">${esc(value)}</text>
</svg>`;
}

const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const QUERY = `query($login:String!){user(login:$login){login name bio avatarUrl(size:176) followers{totalCount}
 repositories(ownerAffiliations:OWNER,isFork:false,privacy:PUBLIC,first:100,orderBy:{field:STARGAZERS,direction:DESC}){totalCount nodes{...R}}
 pinnedItems(first:4,types:REPOSITORY){nodes{...R}}
 contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionLevel}}}}}}
fragment R on Repository{name nameWithOwner description stargazerCount pushedAt primaryLanguage{name}
 repositoryTopics(first:3){nodes{topic{name}}} languages(first:4,orderBy:{field:SIZE,direction:DESC}){edges{size node{name color}}}}`;

async function live() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('Falta GITHUB_TOKEN (o usa --data <fixture.json>)');
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'profile-cards' },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors || !json.data?.user) throw new Error('GraphQL: ' + JSON.stringify(json.errors || json).slice(0, 400));
  const u = json.data.user;
  const repo = (r) => ({
    name: r.name, nameWithOwner: r.nameWithOwner, description: r.description, stars: r.stargazerCount, pushedAt: r.pushedAt,
    topics: r.repositoryTopics.nodes.map((n) => n.topic.name),
    langs: r.languages.edges.map((e) => ({ name: e.node.name, color: e.node.color, size: e.size })),
  });
  const repos = u.repositories.nodes;
  const count = {};
  for (const r of repos) if (r.primaryLanguage) count[r.primaryLanguage.name] = (count[r.primaryLanguage.name] || 0) + 1;
  let avatarDataUri = null;
  try {
    const a = await fetch(u.avatarUrl);
    if (a.ok) avatarDataUri = `data:${a.headers.get('content-type') || 'image/jpeg'};base64,${Buffer.from(await a.arrayBuffer()).toString('base64')}`;
  } catch { /* sin avatar: se usan las iniciales */ }
  const cal = u.contributionsCollection.contributionCalendar;
  return {
    user: { login: u.login, name: u.name, bio: u.bio, avatarDataUri, followers: u.followers.totalCount, repos: u.repositories.totalCount },
    stars: repos.reduce((a, r) => a + r.stargazerCount, 0),
    topLangs: Object.entries(count).sort((a, b) => b[1] - a[1]).map((e) => e[0]),
    pinned: (u.pinnedItems.nodes.length ? u.pinnedItems.nodes : repos.slice(0, 4)).map(repo),
    calendar: { total: cal.totalContributions, weeks: cal.weeks.map((w) => w.contributionDays.map((x) => ({ date: x.date, level: LEVEL[x.contributionLevel] ?? 0 }))) },
  };
}

const i = process.argv.indexOf('--data');
const data = i > -1 ? JSON.parse(await readFile(process.argv[i + 1], 'utf8')) : await live();
const login = data.user.login.toLowerCase();
const files = {
  'hero.svg': hero(data), 'projects.svg': projects(data), 'stats.svg': stats(data), 'heatmap.svg': heatmap(data),
  'social-github.svg': pill('GitHub', '@' + login), 'social-linkedin.svg': pill('LinkedIn', 'in/' + login),
  'social-web.svg': pill('Web', 'avilacarlosdev.com'), 'social-x.svg': pill('X', '@' + login),
};
await mkdir(OUT, { recursive: true });
for (const [name, svg] of Object.entries(files)) await writeFile(`${OUT}/${name}`, svg);
console.log(`OK: ${Object.keys(files).length} SVG en ${OUT} · stars=${data.stars} contribs=${data.calendar.total} pinned=${data.pinned.length} avatar=${data.user.avatarDataUri ? 'sí' : 'no (iniciales)'}`);
