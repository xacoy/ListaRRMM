(() => {
  const KEY = 'lista-reyes-v1';
  const uid = () => Math.random().toString(36).slice(2, 10);
  const $ = s => document.querySelector(s);

  const defaults = () => ({
    children: [{ id: 'iris', name: 'Iris' }, { id: 'laia', name: 'Laia' }],
    categories: [
      { id: 'juguetes', name: 'Juguetes', color: '#e5484d' },
      { id: 'ropa', name: 'Ropa', color: '#8e4ec6' },
      { id: 'libros', name: 'Libros', color: '#0090ff' },
      { id: 'juegos', name: 'Juegos', color: '#30a46c' },
      { id: 'otros', name: 'Otros', color: '#6b7280' }
    ],
    gifts: []
  });

  let state;
  try { state = JSON.parse(localStorage.getItem(KEY)) || defaults(); } catch { state = defaults(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  const cat = id => state.categories.find(c => c.id === id);

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
    // filtro de categorías
    const fc = $('#f-cat'), cur = fc.value;
    fc.innerHTML = '<option value="">Todas las categorías</option>' +
      state.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    fc.value = state.categories.some(c => c.id === cur) ? cur : '';

    $('#board').innerHTML = state.children.map(ch => {
      const all = state.gifts.filter(g => g.child === ch.id);
      const shown = all.filter(matches);
      const done = all.filter(isDone).length;
      const pct = all.length ? Math.round(done / all.length * 100) : 0;
      return `<section class="col" data-child="${ch.id}">
        <div class="col-head"><input class="col-name" value="${esc(ch.name)}" aria-label="Nombre" maxlength="30"></div>
        <div class="stats">${all.length} ${all.length === 1 ? "regalo" : "regalos"} · ${all.filter(g => g.bought).length} comprados · ${done} listos</div>
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
    const g = state.gifts.find(x => x.id === gEl.dataset.id);
    if (act === 'edit') return openGift(childId, g);
    if (act === 'del') {
      const idx = state.gifts.indexOf(g);
      state.gifts.splice(idx, 1); save(); render();
      return toast('Regalo borrado', () => { state.gifts.splice(idx, 0, g); save(); render(); });
    }
    if (act === 'bought') { g.bought = !g.bought; if (!g.bought) g.arrived = false; }
    if (act === 'online') { g.online = !g.online; if (!g.online) g.arrived = false; }
    if (act === 'arrived') g.arrived = !g.arrived;
    save(); render();
  });
  $('#board').addEventListener('change', e => {
    if (!e.target.classList.contains('col-name')) return;
    const ch = state.children.find(c => c.id === e.target.closest('.col').dataset.child);
    ch.name = e.target.value.trim() || ch.name; save(); render();
  });
  $('#f-status').onchange = $('#f-cat').onchange = render;

  // --- Diálogo de regalo ---
  const dlg = $('#dlg-gift'), form = $('#form-gift');
  function renderPick() {
    $('#gift-cats').className = 'chips pick';
    $('#gift-cats').innerHTML = state.categories.map(c =>
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
    $('#gift-title').textContent = g ? 'Editar regalo' : 'Nuevo regalo para ' + state.children.find(c => c.id === childId).name;
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
    if (editing.giftId) Object.assign(state.gifts.find(g => g.id === editing.giftId), data);
    else state.gifts.push({ id: uid(), child: editing.childId, ...data });
    save(); render(); dlg.close();
  });

  // --- Categorías ---
  const dc = $('#dlg-cats');
  function renderCats() {
    $('#cat-list').innerHTML = state.categories.map(c => `<div class="catrow" data-id="${c.id}">
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
    save();
  });
  $('#cat-list').addEventListener('click', e => {
    if (!e.target.closest('[data-del]')) return;
    const id = e.target.closest('.catrow').dataset.id;
    state.categories = state.categories.filter(c => c.id !== id);
    state.gifts.forEach(g => (g.cats = g.cats.filter(x => x !== id)));
    save(); renderCats();
  });
  $('#form-cat').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    state.categories.push({ id: uid(), name: f.name.value.trim(), color: f.color.value });
    f.reset(); save(); renderCats();
  });

  // --- Exportar / importar ---
  $('#btn-export').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    a.download = 'lista-reyes.json'; a.click(); URL.revokeObjectURL(a.href);
  };
  $('#file-import').onchange = async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!Array.isArray(d.children) || !Array.isArray(d.categories) || !Array.isArray(d.gifts)) throw 0;
      if (!confirm('Esto reemplaza la lista actual. ¿Continuar?')) return;
      state = d; save(); render();
    } catch { alert('Archivo no válido'); }
  };

  render();
})();
