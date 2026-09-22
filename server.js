const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const users = new Map(), tokens = new Map(), messages = [], events = [], typing = new Map();

app.get('/', (q, r) => r.send('💖 MF Server'));

app.post('/api/register', (q, r) => {
  const { username, password, gender, orientation, bio } = q.body;
  if (!username || !password) return r.status(400).json({ error: 'Заполни поля' });
  for (const u of users.values()) if (u.username === username)
    return r.status(400).json({ error: 'Ник занят' });
  const id = uuidv4(), token = uuidv4();
  users.set(id, { id, username, password,
    gender: gender||'femboy', orientation: orientation||'bi',
    bio: bio||'Привет 💕', online: false, lastSeen: Date.now() });
  tokens.set(token, id);
  const u = users.get(id); const { password: _, ...safe } = u;
  r.json({ token, user: safe });
});

app.post('/api/login', (q, r) => {
  const { username, password } = q.body;
  for (const u of users.values()) if (u.username === username && u.password === password) {
    const token = uuidv4(); tokens.set(token, u.id);
    const { password: _, ...safe } = u;
    return r.json({ token, user: safe });
  }
  r.status(401).json({ error: 'Неверный логин или пароль' });
});

function auth(q, r, n) {
  const t = q.headers['authorization'];
  if (!t || !tokens.has(t)) return r.status(401).json({ error: 'Нет доступа' });
  q.userId = tokens.get(t); n();
}

app.get('/api/users', auth, (q, r) => {
  users.get(q.userId).lastSeen = Date.now();
  r.json([...users.values()].filter(u => u.id !== q.userId)
    .map(u => { const { password: _, ...s } = u; return s; }));
});

app.get('/api/messages/:otherId', auth, (q, r) => {
  const cid = [q.userId, q.params.otherId].sort().join('_');
  r.json(messages.filter(m => m.chatId === cid));
});

app.post('/api/send', auth, (q, r) => {
  const { to, text } = q.body;
  if (!to || !text) return r.status(400).json({ error: 'нет данных' });
  const me = users.get(q.userId);
  const m = { type: 'new_message', id: uuidv4(),
    chatId: [q.userId, to].sort().join('_'), from: q.userId,
    fromName: me.username, to, text, time: Date.now() };
  messages.push(m); events.push(m);
  if (events.length > 5000) events.splice(0, events.length - 5000);
  r.json({ ok: true });
});

app.post('/api/typing', auth, (q, r) => {
  const { to, isTyping } = q.body;
  const me = users.get(q.userId);
  if (isTyping) typing.set(q.userId, { to, time: Date.now(), fromName: me.username });
  else typing.delete(q.userId);
  r.json({ ok: true });
});

app.get('/api/events', auth, (q, r) => {
  users.get(q.userId).lastSeen = Date.now();
  const since = parseInt(q.query.since || '0', 10);
  const now = Date.now();
  const my = events.filter(e => e.time > since && (e.to === q.userId || e.from === q.userId));
  const fresh = [];
  for (const [uid, t] of typing.entries())
    if (t.to === q.userId && now - t.time < 5000)
      fresh.push({ type: 'typing', from: uid, fromName: t.fromName,
        to: q.userId, isTyping: true, time: t.time });
  r.json({ now, events: [...my, ...fresh] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`💖 на ${PORT}`));
