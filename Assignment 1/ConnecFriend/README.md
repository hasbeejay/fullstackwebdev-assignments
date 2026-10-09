# ConnecFriend

**Course:** Full Stack Web Development (CS 301) · **Assignment 1 — Fall 2026**
**Institution:** Air University, Islamabad Campus

ConnecFriend is a small, original social networking website: news feed, profiles, friend invitations with an ignore list, a three-level friend rating, like/dislike, audience-restricted posts and private messaging.

The assignment is a **UI assignment with no server calls**, so the main application is **frontend-only**. All data lives in the browser (`localStorage`) and works by simply opening `index.html`. A separate, **optional** local WebSocket relay (`server.js`) is included to demonstrate real-time chat between two browsers; it goes beyond the original no-server requirement and is not needed to run or mark the assignment.

---

## Technology

HTML5 · CSS3 · vanilla JavaScript (no framework) · Bootstrap 5.3 + Bootstrap Icons (bundled locally in `assets/vendor`, so no internet is needed).
Optional extension only: Node.js + the `ws` package.

## How to run (frontend-only — the assignment version)

1. Unzip the project.
2. Double-click **`index.html`** (or open it in any modern browser).

No installation, no server, no internet. (Alternatively, any static server works, e.g. VS Code *Live Server* or `python -m http.server 8000`.)

### Demo accounts

| Username | Password |
|----------|----------|
| haseeb | demo123 |
| raheem | demo123 |
| taimur | demo123 |
| aneeq | demo123 |
| obaid | demo123 |

They are also shown on the login screen (click a chip to fill the form). Names and profile details are fictional demo data — edit `js/data.js` to change them.

> This is a classroom simulation. Passwords and sessions are stored in the browser and are **not** real security.

## Implemented features

- **Login / logout** with validation, show-hide password, loading state; no registration page. Each login records the user's last-login time.
- **Home feed** of posts from you and your friends. The feed (and the "Friends by last login" panel) is ordered by **latest login first**; a toggle switches to "Newest posts". Logging in again moves that user to the top.
- **Post composer**: text with counter, optional image link (safe fallback if it fails to load), audience *All friends* or *Selected friends* (searchable checklist, at least one required). Visibility is enforced when the feed and profiles are built — selected-friends posts are visible only to the author and the chosen friends.
- **Likes / dislikes**: one reaction per user per post; click again to remove; switching updates both counts. Counts are derived from stored reaction records.
- **Share** a post to all or selected friends (posts restricted to selected friends cannot be reshared).
- **Profiles** for all six users: avatar, bio, interests, location, friend list, visible posts, relationship actions.
- **Friend invitations**: send, accept, reject, cancel; tabs for Received / Sent / Friends. Prevents self-requests, duplicates, requests to existing friends and requests when one is already pending.
- **Ignore list** (Settings): a request **cannot be sent to someone who has ignored you** — enforced in `Friends.sendRequest()` (not only in the UI). Try it: log in as `haseeb` and click the disabled-looking *Request unavailable* button on Usman.
- **Friend rating**: *Stupid*, *Cool*, *Trustworthy* (icons + text) via a dropdown; changeable; no self-rating; only friends.
- **Member discovery** with search and relationship-aware buttons.
- **Private messaging** with any member (friend or not): conversation list, search, unread badges, bubbles, timestamps, Enter to send, validation. Messages persist across refreshes.
- Responsive layout (sidebar on desktop, bottom navigation on mobile), keyboard focus styles, ARIA labels, reduced-motion support, toast notifications and styled confirmation dialogs (no browser `alert()`).

## Folder structure

```
connecfriend/
├── index.html          Single page: login view + app shell
├── css/style.css       Design tokens and components
├── js/
│   ├── data.js         Constants and the reproducible demo seed
│   ├── storage.js      The only module that touches localStorage
│   ├── auth.js         Demo login/logout/session
│   ├── friends.js      Relationships, requests, ratings, ignore list
│   ├── feed.js         Posts, visibility, reactions, sharing
│   ├── messaging.js    Local messaging + optional live-relay client
│   ├── ui.js           Escaping, avatars, time, toasts, dialogs
│   └── app.js          Hash router, views and event handling
├── assets/vendor/      Bootstrap 5 and Bootstrap Icons (local copies)
├── server.js           OPTIONAL WebSocket relay (needs Node.js)
├── package.json        OPTIONAL (only for the relay)
└── README.md
```

**Architecture:** one HTML page with a tiny hash router (`#/home`, `#/profile/<id>`, …). Scripts are plain classic scripts sharing one `CF` namespace, so the project works when double-clicked (`file://`) — ES modules would not. Data logic (`friends.js`, `feed.js`, `messaging.js`) is separate from DOM code (`app.js`, `ui.js`). All rendered user text is HTML-escaped.

## Messaging modes — please read

**Local mode (default, no server).** Messages are saved in this browser's `localStorage`. `localStorage` is scoped to one browser/origin, so **a different browser or profile has a separate copy and will not receive your message**. A locally saved message is labelled *Saved on this device* — it is never labelled "delivered".

**Live relay mode (optional extension).** A tiny local Node.js server forwards messages between browsers in real time. It adds a server, so it is **beyond the original "no server calls" requirement** and is kept completely separate: if it is off or unreachable the app silently continues in local mode.

### Enabling live mode

```bash
npm install        # installs the "ws" package (once)
npm start          # relay + static files at http://localhost:3000
# different port:  PORT=3100 npm start   (Windows PowerShell: $env:PORT=3100; npm start)
```

Then in each browser: **Settings → Live messaging → switch on "Use live relay"** (address `ws://localhost:3000`, change it if you used another port) → Save. The pill in the top bar shows *Live relay connected*.

### Testing two users in two browsers (e.g. Chrome + Firefox)

1. `npm start`.
2. Chrome: open `http://localhost:3000` (or `index.html`), log in as **haseeb**, enable the live relay in Settings.
3. Firefox: open the same address, log in as **ali**, enable the live relay.
4. Open **Messages** and the Haseeb ↔ Ali conversation in both.
5. Send from Chrome — it appears in Firefox immediately (sender sees *Delivered live*). Reply from Firefox — it appears in Chrome.

Two tabs of the *same* browser also work: the login session is per tab (`sessionStorage`), the data is shared.

### Honest limitations of the relay

- Delivered (live) messages appear in both browsers. If the recipient is **offline**, the sender sees *Recipient offline — not delivered*; the relay has **no database**, so nothing is stored for later. *Retry live* re-sends once they are online.
- Each browser keeps its **own** local copy of data (friends, posts, history). Only chat messages travel through the relay.
- The relay trusts the username a client announces (`hello`). It validates every payload (shape, size, known demo users, sender = connection owner), routes a message **only** to the recipient's connections, rate-limits, de-duplicates retries by message id, listens on `127.0.0.1` only, and makes no external requests — but it is **not** production authentication or authorization. It is for local classroom demonstration only.
- The client reconnects automatically (1 s, 2 s, 4 s … up to 10 s). It never re-sends old messages on reconnect, which avoids duplicates.

Protocol (JSON): `hello {userId}` → `welcome`; `message {id, from, to, content, createdAt}` → `ack {id, status: delivered|offline}` or `error {reason, id?}`.

## Resetting demo data

**Settings → Demo data → Reset demo data** and confirm in the dialog. This restores the original seed (users, friendships, requests, posts, reactions, ratings, messages) for the current browser. It never runs automatically. Corrupted storage is also detected and replaced with the seed.

## Known limitations

- Frontend-only data is per browser; there is no real backend, authentication or password hashing.
- No image upload — posts take an image **link** (broken links show a placeholder). Seed images are inline SVGs so the demo works offline.
- Avatars are generated initials (no photo upload).
- Posting, reacting etc. in one tab of a *different* browser is not visible to that other browser (by design: no server).
- Ignoring is only allowed for non-friends, and ignoring someone withdraws any pending request between you.
- Relay: single process, in-memory, localhost only (see above).

## Submission

Rename the ZIP archive to **your university roll number** before submitting (it is intentionally not filled in). Do not include `node_modules`.
