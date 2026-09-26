(function (root) {
  "use strict";

  // Session module: owns who is signed in. It knows which portal the URL asks for, keeps one session per
  // portal in storage, silently signs Players and Visitors back in, and signs out. The rest of the app
  // only asks it who is signed in.

  // Storage keys already in people's browsers; they must not change.
  const LEGACY_SESSION_KEY = "ac-pickle-score-auth-v2";
  const SESSION_KEYS = {
    admin: "ac-pickle-score-auth-v2-admin",
    player: "ac-pickle-score-auth-v2-player",
    visitor: "ac-pickle-score-auth-v2-visitor",
  };
  const IDENTITY_KEYS = {
    player: "ac-pickle-score-player-identity-v1",
    visitor: "ac-pickle-score-visitor-identity-v1",
  };

  // storages: Storage-like objects (localStorage, sessionStorage); a session is written to all and read from the first that has it.
  // getUrl / replaceUrl: read and rewrite the page URL. request(action, body, token): calls the auth API, throws when refused.
  function createSession({ storages, getUrl, replaceUrl, request }) {
    let current = loadSession();

    function portal() {
      try {
        const params = new URL(getUrl()).searchParams;
        if (params.get("visitor") === "1") return "visitor";
        if (params.get("player") === "1") return "player";
      } catch (error) {
        // An unreadable URL means the Admin portal.
      }
      return "admin";
    }

    function user() {
      return current ? current.user : null;
    }

    function permissions() {
      return current ? current.permissions || {} : {};
    }

    function isSignedIn() {
      return Boolean(current && current.token && current.user);
    }

    function headers() {
      return current && current.token ? { "X-Session-Token": current.token } : {};
    }

    // Accepts a sign-in reply ({ token, user }). A user who doesn't belong to the URL's portal is not signed in.
    function signIn(payload) {
      if (!payload || !payload.token || portalOf(payload.user) !== portal()) {
        clear();
        return false;
      }
      current = { token: payload.token, user: payload.user, permissions: payload.permissions || {} };
      remember();
      return true;
    }

    // Keeps a fresh copy of the signed-in user, signing out if they no longer belong to this portal.
    // Permissions are updated when given; otherwise the session keeps what it already has.
    function updateUser(nextUser, nextPermissions) {
      if (!current || portalOf(nextUser) !== portal()) {
        clear();
        return false;
      }
      current = { token: current.token, user: nextUser, permissions: nextPermissions || current.permissions || {} };
      remember();
      return true;
    }

    // Signs a Player or Visitor back in without a password, using the signed-in or remembered identity.
    async function recover() {
      const name = portal();
      const identity = current ? current.user : readIdentity(name);
      if (name === "admin" || !identity || !identity.username || portalOf(identity) !== name) return false;
      if (name === "visitor" && !isValidEmail(identity.username)) return false;
      try {
        const payload =
          name === "visitor"
            ? await request("visitor-login", { email: identity.username, displayName: identity.displayName || "" })
            : await request("login", { username: identity.username, password: "" });
        return signIn(payload);
      } catch (error) {
        return false;
      }
    }

    // Moves the URL to another portal; a session that doesn't belong there is dropped.
    function switchPortal(name) {
      const next = SESSION_KEYS[name] ? name : "admin";
      try {
        const url = new URL(getUrl());
        url.searchParams.delete("player");
        url.searchParams.delete("visitor");
        if (next !== "admin") url.searchParams.set(next, "1");
        replaceUrl(url.toString());
      } catch (error) {
        // Without URL support the portal still changes for this page.
      }
      if (current && portalOf(current.user) !== next) current = null;
      return next;
    }

    // Ends the session on the server (if reachable) and here, forgets a remembered Player or Visitor,
    // and returns to the signed-out user's portal, which it returns.
    async function signOut() {
      const portalAfter = (current && portalOf(current.user)) || "admin";
      try {
        await request("logout", {}, current ? current.token : "");
      } catch (error) {
        // Signing out here still works when the server is unreachable.
      }
      clear();
      if (IDENTITY_KEYS[portalAfter]) remove(IDENTITY_KEYS[portalAfter]);
      switchPortal(portalAfter);
      return portalAfter;
    }

    // Forgets the session for the URL's portal, including an old shared-key session that belongs to it.
    function clear() {
      current = null;
      remove(SESSION_KEYS[portal()]);
      const legacy = readSession(LEGACY_SESSION_KEY);
      if (legacy && portalOf(legacy.user) === portal()) remove(LEGACY_SESSION_KEY);
    }

    function loadSession() {
      const name = portal();
      const portalKey = SESSION_KEYS[name];
      for (const key of [portalKey, LEGACY_SESSION_KEY]) {
        const saved = readSession(key);
        if (!saved) continue;
        if (portalOf(saved.user) === name) {
          if (key !== portalKey) write(portalKey, saved);
          return saved;
        }
        if (key === portalKey) remove(portalKey);
      }
      return null;
    }

    function remember() {
      write(SESSION_KEYS[portalOf(current.user)], current);
      const identityKey = IDENTITY_KEYS[portalOf(current.user)];
      if (identityKey && current.user.username) {
        write(identityKey, {
          username: current.user.username,
          displayName: current.user.displayName || current.user.username,
          role: current.user.role,
        });
      }
    }

    function readIdentity(name) {
      const identity = IDENTITY_KEYS[name] ? read(IDENTITY_KEYS[name], Boolean) : null;
      return identity && identity.username ? identity : null;
    }

    function readSession(key) {
      return read(key, (value) => Boolean(value.token && value.user));
    }

    function read(key, accept) {
      for (const storage of storages) {
        try {
          const saved = storage.getItem(key);
          const value = saved ? JSON.parse(saved) : null;
          if (value && accept(value)) return value;
        } catch (error) {
          // Try the next storage.
        }
      }
      return null;
    }

    function write(key, value) {
      const serialized = JSON.stringify(value);
      storages.forEach((storage) => {
        try {
          storage.setItem(key, serialized);
        } catch (error) {
          // The session still works in memory.
        }
      });
    }

    function remove(key) {
      storages.forEach((storage) => {
        try {
          storage.removeItem(key);
        } catch (error) {
          // Ignore storage cleanup failures.
        }
      });
    }

    function hasRememberedIdentity() {
      const name = portal();
      if (name === "admin") return false;
      return Boolean(readIdentity(name));
    }

    function canRestore() {
      return isSignedIn() || hasRememberedIdentity();
    }

    return { portal, user, permissions, isSignedIn, headers, signIn, updateUser, recover, switchPortal, signOut, clear, hasRememberedIdentity, canRestore };
  }

  // The portal a user signs in through: Admins and Super Admins use the Admin portal.
  function portalOf(user) {
    const role = user && user.role ? String(user.role) : "";
    if (role === "visitor" || role === "player") return role;
    if (role === "admin" || role === "super_admin") return "admin";
    return null;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }

  // What a sign-in form still needs before it can be sent, keyed by field in form order; empty when ready.
  function signInErrors(portal, { username = "", password = "" } = {}) {
    const errors = {};
    const name = String(username).trim();
    if (portal === "visitor") {
      if (!name) errors.username = "Enter your email";
      else if (!isValidEmail(name)) errors.username = "Enter a valid email address, like you@example.com";
      return errors;
    }
    if (!name) errors.username = "Enter your username";
    if (portal === "admin" && !password) errors.password = "Enter your password";
    return errors;
  }

  function cleanUsername(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9._@+-]+/g, "")
      .slice(0, 128);
  }

  // What an account creation form still needs before it can be sent, keyed by field in form order; empty when ready.
  function newUserErrors({ username = "", displayName = "", password = "", role = "player" } = {}) {
    const errors = {};
    const name = String(username || "").trim();
    if (!name) {
      errors.username = "Enter a username";
    } else if (/[^a-zA-Z0-9._@+-]/.test(name)) {
      errors.username = "Username can only contain letters, numbers, and . _ @ + -";
    } else if (name.length < 3) {
      errors.username = "Username must be at least 3 characters";
    }

    if (role === "admin") {
      const pass = String(password || "");
      if (!pass) {
        errors.password = "Enter a password";
      } else if (pass.length < 6) {
        errors.password = "Password must be at least 6 characters";
      }
    }
    return errors;
  }

  // What a profile editing form still needs before it can be sent, keyed by field in form order; empty when ready.
  function profileErrors({ displayName = "", password = "" } = {}, { canHavePassword = true } = {}) {
    const errors = {};
    const name = String(displayName || "").trim();
    if (!name) {
      errors.displayName = "Enter a display name";
    }

    const pass = String(password || "");
    if (!canHavePassword) {
      if (pass) {
        errors.password = "Players and Visitors don't use a password";
      }
    } else if (pass && pass.length < 6) {
      errors.password = "Password must be at least 6 characters";
    }

    return errors;
  }

  const session = { createSession, signInErrors, newUserErrors, profileErrors };
  root.PaddlePointSession = session;
  if (typeof module === "object" && module.exports) module.exports = session;
})(typeof globalThis === "object" ? globalThis : window);
