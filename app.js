(() => {
  const VERSION = '2.2.0.0849';
  const KEY = 'lista-reyes-v1';
  const SYNC_KEY = 'lista-reyes-sync';
  // URL de la Realtime Database de Firebase (sin barra final), p. ej. https://xxxx-default-rtdb.europe-west1.firebasedatabase.app
  const DB = 'https://listarrmm-default-rtdb.europe-west1.firebasedatabase.app';
  const listUrl = id => `${DB}/listas/${id}.json`;
  const POLL_MS = 6000;
  // Listas que forman los datos (todas llevan c, u y del para poder fusionarse).
  const KEYS = ['children', 'categories', 'gifts', 'families', 'people', 'buyers'];
  const uid = () => Math.random().toString(36).slice(2, 10);
  // Reloj híbrido: nunca va por detrás de lo ya visto, así un reloj atrasado no hace perder cambios.
  let clock = 0;
  const now = () => (clock = Math.max(Date.now(), clock + 1));
  const seen = s => KEYS.forEach(k => s[k].forEach(i => { if (i.u > clock) clock = i.u; }));
  const $ = s => document.querySelector(s);

  // Mantener la posición de la página: tras redibujar o cerrar un diálogo (y bajar el teclado del móvil)
  // algunos navegadores saltan al principio. Se vuelve a donde estaba el usuario.
  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  let scrollToken = 0; // cualquier gesto del usuario cancela las correcciones pendientes
  ['wheel', 'touchstart', 'keydown'].forEach(ev => window.addEventListener(ev, () => { scrollToken++; }, { passive: true }));
  function restoreScroll(y, delays) {
    const token = ++scrollToken;
    const go = () => {
      if (token !== scrollToken) return;
      const t = Math.min(y, maxScroll());
      if (Math.abs(window.scrollY - t) > 2) window.scrollTo(0, t);
    };
    go(); requestAnimationFrame(go); delays.forEach(d => setTimeout(go, d));
  }
  const showModal = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function () { this._y = window.scrollY; return showModal.call(this); };
  document.addEventListener('close', e => { if (e.target._y != null) restoreScroll(e.target._y, [150, 400]); }, true);

  // Tonos pastel. Los colores saturados de versiones anteriores se suavizan al leerlos.
  const PALETTE = ['#f4a3b0', '#9ccaf5', '#a3dcb8', '#f7cf8a', '#c8b2f2', '#f5aed0', '#92d9d0', '#f7b793'];
  const OLD_TO_NEW = {
    '#e5484d': PALETTE[0], '#0090ff': PALETTE[1], '#30a46c': PALETTE[2], '#f5a524': PALETTE[3],
    '#8e4ec6': PALETTE[4], '#e93d82': PALETTE[5], '#12a594': PALETTE[6], '#f76b15': PALETTE[7], '#6b7280': '#cdc9d6'
  };
  const soften = x => (OLD_TO_NEW[x.color] ? { ...x, color: OLD_TO_NEW[x.color] } : x);
  // Texto legible sobre un color de fondo (oscuro sobre pastel, blanco sobre oscuro).
  const ink = hex => {
    const n = parseInt(hex.slice(1), 16);
    return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150 ? '#3b3548' : '#fff';
  };

  // Cada elemento lleva c (creado), u (última modificación) y del (borrado, "lápida"),
  // para poder fusionar los cambios de dos personas sin pisarse.
  // Las familias y compradores por defecto tienen ids fijos: así dos dispositivos que los creen
  // por separado se fusionan sin duplicarse.
  const defaultFamilies = () => [
    { id: 'fam1', name: 'Mi familia', color: PALETTE[4], c: 1, u: 1 },
    { id: 'fam2', name: 'Familia de…', color: PALETTE[6], c: 2, u: 1 }
  ];
  const defaultBuyers = () => [
    { id: 'b1', name: 'Persona 1', c: 1, u: 1 },
    { id: 'b2', name: 'Persona 2', c: 2, u: 1 }
  ];
  const defaults = () => ({
    children: [
      { id: uid(), name: 'Niño 1', color: PALETTE[0], c: 1, u: 1 },
      { id: uid(), name: 'Niño 2', color: PALETTE[1], c: 2, u: 1 }
    ],
    categories: [
      { id: 'juguetes', name: 'Juguetes', color: PALETTE[0], c: 1, u: 1 },
      { id: 'ropa', name: 'Ropa', color: PALETTE[4], c: 2, u: 1 },
      { id: 'libros', name: 'Libros', color: PALETTE[1], c: 3, u: 1 },
      { id: 'juegos', name: 'Juegos', color: PALETTE[2], c: 4, u: 1 },
      { id: 'otros', name: 'Otros', color: '#cdc9d6', c: 5, u: 1 }
    ],
    gifts: [],
    families: defaultFamilies(),
    people: [],
    buyers: defaultBuyers()
  });

  // Estado único del regalo. Los datos antiguos (bought/online/arrived) se convierten al leerlos.
  const STATUSES = [['idea', '💡 Idea'], ['store', '🏬 Comprado en tienda'], ['online', '🌐 Comprado online'], ['received', '📦 Recibido']];
  const statusOf = g => g.status ?? (g.bought === undefined ? '' : !g.bought ? 'idea' : !g.online ? 'store' : g.arrived ? 'received' : 'online');

  const normalize = d => {
    const arr = k => (Array.isArray(d?.[k]) ? d[k] : []);
    return {
      children: arr('children').map(soften),
      categories: arr('categories').map(soften),
      // Firebase no guarda arrays vacíos, así que cats puede venir sin definir.
      gifts: arr('gifts').map(g => ({ ...g, cats: g.cats || [], status: statusOf(g) })),
      // Si el dato viene de una versión sin familias, se crean las de por defecto.
      families: (Array.isArray(d?.families) ? d.families : defaultFamilies()).map(soften),
      people: arr('people'),
      buyers: Array.isArray(d?.buyers) ? d.buyers : defaultBuyers()
    };
  };

  let state;
  try { state = normalize(JSON.parse(localStorage.getItem(KEY))); } catch { state = normalize(null); }
  if (!state.children.length && !state.categories.length && !state.gifts.length) state = defaults();
  seen(state);

  const live = a => a.filter(x => !x.del);
  const touch = x => { x.u = now(); return x; };
  const mk = o => ({ ...o, c: now(), u: now() });
  const colorOf = (x, i) => x.color || PALETTE[i % PALETTE.length];
  const cat = id => live(state.categories).find(c => c.id === id);
  const ownerName = id => (live(state.children).find(c => c.id === id) || live(state.people).find(p => p.id === id))?.name || '';

  // Preferencias de este dispositivo (no se sincronizan): pantalla, persona activa y modo de lista.
  const UI_KEY = 'lista-reyes-ui';
  let ui = { view: 'home', owner: null, mode: 'list' };
  try { ui = { ...ui, ...JSON.parse(localStorage.getItem(UI_KEY)) }; } catch {}
  const saveUi = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch {} };
  let shopFilter = 'pending';
  let filtersOpen = false;
  let editing = null; // {ownerId, giftId|null}
  let pickedCats = new Set();

  const esc = s => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML.replace(/"/g, '&quot;'); };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  const isBought = g => g.status === 'store' || g.status === 'online' || g.status === 'received';
  const isDone = g => g.status === 'store' || g.status === 'received';
  const isIdea = g => !g.status || g.status === 'idea';

  function matches(g) {
    const st = $('#f-status').value, c = $('#f-cat').value;
    if (c && !g.cats.includes(c)) return false;
    if (st === 'none') return !g.status;
    return !st || g.status === st;
  }

  // Categorías como selector en el formulario: la elegida va rellena con ✓.
  function chipHtml(c, on, attrs = '') {
    return `<button type="button" class="chip ${on ? 'on' : ''}" ${attrs} style="--cc:${c.color};--ink:${ink(c.color)}" aria-pressed="${on}">${on ? '✓ ' : ''}${esc(c.name)}</button>`;
  }

  const svg = p => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICON = { edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>') };

  // --- Personas (niños y personas de familia) ---
  // Grupos: «Mis hijos», cada familia y «Otros» (personas sin familia).
  function owners() {
    const fams = live(state.families), people = live(state.people);
    const kids = live(state.children).map((o, i) => ({ o, id: o.id, kind: 'child', name: o.name, color: colorOf(o, i), fin: !!o.fin, group: 'kids', gname: 'Mis hijos', fam: '' }));
    const inFam = fams.flatMap((f, i) => people.filter(p => p.family === f.id)
      .map(o => ({ o, id: o.id, kind: 'person', name: o.name, color: colorOf(f, i + 4), fin: !!o.fin, group: f.id, gname: f.name, fam: f.name })));
    const others = people.filter(p => !fams.some(f => f.id === p.family))
      .map(o => ({ o, id: o.id, kind: 'person', name: o.name, color: '#cdc9d6', fin: !!o.fin, group: 'others', gname: 'Otros', fam: 'Otros' }));
    return [...kids, ...inFam, ...others];
  }
  function stats(id, gifts) {
    const gs = gifts.filter(g => g.child === id), done = gs.filter(isDone).length;
    return { gs, done, ideas: gs.filter(isIdea), pct: gs.length ? Math.round(done / gs.length * 100) : 0 };
  }
  const avatar = (x, sm) => `<span class="av ${sm ? 'sm' : ''}" style="background:${x.color};color:${ink(x.color)}">${esc((x.name || '?').trim().charAt(0).toUpperCase())}</span>`;
  const ring = (pct, color) => `<span class="ring" style="--p:${pct * 3.6}deg;--rc:${color}"><span>${pct}%</span></span>`;

  // --- Piezas de un regalo ---
  const stKind = g => g.status === 'online' ? 'buy' : isDone(g) ? 'done' : g.status === 'idea' ? 'idea' : 'none';
  const ST_ICON = { none: '', idea: '💡', buy: '📦', done: '✓' };
  const ST_NEXT = { none: 'Marcar como comprado', idea: 'Marcar como comprado', buy: 'Marcar como recibido', done: 'Volver a idea' };
  const nextStatus = g => ({ none: 'store', idea: 'store', buy: 'received', done: 'idea' })[stKind(g)];
  const stBtn = g => { const k = stKind(g); return `<button class="st ${k}" data-act="cycle" title="${ST_NEXT[k]}" aria-label="${ST_NEXT[k]}">${ST_ICON[k]}</button>`; };

  function giftMeta(g, lead = '') {
    const buyer = g.buyer && live(state.buyers).find(b => b.id === g.buyer);
    const link = g.link && /^https?:\/\//i.test(g.link) ? `<a href="${esc(g.link)}" target="_blank" rel="noopener">enlace</a>` : '';
    const bits = [lead, g.store ? '🛒 ' + esc(g.store) : '', buyer ? '🛍️ ' + esc(buyer.name) : '', g.notes ? esc(g.notes) : '', link].filter(Boolean).join(' · ');
    const cats = g.cats.map(cat).filter(Boolean).map(c => `<span class="pill" style="background:${c.color};color:${ink(c.color)}">${esc(c.name)}</span>`).join('');
    return (bits ? `<div class="mt">${bits}</div>` : '') + (cats ? `<div class="pills">${cats}</div>` : '');
  }
  const giftRow = g => `<div class="gr ${stKind(g)}" data-id="${g.id}">${stBtn(g)}
    <div class="gbody" data-act="edit"><div class="nm">${esc(g.name)}</div>${giftMeta(g)}</div>
    <button class="ibtn sm" data-act="edit" title="Editar regalo" aria-label="Editar regalo">${ICON.edit}</button></div>`;

  const GROUPS = [['Por comprar', g => isIdea(g)], ['En camino', g => g.status === 'online'], ['Listos', isDone]];

  // --- Pantalla «Regalos»: una persona cada vez ---
  function giftsHtml(os, gifts) {
    if (!os.length) return `<div class="empty">Aún no hay personas.<br><button class="primary" data-act="add-owner">＋ Añadir persona</button></div>`;
    const cur = os.find(x => x.id === ui.owner);
    const { gs, done, ideas, pct } = stats(cur.id, gifts);
    const shown = gs.filter(matches);
    let lastGroup = null;
    const tabs = os.map(x => {
      const n = stats(x.id, gifts).ideas.length;
      const label = x.group !== lastGroup ? `<span class="tgroup">${esc(x.gname)}</span>` : '';
      lastGroup = x.group;
      return `${label}<button class="tab ${x.id === cur.id ? 'on' : ''}" data-act="goto" data-id="${x.id}">${avatar(x, true)}<span>${esc(x.name)}</span>${x.fin ? '<i class="ok">✓</i>' : n ? `<i>${n}</i>` : ''}</button>`;
    }).join('') + `<button class="tab plus" data-act="add-owner" aria-label="Añadir persona">＋</button>`;
    const sub = `${cur.fam ? esc(cur.fam) + ' · ' : ''}${done} de ${gs.length} listos · ${plural(ideas.length, 'idea', 'ideas')} por comprar`;
    const hero = `<div class="hero ${cur.fin ? 'fin' : ''}">${ring(pct, cur.color)}
      <div class="hgrow"><div class="hname">${esc(cur.name)}</div><div class="mt">${sub}</div></div>
      <button class="finbtn ${cur.fin ? 'on' : ''}" data-act="fin" aria-pressed="${cur.fin}">${cur.fin ? '✓ Terminado' : 'Terminar'}</button>
      <button class="ibtn" data-act="edit-owner" title="Editar" aria-label="Editar persona">${ICON.edit}</button></div>`;
    const segs = `<div class="segs"><button data-act="mode" data-m="list" class="${ui.mode === 'list' ? 'on' : ''}">☰ Lista</button><button data-act="mode" data-m="cols" class="${ui.mode === 'cols' ? 'on' : ''}">▦ Columnas</button></div>`;
    let body;
    if (!gs.length) body = `<div class="empty">Aún no hay regalos para ${esc(cur.name)}.<br><span class="mt">Escribe abajo el nombre de uno y pulsa ＋</span></div>`;
    else if (!shown.length) body = `<div class="empty">Nada con este filtro</div>`;
    else if (ui.mode === 'cols') {
      body = `<div class="kcols">${GROUPS.map(([t, f]) => { const it = shown.filter(f); return `<section class="kc"><h3><span>${t}</span><span>${it.length}</span></h3>${it.map(giftRow).join('') || '<div class="mt c">Vacío</div>'}</section>`; }).join('')}</div>`;
    } else {
      body = GROUPS.map(([t, f]) => { const it = shown.filter(f); return it.length ? `<div class="sh"><span>${t}</span><span>${it.length}</span></div>${it.map(giftRow).join('')}` : ''; }).join('');
    }
    return `<div class="gwrap"><div class="tabs" id="tabs">${tabs}</div><div class="gmain">${hero}${segs}${body}</div></div>`;
  }

  // --- Pantalla «Resumen»: qué falta ---
  function homeHtml(os, gifts) {
    if (!os.length) return `<div class="empty">Aún no hay personas.<br><button class="primary" data-act="add-owner">＋ Añadir persona</button></div>`;
    const info = os.map(x => ({ x, ...stats(x.id, gifts) }));
    const open = info.filter(i => !i.x.fin), ideas = open.reduce((n, i) => n + i.ideas.length, 0);
    const big = open.length
      ? `<div class="big"><div><b>${plural(ideas, 'idea', 'ideas')}</b><span>por comprar · ${plural(open.length, 'persona', 'personas')} sin terminar</span></div><i>🎁</i></div>`
      : `<div class="big ok"><div><b>¡Todo terminado!</b><span>Ya has acabado con todas las personas</span></div><i>🎉</i></div>`;
    const card = i => {
      const chips = i.ideas.slice(0, 3).map(g => `<span class="ichip">💡 ${esc(g.name)}</span>`).join('') + (i.ideas.length > 3 ? `<span class="ichip">+${i.ideas.length - 3}</span>` : '');
      return `<button class="ocard ${i.x.fin ? 'fin' : ''}" data-act="goto" data-id="${i.x.id}">
        <span class="orow">${ring(i.pct, i.x.color)}<span class="hgrow"><span class="hname">${esc(i.x.name)}${i.x.fin ? ' ✓' : ''}</span><span class="mt">${i.x.fam ? esc(i.x.fam) + ' · ' : ''}${i.done} de ${i.gs.length} listos</span></span><span class="chev">›</span></span>
        ${!i.x.fin && (chips || !i.gs.length) ? `<span class="chips2">${chips || '<span class="mt">Aún sin regalos</span>'}</span>` : ''}</button>`;
    };
    let last = null;
    const cards = info.map(i => {
      const h = i.x.group !== last ? `<div class="sh gh"><span>${esc(i.x.gname)}</span></div>` : '';
      last = i.x.group;
      return h + card(i);
    }).join('');
    return `<div class="home">${big}${cards}</div>`;
  }

  // --- Pantalla «Compras»: lista de lo que falta y lo comprado ---
  function shopHtml(os, gifts) {
    const byId = new Map(os.map(x => [x.id, x]));
    const all = gifts.filter(g => byId.has(g.child));
    const pend = all.filter(isIdea), got = all.filter(isBought);
    const list = shopFilter === 'pending' ? pend : shopFilter === 'bought' ? got : all;
    const chips = [['pending', `Pendientes · ${pend.length}`], ['bought', `Comprados · ${got.length}`], ['all', 'Todo']]
      .map(([k, l]) => `<button class="${shopFilter === k ? 'on' : ''}" data-act="shopf" data-f="${k}">${l}</button>`).join('');
    const rows = list.map(g => {
      const o = byId.get(g.child);
      return `<div class="gr ${stKind(g)}" data-id="${g.id}">${avatar(o, true)}
        <div class="gbody" data-act="edit"><div class="nm">${esc(g.name)}</div>${giftMeta(g, 'para ' + esc(o.name))}</div>
        ${isIdea(g) ? `<div class="qbtns"><button data-act="setst" data-s="store">Tienda</button><button data-act="setst" data-s="online">Online</button></div>` : stBtn(g)}</div>`;
    }).join('');
    return `<div class="fchips">${chips}</div>${rows ? `<div class="shoplist">${rows}</div>` : `<div class="empty">${shopFilter === 'pending' ? '🎉 No queda nada por comprar' : 'Nada por aquí'}</div>`}`;
  }

  // --- Dibujar ---
  let tabsLeft = 0;
  function render(top) {
    needRender = false;
    const y = top ? 0 : window.scrollY, board = $('#board');
    board.style.minHeight = board.offsetHeight + 'px'; // evita que la página se acorte un instante
    const prevTabs = $('#tabs'); if (prevTabs) tabsLeft = prevTabs.scrollLeft;
    const cats = live(state.categories);
    const fc = $('#f-cat'), cur = fc.value;
    fc.innerHTML = '<option value="">Todas las categorías</option>' + cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    fc.value = cats.some(c => c.id === cur) ? cur : '';
    updateFilterBtn();

    const os = owners(), gifts = live(state.gifts);
    if (!os.some(x => x.id === ui.owner)) ui.owner = os[0]?.id || null;
    if (!['home', 'gifts', 'shop'].includes(ui.view)) ui.view = 'home';
    board.innerHTML = ui.view === 'home' ? homeHtml(os, gifts) : ui.view === 'shop' ? shopHtml(os, gifts) : giftsHtml(os, gifts);

    document.querySelectorAll('#nav [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === ui.view));
    const pend = gifts.filter(g => isIdea(g) && os.some(x => x.id === g.child)).length;
    $('#nav-badge').textContent = pend || ''; $('#nav-badge').hidden = !pend;
    const onGifts = ui.view === 'gifts' && !!os.length;
    $('#quick').hidden = !onGifts;
    document.body.classList.toggle('has-quick', onGifts);
    $('#btn-filter').hidden = ui.view !== 'gifts';
    $('#filters').hidden = ui.view !== 'gifts' || !filtersOpen;
    const owner = os.find(x => x.id === ui.owner);
    if (owner) $('#quick-name').placeholder = `Añadir regalo para ${owner.name}…`;

    const tabs = $('#tabs');
    if (tabs) {
      tabs.scrollLeft = tabsLeft;
      const t = tabs.querySelector('.tab.on');
      if (t && (t.offsetLeft < tabs.scrollLeft || t.offsetLeft + t.offsetWidth > tabs.scrollLeft + tabs.clientWidth))
        tabs.scrollLeft = t.offsetLeft - (tabs.clientWidth - t.offsetWidth) / 2;
    }
    restoreScroll(y, [120]);
    requestAnimationFrame(() => { board.style.minHeight = ''; restoreScroll(y, []); });
  }

  // --- Filtros plegables ---
  const filtersEl = $('#filters'), filterBtn = $('#btn-filter');
  function updateFilterBtn() {
    const n = ($('#f-status').value ? 1 : 0) + ($('#f-cat').value ? 1 : 0);
    filterBtn.classList.toggle('active', n > 0);
    $('#filter-count').textContent = n || '';
  }
  filterBtn.onclick = () => { filtersOpen = !filtersOpen; filtersEl.hidden = !filtersOpen; filterBtn.setAttribute('aria-expanded', filtersOpen); };
  $('#f-status').onchange = $('#f-cat').onchange = () => render();

  // --- Toast con deshacer ---
  let toastTimer;
  function toast(msg, undo) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>`;
    if (undo) { const b = document.createElement('button'); b.textContent = 'Deshacer'; b.onclick = () => { undo(); t.hidden = true; }; t.append(b); }
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 5000);
  }

  // --- Cambios rápidos de estado y de «terminado» ---
  function setGiftStatus(g, s) {
    const prev = g.status;
    g.status = s; touch(g); save(); render();
    toast('Estado actualizado', () => { g.status = prev; touch(g); save(); render(); });
  }
  function toggleFin(item) {
    item.fin = !item.fin; touch(item); save(); render();
    toast(item.fin ? `Terminado con ${item.name} ✔` : `${item.name} vuelve a pendiente`, () => { item.fin = !item.fin; touch(item); save(); render(); });
  }

  // --- Tablero ---
  $('#board').addEventListener('click', e => {
    if (e.target.closest('a')) return;
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const gEl = btn.closest('.gr');
    const g = gEl && state.gifts.find(x => x.id === gEl.dataset.id);
    const cur = owners().find(x => x.id === ui.owner);
    if (act === 'goto') { ui.owner = btn.dataset.id; ui.view = 'gifts'; saveUi(); return render(true); }
    if (act === 'add-owner') return openAdd();
    if (act === 'mode') { ui.mode = btn.dataset.m; saveUi(); return render(); }
    if (act === 'shopf') { shopFilter = btn.dataset.f; return render(); }
    if (act === 'fin') return cur && toggleFin(cur.o);
    if (act === 'edit-owner') return cur && openOwner(cur.kind, cur.id);
    if (!g) return;
    if (act === 'edit') return openGift(g.child, g);
    if (act === 'cycle') return setGiftStatus(g, nextStatus(g));
    if (act === 'setst') return setGiftStatus(g, btn.dataset.s);
  });

  // --- Navegación inferior y añadido rápido ---
  $('#nav').addEventListener('click', e => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    ui.view = b.dataset.view; saveUi(); render(true);
  });
  $('#quick').addEventListener('submit', e => {
    e.preventDefault();
    const inp = $('#quick-name'), name = inp.value.trim();
    if (!ui.owner) return;
    if (!name) return openGift(ui.owner, null);
    state.gifts.push(mk({ id: uid(), child: ui.owner, name, store: '', link: '', notes: '', status: 'idea', buyer: '', cats: [] }));
    inp.value = ''; save(); render();
  });

  // --- Diálogo de regalo (hoja inferior) ---
  const dlg = $('#dlg-gift'), form = $('#form-gift');
  function renderPick() {
    $('#gift-cats').className = 'chips';
    $('#gift-cats').innerHTML = live(state.categories).map(c =>
      chipHtml(c, pickedCats.has(c.id), `data-id="${c.id}"`)).join('');
  }
  $('#gift-cats').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    pickedCats.has(c.dataset.id) ? pickedCats.delete(c.dataset.id) : pickedCats.add(c.dataset.id);
    renderPick();
  });
  const setFormStatus = v => {
    form.status.value = v;
    document.querySelectorAll('#gift-status [data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === v));
  };
  $('#gift-status').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) setFormStatus(b.dataset.s); });
  function fillBuyers(val) {
    form.buyer.innerHTML = '<option value="">-Lo compra-</option>' +
      live(state.buyers).map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
    form.buyer.value = val;
  }
  const buyersUnedited = () => live(state.buyers).every(b => (b.u || 0) <= 1);
  function openGift(ownerId, g) {
    editing = { ownerId, giftId: g?.id || null };
    pickedCats = new Set(g?.cats || []);
    $('#gift-title').textContent = g ? g.name : 'Nuevo regalo para ' + ownerName(ownerId);
    form.reset();
    fillBuyers(g?.buyer || '');
    $('#buyer-names').hidden = !buyersUnedited();
    $('#more').open = !!(g && (g.store || g.link || g.notes));
    $('#gift-delete').hidden = !g;
    if (g) {
      form.name.value = g.name; form.store.value = g.store || ''; form.link.value = g.link || '';
      form.notes.value = g.notes || '';
    }
    setFormStatus(g?.status || 'idea');
    renderPick(); dlg.showModal();
  }
  $('#gift-cancel').onclick = () => dlg.close();
  $('#gift-delete').onclick = () => {
    const g = state.gifts.find(x => x.id === editing.giftId);
    if (!g) return;
    g.del = true; touch(g); save(); render(); dlg.close();
    toast('Regalo borrado', () => { g.del = false; touch(g); save(); render(); });
  };
  form.addEventListener('submit', e => {
    e.preventDefault();
    const data = {
      name: form.name.value.trim(), store: form.store.value.trim(), link: form.link.value.trim(), notes: form.notes.value.trim(),
      status: form.status.value || 'idea', buyer: form.buyer.value, cats: [...pickedCats]
    };
    if (!data.name) return;
    const existing = editing.giftId && state.gifts.find(g => g.id === editing.giftId);
    if (existing) touch(Object.assign(existing, data));
    else state.gifts.push(mk({ id: uid(), child: editing.ownerId, ...data }));
    save(); render(); dlg.close();
  });

  // --- Añadir persona (niño o persona de una familia) ---
  const dadd = $('#dlg-add'), fadd = $('#form-add');
  function openAdd() {
    fadd.reset();
    fadd.group.innerHTML = '<option value="child">👧 Mis hijos</option>' +
      live(state.families).map(f => `<option value="${f.id}">👪 ${esc(f.name)}</option>`).join('') +
      '<option value="others">🙂 Otros (sin familia)</option><option value="newfam">＋ Nueva familia…</option>';
    $('#newfam').hidden = true;
    dadd.showModal(); fadd.name.focus();
  }
  fadd.group.addEventListener('change', () => { $('#newfam').hidden = fadd.group.value !== 'newfam'; });
  $('#add-cancel').onclick = () => dadd.close();
  fadd.addEventListener('submit', e => {
    e.preventDefault();
    const name = fadd.name.value.trim(), g = fadd.group.value;
    if (!name) return;
    let id = uid();
    if (g === 'child') {
      const n = live(state.children).length;
      state.children.push(mk({ id, name, color: PALETTE[n % PALETTE.length] }));
    } else {
      let fam = g;  // id de familia o 'others'
      if (g === 'newfam') {
        const n = live(state.families).length;
        fam = uid();
        state.families.push(mk({ id: fam, name: fadd.fam.value.trim() || 'Familia ' + (n + 1), color: PALETTE[(n + 4) % PALETTE.length] }));
      }
      state.people.push(mk({ id, family: fam, name }));
    }
    ui.owner = id; ui.view = 'gifts'; saveUi();
    save(); render(true); dadd.close();
  });

  // --- Familias ---
  const dfam = $('#dlg-fams');
  function renderFams() {
    const ppl = live(state.people);
    $('#fam-list').innerHTML = live(state.families).map(f => `<div class="catrow" data-id="${f.id}">
      <span class="dot" style="background:${f.color || PALETTE[4]}"></span><span class="grow">${esc(f.name)}</span>
      <small>${plural(ppl.filter(p => p.family === f.id).length, 'persona', 'personas')}</small>
      <button class="ibtn sm" data-edit title="Editar familia" aria-label="Editar familia">${ICON.edit}</button></div>`).join('') || '<p class="hint">Aún no hay familias.</p>';
  }
  $('#btn-fams').onclick = () => { renderFams(); dfam.showModal(); };
  $('#fams-close').onclick = () => dfam.close();
  $('#fam-add').onclick = () => addFamily();
  $('#fam-list').addEventListener('click', e => {
    const r = e.target.closest('[data-edit]'); if (r) openOwner('family', r.closest('.catrow').dataset.id);
  });

  // --- Diálogo de ficha / familia / persona (nombre, color, eliminar) ---
  const dch = $('#dlg-child'), fch = $('#form-child');
  let editingOwner = null; // {kind: 'child'|'family'|'person', item}
  const OWNER = {
    child: { list: () => state.children, title: 'Editar ficha' },
    family: { list: () => state.families, title: 'Editar familia' },
    person: { list: () => state.people, title: 'Editar persona' }
  };
  function openOwner(kind, id) {
    const list = live(OWNER[kind].list()), i = list.findIndex(x => x.id === id);
    const item = list[i];
    editingOwner = { kind, item };
    $('#owner-title').textContent = OWNER[kind].title;
    $('#owner-color').hidden = kind === 'person';
    fch.name.value = item.name;
    if (kind !== 'person') fch.color.value = colorOf(item, kind === 'family' ? i + 4 : i);
    dch.showModal();
    fch.name.select();
  }
  $('#child-cancel').onclick = () => dch.close();
  dch.addEventListener('close', () => { if (dfam.open) renderFams(); });
  fch.addEventListener('submit', e => {
    e.preventDefault();
    const { kind, item } = editingOwner;
    item.name = fch.name.value.trim() || item.name;
    if (kind !== 'person') item.color = fch.color.value;
    touch(item); save(); render(); dch.close();
  });
  $('#child-delete').onclick = () => {
    const { kind, item } = editingOwner;
    const items = [item], ownerIds = new Set([item.id]);
    if (kind === 'family') live(state.people).filter(p => p.family === item.id).forEach(p => { items.push(p); ownerIds.add(p.id); });
    const members = items.length - 1;
    const owned = live(state.gifts).filter(g => ownerIds.has(g.child));
    items.push(...owned);
    if (owned.length || members) {
      const what = kind === 'family' ? `la familia ${item.name}, sus ${members} personas y ${owned.length} regalos`
        : kind === 'person' ? `a ${item.name} y sus ${owned.length} regalos`
        : `la ficha de ${item.name} y sus ${owned.length} regalos`;
      if (!confirm(`¿Eliminar ${what}?`)) return;
    }
    items.forEach(x => { x.del = true; touch(x); });
    save(); render(); dch.close();
    toast('Eliminado', () => { items.forEach(x => { x.del = false; touch(x); }); save(); render(); });
  };

  // --- Categorías ---
  const dc = $('#dlg-cats');
  function renderCats() {
    $('#cat-list').innerHTML = live(state.categories).map(c => `<div class="catrow" data-id="${c.id}">
      <input type="color" value="${c.color}" data-f="color"><input type="text" value="${esc(c.name)}" data-f="name" maxlength="30">
      <button class="icon ghost" data-del title="Borrar">🗑️</button></div>`).join('');
  }
  $('#btn-cats').onclick = () => { renderCats(); dc.showModal(); };
  $('#cats-close').onclick = () => dc.close();
  dc.addEventListener('close', render);
  $('#cat-list').addEventListener('input', e => {
    const f = e.target.dataset.f; if (!f) return;
    const c = cat(e.target.closest('.catrow').dataset.id);
    if (f === 'name') { if (!e.target.value.trim()) return; c.name = e.target.value.trim(); } else c.color = e.target.value;
    touch(c); save();
  });
  $('#cat-list').addEventListener('click', e => {
    if (!e.target.closest('[data-del]')) return;
    const c = cat(e.target.closest('.catrow').dataset.id);
    c.del = true; touch(c);
    state.gifts.forEach(g => { if (g.cats.includes(c.id)) { g.cats = g.cats.filter(x => x !== c.id); touch(g); } });
    save(); renderCats();
  });
  $('#form-cat').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    state.categories.push(mk({ id: uid(), name: f.name.value.trim(), color: f.color.value }));
    f.reset(); save(); renderCats();
  });

  // --- Quién compra (nombres de las dos personas) ---
  const db = $('#dlg-buyers');
  function renderBuyers() {
    $('#buyer-list').innerHTML = live(state.buyers).map(b =>
      `<label>${esc(b.id === 'b1' ? 'Persona 1' : b.id === 'b2' ? 'Persona 2' : 'Persona')}<input type="text" data-id="${b.id}" value="${esc(b.name)}" maxlength="30"></label>`).join('');
  }
  $('#btn-buyers').onclick = () => { renderBuyers(); db.showModal(); };
  $('#buyers-close').onclick = () => db.close();
  db.addEventListener('close', () => {
    if (dlg.open) { fillBuyers(form.buyer.value); $('#buyer-names').hidden = !buyersUnedited(); }
    render();
  });
  $('#buyer-names').onclick = () => { renderBuyers(); db.showModal(); };
  $('#buyer-list').addEventListener('input', e => {
    const b = state.buyers.find(x => x.id === e.target.dataset.id);
    if (!b || !e.target.value.trim()) return;
    b.name = e.target.value.trim(); touch(b); save();
  });

  // --- Menú superior y tema ---
  const menu = $('#menu-panel'), menuBtn = $('#btn-menu');
  const setMenu = open => { menu.hidden = !open; menuBtn.setAttribute('aria-expanded', open); };
  menuBtn.onclick = e => { e.stopPropagation(); setMenu(menu.hidden); };
  menu.addEventListener('click', e => { if (e.target.closest('button')) setMenu(false); });
  menu.addEventListener('change', () => setMenu(false));
  document.addEventListener('click', e => { if (!e.target.closest('.menu')) setMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

  const THEME_KEY = 'lista-reyes-theme';
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    $('#btn-theme').textContent = t === 'dark' ? '☀️ Tema claro' : '🌙 Tema oscuro';
  }
  $('#btn-theme').onclick = () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, t); } catch {}
    applyTheme(t);
  };
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

  function addFamily() {
    const n = live(state.families).length;
    const f = mk({ id: uid(), name: 'Familia ' + (n + 1), color: PALETTE[(n + 4) % PALETTE.length] });
    state.families.push(f); save(); render();
    openOwner('family', f.id);
  }

  // --- Exportar / importar ---
  $('#btn-export').onclick = () => {
    const out = {};
    KEYS.forEach(k => { out[k] = live(state[k]); });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
    a.download = 'lista-reyes.json'; a.click(); URL.revokeObjectURL(a.href);
  };
  $('#file-import').onchange = async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!Array.isArray(d.children) || !Array.isArray(d.categories) || !Array.isArray(d.gifts)) throw 0;
      if (!confirm('Esto reemplaza la lista actual. ¿Continuar?')) return;
      for (const k of KEYS) {
        if (!Array.isArray(d[k])) continue; // archivos de versiones anteriores no traen familias
        const ids = new Set(d[k].map(x => x.id));
        state[k].forEach(x => { if (!ids.has(x.id) && !x.del) { x.del = true; touch(x); } });
        d[k].forEach(x => {
          const i = state[k].findIndex(y => y.id === x.id);
          const item = { ...x, del: false, c: x.c || now(), u: now() };
          if (k === 'gifts') { item.status = statusOf(x); item.cats = x.cats || []; }
          i >= 0 ? (state[k][i] = item) : state[k].push(item);
        });
      }
      save(); render();
    } catch { alert('Archivo no válido'); }
  };

  // ===== Sincronización (Firebase Realtime Database, vía HTTP) =====
  let syncId = null;
  try { syncId = localStorage.getItem(SYNC_KEY); } catch {}
  let syncing = false, again = false, needRender = false, pushTimer, pollTimer;

  function setStatus(s) {
    const el = $('#sync-status');
    const map = {
      off: ['', ''], sync: ['🔄 Sincronizando…', ''], ok: ['☁️ Sincronizado', 'ok'],
      err: ['⚠️ Sin conexión (se reintentará)', 'err'], missing: ['⚠️ No encuentro la lista compartida', 'err']
    };
    el.textContent = map[s][0]; el.className = 'sync ' + map[s][1];
    $('#btn-share').textContent = syncId ? '🔗 Copiar enlace' : '🔗 Compartir';
  }

  const sig = s => KEYS.map(k =>
    s[k].map(i => i.id + ':' + (i.u || 0) + (i.del ? 'd' : '')).sort().join(',')).join('|');

  function mergeList(a, b) {
    const m = new Map();
    for (const i of [...a, ...b]) {
      const o = m.get(i.id);
      if (!o || (i.u || 0) > (o.u || 0)) m.set(i.id, i);
    }
    return [...m.values()].sort((x, y) => (x.c || 0) - (y.c || 0));
  }
  const merge = (a, b) => Object.fromEntries(KEYS.map(k => [k, mergeList(a[k], b[k])]));

  function canRender() {
    return true;
  }

  const headers = { 'Content-Type': 'application/json' };

  async function sync() {
    if (!syncId) return;
    if (syncing) { again = true; return; }
    syncing = true;
    try {
      const r = await fetch(listUrl(syncId), { cache: 'no-store' });
      if (!r.ok) throw new Error('GET ' + r.status);
      const remote = normalize(await r.json());
      seen(remote);
      const merged = merge(state, remote);
      const changedLocal = sig(merged) !== sig(state);
      const changedRemote = sig(merged) !== sig(remote);
      if (changedLocal) {
        state = merged;
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
        canRender() ? render() : (needRender = true);
      }
      if (changedRemote) {
        const p = await fetch(listUrl(syncId), { method: 'PUT', headers, body: JSON.stringify(state) });
        if (!p.ok) throw new Error('PUT ' + p.status);
      }
      setStatus('ok');
    } catch { setStatus('err'); }
    finally {
      syncing = false;
      if (again) { again = false; sync(); }
    }
  }

  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (document.hidden) return;
      if (needRender && canRender()) render();
      sync();
    }, POLL_MS);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    if (syncId) { clearTimeout(pushTimer); pushTimer = setTimeout(sync, 700); }
  }

  async function joinFromLink() {
    const m = location.hash.match(/lista=([\w-]+)/);
    if (!DB || !m || m[1] === syncId) return;
    syncId = m[1];
    try { localStorage.setItem(SYNC_KEY, syncId); } catch {}
    setStatus('sync');
    // Si aquí no hay regalos propios, adopta la lista compartida tal cual (evita fichas duplicadas).
    if (!live(state.gifts).length) {
      try {
        const r = await fetch(listUrl(syncId), { cache: 'no-store' });
        if (r.ok) {
          const remote = normalize(await r.json());
          if (remote.children.length || remote.categories.length) { seen(remote); state = remote; save(); render(); }
        }
      } catch {}
    }
  }

  $('#btn-share').onclick = async () => {
    try {
      if (!DB) throw new Error('falta configurar la base de datos');
      if (!syncId) {
        setStatus('sync');
        const id = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(36).padStart(2, '0')).join('');
        const r = await fetch(listUrl(id), { method: 'PUT', headers, body: JSON.stringify(state) });
        if (!r.ok) throw new Error('PUT ' + r.status);
        syncId = id;
        try { localStorage.setItem(SYNC_KEY, syncId); } catch {}
        startPolling();
      }
      const url = location.origin + location.pathname + '#lista=' + syncId;
      history.replaceState(null, '', '#lista=' + syncId);
      setStatus('ok');
      try { await navigator.clipboard.writeText(url); toast('Enlace copiado. Envíaselo a la otra persona.'); }
      catch { prompt('Copia este enlace y envíaselo a la otra persona:', url); }
    } catch (err) {
      setStatus('off');
      alert('No se pudo crear la lista compartida. Inténtalo más tarde.\n(' + err.message + ')');
    }
  };

  $('#version').textContent = 'v' + VERSION;
  render();
  setStatus(syncId ? 'sync' : 'off');
  (async () => {
    await joinFromLink();
    if (syncId && DB) { startPolling(); sync(); }
  })();
})();
