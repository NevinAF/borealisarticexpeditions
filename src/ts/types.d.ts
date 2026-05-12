interface BorealisArticExpeditionsPlayer extends Player {}

interface AnimalCardClient {
  id: number;
  species: number;
  vehicle: number;
  bonus_vp?: number;
}

interface PoolSlotClient {
  slot: number;
  id: number;
  species: number;
  vehicle: number;
}

interface ObjectiveClient {
  id: number;
  active: boolean;
  players: Record<number, "unmet" | "meets" | "claimed">;
}

interface TrackUiClient {
  vpPerSpace: number[];
  vehiclesPerLocation: number[][][];
}

interface BorealisArticExpeditionsGamedatas extends Gamedatas<BorealisArticExpeditionsPlayer> {
  scientists: Record<number, Record<number, number[]>>;
  flags: Record<number, Record<number, number>>;
  pool: PoolSlotClient[];
  deck_count: number;
  discard_count: number;
  boards: Record<number, AnimalCardClient[][]>;
  hands: Record<number, AnimalCardClient[] | number>;
  objectives: ObjectiveClient[];
  scoring_cards: number[];
  track?: TrackUiClient;
}

interface GameplayArgs {
  locationCount: number;
}

interface ReplenishArgs {
  pool: PoolSlotClient[];
  canMulligan: boolean;
}

interface AssignCampArgs {
  locationCount: number;
}
