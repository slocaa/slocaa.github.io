// Enemy types
const ENEMY_TYPES = {
  basic:   { name:'Scout',   hp:40,  speed:60,  reward:10, color:'#e74c3c', radius:6 },
  fast:    { name:'Runner',  hp:25,  speed:110, reward:12, color:'#e67e22', radius:5 },
  tank:    { name:'Brute',   hp:200, speed:35,  reward:25, color:'#8e44ad', radius:9 },
  swarm:   { name:'Swarm',   hp:15,  speed:80,  reward:5,  color:'#f1c40f', radius:4 },
  shield:  { name:'Shield',  hp:120, speed:45,  reward:20, color:'#3498db', radius:8, shield:60 },
  regen:   { name:'Regen',   hp:100, speed:50,  reward:22, color:'#2ecc71', radius:7, regen:5 },
  boss:    { name:'Boss',    hp:800, speed:25,  reward:100,color:'#c0392b', radius:12 }
};

// Wave definitions — each wave is an array of {type, count, delay (between spawns)}
function generateWaves(difficulty) {
  const waves = [];
  for (let w = 0; w < 30; w++) {
    const wave = [];
    const power = (w + 1) * difficulty;

    if (w < 3) {
      wave.push({ type:'basic', count: 5 + w * 2, delay: 0.8 });
    } else if (w < 6) {
      wave.push({ type:'basic', count: 6, delay: 0.7 });
      wave.push({ type:'fast', count: 3 + w, delay: 0.5 });
    } else if (w < 10) {
      wave.push({ type:'fast', count: 5, delay: 0.5 });
      wave.push({ type:'tank', count: 1 + Math.floor(w/4), delay: 2.0 });
      wave.push({ type:'basic', count: 8, delay: 0.6 });
    } else if (w < 15) {
      wave.push({ type:'swarm', count: 12 + w, delay: 0.25 });
      wave.push({ type:'tank', count: 2, delay: 1.8 });
      wave.push({ type:'shield', count: Math.floor(w/5), delay: 1.5 });
    } else if (w < 20) {
      wave.push({ type:'shield', count: 3, delay: 1.5 });
      wave.push({ type:'regen', count: 2 + Math.floor(w/7), delay: 1.2 });
      wave.push({ type:'fast', count: 10, delay: 0.4 });
      wave.push({ type:'tank', count: 3, delay: 1.5 });
    } else if (w < 25) {
      wave.push({ type:'tank', count: 5, delay: 1.2 });
      wave.push({ type:'shield', count: 4, delay: 1.0 });
      wave.push({ type:'regen', count: 4, delay: 1.0 });
      wave.push({ type:'swarm', count: 20, delay: 0.2 });
    } else {
      wave.push({ type:'boss', count: 1 + Math.floor((w-25)/2), delay: 3.0 });
      wave.push({ type:'shield', count: 5, delay: 0.8 });
      wave.push({ type:'regen', count: 5, delay: 0.8 });
      wave.push({ type:'tank', count: 5, delay: 1.0 });
    }

    // Scale HP with wave number
    const hpMult = 1 + w * 0.12 * difficulty;
    waves.push({ groups: wave, hpMult });
  }
  return waves;
}

export { ENEMY_TYPES, generateWaves };
