/* ui.js — presentation helpers (escaping, avatars, time, audio feedback, glass toasts & dialogs). */
(function () {
  const CF = (window.CF = window.CF || {});

  const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  /** Escape any user-provided text before placing it in HTML. */
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ENTITIES[c]);
  }

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  /** Initials avatar with glass gradient and optional real-time online pulse badge. */
  function avatar(user, size, options) {
    const safeColor = user && /^#[0-9a-f]{3,8}$/i.test(user.color || '') ? user.color : '#6366f1';
    const label = user ? initials(user.fullName) : '?';
    const s = size || 'md';
    const isOnline = options && options.online !== undefined
      ? Boolean(options.online)
      : Boolean(CF.Messaging && CF.Messaging.isUserOnline && user && CF.Messaging.isUserOnline(user.id));
    const showBadge = options && options.badge !== false && isOnline;
    const badgeHtml = showBadge
      ? '<span class="cf-avatar-status" title="Active now" aria-label="Online"></span>'
      : '';

    return '<span class="cf-avatar-wrap cf-wrap-' + esc(s) + '">' +
      '<span class="cf-avatar cf-avatar-' + esc(s) + '" style="--avatar-color:' + esc(safeColor) + '" aria-hidden="true">' +
      esc(label) + '</span>' + badgeHtml + '</span>';
  }

  function timeAgo(timestamp) {
    const time = Number(timestamp);
    if (!time || !isFinite(time)) return 'unknown time';
    const diff = Date.now() - time;
    if (diff < 0) return 'just now';
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes + (minutes === 1 ? 'm ago' : 'm ago');
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + (hours === 1 ? 'h ago' : 'h ago');
    const days = Math.floor(hours / 24);
    if (days < 7) return days + (days === 1 ? 'd ago' : 'd ago');
    return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function clockTime(timestamp) {
    const time = Number(timestamp);
    if (!time || !isFinite(time)) return '';
    return new Date(time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function dayLabel(timestamp) {
    const date = new Date(Number(timestamp));
    if (isNaN(date.getTime())) return '';
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  /** Soft pleasant harmonic web audio chime for live messages without external files. */
  let audioContext = null;
  function playChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContext) audioContext = new AudioCtx();
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      const now = audioContext.currentTime;
      // Tone 1
      const osc1 = audioContext.createOscillator();
      const gain1 = audioContext.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1318.5, now + 0.08);
      gain1.gain.setValueAtTime(0.06, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc1.connect(gain1);
      gain1.connect(audioContext.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      // Tone 2
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1760, now + 0.08);
      gain2.gain.setValueAtTime(0.05, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(audioContext.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.48);
    } catch (e) {
      /* safe fallback if autoplay blocked */
    }
  }

  /** Aesthetic glassmorphic toast notification. */
  function toast(message, type, options) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const kind = type || 'info';
    const icons = {
      success: 'bi-check-circle-fill',
      danger: 'bi-exclamation-octagon-fill',
      info: 'bi-lightning-charge-fill',
      live: 'bi-broadcast-pin',
    };
    const element = document.createElement('div');
    element.className = 'toast cf-toast cf-toast-' + esc(kind) + ' cf-glass';
    element.setAttribute('role', kind === 'danger' ? 'alert' : 'status');
    element.setAttribute('aria-live', kind === 'danger' ? 'assertive' : 'polite');
    
    let actionBtn = '';
    if (options && options.actionUrl) {
      actionBtn = '<a href="' + esc(options.actionUrl) + '" class="btn btn-sm btn-outline-light ms-2 px-2 py-0" style="font-size:0.75rem;">' + esc(options.actionLabel || 'View') + '</a>';
    }

    element.innerHTML =
      '<div class="d-flex align-items-center gap-2 p-3">' +
      '<span class="cf-toast-icon"><i class="bi ' + (icons[kind] || icons.info) + '" aria-hidden="true"></i></span>' +
      '<div class="flex-grow-1 cf-toast-text">' + esc(message) + '</div>' +
      actionBtn +
      '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Dismiss notification"></button>' +
      '</div>';

    container.appendChild(element);
    if (window.bootstrap && window.bootstrap.Toast) {
      const instance = new window.bootstrap.Toast(element, { delay: kind === 'danger' ? 6500 : 4000 });
      element.addEventListener('hidden.bs.toast', () => element.remove());
      instance.show();
    } else {
      element.classList.add('show');
      window.setTimeout(() => element.remove(), 4200);
    }
  }

  /** Styled glassmorphism confirmation dialog. */
  function confirmDialog(options) {
    return new Promise((resolve) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'modal fade cf-modal-backdrop';
      wrapper.tabIndex = -1;
      wrapper.setAttribute('aria-labelledby', 'confirm-title');
      wrapper.innerHTML =
        '<div class="modal-dialog modal-dialog-centered">' +
        '<div class="modal-content cf-card cf-glass-card cf-modal">' +
        '<div class="modal-header border-0 pb-0">' +
        '<h2 class="modal-title h5 text-light" id="confirm-title">' + esc(options.title) + '</h2>' +
        '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
        '</div>' +
        '<div class="modal-body text-body-secondary py-3">' + esc(options.message) + '</div>' +
        '<div class="modal-footer border-0 pt-0 gap-2">' +
        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>' +
        '<button type="button" class="btn ' + (options.danger ? 'btn-danger' : 'btn-primary') + '" data-confirm>' +
        esc(options.confirmText || 'Confirm') + '</button>' +
        '</div>' +
        '</div></div>';

      document.body.appendChild(wrapper);
      const modal = new window.bootstrap.Modal(wrapper);
      let confirmed = false;
      wrapper.querySelector('[data-confirm]').addEventListener('click', () => {
        confirmed = true;
        modal.hide();
      });
      wrapper.addEventListener('hidden.bs.modal', () => {
        modal.dispose();
        wrapper.remove();
        resolve(confirmed);
      });
      modal.show();
    });
  }

  function emptyState(icon, title, text) {
    return '<div class="cf-empty">' +
      '<div class="cf-empty-icon-wrap"><i class="bi ' + esc(icon) + '" aria-hidden="true"></i></div>' +
      '<h3 class="h6 cf-empty-title">' + esc(title) + '</h3>' +
      '<p class="cf-empty-desc">' + esc(text) + '</p>' +
      '</div>';
  }

  CF.UI = { esc, initials, avatar, timeAgo, clockTime, dayLabel, playChime, toast, confirmDialog, emptyState };
})();
