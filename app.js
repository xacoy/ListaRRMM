(() => {
  const KEY = 'lista-reyes-v1';
  const SYNC_KEY = 'lista-reyes-sync';
  // URL de la Realtime Database de Firebase (sin barra final), p. ej. https://xxxx-default-rtdb.europe-west1.firebasedatabase.app
  const DB = 'https://listarrmm-default-rtdb.europe-west1.firebasedatabase.app';
  const listUrl = id => `${DB}/listas/${id}.json`;
  const POLL_MS = 6000;
  const uid = () => Math.random().toString(36).slice(2, 10);
  // Reloj híbrido: nunca va por detrás de lo ya visto, así un reloj atrasado no hace perder cambios.
  let clock = 0;
  const now = () => (clock = Math.max(Date.now(), clock + 1));
  const seen = s => ['children', 'categories', 'gifts'].forEach(k => s[k].forEach(i => { if (i.u > clock) clock = i.u; }));
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
    gifts: []
  });

  // Estado único del regalo. Los datos antiguos (bought/online/arrived) se convierten al leerlos.
  const STATUSES = [['idea', '💡 Idea'], ['store', '🏬 Comprado en tienda'], ['online', '🌐 Comprado online'], ['received', '📦 Recibido']];
  const statusOf = g => g.status ?? (g.bought === undefined ? '' : !g.bought ? 'idea' : !g.online ? 'store' : g.arrived ? 'received' : 'online');

  const normalize = d => ({
    children: (Array.isArray(d?.children) ? d.children : []).map(soften),
    categories: (Array.isArray(d?.categories) ? d.categories : []).map(soften),
    // Firebase no guarda arrays vacíos, así que cats puede venir sin definir.
    gifts: (Array.isArray(d?.gifts) ? d.gifts : []).map(g => ({ ...g, cats: g.cats || [], status: statusOf(g) }))
  });

  let state;
  try { state = normalize(JSON.parse(localStorage.getItem(KEY))); } catch { state = normalize(null); }
  if (!state.children.length && !state.categories.length && !state.gifts.length) state = defaults();
  seen(state);

  const live = a => a.filter(x => !x.del);
  const touch = x => { x.u = now(); return x; };
  const mk = o => ({ ...o, c: now(), u: now() });
  const childColor = (ch, i) => ch.color || PALETTE[i % PALETTE.length];
  const cat = id => live(state.categories).find(c => c.id === id);

  let openCat = null; // regalo con el desplegable de categorías abierto
  let editing = null; // {childId, giftId|null}
  let pickedCats = new Set();

  function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

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

  function giftHtml(g) {
    const cats = g.cats.map(cat).filter(Boolean);
    const color = cats[0]?.color || 'var(--accent)';
    const link = g.link ? ` · <a href="${esc(g.link)}" target="_blank" rel="noopener">enlace</a>` : '';
    const meta = [g.store ? '🛒 ' + esc(g.store) : '', g.notes ? esc(g.notes) : ''].filter(Boolean).join(' · ');
    return `<div class="gift ${isDone(g) ? 'done' : ''}" style="border-left-color:${color}" data-id="${g.id}">
      <div class="ghead">
        <div class="gname">${esc(g.name)}</div>
        <button class="icon ghost" data-act="edit" title="Editar">✏️</button>
      </div>
      ${meta || link ? `<div class="gmeta">${meta}${link}</div>` : ''}
      <div class="controls">
        <details class="catsel" data-g="${g.id}" ${openCat === g.id ? 'open' : ''}>
          <summary class="sel ${cats.length ? 'has' : ''}">${cats.length
            ? cats.map(c => `<span class="pill" style="background:${c.color};color:${ink(c.color)}">${esc(c.name)}</span>`).join('')
            : '<span class="ph">-Categoría-</span>'}</summary>
          <div class="panel">${live(state.categories).map(c =>
            `<label><input type="checkbox" class="catcb" data-cat="${c.id}" ${g.cats.includes(c.id) ? 'checked' : ''}><i style="background:${c.color}"></i>${esc(c.name)}</label>`).join('')}</div>
        </details>
        <select class="sel status-sel ${g.status ? 'on' : ''}" aria-label="Estado">
          <option value="">-Estado-</option>
          ${STATUSES.map(([k, l]) => `<option value="${k}" ${g.status === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div></div>`;
  }

  function render() {
    needRender = false;
    const cats = live(state.categories);
    const fc = $('#f-cat'), cur = fc.value;
    fc.innerHTML = '<option value="">Todas las categorías</option>' +
      cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    fc.value = cats.some(c => c.id === cur) ? cur : '';

    const gifts = live(state.gifts);
    $('#board').innerHTML = live(state.children).map((ch, i) => {
      const all = gifts.filter(g => g.child === ch.id);
      const shown = all.filter(matches);
      const done = all.filter(isDone).length;
      const pct = all.length ? Math.round(done / all.length * 100) : 0;
      return `<section class="col" data-child="${ch.id}" style="--c:${childColor(ch, i)}">
        <div class="col-head"><input class="col-name" value="${esc(ch.name)}" aria-label="Nombre" maxlength="30"><input type="color" class="col-color" value="${childColor(ch, i)}" title="Color de la ficha" aria-label="Color de la ficha"><button class="icon ghost" data-act="del-child" title="Eliminar ficha">🗑️</button></div>
        <div class="stats">${all.length} ${all.length === 1 ? 'regalo' : 'regalos'} · ${all.filter(isBought).length} comprados · ${done} listos</div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        ${shown.length ? shown.map(giftHtml).join('') : `<div class="empty">${all.length ? 'Nada con este filtro' : 'Aún no hay regalos'}</div>`}
        <button class="add" data-act="add">＋ Añadir regalo</button>
      </section>`;
    }).join('');
  }

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
    const childId = btn.closest('.col').dataset.child;
    const gEl = btn.closest('.gift');
    const act = btn.dataset.act;
    if (act === 'add') return openGift(childId, null);
    if (act === 'del-child') {
      const ch = live(state.children).find(c => c.id === childId);
      const owned = live(state.gifts).filter(g => g.child === childId);
      if (owned.length && !confirm(`¿Eliminar la ficha de ${ch.name} y sus ${owned.length} regalos?`)) return;
      [ch, ...owned].forEach(x => { x.del = true; touch(x); });
      save(); render();
      return toast('Ficha eliminada', () => { [ch, ...owned].forEach(x => { x.del = false; touch(x); }); save(); render(); });
    }
    const g = state.gifts.find(x => x.id === gEl.dataset.id);
    if (act === 'edit') return openGift(childId, g);
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
    const gEl = e.target.closest('.gift');
    if (gEl && (e.target.classList.contains('status-sel') || e.target.classList.contains('catcb'))) {
      const g = state.gifts.find(x => x.id === gEl.dataset.id);
      if (e.target.classList.contains('status-sel')) g.status = e.target.value;
      else {
        const id = e.target.dataset.cat;
        g.cats = e.target.checked ? [...new Set([...g.cats, id])] : g.cats.filter(x => x !== id);
        openCat = g.id;
      }
      touch(g); save(); return render();
    }
    const isName = e.target.classList.contains('col-name');
    if (!isName && !e.target.classList.contains('col-color')) return;
    const ch = state.children.find(c => c.id === e.target.closest('.col').dataset.child);
    if (!isName) { ch.color = e.target.value; touch(ch); save(); return render(); }
    ch.name = e.target.value.trim() || ch.name; touch(ch); save(); render();
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
  function openGift(childId, g) {
    editing = { childId, giftId: g?.id || null };
    pickedCats = new Set(g?.cats || []);
    $('#gift-title').textContent = g ? 'Editar regalo' : 'Nuevo regalo para ' + live(state.children).find(c => c.id === childId).name;
    form.reset();
    $('#gift-delete').hidden = !g;
    if (g) {
      form.name.value = g.name; form.store.value = g.store || ''; form.link.value = g.link || '';
      form.notes.value = g.notes || ''; form.status.value = g.status || '';
    }
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
      status: form.status.value, cats: [...pickedCats]
    };
    if (!data.name) return;
    const existing = editing.giftId && state.gifts.find(g => g.id === editing.giftId);
    if (existing) touch(Object.assign(existing, data));
    else state.gifts.push(mk({ id: uid(), child: editing.childId, ...data }));
    save(); render(); dlg.close();
  });

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

  $('#btn-child').onclick = () => {
    const n = live(state.children).length;
    state.children.push(mk({ id: uid(), name: 'Niño ' + (n + 1), color: PALETTE[n % PALETTE.length] }));
    save(); render();
    document.querySelector('.col:last-child .col-name').select();
  };

  // --- Exportar / importar ---
  $('#btn-export').onclick = () => {
    const out = { children: live(state.children), categories: live(state.categories), gifts: live(state.gifts) };
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
      for (const k of ['children', 'categories', 'gifts']) {
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

  const sig = s => ['children', 'categories', 'gifts'].map(k =>
    s[k].map(i => i.id + ':' + (i.u || 0) + (i.del ? 'd' : '')).sort().join(',')).join('|');

  function mergeList(a, b) {
    const m = new Map();
    for (const i of [...a, ...b]) {
      const o = m.get(i.id);
      if (!o || (i.u || 0) > (o.u || 0)) m.set(i.id, i);
    }
    return [...m.values()].sort((x, y) => (x.c || 0) - (y.c || 0));
  }
  const merge = (a, b) => ({
    children: mergeList(a.children, b.children),
    categories: mergeList(a.categories, b.categories),
    gifts: mergeList(a.gifts, b.gifts)
  });

  function canRender() {
    const a = document.activeElement;
    return !(a && (a.classList.contains('col-name') || a.classList.contains('col-color')));
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
