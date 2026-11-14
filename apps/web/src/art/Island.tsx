import { RARE_OF, type Biome, type Building, type Producer, type Res } from '@isle/core';
import { ResIcon } from './Icons.tsx';

// Isometric helpers. A building stands on a diamond with half-width w and half-depth w / 2.
const HX = 56;
const HY = 28;
const CX = 200;
const CY = 150;
const at = (gx: number, gy: number) => ({ x: CX + (gx - gy) * HX, y: CY + (gx + gy) * HY });

export const PLOT: Record<Building, { x: number; y: number }> = {
  lab: at(0, 0),
  datacenter: at(1, 0),
  factory: at(0, 1),
  harbor: at(2, 0),
  house: at(0, 2),
  storage: at(2, 1),
  fun: at(1, 2),
  solar: at(2, 2),
};
export const PLAZA = at(1, 1);
const ORDER: Building[] = ['lab', 'datacenter', 'factory', 'harbor', 'house', 'storage', 'fun', 'solar'];

const pts = (...p: number[][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
/** A point on the left wall: u runs from the west corner to the south corner, v goes up. */
const L = (x: number, y: number, w: number, h: number, u: number, v: number) => [x - w + u * w, y + (u * w) / 2 - v * h];
/** A point on the right wall: u runs from the south corner to the east corner. */
const R = (x: number, y: number, w: number, h: number, u: number, v: number) => [x + u * w, y + w / 2 - (u * w) / 2 - v * h];

function Box({ x, y, w, h, top, left, right }: { x: number; y: number; w: number; h: number; top: string; left: string; right: string }) {
  const d = w / 2;
  return (
    <>
      <polygon points={pts([x - w, y - h], [x, y + d - h], [x, y + d], [x - w, y])} fill={left} />
      <polygon points={pts([x, y + d - h], [x + w, y - h], [x + w, y], [x, y + d])} fill={right} />
      <polygon points={pts([x, y - d - h], [x + w, y - h], [x, y + d - h], [x - w, y - h])} fill={top} />
    </>
  );
}

function Pane({ f, x, y, w, h, u, v, du, dv, fill, className, style }: { f: typeof L; x: number; y: number; w: number; h: number; u: number; v: number; du: number; dv: number; fill: string; className?: string; style?: React.CSSProperties }) {
  return <polygon className={className} style={style} points={pts(f(x, y, w, h, u, v), f(x, y, w, h, u + du, v), f(x, y, w, h, u + du, v + dv), f(x, y, w, h, u, v + dv))} fill={fill} />;
}

/** Height of the drawing above the ground, used to place the "ready" bubble. */
export function heightOf(b: Building, level: number): number {
  switch (b) {
    case 'solar': return 22;
    case 'factory': return 18 + level * 2 + 18 + level;
    case 'datacenter': return 26 + level * 3.4;
    case 'house': return 16 + level * 1.2 + 22 + level;
    case 'storage': return 14 + level * 1.5;
    case 'lab': return 18 + level * 2 + 22;
    case 'fun': return 36 + level * 1.5 + 12;
    case 'harbor': return 84;
  }
}

function Solar({ x, y, level }: { x: number; y: number; level: number }) {
  const n = level >= 8 ? 4 : level >= 5 ? 3 : level >= 2 ? 2 : 1;
  const slots = [[[0, 0]], [[-17, 0], [17, 0]], [[-17, 0], [17, 0], [0, -9]], [[0, -9], [-18, 0], [18, 0], [0, 9]]][n - 1];
  const ty = y - 5;
  return (
    <>
      <Box x={x} y={y} w={38} h={5} top="#b9c6d6" left="#93a2b5" right="#74839a" />
      {slots.map(([dx, dy], i) => {
        const px = x + dx;
        const py = ty + dy;
        return (
          <g key={i}>
            <path d={`M${px + 14} ${py - 7}V${py}`} stroke="#5d6b80" strokeWidth="1.5" />
            <polygon points={pts([px - 14, py], [px, py - 14], [px + 14, py - 7], [px, py + 7])} fill="#2b5fb8" stroke="#bcd8ff" strokeWidth="1" strokeLinejoin="round" />
            <path d={`M${px - 7} ${py - 7}L${px + 7} ${py}M${px - 7} ${py + 3.500}L${px + 7} ${py - 10.500}`} stroke="#8fb8f5" strokeWidth="0.8" />
            <polygon className="glint" points={pts([px - 9, py - 3], [px - 3, py - 9], [px, py - 7.500], [px - 6, py - 1.500])} fill="#fff" opacity="0.35" />
          </g>
        );
      })}
    </>
  );
}

function Factory({ x, y, level }: { x: number; y: number; level: number }) {
  const w = 34;
  const h = 18 + level * 2;
  const ch = 16 + level;
  const cx = x - 12;
  const cy = y - h - 3;
  return (
    <>
      <Box x={x} y={y} w={w} h={h} top="#e59a78" left="#cf7c5a" right="#ad5f42" />
      <Pane f={R} x={x} y={y} w={w} h={h} u={0.15} v={0.35} du={0.25} dv={0.3} fill="#ffe08a" />
      <Pane f={R} x={x} y={y} w={w} h={h} u={0.55} v={0.35} du={0.25} dv={0.3} fill="#ffe08a" />
      <Pane f={L} x={x} y={y} w={w} h={h} u={0.35} v={0} du={0.3} dv={0.55} fill="#7a3f2a" />
      <Box x={cx} y={cy} w={6} h={ch} top="#8b8f96" left="#a3a7ae" right="#70747b" />
      {[0, 1, 2].map((i) => (
        <circle key={i} className="smoke" style={{ animationDelay: `${i * 1.1}s` }} cx={cx} cy={cy - ch - 6} r={5} fill="#fff" opacity="0" />
      ))}
    </>
  );
}

function DataCenter({ x, y, level }: { x: number; y: number; level: number }) {
  const w = 30;
  const h = 26 + level * 3.4;
  const rows = Math.max(2, Math.floor(h / 10));
  const leds: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    const v = (r + 0.6) / (rows + 0.4);
    for (let i = 0; i < 3; i++) {
      const u = 0.14 + i * 0.28;
      const color = (r + i) % 3 === 0 ? '#7dffb0' : '#6fe6ff';
      leds.push(<Pane key={`l${r}${i}`} className="led" style={{ animationDelay: `${((r * 3 + i) * 0.37) % 2.4}s` }} f={L} x={x} y={y} w={w} h={h} u={u} v={v} du={0.16} dv={0.045} fill={color} />);
      leds.push(<Pane key={`r${r}${i}`} className="led" style={{ animationDelay: `${((r * 5 + i) * 0.53) % 2.4}s` }} f={R} x={x} y={y} w={w} h={h} u={u} v={v} du={0.16} dv={0.045} fill={color} />);
    }
  }
  return (
    <>
      <Box x={x} y={y} w={w} h={h} top="#6d7fa3" left="#4b5a78" right="#39455e" />
      {leds}
      <polygon points={pts([x, y - h - 8], [x + 14, y - h - 1], [x, y - h + 6], [x - 14, y - h - 1])} fill="#8fa2c9" />
    </>
  );
}

function House({ x, y, level }: { x: number; y: number; level: number }) {
  const w = 30;
  const h = 16 + level * 1.2;
  const d = w / 2;
  const apex = [x, y - h - 20 - level];
  return (
    <>
      <Box x={x} y={y} w={w} h={h} top="#f6e7c8" left="#f0d9ad" right="#d8b884" />
      <Pane f={R} x={x} y={y} w={w} h={h} u={0.38} v={0} du={0.26} dv={0.62} fill="#8a5a2b" />
      <Pane f={L} x={x} y={y} w={w} h={h} u={0.3} v={0.3} du={0.36} dv={0.4} fill="#8fd3ff" />
      <polygon points={pts([x - w - 4, y - h + 1], [x, y + d - h + 4], apex)} fill="#e06a55" />
      <polygon points={pts([x, y + d - h + 4], [x + w + 4, y - h + 1], apex)} fill="#b8483a" />
      {level >= 4 && <Box x={x + 12} y={y - h - 14} w={4} h={9} top="#c9b48f" left="#d9c7a5" right="#a8926c" />}
    </>
  );
}

function Storage({ x, y, level }: { x: number; y: number; level: number }) {
  const w = 36;
  const h = 14 + level * 1.5;
  const line = (a: number[], b: number[]) => <path d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} stroke="#6f5230" strokeWidth="1.4" />;
  return (
    <>
      <Box x={x} y={y} w={w} h={h} top="#d9b57b" left="#bd9358" right="#9a7440" />
      {line(L(x, y, w, h, 0.08, 0.1), L(x, y, w, h, 0.92, 0.9))}
      {line(L(x, y, w, h, 0.08, 0.9), L(x, y, w, h, 0.92, 0.1))}
      {line(R(x, y, w, h, 0.08, 0.1), R(x, y, w, h, 0.92, 0.9))}
      {line(R(x, y, w, h, 0.08, 0.9), R(x, y, w, h, 0.92, 0.1))}
      <Box x={x - 8} y={y - h - 2} w={9} h={7} top="#e9cf9c" left="#cfa96c" right="#ab8548" />
      {level >= 3 && <Box x={x + 10} y={y - h + 1} w={7} h={5} top="#e9cf9c" left="#cfa96c" right="#ab8548" />}
    </>
  );
}

function Lab({ x, y, level }: { x: number; y: number; level: number }) {
  const w = 30;
  const h = 18 + level * 2;
  const ty = y - h;
  return (
    <>
      <Box x={x} y={y} w={w} h={h} top="#f3f7fa" left="#e1e9f0" right="#c2cedb" />
      <Pane f={L} x={x} y={y} w={w} h={h} u={0.12} v={0.45} du={0.76} dv={0.22} fill="#63d6ff" />
      <Pane f={R} x={x} y={y} w={w} h={h} u={0.12} v={0.45} du={0.76} dv={0.22} fill="#3fb4e6" />
      <ellipse cx={x} cy={ty} rx={18} ry={9} fill="#a9b8c7" />
      <path className="dome" d={`M${x - 16} ${ty - 1}A16 17 0 0 1 ${x + 16} ${ty - 1}A16 8 0 0 1 ${x - 16} ${ty - 1}z`} fill="#8fe6ff" stroke="#e8fbff" strokeWidth="1" />
      <path d={`M${x - 8} ${ty - 9}a10 10 0 0 1 8-6`} stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d={`M${x} ${ty - 17}v-8`} stroke="#8b97a5" strokeWidth="1.4" />
      <circle className="blink" cx={x} cy={ty - 26} r="2.2" fill="#ff6b6b" />
    </>
  );
}

function Fun({ x, y, level }: { x: number; y: number; level: number }) {
  const w = 32;
  const d = w / 2;
  const apex = [x, y - 36 - level * 1.5];
  const l = (u: number) => [x - w + u * w, y + u * d];
  const r = (u: number) => [x + u * w, y + d - u * d];
  return (
    <>
      <polygon points={pts(l(0), l(1), apex)} fill="#ff7aa8" />
      <polygon points={pts(r(0), r(1), apex)} fill="#e0507f" />
      <polygon points={pts(l(0.3), l(0.52), apex)} fill="#fff" opacity="0.9" />
      <polygon points={pts(l(0.74), l(0.94), apex)} fill="#fff" opacity="0.9" />
      <polygon points={pts(r(0.1), r(0.3), apex)} fill="#ffe1ec" opacity="0.9" />
      <polygon points={pts(r(0.52), r(0.72), apex)} fill="#ffe1ec" opacity="0.9" />
      <path d={`M${apex[0]} ${apex[1]}v-11`} stroke="#8a5a2b" strokeWidth="1.4" />
      <polygon className="flag" points={pts([apex[0], apex[1] - 11], [apex[0] + 10, apex[1] - 8], [apex[0], apex[1] - 5])} fill="#ffd84a" />
      <polygon points={pts(r(0.06), [x + 5, y + d - 14], [x + 9, y + d - 4])} fill="#7a2b48" />
    </>
  );
}

function Harbor({ x, y, balloon }: { x: number; y: number; level: number; balloon: boolean }) {
  const ty = y - 5;
  const bx = x - 6;
  const by = ty - 52;
  return (
    <>
      <Box x={x} y={y} w={36} h={5} top="#d6ae78" left="#b98d58" right="#977040" />
      <path d={`M${x - 18} ${ty - 3}L${x + 4} ${ty + 8}M${x - 6} ${ty - 9}L${x + 16} ${ty + 2}`} stroke="#a37c4a" strokeWidth="1" />
      <path d={`M${x + 16} ${ty - 2}v-26`} stroke="#7c5a34" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx={x + 16} cy={ty - 30} r="3" fill="#ffd84a" stroke="#b98a12" strokeWidth="0.8" />
      {balloon && (
        <g className="balloon">
          <path d={`M${bx - 10} ${by + 14}L${bx - 5} ${by + 30}M${bx + 10} ${by + 14}L${bx + 5} ${by + 30}`} stroke="#7c5a34" strokeWidth="0.9" />
          <ellipse cx={bx} cy={by} rx="17" ry="19" fill="#ff8a5b" />
          <path d={`M${bx - 7} ${by - 17}c-5 10-5 24 0 34 2 1.5 12 1.5 14 0 5-10 5-24 0-34-4-2-10-2-14 0z`} fill="#fff1dc" />
          <path d={`M${bx} ${by - 19}v38`} stroke="#ff8a5b" strokeWidth="5" />
          <rect x={bx - 6} y={by + 29} width="12" height="8" rx="2" fill="#a56a3a" stroke="#7c4a22" strokeWidth="0.8" />
          <path d={`M${bx + 6} ${by + 33}L${x + 16} ${ty - 28}`} stroke="#7c5a34" strokeWidth="0.8" strokeDasharray="2 2" />
        </g>
      )}
    </>
  );
}

const SKIN: Record<Biome, { top: string; rim: string; rockL: string; rockR: string; patch: string }> = {
  snow: { top: '#f4f9ff', rim: '#cfe1f3', rockL: '#93a0b6', rockR: '#717e95', patch: '#e3eefa' },
  tropical: { top: '#f7e6a8', rim: '#dfc474', rockL: '#b48e5e', rockR: '#8f6d45', patch: '#9fd66b' },
  desert: { top: '#f1cc8b', rim: '#d8a85b', rockL: '#b97b4e', rockR: '#935d39', patch: '#e6b96f' },
  forest: { top: '#93d273', rim: '#5fa650', rockL: '#8d6e50', rockR: '#6d523b', patch: '#7cc25f' },
};

function Decor({ biome, x, y, s = 1 }: { biome: Biome; x: number; y: number; s?: number }) {
  const t = `translate(${x} ${y}) scale(${s})`;
  if (biome === 'snow')
    return (
      <g transform={t}>
        <rect x="-1.5" y="-6" width="3" height="6" fill="#7c5a34" />
        <polygon points="0,-34 9,-16 -9,-16" fill="#3f8f6b" />
        <polygon points="0,-26 11,-6 -11,-6" fill="#35805f" />
        <polygon points="0,-34 4.500,-25 -4.500,-25" fill="#fff" />
        <path d="M-9 -8q4.500 -3 9 -1t9 -1" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </g>
    );
  if (biome === 'tropical')
    return (
      <g transform={t}>
        <path d="M0 0c-1-10 0-20 4-28" stroke="#9a6b3a" strokeWidth="3.4" fill="none" strokeLinecap="round" />
        {[-70, -35, 0, 35, 70].map((a) => (
          <path key={a} d="M4 -28q2 -13 15 -10q-9 1 -15 10z" fill={a % 2 ? '#3fa653' : '#57b84a'} transform={`rotate(${a - 20} 4 -28)`} />
        ))}
        <circle cx="5" cy="-25" r="2.200" fill="#8a5a2b" />
      </g>
    );
  if (biome === 'desert')
    return (
      <g transform={t}>
        <rect x="-3.500" y="-26" width="7" height="26" rx="3.500" fill="#4fa565" />
        <path d="M-3.500 -10h-5.500v-9M3.500 -14h5.500v-8" stroke="#4fa565" strokeWidth="4.600" fill="none" strokeLinecap="round" />
        <path d="M0 -24v22" stroke="#3a8650" strokeWidth="0.9" />
        <circle cx="0" cy="-27" r="2" fill="#ff7aa8" />
      </g>
    );
  return (
    <g transform={t}>
      <rect x="-2" y="-10" width="4" height="10" fill="#7c5a34" />
      <circle cx="-6" cy="-17" r="9" fill="#3f9a4d" />
      <circle cx="6" cy="-18" r="9.500" fill="#4aa957" />
      <circle cx="0" cy="-26" r="10" fill="#57b862" />
    </g>
  );
}

export interface IslandArtProps {
  biome: Biome;
  levels: Record<Building, number>;
  /** Producers with something to collect: how full they are. */
  ready?: Partial<Record<Producer, 'some' | 'full'>>;
  /** Buildings the player can afford to build or upgrade right now. */
  canUp?: Partial<Record<Building, boolean>>;
  balloon?: boolean;
  onTap?: (b: Building) => void;
  onCollect?: (b: Producer) => void;
}

const PRODUCT: Record<Producer, Res | 'rare'> = { solar: 'energy', factory: 'materials', datacenter: 'credits', house: 'rare' };

export function IslandArt({ biome, levels, ready = {}, canUp = {}, balloon = true, onTap, onCollect }: IslandArtProps) {
  const s = SKIN[biome];
  return (
    <svg className="island-art" viewBox="0 0 400 430" role="img" aria-label="island">
      <g className="clouds">
        <g className="cloud cloud-a"><ellipse cx="70" cy="60" rx="34" ry="12" fill="#fff" /><ellipse cx="92" cy="52" rx="22" ry="12" fill="#fff" /></g>
        <g className="cloud cloud-b"><ellipse cx="320" cy="96" rx="28" ry="10" fill="#fff" /><ellipse cx="302" cy="89" rx="18" ry="10" fill="#fff" /></g>
        <g className="cloud cloud-c"><ellipse cx="60" cy="350" rx="30" ry="10" fill="#fff" /><ellipse cx="340" cy="372" rx="36" ry="11" fill="#fff" /></g>
      </g>
      <g className="island-float">
        {/* small rocks drifting beside the island */}
        <g className="pebble"><polygon points="28,300 46,292 58,302 44,322 32,316" fill={s.rockR} /><polygon points="28,300 46,292 58,302 42,306" fill={s.rim} /></g>
        <g className="pebble pebble-b"><polygon points="352,318 366,312 376,320 366,336 356,330" fill={s.rockR} /><polygon points="352,318 366,312 376,320 364,323" fill={s.rim} /></g>
        {/* rock underside */}
        <polygon points="8,206 200,308 200,412 150,372 118,330 70,300 44,256" fill={s.rockL} />
        <polygon points="392,206 200,308 200,412 246,366 290,336 330,292 362,250" fill={s.rockR} />
        <polygon points="200,308 200,412 176,360 150,372 170,322" fill="#000" opacity="0.08" />
        <polygon points="118,330 132,296 150,372" fill="#000" opacity="0.1" />
        <polygon points="290,336 276,300 246,366" fill="#fff" opacity="0.07" />
        {/* grass rim and top */}
        <polygon points="8,206 200,308 392,206 392,222 200,324 8,222" fill={s.rim} />
        <polygon points="200,104 392,206 200,308 8,206" fill={s.top} />
        <polygon points="200,138 328,206 200,274 72,206" fill={s.patch} opacity="0.55" />
        <polygon points="200,180 250,206 200,232 150,206" fill="#000" opacity="0.06" />
        {biome === 'snow' && <ellipse cx="300" cy="262" rx="26" ry="9" fill="#bfe6ff" opacity="0.9" />}
        {biome === 'tropical' && <path d="M8 206 200 308l30-16L60 196z" fill="#8fdcff" opacity="0.5" />}
        {/* back decor */}
        <Decor biome={biome} x={106} y={160} s={0.9} />
        <Decor biome={biome} x={296} y={160} s={0.8} />
        <Decor biome={biome} x={36} y={208} s={0.85} />

        {ORDER.map((b) => {
          const { x, y } = PLOT[b];
          const level = levels[b];
          const state = ready[b as Producer];
          const up = canUp[b];
          return (
            <g key={b} className={`plot ${onTap ? 'tappable' : ''}`} onClick={onTap ? () => onTap(b) : undefined}>
              <ellipse cx={x} cy={y + 2} rx="42" ry="20" fill="#000" opacity={level ? 0.12 : 0} />
              {level === 0 ? (
                <g className="empty-plot">
                  <polygon points={pts([x, y - 16], [x + 32, y], [x, y + 16], [x - 32, y])} fill="#fff" fillOpacity="0.25" stroke="#fff" strokeWidth="1.6" strokeDasharray="5 4" />
                  <circle cx={x} cy={y} r="9" fill={up ? '#39c46b' : '#fff'} opacity="0.95" />
                  <path d={`M${x - 4.500} ${y}h9M${x} ${y - 4.500}v9`} stroke={up ? '#fff' : '#5a7fa8'} strokeWidth="2" strokeLinecap="round" />
                </g>
              ) : (
                <>
                  {b === 'solar' && <Solar x={x} y={y} level={level} />}
                  {b === 'factory' && <Factory x={x} y={y} level={level} />}
                  {b === 'datacenter' && <DataCenter x={x} y={y} level={level} />}
                  {b === 'house' && <House x={x} y={y} level={level} />}
                  {b === 'storage' && <Storage x={x} y={y} level={level} />}
                  {b === 'lab' && <Lab x={x} y={y} level={level} />}
                  {b === 'fun' && <Fun x={x} y={y} level={level} />}
                  {b === 'harbor' && <Harbor x={x} y={y} level={level} balloon={balloon} />}
                  <g className="level-pill">
                    <rect x={x - 11} y={y + 21} width="22" height="13" rx="6.500" fill="#fff" opacity="0.92" />
                    <text x={x} y={y + 31} textAnchor="middle" fontSize="9.500" fontWeight="700" fill="#34435a">{level}</text>
                  </g>
                </>
              )}
              {up && level > 0 && (
                <g className="up-mark">
                  <circle cx={x + 16} cy={y + 27} r="6.500" fill="#39c46b" stroke="#fff" strokeWidth="1.2" />
                  <path d={`M${x + 16} ${y + 30.500}v-7M${x + 13} ${y + 26.500}l3-3 3 3`} stroke="#fff" strokeWidth="1.600" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              )}
              {state && level > 0 && (
                <g
                  className={`ready ${state}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCollect?.(b as Producer);
                  }}
                >
                  <circle cx={x} cy={y - heightOf(b, level) - 16} r="13" fill={state === 'full' ? '#fff3c4' : '#fff'} stroke={state === 'full' ? '#f59b0b' : '#c8d6e6'} strokeWidth="2" />
                  <ResIcon res={PRODUCT[b as Producer] === 'rare' ? RARE_OF[biome] : (PRODUCT[b as Producer] as Res)} size={17} x={x - 8.500} y={y - heightOf(b, level) - 24.500} />
                </g>
              )}
              {/* a generous invisible hit area */}
              <ellipse cx={x} cy={y - heightOf(b, Math.max(level, 1)) / 2 + 6} rx="40" ry={Math.max(24, heightOf(b, Math.max(level, 1)) / 2 + 14)} fill="transparent" />
            </g>
          );
        })}

        {/* front decor */}
        <Decor biome={biome} x={110} y={262} s={0.8} />
        <Decor biome={biome} x={292} y={258} s={0.85} />
      </g>
    </svg>
  );
}
