const main = document.getElementById('main');
const overlay = document.getElementById('overlay');
const dlgTitle = document.getElementById('dlgTitle');

let state = { persona: 'Player', games: [] };

const ICON_UP = '<svg viewBox="0 0 24 24"><path d="M2 21h4V9H2zm20-11a2 2 0 00-2-2h-6.300l1-4.600v-.3a1.500 1.500 0 00-.4-1L13.200 1 7 7.200A2 2 0 006.400 8.600V19a2 2 0 002 2H17a2 2 0 001.800-1.200l3-7A2 2 0 0022 12z"/></svg>';
const ICON_USER = '<svg viewBox="0 0 24 24"><path d="M12 12a4.500 4.500 0 100-9 4.500 4.500 0 000 9zm0 2c-4 0-8 2-8 5v2h16v-2c0-3-4-5-8-5z"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>';

// Roblox shows a like ratio and player count on every tile; fake both, but keep
// them stable per game so they don't change between visits.
function hash(n) {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return h >>> 0;
}
const likes = (g) => 84 + (hash(g.appid) % 15);
const players = (g) => 800 + (hash(g.appid + 1) % 90000);
const visits = (g) => 5 + (hash(g.appid + 2) % 900);
const fmtCount = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K' : String(n));
const cdnArt = (g) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`;

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Local Steam art first, then the Steam CDN, then a plain text placeholder.
function artImg(g) {
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  let tried = 0;
  const sources = [g.art, cdnArt(g)].filter(Boolean);
  img.onerror = () => {
    tried++;
    if (tried < sources.length) img.src = sources[tried];
    else {
      const ph = document.createElement('div');
      ph.className = 'ph';
      ph.textContent = g.name;
      img.replaceWith(ph);
    }
  };
  img.src = sources[0];
  return img;
}

function tile(g) {
  const t = el(`<div class="tile"><div class="thumb"></div><div class="title">${esc(g.name)}</div>
    <div class="stats"><span>${ICON_UP}${likes(g)}%</span><span>${ICON_USER}${fmtCount(players(g))}</span></div></div>`);
  t.querySelector('.thumb').appendChild(artImg(g));
  t.onclick = () => showGame(g);
  return t;
}

function row(title, games) {
  if (!games.length) return null;
  const r = el(`<section class="row"><h2>${esc(title)} <span class="chev">›</span></h2>
    <button class="arrow l">‹</button><div class="scroller"></div><button class="arrow r">›</button></section>`);
  const sc = r.querySelector('.scroller');
  games.forEach((g) => sc.appendChild(tile(g)));
  r.querySelector('.l').onclick = () => sc.scrollBy({ left: -sc.clientWidth * 0.8 });
  r.querySelector('.r').onclick = () => sc.scrollBy({ left: sc.clientWidth * 0.8 });
  return r;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

function showHome() {
  main.scrollTop = 0;
  main.replaceChildren();
  const initial = state.persona.trim()[0]?.toUpperCase() || '?';
  main.appendChild(el(`<div class="greeting"><div class="avatar">${esc(initial)}</div>
    <h1>${greeting()}, ${esc(state.persona)}</h1></div>`));

  const games = state.games;
  if (!games.length) {
    main.appendChild(el('<p class="empty">No experiences available right now. Please try again later.</p>'));
    return;
  }
  const byRand = [...games].sort((a, b) => hash(a.appid) - hash(b.appid));
  const recent = games.filter((g) => g.lastPlayed > 0).slice(0, 12);
  const sections = [
    row('Continue', recent.length ? recent : games.slice(0, 12)),
    row('Recommended For You', byRand),
    row('Friends Are Playing', byRand.filter((_, i) => i % 2 === 0).reverse()),
    row('Top Trending', [...games].sort((a, b) => players(b) - players(a))),
  ];
  sections.filter(Boolean).forEach((s) => main.appendChild(s));
}

function showGame(g) {
  main.scrollTop = 0;
  main.replaceChildren();
  const page = el(`<div><a class="back">‹ Back</a><div class="game">
    <div class="hero"></div>
    <div class="info">
      <h1>${esc(g.name)}</h1>
      <div class="by">By <b>@${esc(state.persona)}</b></div>
      <button class="play">${ICON_PLAY}Play</button>
      <div class="rate"><span class="pill">${ICON_UP}${likes(g)}%</span><span class="pill">${ICON_USER}${fmtCount(players(g))}</span></div>
    </div></div>
    <div class="facts">
      <div><small>Active</small><b>${fmtCount(players(g))}</b></div>
      <div><small>Favorites</small><b>${fmtCount(players(g) * 3)}</b></div>
      <div><small>Visits</small><b>${visits(g)}M+</b></div>
      <div><small>Server Size</small><b>${2 + (hash(g.appid + 3) % 30)}</b></div>
    </div></div>`);
  page.querySelector('.hero').appendChild(artImg(g));
  page.querySelector('.back').onclick = showHome;
  page.querySelector('.play').onclick = () => play(g);
  main.appendChild(page);
}

let launching = false;
function play(g) {
  if (launching) return;
  launching = true;
  dlgTitle.textContent = 'Starting Roblox...';
  overlay.hidden = false;
  setTimeout(() => { dlgTitle.textContent = 'Joining experience...'; }, 1600);
  setTimeout(() => window.api.launch(g.appid), 2600);
  setTimeout(() => { overlay.hidden = true; launching = false; }, 5200);
}

document.getElementById('brand').onclick = showHome;

window.api.getLibrary().then((lib) => {
  state = lib;
  document.getElementById('topAvatar').textContent = lib.persona.trim()[0]?.toUpperCase() || '?';
  showHome();
});
