// Each map: name, theme colors, path (array of [x,y] waypoints on 960x640 grid), difficulty multiplier
export const MAPS = [
  {
    name: 'Green Valley',
    bg: '#3a5a2c',
    pathColor: '#c4a55a',
    groundColors: ['#4a7a3a', '#3d6b30', '#528a42'],
    water: null,
    difficulty: 1.0,
    startMoney: 200,
    lives: 20,
    path: [
      [-40, 320], [100, 320], [100, 140], [300, 140], [300, 500],
      [480, 500], [480, 200], [650, 200], [650, 440], [820, 440]
    ]
  },
  {
    name: 'Desert Canyon',
    bg: '#8a6e3e',
    pathColor: '#6b5030',
    groundColors: ['#c4a55a', '#b8963e', '#d4b56a'],
    water: null,
    difficulty: 1.3,
    startMoney: 225,
    lives: 18,
    path: [
      [-40, 100], [160, 100], [160, 540], [340, 540], [340, 100],
      [520, 100], [520, 540], [680, 540], [680, 300], [820, 300]
    ]
  },
  {
    name: 'Frozen Pass',
    bg: '#4a5a6e',
    pathColor: '#8a9aaa',
    groundColors: ['#c8d8e8', '#b0c4d8', '#dae8f0'],
    water: '#4a7a9a',
    difficulty: 1.6,
    startMoney: 250,
    lives: 15,
    path: [
      [-40, 500], [130, 500], [130, 200], [260, 200], [260, 440],
      [400, 440], [400, 120], [550, 120], [550, 380], [680, 380],
      [680, 200], [820, 200]
    ]
  }
];

// Get total path length
export function pathLength(path) {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i][0] - path[i-1][0];
    const dy = path[i][1] - path[i-1][1];
    len += Math.sqrt(dx*dx + dy*dy);
  }
  return len;
}

// Get position along path at distance t (0 to totalLength)
export function posOnPath(path, dist) {
  let remaining = dist;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i][0] - path[i-1][0];
    const dy = path[i][1] - path[i-1][1];
    const segLen = Math.sqrt(dx*dx + dy*dy);
    if (remaining <= segLen) {
      const t = remaining / segLen;
      return { x: path[i-1][0] + dx*t, y: path[i-1][1] + dy*t };
    }
    remaining -= segLen;
  }
  const last = path[path.length-1];
  return { x: last[0], y: last[1] };
}
