import { useEffect, useState } from 'preact/hooks';
import type { Session } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { autoSessionName } from '../sessionName.js';
import { CardsIcon, ChevronRightIcon, ChipStackArt, PlusIcon } from '../icons.js';
import { AvatarStack, Empty, Money, ScreenHead, SectionLabel, Spinner } from '../ui.js';

interface Props {
  onEnterSession: (session: Session, playerId: string) => void;
}

function potCents(s: Session): number {
  return Object.values(s.players).reduce(
    (sum, p) => sum + p.buyIns.filter((b) => b.status === 'approved').reduce((n, b) => n + b.amountCents, 0),
    0,
  );
}

/** Start a new table or rejoin one that's still in progress. */
export function TablesScreen({ onEnterSession }: Props) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .sessions()
      .then((r) => setSessions(r.sessions))
      .catch((err) => setError((err as Error).message));
  }, []);

  async function createTable() {
    setBusy(true);
    setError(null);
    try {
      const { session, playerId } = await api.createSession(autoSessionName());
      onEnterSession(session, playerId!);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openTable(s: Session) {
    setBusy(true);
    setError(null);
    try {
      const { session, playerId } = await api.join(s.id);
      onEnterSession(session, playerId!);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const open = (sessions ?? []).filter((s) => s.status !== 'settled');

  return (
    <div class="view">
      <ScreenHead title="Tables" sub="Start tonight's game or jump back in." />

      <section class="hero">
        <span class="hero__chips">
          <ChipStackArt size={140} />
        </span>
        <span class="hero__eyebrow">New game</span>
        <h2 class="hero__title">{autoSessionName()}</h2>
        <p class="hero__sub">You'll be the host — friends see it here and tap to join.</p>
        <button class="btn btn--primary btn--lg btn--block" onClick={createTable} disabled={busy}>
          <PlusIcon size={18} />
          {busy ? 'Starting…' : 'Start a table'}
        </button>
      </section>

      {error && <p class="error">{error}</p>}

      <SectionLabel count={sessions ? open.length : undefined}>Happening now</SectionLabel>

      {!sessions && !error && <Spinner />}

      {sessions && open.length === 0 && (
        <Empty icon={<CardsIcon size={24} />} title="No tables right now">
          Start one above — everyone with the app will see it.
        </Empty>
      )}

      {open.map((s) => {
        const players = Object.values(s.players).sort((a, b) => a.joinedAt - b.joinedAt);
        const live = s.status === 'active';
        return (
          <button key={s.id} class={`surface tablecard ${live ? 'tablecard--live' : ''}`} onClick={() => openTable(s)} disabled={busy}>
            <div class="tablecard__top">
              <span class="tablecard__name">{s.name}</span>
              {live ? (
                <span class="pill pill--up">
                  <span class="dot-live" /> Live
                </span>
              ) : (
                <span class="pill pill--gold">In the lobby</span>
              )}
            </div>
            <div class="tablecard__bottom">
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AvatarStack people={players.map((p) => ({ id: p.accountId, name: p.name }))} />
                <span class="muted" style={{ fontSize: '13px' }}>
                  {players.length} {players.length === 1 ? 'player' : 'players'}
                </span>
              </span>
              {live ? (
                <span class="tablecard__pot">
                  <span class="tablecard__potlabel">On the table</span>
                  <Money cents={potCents(s)} size="lg" />
                </span>
              ) : (
                <span class="tablecard__cta">
                  Join <ChevronRightIcon size={15} />
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
