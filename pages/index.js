import { useEffect, useState, useCallback } from 'react';

const TOKEN_KEY = 'reminders_app_secret';
const DB_NAME = 'reminders-app';
const STORE_NAME = 'kv';

// Mirror of the token into IndexedDB, so the service worker (which can't see
// localStorage) can also read it - needed for snooze buttons tapped directly
// on a notification, without the app open.
function saveTokenToIDB(token) {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains(STORE_NAME)) {
      req.result.createObjectStore(STORE_NAME);
    }
  };
  req.onsuccess = () => {
    const tx = req.result.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(token, 'app_secret');
  };
}

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

const SNOOZE_OPTIONS = [
  { label: '15m', minutes: 15 },
  { label: '1h', minutes: 60 },
  { label: 'Tomorrow', minutes: 1440 },
];

export default function Home() {
  const [token, setToken] = useState(null);
  const [tokenInput, setTokenInput] = useState('');
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('reminders'); // 'reminders' | 'projects' | 'account'
  const [notifStatus, setNotifStatus] = useState('unknown');

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
    if (saved) setToken(saved);
    if (typeof Notification !== 'undefined') setNotifStatus(Notification.permission);
  }, []);

  const authHeaders = useCallback(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  );

  const loadReminders = useCallback(async (opts = {}) => {
    if (!token) return;
    if (!opts.silent) setLoading(true);
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
      if (!opts.silent) setError('Could not reach the server.');
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, [token, authHeaders]);

  useEffect(() => {
    if (token) loadReminders();
  }, [token, loadReminders]);

  // Auto-refresh: poll in the background every few seconds so changes made
  // elsewhere (Claude via the API, or another device) show up without a manual
  // reload. Silent so it doesn't flash "Loading..." on every tick, and paused
  // while the tab is hidden to avoid wasting requests.
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadReminders({ silent: true });
    }, 5000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadReminders({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [token, loadReminders]);

  function saveToken(e) {
    e.preventDefault();
    const t = tokenInput.trim();
    localStorage.setItem(TOKEN_KEY, t);
    saveTokenToIDB(t);
    setToken(t);
  }

  async function createItem({ title, due_at, kind }) {
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title, due_at: due_at || null, created_by: 'user', kind }),
    });
    if (res.ok) {
      loadReminders();
      return true;
    }
    setError('Could not add item.');
    return false;
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

  async function snooze(id, minutes) {
    await fetch(`/api/reminders/${id}/snooze`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ minutes }),
    });
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

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
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

  const remindersList = reminders.filter((r) => r.kind !== 'project');
  const projectsList = reminders.filter((r) => r.kind === 'project');

  return (
    <main style={styles.page}>
      {error && <p style={styles.error}>{error}</p>}
      {loading && <p style={styles.muted}>Loading...</p>}

      {tab === 'reminders' && (
        <RemindersTab
          items={remindersList}
          onAdd={(title, due_at) => createItem({ title, due_at, kind: 'reminder' })}
          onToggle={toggleDone}
          onDelete={removeReminder}
          onSnooze={snooze}
        />
      )}
      {tab === 'projects' && (
        <ProjectsTab
          items={projectsList}
          onAdd={(title) => createItem({ title, due_at: null, kind: 'project' })}
          onToggle={toggleDone}
          onDelete={removeReminder}
        />
      )}
      {tab === 'account' && (
        <AccountTab notifStatus={notifStatus} onEnableNotifications={enableNotifications} onSignOut={signOut} />
      )}

      <BottomNav tab={tab} setTab={setTab} />
    </main>
  );
}

function RemindersTab({ items, onAdd, onToggle, onDelete, onSnooze }) {
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [showDone, setShowDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    const ok = await onAdd(title.trim(), dueAt ? new Date(dueAt).toISOString() : null);
    if (ok) {
      setTitle('');
      setDueAt('');
    }
  }

  const visible = items.filter((r) => showDone || !r.done);

  return (
    <div>
      <h1 style={styles.h1}>Reminders</h1>
      <form onSubmit={submit} style={styles.addForm}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New reminder..."
          style={styles.inputGrow}
        />
        <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} style={styles.input} />
        <button type="submit" style={styles.primaryButton}>Add</button>
      </form>

      <label style={styles.checkboxRow}>
        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
        Show completed
      </label>

      <ul style={styles.list}>
        {visible.length === 0 && <p style={styles.muted}>Nothing here.</p>}
        {visible.map((r) => (
          <li key={r.id} style={styles.item}>
            <div style={styles.itemRow}>
              <label style={styles.itemLeft}>
                <input type="checkbox" checked={r.done} onChange={() => onToggle(r)} />
                <div>
                  <div style={r.done ? styles.doneTitle : styles.itemTitle}>{r.title}</div>
                  <div style={styles.itemMeta}>
                    {fmtDue(r.due_at) || 'No due time'}
                    {r.created_by === 'claude' ? ' · added by Claude' : ''}
                  </div>
                </div>
              </label>
              <button onClick={() => onDelete(r.id)} style={styles.deleteButton}>Delete</button>
            </div>
            {!r.done && (
              <div style={styles.snoozeRow}>
                {SNOOZE_OPTIONS.map((opt) => (
                  <button key={opt.label} onClick={() => onSnooze(r.id, opt.minutes)} style={styles.snoozeButton}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectsTab({ items, onAdd, onToggle, onDelete }) {
  const [title, setTitle] = useState('');
  const [showDone, setShowDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    const ok = await onAdd(title.trim());
    if (ok) setTitle('');
  }

  const visible = items.filter((r) => showDone || !r.done);

  return (
    <div>
      <h1 style={styles.h1}>Projects</h1>
      <p style={styles.muted}>Ideas with no deadline - things you want to build someday.</p>
      <form onSubmit={submit} style={styles.addForm}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New project idea..."
          style={styles.inputGrow}
        />
        <button type="submit" style={styles.primaryButton}>Add</button>
      </form>

      <label style={styles.checkboxRow}>
        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
        Show done
      </label>

      <ul style={styles.list}>
        {visible.length === 0 && <p style={styles.muted}>No project ideas yet.</p>}
        {visible.map((r) => (
          <li key={r.id} style={styles.item}>
            <div style={styles.itemRow}>
              <label style={styles.itemLeft}>
                <input type="checkbox" checked={r.done} onChange={() => onToggle(r)} />
                <div style={r.done ? styles.doneTitle : styles.itemTitle}>{r.title}</div>
              </label>
              <button onClick={() => onDelete(r.id)} style={styles.deleteButton}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AccountTab({ notifStatus, onEnableNotifications, onSignOut }) {
  return (
    <div>
      <h1 style={styles.h1}>Account</h1>
      <div style={styles.accountRow}>
        <span>Notifications</span>
        <span style={styles.muted}>{notifStatus === 'granted' ? 'Enabled' : notifStatus}</span>
      </div>
      {notifStatus !== 'granted' && (
        <button onClick={onEnableNotifications} style={styles.primaryButton}>Enable notifications</button>
      )}
      <div style={{ height: 24 }} />
      <button onClick={onSignOut} style={styles.secondaryButton}>Sign out on this device</button>
    </div>
  );
}

function BottomNav({ tab, setTab }) {
  const tabs = [
    { id: 'reminders', label: 'Reminders', icon: '⏰' },
    { id: 'projects', label: 'Projects', icon: '💡' },
    { id: 'account', label: 'Account', icon: '👤' },
  ];
  return (
    <nav style={styles.bottomNav}>
      <div style={styles.bottomNavIsland}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ ...styles.navButton, ...(tab === t.id ? styles.navButtonActive : {}) }}
          >
            <span style={{ fontSize: 18 }}>{t.icon}</span>
            <span style={{ fontSize: 11 }}>{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

const styles = {
  centerScreen: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  tokenForm: { display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 },
  page: { maxWidth: 560, margin: '0 auto', padding: '24px 16px 120px' },
  h1: { fontSize: 22, margin: '0 0 12px' },
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
  item: { padding: 12, borderRadius: 10, background: '#161b22', border: '1px solid #30363d' },
  itemRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  itemLeft: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  itemTitle: { fontSize: 15 },
  doneTitle: { fontSize: 15, textDecoration: 'line-through', color: '#8b949e' },
  itemMeta: { fontSize: 12, color: '#8b949e', marginTop: 2 },
  snoozeRow: { display: 'flex', gap: 6, marginTop: 8, paddingLeft: 26 },
  snoozeButton: { padding: '4px 10px', borderRadius: 999, border: '1px solid #30363d', background: '#0d1117', color: '#8b949e', fontSize: 12 },
  accountRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #30363d', marginBottom: 16 },
  bottomNav: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    justifyContent: 'center',
    paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
    paddingTop: 8,
    pointerEvents: 'none',
  },
  bottomNavIsland: {
    pointerEvents: 'auto',
    display: 'flex',
    gap: 4,
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 20,
    padding: 6,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
  navButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '8px 18px',
    borderRadius: 14,
    border: 'none',
    background: 'transparent',
    color: '#8b949e',
  },
  navButtonActive: { background: '#0d1117', color: '#e6edf3' },
};
