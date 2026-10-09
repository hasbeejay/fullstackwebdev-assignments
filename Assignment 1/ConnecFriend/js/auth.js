/* auth.js — classroom demo login. NOT real security: passwords sit in browser storage. */
(function () {
  const CF = (window.CF = window.CF || {});

  function login(username, password) {
    const name = String(username || '').trim().toLowerCase();
    const secret = String(password || '');
    if (!name || !secret) return { ok: false, message: 'Enter both a username and a password.' };

    const user = CF.Store.get().users.find((u) => u.username.toLowerCase() === name);
    if (!user || user.password !== secret) {
      return { ok: false, message: 'Incorrect username or password. Try one of the demo accounts below.' };
    }

    CF.Store.update((state) => {
      const target = state.users.find((u) => u.id === user.id);
      target.lastLoginAt = Date.now();
    });
    CF.Store.setSessionUserId(user.id);
    return { ok: true, userId: user.id };
  }

  function logout() {
    CF.Store.setSessionUserId(null);
  }

  /** Returns the logged-in user object, or null (also when the stored id no longer exists). */
  function currentUser() {
    const id = CF.Store.getSessionUserId();
    if (!id) return null;
    const user = CF.Store.get().users.find((u) => u.id === id);
    if (!user) {
      CF.Store.setSessionUserId(null);
      return null;
    }
    return user;
  }

  CF.Auth = { login, logout, currentUser };
})();
