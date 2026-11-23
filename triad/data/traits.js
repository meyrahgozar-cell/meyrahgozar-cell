// TRIAD trait library. Every entry becomes one stack in the property-based view.
// polarity: 1 = higher is better, -1 = higher is worse (cost dimensions).
export const TRAIT_CATEGORIES = [
  { key: 'character', name: 'Character', color: '#5ef2d6' },
  { key: 'work', name: 'Execution', color: '#7aa2ff' },
  { key: 'mind', name: 'Mind', color: '#a8e6ff' },
  { key: 'social', name: 'Social', color: '#ff7bc6' },
  { key: 'leadership', name: 'Leadership', color: '#ffb454' },
  { key: 'craft', name: 'Craft', color: '#c39bff' },
  { key: 'energy', name: 'Energy', color: '#8ef2a1' },
  { key: 'risk', name: 'Risk', color: '#ff6b6b' }
];

export const TRAITS = [
  // ---------------------------------------------------------------- character
  { key: 'kindness', name: 'Kindness', category: 'character', icon: 'heart', color: '#ff7bc6', polarity: 1, weight: 1.2, core: true, description: 'Warmth offered without being asked.' },
  { key: 'integrity', name: 'Integrity', category: 'character', icon: 'scale', color: '#8ef2a1', polarity: 1, weight: 1.5, core: true, description: 'Consistency between word and act.' },
  { key: 'bravery', name: 'Bravery', category: 'character', icon: 'flame', color: '#ffb454', polarity: 1, weight: 1.1, core: true, description: 'Acting despite the cost.' },
  { key: 'reliability', name: 'Reliability', category: 'character', icon: 'shield', color: '#5ef2d6', polarity: 1, weight: 1.4, core: true, description: 'Promises kept when nobody is watching.' },
  { key: 'resilience', name: 'Resilience', category: 'character', icon: 'mountain', color: '#79f0d0', polarity: 1, weight: 1.2, core: true, description: 'Returns to the work after the fall.' },
  { key: 'patience', name: 'Patience', category: 'character', icon: 'hourglass', color: '#b8c4ff', polarity: 1, weight: 1.0, core: true, description: 'Holds the long line without fraying.' },
  { key: 'humility', name: 'Humility', category: 'character', icon: 'drop', color: '#9ad7ff', polarity: 1, weight: 0.9, core: false, description: 'Can be wrong out loud.' },
  { key: 'generosity', name: 'Generosity', category: 'character', icon: 'gift', color: '#ffc2e2', polarity: 1, weight: 0.9, core: false, description: 'Gives credit and time away.' },
  { key: 'loyalty', name: 'Loyalty', category: 'character', icon: 'anchor', color: '#88d8c0', polarity: 1, weight: 0.8, core: false, description: 'Stays when staying is expensive.' },
  { key: 'honesty', name: 'Honesty', category: 'character', icon: 'eye', color: '#a8f0c6', polarity: 1, weight: 1.2, core: false, description: 'Default setting is the truth.' },
  { key: 'fairness', name: 'Fairness', category: 'character', icon: 'scales2', color: '#cfe8a8', polarity: 1, weight: 1.1, core: false, description: 'Same rule for every person.' },
  { key: 'selfDiscipline', name: 'Self-discipline', category: 'character', icon: 'lock', color: '#9fb4ff', polarity: 1, weight: 1.0, core: false, description: 'Does the boring thing daily.' },

  // -------------------------------------------------------------------- work
  { key: 'focus', name: 'Focus', category: 'work', icon: 'target', color: '#4cc9f0', polarity: 1, weight: 1.2, core: true, description: 'Depth of attention under pressure.' },
  { key: 'ambition', name: 'Ambition', category: 'work', icon: 'rocket', color: '#ff6b6b', polarity: 1, weight: 0.9, core: true, description: 'Pulls the horizon closer.' },
  { key: 'execution', name: 'Execution', category: 'work', icon: 'bolt', color: '#ffd166', polarity: 1, weight: 1.3, core: false, description: 'Turns intent into finished.' },
  { key: 'rigor', name: 'Rigor', category: 'work', icon: 'grid', color: '#7aa2ff', polarity: 1, weight: 1.2, core: false, description: 'Checks the second decimal.' },
  { key: 'speed', name: 'Speed', category: 'work', icon: 'gauge', color: '#ff9f68', polarity: 1, weight: 0.8, core: false, description: 'Cycle time from idea to shipped.' },
  { key: 'prioritisation', name: 'Prioritisation', category: 'work', icon: 'layers', color: '#61dafb', polarity: 1, weight: 1.1, core: false, description: 'Says no in the right direction.' },
  { key: 'followThrough', name: 'Follow-through', category: 'work', icon: 'check', color: '#8ef2a1', polarity: 1, weight: 1.2, core: false, description: 'The last mile is the habit.' },
  { key: 'planning', name: 'Planning', category: 'work', icon: 'map', color: '#a0c4ff', polarity: 1, weight: 0.9, core: false, description: 'Sequences the unsequenced.' },
  { key: 'detail', name: 'Attention to detail', category: 'work', icon: 'search', color: '#bde0fe', polarity: 1, weight: 1.0, core: false, description: 'Sees the seam before it splits.' },
  { key: 'ownership', name: 'Ownership', category: 'work', icon: 'flag', color: '#ffafcc', polarity: 1, weight: 1.3, core: false, description: 'Takes the blast radius personally.' },
  { key: 'consistency', name: 'Consistency', category: 'work', icon: 'pulse', color: '#90e0ef', polarity: 1, weight: 1.1, core: false, description: 'Same quality on a bad Tuesday.' },
  { key: 'leverage', name: 'Leverage', category: 'work', icon: 'cube', color: '#c8b6ff', polarity: 1, weight: 1.0, core: false, description: 'Finds the 10x-shaped move.' },

  // -------------------------------------------------------------------- mind
  { key: 'curiosity', name: 'Curiosity', category: 'mind', icon: 'compass', color: '#7aa2ff', polarity: 1, weight: 1.0, core: true, description: 'Questions more than answers.' },
  { key: 'taste', name: 'Taste', category: 'mind', icon: 'diamond', color: '#a8e6ff', polarity: 1, weight: 0.7, core: true, description: 'Recognises the difference that matters.' },
  { key: 'clarity', name: 'Clarity', category: 'mind', icon: 'lens', color: '#e0fbfc', polarity: 1, weight: 1.2, core: false, description: 'Compresses complexity without losing it.' },
  { key: 'creativity', name: 'Creativity', category: 'mind', icon: 'spark', color: '#c39bff', polarity: 1, weight: 1.0, core: false, description: 'Produces options nobody ordered.' },
  { key: 'systems', name: 'Systems thinking', category: 'mind', icon: 'network', color: '#48cae4', polarity: 1, weight: 1.1, core: false, description: 'Sees the loop, not the event.' },
  { key: 'memory', name: 'Recall', category: 'mind', icon: 'book', color: '#bdb2ff', polarity: 1, weight: 0.6, core: false, description: 'Retrieves context at the right moment.' },
  { key: 'learning', name: 'Learning rate', category: 'mind', icon: 'arrowUp', color: '#80ed99', polarity: 1, weight: 1.2, core: false, description: 'Steep slope, no plateau in sight.' },
  { key: 'abstraction', name: 'Abstraction', category: 'mind', icon: 'triangle', color: '#7bdff2', polarity: 1, weight: 0.9, core: false, description: 'Names the pattern before it repeats.' },
  { key: 'judgement', name: 'Judgement', category: 'mind', icon: 'balance', color: '#ffd6a5', polarity: 1, weight: 1.4, core: false, description: 'Right call with incomplete data.' },
  { key: 'numeracy', name: 'Numeracy', category: 'mind', icon: 'sigma', color: '#9bf6ff', polarity: 1, weight: 0.7, core: false, description: 'Comfortable inside the numbers.' },
  { key: 'writing', name: 'Writing', category: 'mind', icon: 'pen', color: '#ffc6ff', polarity: 1, weight: 0.8, core: false, description: 'Thinking made legible.' },
  { key: 'attention', name: 'Attention', category: 'mind', icon: 'radar', color: '#90dbf4', polarity: 1, weight: 1.0, core: false, description: 'Notices what changed in the frame.' },

  // ------------------------------------------------------------------ social
  { key: 'humor', name: 'Humor', category: 'social', icon: 'spark', color: '#c39bff', polarity: 1, weight: 0.8, core: true, description: 'Finds the angle nobody else sees.' },
  { key: 'empathy', name: 'Empathy', category: 'social', icon: 'wave', color: '#ff9a8b', polarity: 1, weight: 1.3, core: true, description: 'Reads the room before the room speaks.' },
  { key: 'candor', name: 'Candor', category: 'social', icon: 'bolt', color: '#ffe066', polarity: 1, weight: 1.1, core: true, description: 'Says the true thing, gently.' },
  { key: 'presence', name: 'Presence', category: 'social', icon: 'sun', color: '#ffd28a', polarity: 1, weight: 1.1, core: true, description: 'Changes the temperature of a room.' },
  { key: 'listening', name: 'Listening', category: 'social', icon: 'ear', color: '#ffc09f', polarity: 1, weight: 1.1, core: false, description: 'Hears the second sentence.' },
  { key: 'warmth', name: 'Warmth', category: 'social', icon: 'campfire', color: '#ffb3c6', polarity: 1, weight: 1.0, core: false, description: 'Makes strangers feel briefed.' },
  { key: 'diplomacy', name: 'Diplomacy', category: 'social', icon: 'dove', color: '#cdeac0', polarity: 1, weight: 0.9, core: false, description: 'Keeps the channel open.' },
  { key: 'network', name: 'Network', category: 'social', icon: 'globe', color: '#a2d2ff', polarity: 1, weight: 0.8, core: false, description: 'Knows who to ask.' },
  { key: 'conflict', name: 'Conflict handling', category: 'social', icon: 'shieldHalf', color: '#ffadad', polarity: 1, weight: 1.0, core: false, description: 'Walks into the hard conversation.' },
  { key: 'charisma', name: 'Charisma', category: 'social', icon: 'star', color: '#fdffb6', polarity: 1, weight: 0.8, core: false, description: 'Gravity, not volume.' },
  { key: 'trust', name: 'Trustworthiness', category: 'social', icon: 'key', color: '#b5e48c', polarity: 1, weight: 1.4, core: false, description: 'Safe to hand the fragile thing to.' },
  { key: 'mentorship', name: 'Mentorship', category: 'social', icon: 'seedling', color: '#99e2b4', polarity: 1, weight: 1.0, core: false, description: 'Grows other people on purpose.' },

  // -------------------------------------------------------------- leadership
  { key: 'vision', name: 'Vision', category: 'leadership', icon: 'telescope', color: '#ffb454', polarity: 1, weight: 1.3, core: false, description: 'Makes the future feel inevitable.' },
  { key: 'decisiveness', name: 'Decisiveness', category: 'leadership', icon: 'gavel', color: '#ff9f68', polarity: 1, weight: 1.2, core: false, description: 'Ends the meeting with a call.' },
  { key: 'delegation', name: 'Delegation', category: 'leadership', icon: 'split', color: '#ffd166', polarity: 1, weight: 1.0, core: false, description: 'Hands over the whole problem.' },
  { key: 'coaching', name: 'Coaching', category: 'leadership', icon: 'whistle', color: '#f4a261', polarity: 1, weight: 1.1, core: false, description: 'Asks the question that unblocks.' },
  { key: 'accountability', name: 'Accountability', category: 'leadership', icon: 'stamp', color: '#e76f51', polarity: 1, weight: 1.3, core: false, description: 'Absorbs blame, routes credit.' },
  { key: 'strategy', name: 'Strategy', category: 'leadership', icon: 'chess', color: '#f9c74f', polarity: 1, weight: 1.2, core: false, description: 'Wins the position, not the exchange.' },
  { key: 'inspiration', name: 'Inspiration', category: 'leadership', icon: 'beacon', color: '#ffd60a', polarity: 1, weight: 0.9, core: false, description: 'Makes the work feel worth it.' },
  { key: 'political', name: 'Organisational savvy', category: 'leadership', icon: 'maze', color: '#f8961e', polarity: 1, weight: 0.8, core: false, description: 'Moves through the org without friction.' },
  { key: 'hiring', name: 'Hiring bar', category: 'leadership', icon: 'users', color: '#f3722c', polarity: 1, weight: 0.9, core: false, description: 'Raises the average by adding.' },
  { key: 'crisis', name: 'Crisis command', category: 'leadership', icon: 'siren', color: '#ff4d6d', polarity: 1, weight: 1.1, core: false, description: 'Calm is the first deliverable.' },

  // ------------------------------------------------------------------- craft
  { key: 'codeQuality', name: 'Code quality', category: 'craft', icon: 'code', color: '#c39bff', polarity: 1, weight: 1.2, core: false, description: 'Leaves the file better than found.' },
  { key: 'designSense', name: 'Design sense', category: 'craft', icon: 'palette', color: '#cdb4db', polarity: 1, weight: 1.0, core: false, description: 'Feels the misalignment at 2px.' },
  { key: 'debugging', name: 'Debugging', category: 'craft', icon: 'bug', color: '#b298dc', polarity: 1, weight: 1.1, core: false, description: 'Bisects reality until it confesses.' },
  { key: 'architecture', name: 'Architecture', category: 'craft', icon: 'blueprint', color: '#a06cd5', polarity: 1, weight: 1.2, core: false, description: 'Designs for the change that has not happened.' },
  { key: 'shipping', name: 'Shipping', category: 'craft', icon: 'package', color: '#8e7dbe', polarity: 1, weight: 1.2, core: false, description: 'Deletes the last blocker personally.' },
  { key: 'testing', name: 'Testing instinct', category: 'craft', icon: 'flask', color: '#b8b8ff', polarity: 1, weight: 0.9, core: false, description: 'Knows which failure is expensive.' },
  { key: 'performance', name: 'Performance craft', category: 'craft', icon: 'timer', color: '#9381ff', polarity: 1, weight: 0.8, core: false, description: 'Measures before believing.' },
  { key: 'documentation', name: 'Documentation', category: 'craft', icon: 'file', color: '#c0c0ff', polarity: 1, weight: 0.7, core: false, description: 'Writes for the person at 3am.' },
  { key: 'tooling', name: 'Tooling', category: 'craft', icon: 'wrench', color: '#d4c1ec', polarity: 1, weight: 0.8, core: false, description: 'Removes friction from everyone.' },
  { key: 'aesthetics', name: 'Aesthetics', category: 'craft', icon: 'brush', color: '#f7aef8', polarity: 1, weight: 0.7, core: false, description: 'Makes correctness look inevitable.' },

  // ------------------------------------------------------------------ energy
  { key: 'stamina', name: 'Stamina', category: 'energy', icon: 'battery', color: '#8ef2a1', polarity: 1, weight: 1.0, core: false, description: 'Same engine on hour nine.' },
  { key: 'optimism', name: 'Optimism', category: 'energy', icon: 'sunrise', color: '#f9e076', polarity: 1, weight: 0.8, core: false, description: 'Prices the upside honestly.' },
  { key: 'calm', name: 'Calm', category: 'energy', icon: 'water', color: '#90e0ef', polarity: 1, weight: 1.1, core: false, description: 'Low variance under load.' },
  { key: 'playfulness', name: 'Playfulness', category: 'energy', icon: 'balloon', color: '#ffafcc', polarity: 1, weight: 0.7, core: false, description: 'Finds the game inside the task.' },
  { key: 'intensity', name: 'Intensity', category: 'energy', icon: 'lightning', color: '#ff9e00', polarity: 1, weight: 0.8, core: false, description: 'High output, high temperature.' },
  { key: 'adaptability', name: 'Adaptability', category: 'energy', icon: 'chameleon', color: '#80ffdb', polarity: 1, weight: 1.1, core: false, description: 'Re-plans without mourning.' },
  { key: 'independence', name: 'Independence', category: 'energy', icon: 'compass2', color: '#72efdd', polarity: 1, weight: 1.0, core: false, description: 'Needs no tailwind.' },
  { key: 'collaboration', name: 'Collaboration', category: 'energy', icon: 'hands', color: '#64dfba', polarity: 1, weight: 1.2, core: false, description: 'Multiplies through others.' },
  { key: 'momentum', name: 'Momentum', category: 'energy', icon: 'wind', color: '#56cfe1', polarity: 1, weight: 1.0, core: false, description: 'Leaves the room moving.' },
  { key: 'health', name: 'Sustainable pace', category: 'energy', icon: 'leaf', color: '#95d5b2', polarity: 1, weight: 0.9, core: false, description: 'Fast without burning the engine.' },

  // -------------------------------------------------------------------- risk
  { key: 'riskAppetite', name: 'Risk appetite', category: 'risk', icon: 'dice', color: '#ff6b6b', polarity: 1, weight: 0.8, core: false, description: 'Comfortable with unresolved outcomes.' },
  { key: 'compliance', name: 'Compliance', category: 'risk', icon: 'law', color: '#fca311', polarity: 1, weight: 0.9, core: false, description: 'Respects the boundary on purpose.' },
  { key: 'foresight', name: 'Foresight', category: 'risk', icon: 'crystal', color: '#e5b3fe', polarity: 1, weight: 1.2, core: false, description: 'Warns early enough to matter.' },
  { key: 'thoroughness', name: 'Thoroughness', category: 'risk', icon: 'comb', color: '#ffb4a2', polarity: 1, weight: 1.1, core: false, description: 'Checks the edge nobody tested.' },
  { key: 'politicsRisk', name: 'Bluntness', category: 'risk', icon: 'hammer', color: '#e5989b', polarity: 1, weight: 0.7, core: false, description: 'Costs something to say, says it anyway.' },
  { key: 'burnoutRisk', name: 'Burnout risk', category: 'risk', icon: 'warning', color: '#ff4d6d', polarity: -1, weight: 1.0, core: false, description: 'Higher is a warning, not a virtue.' },
  { key: 'volatility', name: 'Volatility', category: 'risk', icon: 'wave2', color: '#ff8fab', polarity: -1, weight: 0.8, core: false, description: 'Output swings without a schedule.' },
  { key: 'ego', name: 'Ego drag', category: 'risk', icon: 'mirror', color: '#e56b6f', polarity: -1, weight: 0.9, core: false, description: 'Cost others pay to work around it.' }
];

export const TRAIT_BY_KEY = Object.fromEntries(TRAITS.map(t => [t.key, t]));
export const CORE_TRAITS = TRAITS.filter(t => t.core);

export const TRAIT_ICON_NAMES = [...new Set(TRAITS.map(t => t.icon))];

export function traitCategoryColor(category) {
  const found = TRAIT_CATEGORIES.find(c => c.key === category);
  return found ? found.color : '#8ea1b8';
}

export function traitCategoryName(category) {
  const found = TRAIT_CATEGORIES.find(c => c.key === category);
  return found ? found.name : 'General';
}
