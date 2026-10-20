import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { avatarStyle } from './avatarColor.js';
import { initials } from './initials.js';
import { formatCents } from './money.js';
import { setLang, tr, useLang } from './i18n.js';

/** Shared visual building blocks so every screen speaks the same design language. */

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export function Avatar({ id, name, size = 'md', ring, short }: { id: string; name: string; size?: AvatarSize; ring?: boolean; short?: boolean }) {
  return (
    <span class={`av av--${size} ${ring ? 'av--ring' : ''}`} style={avatarStyle(id)} aria-hidden="true">
      {short ? initials(name).slice(0, 1) : initials(name)}
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

export function Spinner({ label = tr.common.loading }: { label?: string }) {
  return (
    <div class="loading" role="status">
      <span class="loading__chip" />
      <span>{label}</span>
    </div>
  );
}

/**
 * Bottom sheet rendered into <body>, so it always covers the top bar, the
 * bottom nav and any animated screen container (which would otherwise trap
 * its z-index in a stacking context).
 */
export function Sheet({ onClose, children }: { onClose?: () => void; children: ComponentChildren }) {
  return createPortal(
    <div class="modal" onClick={(e) => onClose && e.target === e.currentTarget && onClose()}>
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
