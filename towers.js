// 5 tower types, each with 3 upgrade levels
// Stats: cost, damage, range, fireRate (shots/sec), special
export const TOWER_TYPES = [
  {
    id: 'archer',
    name: 'Archer',
    desc: 'Fast attacks, low damage',
    color: '#4CAF50',
    icon: '🏹',
    levels: [
      { cost: 50, damage: 8, range: 120, fireRate: 3.0, special: null },
      { cost: 40, damage: 14, range: 135, fireRate: 3.5, special: null, desc: '+Damage, +Speed' },
      { cost: 80, damage: 22, range: 150, fireRate: 4.5, special: 'multishot', desc: 'Multi-shot: hits 2 targets' }
    ]
  },
  {
    id: 'cannon',
    name: 'Cannon',
    desc: 'Slow, heavy damage',
    color: '#F44336',
    icon: '💣',
    levels: [
      { cost: 80, damage: 35, range: 100, fireRate: 0.8, special: null },
      { cost: 60, damage: 55, range: 110, fireRate: 1.0, special: null, desc: '+Damage, +Speed' },
      { cost: 100, damage: 80, range: 125, fireRate: 1.2, special: 'explosive', desc: 'Explosive: AoE on hit' }
    ]
  },
  {
    id: 'splash',
    name: 'Mortar',
    desc: 'Area damage, hits groups',
    color: '#FF9800',
    icon: '💥',
    levels: [
      { cost: 70, damage: 15, range: 130, fireRate: 1.0, special: 'splash', splashRadius: 50 },
      { cost: 55, damage: 25, range: 145, fireRate: 1.2, special: 'splash', splashRadius: 60, desc: '+Damage, +Area' },
      { cost: 90, damage: 40, range: 160, fireRate: 1.5, special: 'splash', splashRadius: 75, desc: 'Napalm: burn damage' }
    ]
  },
  {
    id: 'frost',
    name: 'Frost',
    desc: 'Slows enemies, buffs allies',
    color: '#2196F3',
    icon: '❄️',
    levels: [
      { cost: 60, damage: 5, range: 110, fireRate: 2.0, special: 'slow', slowAmount: 0.4, slowDuration: 1.5 },
      { cost: 50, damage: 8, range: 125, fireRate: 2.5, special: 'slow', slowAmount: 0.5, slowDuration: 2.0, desc: '+Slow, +Range' },
      { cost: 85, damage: 12, range: 140, fireRate: 3.0, special: 'freeze', slowAmount: 0.7, slowDuration: 2.5, desc: 'Freeze: stops enemies briefly' }
    ]
  },
  {
    id: 'venom',
    name: 'Venom',
    desc: 'Poison + chain attacks',
    color: '#9C27B0',
    icon: '☠️',
    levels: [
      { cost: 65, damage: 10, range: 115, fireRate: 1.5, special: 'poison', poisonDmg: 4, poisonDur: 3.0 },
      { cost: 55, damage: 16, range: 125, fireRate: 1.8, special: 'poison', poisonDmg: 7, poisonDur: 3.5, desc: '+Poison, +Speed' },
      { cost: 95, damage: 24, range: 140, fireRate: 2.0, special: 'chain', poisonDmg: 10, poisonDur: 4.0, chainCount: 3, desc: 'Chain: hits 3 enemies' }
    ]
  }
];

export function getTowerStats(typeId, level) {
  const type = TOWER_TYPES.find(t => t.id === typeId);
  if (!type) return null;
  return { ...type.levels[Math.min(level, type.levels.length - 1)], type };
}

export function getUpgradeCost(typeId, currentLevel) {
  const type = TOWER_TYPES.find(t => t.id === typeId);
  if (!type || currentLevel >= type.levels.length - 1) return null;
  return type.levels[currentLevel + 1].cost;
}
