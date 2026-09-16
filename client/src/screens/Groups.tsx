import { useEffect, useState } from 'preact/hooks';
import type { Group } from '../../../src/shared/types.js';
import { api } from '../api.js';

interface Props {
  onEnter: (group: Group) => void;
}

function joinCodeFromUrl(): string {
  return new URLSearchParams(location.search).get('join')?.toUpperCase() ?? '';
}

export function Groups({ onEnter }: Props) {
  const initialJoinCode = joinCodeFromUrl();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'create' | 'join'>(initialJoinCode ? 'join' : 'create');
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialJoinCode) history.replaceState(null, '', location.pathname);
    api
      .myGroups()
      .then((r) => setGroups(r.groups))
      .catch((err) => setError((err as Error).message));
  }, []);

  async function create(e: Event) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter a group name.');
    setBusy(true);
    setError(null);
    try {
      const { group } = await api.createGroup(name);
      onEnter(group);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function join(e: Event) {
    e.preventDefault();
    if (!joinCode.trim()) return setError('Enter the group code.');
    setBusy(true);
    setError(null);
    try {
      const { group } = await api.joinGroup(joinCode.trim().toUpperCase());
      onEnter(group);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="card">
      <h2>Your groups</h2>
      {error && <p class="error">{error}</p>}
      {!groups && !error && <p class="muted">Loading…</p>}

      {groups && groups.length > 0 && (
        <ul class="playerlist">
          {groups.map((g) => (
            <li key={g.id}>
              <button class="btn btn--ghost btn--between" onClick={() => onEnter(g)}>
                <span>{g.name}</span>
                <span class="muted">
                  {g.memberAccountIds.length} {g.memberAccountIds.length === 1 ? 'member' : 'members'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {groups && groups.length === 0 && <p class="muted">You're not in any groups yet — create one or join with a code.</p>}

      <div class="tabs">
        <button class={`tab ${mode === 'create' ? 'tab--active' : ''}`} onClick={() => setMode('create')}>
          New group
        </button>
        <button class={`tab ${mode === 'join' ? 'tab--active' : ''}`} onClick={() => setMode('join')}>
          Join a group
        </button>
      </div>

      {mode === 'create' ? (
        <form onSubmit={create}>
          <label class="field">
            Group name
            <input value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="Friday Night Crew" maxLength={60} required />
          </label>
          <button class="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create group'}
          </button>
        </form>
      ) : (
        <form onSubmit={join}>
          <label class="field">
            Group code
            <input
              value={joinCode}
              onInput={(e) => setJoinCode(e.currentTarget.value.toUpperCase())}
              placeholder="ABCDE"
              maxLength={8}
              class="field__code"
              required
            />
          </label>
          <button class="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Joining…' : 'Join group'}
          </button>
        </form>
      )}
    </div>
  );
}
