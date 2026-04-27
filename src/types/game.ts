export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";

export type PlayerStatus = "active" | "folded" | "all-in" | "sit-out";

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";

export interface Card {
  rank: Rank;
  suit: Suit;
}

export interface Player {
  id: string;
  name: string;
  chips: number;
  totalBuyIn: number;
  seatIndex: number;
  status: PlayerStatus;
  hand: Card[];
}

export interface HandResult {
  playerId: string;
  handName: string;
  score: number[];
}

export interface BettingState {
  currentBet: number;
  minRaiseTo: number;
  actedPlayers: string[];
}

/** One pot in a side-pot scenario. eligibleIds = player IDs who can win this pot. */
export interface Pot {
  amount: number;
  eligibleIds: string[];
}

export interface GameState {
  handNumber: number;
  players: Player[];
  dealerIndex: number;
  smallBlind: number;
  bigBlind: number;
  /** The buy-in amount configured at game start (used for re-buys). */
  buyInAmount: number;
  turnIndex: number;
  street: Street;
  communityCards: Card[];
  pot: number;
  /** Per-street contribution (reset each street, used for owed-amount calculation) */
  contributions: Record<string, number>;
  /** Cumulative hand contribution across all streets (never reset mid-hand, used for side-pot calculation) */
  handContributions: Record<string, number>;
  /** Side-pot breakdown — always up to date, length ≥ 1 when there are chips in play */
  pots: Pot[];
  betting: BettingState;
  phase: "betting" | "awaiting-board" | "showdown";
  pendingBoardCards: 0 | 1 | 3;
  winners: string[];
  showdownOrder: string[];
  showdownRevealedIds: string[];
  showdownPendingCard: Card | null;
  showdownHandResults: Record<string, string>;
  chipAnimation?: {
    id: number;
    type: "to-pot" | "to-player";
    playerId: string;
    amount: number;
  };
  log: string[];
  voiceMuted: boolean;
  listeningSupported: boolean;
  lastError?: string;
}

export interface SetupPayload {
  playerNames: string[];
  buyIn: number;
  dealerIndex: number;
  smallBlind: number;
  bigBlind: number;
}
