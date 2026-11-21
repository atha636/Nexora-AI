/** The Nexora mark: an "N" drawn as a connected path with four nodes (operations, connected).
 *  Scales with `size`; the tile is part of the mark so it works on any background. */
export function Logo({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="Nexora AI"
      className={`shrink-0 ${className}`}
    >
      <rect x="1" y="1" width="94" height="94" rx="22" fill="#131613" stroke="#232723" strokeWidth="2" />
      <path
        d="M30 68V30l36 36V28"
        fill="none"
        stroke="#2fcb8b"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="30" cy="68" r="6.5" fill="#2fcb8b" />
      <circle cx="30" cy="30" r="6.5" fill="#131613" stroke="#2fcb8b" strokeWidth="4" />
      <circle cx="66" cy="66" r="6.5" fill="#131613" stroke="#2fcb8b" strokeWidth="4" />
      <circle cx="66" cy="28" r="6.5" fill="#2fcb8b" />
    </svg>
  )
}