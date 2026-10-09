/* storage.js — the only module that touches localStorage / sessionStorage. */
(function () {
  const CF = (window.CF = window.CF || {});

  const STATE_KEY = 'connecfriend.state.v3';
  const SESSION_KEY = 'connecfriend.session';
  const COLLECTIONS = ['users', 'friendships', 'friendRequests', 'posts', 'reactions', 'ratings', 'messages'];

  let cachedRaw = null;
  let cachedState = null;
  let memoryRaw = null; // used when browser storage is blocked
  let recoveredFromBadData = false;

  function readRaw() {
    try {
      return window.localStorage.getItem(STATE_KEY);
    } catch (error) {
      return memoryRaw;
    }
  }

  function writeRaw(raw) {
    try {
      window.localStorage.setItem(STATE_KEY, raw);
    } catch (error) {
      memoryRaw = raw; // storage blocked or full: keep working in memory for this page
    }
  }

  /** Light structural validation so malformed storage never reaches the UI. */
  function isValidState(state) {
    if (!state || typeof state !== 'object' || state.version !== 3) return false;
    if (!COLLECTIONS.every((name) => Array.isArray(state[name]))) return false;
    return state.users.length > 0 && state.users.every((u) => u && typeof u.id === 'string' && typeof u.username === 'string' && Array.isArray(u.ignoredUserIds));
  }

  function save(state) {
    const raw = JSON.stringify(state);
    writeRaw(raw);
    cachedRaw = raw;
    cachedState = state;
  }

  function resetToSeed() {
    const fresh = CF.Data.createSeed(Date.now());
    save(fresh);
    return fresh;
  }

  /** Returns the current state. Treat the result as read-only; use update() to change data. */
  function get() {
    const raw = readRaw();
    if (raw && raw === cachedRaw && cachedState) return cachedState;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (isValidState(parsed)) {
          cachedRaw = raw;
          cachedState = parsed;
          return parsed;
        }
      } catch (error) {
        /* fall through to reseed */
      }
      recoveredFromBadData = true;
    }
    return resetToSeed();
  }

  /**
   * Read-modify-write. The mutator receives a fresh copy; return {ok:false,...} to abort without saving.
   * Re-reading before each write keeps two tabs of the same browser from overwriting each other.
   */
  function update(mutator) {
    const draft = JSON.parse(JSON.stringify(get()));
    const result = mutator(draft);
    if (result && result.ok === false) return result;
    save(draft);
    return result === undefined ? { ok: true } : result;
  }

  function newId(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function wasRecovered() {
    const flag = recoveredFromBadData;
    recoveredFromBadData = false;
    return flag;
  }

  /* The session lives in sessionStorage so two tabs can be logged in as different users. */
  function getSessionUserId() {
    try {
      return window.sessionStorage.getItem(SESSION_KEY);
    } catch (error) {
      return null;
    }
  }
  function setSessionUserId(userId) {
    try {
      if (userId) window.sessionStorage.setItem(SESSION_KEY, userId);
      else window.sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {
      /* ignore: session just will not survive a refresh */
    }
  }

  /* Small helpers for non-state preferences (relay settings). */
  function readPref(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }
  function writePref(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      /* ignore */
    }
  }

  CF.Store = { STATE_KEY, get, update, reset: resetToSeed, newId, wasRecovered, getSessionUserId, setSessionUserId, readPref, writePref };
})();
