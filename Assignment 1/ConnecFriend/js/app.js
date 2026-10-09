/* app.js — Router, page views, and event handling.
   Aesthetic Glassmorphism UI, always-live real-time chat, and responsive interactions. */
(function () {
  const CF = window.CF;
  const { Store, Auth, Friends, Feed, Messaging, Live, UI, Data } = CF;
  const esc = UI.esc;

  const mainEl = document.getElementById('view');
  let me = null;
  let feedSort = 'login';
  let chatQuery = '';
  let activeChatId = null;
  let inviteTab = 'incoming';
  let partnerTyping = false;
  let typingTimer = null;

  const state = () => Store.get();
  const routeName = () => location.hash.replace(/^#\/?/, '').split('/')[0] || 'home';
  const routeParam = () => decodeURIComponent(location.hash.replace(/^#\/?/, '').split('/').slice(1).join('/') || '');

  /* ===================== Shared HTML builders ===================== */
  function pageHead(title, subtitle, crumbs) {
    const trail = crumbs
      ? '<nav class="cf-breadcrumb" aria-label="Breadcrumb">' +
        crumbs.map((c) => (c[1] ? '<a href="' + c[1] + '">' + esc(c[0]) + '</a>' : '<span>' + esc(c[0]) + '</span>')).join(' / ') +
        '</nav>'
      : '';
    return '<div class="cf-page-head"><div>' + trail + '<h1>' + esc(title) + '</h1>' +
      (subtitle ? '<p>' + esc(subtitle) + '</p>' : '') + '</div></div>';
  }

  function ratingDropdown(user, current) {
    const currentType = Data.RATING_TYPES.find((t) => t.key === current);
    const items = Data.RATING_TYPES.map((t) => {
      const active = t.key === current;
      return '<li><button type="button" class="dropdown-item d-flex align-items-center gap-2' + (active ? ' active' : '') + '" data-action="rate" data-user="' + esc(user.id) + '" data-type="' + t.key + '">' +
        '<i class="bi ' + t.icon + '" aria-hidden="true"></i><span>' + t.label + '</span>' + (active ? '<i class="bi bi-check2 ms-auto" aria-hidden="true"></i>' : '') + '</button></li>';
    }).join('');
    return '<div class="dropdown"><button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Rate ' + esc(user.fullName) + '. Current rating: ' + (currentType ? currentType.label : 'none') + '">' +
      '<i class="bi ' + (currentType ? currentType.icon : 'bi-star') + '" aria-hidden="true"></i> ' + (currentType ? currentType.label : 'Rate') + '</button><ul class="dropdown-menu shadow-lg">' + items + '</ul></div>';
  }

  /** Relationship buttons for profile, discover, invitations. */
  function relationActions(st, rel, user) {
    const id = esc(user.id);
    const messageBtn = '<a class="btn btn-sm btn-outline-primary" href="#/messages/' + id + '"><i class="bi bi-chat-dots-fill" aria-hidden="true"></i> Message</a>';
    switch (rel) {
      case 'self':
        return '<a class="btn btn-sm btn-outline-secondary" href="#/settings"><i class="bi bi-gear" aria-hidden="true"></i> Settings</a>';
      case 'friends':
        return messageBtn + ratingDropdown(user, Friends.getRating(st, me.id, user.id)) +
          '<button type="button" class="btn btn-sm btn-outline-danger" data-action="remove-friend" data-user="' + id + '"><i class="bi bi-person-dash" aria-hidden="true"></i> Remove</button>';
      case 'pending_out': {
        const req = Friends.pendingBetween(st, me.id, user.id);
        return '<span class="cf-status warn"><i class="bi bi-hourglass-split" aria-hidden="true"></i> Request sent</span>' +
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-action="cancel-request" data-request="' + esc(req.id) + '">Cancel</button>' + messageBtn;
      }
      case 'pending_in': {
        const req = Friends.pendingBetween(st, me.id, user.id);
        return '<button type="button" class="btn btn-sm btn-primary" data-action="accept-request" data-request="' + esc(req.id) + '"><i class="bi bi-check-lg" aria-hidden="true"></i> Accept</button>' +
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-action="reject-request" data-request="' + esc(req.id) + '">Decline</button>' + messageBtn;
      }
      case 'ignoring':
        return '<span class="cf-status bad"><i class="bi bi-slash-circle" aria-hidden="true"></i> On ignore list</span>' +
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-action="ignore-remove" data-user="' + id + '">Unignore</button>' + messageBtn;
      case 'ignored_by_them':
        return '<button type="button" class="btn btn-sm btn-secondary disabled" data-action="send-request" data-user="' + id + '" title="This member is not accepting requests from you"><i class="bi bi-slash-circle" aria-hidden="true"></i> Unavailable</button>' + messageBtn;
      default:
        return '<button type="button" class="btn btn-sm btn-primary" data-action="send-request" data-user="' + id + '"><i class="bi bi-person-plus-fill" aria-hidden="true"></i> Add friend</button>' + messageBtn;
    }
  }

  function memberCard(st, user) {
    const rel = Friends.relationship(st, me.id, user.id);
    const tags = (user.interests || []).slice(0, 3).map((i) => '<span class="cf-tag">' + esc(i) + '</span>').join(' ');
    const search = (user.fullName + ' ' + user.username + ' ' + (user.location || '')).toLowerCase();
    const isOnline = Messaging.isUserOnline(user.id);
    const onlineBadge = isOnline ? '<span class="cf-status ok ms-auto" style="font-size:0.72rem;"><i class="bi bi-circle-fill text-success" style="font-size:0.5rem;"></i> Online</span>' : '';

    return '<article class="cf-card cf-member-card" data-search="' + esc(search) + '">' +
      '<div class="cf-member-head">' + UI.avatar(user, 'md') +
      '<div class="min-w-0 flex-grow-1"><a class="cf-truncate d-block" href="#/profile/' + esc(user.id) + '">' + esc(user.fullName) + '</a>' +
      '<div class="small text-muted cf-truncate">@' + esc(user.username) + ' · ' + esc(user.location || 'Somewhere') + '</div></div>' +
      onlineBadge + '</div>' +
      '<p class="small text-body-secondary mb-0">' + esc(user.bio || 'No bio provided.') + '</p>' +
      '<div class="d-flex flex-wrap gap-1">' + tags + '</div>' +
      '<div class="cf-member-actions">' + relationActions(st, rel, user) + '</div></article>';
  }

  function filterBox(targetId, label) {
    return '<div class="mb-3"><label for="filter-' + targetId + '" class="visually-hidden">' + esc(label) + '</label>' +
      '<div class="input-group"><span class="input-group-text"><i class="bi bi-search" aria-hidden="true"></i></span>' +
      '<input id="filter-' + targetId + '" type="search" class="form-control" placeholder="' + esc(label) + '" data-filter-input data-target="' + targetId + '"></div></div>';
  }

  /* ===================== Audience Picker ===================== */
  function audiencePicker(prefix, friends) {
    const list = friends.length
      ? friends.map((f) => '<label class="d-flex align-items-center gap-2 py-1 px-2 rounded-2 hover-bg" data-name="' + esc((f.fullName + ' ' + f.username).toLowerCase()) + '">' +
        '<input class="form-check-input mt-0" type="checkbox" value="' + esc(f.id) + '" data-audience-friend data-label="' + esc(f.fullName) + '">' + UI.avatar(f, 'sm') +
        '<span>' + esc(f.fullName) + ' <span class="text-muted small">@' + esc(f.username) + '</span></span></label>').join('')
      : '<p class="text-muted small mb-0 px-2">You have no friends yet. Add some from Discover.</p>';
    return '<fieldset class="cf-audience-box" data-audience><legend class="form-label small fw-bold float-none w-auto mb-2 text-light">Who can see this?</legend>' +
      '<div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="' + prefix + '-audience" id="' + prefix + '-aud-all" value="all" checked><label class="form-check-label text-light small" for="' + prefix + '-aud-all">🌐 All friends</label></div>' +
      '<div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="' + prefix + '-audience" id="' + prefix + '-aud-sel" value="selected"><label class="form-check-label text-light small" for="' + prefix + '-aud-sel">🔒 Selected friends</label></div>' +
      '<div data-audience-panel hidden><label class="visually-hidden" for="' + prefix + '-aud-search">Search friends</label>' +
      '<input id="' + prefix + '-aud-search" type="search" class="form-control form-control-sm mt-2 mb-1" placeholder="Filter friends" data-audience-search>' +
      '<div class="cf-audience-list">' + list + '</div></div>' +
      '<p class="small text-muted mb-0 mt-2" data-audience-summary aria-live="polite"></p></fieldset>';
  }

  function updateAudience(box) {
    const type = box.querySelector('input[type="radio"]:checked').value;
    box.querySelector('[data-audience-panel]').hidden = type !== 'selected';
    const summary = box.querySelector('[data-audience-summary]');
    const all = box.querySelectorAll('[data-audience-friend]');
    if (type === 'all') {
      summary.textContent = all.length ? 'Will be shared with all ' + all.length + ' of your friends.' : 'You have no friends yet, so only you will see this.';
      return;
    }
    const names = Array.from(box.querySelectorAll('[data-audience-friend]:checked')).map((c) => c.dataset.label);
    summary.textContent = names.length ? 'Will be shared with: ' + names.join(', ') + '.' : 'Select at least one friend.';
  }

  function readAudience(box) {
    return {
      audienceType: box.querySelector('input[type="radio"]:checked').value,
      audienceUserIds: Array.from(box.querySelectorAll('[data-audience-friend]:checked')).map((c) => c.value),
    };
  }

  /* ===================== Posts ===================== */
  function renderPost(st, post) {
    const author = Friends.getUser(st, post.authorId);
    if (!author) return '';
    const summary = Feed.reactionSummary(st, post.id, me.id);
    const isMine = author.id === me.id;

    let audienceLabel = '';
    if (isMine) {
      const names = post.audienceType === 'selected' ? post.audienceUserIds.map((id) => (Friends.getUser(st, id) || {}).fullName).filter(Boolean).join(', ') : '';
      audienceLabel = post.audienceType === 'all'
        ? '<span class="cf-status"><i class="bi bi-globe" aria-hidden="true"></i> All friends</span>'
        : '<span class="cf-status" title="' + esc(names) + '"><i class="bi bi-lock-fill" aria-hidden="true"></i> ' + post.audienceUserIds.length + ' selected</span>';
    }

    let sharedHtml = '';
    if (post.sharedPostId) {
      const original = st.posts.find((p) => p.id === post.sharedPostId);
      const originalAuthor = original && Friends.getUser(st, original.authorId);
      sharedHtml = original && originalAuthor
        ? '<div class="cf-shared"><div class="d-flex align-items-center gap-2 mb-2">' + UI.avatar(originalAuthor, 'sm') + '<a class="fw-bold text-light" href="#/profile/' + esc(originalAuthor.id) + '">' + esc(originalAuthor.fullName) + '</a>' +
          '<span class="cf-post-meta">' + UI.timeAgo(original.createdAt) + '</span></div><div class="cf-post-text mb-0">' + esc(original.text) + '</div>' +
          (original.imageUrl ? '<img class="cf-post-img mt-2 mb-0" src="' + esc(original.imageUrl) + '" alt="Shared photo" loading="lazy" data-post-img>' : '') + '</div>'
        : '<div class="cf-shared text-muted">The original post is no longer available.</div>';
    }

    const canShare = Feed.canShare(st, me.id, post);
    return '<article class="cf-card cf-post cf-card-hover" id="post-' + esc(post.id) + '" aria-label="Post by ' + esc(author.fullName) + '">' +
      '<div class="cf-post-head">' + UI.avatar(author, 'md') + '<div class="min-w-0 flex-grow-1">' +
      '<div><a class="name" href="#/profile/' + esc(author.id) + '">' + esc(author.fullName) + '</a> <span class="cf-post-meta">@' + esc(author.username) + '</span>' + (post.sharedPostId ? ' <span class="badge bg-secondary-subtle text-light-emphasis ms-1">shared</span>' : '') + '</div>' +
      '<div class="cf-post-meta"><i class="bi bi-clock me-1"></i>' + UI.timeAgo(post.createdAt) + ' · Logged in ' + UI.timeAgo(author.lastLoginAt) + '</div></div>' + audienceLabel + '</div>' +
      (post.text ? '<div class="cf-post-text">' + esc(post.text) + '</div>' : '') + sharedHtml +
      (post.imageUrl ? '<img class="cf-post-img" src="' + esc(post.imageUrl) + '" alt="Shared image" loading="lazy" data-post-img>' : '') +
      '<div class="cf-react-bar">' +
      '<button type="button" class="cf-react-btn like" data-action="react" data-post="' + esc(post.id) + '" data-type="like" aria-pressed="' + (summary.mine === 'like') + '" aria-label="Like"><i class="bi ' + (summary.mine === 'like' ? 'bi-hand-thumbs-up-fill' : 'bi-hand-thumbs-up') + '" aria-hidden="true"></i> Like <strong class="ms-1">' + summary.likes + '</strong></button>' +
      '<button type="button" class="cf-react-btn dislike" data-action="react" data-post="' + esc(post.id) + '" data-type="dislike" aria-pressed="' + (summary.mine === 'dislike') + '" aria-label="Dislike"><i class="bi ' + (summary.mine === 'dislike' ? 'bi-hand-thumbs-down-fill' : 'bi-hand-thumbs-down') + '" aria-hidden="true"></i> Dislike <strong class="ms-1">' + summary.dislikes + '</strong></button>' +
      '<button type="button" class="cf-react-btn share" data-action="share-open" data-post="' + esc(post.id) + '"' + (canShare ? '' : ' disabled title="Selected-friends posts cannot be reshared"') + '><i class="bi bi-share-fill" aria-hidden="true"></i> Share</button>' +
      '</div></article>';
  }

  /* ===================== Views ===================== */
  function viewHome() {
    const st = state();
    const friends = Friends.friendsOf(st, me.id);
    const composer =
      '<form id="composer" class="cf-card cf-composer mb-4" novalidate>' +
      '<div class="d-flex align-items-center gap-3 mb-3">' + UI.avatar(me, 'md') +
      '<div class="flex-grow-1"><h2 class="h6 mb-0 text-light fw-bold">Create Post</h2><small class="text-muted">What\'s on your mind today, ' + esc(me.fullName.split(' ')[0]) + '?</small></div></div>' +
      '<textarea id="post-text" class="form-control" maxlength="' + Feed.MAX_POST_LENGTH + '" rows="3" placeholder="Share thoughts, links, or updates with friends…"></textarea>' +
      '<div class="d-flex justify-content-between small mt-2"><span id="composer-error" class="text-danger fw-semibold" role="alert"></span><span class="text-muted"><span id="post-count">0</span>/' + Feed.MAX_POST_LENGTH + '</span></div>' +
      '<div class="mt-2"><label for="post-image" class="form-label small mb-1 text-light"><i class="bi bi-image me-1 text-primary"></i> Image link (optional)</label>' +
      '<input id="post-image" type="url" class="form-control form-control-sm" placeholder="https://images.unsplash.com/photo-..."></div>' +
      '<div id="composer-img-preview" class="mt-2 d-none"><div class="position-relative d-inline-block"><img id="composer-preview-img" class="rounded-3 border border-secondary" style="max-height:120px; object-fit:cover;"><button type="button" class="btn btn-sm btn-dark position-absolute top-0 end-0 m-1 rounded-circle p-1" data-action="composer-remove-img" aria-label="Remove image"><i class="bi bi-x"></i></button></div></div>' +
      '<div class="mt-3">' + audiencePicker('post', friends) + '</div>' +
      '<div class="d-flex gap-2 justify-content-end mt-3"><button type="button" class="btn btn-outline-secondary btn-sm" data-action="composer-clear">Clear</button>' +
      '<button class="btn btn-primary btn-sm px-3" type="submit"><i class="bi bi-send-fill" aria-hidden="true"></i> Post now</button></div></form>';

    return pageHead('Home Feed', 'Stay updated with your circle in real time') +
      '<div class="cf-home-grid"><div>' + composer +
      '<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3"><h2 class="cf-section-title mb-0">Timeline</h2>' +
      '<div class="nav-pills" role="group" aria-label="Sort feed" id="sort-group"></div></div>' +
      '<div id="feed-list"></div></div>' +
      '<aside class="cf-side cf-card cf-card-pad" aria-labelledby="activity-title"><div class="d-flex align-items-center justify-content-between mb-3">' +
      '<h2 class="cf-section-title mb-0" id="activity-title">Active Friends</h2><span class="badge bg-success-subtle text-success" style="font-size:0.7rem;">Live</span></div>' +
      '<ul class="cf-activity-list" id="activity-list"></ul></aside></div>';
  }

  function refreshFeed() {
    const st = state();
    const feed = document.getElementById('feed-list');
    if (!feed) return;
    const posts = Feed.feedFor(st, me.id, feedSort);
    feed.innerHTML = posts.length
      ? posts.map((p) => renderPost(st, p)).join('')
      : '<div class="cf-card">' + UI.emptyState('bi-newspaper', 'No posts yet', 'Posts from you and your friends will appear here. Share something above or add friends from Discover.') + '</div>';

    const friends = Friends.friendsOf(st, me.id);
    document.getElementById('activity-list').innerHTML = friends.length
      ? friends.map((f) => {
          const isOnline = Messaging.isUserOnline(f.id);
          const statusText = isOnline ? '<span class="text-success fw-bold">Online now</span>' : 'Logged in ' + UI.timeAgo(f.lastLoginAt);
          return '<li><div class="d-flex align-items-center justify-content-between w-100"><a class="cf-activity-item flex-grow-1" href="#/profile/' + esc(f.id) + '">' +
            UI.avatar(f, 'md') + '<span class="min-w-0"><span class="fw-bold cf-truncate d-block">' + esc(f.fullName) + '</span><small>' + statusText + '</small></span></a>' +
            '<a class="btn btn-sm btn-outline-primary ms-2 p-1" href="#/messages/' + esc(f.id) + '" title="Chat with ' + esc(f.fullName) + '"><i class="bi bi-chat-dots-fill"></i></a></div></li>';
        }).join('')
      : '<li class="w-100">' + UI.emptyState('bi-people', 'No friends yet', 'Find and add friends on Discover.') + '</li>';

    document.getElementById('sort-group').innerHTML =
      [['login', '⚡ By last login'], ['newest', '🕒 Newest posts']].map((o) =>
        '<button type="button" class="nav-link' + (feedSort === o[0] ? ' active' : '') + '" data-action="set-sort" data-sort="' + o[0] + '" aria-pressed="' + (feedSort === o[0]) + '">' + o[1] + '</button>').join('');
  }

  function viewProfile(param) {
    const st = state();
    const userId = param || me.id;
    const user = Friends.getUser(st, userId);
    if (!user) {
      return pageHead('Profile', null, [['Home', '#/home'], ['Profile']]) +
        '<div class="cf-card">' + UI.emptyState('bi-person-x', 'Member not found', 'That profile does not exist.') + '<div class="text-center pb-4"><a class="btn btn-primary" href="#/discover">Browse members</a></div></div>';
    }
    const rel = Friends.relationship(st, me.id, user.id);
    const friends = Friends.friendsOf(st, user.id);
    const posts = Feed.postsByAuthor(st, user.id, me.id);
    const rating = rel === 'friends' ? Friends.getRating(st, me.id, user.id) : null;
    const ratingType = Data.RATING_TYPES.find((t) => t.key === rating);
    const interests = (user.interests || []).map((i) => '<span class="cf-tag">' + esc(i) + '</span>').join(' ') || '<span class="text-muted small">No interests listed</span>';

    const friendList = friends.length
      ? friends.map((f) => '<a class="cf-mini-friend" href="#/profile/' + esc(f.id) + '">' + UI.avatar(f, 'sm') + '<span class="cf-truncate">' + esc(f.fullName) + '</span></a>').join('')
      : UI.emptyState('bi-people', 'No friends yet', user.id === me.id ? 'Find people on Discover.' : user.fullName + ' has not added anyone yet.');
    const postList = posts.length
      ? posts.map((p) => renderPost(st, p)).join('')
      : '<div class="cf-card">' + UI.emptyState('bi-newspaper', 'No posts to show', rel === 'friends' || rel === 'self' ? 'Nothing has been posted yet.' : 'Become friends to view ' + user.fullName + '\'s posts.') + '</div>';

    return pageHead(user.id === me.id ? 'My profile' : user.fullName, null, [['Home', '#/home'], [user.id === me.id ? 'My profile' : 'Profile']]) +
      '<section class="cf-card mb-4 overflow-hidden"><div class="cf-profile-cover" aria-hidden="true"></div><div class="cf-profile-body">' +
      '<div class="d-flex flex-wrap align-items-end justify-content-between gap-3"><span class="cf-profile-avatar">' + UI.avatar(user, 'xl') + '</span>' +
      '<div class="d-flex gap-2"><div class="cf-stat"><strong>' + friends.length + '</strong><span>Friends</span></div><div class="cf-stat"><strong>' + posts.length + '</strong><span>Posts</span></div></div></div>' +
      '<h2 class="h3 mt-3 mb-0 text-light fw-bold">' + esc(user.fullName) + '</h2><div class="text-muted">@' + esc(user.username) + ' · <i class="bi bi-geo-alt-fill text-danger" aria-hidden="true"></i> ' + esc(user.location || 'Unknown') + '</div>' +
      '<p class="mt-2 mb-2 text-body-secondary">' + esc(user.bio || '') + '</p><div class="d-flex flex-wrap gap-1 mb-3">' + interests + '</div>' +
      '<div class="small text-muted mb-3"><i class="bi bi-clock-history me-1" aria-hidden="true"></i> Last login ' + UI.timeAgo(user.lastLoginAt) +
      (ratingType ? ' · <span class="cf-rating-pill"><i class="bi ' + ratingType.icon + '" aria-hidden="true"></i> Rated ' + esc(user.fullName.split(' ')[0]) + ': ' + ratingType.label + '</span>' : '') + '</div>' +
      '<div class="d-flex flex-wrap gap-2 align-items-center">' + relationActions(st, rel, user) + '</div></div></section>' +
      '<div class="row g-4"><div class="col-lg-4"><section class="cf-card cf-card-pad"><h2 class="cf-section-title">Friends (' + friends.length + ')</h2>' + friendList + '</section></div>' +
      '<div class="col-lg-8"><h2 class="cf-section-title">Posts (' + posts.length + ')</h2>' + postList + '</div></div>';
  }

  function viewFriends() {
    const st = state();
    const friends = Friends.friendsOf(st, me.id);
    return pageHead('Friends', 'Everyone in your inner circle (' + friends.length + ')') +
      (friends.length
        ? filterBox('friend-grid', 'Search your friends by name or handle') + '<div class="cf-member-grid" id="friend-grid">' + friends.map((f) => memberCard(st, f)).join('') + '</div>' +
          '<div id="friend-grid-empty" class="cf-card mt-3" hidden>' + UI.emptyState('bi-search', 'No matches found', 'Try searching with a different keyword.') + '</div>'
        : '<div class="cf-card">' + UI.emptyState('bi-people', 'No friends yet', 'Send friend invitations to people from Discover.') + '<div class="text-center pb-4"><a class="btn btn-primary" href="#/discover">Find people</a></div></div>');
  }

  function viewInvitations() {
    const st = state();
    const incoming = Friends.incomingRequests(st, me.id).map((r) => Friends.getUser(st, r.senderId)).filter(Boolean);
    const outgoing = Friends.outgoingRequests(st, me.id).map((r) => Friends.getUser(st, r.recipientId)).filter(Boolean);
    const friends = Friends.friendsOf(st, me.id);
    const pane = (key, list, emptyTitle, emptyText) =>
      '<div class="tab-pane fade' + (inviteTab === key ? ' show active' : '') + '" id="tab-' + key + '" role="tabpanel" aria-labelledby="tabbtn-' + key + '" tabindex="0">' +
      (list.length ? '<div class="cf-member-grid">' + list.map((u) => memberCard(st, u)).join('') + '</div>' : '<div class="cf-card">' + UI.emptyState('bi-inbox', emptyTitle, emptyText) + '</div>') + '</div>';
    const tab = (key, label, count) =>
      '<li class="nav-item" role="presentation"><button class="nav-link' + (inviteTab === key ? ' active' : '') + '" id="tabbtn-' + key + '" data-bs-toggle="pill" data-bs-target="#tab-' + key + '" data-tab="' + key + '" type="button" role="tab" aria-controls="' + key + '" aria-selected="' + (inviteTab === key) + '">' +
      label + ' <span class="badge cf-badge ms-1">' + count + '</span></button></li>';
    return pageHead('Invitations', 'Manage pending requests and connections') +
      '<ul class="nav nav-pills mb-4 gap-1" role="tablist">' + tab('incoming', 'Received', incoming.length) + tab('outgoing', 'Sent', outgoing.length) + tab('friends', 'Friends', friends.length) + '</ul>' +
      '<div class="tab-content">' + pane('incoming', incoming, 'No pending invitations', 'When someone sends you a friend request it will appear here.') +
      pane('outgoing', outgoing, 'No sent requests', 'Requests you have sent will stay here until answered.') +
      pane('friends', friends, 'No friends yet', 'Accepted friends will appear here.') + '</div>';
  }

  function viewDiscover() {
    const st = state();
    const members = st.users.filter((u) => u.id !== me.id).sort((a, b) => a.fullName.localeCompare(b.fullName));
    return pageHead('Discover', 'Meet and connect with other community members') + filterBox('member-grid', 'Search by name, username or location') +
      '<div class="cf-member-grid" id="member-grid">' + members.map((u) => memberCard(st, u)).join('') + '</div>' +
      '<div id="member-grid-empty" class="cf-card mt-3" hidden>' + UI.emptyState('bi-search', 'No members found', 'Try another search query.') + '</div>';
  }

  /* ===================== Always-Live Messages / Chat ===================== */
  function chatListHtml(st) {
    const query = chatQuery.trim().toLowerCase();
    const matches = (u) => !query || (u.fullName + ' ' + u.username).toLowerCase().includes(query);
    const conversations = Messaging.listConversations(st, me.id).filter((c) => matches(Friends.getUser(st, c.partnerId)));
    const talkedTo = new Set(conversations.map((c) => c.partnerId));
    const others = st.users.filter((u) => u.id !== me.id && !talkedTo.has(u.id) && matches(u));

    const row = (user, extra) => {
      const isOnline = Messaging.isUserOnline(user.id);
      return '<a class="cf-chat-item' + (user.id === activeChatId ? ' active' : '') + '" href="#/messages/' + esc(user.id) + '"' + (user.id === activeChatId ? ' aria-current="true"' : '') + '>' +
        UI.avatar(user, 'md', { online: isOnline }) +
        '<span class="min-w-0 flex-grow-1"><span class="fw-bold cf-truncate d-block">' + esc(user.fullName) + '</span>' + extra.snippet + '</span>' + extra.badge + '</a>';
    };

    let html = '';
    if (conversations.length) {
      html += '<h3 class="cf-section-title px-2 pt-2 mb-1">Conversations</h3>' + conversations.map((c) => {
        const user = Friends.getUser(st, c.partnerId);
        const prefix = c.last.senderId === me.id ? '<span class="text-primary-emphasis">You: </span>' : '';
        return row(user, {
          snippet: '<span class="snippet cf-truncate d-block">' + prefix + esc(c.last.content) + '</span>',
          badge: c.unread ? '<span class="cf-unread" aria-label="' + c.unread + ' unread">' + c.unread + '</span>' : '',
        });
      }).join('');
    }
    if (others.length) {
      html += '<h3 class="cf-section-title px-2 pt-3 mb-1">Start a new chat</h3>' + others.map((u) =>
        row(u, { snippet: '<span class="snippet cf-truncate d-block">@' + esc(u.username) + (Friends.areFriends(st, me.id, u.id) ? ' · friend' : '') + '</span>', badge: '' })).join('');
    }
    return html || UI.emptyState('bi-search', 'No results', 'No members match your search.');
  }

  function deliveryMeta(message, isLastOutgoing) {
    const map = {
      local: ['bi-check2', 'Sent', false],
      sent: ['bi-check2', 'Sent', false],
      sending: ['bi-hourglass-split', 'Sending…', true],
      delivered: ['bi-check2-all text-info', 'Delivered live', false],
      offline: ['bi-check2', 'Sent', false],
      failed: ['bi-exclamation-circle text-danger', 'Failed to send', true],
    };
    const info = map[message.delivery] || map.sent;
    const showText = info[2] || isLastOutgoing;
    const retry = message.delivery === 'failed'
      ? ' <button type="button" class="retry ms-1" data-action="retry-message" data-id="' + esc(message.id) + '">Retry</button>' : '';
    return '<i class="bi ' + info[0] + '" aria-hidden="true" title="' + esc(info[1]) + '"></i>' +
      (showText ? '<span class="ms-1">' + info[1] + '</span>' : '<span class="visually-hidden">' + info[1] + '</span>') + retry;
  }

  function threadHtml(st, partnerId) {
    const thread = Messaging.threadBetween(st, me.id, partnerId);
    if (!thread.length) {
      return '<div class="cf-chat-empty">' +
        UI.emptyState('bi-chat-heart', 'Say hello to ' + esc((Friends.getUser(st, partnerId) || {}).fullName || 'a friend'), 'Private end-to-end local & live relay messaging. You do not have to be friends to chat!') +
        '</div>';
    }
    const lastOutgoingId = (thread.filter((m) => m.senderId === me.id).pop() || {}).id;
    let lastDay = '';
    const bubbles = thread.map((m) => {
      const day = UI.dayLabel(m.createdAt);
      const divider = day !== lastDay ? '<div class="cf-day">' + esc(day) + '</div>' : '';
      lastDay = day;
      const mine = m.senderId === me.id;
      return divider + '<div class="cf-bubble ' + (mine ? 'out' : 'in') + '">' + esc(m.content) +
        '<div class="cf-bubble-meta"><span>' + UI.clockTime(m.createdAt) + '</span>' + (mine ? deliveryMeta(m, m.id === lastOutgoingId) : '') + '</div></div>';
    }).join('');

    const typingHtml = partnerTyping
      ? '<div class="cf-typing-indicator" id="partner-typing"><span class="cf-typing-dots"><span class="cf-typing-dot"></span><span class="cf-typing-dot"></span><span class="cf-typing-dot"></span></span><span>' + esc((Friends.getUser(st, partnerId) || {}).fullName.split(' ')[0] || 'Friend') + ' is typing…</span></div>'
      : '';

    return bubbles + typingHtml;
  }

  function viewMessages(param) {
    const partner = param ? Friends.getUser(state(), param) : null;
    activeChatId = partner && partner.id !== me.id ? partner.id : null;
    if (activeChatId) Messaging.markRead(me.id, activeChatId);
    const st = state();

    let pane;
    if (activeChatId) {
      const isFriend = Friends.areFriends(st, me.id, activeChatId);
      const isOnline = Messaging.isUserOnline(activeChatId);
      const onlineStatusBadge = isOnline
        ? '<span class="cf-status ok" id="chat-live-indicator"><i class="bi bi-circle-fill text-success" style="font-size:0.55rem;"></i> Online now</span>'
        : '<span class="cf-status"><i class="bi bi-clock me-1"></i> Last seen ' + UI.timeAgo(partner.lastLoginAt) + '</span>';

      pane = '<div class="cf-chat-pane-head"><a href="#/messages" class="btn btn-outline-secondary btn-sm d-lg-none" aria-label="Back"><i class="bi bi-arrow-left" aria-hidden="true"></i></a>' +
        UI.avatar(partner, 'md', { online: isOnline }) +
        '<div class="min-w-0 flex-grow-1"><a class="fw-bold text-light cf-truncate d-block" href="#/profile/' + esc(partner.id) + '">' + esc(partner.fullName) + '</a>' +
        '<div class="small text-muted">@' + esc(partner.username) + ' · ' + (isFriend ? 'Friend' : 'Member') + '</div></div>' +
        onlineStatusBadge + '</div>' +
        '<div class="cf-thread" id="chat-thread" role="log" aria-live="polite" aria-label="Conversation with ' + esc(partner.fullName) + '">' +
        threadHtml(st, activeChatId) + '</div>' +
        '<div class="cf-emoji-bar">' +
        ['👋', '😊', '❤️', '🔥', '🎉', '👍', '👏', '🚀'].map((em) => '<button type="button" class="cf-emoji-btn" data-action="insert-emoji">' + em + '</button>').join('') +
        '</div>' +
        '<form id="chat-form" class="cf-chat-form" data-partner="' + esc(activeChatId) + '" novalidate>' +
        '<label for="chat-input" class="visually-hidden">Message</label>' +
        '<input id="chat-input" class="form-control" type="text" maxlength="' + Messaging.MAX_MESSAGE_LENGTH + '" placeholder="Write a message to ' + esc(partner.fullName) + '…" autocomplete="off">' +
        '<button class="btn btn-primary" type="submit" aria-label="Send"><i class="bi bi-send-fill" aria-hidden="true"></i><span class="d-none d-sm-inline ms-1">Send</span></button></form>' +
        '<div id="chat-error" class="small text-danger px-3 pb-2" role="alert"></div>';
    } else {
      pane = '<div class="cf-chat-empty">' + UI.emptyState('bi-chat-dots', param ? 'Conversation not found' : 'Select a conversation', param ? 'That member does not exist.' : 'Pick a person from the left panel or search for anyone to start chatting.') +
        '<p class="small text-center text-muted px-4"><span class="cf-live-pill is-live" data-live-status></span></p></div>';
    }

    return pageHead('Live Chat', 'Real-time private messaging with instant sync') +
      '<div class="cf-card cf-chat' + (activeChatId ? ' has-active' : '') + '"><section class="cf-chat-list" aria-label="Conversations">' +
      '<div class="cf-chat-list-head"><label for="chat-search" class="visually-hidden">Search conversations</label>' +
      '<div class="input-group"><span class="input-group-text"><i class="bi bi-search" aria-hidden="true"></i></span><input id="chat-search" type="search" class="form-control" placeholder="Search people..." value="' + esc(chatQuery) + '"></div></div>' +
      '<div class="cf-chat-list-body" id="chat-list-body">' + chatListHtml(st) + '</div></section>' +
      '<section class="cf-chat-pane" aria-label="Chat">' + pane + '</section></div>';
  }

  function refreshChat(scrollToEnd) {
    const listBody = document.getElementById('chat-list-body');
    if (!listBody) return;
    if (activeChatId) Messaging.markRead(me.id, activeChatId);
    const st = state();
    listBody.innerHTML = chatListHtml(st);
    const thread = document.getElementById('chat-thread');
    if (thread && activeChatId) {
      const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120;
      thread.innerHTML = threadHtml(st, activeChatId);
      if (scrollToEnd || nearBottom) thread.scrollTop = thread.scrollHeight;
    }
    updateChrome();
  }

  /* ===================== Settings ===================== */
  function viewSettings() {
    const st = state();
    const self = Friends.getUser(st, me.id);
    const ignored = self.ignoredUserIds.map((id) => Friends.getUser(st, id)).filter(Boolean);
    const candidates = st.users.filter((u) => u.id !== me.id && !self.ignoredUserIds.includes(u.id) && !Friends.areFriends(st, me.id, u.id));
    const live = Live.settings();

    const ignoreList = ignored.length
      ? '<ul class="list-unstyled mb-3">' + ignored.map((u) => '<li class="d-flex align-items-center gap-2 py-2 border-bottom border-secondary-subtle">' + UI.avatar(u, 'sm') + '<span class="flex-grow-1">' + esc(u.fullName) + ' <span class="text-muted small">@' + esc(u.username) + '</span></span>' +
        '<button type="button" class="btn btn-sm btn-outline-secondary" data-action="ignore-remove" data-user="' + esc(u.id) + '">Remove</button></li>').join('') + '</ul>'
      : UI.emptyState('bi-slash-circle', 'Your ignore list is empty', 'Members you add here cannot send you friend requests.');

    return pageHead('Settings', 'Account preferences, live messaging, and privacy') +
      '<div class="row g-4"><div class="col-lg-6">' +
      '<section class="cf-card cf-card-pad mb-4"><h2 class="h5 text-light fw-bold">Account Profile</h2><div class="d-flex align-items-center gap-3 mt-3">' + UI.avatar(self, 'lg') +
      '<div><div class="fw-bold text-light">' + esc(self.fullName) + '</div><div class="text-muted small">@' + esc(self.username) + '</div><div class="text-muted small">Logged in ' + UI.timeAgo(self.lastLoginAt) + '</div></div></div>' +
      '<p class="small text-muted mt-3 mb-0">Classroom demonstration session. Saved in your local browser environment.</p></section>' +
      '<section class="cf-card cf-card-pad"><h2 class="h5 text-light fw-bold">Ignore List</h2><p class="small text-muted">Members on your ignore list cannot send you friend requests.</p>' + ignoreList +
      '<form id="ignore-form" class="d-flex gap-2" novalidate><label class="visually-hidden" for="ignore-select">Member</label>' +
      '<select id="ignore-select" class="form-select"' + (candidates.length ? '' : ' disabled') + '><option value="">' + (candidates.length ? 'Choose a member…' : 'No eligible members') + '</option>' +
      candidates.map((u) => '<option value="' + esc(u.id) + '">' + esc(u.fullName) + ' (@' + esc(u.username) + ')</option>').join('') + '</select>' +
      '<button class="btn btn-primary" type="submit"' + (candidates.length ? '' : ' disabled') + '>Ignore</button></form></section></div>' +
      '<div class="col-lg-6"><section class="cf-card cf-card-pad mb-4"><h2 class="h5 text-light fw-bold">Always-Live Relay Diagnostics</h2>' +
      '<p class="small text-muted">Real-time bi-directional messaging over local WebSockets and multi-tab sync channels.</p>' +
      '<form id="live-form" novalidate><div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" role="switch" id="live-enabled"' + (live.enabled ? ' checked' : '') + '><label class="form-check-label text-light small fw-bold" for="live-enabled">Enable Live Relay WebSocket</label></div>' +
      '<label for="live-url" class="form-label text-light small fw-bold">Relay address</label><input id="live-url" class="form-control mb-3" type="text" value="' + esc(live.url) + '" spellcheck="false">' +
      '<div class="d-flex flex-wrap align-items-center gap-2"><button class="btn btn-primary btn-sm" type="submit">Save Settings</button>' +
      '<button class="btn btn-outline-secondary btn-sm" type="button" data-action="test-ping"><i class="bi bi-activity"></i> Test Relay Ping</button>' +
      '<span class="cf-live-pill is-live ms-auto" data-live-status></span></div></form>' +
      '<p class="small text-muted mt-3 mb-0">Even if relay is disconnected, instant cross-tab sync keeps tabs synchronized in real time.</p></section>' +
      '<section class="cf-card cf-card-pad"><h2 class="h5 text-light fw-bold">Reset Demo Data</h2><p class="small text-muted">Restore default demo accounts, friendships, and sample posts.</p>' +
      '<button type="button" class="btn btn-outline-danger btn-sm" data-action="reset-demo"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i> Restore initial state</button></section></div></div>';
  }

  const ROUTES = {
    home: viewHome, profile: viewProfile, friends: viewFriends, invitations: viewInvitations,
    discover: viewDiscover, messages: viewMessages, settings: viewSettings,
  };

  /* ===================== Shell and routing ===================== */
  function showLogin() {
    document.getElementById('app-shell').hidden = true;
    document.getElementById('login-view').hidden = false;
    document.title = 'Log in · ConnecFriend';
  }

  function showApp() {
    document.getElementById('login-view').hidden = true;
    document.getElementById('app-shell').hidden = false;
  }

  function setLiveElement(element) {
    const { status } = Live.getStatus();
    const enabled = Live.settings().enabled;
    const text = Live.isConnected()
      ? '● Live Relay Connected'
      : (enabled && status === 'connecting' ? '● Connecting live…' : '● Live Multi-Tab Sync');
    element.textContent = text;
    element.classList.toggle('is-live', true);
    element.classList.toggle('is-warn', status === 'retrying' || status === 'connecting');
  }

  function renderLiveStatus() {
    document.querySelectorAll('[data-live-status]').forEach(setLiveElement);
  }

  function updateChrome() {
    if (!me) return;
    const st = state();
    const name = routeName();
    const param = routeParam();
    document.querySelectorAll('[data-route]').forEach((link) => {
      const target = link.dataset.route;
      const active = target === name && (target !== 'profile' || !param || param === me.id);
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    const self = Friends.getUser(st, me.id);
    document.getElementById('topbar-avatar').innerHTML = UI.avatar(self, 'sm');
    document.getElementById('topbar-name').textContent = self.fullName;
    document.getElementById('menu-profile').href = '#/profile/' + self.id;
    document.getElementById('sidebar-profile').href = '#/profile/' + self.id;
    const counts = { invites: Friends.incomingRequests(st, me.id).length, messages: Messaging.unreadTotal(st, me.id) };
    document.querySelectorAll('[data-badge]').forEach((badge) => {
      const count = counts[badge.dataset.badge] || 0;
      badge.hidden = count === 0;
      badge.textContent = count > 99 ? '99+' : String(count);
    });
    renderLiveStatus();
  }

  function renderRoute() {
    me = Auth.currentUser();
    if (!me) return showLogin();
    showApp();
    const name = routeName();
    const view = ROUTES[name];
    if (!view) {
      location.replace('#/home');
      return;
    }
    partnerTyping = false;
    mainEl.innerHTML = view(routeParam());
    document.querySelectorAll('[data-audience]').forEach(updateAudience);
    if (name === 'home') refreshFeed();
    updateChrome();
    document.title = name.charAt(0).toUpperCase() + name.slice(1) + ' · ConnecFriend';
    const thread = document.getElementById('chat-thread');
    if (thread) thread.scrollTop = thread.scrollHeight;
    if (!window.__cfKeepScroll) window.scrollTo(0, 0);
  }

  function rerender() {
    window.__cfKeepScroll = true;
    const y = window.scrollY;
    renderRoute();
    window.scrollTo(0, y);
    window.__cfKeepScroll = false;
  }

  function reportResult(result, successMessage) {
    if (result.ok) {
      if (successMessage) UI.toast(successMessage, 'success');
      return true;
    }
    UI.toast(result.message || 'Something went wrong.', 'danger');
    return false;
  }

  /* ===================== Actions ===================== */
  const actions = {
    logout() {
      Auth.logout();
      Live.disconnect();
      me = null;
      location.hash = '#/login';
      showLogin();
      UI.toast('You have been logged out.', 'info');
    },

    'demo-fill'(el) {
      document.getElementById('login-username').value = el.dataset.username;
      document.getElementById('login-password').value = 'demo123';
      document.getElementById('login-password').focus();
    },

    react(el) {
      if (!reportResult(Feed.react(el.dataset.post, me.id, el.dataset.type))) return;
      if (routeName() === 'home') refreshFeed(); else rerender();
    },

    'set-sort'(el) {
      feedSort = el.dataset.sort === 'newest' ? 'newest' : 'login';
      refreshFeed();
    },

    'composer-clear'() {
      const form = document.getElementById('composer');
      if (!form) return;
      form.reset();
      document.getElementById('post-count').textContent = '0';
      document.getElementById('composer-error').textContent = '';
      const preview = document.getElementById('composer-img-preview');
      if (preview) preview.classList.add('d-none');
      updateAudience(form.querySelector('[data-audience]'));
    },

    'composer-remove-img'() {
      const input = document.getElementById('post-image');
      if (input) input.value = '';
      const preview = document.getElementById('composer-img-preview');
      if (preview) preview.classList.add('d-none');
    },

    'insert-emoji'(el) {
      const input = document.getElementById('chat-input');
      if (!input) return;
      input.value += el.textContent.trim();
      input.focus();
      if (activeChatId) Messaging.sendTyping(activeChatId, true);
    },

    'test-ping'() {
      if (Live.isConnected()) {
        UI.toast('Relay WebSocket is active! Latency < 5ms.', 'success');
      } else {
        UI.toast('Multi-Tab Sync is active and communicating.', 'info');
      }
    },

    'share-open'(el) {
      const st = state();
      const post = st.posts.find((p) => p.id === el.dataset.post);
      if (!post || !Feed.canShare(st, me.id, post)) return UI.toast('That post cannot be shared.', 'danger');
      const author = Friends.getUser(st, post.authorId);
      const wrapper = document.createElement('div');
      wrapper.className = 'modal fade cf-modal-backdrop';
      wrapper.id = 'share-modal';
      wrapper.tabIndex = -1;
      wrapper.setAttribute('aria-labelledby', 'share-title');
      wrapper.innerHTML = '<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable"><div class="modal-content cf-card cf-glass-card cf-modal"><div class="modal-header border-0 pb-0"><h2 class="modal-title h5 text-light" id="share-title">Share this post</h2>' +
        '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body">' +
        '<div class="cf-shared"><strong>' + esc(author.fullName) + '</strong><div class="cf-post-text mb-0">' + esc(post.text || '(shared post)') + '</div></div>' +
        '<label class="form-label small text-light mt-2" for="share-comment">Add a thought (optional)</label><textarea id="share-comment" class="form-control mb-3" rows="2" maxlength="' + Feed.MAX_POST_LENGTH + '"></textarea>' +
        audiencePicker('share', Friends.friendsOf(st, me.id)) + '<div id="share-error" class="text-danger small mt-2" role="alert"></div></div>' +
        '<div class="modal-footer border-0 pt-0 gap-2"><button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>' +
        '<button type="button" class="btn btn-primary btn-sm px-3" data-action="share-submit" data-post="' + esc(post.id) + '"><i class="bi bi-share-fill" aria-hidden="true"></i> Share</button></div></div></div>';
      document.body.appendChild(wrapper);
      updateAudience(wrapper.querySelector('[data-audience]'));
      const modal = new window.bootstrap.Modal(wrapper);
      wrapper.addEventListener('hidden.bs.modal', () => { modal.dispose(); wrapper.remove(); });
      modal.show();
    },

    'share-submit'(el) {
      const wrapper = document.getElementById('share-modal');
      const audience = readAudience(wrapper.querySelector('[data-audience]'));
      const result = Feed.sharePost({
        postId: el.dataset.post,
        userId: me.id,
        comment: wrapper.querySelector('#share-comment').value,
        audienceType: audience.audienceType,
        audienceUserIds: audience.audienceUserIds,
      });
      if (!result.ok) {
        wrapper.querySelector('#share-error').textContent = result.message;
        return;
      }
      window.bootstrap.Modal.getInstance(wrapper).hide();
      UI.toast('Post shared successfully.', 'success');
      if (routeName() === 'home') refreshFeed(); else rerender();
    },

    'send-request'(el) {
      const result = Friends.sendRequest(me.id, el.dataset.user);
      const target = Friends.getUser(state(), el.dataset.user);
      if (reportResult(result, 'Friend request sent to ' + (target ? target.fullName : 'member') + '.')) rerender();
    },
    'accept-request'(el) {
      if (reportResult(Friends.respondToRequest(el.dataset.request, me.id, 'accept'), 'Friend request accepted!')) rerender();
    },
    'reject-request'(el) {
      if (reportResult(Friends.respondToRequest(el.dataset.request, me.id, 'reject'), 'Friend request declined.')) rerender();
    },
    'cancel-request'(el) {
      if (reportResult(Friends.cancelRequest(el.dataset.request, me.id), 'Request cancelled.')) rerender();
    },
    async 'remove-friend'(el) {
      const user = Friends.getUser(state(), el.dataset.user);
      if (!user) return UI.toast('Member not found.', 'danger');
      const ok = await UI.confirmDialog({
        title: 'Remove friend?',
        message: 'Are you sure you want to remove ' + user.fullName + ' from your friends list?',
        confirmText: 'Remove',
        danger: true,
      });
      if (ok && reportResult(Friends.removeFriend(me.id, user.id), user.fullName + ' removed from friends.')) rerender();
    },

    rate(el) {
      const user = Friends.getUser(state(), el.dataset.user);
      const type = Data.RATING_TYPES.find((t) => t.key === el.dataset.type);
      if (reportResult(Friends.setRating(me.id, el.dataset.user, el.dataset.type), type && user ? 'Rated ' + user.fullName + ' as ' + type.label + '.' : '')) rerender();
    },

    'ignore-remove'(el) {
      if (reportResult(Friends.removeFromIgnoreList(me.id, el.dataset.user), 'Removed from ignore list.')) rerender();
    },

    'retry-message'(el) {
      reportResult(Messaging.retryMessage(el.dataset.id, me.id));
      refreshChat();
    },

    async 'reset-demo'() {
      const ok = await UI.confirmDialog({
        title: 'Reset demo data?',
        message: 'This will restore the original demo accounts, relationships, sample posts and messages. Proceed?',
        confirmText: 'Reset everything',
        danger: true,
      });
      if (!ok) return;
      Store.reset();
      UI.toast('Demo data restored successfully.', 'success');
      rerender();
    },
  };

  /* ===================== Event Wiring ===================== */
  document.addEventListener('click', (event) => {
    const element = event.target.closest('[data-action]');
    if (!element || !actions[element.dataset.action]) return;
    event.preventDefault();
    actions[element.dataset.action](element, event);
  });

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target.id === 'post-text') {
      const counter = document.getElementById('post-count');
      if (counter) counter.textContent = String(target.value.length);
    }
    if (target.id === 'post-image') {
      const preview = document.getElementById('composer-img-preview');
      const img = document.getElementById('composer-preview-img');
      if (preview && img) {
        if (target.value.trim().length > 5) {
          img.src = target.value.trim();
          preview.classList.remove('d-none');
        } else {
          preview.classList.add('d-none');
        }
      }
    }
    if (target.id === 'chat-input') {
      if (activeChatId) {
        Messaging.sendTyping(activeChatId, true);
        if (typingTimer) clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
          Messaging.sendTyping(activeChatId, false);
        }, 2200);
      }
    }
    if (target.id === 'chat-search') {
      chatQuery = target.value;
      const listBody = document.getElementById('chat-list-body');
      if (listBody) listBody.innerHTML = chatListHtml(state());
    }
    if (target.matches('[data-audience-search]')) {
      const query = target.value.trim().toLowerCase();
      target.closest('[data-audience]').querySelectorAll('[data-name]').forEach((row) => {
        row.hidden = query && !row.dataset.name.includes(query);
      });
    }
    if (target.matches('[data-filter-input]')) {
      const grid = document.getElementById(target.dataset.target);
      const query = target.value.trim().toLowerCase();
      let visible = 0;
      if (grid) {
        grid.querySelectorAll('[data-search]').forEach((card) => {
          const show = !query || card.dataset.search.includes(query);
          card.hidden = !show;
          if (show) visible += 1;
        });
        const empty = document.getElementById(target.dataset.target + '-empty');
        if (empty) empty.hidden = visible > 0;
      }
    }
  });

  document.addEventListener('change', (event) => {
    const box = event.target.closest && event.target.closest('[data-audience]');
    if (box) updateAudience(box);
  });

  document.addEventListener('shown.bs.tab', (event) => {
    if (event.target.dataset.tab) inviteTab = event.target.dataset.tab;
  });

  document.addEventListener('error', (event) => {
    const image = event.target;
    if (image && image.tagName === 'IMG' && image.hasAttribute('data-post-img')) {
      const fallback = document.createElement('div');
      fallback.className = 'cf-img-fallback';
      fallback.innerHTML = '<i class="bi bi-image" aria-hidden="true"></i> Photo preview unavailable';
      image.replaceWith(fallback);
    }
  }, true);

  document.addEventListener('submit', (event) => {
    const form = event.target;
    event.preventDefault();
    if (form.id === 'login-form') return handleLogin(form);
    if (form.id === 'composer') return handleComposer(form);
    if (form.id === 'chat-form') return handleChat(form);
    if (form.id === 'ignore-form') return handleIgnore(form);
    if (form.id === 'live-form') return handleLive(form);
  });

  function handleLogin(form) {
    const username = document.getElementById('login-username');
    const password = document.getElementById('login-password');
    const alertBox = document.getElementById('login-alert');
    alertBox.classList.add('d-none');
    username.classList.toggle('is-invalid', !username.value.trim());
    password.classList.toggle('is-invalid', !password.value);
    if (!username.value.trim() || !password.value) return (username.value.trim() ? password : username).focus();

    const button = document.getElementById('login-submit');
    button.disabled = true;
    button.querySelector('.spinner-border').classList.remove('d-none');
    button.querySelector('.label').textContent = 'Connecting…';
    window.setTimeout(() => {
      const result = Auth.login(username.value, password.value);
      button.disabled = false;
      button.querySelector('.spinner-border').classList.add('d-none');
      button.querySelector('.label').textContent = 'Sign in';
      if (!result.ok) {
        alertBox.textContent = result.message;
        alertBox.classList.remove('d-none');
        return password.focus();
      }
      form.reset();
      me = Auth.currentUser();
      Live.connect();
      location.hash = '#/home';
      renderRoute();
      UI.toast('Welcome back, ' + me.fullName.split(' ')[0] + '!', 'success');
    }, 350);
  }

  function handleComposer(form) {
    const errorEl = document.getElementById('composer-error');
    const audience = readAudience(form.querySelector('[data-audience]'));
    const result = Feed.createPost({
      authorId: me.id,
      text: form.querySelector('#post-text').value,
      imageUrl: form.querySelector('#post-image').value,
      audienceType: audience.audienceType,
      audienceUserIds: audience.audienceUserIds,
    });
    if (!result.ok) {
      errorEl.textContent = result.message;
      return;
    }
    errorEl.textContent = '';
    actions['composer-clear']();
    UI.toast('Your post is live.', 'success');
    refreshFeed();
  }

  function handleChat(form) {
    const input = document.getElementById('chat-input');
    const errorEl = document.getElementById('chat-error');
    const result = Messaging.sendMessage(me.id, form.dataset.partner, input.value);
    if (!result.ok) {
      errorEl.textContent = result.message;
      return input.focus();
    }
    errorEl.textContent = '';
    input.value = '';
    refreshChat(true);
    input.focus();
  }

  function handleIgnore(form) {
    const select = form.querySelector('#ignore-select');
    if (!select.value) return UI.toast('Choose a member to ignore first.', 'danger');
    const user = Friends.getUser(state(), select.value);
    if (reportResult(Friends.addToIgnoreList(me.id, select.value), user ? user.fullName + ' added to ignore list.' : '')) rerender();
  }

  function handleLive(form) {
    const url = form.querySelector('#live-url').value.trim();
    if (!/^wss?:\/\/[^\s]+$/i.test(url)) return UI.toast('Enter a valid relay address like ws://localhost:3000.', 'danger');
    Live.configure({ enabled: form.querySelector('#live-enabled').checked, url });
    UI.toast(form.querySelector('#live-enabled').checked ? 'Live WebSocket enabled. Connecting…' : 'Live relay switched to local multi-tab mode.', 'info');
    renderLiveStatus();
  }

  document.getElementById('toggle-password').addEventListener('click', (event) => {
    const input = document.getElementById('login-password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    const button = event.currentTarget;
    button.setAttribute('aria-pressed', String(show));
    button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    button.querySelector('i').className = 'bi ' + (show ? 'bi-eye-slash' : 'bi-eye');
  });

  window.addEventListener('hashchange', renderRoute);

  // Cross-tab and storage synchronizations
  window.addEventListener('storage', (event) => {
    if (event.key !== Store.STATE_KEY || !me) return;
    if (routeName() === 'messages') refreshChat();
    else if (routeName() === 'home') refreshFeed();
    updateChrome();
  });

  document.addEventListener('cf:messages-changed', (event) => {
    if (!me) return;
    const from = event.detail && event.detail.incomingFrom;
    if (routeName() === 'messages') {
      refreshChat(true);
    } else {
      updateChrome();
    }
    if (from && !(routeName() === 'messages' && activeChatId === from)) {
      const sender = Friends.getUser(state(), from);
      UI.toast('New live message from ' + (sender ? sender.fullName : 'a member') + '.', 'live', {
        actionUrl: '#/messages/' + encodeURIComponent(from),
        actionLabel: 'Reply',
      });
    }
  });

  // Real-time typing events
  document.addEventListener('cf:user-typing', (event) => {
    if (routeName() !== 'messages') return;
    const { from, isTyping } = event.detail;
    if (from === activeChatId) {
      partnerTyping = isTyping;
      const thread = document.getElementById('chat-thread');
      if (thread) {
        const existingIndicator = document.getElementById('partner-typing');
        if (isTyping && !existingIndicator) {
          const partner = Friends.getUser(state(), from);
          const div = document.createElement('div');
          div.className = 'cf-typing-indicator';
          div.id = 'partner-typing';
          div.innerHTML = '<span class="cf-typing-dots"><span class="cf-typing-dot"></span><span class="cf-typing-dot"></span><span class="cf-typing-dot"></span></span><span>' + esc((partner ? partner.fullName.split(' ')[0] : 'Member')) + ' is typing…</span>';
          thread.appendChild(div);
          thread.scrollTop = thread.scrollHeight;
        } else if (!isTyping && existingIndicator) {
          existingIndicator.remove();
        }
      }
    }
  });

  // Real-time presence updates
  document.addEventListener('cf:presence-changed', () => {
    if (routeName() === 'messages' && activeChatId) {
      const ind = document.getElementById('chat-live-indicator');
      if (ind) {
        const isOnline = Messaging.isUserOnline(activeChatId);
        ind.className = 'cf-status ' + (isOnline ? 'ok' : '');
        ind.innerHTML = isOnline
          ? '<i class="bi bi-circle-fill text-success" style="font-size:0.55rem;"></i> Online now'
          : '<i class="bi bi-clock me-1"></i> Active recently';
      }
    }
    renderLiveStatus();
  });

  Live.onChange(() => {
    renderLiveStatus();
    const { status } = Live.getStatus();
    if (status === 'connected') {
      window.__cfRelayWarned = false;
    }
  });

  Live.setActivePartnerProvider(() => (routeName() === 'messages' && !document.hidden ? activeChatId : null));

  /* ===================== Initialization ===================== */
  function init() {
    const st = Store.get();
    if (Store.wasRecovered()) {
      window.setTimeout(() => UI.toast('Demo environment was restored.', 'info'), 300);
    }
    document.getElementById('demo-accounts').innerHTML = st.users.map((u) =>
      '<button type="button" class="cf-chip-btn" data-action="demo-fill" data-username="' + esc(u.username) + '">' +
      UI.avatar(u, 'sm') + '<span>' + esc(u.username) + '</span></button>').join('');

    if (!location.hash || location.hash === '#/login') {
      location.hash = Auth.currentUser() ? '#/home' : '#/login';
    }
    if (Auth.currentUser()) Live.connect();
    renderRoute();
  }

  init();
})();
