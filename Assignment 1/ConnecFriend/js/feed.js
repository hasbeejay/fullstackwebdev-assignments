/* feed.js — posts, audience visibility, likes/dislikes and sharing. */
(function () {
  const CF = (window.CF = window.CF || {});

  const MAX_POST_LENGTH = 500;
  const fail = (code, message) => ({ ok: false, code, message });

  /* ---------- Visibility (the single source of truth) ---------- */
  function canViewPost(state, viewerId, post) {
    if (!post || !viewerId) return false;
    if (post.authorId === viewerId) return true;
    if (!CF.Friends.areFriends(state, viewerId, post.authorId)) return false;
    if (post.audienceType === 'all') return true;
    if (post.audienceType === 'selected') return Array.isArray(post.audienceUserIds) && post.audienceUserIds.includes(viewerId);
    return false;
  }

  /**
   * Posts the viewer may see. sortMode 'login' orders by the author's last login (latest first),
   * then by post time; 'newest' orders by post time only.
   */
  function feedFor(state, viewerId, sortMode) {
    const visible = state.posts.filter((post) => canViewPost(state, viewerId, post));
    const loginOf = (post) => (CF.Friends.getUser(state, post.authorId) || {}).lastLoginAt || 0;
    return visible.sort((a, b) => {
      if (sortMode !== 'newest') {
        const byLogin = loginOf(b) - loginOf(a);
        if (byLogin !== 0) return byLogin;
      }
      return b.createdAt - a.createdAt;
    });
  }

  /** Posts on someone's profile, filtered by what the viewer is allowed to see. */
  function postsByAuthor(state, authorId, viewerId) {
    return state.posts.filter((p) => p.authorId === authorId && canViewPost(state, viewerId, p)).sort((a, b) => b.createdAt - a.createdAt);
  }

  /* ---------- Validation ---------- */
  function validateImageUrl(value) {
    const url = String(value || '').trim();
    if (!url) return { ok: true, url: '' };
    if (url.length > 2000) return fail('bad_image', 'That image address is too long.');
    if (/^data:image\/(png|jpeg|gif|webp|svg\+xml)[;,]/i.test(url)) return { ok: true, url };
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return { ok: true, url: parsed.href };
    } catch (error) {
      /* fall through */
    }
    return fail('bad_image', 'Enter a valid image link starting with http:// or https://.');
  }

  function validateAudience(state, authorId, audienceType, audienceUserIds) {
    if (audienceType === 'all') return { ok: true, audienceUserIds: [] };
    if (audienceType !== 'selected') return fail('bad_audience', 'Choose who can see this post.');
    const unique = Array.from(new Set(Array.isArray(audienceUserIds) ? audienceUserIds : []));
    if (unique.length === 0) return fail('no_audience', 'Select at least one friend to share with.');
    if (!unique.every((id) => CF.Friends.areFriends(state, authorId, id))) return fail('bad_audience', 'You can only share with people on your friends list.');
    return { ok: true, audienceUserIds: unique };
  }

  /* ---------- Creating and sharing ---------- */
  function createPost(input) {
    return CF.Store.update((state) => {
      const author = CF.Friends.getUser(state, input.authorId);
      if (!author) return fail('missing_user', 'You need to be logged in to post.');
      const text = String(input.text || '').trim();
      if (!text) return fail('empty', 'Write something before sharing.');
      if (text.length > MAX_POST_LENGTH) return fail('too_long', 'Posts can be at most ' + MAX_POST_LENGTH + ' characters.');
      const image = validateImageUrl(input.imageUrl);
      if (!image.ok) return image;
      const audience = validateAudience(state, author.id, input.audienceType, input.audienceUserIds);
      if (!audience.ok) return audience;

      const post = {
        id: CF.Store.newId('p'), authorId: author.id, text, imageUrl: image.url, createdAt: Date.now(),
        audienceType: input.audienceType, audienceUserIds: audience.audienceUserIds, sharedPostId: null,
      };
      state.posts.push(post);
      return { ok: true, post };
    });
  }

  function canShare(state, userId, post) {
    return !!post && canViewPost(state, userId, post) && (post.audienceType === 'all' || post.authorId === userId);
  }

  function sharePost(input) {
    return CF.Store.update((state) => {
      const original = state.posts.find((p) => p.id === input.postId);
      if (!original) return fail('missing_post', 'That post no longer exists.');
      if (!canViewPost(state, input.userId, original)) return fail('forbidden', 'You cannot see that post.');
      if (!canShare(state, input.userId, original)) return fail('restricted', 'Posts shared with selected friends cannot be reshared.');
      const comment = String(input.comment || '').trim();
      if (comment.length > MAX_POST_LENGTH) return fail('too_long', 'Comments can be at most ' + MAX_POST_LENGTH + ' characters.');
      const audience = validateAudience(state, input.userId, input.audienceType, input.audienceUserIds);
      if (!audience.ok) return audience;

      // Always point at the root post so shares of shares do not nest.
      const rootId = original.sharedPostId || original.id;
      const post = {
        id: CF.Store.newId('p'), authorId: input.userId, text: comment, imageUrl: '', createdAt: Date.now(),
        audienceType: input.audienceType, audienceUserIds: audience.audienceUserIds, sharedPostId: rootId,
      };
      state.posts.push(post);
      return { ok: true, post };
    });
  }

  /* ---------- Reactions: exactly one record per (post, user) ---------- */
  function reactionSummary(state, postId, viewerId) {
    let likes = 0;
    let dislikes = 0;
    let mine = null;
    state.reactions.forEach((r) => {
      if (r.postId !== postId) return;
      if (r.type === 'like') likes += 1;
      if (r.type === 'dislike') dislikes += 1;
      if (r.userId === viewerId) mine = r.type;
    });
    return { likes, dislikes, mine };
  }

  /** Clicking the active reaction removes it; clicking the other one switches. */
  function react(postId, userId, type) {
    if (type !== 'like' && type !== 'dislike') return fail('bad_reaction', 'Unknown reaction.');
    return CF.Store.update((state) => {
      const post = state.posts.find((p) => p.id === postId);
      if (!post) return fail('missing_post', 'That post no longer exists.');
      if (!CF.Friends.getUser(state, userId)) return fail('missing_user', 'You need to be logged in to react.');
      if (!canViewPost(state, userId, post)) return fail('forbidden', 'You cannot react to a post you cannot see.');

      const previous = state.reactions.find((r) => r.postId === postId && r.userId === userId);
      state.reactions = state.reactions.filter((r) => !(r.postId === postId && r.userId === userId));
      const mine = previous && previous.type === type ? null : type;
      if (mine) state.reactions.push({ id: CF.Store.newId('x'), postId, userId, type: mine });
      return { ok: true, mine };
    });
  }

  CF.Feed = {
    MAX_POST_LENGTH, canViewPost, feedFor, postsByAuthor, validateImageUrl, createPost, canShare, sharePost, reactionSummary, react,
  };
})();
