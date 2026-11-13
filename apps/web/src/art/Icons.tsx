import type { Egg, Res } from '@isle/core';

/** Small resource glyphs, drawn on a 24 x 24 grid. */
export function ResIcon({ res, size = 18, x, y }: { res: Res; size?: number; x?: number; y?: number }) {
  return (
    <svg className="res-icon" x={x} y={y} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {GLYPH[res]}
    </svg>
  );
}

const GLYPH: Record<Res, React.ReactNode> = {
  energy: (
    <>
      <circle cx="12" cy="12" r="11" fill="#ffe27a" />
      <path d="M13.5 3 6 13.5h5L10 21l8-11h-5.2z" fill="#f59b0b" stroke="#b96a00" strokeWidth="0.8" strokeLinejoin="round" />
    </>
  ),
  materials: (
    <>
      <path d="M2 9.5 12 5l10 4.5v8L12 22 2 17.5z" fill="#c9844a" />
      <path d="M2 9.5 12 14l10-4.5L12 5z" fill="#e6a56b" />
      <path d="M12 14v8" stroke="#8a5429" strokeWidth="1" />
      <path d="M7 11.8v8M17 11.8v8" stroke="#8a5429" strokeWidth="0.8" opacity="0.6" />
    </>
  ),
  credits: (
    <>
      <ellipse cx="12" cy="14" rx="9.5" ry="8" fill="#c98a12" />
      <ellipse cx="12" cy="11" rx="9.5" ry="8" fill="#ffcd3c" />
      <ellipse cx="12" cy="11" rx="6.2" ry="5" fill="none" stroke="#c98a12" strokeWidth="1.2" />
      <path d="M12 8v6M10 9.5h3a1.2 1.2 0 0 1 0 2.4h-2" stroke="#a86c00" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </>
  ),
  ice: (
    <>
      <path d="M12 2 20 8.5 16.5 21h-9L4 8.5z" fill="#a8e4ff" />
      <path d="M12 2 20 8.5 12 11z" fill="#e3f7ff" />
      <path d="M12 11 16.5 21h-9z" fill="#6cc6f2" />
      <path d="M12 2v9M4 8.5 12 11l8-2.5" stroke="#fff" strokeWidth="0.8" fill="none" opacity="0.9" />
    </>
  ),
  fruit: (
    <>
      <path d="M12 6.5c5.5-1.5 9 2.5 8 8-1 5-5 7.5-8 7.5s-7-2.5-8-7.5c-1-5.500 2.500-9.500 8-8z" fill="#ff9d3c" />
      <path d="M8 10.500c-1.800 1.200-2.500 3.200-2.200 5.200" stroke="#ffd29a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M12 7c0-2 1-3.500 3-4.500" stroke="#6b4a1e" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M13 4.500c2-2 5-1.800 6.500-.5-2 1.800-4.500 2-6.500.5z" fill="#57b84a" />
    </>
  ),
  glass: (
    <>
      <path d="M5 4h14l2 7-9 11L3 11z" fill="#9be3d8" opacity="0.95" />
      <path d="M5 4h14l2 7H3z" fill="#d6fbf5" />
      <path d="M3 11h18L12 22z" fill="#5fc9bb" />
      <path d="M9 4 7.500 11 12 22l4.500-11L15 4" stroke="#fff" strokeWidth="0.8" fill="none" opacity="0.9" />
    </>
  ),
  wood: (
    <>
      <rect x="2" y="8" width="18" height="10" rx="5" fill="#a56a3a" />
      <path d="M6 11h8M5 15h9" stroke="#7c4a22" strokeWidth="1" strokeLinecap="round" />
      <ellipse cx="19" cy="13" rx="3.500" ry="5" fill="#e8c08a" />
      <ellipse cx="19" cy="13" rx="1.600" ry="2.400" fill="none" stroke="#b98a52" strokeWidth="0.9" />
    </>
  ),
};

export function EggIcon({ egg, found, size = 40 }: { egg: Egg; found: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" style={found ? undefined : { filter: 'grayscale(1) brightness(0.45)', opacity: 0.45 }}>
      {EGG[egg]}
    </svg>
  );
}

const EGG: Record<Egg, React.ReactNode> = {
  yocto: (
    <>
      <circle cx="20" cy="20" r="15" fill="#fff4c9" stroke="#e0b93a" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="2.600" fill="#ffcd3c" stroke="#a86c00" strokeWidth="0.8" />
      <path d="M8 31 31 8" stroke="#e0b93a" strokeWidth="0.8" strokeDasharray="2 2" />
      <circle cx="28" cy="12" r="6" fill="none" stroke="#7b6a3a" strokeWidth="1.6" />
      <path d="M32.500 16.500 36 20" stroke="#7b6a3a" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  nightshade: (
    <>
      <path d="M20 34V19" stroke="#3f8a4a" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 27c-5-1-7-4-7-7 4 0 7 3 7 7zM20 25c5-1 7-4 7-7-4 0-7 3-7 7z" fill="#57b84a" />
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="20" cy="8.500" rx="3.400" ry="6" fill="#7a5cd6" transform={`rotate(${a} 20 14)`} />
      ))}
      <circle cx="20" cy="14" r="2.600" fill="#ffd84a" />
    </>
  ),
  doomslug: (
    <>
      <path d="M5 30c0-6 5-9 11-9 3 0 4-4 3-8 4-1 9 3 9 9 4 0 7 3 7 8z" fill="#9ad26b" stroke="#5c9a37" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M20 13 17 6M23 13l2-7" stroke="#5c9a37" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="17" cy="5.500" r="1.800" fill="#fff" stroke="#333" strokeWidth="0.8" />
      <circle cx="25" cy="5.500" r="1.800" fill="#fff" stroke="#333" strokeWidth="0.8" />
      <path d="M21 18c1 1 2.500 1 3.500 0" stroke="#3f6f22" strokeWidth="1" fill="none" strokeLinecap="round" />
    </>
  ),
  stakehouse: (
    <>
      <path d="M11 34V22M29 34V22M17 34V24M23 34V24" stroke="#8a5a2b" strokeWidth="2" strokeLinecap="round" />
      <rect x="9" y="14" width="22" height="10" rx="1.500" fill="#f2d7a6" stroke="#b98a52" strokeWidth="1" />
      <path d="M6.500 15 20 5l13.500 10z" fill="#d95f4b" stroke="#a23d2c" strokeWidth="1" strokeLinejoin="round" />
      <rect x="18" y="17" width="4" height="7" fill="#8a5a2b" />
      <rect x="12" y="17" width="3.500" height="3.500" fill="#8fd3ff" />
      <rect x="24.500" y="17" width="3.500" height="3.500" fill="#8fd3ff" />
    </>
  ),
  attention: (
    <>
      <rect x="8" y="7" width="24" height="26" rx="2" fill="#f7ecd0" stroke="#c7ad75" strokeWidth="1.2" />
      <ellipse cx="20" cy="7" rx="12" ry="2.600" fill="#e9d6a6" stroke="#c7ad75" strokeWidth="1" />
      <ellipse cx="20" cy="33" rx="12" ry="2.600" fill="#e9d6a6" stroke="#c7ad75" strokeWidth="1" />
      <path d="M12 14h16M12 18h16M12 22h10" stroke="#8a7446" strokeWidth="1.300" strokeLinecap="round" />
      <path d="M13 27c2-2 3 2 5 0s3 2 5 0 3 1 4 0" stroke="#3a5ba8" strokeWidth="1" fill="none" strokeLinecap="round" />
    </>
  ),
};

export function TabIcon({ name }: { name: 'island' | 'board' | 'hunt' | 'world' | 'quests' }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      {name === 'island' && (<><path d="M3 11 12 6l9 5-9 5z" {...p} /><path d="M5 13.500c1 3 3.500 5.500 7 6.500 3.500-1 6-3.500 7-6.500" {...p} /><path d="M12 6V3l3 1.200L12 5.500" {...p} /></>)}
      {name === 'board' && (<><ellipse cx="12" cy="8" rx="6" ry="5" {...p} /><path d="M8 12l2.500 5h3L16 12M10.500 17v2.500h3V17" {...p} /></>)}
      {name === 'hunt' && (<><path d="M4 20 14.500 9.500" {...p} /><path d="M12 5c3-1.500 6-1 8 1-1 2-3.500 3.500-6.500 3.500z" {...p} /><path d="m17 15 1 2 2 .3-1.500 1.400.4 2.100L17 19.800l-1.900 1 .4-2.100L14 17.300l2-.3z" {...p} /></>)}
      {name === 'world' && (<><circle cx="12" cy="12" r="9" {...p} /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" {...p} /></>)}
      {name === 'quests' && (<><rect x="5" y="4" width="14" height="17" rx="2" {...p} /><path d="M9 4V2.500h6V4M8.500 10l1.800 1.800L13.500 8.500M8.500 16h7" {...p} /></>)}
    </svg>
  );
}
