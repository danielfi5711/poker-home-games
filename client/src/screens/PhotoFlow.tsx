import { useMemo, useState } from 'preact/hooks';
import type { ChipColorId, Session } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { capturePhoto, encodeForVision } from '../cv/photo.js';
import { countChipStacks, type CountResult } from '../cv/chipCounter.js';
import { formatCents } from '../money.js';
import { CameraIcon } from '../icons.js';

interface Props {
  session: Session;
  playerId: string;
  mode: 'buyin' | 'cashout';
  onDone: (session: Session) => void;
  onCancel: () => void;
}

type Step = 'capture' | 'analyzing' | 'confirm';

export function PhotoFlow({ session, playerId, mode, onDone, onCancel }: Props) {
  const [step, setStep] = useState<Step>('capture');
  const [photo, setPhoto] = useState<string | null>(null);
  const [scan, setScan] = useState<CountResult | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [detected, setDetected] = useState<Record<ChipColorId, number>>({});
  const [counts, setCounts] = useState<Record<ChipColorId, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const palette = session.chipPalette;

  const totalCents = useMemo(
    () => palette.reduce((sum, c) => sum + (counts[c.id] ?? 0) * c.valueCents, 0),
    [palette, counts],
  );

  function startManual() {
    const zero: Record<ChipColorId, number> = {};
    for (const c of palette) zero[c.id] = 0;
    setPhoto(null);
    setScan(null);
    setWarning(null);
    setDetected(zero);
    setCounts(zero);
    setStep('confirm');
  }

  async function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    setStep('analyzing');
    setError(null);
    setWarning(null);
    try {
      const captured = await capturePhoto(file);
      let result: CountResult;
      let lowConfidence = false;

      try {
        // AI vision counting is the primary path — far more accurate than
        // the on-device heuristic, since it counts each stack's chips
        // individually instead of guessing from pixel geometry.
        const ai = await api.visionCount(session.id, encodeForVision(captured.image));
        result = {
          counts: ai.counts,
          blobs: ai.stacks.map((s) => ({ colorId: s.colorId, count: s.count, minX: s.box.xMinPct, minY: s.box.yMinPct, maxX: s.box.xMaxPct, maxY: s.box.yMaxPct })),
          imageWidth: 100,
          imageHeight: 100,
        };
        lowConfidence = ai.confidence === 'low';
      } catch {
        // No network, no API key configured, etc. — fall back to the on-device heuristic.
        result = await countChipStacks(captured.image, captured.width, captured.height, palette);
      }

      setPhoto(captured.dataUrl);
      setScan(result);
      setShowOverlay(true);
      setDetected(result.counts);
      setCounts(result.counts);
      if (lowConfidence) setWarning("The AI wasn't fully confident in this count — double-check it below.");
      setStep('confirm');
    } catch (err) {
      setError((err as Error).message || "Couldn't read that photo — try again or enter chips manually.");
      setStep('capture');
    }
  }

  function bump(colorId: ChipColorId, delta: number) {
    setCounts((c) => ({ ...c, [colorId]: Math.max(0, (c[colorId] ?? 0) + delta) }));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const payload = { photo, detectedCounts: detected, confirmedCounts: counts };
      const { session: updated } = mode === 'buyin' ? await api.addBuyIn(session.id, playerId, payload) : await api.cashOut(session.id, playerId, payload);
      onDone(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const title = mode === 'buyin' ? 'Add a buy-in' : 'Cash out';

  return (
    <div class="modal">
      <div class="modal__panel">
        <div class="modal__handle" />
        <h2>{title}</h2>
        {error && <p class="error">{error}</p>}
        {warning && <p class="warning">{warning}</p>}

        {step === 'capture' && (
          <div class="capture">
            <p class="hint">
              Stack your chips sorted by color, then take one photo of everything. The app will guess the count —
              you'll get to double-check it next.
            </p>
            <label class="btn btn--primary btn--big">
              <CameraIcon size={18} />
              Take / upload photo
              <input type="file" accept="image/*" capture="environment" class="visually-hidden" onChange={onFile} />
            </label>
            <button class="btn btn--ghost" onClick={startManual}>
              Skip photo, enter chips manually
            </button>
            <button class="btn btn--ghost" onClick={onCancel}>
              Cancel
            </button>
          </div>
        )}

        {step === 'analyzing' && (
          <div class="center analyzing">
            <div class="spinner" />
            <p>Counting chips…</p>
          </div>
        )}

        {step === 'confirm' && (
          <div class="confirm">
            {photo && (
              <div class="confirm__photo-wrap">
                <img class="confirm__photo" src={photo} alt="Chip stack" />
                {showOverlay && scan && scan.imageWidth > 0 && (
                  <div class="confirm__overlay">
                    {scan.blobs.map((b, i) => {
                      const color = palette.find((c) => c.id === b.colorId);
                      const left = (b.minX / scan.imageWidth) * 100;
                      const top = (b.minY / scan.imageHeight) * 100;
                      const w = ((b.maxX - b.minX + 1) / scan.imageWidth) * 100;
                      const h = ((b.maxY - b.minY + 1) / scan.imageHeight) * 100;
                      return (
                        <div
                          key={i}
                          class="confirm__box"
                          style={{ left: `${left}%`, top: `${top}%`, width: `${w}%`, height: `${h}%`, borderColor: color?.hex ?? '#fff' }}
                        >
                          <span class="confirm__box-label" style={{ background: color?.hex ?? '#333' }}>
                            {b.count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {photo && scan && scan.blobs.length > 0 && (
              <button class="btn btn--ghost btn--small" onClick={() => setShowOverlay((v) => !v)}>
                {showOverlay ? 'Hide detected stacks' : 'Show detected stacks'}
              </button>
            )}
            <p class="hint">Check the counts below — tap +/− to fix anything the app got wrong.</p>
            <div class="counters">
              {palette.map((c) => (
                <div class="counter" key={c.id}>
                  <span class="counter__swatch" style={{ background: c.hex }} />
                  <span class="counter__label">{c.label}</span>
                  <span class="counter__unit">{formatCents(c.valueCents)}/chip</span>
                  <div class="counter__controls">
                    <button class="counter__btn" onClick={() => bump(c.id, -1)} aria-label={`Fewer ${c.label}`}>
                      −
                    </button>
                    <input
                      class="counter__input"
                      inputMode="numeric"
                      value={counts[c.id] ?? 0}
                      onInput={(e) => setCounts((prev) => ({ ...prev, [c.id]: Math.max(0, Number(e.currentTarget.value) || 0) }))}
                    />
                    <button class="counter__btn" onClick={() => bump(c.id, 1)} aria-label={`More ${c.label}`}>
                      +
                    </button>
                  </div>
                  <span class="counter__subtotal">{formatCents((counts[c.id] ?? 0) * c.valueCents)}</span>
                </div>
              ))}
            </div>
            <div class="confirm__total">Total: {formatCents(totalCents)}</div>
            <div class="actions">
              <button class="btn" onClick={onCancel} disabled={busy}>
                Cancel
              </button>
              <button class="btn btn--primary" onClick={submit} disabled={busy || (mode === 'buyin' && totalCents <= 0)}>
                {busy ? 'Saving…' : `Confirm ${formatCents(totalCents)}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
