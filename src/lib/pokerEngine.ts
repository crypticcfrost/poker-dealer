import type { Card, GameState, HandResult, Player, PlayerStatus, Pot, Rank, SetupPayload, Street } from "../types/game";

const RANK_ORDER: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const rankValue = (rank: Rank) => RANK_ORDER.indexOf(rank) + 2;

// Only advance to players who can still BET (status === "active").
// All-in and folded players are skipped.
const nextActiveIndex = (players: Player[], from: number) => {
  let i = from;
  for (let attempts = 0; attempts < players.length; attempts += 1) {
    i = (i + 1) % players.length;
    if (players[i].status === "active") return i;
  }
  return from; // no active player found – caller must handle via advanceIfComplete
};

/** Players still alive in the hand (active OR all-in — not folded/sit-out). */
const inHandPlayers = (state: GameState) =>
  state.players.filter((p) => p.status === "active" || p.status === "all-in");

const handContribution = (state: GameState, playerId: string) => state.contributions[playerId] ?? 0;
const chipAnimId = () => Date.now() + Math.floor(Math.random() * 1000);

// ─── Side-pot computation ─────────────────────────────────────────────────────
/**
 * Recompute the Pot[] array from cumulative hand contributions.
 * Works correctly with multiple all-in levels and folded players.
 *
 * Algorithm: process players in ascending contribution order; at each level
 * create a pot of (level × remaining count) and reduce everyone's contribution.
 * Folded players contribute to a pot but are NOT eligible to win it.
 */
export const computeSidePots = (state: GameState): Pot[] => {
  type Entry = { id: string; amount: number; folded: boolean };
  const entries: Entry[] = state.players
    .map((p) => ({
      id: p.id,
      amount: state.handContributions[p.id] ?? 0,
      folded: p.status === "folded",
    }))
    .filter((e) => e.amount > 0);

  if (entries.length === 0) return [];

  const pots: Pot[] = [];
  let remaining = [...entries].sort((a, b) => a.amount - b.amount);

  while (remaining.length > 0) {
    const level = remaining[0].amount;
    const potAmount = level * remaining.length;
    const eligibleIds = remaining.filter((e) => !e.folded).map((e) => e.id);

    if (potAmount > 0) pots.push({ amount: potAmount, eligibleIds });

    remaining = remaining
      .map((e) => ({ ...e, amount: e.amount - level }))
      .filter((e) => e.amount > 0);
  }

  return pots;
};

// ─── Street helpers ───────────────────────────────────────────────────────────

/** True when all "active" (can-bet) players have matched the current bet and acted. */
const everyoneSettled = (state: GameState) => {
  const canBet = state.players.filter((p) => p.status === "active");
  return canBet.every(
    (p) => state.betting.actedPlayers.includes(p.id) && getPlayerOwed(state, p.id) === 0,
  );
};

/**
 * If betting is complete (or no one can bet), advance to the next phase.
 * Handles auto-skip when all non-folded players are all-in.
 */
const advanceIfComplete = (state: GameState) => {
  if (!everyoneSettled(state)) return;

  // Recompute pots at the end of each betting round
  state.pots = computeSidePots(state);

  if (state.street === "preflop") {
    state.phase = "awaiting-board";
    state.pendingBoardCards = 3;
    state.log.unshift("Preflop complete. Waiting for flop cards (3).");
  } else if (state.street === "flop") {
    state.phase = "awaiting-board";
    state.pendingBoardCards = 1;
    state.log.unshift("Flop betting complete. Waiting for turn card.");
  } else if (state.street === "turn") {
    state.phase = "awaiting-board";
    state.pendingBoardCards = 1;
    state.log.unshift("Turn betting complete. Waiting for river card.");
  } else if (state.street === "river") {
    state.street = "showdown";
    state.phase = "showdown";
    const eligible: string[] = [];
    let idx = state.dealerIndex;
    for (let i = 0; i < state.players.length; i++) {
      idx = (idx + 1) % state.players.length;
      const p = state.players[idx];
      if (p.status !== "folded" && p.status !== "sit-out") eligible.push(p.id);
    }
    state.showdownOrder = eligible;
    state.showdownRevealedIds = [];
    state.showdownPendingCard = null;
    state.showdownHandResults = {};
    state.log.unshift(
      `Showdown! Reveal hands: ${eligible.map((id) => state.players.find((p) => p.id === id)?.name).join(" → ")}`,
    );
  }
};

const markActed = (state: GameState, playerId: string) => {
  if (!state.betting.actedPlayers.includes(playerId)) state.betting.actedPlayers.push(playerId);
};

/**
 * Start a new betting street.  Auto-advances immediately if nobody can act
 * (all non-folded players are all-in).
 */
const startBettingStreet = (state: GameState, street: Street) => {
  state.street = street;
  state.phase = "betting";
  state.pendingBoardCards = 0;
  state.betting = { currentBet: 0, minRaiseTo: state.bigBlind, actedPlayers: [] };
  state.players.forEach((p) => { state.contributions[p.id] = 0; });

  const sbIdx = nextActiveIndex(state.players, state.dealerIndex);
  state.turnIndex = sbIdx;

  // If no active (non-all-in) player exists, skip betting straight away
  advanceIfComplete(state);
};

// ─── Initial state ────────────────────────────────────────────────────────────

export const createInitialState = (payload: SetupPayload): GameState => {
  const players: Player[] = payload.playerNames.map((name, index) => ({
    id: `${index + 1}-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    chips: payload.buyIn,
    totalBuyIn: payload.buyIn,
    seatIndex: index,
    status: "active" as PlayerStatus,
    hand: [],
  }));

  const smallBlindIndex = nextActiveIndex(players, payload.dealerIndex);
  const bigBlindIndex = nextActiveIndex(players, smallBlindIndex);
  const turnIndex = nextActiveIndex(players, bigBlindIndex);
  const contributions: Record<string, number> = {};
  const handContributions: Record<string, number> = {};
  players.forEach((p) => { contributions[p.id] = 0; handContributions[p.id] = 0; });

  const postBlind = (playerIndex: number, amount: number) => {
    const p = players[playerIndex];
    const paid = Math.min(amount, p.chips);
    p.chips -= paid;
    contributions[p.id] += paid;
    handContributions[p.id] += paid;
    if (p.chips === 0) p.status = "all-in";
  };
  postBlind(smallBlindIndex, payload.smallBlind);
  postBlind(bigBlindIndex, payload.bigBlind);

  const initialPot = payload.smallBlind + payload.bigBlind;
  // Build a minimal proxy to compute initial pots without a full GameState yet
  const potProxy = { players, handContributions } as Pick<GameState, "players" | "handContributions">;
  const pots = computeSidePots(potProxy as GameState);

  return {
    handNumber: 1,
    players,
    dealerIndex: payload.dealerIndex,
    smallBlind: payload.smallBlind,
    bigBlind: payload.bigBlind,
    buyInAmount: payload.buyIn,
    turnIndex,
    street: "preflop",
    communityCards: [],
    pot: initialPot,
    contributions,
    handContributions,
    pots: pots.length ? pots : [{ amount: initialPot, eligibleIds: players.map((p) => p.id) }],
    betting: {
      currentBet: payload.bigBlind,
      minRaiseTo: payload.bigBlind + 1,
      actedPlayers: [],
    },
    phase: "betting",
    pendingBoardCards: 0,
    winners: [],
    showdownOrder: [],
    showdownRevealedIds: [],
    showdownPendingCard: null,
    showdownHandResults: {},
    log: [`Hand #1 started. Blinds posted ${payload.smallBlind}/${payload.bigBlind}.`],
    voiceMuted: false,
    listeningSupported: "webkitSpeechRecognition" in window || "SpeechRecognition" in window,
  };
};

const getSeatLabel = (state: GameState, idx: number) => {
  if (idx === state.dealerIndex) return "D";
  if (idx === nextActiveIndex(state.players, state.dealerIndex)) return "SB";
  if (idx === nextActiveIndex(state.players, nextActiveIndex(state.players, state.dealerIndex))) return "BB";
  return "";
};

export const getPlayerOwed = (state: GameState, playerId: string) =>
  Math.max(0, state.betting.currentBet - handContribution(state, playerId));

// ─── Betting actions ──────────────────────────────────────────────────────────

export const applyFold = (state: GameState) => {
  if (state.phase !== "betting") throw new Error("Waiting for community cards.");
  const current = state.players[state.turnIndex];
  current.status = "folded";
  markActed(state, current.id);
  state.log.unshift(`${current.name} folds.`);

  const remaining = inHandPlayers(state);
  if (remaining.length === 1) {
    const winner = remaining[0];
    winner.chips += state.pot;
    state.chipAnimation = { id: chipAnimId(), type: "to-player", playerId: winner.id, amount: state.pot };
    state.winners = [winner.id];
    state.street = "showdown";
    state.log.unshift(`${winner.name} wins ${state.pot} (all others folded).`);
    return;
  }

  state.turnIndex = nextActiveIndex(state.players, state.turnIndex);
  advanceIfComplete(state);
};

export const applyCall = (state: GameState) => {
  if (state.phase !== "betting") throw new Error("Waiting for community cards.");
  const current = state.players[state.turnIndex];
  const owed = getPlayerOwed(state, current.id);
  if (owed === 0) throw new Error(`${current.name} has nothing to call; use check.`);

  const paid = Math.min(owed, current.chips);
  current.chips -= paid;
  state.pot += paid;
  state.contributions[current.id] += paid;
  state.handContributions[current.id] = (state.handContributions[current.id] ?? 0) + paid;
  state.chipAnimation = { id: chipAnimId(), type: "to-pot", playerId: current.id, amount: paid };

  if (current.chips === 0) {
    current.status = "all-in";
    state.log.unshift(`${current.name} calls ${paid} — ALL IN.`);
  } else {
    state.log.unshift(`${current.name} calls ${paid}.`);
  }

  markActed(state, current.id);
  state.pots = computeSidePots(state);
  state.turnIndex = nextActiveIndex(state.players, state.turnIndex);
  advanceIfComplete(state);
};

export const applyCheck = (state: GameState) => {
  if (state.phase !== "betting") throw new Error("Waiting for community cards.");
  const current = state.players[state.turnIndex];
  if (getPlayerOwed(state, current.id) > 0) throw new Error(`${current.name} cannot check; call required.`);
  markActed(state, current.id);
  state.log.unshift(`${current.name} checks.`);
  state.turnIndex = nextActiveIndex(state.players, state.turnIndex);
  advanceIfComplete(state);
};

export const applyRaiseTo = (state: GameState, raiseTo: number) => {
  if (state.phase !== "betting") throw new Error("Waiting for community cards.");
  const current = state.players[state.turnIndex];
  if (raiseTo <= state.betting.currentBet) {
    throw new Error(`Raise must be above current bet of ${state.betting.currentBet}.`);
  }
  const already = handContribution(state, current.id);
  const needed = raiseTo - already;
  if (needed <= 0) throw new Error("Raise amount must be above your current contribution.");
  if (needed > current.chips) throw new Error("Insufficient chips — use All In instead.");

  current.chips -= needed;
  state.pot += needed;
  state.contributions[current.id] += needed;
  state.handContributions[current.id] = (state.handContributions[current.id] ?? 0) + needed;
  state.chipAnimation = { id: chipAnimId(), type: "to-pot", playerId: current.id, amount: needed };
  state.betting.currentBet = raiseTo;
  state.betting.minRaiseTo = raiseTo + 1;
  state.betting.actedPlayers = [current.id];

  // Auto all-in: if the player ran out of chips during the raise, mark them
  if (current.chips === 0) {
    current.status = "all-in";
    state.log.unshift(`${current.name} raises to ${raiseTo} — ALL IN.`);
  } else {
    state.log.unshift(`${current.name} raises to ${raiseTo}.`);
  }

  state.pots = computeSidePots(state);
  state.turnIndex = nextActiveIndex(state.players, state.turnIndex);
};

/**
 * Player goes all-in: commits all remaining chips.
 * If this raises the current bet, opens the action for others.
 * Side pots are recomputed immediately.
 */
export const applyAllIn = (state: GameState) => {
  if (state.phase !== "betting") throw new Error("Waiting for community cards.");
  const current = state.players[state.turnIndex];
  if (current.status !== "active") throw new Error(`${current.name} cannot go all-in right now.`);
  if (current.chips === 0) throw new Error(`${current.name} has no chips left.`);

  const chips = current.chips;
  const alreadyIn = handContribution(state, current.id);
  const totalCommit = alreadyIn + chips;

  current.chips = 0;
  current.status = "all-in";
  state.pot += chips;
  state.contributions[current.id] += chips;
  state.handContributions[current.id] = (state.handContributions[current.id] ?? 0) + chips;
  state.chipAnimation = { id: chipAnimId(), type: "to-pot", playerId: current.id, amount: chips };

  if (totalCommit > state.betting.currentBet) {
    // This is effectively a raise — re-open action for everyone else
    state.betting.currentBet = totalCommit;
    state.betting.minRaiseTo = Math.max(state.betting.minRaiseTo, totalCommit + state.bigBlind);
    state.betting.actedPlayers = [current.id];
    state.log.unshift(`${current.name} is ALL IN for ${totalCommit} (raise).`);
  } else {
    markActed(state, current.id);
    state.log.unshift(`${current.name} is ALL IN for ${chips}.`);
  }

  state.pots = computeSidePots(state);
  state.turnIndex = nextActiveIndex(state.players, state.turnIndex);
  advanceIfComplete(state);
};

// ─── Community cards ──────────────────────────────────────────────────────────

export const addCommunityCards = (state: GameState, cards: Card[]) => {
  if (state.phase !== "awaiting-board") throw new Error("Board cards are locked until betting round completes.");
  if (cards.length === 0) throw new Error("No cards provided.");
  if (cards.length > state.pendingBoardCards) {
    throw new Error(`Only ${state.pendingBoardCards} more board card(s) needed right now.`);
  }

  state.communityCards = [...state.communityCards, ...cards].slice(0, 5);
  state.pendingBoardCards -= cards.length;

  const cardStr = cards.map((c) => `${c.rank}${c.suit[0].toUpperCase()}`).join(" ");
  if (state.pendingBoardCards > 0) {
    state.log.unshift(`Card: ${cardStr} — ${state.pendingBoardCards} more to go.`);
    return;
  }

  state.log.unshift(`Board: ${state.communityCards.map((c) => `${c.rank}${c.suit[0].toUpperCase()}`).join(" ")}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nowStreet: Street = (state as any).street as Street;
  if (nowStreet === "preflop") {
    startBettingStreet(state, "flop");
    const nowPhase = (state as GameState).phase;
    if (nowPhase === "betting") state.log.unshift("Flop dealt. Betting from small blind.");
  } else if (nowStreet === "flop") {
    startBettingStreet(state, "turn");
    const nowPhase = (state as GameState).phase;
    if (nowPhase === "betting") state.log.unshift("Turn dealt. Betting from small blind.");
  } else if (nowStreet === "turn") {
    startBettingStreet(state, "river");
    const nowPhase = (state as GameState).phase;
    if (nowPhase === "betting") state.log.unshift("River dealt. Final betting round.");
  }
};

// ─── Showdown ─────────────────────────────────────────────────────────────────

export const applyRevealCard = (state: GameState, card: Card) => {
  if (state.phase !== "showdown") throw new Error("Not in showdown phase yet.");
  const nextId = state.showdownOrder.find((id) => !state.showdownRevealedIds.includes(id));
  if (!nextId) throw new Error("All hands already revealed.");
  const player = state.players.find((p) => p.id === nextId);
  if (!player) throw new Error("Player not found.");

  if (!state.showdownPendingCard) {
    state.showdownPendingCard = card;
    player.hand = [card];
    state.log.unshift(`${player.name}: ${card.rank}${card.suit[0].toUpperCase()} — waiting for second card`);
  } else {
    const hand: Card[] = [state.showdownPendingCard, card];
    player.hand = hand;
    state.showdownPendingCard = null;
    const handStr = evaluatePlayerHand(hand, state.communityCards);
    state.showdownHandResults[nextId] = handStr;
    state.showdownRevealedIds.push(nextId);
    state.log.unshift(`${player.name}: ${hand.map((c) => `${c.rank}${c.suit[0].toUpperCase()}`).join(" ")} — ${handStr}`);
    if (state.showdownRevealedIds.length === state.showdownOrder.length) {
      evaluateShowdown(state);
    }
  }
};

// ─── Hand evaluation ──────────────────────────────────────────────────────────

const scoreFiveCards = (cards: Card[]): number[] => {
  const values = cards.map((c) => rankValue(c.rank)).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  const sortedByCount = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const unique = [...new Set(values)].sort((a, b) => b - a);
  const straightHigh =
    unique.length === 5 &&
    (unique[0] - unique[4] === 4 || JSON.stringify(unique) === JSON.stringify([14, 5, 4, 3, 2]))
      ? unique[0] === 14 && unique[1] === 5
        ? 5
        : unique[0]
      : 0;

  if (isFlush && straightHigh) return [8, straightHigh];
  if (sortedByCount[0][1] === 4) return [7, sortedByCount[0][0], sortedByCount[1][0]];
  if (sortedByCount[0][1] === 3 && sortedByCount[1][1] === 2)
    return [6, sortedByCount[0][0], sortedByCount[1][0]];
  if (isFlush) return [5, ...values];
  if (straightHigh) return [4, straightHigh];
  if (sortedByCount[0][1] === 3)
    return [3, sortedByCount[0][0], ...sortedByCount.filter(([, c]) => c === 1).map(([v]) => v).sort((a, b) => b - a)];
  if (sortedByCount[0][1] === 2 && sortedByCount[1][1] === 2) {
    const pairs = sortedByCount.filter(([, c]) => c === 2).map(([v]) => v).sort((a, b) => b - a);
    return [2, ...pairs, sortedByCount.find(([, c]) => c === 1)?.[0] ?? 0];
  }
  if (sortedByCount[0][1] === 2)
    return [1, sortedByCount[0][0], ...sortedByCount.filter(([, c]) => c === 1).map(([v]) => v).sort((a, b) => b - a)];
  return [0, ...values];
};

const compareScore = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0, bv = b[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
};

const handName = (rank: number) =>
  ["High Card", "Pair", "Two Pair", "Trips", "Straight", "Flush", "Full House", "Quads", "Straight Flush"][rank] ?? "Unknown";

const choose5 = <T,>(arr: T[]): T[][] => {
  const out: T[][] = [];
  for (let a = 0; a < arr.length - 4; a++)
    for (let b = a + 1; b < arr.length - 3; b++)
      for (let c = b + 1; c < arr.length - 2; c++)
        for (let d = c + 1; d < arr.length - 1; d++)
          for (let e = d + 1; e < arr.length; e++) out.push([arr[a], arr[b], arr[c], arr[d], arr[e]]);
  return out;
};

export const evaluatePlayerHand = (playerHand: Card[], communityCards: Card[]): string => {
  const pool = [...playerHand, ...communityCards];
  if (pool.length < 5) return "";
  const best = choose5(pool).reduce((acc, combo) => {
    const score = scoreFiveCards(combo);
    return !acc || compareScore(score, acc) > 0 ? score : acc;
  }, undefined as number[] | undefined) ?? [0];
  return handName(best[0]);
};

/**
 * Distribute each pot (main + side pots) to the appropriate winner(s).
 * Handles split pots and all-in player eligibility correctly.
 */
export const evaluateShowdown = (state: GameState): HandResult[] => {
  const eligible = state.players.filter((p) => p.status !== "folded" && p.hand.length === 2);
  const results = eligible.map((player) => {
    const pool = [...player.hand, ...state.communityCards];
    const best =
      choose5(pool).reduce((acc, combo) => {
        const score = scoreFiveCards(combo);
        return !acc || compareScore(score, acc) > 0 ? score : acc;
      }, undefined as number[] | undefined) ?? [0];
    state.showdownHandResults[player.id] = handName(best[0]);
    return { playerId: player.id, handName: handName(best[0]), score: best };
  });

  if (!results.length) return [];

  // Use computed side pots; fall back to single main pot if somehow empty
  const pots: Pot[] =
    state.pots?.length > 0
      ? state.pots
      : [{ amount: state.pot, eligibleIds: results.map((r) => r.playerId) }];

  const allWinnerIds = new Set<string>();
  let totalDistributed = 0;

  for (const pot of pots) {
    const contenders = results.filter((r) => pot.eligibleIds.includes(r.playerId));
    if (contenders.length === 0) {
      // Eligible players all folded — give to last remaining in-hand player
      const fallback = inHandPlayers(state)[0];
      if (fallback) { fallback.chips += pot.amount; allWinnerIds.add(fallback.id); }
      totalDistributed += pot.amount;
      continue;
    }

    const top = contenders.reduce((acc, r) => (compareScore(r.score, acc.score) > 0 ? r : acc));
    const winners = contenders.filter((r) => compareScore(r.score, top.score) === 0);
    const share = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount - share * winners.length;

    winners.forEach((w, i) => {
      const p = state.players.find((pl) => pl.id === w.playerId)!;
      p.chips += share + (i === 0 ? remainder : 0); // give remainder to first winner
      allWinnerIds.add(w.playerId);
    });

    totalDistributed += pot.amount;
    if (winners[0]) {
      state.chipAnimation = { id: chipAnimId(), type: "to-player", playerId: winners[0].playerId, amount: share };
    }
  }

  state.winners = [...allWinnerIds];
  state.street = "showdown";
  state.phase = "showdown";

  const winnerNames = [...allWinnerIds].map((id) => state.players.find((p) => p.id === id)?.name ?? id);
  state.log.unshift(`Showdown: ${winnerNames.join(" & ")} won ${totalDistributed} chips.`);
  return results;
};

/**
 * Manual showdown resolution:
 * - winnersByPot[i] is one or more player IDs selected as winners for pots[i]
 * - each selected ID must be eligible for that pot
 * - supports split pots by selecting multiple winners for the same pot
 */
export const settleShowdownByPotWinners = (state: GameState, winnersByPot: string[][]) => {
  if (state.phase !== "showdown") throw new Error("Not in showdown phase.");
  const pots: Pot[] =
    state.pots?.length > 0
      ? state.pots
      : [{ amount: state.pot, eligibleIds: inHandPlayers(state).map((p) => p.id) }];

  if (winnersByPot.length !== pots.length) {
    throw new Error(`Need winner selection for all ${pots.length} pot(s).`);
  }

  const allWinnerIds = new Set<string>();
  let totalDistributed = 0;
  const logLines: string[] = [];

  pots.forEach((pot, i) => {
    const selected = [...new Set((winnersByPot[i] ?? []).filter(Boolean))];
    if (selected.length === 0) throw new Error(`Select at least one winner for pot #${i + 1}.`);
    if (selected.some((id) => !pot.eligibleIds.includes(id))) {
      throw new Error(`Invalid winner selected for pot #${i + 1}.`);
    }

    const share = Math.floor(pot.amount / selected.length);
    const remainder = pot.amount - share * selected.length;

    selected.forEach((winnerId, idx) => {
      const p = state.players.find((pl) => pl.id === winnerId);
      if (!p) throw new Error("Player not found.");
      p.chips += share + (idx === 0 ? remainder : 0);
      allWinnerIds.add(winnerId);
    });

    totalDistributed += pot.amount;
    const winnerNames = selected.map((id) => state.players.find((p) => p.id === id)?.name ?? id);
    logLines.push(
      `${i === 0 ? "Main pot" : `Side pot ${i}`}: ${winnerNames.join(" / ")} won ${pot.amount}.`,
    );
  });

  const firstWinnerId = [...allWinnerIds][0];
  if (firstWinnerId) {
    state.chipAnimation = {
      id: chipAnimId(),
      type: "to-player",
      playerId: firstWinnerId,
      amount: totalDistributed,
    };
  }
  state.winners = [...allWinnerIds];
  state.street = "showdown";
  state.phase = "showdown";
  state.showdownOrder = [];
  state.showdownRevealedIds = [];
  state.showdownPendingCard = null;
  state.showdownHandResults = {};

  logLines.reverse().forEach((line) => state.log.unshift(line));
  const finalNames = [...allWinnerIds].map((id) => state.players.find((p) => p.id === id)?.name ?? id);
  state.log.unshift(`Showdown settled manually: ${finalNames.join(" & ")} won ${totalDistributed} chips.`);
};

// ─── Next round ───────────────────────────────────────────────────────────────

export const startNextRound = (state: GameState): GameState => {
  // Need at least 2 players with chips to play a new hand
  const eligiblePlayers = state.players.filter((p) => p.chips > 0);
  if (eligiblePlayers.length < 2) {
    throw new Error(
      `Only ${eligiblePlayers.length} player${eligiblePlayers.length === 1 ? "" : "s"} ${eligiblePlayers.length === 1 ? "has" : "have"} chips. ` +
      "Open Economy → Re-buy to add chips before starting the next hand.",
    );
  }

  const nextDealer = nextActiveIndex(state.players, state.dealerIndex);
  const names = state.players.map((p) => p.name);
  const initialized = createInitialState({
    playerNames: names,
    buyIn: 0,
    dealerIndex: nextDealer,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
  });
  initialized.handNumber = state.handNumber + 1;
  initialized.players = initialized.players.map((p, idx) => {
    const prev = state.players[idx];
    return {
      ...p,
      chips: prev.chips,
      totalBuyIn: prev.totalBuyIn,
      status: prev.chips === 0 ? "sit-out" : "active",
      hand: [],
    };
  });
  const zeroContribs = Object.fromEntries(initialized.players.map((p) => [p.id, 0]));
  initialized.contributions = { ...zeroContribs };
  initialized.handContributions = { ...zeroContribs };
  initialized.pot = 0;
  initialized.pots = [];
  initialized.buyInAmount = state.buyInAmount; // preserve for re-buy UX
  initialized.phase = "betting";
  initialized.pendingBoardCards = 0;
  initialized.showdownOrder = [];
  initialized.showdownRevealedIds = [];
  initialized.showdownPendingCard = null;
  initialized.showdownHandResults = {};
  initialized.log = [`Hand #${initialized.handNumber} started. Dealer: ${state.players[nextDealer].name}.`];

  const sb = nextActiveIndex(initialized.players, nextDealer);
  const bb = nextActiveIndex(initialized.players, sb);
  [sb, bb].forEach((idx, order) => {
    const amount = order === 0 ? initialized.smallBlind : initialized.bigBlind;
    const player = initialized.players[idx];
    const paid = Math.min(amount, player.chips);
    player.chips -= paid;
    initialized.contributions[player.id] += paid;
    initialized.handContributions[player.id] += paid;
    initialized.pot += paid;
    if (player.chips === 0) player.status = "all-in";
  });

  initialized.pots = computeSidePots(initialized);
  initialized.betting.currentBet = initialized.bigBlind;
  initialized.turnIndex = nextActiveIndex(initialized.players, bb);
  initialized.log.unshift(
    `Seats: ${initialized.players.map((p, idx) => `${p.name}${getSeatLabel(initialized, idx) ? `(${getSeatLabel(initialized, idx)})` : ""}`).join(" ")}`,
  );
  return initialized;
};
