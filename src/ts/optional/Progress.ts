import { AnimalDefLite, POS_CAMP_L, POS_CAMP_R } from './Legality';

const SPECIES_COUNT = 5;
const VEHICLE_COUNT = 5;
export const SPECIES_SET_VP = [0, 0, 1, 3, 6, 10, 15, 21];

function animalDef(
  materials: MaterialsClient,
  cardId: number,
): AnimalDefLite | undefined {
  const raw = materials.animal_cards;
  if (Array.isArray(raw)) return raw[cardId] as AnimalDefLite | undefined;
  return (raw as Record<number, AnimalDefLite> | undefined)?.[cardId];
}

function cardIdOf(c: AnimalCardClient | number): number {
  return typeof c === 'number' ? c : Number(c.id);
}

function pilesFor(boards: BoardState['boards'], playerId: number): AnimalCardClient[][] {
  return boards[playerId] ?? [[], [], []];
}

function sciCountAt(
  sci: Record<number, number[]> | undefined,
  location: number,
): number {
  if (!sci) return 0;
  let n = 0;
  for (let c = 0; c < 3; c++) {
    n += (sci[c] ?? []).filter((p) => p === location).length;
  }
  return n;
}

function campCount(sci: Record<number, number[]> | undefined): number {
  return sciCountAt(sci, POS_CAMP_L) + sciCountAt(sci, POS_CAMP_R);
}

function speciesCounts(piles: AnimalCardClient[][], materials: MaterialsClient): number[] {
  const counts = Array(SPECIES_COUNT).fill(0);
  for (const pile of piles) {
    for (const c of pile) {
      const def = animalDef(materials, cardIdOf(c));
      if (def) counts[def.species]++;
    }
  }
  return counts;
}

function vehicleCounts(piles: AnimalCardClient[][], materials: MaterialsClient): number[] {
  const counts = Array(VEHICLE_COUNT).fill(0);
  for (const pile of piles) {
    for (const c of pile) {
      const def = animalDef(materials, cardIdOf(c));
      if (def) counts[def.vehicle]++;
    }
  }
  return counts;
}

/** { count, required } progress toward an objective. */
export function objectiveProgress(
  objectiveId: number,
  playerId: number,
  state: BoardState,
  materials: MaterialsClient,
): { count: number; required: number } {
  const piles = pilesFor(state.boards, playerId);
  const sci = state.scientists?.[playerId];
  const flags = state.flags?.[playerId] ?? [0, 0, 0];
  switch (objectiveId) {
    case 0: { // Specialists' Retreat: all 3 of one color in camps
      let best = 0;
      for (let c = 0; c < 3; c++) {
        const poses = sci?.[c] ?? [];
        const inCamp = poses.filter((p) => p === POS_CAMP_L || p === POS_CAMP_R).length;
        best = Math.max(best, inCamp);
      }
      return { count: best, required: 3 };
    }
    case 1: { // Comparing Notes: 3 in a single camp
      return { count: Math.max(sciCountAt(sci, POS_CAMP_L), sciCountAt(sci, POS_CAMP_R)), required: 3 };
    }
    case 2: { // Morning Shift: 5 returned last regroup, else current camp count
      const last = Number((state.last_returned_counts ?? {})[playerId] ?? 0);
      const current = campCount(sci);
      return { count: last >= 5 ? last : current, required: 5 };
    }
    case 3: { // Splitting Up: max 2 per location (3 locations ok)
      let ok = 0;
      for (let loc = 0; loc < 3; loc++) {
        if (sciCountAt(sci, loc) <= 2) ok++;
      }
      return { count: ok, required: 3 };
    }
    case 4: { // Balanced Ecosystem: 3 animals each location
      const min = Math.min(...[0, 1, 2].map((l) => piles[l]?.length ?? 0));
      return { count: min, required: 3 };
    }
    case 5: { // Richness of Nature: 6 in one location
      const max = Math.max(0, ...[0, 1, 2].map((l) => piles[l]?.length ?? 0));
      return { count: max, required: 6 };
    }
    case 6: { // Spotting List: 5 species
      const n = speciesCounts(piles, materials).filter((n) => n > 0).length;
      return { count: n, required: 5 };
    }
    case 7: { // Favorite Research: 6 of one species
      return { count: Math.max(0, ...speciesCounts(piles, materials)), required: 6 };
    }
    case 8: { // Organized Expedition: 4 identical vehicles
      return { count: Math.max(0, ...vehicleCounts(piles, materials)), required: 4 };
    }
    case 9: { // Climbing the Area: all flags >= 2
      const n = [0, 1, 2].filter((l) => Number(flags[l] ?? 0) >= 2).length;
      return { count: n, required: 3 };
    }
    case 10: { // Bold Explorers: a flag at 5
      return { count: Math.max(0, Number(flags[0] ?? 0), Number(flags[1] ?? 0), Number(flags[2] ?? 0)), required: 5 };
    }
    case 11: { // Promising Direction: 4 ahead of another
      const vals = [0, 1, 2].map((l) => Number(flags[l] ?? 0));
      let best = 0;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (i !== j) best = Math.max(best, vals[i] - vals[j]);
        }
      }
      return { count: best, required: 4 };
    }
    default:
      return { count: 0, required: 1 };
  }
}

export function scoreScoringCard(
  scoringId: number,
  playerId: number,
  state: BoardState,
  materials: MaterialsClient,
): number {
  const piles = pilesFor(state.boards, playerId);
  const sci = state.scientists?.[playerId];
  const flags = state.flags?.[playerId] ?? [0, 0, 0];
  switch (scoringId) {
    case 0: { // Common Destination
      const a = Number(flags[0] ?? 0);
      const b = Number(flags[1] ?? 0);
      const c = Number(flags[2] ?? 0);
      if (a === b && b === c) return 12;
      if (a === b || a === c || b === c) return 5;
      return 0;
    }
    case 1: { // Expansive Species
      const maxDepth = Math.min(piles[0]?.length ?? 0, piles[1]?.length ?? 0, piles[2]?.length ?? 0);
      let vp = 0;
      for (let d = 0; d < maxDepth; d++) {
        const ls = animalDef(materials, cardIdOf(piles[0][d]))?.species;
        const ms = animalDef(materials, cardIdOf(piles[1][d]))?.species;
        const rs = animalDef(materials, cardIdOf(piles[2][d]))?.species;
        if (ls != null && ls === ms && ms === rs) vp += 5;
      }
      return vp;
    }
    case 2: { // Farewell Party
      const counts = [sciCountAt(sci, 0), sciCountAt(sci, 1), sciCountAt(sci, 2)];
      return Math.max(...counts) * 2;
    }
    case 3: { // Interspecies
      let vp = 0;
      for (const pile of piles) {
        const sp = new Set<number>();
        for (const c of pile) {
          const def = animalDef(materials, cardIdOf(c));
          if (def) sp.add(def.species);
        }
        if (sp.size === 2) vp += 3;
      }
      return vp;
    }
    case 4: { // Mating Season
      let vp = 0;
      for (const pile of piles) {
        const seq = pile.map((c) => animalDef(materials, cardIdOf(c))?.species ?? -1);
        let i = 0;
        while (i < seq.length) {
          let j = i + 1;
          while (j < seq.length && seq[j] === seq[i]) j++;
          if (j - i === 2) vp += 2;
          i = j;
        }
      }
      return vp;
    }
    case 5: { // Outer Lands
      const counts = [piles[0]?.length ?? 0, piles[1]?.length ?? 0, piles[2]?.length ?? 0];
      let vp = 0;
      if (counts[0] > counts[1]) vp += 7;
      if (counts[2] > counts[1]) vp += 7;
      return vp;
    }
    case 6: { // Popular Vehicle
      return Math.max(0, ...vehicleCounts(piles, materials)) * 2;
    }
    case 7: { // Safe Return
      return campCount(sci) * 3;
    }
    case 8: { // Untrodden Path
      const vpTrack = materials.track_space_vp ?? [];
      const values = [0, 1, 2].map((loc) => (vpTrack[loc] ?? [])[Number(flags[loc] ?? 0)] ?? 0);
      return Math.min(...values) * 2;
    }
    case 9: { // Territorial Animals
      let vp = 0;
      for (const pile of piles) {
        let ok = true;
        let prev: number | null = null;
        for (const c of pile) {
          const sp = animalDef(materials, cardIdOf(c))?.species;
          if (sp == null) continue;
          if (prev !== null && prev === sp) {
            ok = false;
            break;
          }
          prev = sp;
        }
        if (ok) vp += 6;
      }
      return vp;
    }
    default:
      return 0;
  }
}

export function locationSetVp(pile: AnimalCardClient[], materials: MaterialsClient): number {
  const by = Array(SPECIES_COUNT).fill(0);
  for (const c of pile) {
    const def = animalDef(materials, cardIdOf(c));
    if (def) by[def.species]++;
  }
  let vp = 0;
  for (const cnt of by) {
    if (cnt > 0) vp += SPECIES_SET_VP[Math.min(cnt, SPECIES_SET_VP.length - 1)] ?? 0;
  }
  return vp;
}

export function flagTrackVp(playerId: number, state: BoardState, materials: MaterialsClient): number {
  const flags = state.flags?.[playerId] ?? [0, 0, 0];
  const vpTrack = materials.track_space_vp ?? [];
  let vp = 0;
  for (let loc = 0; loc < 3; loc++) {
    vp += (vpTrack[loc] ?? [])[Number(flags[loc] ?? 0)] ?? 0;
  }
  return vp;
}

export function animalBonusVp(playerId: number, state: BoardState, materials: MaterialsClient): number {
  let vp = 0;
  for (const pile of pilesFor(state.boards, playerId)) {
    for (const c of pile) {
      vp += animalDef(materials, cardIdOf(c))?.bonus_vp ?? 0;
    }
  }
  return vp;
}

export { campCount, sciCountAt, speciesCounts, vehicleCounts };
