/**
 * The knight from the beanie patch: round light-grey helmet with a pointed crest, dark visor slits,
 * a blue face with two big shiny eyes and small blue feathers at the sides. The body is our addition.
 * Drawn on a 60 x 72 grid with the feet on the bottom edge.
 */
export function Knight({ size = 60, away = false }: { size?: number; away?: boolean }) {
  return (
    <svg className={`knight ${away ? 'knight-away' : ''}`} width={size} height={(size * 72) / 60} viewBox="0 0 60 72" aria-hidden="true">
      <ellipse cx="30" cy="69" rx="15" ry="3" fill="#000" opacity="0.18" />
      <g className="knight-body">
        {/* lance with a pennant */}
        <path d="M49 30v36" stroke="#8a6a44" strokeWidth="2" strokeLinecap="round" />
        <path d="M49 31h9l-3 3.500 3 3.500h-9z" fill="#2f7fd1" />
        {/* cape */}
        <path d="M19 46c-4 6-5 13-4 18h30c1-5 0-12-4-18z" fill="#2a6dbb" />
        {/* body */}
        <rect x="20" y="43" width="20" height="19" rx="7" fill="#c3c8cc" stroke="#8d949a" strokeWidth="1.2" />
        <rect x="20" y="52" width="20" height="3.600" fill="#2f7fd1" />
        <circle cx="30" cy="53.800" r="2.200" fill="#ffd84a" stroke="#b98a12" strokeWidth="0.6" />
        <circle cx="18" cy="50" r="4" fill="#d5d9dc" stroke="#8d949a" strokeWidth="1.2" />
        <circle cx="43" cy="50" r="4" fill="#d5d9dc" stroke="#8d949a" strokeWidth="1.2" />
        <ellipse cx="25" cy="64.500" rx="5" ry="3.400" fill="#6f757b" />
        <ellipse cx="35" cy="64.500" rx="5" ry="3.400" fill="#6f757b" />
        {/* side feathers */}
        <path d="M11 17c-4-4-8-4-10-1.500" stroke="#2f7fd1" strokeWidth="2.400" fill="none" strokeLinecap="round" />
        <path d="M49 17c4-4 8-4 10-1.500" stroke="#2f7fd1" strokeWidth="2.400" fill="none" strokeLinecap="round" />
        {/* helmet */}
        <path d="M23.500 8 30 0l6.500 8z" fill="#d5d9dc" stroke="#8d949a" strokeWidth="1.200" strokeLinejoin="round" />
        <ellipse cx="30" cy="26" rx="22" ry="20.500" fill="#d5d9dc" stroke="#8d949a" strokeWidth="1.400" />
        <path d="M10 22c1 13 9 22 20 22s19-9 20-22c-3 9-11 14-20 14s-17-5-20-14z" fill="#eceff1" />
        {/* visor slits, taller towards the crest */}
        {[13.500, 17.500, 21.500, 25.500, 31.800, 35.800, 39.800, 43.800].map((x, i) => {
          const h = [5, 6.500, 8, 9.500, 9.500, 8, 6.500, 5][i];
          return <rect key={x} x={x} y={20 - h} width="2.700" height={h} rx="0.900" fill="#6f757b" />;
        })}
        {/* face */}
        <path d="M12.500 22h35c.8 0 1.500.7 1.400 1.500C48 32 40 38.500 30 38.500S12 32 11.100 23.500c-.1-.8.6-1.500 1.400-1.500z" fill="#2f7fd1" />
        <g className="knight-eyes">
          <circle cx="22" cy="28.500" r="4.700" fill="#11141a" />
          <circle cx="38" cy="28.500" r="4.700" fill="#11141a" />
          <circle cx="23.700" cy="26.700" r="1.600" fill="#fff" />
          <circle cx="20.500" cy="30.600" r="0.900" fill="#fff" />
          <circle cx="39.700" cy="26.700" r="1.600" fill="#fff" />
          <circle cx="36.500" cy="30.600" r="0.900" fill="#fff" />
        </g>
      </g>
    </svg>
  );
}

/** Chan, the narrator: a simple original portrait, used in the tutorial and season news. */
export function Chan({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r="21" fill="#dff3ff" stroke="#8fd3ff" strokeWidth="1.500" />
      <path d="M7 27C5 13 12 5 22 5s17 8 15 22c-2-7-5-11-15-11S9 20 7 27z" fill="#3a3f52" />
      <path d="M6 24c-2 6-1 11 2 14l4-9zM38 24c2 6 1 11-2 14l-4-9z" fill="#3a3f52" />
      <ellipse cx="22" cy="25" rx="11.500" ry="11" fill="#ffe3cf" />
      <path d="M10.500 21c4-1 7-4 8-7 2 3 8 6 15 6-1-7-6-11-11.500-11S11 14 10.500 21z" fill="#3a3f52" />
      <circle cx="17.500" cy="25.500" r="1.900" fill="#2b2f3d" />
      <circle cx="26.500" cy="25.500" r="1.900" fill="#2b2f3d" />
      <circle cx="18.100" cy="24.900" r="0.600" fill="#fff" />
      <circle cx="27.100" cy="24.900" r="0.600" fill="#fff" />
      <path d="M19 30.500c1.800 1.600 4.200 1.600 6 0" stroke="#c0604a" strokeWidth="1.200" fill="none" strokeLinecap="round" />
      <circle cx="14.500" cy="29" r="1.800" fill="#ffb3a6" opacity="0.7" />
      <circle cx="29.500" cy="29" r="1.800" fill="#ffb3a6" opacity="0.7" />
      <path d="M30 9l1.200 2.400 2.600.4-1.900 1.800.5 2.600L30 15l-2.400 1.200.5-2.600-1.900-1.800 2.600-.4z" fill="#6ee7c8" />
    </svg>
  );
}
