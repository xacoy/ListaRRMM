(() => {
  const KEY = 'lista-reyes-v1';
  const SYNC_KEY = 'lista-reyes-sync';
  const API = 'https://jsonblob.com/api/jsonBlob';
  const POLL_MS = 6000;
  const uid = () => Math.random().toString(36).slice(2, 10);
  const now = () => Date.now();
  const $ = s => document.querySelector(s);

  const PALETTE = ['#e5484d', '#0090ff', '#30a46c', '#f5a524', '#8e4ec6', '#e93d82', '#12a594', '#f76b15'];

  // Cada elemento lleva c (creado), u (última modificación) y del (borrado, "lápida"),
  // para poder fusionar los cambios de dos personas sin pisarse.
  const defaults = () => ({
    children: [
      { id: uid(), name: 'Niño 1', color: PALETTE[0], c: 1, u: 1 },
      { id: uid(), name: 'Niño 2', color: PALETTE[1], c: 2, u: 1 }
    ],
    categories: [
      { id: 'juguetes', name: 'Juguetes', color: '#e5484d', c: 1, u: 1 },
      { id: 'ropa', name: 'Ropa', color: '#8e4ec6', c: 2, u: 1 },
      { id: 'libros', name: 'Libros', color: '#0090ff', c: 3, u: 1 },
      { id: 'juegos', name: 'Juegos', color: '#30a46c', c: 4, u: 1 },
      { id: 'otros', name: 'Otros', color: '#6b7280', c: 5, u: 1 }
    ],
    gifts: []
  });

  const normalize = d => ({
    children: Array.isArray(d?.children) ? d.children : [],
    categories: Array.isArray(d?.categories) ? d.categories : [],
    gifts: Array.isArray(d?.gifts) ? d.gifts : []
  });

  let state;
  try { state = normalize(JSON.parse(localStorage.getItem(KEY))); } catch { state = normalize(null); }
  if (!state.children.length && !state.categories.length && !state.gifts.length) state = defaults();

  const live = a => a.filter(x => !x.del);
  const touch = x => { x.u = now(); return x; };
  const mk = o => ({ ...o, c: now(), u: now() });
  const childColor = (ch, i) => ch.color || PALETTE[i % PALETTE.length];
  const cat = id => live(state.categories).find(c => c.id === id);

  let editing = null; // {childId, giftId|null}
  let pickedCats = new Set();

  function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

  function isDone(g) { return g.bought && (!g.online || g.arrived); }

  function matches(g) {
    const st = $('#f-status').value, c = $('#f-cat').value;
    if (c && !g.cats.includes(c)) return false;
    if (st === 'pending') return !g.bought;
    if (st === 'bought') return g.bought;
    if (st === 'transit') return g.bought && g.online && !g.arrived;
    if (st === 'done') return isDone(g);
    return true;
  }

  function chipHtml(c) {
    return `<span class="chip" style="background:${c.color}">${esc(c.name)}</span>`;
  }

  function giftHtml(g) {
    const cats = g.cats.map(cat).filter(Boolean);
    const color = cats[0]?.color || 'var(--accent)';
    const link = g.link ? ` · <a href="${esc(g.link)}" target="_blank" rel="noopener">enlace</a>` : '';
    const meta = [g.store ? '🛒 ' + esc(g.store) : '', g.notes ? esc(g.notes) : ''].filter(Boolean).join(' · ');
    const arrivedBtn = g.bought && g.online
      ? `<button class="tg wait ${g.arrived ? 'on' : ''}" data-act="arrived">${g.arrived ? '📦 Ha llegado' : '🚚 En camino'}</button>` : '';
    return `<div class="gift ${isDone(g) ? 'done' : ''}" style="border-left-color:${color}" data-id="${g.id}">
      <div class="ghead">
        <div class="gname">${esc(g.name)}</div>
        <button class="icon ghost" data-act="edit" title="Editar">✏️</button>
        <button class="icon ghost" data-act="del" title="Borrar">🗑️</button>
      </div>
      ${meta || link ? `<div class="gmeta">${meta}${link}</div>` : ''}
      ${cats.length ? `<div class="chips">${cats.map(chipHtml).join('')}</div>` : ''}
      <div class="toggles">
        <button class="tg ${g.bought ? 'on' : ''}" data-act="bought">${g.bought ? '✅ Comprado' : '⬜ Sin comprar'}</button>
        <button class="tg ${g.online ? 'on' : ''}" data-act="online">${g.online ? '🌐 Online' : '🏬 En tienda'}</button>
        ${arrivedBtn}
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
        <div class="stats">${all.length} ${all.length === 1 ? 'regalo' : 'regalos'} · ${all.filter(g => g.bought).length} comprados · ${done} listos</div>
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
    if (act === 'del') {
      g.del = true; touch(g); save(); render();
      return toast('Regalo borrado', () => { g.del = false; touch(g); save(); render(); });
    }
    if (act === 'bought') { g.bought = !g.bought; if (!g.bought) g.arrived = false; }
    if (act === 'online') { g.online = !g.online; if (!g.online) g.arrived = false; }
    if (act === 'arrived') g.arrived = !g.arrived;
    touch(g); save(); render();
  });
  $('#board').addEventListener('change', e => {
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
    $('#gift-cats').className = 'chips pick';
    $('#gift-cats').innerHTML = live(state.categories).map(c =>
      `<span class="chip ${pickedCats.has(c.id) ? 'on' : ''}" data-id="${c.id}" style="background:${c.color}">${esc(c.name)}</span>`).join('');
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
    if (g) {
      form.name.value = g.name; form.store.value = g.store || ''; form.link.value = g.link || '';
      form.notes.value = g.notes || ''; form.bought.checked = g.bought; form.online.checked = g.online; form.arrived.checked = g.arrived;
    }
    renderPick(); dlg.showModal();
  }
  $('#gift-cancel').onclick = () => dlg.close();
  form.addEventListener('submit', e => {
    e.preventDefault();
    const data = {
      name: form.name.value.trim(), store: form.store.value.trim(), link: form.link.value.trim(), notes: form.notes.value.trim(),
      bought: form.bought.checked, online: form.online.checked, arrived: form.arrived.checked, cats: [...pickedCats]
    };
    if (!data.name) return;
    if (!data.bought || !data.online) data.arrived = false;
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
          i >= 0 ? (state[k][i] = item) : state[k].push(item);
        });
      }
      save(); render();
    } catch { alert('Archivo no válido'); }
  };

  // ===== Sincronización (JSONBlob) =====
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

  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };

  async function sync() {
    if (!syncId) return;
    if (syncing) { again = true; return; }
    syncing = true;
    try {
      const r = await fetch(`${API}/${syncId}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (r.status === 404) { setStatus('missing'); return; }
      if (!r.ok) throw new Error('GET ' + r.status);
      const remote = normalize(await r.json());
      const merged = merge(state, remote);
      const changedLocal = sig(merged) !== sig(state);
      const changedRemote = sig(merged) !== sig(remote);
      if (changedLocal) {
        state = merged;
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
        canRender() ? render() : (needRender = true);
      }
      if (changedRemote) {
        const p = await fetch(`${API}/${syncId}`, { method: 'PUT', headers, body: JSON.stringify(state) });
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
    if (!m || m[1] === syncId) return;
    syncId = m[1];
    try { localStorage.setItem(SYNC_KEY, syncId); } catch {}
    setStatus('sync');
    // Si aquí no hay regalos propios, adopta la lista compartida tal cual (evita fichas duplicadas).
    if (!live(state.gifts).length) {
      try {
        const r = await fetch(`${API}/${syncId}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (r.ok) {
          const remote = normalize(await r.json());
          if (remote.children.length || remote.categories.length) { state = remote; save(); render(); }
        }
      } catch {}
    }
  }

  $('#btn-share').onclick = async () => {
    try {
      if (!syncId) {
        setStatus('sync');
        const r = await fetch(API, { method: 'POST', headers, body: JSON.stringify(state) });
        if (!r.ok) throw new Error('POST ' + r.status);
        const loc = r.headers.get('Location') || r.headers.get('x-jsonblob') || '';
        const id = loc.split('/').pop();
        if (!id) throw new Error('sin id');
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
    if (syncId) { startPolling(); sync(); }
  })();
})();
