// Reactive wordmark -- docs/design/08-landing-hero.md.
//
// Inline-SVG lockup (MEL red, PINO white, heavy condensed italic per doc
// 09) fractured into 16 shard polygons that tile the 640x240 field
// exactly. Each shard is the full artwork clipped to one triangle, so at
// the identity transform the 16 clips tile with no gaps/overlaps and the
// union is a PIXEL-PERFECT lockup (doc 08's reassemble-at-extremes rule).
// The per-shard transform is `shardTransform` from ./shards.ts -- a pure
// function of (progress, shardIndex); this component holds no timers and
// no shatter state of its own.
//
// PLACEHOLDER note (kept per frontend/public/brand/README.md): the letter
// glyphs are set from Barlow Condensed text, not the hand-traced asset.
// The fracture/reassembly machinery is production-shaped; only the glyph
// artwork is provisional pending the traced shard-split SVG.

import { shardTransform } from "./shards";

const VIEW_W = 640;
const VIEW_H = 240;
const COLS = 4;
const ROWS = 2;
const JITTER_X = 46;
const JITTER_Y = 34;

/** Deterministic [0,1) hash of an integer seed (matches shards.ts mix). */
function hash01(seed: number): number {
  let t = (seed | 0) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

interface Point {
  x: number;
  y: number;
}

interface Shard {
  points: [Point, Point, Point];
  cx: number;
  cy: number;
}

/** Build the fracture ONCE at module load: a jittered (COLS+1)x(ROWS+1)
 * vertex grid, boundary vertices pinned to the rect edges (so the union
 * stays exactly the rect), each cell split into two triangles -> 16
 * gap-free shards with shared vertices. */
function buildShards(): Shard[] {
  const grid: Point[][] = [];
  for (let r = 0; r <= ROWS; r++) {
    const row: Point[] = [];
    for (let c = 0; c <= COLS; c++) {
      const baseX = (c / COLS) * VIEW_W;
      const baseY = (r / ROWS) * VIEW_H;
      const interior = r > 0 && r < ROWS && c > 0 && c < COLS;
      const jx = interior ? (hash01(r * 97 + c * 13 + 1) * 2 - 1) * JITTER_X : 0;
      const jy = interior ? (hash01(r * 97 + c * 13 + 2) * 2 - 1) * JITTER_Y : 0;
      row.push({ x: baseX + jx, y: baseY + jy });
    }
    grid.push(row);
  }

  const shards: Shard[] = [];
  const push = (a: Point, b: Point, d: Point): void => {
    shards.push({
      points: [a, b, d],
      cx: (a.x + b.x + d.x) / 3,
      cy: (a.y + b.y + d.y) / 3,
    });
  };
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tl = grid[r][c];
      const tr = grid[r][c + 1];
      const bl = grid[r + 1][c];
      const br = grid[r + 1][c + 1];
      push(tl, tr, bl);
      push(tr, br, bl);
    }
  }
  return shards;
}

const SHARDS: Shard[] = buildShards();

const RED = "#E8112D";
const WHITE = "#F4F4F2";

/** The full lockup artwork, reused (clipped) inside every shard. Skewed to
 * lean into the condensed-italic look; edges stay hard (no blur). */
const ARTWORK = (
  <g transform="skewX(-9)">
    <text
      x="150"
      y="168"
      fontFamily="'Barlow Condensed', sans-serif"
      fontWeight={800}
      fontStyle="italic"
      fontSize={140}
      letterSpacing="-4"
      fill={RED}
    >
      MEL
    </text>
    <text
      x="360"
      y="168"
      fontFamily="'Barlow Condensed', sans-serif"
      fontWeight={800}
      fontStyle="italic"
      fontSize={140}
      letterSpacing="-4"
      fill={WHITE}
    >
      PINO
    </text>
  </g>
);

export interface WordmarkProps {
  /** Scrub progress in [0,1]; drives the pure per-shard shatter. */
  progress: number;
  className?: string;
}

/** The fracturing MEL PINO lockup. Whole at progress 0 and 1, maximally
 * shattered at SHOT_MOMENT -- see ./shards.ts for the shatter rule. */
export function Wordmark({ progress, className }: WordmarkProps) {
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {SHARDS.map((shard, i) => (
          <clipPath id={`mp-shard-${i}`} key={i} clipPathUnits="userSpaceOnUse">
            <polygon
              points={shard.points.map((p) => `${p.x},${p.y}`).join(" ")}
            />
          </clipPath>
        ))}
      </defs>
      {SHARDS.map((shard, i) => {
        const t = shardTransform(progress, i);
        // translate; rotate about centroid; scale about centroid.
        const transform =
          `translate(${t.tx} ${t.ty}) ` +
          `rotate(${t.rot} ${shard.cx} ${shard.cy}) ` +
          `translate(${shard.cx} ${shard.cy}) ` +
          `scale(${t.scale}) ` +
          `translate(${-shard.cx} ${-shard.cy})`;
        return (
          <g key={i} transform={transform} opacity={t.opacity}>
            <g clipPath={`url(#mp-shard-${i})`}>{ARTWORK}</g>
          </g>
        );
      })}
    </svg>
  );
}
