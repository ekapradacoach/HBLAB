/* ════════════════════════════════════════════════════════════════
   notifs.js — Sistema de notificaciones in-app compartido (Sesión 58)
   ════════════════════════════════════════════════════════════════
   Requiere: supabase.js (cliente global `sb`) ya cargado + currentUser
   autenticado. Uso: en cada panel, después del auth, llamar
   `initNotifs(currentUser)`. El módulo:

   - Inyecta CSS + HTML del bell+dropdown al primer .nav-right del DOM.
   - Carga las últimas 10 notificaciones del usuario.
   - Renderiza badge con count de no leídas.
   - Suscribe a INSERTs vía Supabase Realtime para updates en vivo.
   - Maneja click en notif (mark read + navegar a link).
   - Maneja "Marcar todas como leídas".

   API global expuesta: window.initNotifs(user), window.toggleNotifsDropdown,
   window.onNotifClick, window.markAllNotifsRead.
══════════════════════════════════════════════════════════════════════ */
(function() {
  let _notifsUser    = null;
  let _notifsCache   = [];   // últimas 10 notifs en memoria
  let _notifsChannel = null;

  // ── CSS injection (idempotente) ─────────────────────────────────
  function ensureBellCss() {
    if (document.getElementById('notif-bell-css')) return;
    const style = document.createElement('style');
    style.id = 'notif-bell-css';
    style.textContent = `
      .notif-bell-wrap { position: relative; display: inline-block; }
      .notif-bell-btn {
        background: transparent; border: none; cursor: pointer;
        font-size: 1.1rem; line-height: 1; padding: 7px 9px;
        border-radius: 8px; position: relative; color: inherit;
        transition: background 0.15s;
      }
      .notif-bell-btn:hover { background: rgba(255,255,255,0.06); }
      .notif-badge {
        position: absolute; top: 2px; right: 2px;
        min-width: 17px; height: 17px; padding: 0 5px;
        background: #ef4444; color: #fff;
        font-size: 0.64rem; font-weight: 800;
        border-radius: 100px;
        display: inline-flex; align-items: center; justify-content: center;
        border: 2px solid #243042;
      }
      .notif-dropdown {
        position: absolute; right: 0; top: calc(100% + 8px);
        z-index: 1000; width: 340px; max-width: 92vw;
        background: #243042; border: 1px solid #2f3e52;
        border-radius: 12px; box-shadow: 0 12px 36px rgba(0,0,0,0.55);
        overflow: hidden; font-family: 'Inter', sans-serif;
      }
      .notif-dropdown-head {
        padding: 13px 18px; border-bottom: 1px solid #2f3e52;
        font-size: 0.76rem; font-weight: 700; letter-spacing: 0.07em;
        text-transform: uppercase; color: #94A3B8;
        background: rgba(0,0,0,0.15);
      }
      .notif-list { max-height: 420px; overflow-y: auto; }
      .notif-item {
        display: block; width: 100%;
        padding: 12px 18px; border: none; outline: none;
        border-bottom: 1px solid rgba(47,62,82,0.45);
        border-left: 3px solid transparent;
        background: transparent; text-align: left; cursor: pointer;
        color: #fff; font-family: inherit;
        transition: background 0.15s;
      }
      .notif-item:last-child { border-bottom: none; }
      .notif-item:hover { background: rgba(255,255,255,0.04); }
      .notif-item.unread {
        border-left-color: #C8E600;
        background: rgba(200,230,0,0.045);
      }
      .notif-item-title { font-size: 0.85rem; font-weight: 700; margin-bottom: 3px; line-height: 1.3; }
      .notif-item-body { font-size: 0.78rem; color: #94A3B8; line-height: 1.45; margin-bottom: 5px; }
      .notif-item-date { font-size: 0.7rem; color: #94A3B8; opacity: 0.8; }
      .notif-empty {
        padding: 30px 18px; text-align: center;
        color: #94A3B8; font-size: 0.85rem; font-style: italic;
      }
      .notif-dropdown-foot {
        padding: 10px 16px; border-top: 1px solid #2f3e52;
        background: rgba(0,0,0,0.2);
      }
      .notif-mark-all {
        width: 100%; background: transparent; border: none;
        color: #94A3B8; cursor: pointer; font-family: inherit;
        font-size: 0.78rem; font-weight: 600; padding: 4px 0;
        transition: color 0.15s;
      }
      .notif-mark-all:hover { color: #C8E600; }
    `;
    document.head.appendChild(style);
  }

  // ── HTML injection (al primer .nav-right encontrado) ─────────────
  function ensureBellDom() {
    if (document.getElementById('notif-bell-wrap')) return;
    const navRight = document.querySelector('.nav-right');
    if (!navRight) return;

    const wrap = document.createElement('div');
    wrap.id = 'notif-bell-wrap';
    wrap.className = 'notif-bell-wrap';
    wrap.innerHTML = `
      <button id="notif-bell-btn" class="notif-bell-btn" onclick="toggleNotifsDropdown(event)" title="Notificaciones" aria-label="Notificaciones">
        🔔
        <span id="notif-badge" class="notif-badge" style="display:none">0</span>
      </button>
      <div id="notif-dropdown" class="notif-dropdown" style="display:none" onclick="event.stopPropagation()">
        <div class="notif-dropdown-head">Notificaciones</div>
        <div id="notif-list" class="notif-list">
          <div class="notif-empty">Cargando…</div>
        </div>
        <div class="notif-dropdown-foot">
          <button class="notif-mark-all" onclick="markAllNotifsRead()">Marcar todas como leídas</button>
        </div>
      </div>
    `;
    // Insertar como primer hijo del .nav-right (a la izquierda del email)
    navRight.insertBefore(wrap, navRight.firstChild);
  }

  // ── Helpers ─────────────────────────────────────────────────────
  function relativeTime(iso) {
    if (!iso) return '';
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diff = Math.max(0, now - then);
    const sec  = Math.floor(diff / 1000);
    if (sec < 60) return 'hace un momento';
    const min  = Math.floor(sec / 60);
    if (min < 60) return `hace ${min} min`;
    const hrs  = Math.floor(min / 60);
    if (hrs < 24) return `hace ${hrs} h`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'ayer';
    if (days < 7)   return `hace ${days} días`;
    return new Date(iso).toLocaleDateString('es-AR', { day:'2-digit', month:'short', year:'numeric' });
  }

  function escNotif(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ── Render del dropdown ──────────────────────────────────────────
  function renderNotifs() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    if (!_notifsCache.length) {
      list.innerHTML = '<div class="notif-empty">No tenés notificaciones nuevas</div>';
      return;
    }
    list.innerHTML = _notifsCache.map(n => {
      const rawBody = n.body || '';
      const body = rawBody.length > 60 ? rawBody.slice(0, 60).trim() + '…' : rawBody;
      return `
        <button class="notif-item ${n.read ? '' : 'unread'}" onclick="onNotifClick('${escNotif(n.id)}')">
          <div class="notif-item-title">${escNotif(n.title || '(sin título)')}</div>
          ${body ? `<div class="notif-item-body">${escNotif(body)}</div>` : ''}
          <div class="notif-item-date">${escNotif(relativeTime(n.created_at))}</div>
        </button>`;
    }).join('');
  }

  function updateBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    const unread = _notifsCache.filter(n => !n.read).length;
    if (unread > 0) {
      badge.textContent = unread > 9 ? '9+' : String(unread);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  // ── Carga inicial: últimas 10 ───────────────────────────────────
  async function loadNotifs() {
    if (!_notifsUser) return;
    const { data, error } = await sb.from('notifications')
      .select('id, title, body, link, read, created_at')
      .eq('user_id', _notifsUser.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) { console.warn('loadNotifs:', error); return; }
    _notifsCache = data || [];
    renderNotifs();
    updateBadge();
  }

  // ── Click en una notif: mark read + navegar a link ──────────────
  window.onNotifClick = async function(id) {
    const notif = _notifsCache.find(n => n.id === id);
    if (!notif) return;
    if (!notif.read) {
      const { error } = await sb.from('notifications').update({ read: true }).eq('id', id);
      if (!error) {
        notif.read = true;
        renderNotifs();
        updateBadge();
      }
    }
    if (notif.link) window.location.href = notif.link;
  };

  // ── Marcar todas como leídas ────────────────────────────────────
  window.markAllNotifsRead = async function() {
    if (!_notifsUser) return;
    const { error } = await sb.from('notifications')
      .update({ read: true })
      .eq('user_id', _notifsUser.id)
      .eq('read', false);
    if (error) { console.warn('markAllNotifsRead:', error); return; }
    _notifsCache.forEach(n => { n.read = true; });
    renderNotifs();
    updateBadge();
  };

  // ── Toggle dropdown ─────────────────────────────────────────────
  window.toggleNotifsDropdown = function(ev) {
    if (ev) ev.stopPropagation();
    const dd = document.getElementById('notif-dropdown');
    if (!dd) return;
    dd.style.display = (dd.style.display === 'none' || !dd.style.display) ? 'block' : 'none';
  };

  // ── Realtime subscription a INSERTs ─────────────────────────────
  function subscribe() {
    if (_notifsChannel) return;
    _notifsChannel = sb.channel('notifs-' + _notifsUser.id)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${_notifsUser.id}`,
      }, payload => {
        if (payload && payload.new) {
          _notifsCache.unshift(payload.new);
          if (_notifsCache.length > 10) _notifsCache.length = 10;
          renderNotifs();
          updateBadge();
        }
      })
      .subscribe();
  }

  // ── Click outside cierra el dropdown ────────────────────────────
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('notif-bell-wrap');
    if (!wrap || wrap.contains(e.target)) return;
    const dd = document.getElementById('notif-dropdown');
    if (dd) dd.style.display = 'none';
  });

  // ── API pública ────────────────────────────────────────────────
  window.initNotifs = function(user) {
    if (!user || !user.id) return;
    _notifsUser = user;
    ensureBellCss();
    ensureBellDom();
    loadNotifs();
    subscribe();
  };
})();
