import { create } from "zustand";
import { applyAllIn, applyCall, applyCheck, applyFold, applyRaiseTo, createInitialState, evaluateShowdown, startNextRound, addCommunityCards, applyRevealCard } from "../lib/pokerEngine";
import { parseVoiceCommand } from "../lib/voice";
import type { Card, GameState, SetupPayload } from "../types/game";

type Snapshot = GameState;

interface GameStore {
  game?: GameState;
  history: Snapshot[];
  setup: (payload: SetupPayload) => void;
  setPlayerHand: (playerId: string, cards: Card[]) => void;
  revealCard: (card: Card) => void;
  runVoiceText: (transcript: string) => void;
  actionCall: () => void;
  actionRaiseTo: (amount: number) => void;
  actionFold: () => void;
  actionCheck: () => void;
  actionAllIn: () => void;
  addBoardCards: (cards: Card[]) => void;
  rebuy: (playerId: string, amount: number) => void;
  adjustChips: (playerId: string, delta: number) => void;
  undo: () => void;
  nextRound: () => void;
}

const clone = (game: GameState): GameState => structuredClone(game);

const withSnapshot = (set: (fn: (prev: GameStore) => Partial<GameStore>) => void, reducer: (g: GameState) => void) => {
  set((prev) => {
    if (!prev.game) return {};
    const current = clone(prev.game);
    const before = clone(prev.game);
    try {
      reducer(current);
      return { game: current, history: [...prev.history, before] };
    } catch (error) {
      current.lastError = error instanceof Error ? error.message : "Invalid action.";
      return { game: current };
    }
  });
};

export const useGameStore = create<GameStore>((set, get) => ({
  history: [],
  setup: (payload) => set(() => ({ game: createInitialState(payload), history: [] })),
  setPlayerHand: (playerId, cards) =>
    withSnapshot(set, (g) => {
      const p = g.players.find((x) => x.id === playerId);
      if (!p) throw new Error("Player not found.");
      p.hand = cards.slice(0, 2);
      g.log.unshift(`${p.name}'s hand updated.`);
    }),
  runVoiceText: (transcript) => {
    const command = parseVoiceCommand(transcript);
    if (command.type === "unknown") {
      set((prev) => (prev.game ? { game: { ...prev.game, lastError: `Didn't understand: "${transcript}"` } } : {}));
      return;
    }
    if (command.type === "undo") return get().undo();
    if (command.type === "next-round") return get().nextRound();
    if (command.type === "mute" || command.type === "unmute") {
      set((prev) => (prev.game ? { game: { ...prev.game, voiceMuted: command.type === "mute" } } : {}));
      return;
    }
    if (command.type === "call") return get().actionCall();
    if (command.type === "check") return get().actionCheck();
    if (command.type === "fold") return get().actionFold();
    if (command.type === "all-in") return get().actionAllIn();
    if (command.type === "raise") return get().actionRaiseTo(command.amount);
    if (command.type === "cards") {
      const game = get().game;
      if (!game) return;
      // During showdown, reveal one card at a time
      if (game.phase === "showdown") {
        for (const card of command.cards) get().revealCard(card);
        return;
      }
      return get().addBoardCards(command.cards);
    }
    if (command.type === "hand") {
      const game = get().game;
      if (!game) return;
      if (game.phase === "showdown") {
        for (const card of command.cards) get().revealCard(card);
        return;
      }
      const player = game.players[game.turnIndex];
      return get().setPlayerHand(player.id, command.cards);
    }
  },
  revealCard: (card) => withSnapshot(set, (g) => applyRevealCard(g, card)),
  actionAllIn: () => withSnapshot(set, (g) => applyAllIn(g)),
  actionCall: () => withSnapshot(set, (g) => applyCall(g)),
  actionRaiseTo: (amount) =>
    withSnapshot(set, (g) => {
      if (g.phase !== "betting") throw new Error("Cannot raise now.");
      applyRaiseTo(g, amount);
    }),
  actionFold: () => withSnapshot(set, (g) => applyFold(g)),
  actionCheck: () =>
    withSnapshot(set, (g) => {
      if (g.phase !== "betting") throw new Error("Cannot check now.");
      applyCheck(g);
    }),
  addBoardCards: (cards) =>
    withSnapshot(set, (g) => {
      addCommunityCards(g, cards);
    }),
  rebuy: (playerId, amount) =>
    withSnapshot(set, (g) => {
      const p = g.players.find((x) => x.id === playerId);
      if (!p) throw new Error("Player not found.");
      p.chips += amount;
      p.totalBuyIn += amount;
      if (p.chips > 0 && p.status === "sit-out") p.status = "active";
      g.log.unshift(`${p.name} re-bought for Rs ${amount}.`);
    }),
  adjustChips: (playerId, delta) =>
    withSnapshot(set, (g) => {
      const p = g.players.find((x) => x.id === playerId);
      if (!p) throw new Error("Player not found.");
      p.chips = Math.max(0, p.chips + delta);
      if (p.chips === 0) p.status = "sit-out";
      g.log.unshift(`${p.name} chips adjusted by ${delta}.`);
    }),
  undo: () =>
    set((prev) => {
      if (!prev.history.length) return prev;
      const restored = prev.history[prev.history.length - 1];
      return { game: restored, history: prev.history.slice(0, -1) };
    }),
  nextRound: () =>
    withSnapshot(set, (g) => {
      if (g.street !== "showdown") {
        const results = evaluateShowdown(g);
        if (!results.length) throw new Error("Need hands + board before showdown.");
      }
      const next = startNextRound(g);
      Object.assign(g, next);
    }),
}));
