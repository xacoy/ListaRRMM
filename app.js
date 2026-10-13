(() => {
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

  // Fichas y familias minimizadas: preferencia de este dispositivo (no se sincroniza).
  const COLLAPSED_KEY = 'lista-reyes-collapsed';
  let collapsed = new Set();
  try { collapsed = new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY)) || []); } catch {}
  const saveCollapsed = () => { try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed])); } catch {} };

  let openCat = null; // regalo con el desplegable de categorías abierto
  let editing = null; // {ownerId, giftId|null}
  let pickedCats = new Set();

  function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  const isBought = g => g.status === 'store' || g.status === 'online' || g.status === 'received';
  const isDone = g => g.status === 'store' || g.status === 'received';

  function matches(g) {
    const st = $('#f-status').value, c = $('#f-cat').value;
    if (c && !g.cats.includes(c)) return false;
    if (st === 'none') return !g.status;
    return !st || g.status === st;
  }

  // Todas las categorías como selector: la elegida va rellena con ✓, las demás solo con borde.
  function chipHtml(c, on, attrs = '') {
    return `<button type="button" class="chip ${on ? 'on' : ''}" ${attrs} style="--cc:${c.color};--ink:${ink(c.color)}" aria-pressed="${on}">${on ? '✓ ' : ''}${esc(c.name)}</button>`;
  }

  // --- Iconos (SVG de trazo fino, a juego con el estilo suave) ---
  const svg = p => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICON = {
    edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
    chev: svg('<path d="m6 9 6 6 6-6"/>')
  };
  const editBtn = (act, label, sm) => `<button class="ibtn ${sm ? 'sm' : ''}" data-act="${act}" title="${label}" aria-label="${label}">${ICON.edit}</button>`;

  // --- Piezas de un regalo ---
  function metaHtml(g) {
    const buyer = g.buyer && live(state.buyers).find(b => b.id === g.buyer);
    const link = g.link ? ` · <a href="${esc(g.link)}" target="_blank" rel="noopener">enlace</a>` : '';
    const meta = [g.store ? '🛒 ' + esc(g.store) : '', buyer ? '🛍️ ' + esc(buyer.name) : '', g.notes ? esc(g.notes) : ''].filter(Boolean).join(' · ');
    return meta || link ? `<div class="gmeta">${meta}${link}</div>` : '';
  }
  function catsHtml(g) {
    const cats = g.cats.map(cat).filter(Boolean);
    return `<details class="catsel" data-g="${g.id}" ${openCat === g.id ? 'open' : ''}>
      <summary class="sel ${cats.length ? 'has' : ''}">${cats.length
        ? cats.map(c => `<span class="pill" style="background:${c.color};color:${ink(c.color)}">${esc(c.name)}</span>`).join('')
        : '<span class="ph">-Categoría-</span>'}</summary>
      <div class="panel">${live(state.categories).map(c =>
        `<label><input type="checkbox" class="catcb" data-cat="${c.id}" ${g.cats.includes(c.id) ? 'checked' : ''}><i style="background:${c.color}"></i>${esc(c.name)}</label>`).join('')}</div>
    </details>`;
  }
  const statusHtml = g => `<select class="sel status-sel ${g.status ? 'on st-' + g.status : ''}" aria-label="Estado">
      <option value="">-Estado-</option>
      ${STATUSES.map(([k, l]) => `<option value="${k}" ${g.status === k ? 'selected' : ''}>${l}</option>`).join('')}
    </select>`;

  // Un solo diseño de regalo: tarjeta (niños) o fila sin caja (dentro de una persona de familia).
  function giftHtml(g, flat) {
    return `<div class="gift ${flat ? 'flat' : ''} ${isDone(g) ? 'done' : isBought(g) ? 'bought' : ''}" data-id="${g.id}">
      <div class="ghead"><div class="gname">${esc(g.name)}</div>${editBtn('edit', 'Editar regalo', true)}</div>
      ${metaHtml(g)}
      <div class="controls">${catsHtml(g)}${statusHtml(g)}</div></div>`;
  }

  const head = (id, min, name, editAct, editLabel) =>
    `<div class="col-head"><button class="ibtn chev ${min ? 'closed' : ''}" data-act="toggle-col" title="${min ? 'Mostrar' : 'Minimizar'}" aria-label="${min ? 'Mostrar' : 'Minimizar'}" aria-expanded="${!min}">${ICON.chev}</button><button class="col-title" data-act="toggle-col">${esc(name)}</button>${editBtn(editAct, editLabel)}</div>`;
  const banner = (all, extra) => {
    const done = all.filter(isDone).length, bought = all.filter(isBought).length;
    const pct = all.length ? Math.round(done / all.length * 100) : 0;
    return `<div class="stats">${extra ? `<span class="sp">${extra}</span>` : ''}<span class="sp">${plural(all.length, 'regalo', 'regalos')}</span><span class="sp">${plural(bought, 'comprado', 'comprados')}</span><span class="sp ok" title="Listos: ya comprados en tienda o recibidos">${plural(done, 'listo', 'listos')}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>`;
  };
  const sec = (title, act, label) => `<div class="sec"><h2>${title}</h2><button class="addsec" data-act="${act}">${label}</button></div>`;

  function render() {
    needRender = false;
    const cats = live(state.categories);
    const fc = $('#f-cat'), cur = fc.value;
    fc.innerHTML = '<option value="">Todas las categorías</option>' +
      cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    fc.value = cats.some(c => c.id === cur) ? cur : '';
    updateFilterBtn();

    const gifts = live(state.gifts);
    $('#tip').hidden = tipDone() || gifts.length > 0;
    const kids = live(state.children).map((ch, i) => {
      const all = gifts.filter(g => g.child === ch.id);
      const shown = all.filter(matches);
      const min = collapsed.has(ch.id);
      return `<section class="col ${min ? 'collapsed' : ''}" data-child="${ch.id}" style="--c:${colorOf(ch, i)}">
        ${head(ch.id, min, ch.name, 'edit-child', 'Editar ficha')}
        ${banner(all, '')}
        ${min ? '' : `${shown.length ? `<div class="glist">${shown.map(g => giftHtml(g)).join('')}</div>` : `<div class="empty">${all.length ? 'Nada con este filtro' : 'Aún no hay regalos'}</div>`}
        <button class="add" data-act="add">＋ Añadir regalo</button>`}
      </section>`;
    });

    const people = live(state.people);
    const fams = live(state.families).map((f, i) => {
      const members = people.filter(p => p.family === f.id);
      const ids = new Set(members.map(p => p.id));
      const all = gifts.filter(g => ids.has(g.child));
      const min = collapsed.has(f.id);
      const body = members.map(p => {
        const mine = all.filter(g => g.child === p.id), shown = mine.filter(matches);
        return `<div class="person" data-person="${p.id}">
          <div class="pname"><span>${esc(p.name)}</span><small>${plural(mine.length, 'regalo', 'regalos')}</small>${editBtn('edit-person', 'Editar persona', true)}</div>
          ${shown.map(g => giftHtml(g, true)).join('')}
          <button class="linkbtn" data-act="add">＋ Añadir regalo</button>
        </div>`;
      }).join('');
      return `<section class="col fam ${min ? 'collapsed' : ''}" data-family="${f.id}" style="--c:${colorOf(f, i + 4)}">
        ${head(f.id, min, f.name, 'edit-family', 'Editar familia')}
        ${banner(all, plural(members.length, 'persona', 'personas'))}
        ${min ? '' : `${body ? `<div class="people">${body}</div>` : '<div class="empty">Añade a las personas de esta familia</div>'}
        <button class="add" data-act="add-person">＋ Añadir persona</button>`}
      </section>`;
    });
    $('#board').innerHTML = sec('Niños', 'add-child', '＋ Niño') + `<div class="grid">${kids.join('')}</div>` +
      sec('Familias', 'add-family', '＋ Familia') + `<div class="grid fams">${fams.join('')}</div>`;
  }

  // --- Aviso de primera vez (solo en este dispositivo) ---
  const TIP_KEY = 'lista-reyes-tip';
  const tipDone = () => { try { return !!localStorage.getItem(TIP_KEY); } catch { return false; } };
  $('#tip-ok').onclick = () => { try { localStorage.setItem(TIP_KEY, '1'); } catch {} $('#tip').hidden = true; };

  // --- Filtros plegables ---
  const filtersEl = $('#filters'), filterBtn = $('#btn-filter');
  function updateFilterBtn() {
    const n = ($('#f-status').value ? 1 : 0) + ($('#f-cat').value ? 1 : 0);
    filterBtn.classList.toggle('active', n > 0);
    $('#filter-count').textContent = n || '';
  }
  filterBtn.onclick = () => { filtersEl.hidden = !filtersEl.hidden; filterBtn.setAttribute('aria-expanded', !filtersEl.hidden); };

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

  // --- Tablero ---
  $('#board').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'add-child') return addChild();
    if (act === 'add-family') return addFamily();
    const col = btn.closest('.col');
    const colId = col.dataset.child || col.dataset.family;
    const personId = btn.closest('.person')?.dataset.person;
    if (act === 'toggle-col') {
      collapsed.has(colId) ? collapsed.delete(colId) : collapsed.add(colId);
      saveCollapsed(); return render();
    }
    if (act === 'edit-child') return openOwner('child', colId);
    if (act === 'edit-family') return openOwner('family', colId);
    if (act === 'edit-person') return openOwner('person', personId);
    if (act === 'add-person') return addPerson(colId);
    if (act === 'add') return openGift(personId || colId, null);
    if (act === 'edit') {
      const g = state.gifts.find(x => x.id === btn.closest('[data-id]').dataset.id);
      return openGift(g.child, g);
    }
  });
  document.addEventListener('click', e => {
    if (!openCat || e.target.closest('.catsel')) return;
    openCat = null;
    document.querySelectorAll('.catsel[open]').forEach(d => (d.open = false));
  });
  $('#board').addEventListener('toggle', e => {
    const id = e.target.dataset?.g;
    if (!id) return;
    if (e.target.open) openCat = id; else if (openCat === id) openCat = null;
  }, true);
  $('#board').addEventListener('change', e => {
    const gEl = e.target.closest('[data-id]');
    if (!gEl) return;
    const g = state.gifts.find(x => x.id === gEl.dataset.id);
    if (e.target.classList.contains('status-sel')) g.status = e.target.value;
    else if (e.target.classList.contains('catcb')) {
      const id = e.target.dataset.cat;
      g.cats = e.target.checked ? [...new Set([...g.cats, id])] : g.cats.filter(x => x !== id);
      openCat = g.id;
    } else return;
    touch(g); save(); render();
  });
  $('#f-status').onchange = $('#f-cat').onchange = render;

  // --- Diálogo de regalo ---
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
  function fillBuyers(val) {
    form.buyer.innerHTML = '<option value="">-Lo compra-</option>' +
      live(state.buyers).map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
    form.buyer.value = val;
  }
  const buyersUnedited = () => live(state.buyers).every(b => (b.u || 0) <= 1);
  function openGift(ownerId, g) {
    editing = { ownerId, giftId: g?.id || null };
    pickedCats = new Set(g?.cats || []);
    $('#gift-title').textContent = g ? 'Editar regalo' : 'Nuevo regalo para ' + ownerName(ownerId);
    form.reset();
    fillBuyers(g?.buyer || '');
    $('#buyer-names').hidden = !buyersUnedited();
    $('#more').open = !!(g && (g.store || g.link || g.notes));
    $('#gift-delete').hidden = !g;
    if (g) {
      form.name.value = g.name; form.store.value = g.store || ''; form.link.value = g.link || '';
      form.notes.value = g.notes || ''; form.status.value = g.status || '';
    }
    paintStatus();
    renderPick(); dlg.showModal();
  }
  const paintStatus = () => { form.status.className = 'sel' + (form.status.value ? ' on st-' + form.status.value : ''); };
  form.status.addEventListener('change', paintStatus);
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
      status: form.status.value, buyer: form.buyer.value, cats: [...pickedCats]
    };
    if (!data.name) return;
    const existing = editing.giftId && state.gifts.find(g => g.id === editing.giftId);
    if (existing) touch(Object.assign(existing, data));
    else state.gifts.push(mk({ id: uid(), child: editing.ownerId, ...data }));
    save(); render(); dlg.close();
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

  function addPerson(familyId) {
    const n = live(state.people).filter(p => p.family === familyId).length;
    const p = mk({ id: uid(), family: familyId, name: 'Persona ' + (n + 1) });
    state.people.push(p); save(); render();
    openOwner('person', p.id);
  }

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

  function addChild() {
    const n = live(state.children).length;
    const ch = mk({ id: uid(), name: 'Niño ' + (n + 1), color: PALETTE[n % PALETTE.length] });
    state.children.push(ch); save(); render();
    openOwner('child', ch.id);
  }
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
    const a = document.activeElement;
    return !(a && a.classList.contains('status-sel'));
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

  render();
  setStatus(syncId ? 'sync' : 'off');
  (async () => {
    await joinFromLink();
    if (syncId && DB) { startPolling(); sync(); }
  })();
})();
