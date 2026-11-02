import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { avatarStyle } from './avatarColor.js';
import { initials } from './initials.js';
import { useAvatarUrl } from './avatars.js';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { formatCents } from './money.js';
import { setLang, tr, useLang } from './i18n.js';

/** Shared visual building blocks so every screen speaks the same design language. */

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export function Avatar({ id, name, size = 'md', ring, short }: { id: string; name: string; size?: AvatarSize; ring?: boolean; short?: boolean }) {
  const photo = useAvatarUrl(id);
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = photo && failed !== photo;
  return (
    <span class={`av av--${size} ${ring ? 'av--ring' : ''} ${showPhoto ? 'av--photo' : ''}`} style={avatarStyle(id)} aria-hidden="true">
      {showPhoto ? (
        <img class="av__img" src={photo} alt="" loading="lazy" decoding="async" onError={() => setFailed(photo)} />
      ) : short ? (
        initials(name).slice(0, 1)
      ) : (
        initials(name)
      )}
    </span>
  );
}

/** Overlapping avatars, e.g. who's sitting at a table. */
export function AvatarStack({ people, max = 5 }: { people: { id: string; name: string }[]; max?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span class="avstack">
      {shown.map((p) => (
        <Avatar key={p.id} id={p.id} name={p.name} size="sm" ring short />
      ))}
      {extra > 0 && <span class="av av--sm av--ring av--more">+{extra}</span>}
    </span>
  );
}

/** A money amount, optionally signed and colored win/loss. */
export function Money({ cents, signed, size, class: cls = '' }: { cents: number; signed?: boolean; size?: 'sm' | 'lg' | 'xl'; class?: string }) {
  const tone = signed ? (cents > 0 ? 'money--up' : cents < 0 ? 'money--down' : 'money--even') : '';
  return (
    <span class={`money ${tone} ${size ? `money--${size}` : ''} ${cls}`}>
      {signed && cents > 0 ? '+' : ''}
      {formatCents(cents)}
    </span>
  );
}

/**
 * Lettering that carries a mood instead of an emoji: `fire` (hot streak), `ice`
 * (cold streak), `gold` (biggest win), `sink` (biggest loss — the letters sag).
 * `live` adds the motion: a flicker for fire, a glint sweeping across ice and
 * gold, a one-time droop for sink. All of it is transform/opacity on copies of
 * the text, so the GPU runs it without repainting. `ltr` keeps an amount's
 * characters in order inside right-to-left text.
 */
export function FxText({ kind, text, live, ltr, class: cls = '' }: { kind: 'fire' | 'ice' | 'gold' | 'sink'; text: string; live?: boolean; ltr?: boolean; class?: string }) {
  const dir = ltr ? 'ltr' : undefined;
  if (kind === 'sink') {
    // One inline-block per letter so each can droop a little more than the last;
    // words stay separate so a long label can still wrap between them.
    const total = Array.from(text.replace(/\s+/g, '')).length;
    let k = 0;
    return (
      <span class={`fx fx--sink ${live ? 'fx--live' : ''} ${cls}`} dir={dir}>
        <span class="sr-only">{text}</span>
        <span aria-hidden="true">
          {text.split(/(\s+)/).map((word, w) =>
            /^\s+$/.test(word) || !word ? (
              word
            ) : (
              <span key={w} class="fx__word">
                {Array.from(word).map((ch) => {
                  const t = total > 1 ? k++ / (total - 1) : 0;
                  return (
                    <span class="fx__ch" style={{ '--k': t.toFixed(3) }}>
                      {ch}
                    </span>
                  );
                })}
              </span>
            ),
          )}
        </span>
      </span>
    );
  }
  return (
    <span class={`fx fx--${kind} ${live ? 'fx--live' : ''} ${cls}`} dir={dir} data-text={text}>
      {withCurrency(text)}
      {live && kind !== 'fire' && (
        <span class="fx__shine" aria-hidden="true">
          <span class="fx__copy">{withCurrency(text)}</span>
        </span>
      )}
    </span>
  );
}

/** The ₪ sign in its own span, so a style can set it like a price tag's small raised currency. */
function withCurrency(text: string) {
  const i = text.indexOf('₪');
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span class="fx__cur">₪</span>
      {text.slice(i + 1)}
    </>
  );
}

export function ScreenHead({ title, sub, action }: { title: string; sub?: ComponentChildren; action?: ComponentChildren }) {
  return (
    <header class="shead">
      <div class="shead__text">
        <h1 class="shead__title">{title}</h1>
        {sub && <p class="shead__sub">{sub}</p>}
      </div>
      {action}
    </header>
  );
}

export function SectionLabel({ children, count }: { children: ComponentChildren; count?: number }) {
  return (
    <h2 class="label">
      {children}
      {count !== undefined && <span class="label__count">{count}</span>}
    </h2>
  );
}

export function Empty({ icon, title, children }: { icon: ComponentChildren; title: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <span class="empty__icon">{icon}</span>
      <strong class="empty__title">{title}</strong>
      {children && <p class="empty__text">{children}</p>}
    </div>
  );
}

/**
 * Loading placeholder: a few faint rows shaped like the list that's coming,
 * with a soft light sweeping over them, so the screen keeps its layout and
 * the real rows simply take their place. `label` is for screen readers.
 */
export function Spinner({ label = tr.common.loading }: { label?: string }) {
  return (
    <div class="skeleton" role="status" aria-label={label}>
      <ul class="surface rows skeleton__list" aria-hidden="true">
        {[62, 48, 56, 40].map((w) => (
          <li key={w} class="row">
            <span class="sk sk--avatar" />
            <span class="row__main">
              <span class="sk sk--line" style={{ width: `${w}%` }} />
              <span class="sk sk--line sk--sub" />
            </span>
            <span class="sk sk--amount" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Bottom sheet rendered into <body>, so it always covers the top bar, the
 * bottom nav and any animated screen container (which would otherwise trap
 * its z-index in a stacking context).
 */
export function Sheet({ onClose, children }: { onClose?: () => void; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);

  // Every screen closes a sheet by simply not rendering it any more, so the
  // exit animation lives here: just before the sheet leaves the DOM, a copy
  // of it is left behind to slide down and fade, then removed.
  useLayoutEffect(
    () => () => {
      const el = ref.current;
      if (!el?.isConnected) return;
      const ghost = el.cloneNode(true) as HTMLElement;
      // cloneNode copies attributes, not what was typed — keep inputs showing their text while it leaves.
      const inputs = el.querySelectorAll('input');
      ghost.querySelectorAll('input').forEach((input, i) => input.setAttribute('value', inputs[i]?.value ?? ''));
      ghost.classList.add('modal--leaving');
      ghost.setAttribute('aria-hidden', 'true');
      document.body.appendChild(ghost);
      const remove = () => ghost.remove();
      ghost.addEventListener('animationend', (e) => e.target === ghost && remove());
      setTimeout(remove, 500);
    },
    [],
  );

  return createPortal(
    <div ref={ref} class="modal" onClick={(e) => onClose && e.target === e.currentTarget && onClose()}>
      <div class="modal__panel" role="dialog" aria-modal="true">
        <div class="modal__handle" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** English / עברית toggle. Each option is written in its own language, so it's findable from either. */
export function LangSwitch() {
  const current = useLang();
  return (
    <div class={`seg ${current === 'he' ? 'seg--right' : ''}`} role="group" aria-label="Language / שפה">
      <span class="seg__thumb" />
      <button type="button" aria-pressed={current === 'en'} onClick={() => setLang('en')} lang="en">
        English
      </button>
      <button type="button" aria-pressed={current === 'he'} onClick={() => setLang('he')} lang="he">
        עברית
      </button>
    </div>
  );
}

/** "Poker Night" / "ערב פוקר" with the second word in gold. */
export function AppTitle() {
  const [first, second] = tr.appName.split(' ');
  return (
    <h1 class="auth__title">
      {first} <span>{second}</span>
    </h1>
  );
}
