// ============================================================
//  API client + DEMO fallback.
//  When the Node backend is reachable, real data is used.
//  When the pages are opened directly in a browser (file://),
//  an in-memory dataset seeded from schema.sql is used so the
//  school project is fully runnable without installing Postgres.
// ============================================================

// Render backend URL. Keep all API requests pointed at the separately hosted API.
const API_BASE = 'https://votenigeria-backend.onrender.com';

// ---- Demo dataset (mirrors database/schema.sql) ----
const DEMO = {
  citizens: [
    { nin: '52281679025', full_name: 'Okechukwu Great', state: 'Imo', lga: 'Ikeduru', phone1: '08034678812', phone2: '09122712205', is_admin: false },
    { nin: '62873852101', full_name: 'Yusuf Kalistus', state: 'Kano', lga: 'Dala', phone1: '08055448160', phone2: '07160603258', is_admin: false },
    { nin: '81875612791', full_name: 'Oladeti Loveth', state: 'Lagos', lga: 'Apapa', phone1: '08170314860', phone2: '07062490123', is_admin: false },
    { nin: '52271069814', full_name: 'Chibuike Paul', state: 'Anambra', lga: 'Orumba North', phone1: '08028843818', phone2: '08028843818', is_admin: true },
  ],
  voters: {},        // phone -> voter record
  sessions: {},      // nin -> phone
  elections: [],
  candidates: [],
  votes: [],          // { voter_nin, election_id, candidate_id }
  support: {},        // phone -> [{sender, body, created_at}]
  news: [],
  nextId: 100,
};

function demoDelay(ms) { return new Promise(r => setTimeout(r, ms)); }
function sessionPhone() { return localStorage.getItem('vn_phone'); }
function setSessionPhone(p) { if (p) localStorage.setItem('vn_phone', p); else localStorage.removeItem('vn_phone'); }

function findCitizen(phone) {
  return DEMO.citizens.find(c => c.phone1 === phone || c.phone2 === phone);
}
function currentVoter() {
  const p = sessionPhone();
  if (!p) return null;
  return DEMO.voters[p] || null;
}

// ---- Try real backend first, fall back to demo ----
async function api(path, options = {}) {
  if (API_BASE) {
    try {
      const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
      if (sessionPhone()) headers['x-session'] = sessionPhone();
      const res = await fetch(API_BASE + path, { ...options, headers });
      if (res.ok) return await res.json();
      // If server is down (network error thrown), the catch handles it.
      const body = await res.json().catch(() => ({}));
      return { error: body.error || `Request failed (${res.status})` };
    } catch (e) {
      // fall through to demo
    }
  }
  return demo(path, options);
}

// ---- Demo "backend" ----
async function demo(path, options) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  await demoDelay(400);

  // AUTH
  if (path === '/api/auth/register' && method === 'POST') {
    const c = findCitizen(body.phone);
    if (!c) return { found: false, message: "Oops looks like this number hasn\u2019t been registered" };
    if (DEMO.sessions[c.nin] && DEMO.sessions[c.nin] !== body.phone)
      return { found: false, message: 'This NIN is already logged in on another phone number. You cannot register twice.' };
    DEMO.voters[body.phone] = { phone: body.phone, nin: c.nin, full_name: c.full_name, state: c.state, lga: c.lga, is_admin: c.is_admin };
    DEMO.sessions[c.nin] = body.phone;
    setSessionPhone(body.phone);
    return { found: true, name: c.full_name, nin_masked: c.nin.slice(0,4)+'******'+c.nin.slice(-2), state: c.state, lga: c.lga, phone: body.phone, is_admin: c.is_admin };
  }
  if (path === '/api/auth/login' && method === 'POST') {
    const c = findCitizen(body.phone);
    if (!c) return { found: false, message: 'Number not found' };
    DEMO.voters[body.phone] = { phone: body.phone, nin: c.nin, full_name: c.full_name, state: c.state, lga: c.lga, is_admin: c.is_admin };
    DEMO.sessions[c.nin] = body.phone;
    setSessionPhone(body.phone);
    return { found: true, name: c.full_name, state: c.state, lga: c.lga, phone: body.phone, is_admin: c.is_admin };
  }
  if (path === '/api/auth/me') {
    const v = currentVoter();
    return { voter: v };
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    const v = currentVoter();
    if (v) { delete DEMO.sessions[v.nin]; if (DEMO.voters[v.phone]) DEMO.voters[v.phone].is_active = false; }
    setSessionPhone(null);
    return { ok: true };
  }
  if (path === '/api/auth/change-phone' && method === 'POST') {
    const v = currentVoter();
    if (!v) return { error: 'Not logged in' };
    const c = DEMO.citizens.find(x => (x.phone1 === body.newPhone || x.phone2 === body.newPhone) && x.nin === v.nin);
    if (!c) return { ok: false, message: 'The new number is not linked to your NIN.' };
    // cancel ongoing votes
    let cancelled = 0;
    DEMO.votes = DEMO.votes.filter(vt => {
      if (vt.voter_nin === v.nin) {
        const el = DEMO.elections.find(e => e.id === vt.election_id);
        if (el && el.status === 'ongoing') {
          const cand = DEMO.candidates.find(cd => cd.id === vt.candidate_id);
          if (cand) cand.votes = Math.max(0, cand.votes - 1);
          cancelled++; return false;
        }
      }
      return true;
    });
    delete DEMO.voters[v.phone];
    DEMO.voters[body.newPhone] = { phone: body.newPhone, nin: v.nin, full_name: v.full_name, state: v.state, lga: v.lga, is_admin: v.is_admin };
    DEMO.sessions[v.nin] = body.newPhone;
    setSessionPhone(null); // logged out
    return { ok: true, cancelledVotes: cancelled, newPhone: body.newPhone, message: `Phone changed. ${cancelled} ongoing vote(s) cancelled. You have been logged out.` };
  }

  // ELECTIONS
  if (path === '/api/elections' && method === 'GET') {
    const v = currentVoter();
    let list = DEMO.elections.filter(e => e.status === 'ongoing');
    if (v) list = list.filter(e => e.type === 'president' || (e.type === 'governor' && e.state === v.state) || (e.type === 'lga' && e.lga === v.lga));
    return { elections: list };
  }
  if (path.startsWith('/api/elections/results/all')) {
    return { results: DEMO.elections.map(el => {
      const cands = DEMO.candidates.filter(c => c.election_id === el.id).sort((a,b)=>b.votes-a.votes);
      return { election: el, candidates: cands, total: cands.reduce((s,c)=>s+c.votes,0), winner: cands[0] || null };
    })};
  }
  const singleMatch = path.match(/^\/api\/elections\/(\d+)$/);
  if (singleMatch && method === 'GET') {
    const id = +singleMatch[1];
    const el = DEMO.elections.find(e => e.id === id);
    if (!el) return { error: 'Not found' };
    const cands = DEMO.candidates.filter(c => c.election_id === id).sort((a,b)=>a.id-b.id);
    const v = currentVoter();
    let voted = false;
    if (v) voted = DEMO.votes.some(vt => vt.voter_nin === v.nin && vt.election_id === id);
    return { election: el, candidates: cands, voted };
  }
  const voteMatch = path.match(/^\/api\/elections\/(\d+)\/vote$/);
  if (voteMatch && method === 'POST') {
    const id = +voteMatch[1];
    const v = currentVoter();
    if (!v) return { error: 'Not logged in' };
    const el = DEMO.elections.find(e => e.id === id);
    if (!el || el.status !== 'ongoing') return { ok: false, message: 'This election has ended.' };
    if (el.type === 'governor' && el.state !== v.state) return { error: 'Not your state' };
    if (el.type === 'lga' && el.lga !== v.lga) return { error: 'Not your LGA' };
    if (DEMO.votes.some(vt => vt.voter_nin === v.nin && vt.election_id === id))
      return { ok: false, message: 'You have already voted in this election.' };
    DEMO.votes.push({ voter_nin: v.nin, election_id: id, candidate_id: body.candidateId });
    const cand = DEMO.candidates.find(c => c.id === body.candidateId);
    if (cand) cand.votes++;
    return { ok: true, message: 'Vote cast successfully.' };
  }
  const resultsMatch = path.match(/^\/api\/elections\/results\/(\d+)$/);
  if (resultsMatch && method === 'GET') {
    const id = +resultsMatch[1];
    const el = DEMO.elections.find(e => e.id === id);
    const cands = DEMO.candidates.filter(c => c.election_id === id).sort((a,b)=>b.votes-a.votes);
    return { election: el, candidates: cands, total: cands.reduce((s,c)=>s+c.votes,0), winner: cands[0] || null };
  }

  // SUPPORT
  if (path === '/api/support' && method === 'GET') {
    const v = currentVoter();
    return { messages: v ? (DEMO.support[v.phone] || []) : [] };
  }
  if (path === '/api/support' && method === 'POST') {
    const v = currentVoter();
    if (!v) return { error: 'Not logged in' };
    if (!DEMO.support[v.phone]) DEMO.support[v.phone] = [];
    DEMO.support[v.phone].push({ id: Date.now(), sender: 'voter', body: body.body, created_at: new Date().toISOString() });
    const auto = 'Thanks for using Vote Nigeria, your request has been sent we\u2019ll get in touch as soon as an admin views this message.';
    const reply = { id: Date.now()+1, sender: 'admin', body: auto, created_at: new Date().toISOString() };
    DEMO.support[v.phone].push(reply);
    return { ok: true, autoReply: reply };
  }

  // NEWS
  if (path.startsWith('/api/news') && method === 'GET') {
    const url = new URL('http://x' + path);
    const cat = url.searchParams.get('category');
    let list = [...DEMO.news].sort((a,b)=>b.id-a.id);
    if (cat && cat !== 'All') list = list.filter(n => n.category === cat);
    return { news: list };
  }
  const newsMatch = path.match(/^\/api\/news\/(\d+)$/);
  if (newsMatch && method === 'GET') {
    const n = DEMO.news.find(x => x.id === +newsMatch[1]);
    return n ? { news: n } : { error: 'Not found' };
  }

  // ADMIN
  if (path === '/api/admin/check') {
    const v = currentVoter();
    return { isAdmin: !!(v && v.is_admin), voter: v };
  }
  if (path === '/api/admin/elections' && method === 'POST') {
    const v = currentVoter(); if (!v || !v.is_admin) return { error: 'Admin only' };
    const id = DEMO.nextId++;
    const el = { id, title: body.title, type: body.type, state: body.state || null, lga: body.lga || null, start_time: new Date().toISOString(), end_time: new Date(Date.now() + (body.durationHours||24)*3600000).toISOString(), status: 'ongoing' };
    DEMO.elections.push(el);
    return { election: el };
  }
  const delElMatch = path.match(/^\/api\/admin\/elections\/(\d+)$/);
  if (delElMatch && method === 'DELETE') {
    const v = currentVoter(); if (!v || !v.is_admin) return { error: 'Admin only' };
    const id = +delElMatch[1];
    DEMO.elections = DEMO.elections.filter(e => e.id !== id);
    DEMO.candidates = DEMO.candidates.filter(c => c.election_id !== id);
    return { ok: true };
  }
  const endElMatch = path.match(/^\/api\/admin\/elections\/(\d+)\/end$/);
  if (endElMatch && method === 'POST') {
    const v = currentVoter(); if (!v || !v.is_admin) return { error: 'Admin only' };
    const el = DEMO.elections.find(e => e.id === +endElMatch[1]);
    if (el) el.status = 'ended';
    const cands = DEMO.candidates.filter(c => c.election_id === el.id).sort((a,b)=>b.votes-a.votes);
    return { election: el, winner: cands[0] || null };
  }
  if (path === '/api/admin/candidates' && method === 'POST') {
    const v = currentVoter(); if (!v || !v.is_admin) return { error: 'Admin only' };
    const id = DEMO.nextId++;
    const cand = { id, election_id: body.electionId, name: body.name, party: body.party, logo_url: body.logoUrl || null, votes: 0 };
    DEMO.candidates.push(cand);
    return { candidate: cand };
  }
  const delCandMatch = path.match(/^\/api\/admin\/candidates\/(\d+)$/);
  if (delCandMatch && method === 'DELETE') {
    const v = currentVoter(); if (!v || !v.is_admin) return { error: 'Admin only' };
    DEMO.candidates = DEMO.candidates.filter(c => c.id !== +delCandMatch[1]);
    return { ok: true };
  }
  const logoMatch = path.match(/^\/api\/admin\/candidates\/(\d+)\/logo$/);
  if (logoMatch && method === 'POST') {
    const v = currentVoter(); if (!v || !v.is_admin) return { error: 'Admin only' };
    const c = DEMO.candidates.find(x => x.id === +logoMatch[1]);
    if (c) c.logo_url = body.logoUrl;
    return { candidate: c };
  }
  if (path === '/api/admin/news' && method === 'POST') {
    const v = currentVoter(); if (!v || !v.is_admin) return { error: 'Admin only' };
    const id = DEMO.nextId++;
    const n = { id, title: body.title, subtitle: body.subtitle, body: body.body, image_url: body.imageUrl, category: body.category || 'General', created_at: new Date().toISOString() };
    DEMO.news.push(n);
    return { news: n };
  }
  const delNewsMatch = path.match(/^\/api\/admin\/news\/(\d+)$/);
  if (delNewsMatch && method === 'DELETE') {
    const v = currentVoter(); if (!v || !v.is_admin) return { error: 'Admin only' };
    DEMO.news = DEMO.news.filter(n => n.id !== +delNewsMatch[1]);
    return { ok: true };
  }
  if (path === '/api/admin/support/chats') {
    const v = currentVoter(); if (!v || !v.is_admin) return { error: 'Admin only' };
    return { chats: Object.keys(DEMO.support).map(phone => ({ voter_phone: phone })) };
  }
  const supMatch = path.match(/^\/api\/admin\/support\/(.+)$/);
  if (supMatch && method === 'GET') {
    const v = currentVoter(); if (!v || !v.is_admin) return { error: 'Admin only' };
    return { messages: DEMO.support[supMatch[1]] || [] };
  }
  if (supMatch && method === 'POST') {
    const v = currentVoter(); if (!v || !v.is_admin) return { error: 'Admin only' };
    const phone = supMatch[1];
    if (!DEMO.support[phone]) DEMO.support[phone] = [];
    const m = { id: Date.now(), sender: 'admin', body: body.body, created_at: new Date().toISOString() };
    DEMO.support[phone].push(m);
    return { message: m };
  }

  // USSD
  if (path === '/api/ussd' && method === 'POST') {
    return demoUssd(body);
  }

  return { error: 'Unknown route: ' + path };
}

function demoUssd(body) {
  let text = (body.text || '').split('*').filter(Boolean);
  const step = text.length;
  const phone = body.phoneNumber || '';
  const menu = (text, terminate = false) => ({ text, terminate });

  if (step === 0) return menu('Welcome to Vote Nigeria\n1. Register / Login\n2. Vote in an election\n3. Check election results\n4. Exit');
  const ch = text[0];
  if (ch === '1') {
    if (step === 1) return menu('Enter your phone number:');
    const c = findCitizen(text[1].replace(/\s/g, ''));
    if (!c) return menu("Oops looks like this number hasn\u2019t been registered.", true);
    if (DEMO.sessions[c.nin] && DEMO.sessions[c.nin] !== text[1]) return menu('This NIN is already active on another number.', true);
    DEMO.voters[text[1]] = { phone: text[1], nin: c.nin, full_name: c.full_name, state: c.state, lga: c.lga, is_admin: c.is_admin };
    DEMO.sessions[c.nin] = text[1];
    return menu(`Registration successful!\nName: ${c.full_name}\nState: ${c.state}\nLGA: ${c.lga}\nYou can now vote.`, true);
  }
  if (ch === '2') {
    const v = DEMO.voters[phone]; if (!v) return menu('Please register first (option 1).', true);
    const list = DEMO.elections.filter(e => e.status === 'ongoing' && (e.type === 'president' || (e.type === 'governor' && e.state === v.state) || (e.type === 'lga' && e.lga === v.lga)));
    if (!list.length) return menu('No elections available right now.', true);
    if (step === 1) { let t = 'Select election:\n'; list.forEach((e, i) => t += `${i + 1}. ${e.title}\n`); return menu(t); }
    const el = list[+text[1] - 1]; if (!el) return menu('Invalid selection.', true);
    if (DEMO.votes.some(vt => vt.voter_nin === v.nin && vt.election_id === el.id)) return menu('You have already voted in this election.', true);
    const cands = DEMO.candidates.filter(c => c.election_id === el.id);
    if (step === 2) { let t = `${el.title}\nSelect candidate:\n`; cands.forEach((c, i) => t += `${i + 1}. ${c.name} (${c.party})\n`); return menu(t); }
    const cand = cands[+text[2] - 1]; if (!cand) return menu('Invalid candidate.', true);
    DEMO.votes.push({ voter_nin: v.nin, election_id: el.id, candidate_id: cand.id });
    cand.votes++;
    return menu(`Vote cast for ${cand.name} (${cand.party}). Thank you!`, true);
  }
  if (ch === '3') {
    if (step === 1) { let t = 'Select election to view results:\n'; DEMO.elections.forEach((e, i) => t += `${i + 1}. ${e.title}\n`); return menu(t); }
    const el = DEMO.elections[+text[1] - 1]; if (!el) return menu('Invalid.', true);
    const cands = DEMO.candidates.filter(c => c.election_id === el.id).sort((a, b) => b.votes - a.votes);
    let t = `${el.title} Results:\n`; cands.forEach(c => t += `${c.name} (${c.party}): ${c.votes}\n`);
    return menu(t, true);
  }
  if (ch === '4') return menu('Goodbye.', true);
  return menu('Invalid option.', true);
}

// ---- Shared UI helpers ----
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function showModal(id) { document.getElementById(id).classList.add('show'); }
function hideModal(id) { document.getElementById(id).classList.remove('show'); }

// Navbar + drawer — injected into every page that has #navbar
function renderNavbar(active) {
  const el = document.getElementById('navbar');
  if (!el) return;
  const links = [
    { href: 'index.html', label: 'Home' },
    { href: 'dashboard.html', label: 'Dashboard' },
    { href: 'election.html', label: 'Election' },
    { href: 'results.html', label: 'Results' },
    { href: 'nigeria-today.html', label: 'Nigeria Today' },
  ];
  el.innerHTML = `
    <nav class="navbar">
      <a href="index.html" class="brand"><span class="logo">VN</span> Vote Nigeria</a>
      <div class="nav-links">
        ${links.map(l => `<a href="${l.href}" class="${l.href === active ? 'active' : ''}">${l.label}</a>`).join('')}
      </div>
      <button class="hamburger" id="ham" aria-label="Menu">&#9776;</button>
    </nav>
    <div class="drawer" id="drawer">
      <div class="drawer-head">Vote Nigeria</div>
      ${links.map(l => `<a href="${l.href}" class="${l.href === active ? 'active' : ''}">${l.label}</a>`).join('')}
    </div>
    <div class="overlay" id="overlay"></div>`;
  document.getElementById('ham').onclick = () => {
    document.getElementById('drawer').classList.add('open');
    document.getElementById('overlay').classList.add('show');
  };
  document.getElementById('overlay').onclick = () => {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('overlay').classList.remove('show');
  };
}

async function requireVoter(redirect = 'index.html') {
  const { voter } = await api('/api/auth/me');
  if (!voter) { window.location.href = redirect; return null; }
  return voter;
}

window.VN = { api, toast, showModal, hideModal, renderNavbar, requireVoter, sessionPhone, setSessionPhone };
