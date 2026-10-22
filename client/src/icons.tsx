import type { ComponentChildren } from 'preact';

interface IconProps {
  size?: number;
}

export function ChipIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="chipGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#f8db85" />
          <stop offset="1" stop-color="#c8922f" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#chipGrad)" />
      <circle cx="12" cy="12" r="10" fill="none" stroke="#7a5a1c" stroke-width="1" opacity="0.4" />
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="#fff"
        stroke-width="2.2"
        stroke-dasharray="2.6 3.4"
        stroke-linecap="round"
        opacity="0.85"
      />
      <circle cx="12" cy="12" r="5.2" fill="none" stroke="#7a5a1c" stroke-width="1" opacity="0.55" />
    </svg>
  );
}

export function GearIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2.3M12 18.2v2.3M4.6 7.3l2 1.15M17.4 15.55l2 1.15M4.6 16.7l2-1.15M17.4 8.45l2-1.15M3.5 12h2.3M18.2 12h2.3" />
    </svg>
  );
}

export function BellIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M6 10a6 6 0 1 1 12 0c0 3 1 4.5 1.6 5.4a1 1 0 0 1-.8 1.6H5.2a1 1 0 0 1-.8-1.6C5 14.5 6 13 6 10Z" />
      <path d="M9.5 19a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class="dir-icon"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function CheckIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function LinkIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 7.5 12.3 6.2a3.5 3.5 0 0 1 5 5L16 12.5" />
      <path d="M13 16.5 11.7 17.8a3.5 3.5 0 0 1-5-5L8 11.5" />
    </svg>
  );
}

export function ShareIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

export function TrophyIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H5a1 1 0 0 0-1 1v1a3 3 0 0 0 3 3h1" />
      <path d="M16 5h3a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3h-1" />
      <path d="M12 13v3" />
      <path d="M9 20h6" />
      <path d="M10 16.5h4l.6 2a1 1 0 0 1-1 1.5h-3.2a1 1 0 0 1-1-1.5l.6-2Z" />
    </svg>
  );
}

export function CardsIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="8" y="5" width="11" height="15" rx="2" transform="rotate(10 13.5 12.5)" />
      <path d="M13 4.2 6.6 3.1a2 2 0 0 0-2.3 1.6L2.6 14.6a2 2 0 0 0 1.6 2.3l2.3.4" />
      <path d="M13.6 10.6l1.4 1.9-1.9 1.4-1.4-1.9z" />
    </svg>
  );
}

export function ReceiptIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h3" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function WalletIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v2" />
      <path d="M4 7v11a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-3" />
      <path d="M4 7a2 2 0 0 0 2 2h13a1 1 0 0 1 1 1v3" />
      <path d="M20 13h-4a1.5 1.5 0 0 0 0 3h4z" />
    </svg>
  );
}

function Stroke({ size, children, width = 1.9, class: cls }: { size: number; children: ComponentChildren; width?: number; class?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={width}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class={cls}
    >
      {children}
    </svg>
  );
}

export function PlusIcon({ size = 18 }: IconProps) {
  return (
    <Stroke size={size} width={2.2}>
      <path d="M12 5v14M5 12h14" />
    </Stroke>
  );
}

export function ChevronRightIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size} width={2.2} class="dir-icon">
      <path d="m9 6 6 6-6 6" />
    </Stroke>
  );
}

export function ArrowLeftIcon({ size = 18 }: IconProps) {
  return (
    <Stroke size={size} width={2.1} class="dir-icon">
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </Stroke>
  );
}

export function PhoneIcon({ size = 18 }: IconProps) {
  return (
    <Stroke size={size}>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </Stroke>
  );
}

export function UserIcon({ size = 18 }: IconProps) {
  return (
    <Stroke size={size}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Stroke>
  );
}

export function LogoutIcon({ size = 18 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l-5-5 5-5M5 12h11" />
    </Stroke>
  );
}

export function CrownIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" fill="currentColor" />
    </svg>
  );
}

export function CopyIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </Stroke>
  );
}

export function UsersIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" />
    </Stroke>
  );
}

/** Decorative stack of poker chips for hero cards. */
export function ChipStackArt({ size = 130 }: IconProps) {
  const chip = (cx: number, cy: number, fill: string, edge: string, key: string) => (
    <g key={key}>
      <ellipse cx={cx} cy={cy + 5} rx="34" ry="12" fill="rgba(0,0,0,.35)" />
      <ellipse cx={cx} cy={cy + 3} rx="34" ry="12" fill={edge} />
      <ellipse cx={cx} cy={cy} rx="34" ry="12" fill={fill} />
      <ellipse cx={cx} cy={cy} rx="34" ry="12" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="6 9" opacity=".8" />
      <ellipse cx={cx} cy={cy} rx="20" ry="7" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1.5" />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 130 130" aria-hidden="true">
      {chip(70, 104, '#c94040', '#8f2626', 'a')}
      {chip(70, 92, '#2f6fd1', '#1f4c94', 'b')}
      {chip(70, 80, '#1d1d1d', '#000', 'c')}
      {chip(70, 68, '#e9c068', '#a9771f', 'd')}
      {chip(78, 46, '#c94040', '#8f2626', 'e')}
      {chip(84, 26, '#e9c068', '#a9771f', 'f')}
    </svg>
  );
}

export function CameraIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-8Z" />
      <circle cx="12" cy="12.5" r="3.4" />
    </Stroke>
  );
}
