/* data.js — Constants and demo accounts seed for ConnecFriend.
   Demo accounts: Haseeb, Raheem, Taimur, Aneeq, Obaid (password: demo123). */
(function () {
  const CF = (window.CF = window.CF || {});

  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  const RATING_TYPES = [
    { key: 'cool', label: 'Cool', icon: 'bi-emoji-sunglasses' },
    { key: 'trustworthy', label: 'Trustworthy', icon: 'bi-shield-check' },
    { key: 'stupid', label: 'Stupid', icon: 'bi-emoji-dizzy' },
  ];

  function scene(colorA, colorB, shape) {
    const shapes = {
      hills: '<path d="M0 340 Q200 220 400 320 T800 290 V450 H0Z" fill="rgba(255,255,255,.35)"/><circle cx="620" cy="120" r="55" fill="rgba(255,255,255,.7)"/>',
      city: '<g fill="rgba(255,255,255,.35)"><rect x="80" y="220" width="90" height="230"/><rect x="190" y="150" width="110" height="300"/><rect x="320" y="250" width="80" height="200"/><rect x="420" y="190" width="120" height="260"/><rect x="560" y="260" width="150" height="190"/></g>',
      waves: '<path d="M0 260 Q100 200 200 260 T400 260 T600 260 T800 260 V450 H0Z" fill="rgba(255,255,255,.3)"/><path d="M0 330 Q100 280 200 330 T400 330 T600 330 T800 330 V450 H0Z" fill="rgba(255,255,255,.3)"/>',
    };
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + colorA + '"/><stop offset="1" stop-color="' + colorB + '"/></linearGradient></defs>' +
      '<rect width="800" height="450" fill="url(#g)"/>' + (shapes[shape] || shapes.hills) + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function makeUser(id, username, fullName, color, location, bio, interests, lastLoginAt, ignoredUserIds) {
    return {
      id,
      username,
      password: 'demo123',
      fullName,
      color,
      location,
      bio,
      interests,
      lastLoginAt,
      ignoredUserIds: ignoredUserIds || [],
    };
  }

  function createSeed(now) {
    const t = typeof now === 'number' ? now : Date.now();
    const ago = (ms) => t - ms;

    const users = [
      makeUser(
        'u_haseeb',
        'haseeb',
        'Haseeb',
        '#6366f1',
        'Islamabad, Pakistan',
        'Full Stack Dev & CS student. Love clean UI, systems, and brewing black coffee.',
        ['Web Dev', 'Algorithms', 'UI Design', 'Hackathons'],
        ago(5 * MINUTE)
      ),
      makeUser(
        'u_raheem',
        'raheem',
        'Raheem',
        '#06b6d4',
        'Islamabad, Pakistan',
        'Full Stack Web Development (CS 301). Passionate about real-time web apps and glassmorphism UI.',
        ['Frontend', 'Node.js', 'WebSockets', 'Cybersecurity'],
        ago(1 * MINUTE)
      ),
      makeUser(
        'u_taimur',
        'taimur',
        'Taimur',
        '#d946ef',
        'Rawalpindi, Pakistan',
        'Building modern cloud backends and distributed systems. Keyboard enthusiast.',
        ['Cloud', 'Databases', 'APIs', 'Gaming'],
        ago(20 * MINUTE)
      ),
      makeUser(
        'u_aneeq',
        'aneeq',
        'Aneeq',
        '#10b981',
        'Lahore, Pakistan',
        'Creative technologist & frontend developer. Passionate about interactive web animations.',
        ['CSS Animations', 'Design Systems', 'React', 'Photography'],
        ago(1 * HOUR)
      ),
      makeUser(
        'u_obaid',
        'obaid',
        'Obaid',
        '#f59e0b',
        'Peshawar, Pakistan',
        'AI & machine learning enthusiast. Exploring agentic architectures and web interfaces.',
        ['Machine Learning', 'Python', 'DevOps', 'Cricket'],
        ago(3 * HOUR),
        ['u_aneeq'] // has Aneeq on ignore list demo
      ),
    ];

    const friendship = (id, a, b, ms) => ({ id, userAId: a, userBId: b, createdAt: ago(ms) });
    const friendships = [
      friendship('f1', 'u_raheem', 'u_haseeb', 35 * DAY),
      friendship('f2', 'u_raheem', 'u_taimur', 30 * DAY),
      friendship('f3', 'u_haseeb', 'u_taimur', 25 * DAY),
      friendship('f4', 'u_raheem', 'u_aneeq', 20 * DAY),
      friendship('f5', 'u_taimur', 'u_obaid', 15 * DAY),
      friendship('f6', 'u_aneeq', 'u_obaid', 10 * DAY),
    ];

    const request = (id, from, to, status, ms) => ({ id, senderId: from, recipientId: to, status, createdAt: ago(ms), updatedAt: ago(ms) });
    const friendRequests = [
      request('r1', 'u_obaid', 'u_haseeb', 'pending', 2 * HOUR), // incoming for Haseeb
      request('r2', 'u_haseeb', 'u_aneeq', 'pending', 4 * HOUR), // outgoing from Haseeb
      request('r3', 'u_obaid', 'u_raheem', 'pending', 1 * HOUR), // incoming for Raheem
    ];

    const post = (id, authorId, text, ms, audienceType, audienceUserIds, imageUrl) => ({
      id,
      authorId,
      text,
      imageUrl: imageUrl || '',
      createdAt: ago(ms),
      audienceType,
      audienceUserIds: audienceUserIds || [],
      sharedPostId: null,
    });

    const posts = [
      post(
        'p1',
        'u_raheem',
        'Our CS 301 Full Stack project just got an aesthetic glassmorphism makeover! Real-time WebSockets and smooth animations looking clean.',
        15 * MINUTE,
        'all',
        [],
        scene('#6366f1', '#8b5cf6', 'city')
      ),
      post(
        'p2',
        'u_haseeb',
        'Tested the live chat relay between multiple browsers — instant delivery and zero lag. Loving this architecture!',
        40 * MINUTE,
        'all'
      ),
      post(
        'p3',
        'u_taimur',
        'Late-night coding session with the squad. Nothing beats a working WebSocket connection on the first try.',
        2 * HOUR,
        'all',
        [],
        scene('#06b6d4', '#3b82f6', 'hills')
      ),
      post(
        'p4',
        'u_raheem',
        'Project notes for Haseeb and Taimur only: presentation outline uploaded to our drive.',
        1 * HOUR,
        'selected',
        ['u_haseeb', 'u_taimur']
      ),
      post(
        'p5',
        'u_aneeq',
        'Designed frosted glass cards with specular hover glows today. Check out the timeline!',
        3 * HOUR,
        'all',
        [],
        scene('#10b981', '#06b6d4', 'waves')
      ),
      post(
        'p6',
        'u_obaid',
        'Machine learning model finished training while I was testing the social feed. Perfect convergence.',
        5 * HOUR,
        'all'
      ),
    ];

    const reaction = (id, postId, userId, type) => ({ id, postId, userId, type });
    const reactions = [
      reaction('x1', 'p1', 'u_haseeb', 'like'),
      reaction('x2', 'p1', 'u_taimur', 'like'),
      reaction('x3', 'p1', 'u_aneeq', 'like'),
      reaction('x4', 'p2', 'u_raheem', 'like'),
      reaction('x5', 'p2', 'u_taimur', 'like'),
      reaction('x6', 'p3', 'u_raheem', 'like'),
      reaction('x7', 'p4', 'u_haseeb', 'like'),
      reaction('x8', 'p5', 'u_raheem', 'like'),
      reaction('x9', 'p5', 'u_taimur', 'like'),
    ];

    const rating = (id, raterId, ratedUserId, ratingType) => ({ id, raterId, ratedUserId, ratingType });
    const ratings = [
      rating('g1', 'u_haseeb', 'u_raheem', 'trustworthy'),
      rating('g2', 'u_raheem', 'u_haseeb', 'cool'),
      rating('g3', 'u_taimur', 'u_raheem', 'trustworthy'),
      rating('g4', 'u_aneeq', 'u_taimur', 'cool'),
      rating('g5', 'u_raheem', 'u_taimur', 'cool'),
    ];

    const message = (id, from, to, content, ms, read, delivery) => ({
      id,
      senderId: from,
      recipientId: to,
      content,
      createdAt: ago(ms),
      read: !!read,
      delivery: delivery || 'sent',
    });

    const messages = [
      message('m1', 'u_haseeb', 'u_raheem', 'Hey Raheem, how is the project looking?', 45 * MINUTE, true, 'delivered'),
      message('m2', 'u_raheem', 'u_haseeb', 'Awesome! The glassmorphism and live chat are running smoothly.', 42 * MINUTE, true, 'delivered'),
      message('m3', 'u_haseeb', 'u_raheem', 'Tested the relay on localhost:3000, works like a charm! 🚀', 38 * MINUTE, true, 'delivered'),
      message('m4', 'u_taimur', 'u_raheem', 'Yo Raheem, did you push the latest updates?', 25 * MINUTE, false, 'delivered'),
      message('m5', 'u_aneeq', 'u_raheem', 'The new UI looks aesthetic as hell!', 10 * MINUTE, false, 'delivered'),
      message('m6', 'u_taimur', 'u_haseeb', 'Hey Haseeb, ready for the demo presentation?', 30 * MINUTE, true, 'delivered'),
      message('m7', 'u_haseeb', 'u_taimur', 'Yes! Everything is tested and verified.', 28 * MINUTE, true, 'delivered'),
    ];

    return {
      version: 3,
      meta: { seededAt: t },
      users,
      friendships,
      friendRequests,
      posts,
      reactions,
      ratings,
      messages,
    };
  }

  CF.Data = { RATING_TYPES, createSeed, MINUTE, HOUR, DAY };
})();
