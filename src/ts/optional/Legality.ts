// OPTIONAL: Client-side observe legality mirroring BoardModel / actObserveAnimal.
// Happy path: active player selecting a hand card + location that has required scientists.
// Failure modes: missing card def / inactive player / insufficient scientists → treat as illegal (no throw).

export const POS_LEFT = 0;
export const POS_MID = 1;
export const POS_RIGHT = 2;
export const POS_CAMP_L = 3;
export const POS_CAMP_R = 4;

export interface AnimalDefLite {
  species: number;
  vehicle: number;
  bonus_vp: number;
  left_move: number;
  right_move: number;
}

export function colorCountAtLocation(
  scientists: Record<number, Record<number, number[]>> | undefined,
  playerId: number,
  location: number,
  color: number,
): number {
  const poses = scientists?.[playerId]?.[color] ?? [];
  return poses.filter((p) => p === location).length;
}

/** True if the animal card's left_move and right_move scientists are present at the location. */
export function canObserveAtLocation(
  def: AnimalDefLite | undefined,
  scientists: Record<number, Record<number, number[]>> | undefined,
  playerId: number,
  location: number,
): boolean {
  if (!def || location < 0 || location > 2) return false;
  // Each printed move requires one meeple of that color at the play location.
  const needLeft = def.left_move;
  const needRight = def.right_move;
  if (needLeft === needRight) {
    return colorCountAtLocation(scientists, playerId, location, needLeft) >= 2;
  }
  return (
    colorCountAtLocation(scientists, playerId, location, needLeft) >= 1
    && colorCountAtLocation(scientists, playerId, location, needRight) >= 1
  );
}

export function missingScientistColors(
  def: AnimalDefLite | undefined,
  scientists: Record<number, Record<number, number[]>> | undefined,
  playerId: number,
  location: number,
): number[] {
  if (!def) return [];
  const missing: number[] = [];
  const need: Record<number, number> = {};
  need[def.left_move] = (need[def.left_move] ?? 0) + 1;
  need[def.right_move] = (need[def.right_move] ?? 0) + 1;
  for (const [colorStr, count] of Object.entries(need)) {
    const color = Number(colorStr);
    const have = colorCountAtLocation(scientists, playerId, location, color);
    for (let i = 0; i < Math.max(0, count - have); i++) {
      missing.push(color);
    }
  }
  return missing;
}

export function canObserveAnywhere(
  def: AnimalDefLite | undefined,
  scientists: Record<number, Record<number, number[]>> | undefined,
  playerId: number,
): boolean {
  for (let loc = 0; loc < 3; loc++) {
    if (canObserveAtLocation(def, scientists, playerId, loc)) return true;
  }
  return false;
}

export function locationsForCard(
  def: AnimalDefLite | undefined,
  scientists: Record<number, Record<number, number[]>> | undefined,
  playerId: number,
): number[] {
  const out: number[] = [];
  for (let loc = 0; loc < 3; loc++) {
    if (canObserveAtLocation(def, scientists, playerId, loc)) out.push(loc);
  }
  return out;
}

export function stepFrom(from: number, dir: 'shift_left' | 'shift_right'): number {
  if (dir === 'shift_right') {
    if (from === POS_LEFT) return POS_MID;
    if (from === POS_MID) return POS_RIGHT;
    if (from === POS_RIGHT) return POS_CAMP_R;
    return from;
  }
  if (from === POS_RIGHT) return POS_MID;
  if (from === POS_MID) return POS_LEFT;
  if (from === POS_LEFT) return POS_CAMP_L;
  return from;
}

/** Preview destinations for left/right printed moves (does not mutate). */
export function previewObserveMoves(
  scientists: Record<number, Record<number, number[]>>,
  playerId: number,
  location: number,
  def: AnimalDefLite,
): { color: number; from: number; to: number }[] {
  const moves = [
    { color: def.left_move, dir: 'shift_left' as const },
    { color: def.right_move, dir: 'shift_right' as const },
  ];
  const result: { color: number; from: number; to: number }[] = [];
  const used: Record<string, boolean> = {};
  for (const m of moves) {
    const poses = scientists[playerId]?.[m.color] ?? [];
    let idx = -1;
    for (let i = 0; i < poses.length; i++) {
      const key = `${m.color}:${i}`;
      if (poses[i] === location && !used[key]) {
        idx = i;
        used[key] = true;
        break;
      }
    }
    if (idx < 0) continue;
    result.push({
      color: m.color,
      from: location,
      to: stepFrom(location, m.dir),
    });
  }
  return result;
}

export function flagWouldAdvance(
  def: AnimalDefLite,
  boardVehicles: number[][],
  currentFlag: number,
): boolean {
  if (currentFlag >= 7) return false;
  const next = currentFlag + 1;
  const vehiclesOnSpace = boardVehicles[next - 1] ?? [];
  return vehiclesOnSpace.includes(def.vehicle);
}
