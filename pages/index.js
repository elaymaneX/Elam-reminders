import { useEffect, useState, useCallback } from 'react';

const TOKEN_KEY = 'reminders_app_secret';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function fmtDue(due_at) {
  if (!due_at) return null;
  const d = new Date(due_at);
  return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export default function Home() {
  const [token, setToken] = useState(null);
  const [tokenInput, setTokenInput] = useState('');
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [notifStatus, setNotifStatus] = useState('unknown');
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
    if (saved) setToken(saved);
    if (typeof Notification !== 'undefined') {
      setNotifStatus(Notification.permission);
    }
  }, []);

  const authHeaders = useCallback(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  );

  const loadReminders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/reminders', { headers: authHeaders() });
      if (res.status === 401) {
        setError('That code was rejected. Check it and try again.');
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        return;
      }
      const data = await res.json();
      setReminders(data.reminders || []);
    } catch (e) {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [token, authHeaders]);

  useEffect(() => {
    if (token) loadReminders();
  }, [token, loadReminders]);

  function saveToken(e) {
    e.preventDefault();
    localStorage.setItem(TOKEN_KEY, tokenInput.trim());
    setToken(tokenInput.trim());
  }

  async function addReminder(e) {
    e.preventDefault();
    if (!title.trim()) return;
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        title: title.trim(),
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        created_by: 'user',
      }),
    });
    if (res.ok) {
      setTitle('');
      setDueAt('');
      loadReminders();
    } else {
      setError('Could not add reminder.');
    }
  }

  async function toggleDone(reminder) {
    await fetch(`/api/reminders/${reminder.id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ done: !reminder.done }),
    });
    loadReminders();
  }

  async function removeReminder(id) {
    await fetch(`/api/reminders/${id}`, { method: 'DELETE', headers: authHeaders() });
    loadReminders();
  }

  async function enableNotifications() {
    try {
      const permission = await Notification.requestPermission();
      setNotifStatus(permission);
      if (permission !== 'granted') return;

      const reg = await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(sub),
      });
    } catch (e) {
      setError('Could not enable notifications: ' + e.message);
    }
  }

  if (!token) {
    return (
      <main style={styles.centerScreen}>
        <form onSubmit={saveToken} style={styles.tokenForm}>
          <h1 style={styles.h1}>Reminders</h1>
          <p style={styles.muted}>Enter your access code to continue.</p>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Access code"
            style={styles.input}
            autoFocus
          />
          <button type="submit" style={styles.primaryButton}>Continue</button>
        </form>
      </main>
    );
  }

  const visible = reminders.filter((r) => showDone || !r.done);

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.h1}>Reminders</h1>
        {notifStatus !== 'granted' && (
          <button onClick={enableNotifications} style={styles.secondaryButton}>
            Enable notifications
          </button>
        )}
      </header>

      <form onSubmit={addReminder} style={styles.addForm}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New reminder..."
          style={styles.inputGrow}
        />
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          style={styles.input}
        />
        <button type="submit" style={styles.primaryButton}>Add</button>
      </form>

      {error && <p style={styles.error}>{error}</p>}
      {loading && <p style={styles.muted}>Loading...</p>}

      <label style={styles.checkboxRow}>
        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
        Show completed
      </label>

      <ul style={styles.list}>
        {visible.length === 0 && !loading && <p style={styles.muted}>Nothing here.</p>}
        {visible.map((r) => (
          <li key={r.id} style={styles.item}>
            <label style={styles.itemLeft}>
              <input type="checkbox" checked={r.done} onChange={() => toggleDone(r)} />
              <div>
                <div style={r.done ? styles.doneTitle : styles.itemTitle}>{r.title}</div>
                <div style={styles.itemMeta}>
                  {fmtDue(r.due_at) || 'No due time'}
                  {r.created_by === 'claude' ? ' · added by Claude' : ''}
                </div>
              </div>
            </label>
            <button onClick={() => removeReminder(r.id)} style={styles.deleteButton}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

const styles = {
  centerScreen: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  tokenForm: { display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 },
  page: { maxWidth: 560, margin: '0 auto', padding: '24px 16px 80px' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  h1: { fontSize: 22, margin: 0 },
  muted: { color: '#8b949e', fontSize: 14 },
  error: { color: '#f85149', fontSize: 14 },
  addForm: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  input: { padding: '10px 12px', borderRadius: 8, border: '1px solid #30363d', background: '#161b22', color: '#e6edf3' },
  inputGrow: { flex: 1, minWidth: 160, padding: '10px 12px', borderRadius: 8, border: '1px solid #30363d', background: '#161b22', color: '#e6edf3' },
  primaryButton: { padding: '10px 16px', borderRadius: 8, border: 'none', background: '#38bdf8', color: '#04121c', fontWeight: 600 },
  secondaryButton: { padding: '8px 12px', borderRadius: 8, border: '1px solid #30363d', background: 'transparent', color: '#e6edf3' },
  deleteButton: { padding: '6px 10px', borderRadius: 8, border: '1px solid #30363d', background: 'transparent', color: '#f85149' },
  checkboxRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#8b949e', marginBottom: 8 },
  list: { listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  item: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 12, borderRadius: 10, background: '#161b22', border: '1px solid #30363d' },
  itemLeft: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  itemTitle: { fontSize: 15 },
  doneTitle: { fontSize: 15, textDecoration: 'line-through', color: '#8b949e' },
  itemMeta: { fontSize: 12, color: '#8b949e', marginTop: 2 },
};
