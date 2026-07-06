interface BorealisArticExpeditionsPlayer extends Player {}

interface AnimalCardClient {
  id: number;
}

interface PoolSlotClient {
  slot: number;
  id: number;
}

interface AnimalCardDefinitionClient {
  species: number;
  vehicle: number;
  bonus_vp: number;
  left_move: number;
  right_move: number;
}

interface MaterialsClient {
  animal_cards: AnimalCardDefinitionClient[] | Record<number, AnimalCardDefinitionClient>;
  objectives: Record<number, { title: string; description: string; type: number }>;
  scoring_cards: Record<number, { title: string; description: string; explanation: string }>;
  player_boards: Record<number, {
    left_location: number[][];
    mid_location: number[][];
    right_location: number[][];
  }>;
  species_names: string[];
  vehicle_names: string[];
  location_names: string[];
  scientist_names: string[];
  objective_type_names: string[];
  track_space_vp: number[][];
}

interface ObjectiveClient {
  id: number;
  active: boolean;
  players: Record<number, "unmet" | "meets" | "claimed">;
}

interface TrackUiClient {
  vpPerSpace: number[][];
  vehiclesPerLocation: number[][][];
}

interface BoardState {
  scientists: Record<number, Record<number, number[]>>;
  flags: Record<number, Record<number, number>>;
  pool: PoolSlotClient[];
  deck_count: number;
  discard_count: number;
  boards: Record<number, AnimalCardClient[][]>;
  board_for_players: Record<number, number>;
  hands: Record<number, AnimalCardClient[] | number>;
  objectives: ObjectiveClient[];
  scoring_cards: number[];
  track?: TrackUiClient;
  vps: Record<number, number>;
  playersEndingGame: number[];
}

interface BorealisArticExpeditionsGamedatas extends Gamedatas<BorealisArticExpeditionsPlayer> {
    boardState: BoardState;
    materials: MaterialsClient;
  playerOrder?: number[];
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

interface PromptClaimArgs {
  pendingByPlayer: Record<number, Array<{ index: number; id: number; title: string }>>;
}
