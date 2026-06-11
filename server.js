const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: 'team-task-board-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const dbPath = process.env.NODE_ENV === 'production' ? '/tmp/database.sqlite' : './database.sqlite';
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'todo',
    priority TEXT DEFAULT 'medium',
    assignee TEXT,
    start_date TEXT,
    due_date TEXT,
    completion_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
});

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  db.get('SELECT is_admin FROM users WHERE id = ?', [req.session.userId], (err, row) => {
    if (err || !row || !row.is_admin) {
      return res.status(403).json({ error: 'Admin only' });
    }
    next();
  });
}

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const hash = await bcrypt.hash(password, 10);
  db.get('SELECT COUNT(*) as count FROM users', async (err, row) => {
    const isFirst = row.count === 0;
    db.run('INSERT INTO users (username, password, is_admin) VALUES (?, ?, ?)', [username, hash, isFirst ? 1 : 0], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'Username already taken' });
        }
        return res.status(500).json({ error: err.message });
      }
      req.session.userId = this.lastID;
      res.json({ id: this.lastID, username, is_admin: isFirst });
    });
  });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(400).json({ error: 'Invalid username or password' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid username or password' });
    req.session.userId = user.id;
    res.json({ id: user.id, username: user.username, is_admin: user.is_admin });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out' });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json(null);
  db.get('SELECT id, username, is_admin FROM users WHERE id = ?', [req.session.userId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || null);
  });
});

app.get('/api/tasks', requireAuth, (req, res) => {
  db.all('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC', [req.session.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/tasks', requireAuth, (req, res) => {
  const { title, description, status, priority, assignee, start_date, due_date, completion_date } = req.body;
  db.run('INSERT INTO tasks (user_id, title, description, status, priority, assignee, start_date, due_date, completion_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [req.session.userId, title, description, status || 'todo', priority || 'medium', assignee, start_date, due_date, completion_date],
    function(err) {
      if (err) {
        console.error('DB Error:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID });
    });
});

app.put('/api/tasks/:id', requireAuth, (req, res) => {
  const { title, description, status, priority, assignee, start_date, due_date, completion_date } = req.body;
  db.run('UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, assignee = ?, start_date = ?, due_date = ?, completion_date = ? WHERE id = ? AND user_id = ?',
    [title, description, status, priority, assignee, start_date, due_date, completion_date, req.params.id, req.session.userId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    });
});

app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  db.run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// Admin routes
app.get('/api/admin/users', requireAdmin, (req, res) => {
  db.all('SELECT id, username, is_admin, created_at FROM users ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/admin/tasks', requireAdmin, (req, res) => {
  db.all('SELECT t.*, u.username as user_name FROM tasks t JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  db.get('SELECT COUNT(*) as totalUsers FROM users', (err, users) => {
    db.get('SELECT COUNT(*) as totalTasks FROM tasks', (err, tasks) => {
      db.all('SELECT status, COUNT(*) as count FROM tasks GROUP BY status', (err, statusRows) => {
        res.json({
          totalUsers: users.totalUsers,
          totalTasks: tasks.totalTasks,
          tasksByStatus: statusRows
        });
      });
    });
  });
});

app.listen(PORT, () => {
  console.log('Server running at http://localhost:' + PORT);
});
