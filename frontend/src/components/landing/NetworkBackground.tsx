/** A slowly moving network of connected nodes: the "operations graph" behind the hero.
 *  Pure SVG + CSS animation, so it costs almost nothing and respects reduced motion. */
const NODES: [number, number][] = [
  [90, 120], [210, 60], [330, 150], [450, 70], [580, 140], [710, 80],
  [140, 260], [270, 300], [400, 230], [520, 310], [650, 250], [740, 340],
  [60, 400], [200, 440], [350, 410], [480, 450], [610, 420], [720, 470],
]
const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [0, 6], [6, 7], [7, 8], [8, 3], [8, 9], [9, 4], [9, 10], [10, 5], [10, 11],
  [6, 12], [7, 13], [13, 14], [14, 8], [14, 15], [15, 9], [15, 16], [16, 10], [16, 17], [12, 13], [2, 8],
]

export default function NetworkBackground({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" aria-hidden className={className}>
      <defs>
        <radialGradient id="nx-fade" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="nx-mask">
          <rect width="800" height="500" fill="url(#nx-fade)" />
        </mask>
      </defs>
      <g mask="url(#nx-mask)">
        {EDGES.map(([a, b], i) => (
          <line
            key={i}
            className="nx-edge"
            style={{ animationDuration: `${2.5 + (i % 5) * 0.7}s` }}
            x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]}
            stroke="#2fcb8b" strokeOpacity="0.35" strokeWidth="1"
          />
        ))}
        {NODES.map(([x, y], i) => (
          <circle
            key={i}
            className="nx-node"
            style={{ animationDelay: `${(i * 0.37) % 4}s` }}
            cx={x} cy={y} r={i % 4 === 0 ? 4 : 2.6}
            fill={i % 4 === 0 ? '#5fe0aa' : '#2fcb8b'}
          />
        ))}
      </g>
    </svg>
  )
}