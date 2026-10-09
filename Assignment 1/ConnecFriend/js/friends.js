/* friends.js — relationships, friend requests, ratings and the ignore list.
   Every rule is enforced here (not just in the UI). */
(function () {
  const CF = (window.CF = window.CF || {});

  const fail = (code, message) => ({ ok: false, code, message });
  const pairKey = (a, b) => [a, b].sort().join('|');

  /* ---------- Lookups (read-only) ---------- */
  function getUser(state, userId) {
    return state.users.find((u) => u.id === userId) || null;
  }

  function areFriends(state, a, b) {
    const key = pairKey(a, b);
    return state.friendships.some((f) => pairKey(f.userAId, f.userBId) === key);
  }

  function pendingBetween(state, a, b) {
    return (
      state.friendRequests.find(
        (r) => r.status === 'pending' && ((r.senderId === a && r.recipientId === b) || (r.senderId === b && r.recipientId === a))
      ) || null
    );
  }

  /** One of: self | friends | pending_out | pending_in | ignoring | ignored_by_them | none | unknown */
  function relationship(state, viewerId, otherId) {
    const viewer = getUser(state, viewerId);
    const other = getUser(state, otherId);
    if (!viewer || !other) return 'unknown';
    if (viewerId === otherId) return 'self';
    if (areFriends(state, viewerId, otherId)) return 'friends';
    const pending = pendingBetween(state, viewerId, otherId);
    if (pending) return pending.senderId === viewerId ? 'pending_out' : 'pending_in';
    if (viewer.ignoredUserIds.includes(otherId)) return 'ignoring';
    if (other.ignoredUserIds.includes(viewerId)) return 'ignored_by_them';
    return 'none';
  }

  /** Friends of a user as user objects, most recent login first. */
  function friendsOf(state, userId) {
    return state.friendships
      .filter((f) => f.userAId === userId || f.userBId === userId)
      .map((f) => getUser(state, f.userAId === userId ? f.userBId : f.userAId))
      .filter(Boolean)
      .sort((a, b) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0));
  }

  const incomingRequests = (state, userId) => state.friendRequests.filter((r) => r.status === 'pending' && r.recipientId === userId);
  const outgoingRequests = (state, userId) => state.friendRequests.filter((r) => r.status === 'pending' && r.senderId === userId);

  function getRating(state, raterId, ratedUserId) {
    const found = state.ratings.find((r) => r.raterId === raterId && r.ratedUserId === ratedUserId);
    return found ? found.ratingType : null;
  }

  /* ---------- Friend requests ---------- */
  function sendRequest(senderId, recipientId) {
    return CF.Store.update((state) => {
      const sender = getUser(state, senderId);
      const recipient = getUser(state, recipientId);
      if (!sender || !recipient) return fail('missing_user', 'That member could not be found.');
      if (senderId === recipientId) return fail('self', 'You cannot send a friend request to yourself.');
      if (areFriends(state, senderId, recipientId)) return fail('already_friends', 'You are already friends with ' + recipient.fullName + '.');

      const pending = pendingBetween(state, senderId, recipientId);
      if (pending && pending.senderId === senderId) return fail('duplicate', 'You already sent ' + recipient.fullName + ' a request that is still pending.');
      if (pending) return fail('incoming_exists', recipient.fullName + ' already sent you a request. Accept it from your invitations.');

      // Ignore-list rule: the recipient's ignore list is checked inside the request logic itself.
      if (recipient.ignoredUserIds.includes(senderId)) {
        return fail('ignored', 'Your request to ' + recipient.fullName + ' could not be sent. This member is not accepting requests from you.');
      }
      if (sender.ignoredUserIds.includes(recipientId)) {
        return fail('sender_ignores', 'You have ' + recipient.fullName + ' on your ignore list. Remove them from it first.');
      }

      const now = Date.now();
      const request = { id: CF.Store.newId('r'), senderId, recipientId, status: 'pending', createdAt: now, updatedAt: now };
      state.friendRequests.push(request);
      return { ok: true, request };
    });
  }

  function findPendingRequestFor(state, requestId) {
    return state.friendRequests.find((r) => r.id === requestId && r.status === 'pending') || null;
  }

  function respondToRequest(requestId, userId, decision) {
    if (decision !== 'accept' && decision !== 'reject') return fail('bad_decision', 'Unknown decision.');
    return CF.Store.update((state) => {
      const request = findPendingRequestFor(state, requestId);
      if (!request) return fail('missing_request', 'That invitation no longer exists.');
      if (request.recipientId !== userId) return fail('not_recipient', 'Only the recipient can answer this invitation.');
      if (!getUser(state, request.senderId)) return fail('missing_user', 'The sender no longer exists.');

      request.updatedAt = Date.now();
      if (decision === 'reject') {
        request.status = 'rejected';
        return { ok: true, request };
      }
      request.status = 'accepted';
      if (!areFriends(state, request.senderId, request.recipientId)) {
        state.friendships.push({ id: CF.Store.newId('f'), userAId: request.senderId, userBId: request.recipientId, createdAt: Date.now() });
      }
      return { ok: true, request };
    });
  }

  function cancelRequest(requestId, userId) {
    return CF.Store.update((state) => {
      const request = findPendingRequestFor(state, requestId);
      if (!request) return fail('missing_request', 'That request is no longer pending.');
      if (request.senderId !== userId) return fail('not_sender', 'Only the sender can cancel a request.');
      request.status = 'cancelled';
      request.updatedAt = Date.now();
      return { ok: true, request };
    });
  }

  function removeFriend(userId, friendId) {
    return CF.Store.update((state) => {
      if (!areFriends(state, userId, friendId)) return fail('not_friends', 'You are not friends with this member.');
      const key = pairKey(userId, friendId);
      state.friendships = state.friendships.filter((f) => pairKey(f.userAId, f.userBId) !== key);
      state.ratings = state.ratings.filter((r) => pairKey(r.raterId, r.ratedUserId) !== key);
      return { ok: true };
    });
  }

  /* ---------- Ratings ---------- */
  function setRating(raterId, ratedUserId, ratingType) {
    return CF.Store.update((state) => {
      if (raterId === ratedUserId) return fail('self', 'You cannot rate yourself.');
      if (!getUser(state, raterId) || !getUser(state, ratedUserId)) return fail('missing_user', 'That member could not be found.');
      if (!CF.Data.RATING_TYPES.some((t) => t.key === ratingType)) return fail('bad_rating', 'Choose Stupid, Cool or Trustworthy.');
      if (!areFriends(state, raterId, ratedUserId)) return fail('not_friends', 'You can only rate people on your friends list.');

      const existing = state.ratings.find((r) => r.raterId === raterId && r.ratedUserId === ratedUserId);
      if (existing) existing.ratingType = ratingType;
      else state.ratings.push({ id: CF.Store.newId('g'), raterId, ratedUserId, ratingType });
      return { ok: true };
    });
  }

  /* ---------- Ignore list ---------- */
  function addToIgnoreList(userId, targetId) {
    return CF.Store.update((state) => {
      const user = getUser(state, userId);
      const target = getUser(state, targetId);
      if (!user || !target) return fail('missing_user', 'That member could not be found.');
      if (userId === targetId) return fail('self', 'You cannot ignore yourself.');
      if (areFriends(state, userId, targetId)) return fail('is_friend', 'Remove ' + target.fullName + ' from your friends before ignoring them.');
      if (user.ignoredUserIds.includes(targetId)) return fail('duplicate', target.fullName + ' is already on your ignore list.');

      user.ignoredUserIds.push(targetId);
      // Any pending request between the two is withdrawn so no stale invitation remains.
      state.friendRequests.forEach((r) => {
        if (r.status === 'pending' && ((r.senderId === userId && r.recipientId === targetId) || (r.senderId === targetId && r.recipientId === userId))) {
          r.status = r.senderId === userId ? 'cancelled' : 'rejected';
          r.updatedAt = Date.now();
        }
      });
      return { ok: true };
    });
  }

  function removeFromIgnoreList(userId, targetId) {
    return CF.Store.update((state) => {
      const user = getUser(state, userId);
      if (!user) return fail('missing_user', 'That member could not be found.');
      if (!user.ignoredUserIds.includes(targetId)) return fail('not_ignored', 'That member is not on your ignore list.');
      user.ignoredUserIds = user.ignoredUserIds.filter((id) => id !== targetId);
      return { ok: true };
    });
  }

  CF.Friends = {
    getUser, areFriends, pendingBetween, relationship, friendsOf, incomingRequests, outgoingRequests, getRating,
    sendRequest, respondToRequest, cancelRequest, removeFriend, setRating, addToIgnoreList, removeFromIgnoreList,
  };
})();
