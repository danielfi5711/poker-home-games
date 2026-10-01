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
