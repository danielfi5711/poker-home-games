import { useState } from 'preact/hooks';
import type { ChipColor, Session } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { parseDollarsToCents } from '../money.js';
import { initials } from '../initials.js';

interface Props {
  session: Session;
  isHost: boolean;
  onChanged: (session: Session) => void;
  onLeave: () => void;
}

interface Row {
  label: string;
  hex: string;
  dollars: string;
}

const PRESET: Row[] = [
  { label: 'White', hex: '#f5f5f0', dollars: '1' },
  { label: 'Red', hex: '#c42a2a', dollars: '5' },
  { label: 'Blue', hex: '#2a5bc4', dollars: '10' },
  { label: 'Green', hex: '#2a9d4a', dollars: '25' },
  { label: 'Black', hex: '#2a2a2a', dollars: '100' },
];

function toRows(palette: ChipColor[]): Row[] {
  return palette.map((c) => ({ label: c.label, hex: c.hex, dollars: (c.valueCents / 100).toString() }));
}

export function ChipSetupScreen({ session, isHost, onChanged, onLeave }: Props) {
  const [rows, setRows] = useState<Row[]>(() => (session.chipPalette.length ? toRows(session.chipPalette) : PRESET));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((r) => [...r, { label: '', hex: '#888888', dollars: '' }]);
  }

  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const palette = rows
        .filter((r) => r.label.trim())
        .map((r) => ({ label: r.label, hex: r.hex, valueCents: parseDollarsToCents(r.dollars) }));
      const { session: updated } = await api.setPalette(session.id, palette);
      onChanged(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAndStart() {
    await save();
    setBusy(true);
    try {
      const { session: updated } = await api.activate(session.id);
      onChanged(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const players = Object.values(session.players);

  return (
    <div class="card">
      <h2>{session.name}</h2>

      <h3>Players ({players.length})</h3>
      <ul class="playerlist">
        {players.map((p) => (
          <li key={p.id}>
            <span class="avatar">{initials(p.name)}</span>
            <span class="playerlist__name">{p.name}</span>
          </li>
        ))}
      </ul>

      {isHost ? (
        <>
          <h3>Chip values</h3>
          <p class="hint">Set what each chip color is worth — this is used to price every buy-in and cash-out photo.</p>
          {error && <p class="error">{error}</p>}
          <div class="chiprows">
            {rows.map((row, i) => (
              <div class="chiprow" key={i}>
                <input type="color" value={row.hex} onInput={(e) => updateRow(i, { hex: e.currentTarget.value })} class="chiprow__swatch" />
                <input
                  class="chiprow__label"
                  value={row.label}
                  onInput={(e) => updateRow(i, { label: e.currentTarget.value })}
                  placeholder="Color name"
                  maxLength={20}
                />
                <span class="chiprow__dollar">$</span>
                <input
                  class="chiprow__value"
                  value={row.dollars}
                  onInput={(e) => updateRow(i, { dollars: e.currentTarget.value })}
                  inputMode="decimal"
                  placeholder="0"
                />
                <button class="chiprow__remove" onClick={() => removeRow(i)} aria-label="Remove">
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button class="btn" onClick={addRow}>
            + Add chip color
          </button>

          <div class="actions">
            <button class="btn" onClick={save} disabled={busy}>
              Save
            </button>
            <button class="btn btn--primary" onClick={saveAndStart} disabled={busy}>
              {busy ? 'Starting…' : 'Save & start game'}
            </button>
          </div>
        </>
      ) : (
        <p class="muted">Waiting for the host to finish setting the chip values…</p>
      )}

      <button class="btn btn--ghost" onClick={onLeave}>
        Leave
      </button>
    </div>
  );
}
