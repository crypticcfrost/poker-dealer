import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createVoiceListener, parseVoiceCommand, isVoiceSupported } from "./lib/voice";
import type { VoiceDebugEvent } from "./lib/voice";
import { useGameStore } from "./store/gameStore";
import type { Card, Player, Pot } from "./types/game";

// ─── Constants / helpers ──────────────────────────────────────────────────────

const SUIT_SYMBOL: Record<Card["suit"], string> = { spades: "♠", hearts: "♥", clubs: "♣", diamonds: "♦" };
const CHIP_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#a855f7", "#f59e0b", "#06b6d4"];

// ─── Unique 3D Male Avatars ───────────────────────────────────────────────────
// 8 parameterised male faces — each has distinct skin tone, hair style, shirt.
// Radial gradient on face + drop shadow gives a 3D sphere look.

const HAIR_SHORT  = "M 22,42 C 20,16 80,16 78,42 Q 68,28 50,25 Q 32,28 22,42 Z";
const HAIR_PARTED = "M 22,42 C 20,16 47,18 50,26 C 53,18 80,16 78,42 Q 68,30 54,26 L 50,28 L 46,26 Q 32,30 22,42 Z";
const HAIR_CURLY  = "M 22,42 Q 22,30 26,24 Q 28,12 34,20 Q 38,10 44,20 Q 48,12 50,22 Q 52,12 56,20 Q 62,10 66,20 Q 72,12 74,24 Q 78,30 78,42 Q 68,30 50,26 Q 32,30 22,42 Z";
const HAIR_HIGH   = "M 22,44 L 25,10 L 75,10 L 78,44 Q 68,30 50,26 Q 32,30 22,44 Z";
const HAIR_BUZZ   = "M 22,44 C 20,34 80,34 78,44 Q 68,38 50,36 Q 32,38 22,44 Z";
const HAIR_SLICK  = "M 22,44 C 20,20 58,13 78,36 Q 66,25 44,22 Q 30,26 22,44 Z";
const HAIR_MESSY  = "M 23,42 Q 21,32 25,26 L 29,18 L 33,26 L 37,12 L 41,22 L 45,12 L 49,24 L 53,12 L 57,22 L 61,12 L 65,22 L 69,16 L 73,26 Q 77,32 77,42 Q 68,30 50,26 Q 32,30 23,42 Z";
const HAIR_WAVE   = "M 22,42 C 20,22 28,14 36,22 C 40,14 46,18 50,22 C 54,14 60,18 64,22 C 72,14 80,22 78,42 Q 68,30 50,26 Q 32,30 22,42 Z";

interface AvatarCfg {
  faceTop: string; faceMid: string; faceShadow: string;
  hairColor: string; hairHi: string;
  hairPath: string;
  shirtColor: string;
}

const AVATAR_CFGS: AvatarCfg[] = [
  { faceTop:"#d4906a", faceMid:"#9a5030", faceShadow:"#6a2810", hairColor:"#120804", hairHi:"#2a1208", hairPath:HAIR_SHORT,  shirtColor:"#1a2a4a" },
  { faceTop:"#f0b880", faceMid:"#c07840", faceShadow:"#8a4820", hairColor:"#3a1c0c", hairHi:"#5a3018", hairPath:HAIR_PARTED, shirtColor:"#1a3a2a" },
  { faceTop:"#fad0a8", faceMid:"#d09060", faceShadow:"#a06030", hairColor:"#7a2a10", hairHi:"#a04020", hairPath:HAIR_CURLY,  shirtColor:"#3a1020" },
  { faceTop:"#b87848", faceMid:"#7a4020", faceShadow:"#502010", hairColor:"#0a0604", hairHi:"#201408", hairPath:HAIR_WAVE,   shirtColor:"#242424" },
  { faceTop:"#d0a870", faceMid:"#9a6830", faceShadow:"#6a4018", hairColor:"#100806", hairHi:"#281808", hairPath:HAIR_HIGH,   shirtColor:"#2a3040" },
  { faceTop:"#f8d8b0", faceMid:"#e0a860", faceShadow:"#b07838", hairColor:"#c8980a", hairHi:"#e8c040", hairPath:HAIR_BUZZ,   shirtColor:"#2a3018" },
  { faceTop:"#c88858", faceMid:"#8a5028", faceShadow:"#5a2c10", hairColor:"#080604", hairHi:"#181208", hairPath:HAIR_SLICK,  shirtColor:"#1a1a3a" },
  { faceTop:"#e0a878", faceMid:"#a86838", faceShadow:"#784018", hairColor:"#200c06", hairHi:"#381808", hairPath:HAIR_MESSY,  shirtColor:"#183030" },
];

const SeatAvatar = ({ seatIndex, size = 48, dim = false }: { seatIndex: number; size?: number; dim?: boolean }) => {
  const cfg = AVATAR_CFGS[seatIndex % AVATAR_CFGS.length];
  const id  = `av${seatIndex}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none"
      style={{ display:"block", opacity: dim ? 0.28 : 1 }}>
      <defs>
        <radialGradient id={`f${id}`} cx="38%" cy="28%" r="70%">
          <stop offset="0%"   stopColor={cfg.faceTop} />
          <stop offset="60%"  stopColor={cfg.faceMid} />
          <stop offset="100%" stopColor={cfg.faceShadow} />
        </radialGradient>
        <radialGradient id={`h${id}`} cx="50%" cy="0%" r="100%">
          <stop offset="0%"   stopColor={cfg.hairHi} />
          <stop offset="100%" stopColor={cfg.hairColor} />
        </radialGradient>
        <filter id={`sf${id}`} x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.35"/>
        </filter>
      </defs>
      {/* Shirt + collar */}
      <ellipse cx="50" cy="108" rx="44" ry="28" fill={cfg.shirtColor}/>
      <rect x="38" y="76" width="24" height="26" rx="3" fill={cfg.shirtColor}/>
      <path d="M 41,82 L 50,96 L 59,82" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" fill="none"/>
      {/* Neck */}
      <rect x="44" y="68" width="12" height="16" rx="3" fill={cfg.faceMid}/>
      {/* Face sphere */}
      <circle cx="50" cy="46" r="28" fill={`url(#f${id})`} filter={`url(#sf${id})`}/>
      {/* 3D highlight */}
      <ellipse cx="42" cy="35" rx="10" ry="12" fill="rgba(255,255,255,0.11)"/>
      {/* Hair */}
      <path d={cfg.hairPath} fill={`url(#h${id})`}/>
      {/* Eyebrows */}
      <path d="M 39,39 Q 43,37 47,39" stroke={cfg.hairColor} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <path d="M 53,39 Q 57,37 61,39" stroke={cfg.hairColor} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      {/* Eyes */}
      <circle cx="43" cy="45" r="3.8" fill={cfg.faceShadow}/>
      <circle cx="57" cy="45" r="3.8" fill={cfg.faceShadow}/>
      <circle cx="42" cy="43.5" r="1.4" fill="rgba(255,255,255,0.6)"/>
      <circle cx="56" cy="43.5" r="1.4" fill="rgba(255,255,255,0.6)"/>
      {/* Nose */}
      <path d="M 49,51 Q 47,55 50,57 Q 53,55 51,51" fill={cfg.faceShadow} opacity="0.28"/>
      {/* Mouth */}
      <path d="M 44,60 Q 50,66 56,60" stroke={cfg.faceShadow} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.55"/>
    </svg>
  );
};

const nextActive = (statuses: string[], from: number) => {
  let i = from;
  for (let t = 0; t < statuses.length; t += 1) {
    i = (i + 1) % statuses.length;
    if (statuses[i] !== "folded" && statuses[i] !== "sit-out") return i;
  }
  return from;
};

const seatXY = (idx: number, total: number, r: number) => {
  const a = (idx / total) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
};

// ─── PotDisplay ───────────────────────────────────────────────────────────────
const PotDisplay = ({ pot, pots }: { pot: number; pots?: Pot[] }) => {
  const count = Math.min(Math.max(0, Math.round(pot / 3)), 18);
  const chips = Array.from({ length: count }, (_, i) => {
    const a = i * 2.39996;
    const r = i < 5 ? 8 : i < 11 ? 18 : 27;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.6, color: CHIP_COLORS[i % CHIP_COLORS.length] };
  });
  const hasSidePots = pots && pots.length > 1;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-12 w-16">
        <AnimatePresence>
          {chips.map((c, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.025, type: "spring", stiffness: 450, damping: 22 }}
              style={{
                position: "absolute",
                width: 14, height: 14,
                borderRadius: "50%",
                backgroundColor: c.color,
                left: `calc(50% + ${c.x}px)`,
                top: `calc(50% + ${c.y}px)`,
                transform: "translate(-50%,-50%)",
                border: "1.5px solid rgba(255,255,255,0.18)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -1px 0 rgba(0,0,0,0.22)",
              }}
            />
          ))}
        </AnimatePresence>
      </div>
      {pot > 0 && !hasSidePots && (
        <motion.span key={pot} initial={{ scale: 0.8 }} animate={{ scale: 1 }}
          className="text-base font-extrabold tracking-tight text-amber-200"
          style={{ textShadow: "0 1px 6px rgba(251,191,36,0.4)" }}>
          {pot}
        </motion.span>
      )}
      {/* Side-pot breakdown */}
      {hasSidePots && (
        <div className="flex flex-col items-center gap-[2px]">
          {pots!.map((p, i) => (
            <motion.div key={i} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                borderRadius: 999,
                padding: "1px 7px",
                background: i === 0 ? "rgba(120,80,10,0.45)" : "rgba(30,60,90,0.5)",
                border: i === 0 ? "1px solid rgba(215,165,30,0.45)" : "1px solid rgba(56,189,248,0.3)",
              }}>
              <span style={{ fontSize: 7, fontWeight: 700, color: i === 0 ? "#fcd88a" : "#7dd3fc", letterSpacing: "0.06em" }}>
                {i === 0 ? "MAIN" : `SIDE ${i}`}
              </span>
              <span style={{ fontSize: 10, fontWeight: 900, color: i === 0 ? "#fef3c7" : "#e0f2fe" }}>
                {p.amount}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── PlayerSeat ───────────────────────────────────────────────────────────────
const PlayerSeat = ({
  name, chips, status, isTurn, role, seatIdx, total, owed,
  hand, isRevealTurn, hasRevealed, isWinner, handName,
}: {
  name: string; chips: number; status: string; isTurn: boolean;
  role: string; seatIdx: number; total: number; owed: number;
  hand: Card[]; isRevealTurn: boolean; hasRevealed: boolean; isWinner: boolean; handName?: string;
}) => {
  const angle = (seatIdx / total) * 360;
  const folded = status === "folded" || status === "sit-out";
  const isAllIn = status === "all-in";
  const dotCount = Math.min(5, Math.max(0, Math.floor(chips / 40)));

  // Cards must render ABOVE the avatar for:
  //   - top-half players: so cards sit outside the table, not over the felt
  //   - deep-bottom player (y > 0.85): otherwise cards spill below the table container
  const { y: seatY } = seatXY(seatIdx, total, 1);
  const isTopHalf = seatY < -0.15;
  const isDeepBottom = seatY > 0.85;
  const cardsAbove = isTopHalf || isDeepBottom;

  // ── Card mini-display (reused for both positions) ──────────────────────────
  const CardDisplay = !folded ? (
    <div className={cardsAbove ? "mb-1" : "mt-1.5"}>
      <div className="flex gap-[3px]">
        {[0, 1].map((i) => {
          const card = hand[i];
          const faceUp = card && (hasRevealed || (hand.length === 1 && i === 0));
          const isRed = card && (card.suit === "hearts" || card.suit === "diamonds");
          return faceUp ? (
            <motion.div
              key={`face-${i}-${card.rank}-${card.suit}`}
              layoutId={`seat-card-${name}-${i}`}
              initial={{ rotateY: 90, opacity: 0, scale: 0.8 }}
              animate={{ rotateY: 0, opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 350, damping: 24 }}
              style={{
                width: 22, height: 30,
                borderRadius: 3,
                background: "linear-gradient(145deg, #ffffff, #f0ece4)",
                border: isWinner ? "1px solid rgba(215,165,30,0.8)" : "1px solid rgba(130,120,110,0.35)",
                boxShadow: isWinner
                  ? "0 2px 8px rgba(215,165,30,0.35), inset 0 1px 0 rgba(255,255,255,0.9)"
                  : "0 2px 6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.9)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <span style={{
                position: "absolute", top: 2, left: 2,
                fontSize: 7, fontWeight: 900, lineHeight: 1,
                color: isRed ? "#c0181a" : "#111",
              }}>{card.rank}</span>
              <span style={{
                position: "absolute", top: 10, left: 2,
                fontSize: 9, lineHeight: 1,
                color: isRed ? "#c0181a" : "#111",
              }}>{SUIT_SYMBOL[card.suit]}</span>
            </motion.div>
          ) : (
            <motion.div
              key={`back-${i}`}
              exit={{ x: 12, y: -8, rotate: 18, opacity: 0, scale: 0.5, transition: { duration: 0.28 } }}
              style={{
                width: 22, height: 30,
                borderRadius: 3,
                background: "linear-gradient(145deg, #1a2e4a, #0d1b2e)",
                border: isRevealTurn && !(hand.length === 1 && i === 0)
                  ? "1px solid rgba(215,165,30,0.6)"
                  : "1px solid rgba(50,80,130,0.5)",
                boxShadow: "0 2px 6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              <div style={{
                height: "100%",
                borderRadius: 2,
                background: "repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(255,255,255,0.04) 2px, rgba(255,255,255,0.04) 3px)",
                animation: isRevealTurn && !(hand.length === 1 && i === 0) ? "pulse 1.2s ease-in-out infinite" : undefined,
              }} />
            </motion.div>
          );
        })}
      </div>
      <AnimatePresence>
        {handName && (
          <motion.div
            initial={{ opacity: 0, y: 3, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
            style={{
              marginTop: 3,
              borderRadius: 999,
              padding: "1px 5px",
              textAlign: "center",
              fontSize: 8,
              fontWeight: 700,
              border: isWinner ? "1px solid rgba(215,165,30,0.55)" : "1px solid rgba(90,90,100,0.55)",
              background: isWinner ? "rgba(120,80,10,0.35)" : "rgba(30,30,36,0.85)",
              color: isWinner ? "#fcd88a" : "#888",
            }}
          >
            {handName}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  ) : null;

  return (
    <div
      className="absolute left-1/2 top-1/2 flex flex-col items-center"
      style={{ transform: `translate(-50%,-50%) rotate(${angle}deg) translateY(-130px) rotate(${-angle}deg)` }}
    >
      {/* Cards above avatar (top-half players + deep-bottom player) */}
      {cardsAbove && CardDisplay}

      {/* Action / reveal bubble */}
      <AnimatePresence>
        {isRevealTurn && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.85 }}
            style={{
              marginBottom: 3,
              whiteSpace: "nowrap",
              borderRadius: 999,
              border: "1px solid rgba(215,165,30,0.55)",
              background: "rgba(120,80,10,0.35)",
              padding: "2px 7px",
              fontSize: 9,
              fontWeight: 700,
              color: "#fcd88a",
            }}
          >
            Reveal hand
          </motion.div>
        )}
        {!isRevealTurn && isTurn && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.85 }}
            style={{
              marginBottom: 3,
              whiteSpace: "nowrap",
              borderRadius: 999,
              border: "1px solid rgba(56,189,248,0.35)",
              background: "rgba(8,80,120,0.3)",
              padding: "2px 7px",
              fontSize: 9,
              fontWeight: 700,
              color: "#bae6fd",
            }}
          >
            {owed > 0 ? `Call ${owed}` : "Check / Raise"}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar */}
      <div className="relative" style={{ width: 48, height: 48 }}>
        {/* Winner ring */}
        {isWinner && (
          <div style={{
            position: "absolute",
            inset: -4,
            borderRadius: "50%",
            border: "2.5px solid #f59e0b",
            boxShadow: "0 0 14px rgba(251,191,36,0.65)",
          }} />
        )}
        {/* Turn spinner */}
        {isTurn && !isWinner && (
          <div className="animate-spin" style={{
            position: "absolute",
            inset: -3,
            borderRadius: "50%",
            border: "2.5px solid #34d399",
            borderTopColor: "transparent",
            borderRightColor: "transparent",
          }} />
        )}
        {/* Reveal pulse */}
        {isRevealTurn && !isWinner && (
          <div className="animate-pulse" style={{
            position: "absolute",
            inset: -3,
            borderRadius: "50%",
            border: "2.5px solid rgba(215,165,30,0.7)",
          }} />
        )}
        {/* Role puck */}
        {role ? (
          <div style={{
            position: "absolute",
            right: -6, top: -6,
            zIndex: 10,
            width: 20, height: 20,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            fontSize: 7,
            fontWeight: 900,
            ...(role === "D"
              ? { background: "#f4f4f5", color: "#111", border: "1.5px solid rgba(255,255,255,0.5)" }
              : role === "SB"
              ? { background: "#1d4ed8", color: "#fff", border: "1.5px solid rgba(147,197,253,0.5)" }
              : { background: "#b91c1c", color: "#fff", border: "1.5px solid rgba(252,165,165,0.5)" }),
          }}>
            {role}
          </div>
        ) : null}
        {/* All-in badge */}
        {isAllIn && (
          <div style={{
            position: "absolute",
            left: -8, bottom: -6,
            zIndex: 10,
            borderRadius: 999,
            padding: "1px 5px",
            fontSize: 7,
            fontWeight: 900,
            letterSpacing: "0.04em",
            background: "linear-gradient(135deg, #b91c1c, #7f1d1d)",
            color: "#fecaca",
            border: "1px solid rgba(252,165,165,0.5)",
            boxShadow: "0 1px 6px rgba(185,28,28,0.5)",
            whiteSpace: "nowrap",
          }}>ALL IN</div>
        )}
        {/* Avatar circle */}
        <div style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: isWinner
            ? "radial-gradient(circle at 40% 35%, #5c3a0f, #2e1d08)"
            : isTurn
            ? "radial-gradient(circle at 40% 35%, #14401e, #082010)"
            : "radial-gradient(circle at 40% 35%, #252528, #0e0e10)",
          boxShadow: isWinner
            ? "0 2px 12px rgba(180,120,10,0.4), inset 0 1px 0 rgba(255,255,255,0.1)"
            : isTurn
            ? "0 2px 12px rgba(20,160,60,0.25), inset 0 1px 0 rgba(255,255,255,0.07)"
            : "0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
        }}>
          <SeatAvatar seatIndex={seatIdx} size={42} dim={folded} />
        </div>
      </div>

      {/* Name */}
      <p style={{
        marginTop: 3,
        maxWidth: 64,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontSize: 10,
        fontWeight: 700,
        color: isWinner ? "#fcd34d" : isTurn ? "#86efac" : folded ? "#52525b" : "#d4d4d8",
        textDecoration: folded ? "line-through" : "none",
      }}>
        {name}
      </p>

      {/* Chip dots — 3D look */}
      {!folded && (
        <div style={{ marginTop: 2, display: "flex", gap: 3, alignItems: "center" }}>
          {Array.from({ length: Math.max(1, dotCount) }).map((_, i) => (
            <div key={i} style={{
              width: 7, height: 7,
              borderRadius: "50%",
              backgroundColor: i < dotCount ? CHIP_COLORS[i % CHIP_COLORS.length] : "transparent",
              border: i < dotCount ? "1px solid rgba(0,0,0,0.3)" : "1px solid rgba(80,80,80,0.4)",
              boxShadow: i < dotCount
                ? "0 1px 3px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.3)"
                : "none",
            }} />
          ))}
        </div>
      )}

      <p style={{
        fontSize: 9,
        color: isWinner ? "#fcd34d" : isTurn ? "#6ee7b7" : "#71717a",
        fontWeight: isWinner ? 700 : 400,
        fontVariantNumeric: "tabular-nums",
      }}>{chips}</p>

      {/* Cards below avatar (bottom-half players, excluding deep-bottom) */}
      {!cardsAbove && CardDisplay}
    </div>
  );
};

// ─── CommunityCards ───────────────────────────────────────────────────────────
// pendingSlots: number of face-down "incoming" cards (during flop reveal).
const CommunityCards = ({ cards, pendingSlots = 0 }: { cards: Card[]; pendingSlots?: number }) => {
  const totalShown = cards.length + pendingSlots; // revealed + pending back-faces
  const emptySlots = Math.max(0, 5 - totalShown);  // true blanks (not yet in play)
  return (
    <div className="flex gap-1.5">
      {/* Revealed cards — real playing-card look */}
      <AnimatePresence>
        {cards.map((card, idx) => {
          const isRed = card.suit === "hearts" || card.suit === "diamonds";
          return (
            <motion.div
              key={`${card.rank}-${card.suit}-${idx}`}
              initial={{ rotateY: 90, opacity: 0, scale: 0.75 }}
              animate={{ rotateY: 0, opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              style={{
                width: 30, height: 42,
                borderRadius: 4,
                background: "linear-gradient(145deg, #ffffff, #f0ece4)",
                border: "1px solid rgba(120,110,100,0.35)",
                boxShadow: "0 3px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.9)",
                position: "relative",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <span style={{
                position: "absolute", top: 3, left: 3,
                fontSize: 9, fontWeight: 900, lineHeight: 1,
                color: isRed ? "#c0181a" : "#111",
              }}>{card.rank}</span>
              <span style={{
                position: "absolute", top: 13, left: 3,
                fontSize: 12, lineHeight: 1,
                color: isRed ? "#c0181a" : "#111",
              }}>{SUIT_SYMBOL[card.suit]}</span>
              {/* Bottom-right mirror (upside-down) */}
              <span style={{
                position: "absolute", bottom: 3, right: 3,
                fontSize: 9, fontWeight: 900, lineHeight: 1,
                color: isRed ? "#c0181a" : "#111",
                transform: "rotate(180deg)",
              }}>{card.rank}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Face-down pending cards (flop being revealed one-by-one) */}
      {Array.from({ length: pendingSlots }).map((_, i) => (
        <motion.div
          key={`pending-${i}`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.05 }}
          style={{
            width: 30, height: 42,
            borderRadius: 4,
            background: "linear-gradient(145deg, #1a2e4a, #0d1b2e)",
            border: "1px solid rgba(50,80,130,0.5)",
            boxShadow: "0 3px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
            flexShrink: 0,
            overflow: "hidden",
          }}
          className="flex items-center justify-center"
        >
          <div style={{
            width: "100%", height: "100%",
            background: "repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(255,255,255,0.04) 3px, rgba(255,255,255,0.04) 4px)",
          }} />
        </motion.div>
      ))}

      {/* Empty future slots */}
      {Array.from({ length: emptySlots }).map((_, i) => (
        <div key={`empty-${i}`} style={{
          width: 30, height: 42,
          borderRadius: 4,
          border: "1px solid rgba(50,50,60,0.3)",
          background: "rgba(10,10,12,0.15)",
          flexShrink: 0,
        }} />
      ))}
    </div>
  );
};

// ─── FaceCard (reusable small card for showdown panel) ────────────────────────
const FaceCard = ({ card, size = "md", winner = false }: { card: Card; size?: "sm" | "md"; winner?: boolean }) => {
  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  const w = size === "sm" ? 18 : 26;
  const h = size === "sm" ? 24 : 36;
  return (
    <motion.div
      initial={{ rotateY: 90, opacity: 0, scale: 0.75 }}
      animate={{ rotateY: 0, opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      style={{
        width: w, height: h,
        borderRadius: 3,
        background: "linear-gradient(145deg, #ffffff, #f0ece4)",
        border: winner ? "1px solid rgba(215,165,30,0.75)" : "1px solid rgba(120,110,100,0.35)",
        boxShadow: winner
          ? "0 2px 8px rgba(215,165,30,0.35), inset 0 1px 0 rgba(255,255,255,0.9)"
          : "0 2px 7px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.9)",
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 2, left: 2,
        fontSize: size === "sm" ? 6 : 8,
        fontWeight: 900, lineHeight: 1,
        color: isRed ? "#c0181a" : "#111",
      }}>{card.rank}</span>
      <span style={{
        position: "absolute", top: size === "sm" ? 9 : 11, left: 2,
        fontSize: size === "sm" ? 7 : 10,
        lineHeight: 1,
        color: isRed ? "#c0181a" : "#111",
      }}>{SUIT_SYMBOL[card.suit]}</span>
    </motion.div>
  );
};

const HAND_COLOR: Record<string, string> = {
  "Straight Flush": "text-amber-300", "Quads": "text-red-400", "Full House": "text-purple-400",
  "Flush": "text-sky-400", "Straight": "text-yellow-400", "Trips": "text-orange-400",
  "Two Pair": "text-blue-400", "Pair": "text-zinc-300", "High Card": "text-zinc-500",
};

// ─── ShowdownCenter ────────────────────────────────────────────────────────────
const ShowdownCenter = ({
  players, showdownOrder, showdownRevealedIds, nextRevealId, showdownHandResults, winners, pot,
}: {
  players: Player[]; showdownOrder: string[]; showdownRevealedIds: string[];
  nextRevealId: string | undefined; showdownHandResults: Record<string, string>;
  winners: string[]; pot: number;
}) => {
  const allDone = showdownRevealedIds.length === showdownOrder.length && showdownOrder.length > 0;
  const nextPlayer = players.find((p) => p.id === nextRevealId);

  return (
    <div className="flex flex-col items-center gap-1.5 w-[200px]">
      {/* ── Current player reveal theater ── */}
      <AnimatePresence mode="wait">
        {allDone ? (
          /* Winner banner */
          <motion.div
            key="winner"
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="flex flex-col items-center gap-1 rounded-xl border border-amber-400/40 bg-zinc-950/90 px-4 py-2 text-center"
          >
            <motion.span animate={{ rotate: [0, -6, 6, -4, 4, 0] }} transition={{ delay: 0.2, duration: 0.5 }} className="text-xl">🏆</motion.span>
            <p className="text-sm font-black text-amber-300">
              {winners.map((id) => players.find((p) => p.id === id)?.name).join(" & ")}
            </p>
            <p className="text-[10px] text-zinc-500">+{pot} chips</p>
          </motion.div>
        ) : nextRevealId && nextPlayer ? (
          /* Reveal theater for current player */
          <motion.div
            key={`reveal-${nextRevealId}`}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="flex flex-col items-center gap-1 rounded-xl border border-amber-400/30 bg-zinc-950/85 px-3 py-2 text-center w-full"
          >
            <span className="text-[8px] font-bold uppercase tracking-widest text-amber-500">Showdown</span>
            <span className="text-[12px] font-black text-amber-100">{nextPlayer.name}</span>
            {/* Card slots */}
            <div className="flex gap-1.5 mt-0.5">
              {nextPlayer.hand.length >= 1 ? (
                <FaceCard card={nextPlayer.hand[0]} winner={winners.includes(nextRevealId)} />
              ) : (
                <motion.div animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ repeat: Infinity, duration: 1.1 }}
                  className="flex h-9 w-6 items-center justify-center rounded border border-amber-500/40 bg-amber-900/10">
                  <span className="text-[10px] text-amber-400">?</span>
                </motion.div>
              )}
              {nextPlayer.hand.length >= 2 ? (
                <FaceCard card={nextPlayer.hand[1]} winner={winners.includes(nextRevealId)} />
              ) : (
                <motion.div animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ repeat: Infinity, duration: 1.1, delay: 0.3 }}
                  className="flex h-9 w-6 items-center justify-center rounded border border-amber-500/40 bg-amber-900/10">
                  <span className="text-[10px] text-amber-400">?</span>
                </motion.div>
              )}
            </div>
            {/* Hand name — appears after second card */}
            <AnimatePresence>
              {showdownHandResults[nextRevealId] && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, y: 3 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                  className={`rounded-full border px-2 py-[2px] text-[9px] font-black ${HAND_COLOR[showdownHandResults[nextRevealId]] ?? "text-zinc-400"} border-current/30 bg-current/5`}
                >
                  {showdownHandResults[nextRevealId]}
                </motion.div>
              )}
            </AnimatePresence>
            <p className="text-[9px] text-zinc-600 mt-0.5">
              {nextPlayer.hand.length === 0 ? "Say first card…" : nextPlayer.hand.length === 1 ? "Say second card…" : ""}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ── Past reveals (compact) ── */}
      {showdownRevealedIds.length > 0 && (
        <div className="flex flex-col gap-0.5 w-full">
          {showdownRevealedIds.map((id) => {
            const p = players.find((pl) => pl.id === id);
            if (!p) return null;
            const isW = winners.includes(id);
            return (
              <motion.div key={id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 ${isW ? "bg-amber-900/20 border border-amber-600/25" : "bg-zinc-900/50"}`}>
                <span className={`text-[9px] font-semibold truncate w-[42px] ${isW ? "text-amber-300" : "text-zinc-400"}`}>{p.name}</span>
                <div className="flex gap-[3px]">
                  {p.hand.map((card, ci) => <FaceCard key={ci} card={card} size="sm" winner={isW} />)}
                </div>
                <span className={`text-[8px] font-bold ml-auto ${HAND_COLOR[showdownHandResults[id]] ?? "text-zinc-600"}`}>
                  {showdownHandResults[id]}
                </span>
                {isW && <span className="text-[10px]">🏆</span>}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Pot */}
      {!allDone && (
        <p className="text-[10px] font-bold text-amber-200/60">Pot ₹{pot}</p>
      )}
    </div>
  );
};

// ─── RaiseModal ───────────────────────────────────────────────────────────────
const RaiseModal = ({
  open, onClose, onConfirm, minRaise, maxChips, currentBet,
}: {
  open: boolean; onClose: () => void; onConfirm: (v: number) => void;
  minRaise: number; maxChips: number; currentBet: number;
}) => {
  const safeMax = Math.max(minRaise, maxChips);
  const safeMin = Math.min(minRaise, safeMax);
  const [value, setValue] = useState(safeMin);

  useEffect(() => { if (open) setValue(safeMin); }, [open, safeMin]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={onClose}>
          <motion.div
            initial={{ scale: 0.88, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.88, y: 24 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="mx-6 w-full max-w-[300px] rounded-3xl border border-violet-400/30 bg-zinc-950 p-5 shadow-2xl"
          >
            <h3 className="mb-1 text-lg font-black text-violet-200">Raise To</h3>
            <p className="mb-4 text-xs text-zinc-500">Current bet: {currentBet} · Min: {safeMin}</p>
            <div className="mb-2 flex items-center justify-between text-sm text-zinc-400">
              <span>{safeMin}</span>
              <span className="text-2xl font-extrabold text-white">{value}</span>
              <span>{safeMax}</span>
            </div>
            <input type="range" min={safeMin} max={safeMax} value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              className="w-full accent-violet-500" />
            <input type="number" min={safeMin} max={safeMax} value={value}
              onChange={(e) => setValue(Math.max(safeMin, Math.min(safeMax, Number(e.target.value))))}
              className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-center text-lg font-bold text-white focus:border-violet-500 focus:outline-none" />
            <div className="mt-4 flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm text-zinc-400">Cancel</button>
              <button onClick={() => { onConfirm(value); onClose(); }}
                className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-600/30">
                Raise {value}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ─── ActionBtn ───────────────────────────────────────────────────────────────
const ActionBtn = ({ onClick, label, icon, disabled, glow }: {
  onClick: () => void; label: string; icon: string; disabled?: boolean; glow?: string;
}) => (
  <button onClick={onClick} title={label} aria-label={label} disabled={disabled}
    className={`grid h-10 w-10 place-items-center rounded-full border text-lg shadow transition-transform active:scale-95
      ${disabled ? "border-zinc-800 bg-zinc-900/40 opacity-30 cursor-not-allowed"
        : glow ? `border-${glow}-400/60 bg-${glow}-600/20 hover:-translate-y-0.5`
        : "border-zinc-600/70 bg-zinc-900/90 hover:-translate-y-0.5 hover:border-violet-400/60"}`}>
    {icon}
  </button>
);

// ─── EconomyModal ─────────────────────────────────────────────────────────────
const computeSettlement = (players: Player[]) => {
  const nets = players
    .filter((p) => p.totalBuyIn > 0 || p.chips > 0)
    .map((p) => ({ name: p.name, net: p.chips - p.totalBuyIn }));
  const creditors = nets.filter((p) => p.net > 0).map((p) => ({ ...p })).sort((a, b) => b.net - a.net);
  const debtors   = nets.filter((p) => p.net < 0).map((p) => ({ ...p })).sort((a, b) => a.net - b.net);
  const txns: { from: string; to: string; amount: number }[] = [];
  let ci = 0; let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const amount = Math.min(creditors[ci].net, -debtors[di].net);
    txns.push({ from: debtors[di].name, to: creditors[ci].name, amount });
    creditors[ci].net -= amount;
    debtors[di].net  += amount;
    if (creditors[ci].net === 0) ci++;
    if (debtors[di].net  === 0) di++;
  }
  return txns;
};

const EconomyModal = ({
  open, onClose, players, buyInAmount, onAfterRebuy,
}: {
  open: boolean; onClose: () => void; players: Player[];
  buyInAmount: number; onAfterRebuy?: (name: string) => void;
}) => {
  const { rebuy } = useGameStore();
  const txns = computeSettlement(players);
  const totalPot = players.reduce((s, p) => s + p.totalBuyIn, 0);
  const brokePlayers = players.filter((p) => p.chips === 0 && p.status !== "sit-out" || p.status === "sit-out");
  const hasBroke = brokePlayers.length > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex flex-col bg-zinc-950/98 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex flex-col overflow-hidden rounded-t-3xl bg-zinc-900 flex-1 mt-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-violet-200">Game Economy</h2>
                <p className="text-[11px] text-zinc-500">Total in play: ₹{totalPot}</p>
              </div>
              <button onClick={onClose} className="rounded-full bg-zinc-800 p-2 text-zinc-400 hover:text-zinc-100">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* ── Re-buy banner (shown when 1+ players are broke) ── */}
              {hasBroke && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">🔄</span>
                    <h3 className="text-sm font-black text-amber-200 uppercase tracking-wider">Re-buy Available</h3>
                    {buyInAmount > 0 && (
                      <span className="ml-auto text-[10px] text-amber-400/70 font-semibold">+{buyInAmount} chips each</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {brokePlayers.map((p) => (
                      <div key={p.id}
                        className="flex items-center justify-between rounded-xl bg-zinc-900/80 border border-zinc-700/50 px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <SeatAvatar seatIndex={p.seatIndex} size={32} />
                          <div>
                            <p className="text-sm font-bold text-zinc-100">{p.name}</p>
                            <p className="text-[10px] text-zinc-500">
                              {p.totalBuyIn > 0 ? `${Math.round(p.totalBuyIn / (buyInAmount || p.totalBuyIn))}× buy-in so far` : "No buy-in yet"}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => { rebuy(p.id, buyInAmount || 200); onAfterRebuy?.(p.name); }}
                          className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-xs font-black text-white shadow-lg shadow-violet-900/40 active:scale-95 transition-transform border border-violet-400/30">
                          Re-buy {buyInAmount > 0 ? `+${buyInAmount}` : ""}
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Player standings table */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Standings</h3>
                <div className="rounded-2xl border border-zinc-800 overflow-hidden">
                  <div className="grid grid-cols-4 bg-zinc-800/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    <span>Player</span>
                    <span className="text-right">Bought in</span>
                    <span className="text-right">Chips</span>
                    <span className="text-right">Net P/L</span>
                  </div>
                  {players.map((p) => {
                    const net = p.chips - p.totalBuyIn;
                    const isBroke = p.chips === 0;
                    return (
                      <div key={p.id}
                        className={`grid grid-cols-4 border-t border-zinc-800/60 px-3 py-2.5 text-sm items-center ${isBroke ? "bg-rose-950/20" : ""}`}>
                        <div className="flex items-center gap-2">
                          <SeatAvatar seatIndex={p.seatIndex} size={22} dim={isBroke} />
                          <div>
                            <span className={`font-semibold truncate text-[12px] ${isBroke ? "text-zinc-500" : "text-zinc-200"}`}>{p.name}</span>
                            {isBroke && <p className="text-[9px] text-rose-400/70 font-semibold leading-none mt-0.5">OUT</p>}
                          </div>
                        </div>
                        <span className="text-right text-zinc-400 text-[12px]">₹{p.totalBuyIn}</span>
                        <span className={`text-right text-[12px] font-bold ${isBroke ? "text-rose-400/60" : "text-zinc-300"}`}>{p.chips}</span>
                        <span className={`text-right font-bold text-[12px] ${net > 0 ? "text-emerald-400" : net < 0 ? "text-rose-400" : "text-zinc-500"}`}>
                          {net > 0 ? "+" : ""}{net}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Settlement */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Settlement ({txns.length} transaction{txns.length !== 1 ? "s" : ""})
                </h3>
                {txns.length === 0 ? (
                  <p className="rounded-xl border border-zinc-800 px-4 py-3 text-sm text-zinc-600">All square — no payments needed.</p>
                ) : (
                  <div className="space-y-2">
                    {txns.map((t, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-bold text-rose-300">{t.from}</span>
                          <span className="text-zinc-600">→</span>
                          <span className="font-bold text-emerald-300">{t.to}</span>
                        </div>
                        <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-3 py-1 text-sm font-black text-amber-200">
                          ₹{t.amount}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ─── Poker chip logo SVG (shared by splash + setup) ──────────────────────────
const PokerChipLogo = ({ size = 100 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
    <defs>
      <radialGradient id="cg1" cx="40%" cy="33%" r="70%">
        <stop offset="0%" stopColor="#2d1b69"/>
        <stop offset="100%" stopColor="#0d0d1a"/>
      </radialGradient>
      <radialGradient id="cg2" cx="40%" cy="33%" r="70%">
        <stop offset="0%" stopColor="#1a0d40"/>
        <stop offset="100%" stopColor="#07070f"/>
      </radialGradient>
    </defs>
    <circle cx="60" cy="60" r="58" fill="none" stroke="rgba(124,58,237,0.12)" strokeWidth="3"/>
    <circle cx="60" cy="60" r="52" fill="url(#cg1)"/>
    {Array.from({length:8},(_,i)=>(
      <rect key={i} x="52" y="8" width="16" height="14" rx="3"
        fill={i%2===0?"#7c3aed":"#5b21b6"} transform={`rotate(${i*45} 60 60)`}/>
    ))}
    <circle cx="60" cy="60" r="40" fill="none" stroke="rgba(124,58,237,0.45)" strokeWidth="1.5" strokeDasharray="4 3"/>
    <circle cx="60" cy="60" r="32" fill="url(#cg2)"/>
    <text x="60" y="54" textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="900" fill="#c4b5fd">♠</text>
    <text x="60" y="72" textAnchor="middle" fontSize="8" fontWeight="700" fill="#a78bfa" letterSpacing="3">POKER</text>
    <circle cx="60" cy="60" r="28" fill="none" stroke="rgba(167,139,250,0.18)" strokeWidth="0.75"/>
  </svg>
);

// ─── Splash screen (3.8 s on first load) ─────────────────────────────────────
const SplashScreen = ({ onDone }: { onDone: () => void }) => {
  useEffect(() => {
    const t = setTimeout(onDone, 3800);
    return () => clearTimeout(t);
  }, [onDone]);

  const SUITS = ["♠","♥","♦","♣"];
  const floaters = Array.from({length:16},(_,i)=>({
    suit: SUITS[i%4], x: 4+(i*6.1)%88,
    top: 70+(i*8)%25, delay: i*0.22,
    dur: 2.4+(i%4)*0.55, size: 14+(i%3)*8, red: i%4===1||i%4===2,
  }));

  return (
    <AnimatePresence>
      <motion.div initial={{opacity:1}} exit={{opacity:0,scale:1.04}} transition={{duration:0.7}}
        className="mobile-shell" style={{position:"relative",zIndex:200}}>
        <div className="mobile-stage flex flex-col items-center justify-center relative overflow-hidden"
          style={{background:"radial-gradient(ellipse at 50% 40%, #0d1f0f 0%, #050605 100%)"}}>

          {/* Floating suits */}
          {floaters.map((f,i)=>(
            <motion.div key={i}
              initial={{opacity:0,y:0}} animate={{opacity:[0,f.red?0.2:0.13,0],y:`-${105+f.top}%`}}
              transition={{duration:f.dur,delay:f.delay,repeat:Infinity,ease:"linear"}}
              style={{position:"absolute",left:`${f.x}%`,top:`${f.top}%`,
                fontSize:f.size,color:f.red?"#dc2626":"#c4b5fd",pointerEvents:"none",userSelect:"none"}}>
              {f.suit}
            </motion.div>
          ))}

          {/* Chip logo with pulse rings */}
          <motion.div initial={{scale:0.3,opacity:0,rotate:-25}}
            animate={{scale:1,opacity:1,rotate:0}}
            transition={{type:"spring",stiffness:180,damping:18,delay:0.2}}
            style={{position:"relative",zIndex:10}}>
            <PokerChipLogo size={130}/>
            {[{inset:-12,delay:0},{inset:-26,delay:0.3},{inset:-42,delay:0.6}].map((r,i)=>(
              <motion.div key={i}
                animate={{scale:[1,1.15+i*0.1,1],opacity:[0.45,0,0.45]}}
                transition={{duration:2.2,repeat:Infinity,ease:"easeInOut",delay:r.delay}}
                style={{position:"absolute",inset:r.inset,borderRadius:"50%",
                  border:`${1.5-i*0.3}px solid rgba(124,58,237,${0.5-i*0.12})`}}/>
            ))}
          </motion.div>

          {/* Title */}
          <motion.div initial={{opacity:0,y:18}} animate={{opacity:1,y:0}}
            transition={{delay:0.85}} style={{zIndex:10,textAlign:"center",marginTop:22}}>
            <h1 style={{fontSize:30,fontWeight:900,letterSpacing:"0.06em",
              background:"linear-gradient(135deg,#c4b5fd,#818cf8,#c4b5fd)",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
              HOLDEM' POKER
            </h1>
            <motion.p initial={{opacity:0}} animate={{opacity:1}} transition={{delay:1.3}}
              style={{fontSize:10,color:"#52525b",marginTop:3,letterSpacing:"0.18em"}}>
              SMART DEALER ASSISTANT
            </motion.p>
          </motion.div>

          {/* 5-card fan */}
          <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:1.5}}
            style={{zIndex:10,display:"flex",gap:6,marginTop:26}}>
            {["A♠","K♥","Q♦","J♣","10♠"].map((lbl,i)=>(
              <motion.div key={i}
                initial={{y:36,opacity:0,rotateY:90}}
                animate={{y:0,opacity:1,rotateY:0}}
                transition={{type:"spring",stiffness:250,damping:20,delay:1.5+i*0.1}}
                style={{width:30,height:42,borderRadius:5,
                  background:"linear-gradient(145deg,#ffffff,#f0ece4)",
                  border:"1px solid rgba(130,120,110,0.4)",
                  boxShadow:"0 4px 10px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.9)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:8,fontWeight:900,
                  color:(lbl.includes("♥")||lbl.includes("♦"))?"#c0181a":"#111"}}>
                {lbl}
              </motion.div>
            ))}
          </motion.div>

          {/* Progress bar */}
          <motion.div style={{marginTop:28,width:110,zIndex:10}}>
            <div style={{height:2,borderRadius:999,background:"rgba(60,60,80,0.45)",overflow:"hidden"}}>
              <motion.div initial={{width:0}} animate={{width:"100%"}}
                transition={{duration:3.1,ease:"easeInOut",delay:0.5}}
                style={{height:"100%",background:"linear-gradient(90deg,#7c3aed,#818cf8)"}}/>
            </div>
          </motion.div>

          {/* Watermark */}
          <motion.p initial={{opacity:0}} animate={{opacity:0.38}} transition={{delay:2.1}}
            style={{position:"absolute",bottom:24,fontSize:10,color:"#52525b",letterSpacing:"0.06em"}}>
            Made with ♥ by Shreyas
          </motion.p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// ─── Setup screen constants ───────────────────────────────────────────────────
const BUY_IN_OPTIONS = [50, 100, 150] as const;
type BuyInAmount = (typeof BUY_IN_OPTIONS)[number];
const BLIND_MAP: Record<BuyInAmount, [number,number]> = { 50:[1,2], 100:[2,4], 150:[5,10] };
const SEAT_STRIP_COLORS = [
  "#dc2626","#d97706","#16a34a","#2563eb","#7c3aed","#db2777","#0891b2","#65a30d","#b45309",
];

// ─── SetupScreen (ATC-strip style) ───────────────────────────────────────────
const SetupScreen = () => {
  const { setup } = useGameStore();
  const [players, setPlayers] = useState(["Shreyas","Ditesh","Rakshith","Varun"]);
  const [addName, setAddName]   = useState("");
  const [editIdx, setEditIdx]   = useState<number|null>(null);
  const [editVal, setEditVal]   = useState("");
  const [buyIn, setBuyIn]       = useState<BuyInAmount>(100);
  const [dealerIdx, setDealerIdx] = useState(0);
  const addRef = useRef<HTMLInputElement>(null);

  const commitEdit = () => {
    if (editIdx === null) return;
    const n = editVal.trim();
    if (n) setPlayers(p => p.map((x,i) => i===editIdx ? n : x));
    setEditIdx(null); setEditVal("");
  };

  const addPlayer = () => {
    const n = addName.trim();
    if (!n || players.length >= 9) return;
    setPlayers(p => [...p, n]); setAddName("");
  };

  const removePlayer = (i: number) => {
    setPlayers(p => p.filter((_,j)=>j!==i));
    if (dealerIdx >= players.length-1) setDealerIdx(Math.max(0, players.length-2));
  };

  const [sb, bb] = BLIND_MAP[buyIn];
  const canStart = players.length >= 2;

  return (
    <div className="mobile-shell">
      <div className="mobile-stage flex flex-col"
        style={{background:"radial-gradient(ellipse at 50% 22%, #0d1a0f 0%, #050605 100%)"}}>

        {/* Header */}
        <div className="flex flex-col items-center"
          style={{paddingTop:"max(32px,env(safe-area-inset-top))",paddingBottom:12}}>
          <PokerChipLogo size={64}/>
          <h1 style={{fontSize:20,fontWeight:900,letterSpacing:"0.05em",marginTop:8,
            background:"linear-gradient(135deg,#c4b5fd,#818cf8)",
            WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
            HOLDEM' DEALER
          </h1>
          <p style={{fontSize:9,color:"#3f3f46",marginTop:2,letterSpacing:"0.08em"}}>Made with ♥ by Shreyas</p>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 space-y-5 pb-4">

          {/* ── Player strips ── */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.12em",color:"#52525b"}}>
                Players ({players.length}/9)
              </span>
              <span style={{fontSize:9,color:"#3f3f46"}}>Tap name to edit · ⓓ = Dealer</span>
            </div>

            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {players.map((name,i)=>(
                  <motion.div key={`slip-${i}-${name}`}
                    initial={{opacity:0,x:36,scale:0.96}}
                    animate={{opacity:1,x:0,scale:1}}
                    exit={{opacity:0,x:36,scale:0.9}}
                    transition={{type:"spring",stiffness:420,damping:30,delay:i*0.03}}
                    style={{
                      display:"flex",alignItems:"center",gap:10,
                      borderRadius:12,padding:"9px 11px",
                      background:"linear-gradient(135deg,rgba(18,18,26,0.97),rgba(12,12,18,0.97))",
                      borderTop:"1px solid rgba(60,60,80,0.5)",
                      borderRight:"1px solid rgba(60,60,80,0.5)",
                      borderBottom:"1px solid rgba(40,40,60,0.5)",
                      borderLeft:`3px solid ${SEAT_STRIP_COLORS[i%SEAT_STRIP_COLORS.length]}`,
                      boxShadow:i===dealerIdx?"0 0 14px rgba(251,191,36,0.1), inset 0 1px 0 rgba(255,255,255,0.03)":"inset 0 1px 0 rgba(255,255,255,0.02)",
                    }}>
                    {/* Seat badge */}
                    <div style={{
                      width:22,height:22,borderRadius:"50%",flexShrink:0,fontWeight:900,fontSize:10,
                      color:"#fff",display:"grid",placeItems:"center",
                      background:`radial-gradient(circle at 40% 35%,${SEAT_STRIP_COLORS[i%SEAT_STRIP_COLORS.length]},${SEAT_STRIP_COLORS[i%SEAT_STRIP_COLORS.length]}88)`,
                      boxShadow:`0 1px 4px ${SEAT_STRIP_COLORS[i%SEAT_STRIP_COLORS.length]}66`,
                    }}>{i+1}</div>

                    {/* Name / inline edit */}
                    {editIdx===i ? (
                      <input autoFocus style={{fontSize:15}}
                        value={editVal} onChange={e=>setEditVal(e.target.value)}
                        onBlur={commitEdit} onKeyDown={e=>e.key==="Enter"&&commitEdit()}
                        className="flex-1 bg-transparent text-sm font-semibold text-white border-b border-violet-400 outline-none py-0.5"/>
                    ) : (
                      <button onClick={()=>{setEditIdx(i);setEditVal(name);}}
                        className="flex-1 text-left text-sm font-bold text-zinc-100 truncate">
                        {name}
                      </button>
                    )}

                    {/* Dealer puck toggle */}
                    <motion.button
                      whileTap={{scale:0.88}}
                      onClick={()=>setDealerIdx(i)}
                      title="Set as dealer"
                      style={{
                        width:28,height:28,borderRadius:"50%",flexShrink:0,
                        fontSize:9,fontWeight:900,display:"grid",placeItems:"center",
                        background: i===dealerIdx
                          ? "radial-gradient(circle at 40% 35%,#fbbf24,#d97706)"
                          : "rgba(50,50,70,0.6)",
                        border: i===dealerIdx
                          ? "2px solid rgba(253,230,138,0.7)"
                          : "2px solid rgba(70,70,100,0.5)",
                        color: i===dealerIdx ? "#1a0a00" : "rgba(160,160,180,0.45)",
                        boxShadow: i===dealerIdx ? "0 0 12px rgba(251,191,36,0.45)" : "none",
                      }}>D</motion.button>

                    {/* Remove */}
                    {players.length > 2 && (
                      <motion.button whileTap={{scale:0.85}}
                        onClick={()=>removePlayer(i)}
                        style={{
                          width:22,height:22,borderRadius:"50%",flexShrink:0,
                          background:"rgba(120,20,20,0.3)",
                          border:"1px solid rgba(200,60,60,0.3)",
                          color:"#f87171",fontSize:15,fontWeight:900,
                          display:"grid",placeItems:"center",lineHeight:1,
                        }}>×</motion.button>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Add player row */}
            {players.length < 9 && (
              <motion.div initial={{opacity:0}} animate={{opacity:1}}
                className="mt-2.5 flex gap-2">
                <input ref={addRef} style={{fontSize:16}}
                  value={addName} onChange={e=>setAddName(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addPlayer()}
                  placeholder="Add player…"
                  className="flex-1 rounded-xl border border-dashed border-zinc-700/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-300 placeholder-zinc-700 focus:border-violet-500 focus:outline-none"/>
                <motion.button whileTap={{scale:0.9}} onClick={addPlayer}
                  disabled={!addName.trim()}
                  className="rounded-xl border border-violet-700/50 bg-violet-800/30 px-4 py-2 text-sm font-black text-violet-300 disabled:opacity-30">
                  +
                </motion.button>
              </motion.div>
            )}
          </div>

          {/* ── Buy-in selector ── */}
          <div>
            <span style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.12em",color:"#52525b",display:"block",marginBottom:8}}>
              Buy-in chips
            </span>
            <div className="grid grid-cols-3 gap-2.5">
              {BUY_IN_OPTIONS.map(amt=>{
                const [s,b] = BLIND_MAP[amt];
                const sel = amt===buyIn;
                return (
                  <motion.button key={amt} whileTap={{scale:0.94}}
                    onClick={()=>setBuyIn(amt)}
                    style={{
                      borderRadius:14,padding:"12px 4px",
                      border:`1.5px solid ${sel?"rgba(124,58,237,0.65)":"rgba(50,50,70,0.6)"}`,
                      background: sel
                        ? "linear-gradient(145deg,rgba(109,40,217,0.4),rgba(67,20,180,0.3))"
                        : "rgba(12,12,18,0.8)",
                      boxShadow: sel ? "0 0 14px rgba(124,58,237,0.22), inset 0 1px 0 rgba(255,255,255,0.06)" : "none",
                    }}>
                    <div style={{fontSize:22,fontWeight:900,color:sel?"#c4b5fd":"#52525b"}}>{amt}</div>
                    <div style={{fontSize:9,fontWeight:600,color:sel?"#a78bfa":"#3f3f46",marginTop:2}}>SB {s} · BB {b}</div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* ── Dealer & blinds info strip ── */}
          <motion.div layout
            className="flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{
              background:"rgba(14,10,0,0.7)",
              border:"1px solid rgba(251,191,36,0.18)",
              boxShadow:"inset 0 1px 0 rgba(251,191,36,0.05)",
            }}>
            <div style={{
              width:34,height:34,borderRadius:"50%",flexShrink:0,
              background:"radial-gradient(circle at 40% 35%,#fbbf24,#b45309)",
              display:"grid",placeItems:"center",fontSize:10,fontWeight:900,color:"#1a0800",
              boxShadow:"0 0 14px rgba(251,191,36,0.35)",
            }}>D</div>
            <div className="flex-1 min-w-0">
              <p style={{fontSize:12,fontWeight:800,color:"#fef3c7",margin:0}}>
                {players[dealerIdx]??"-"} <span style={{color:"#78716c",fontWeight:500}}>is the Dealer</span>
              </p>
              <p style={{fontSize:9,color:"#78716c",margin:0,marginTop:1}}>
                SB → {players[(dealerIdx+1)%players.length]??"-"} &nbsp;·&nbsp;
                BB → {players[(dealerIdx+2)%players.length]??"-"} &nbsp;·&nbsp;
                Blinds {sb}/{bb}
              </p>
            </div>
          </motion.div>
        </div>

        {/* Start button */}
        <div className="px-4" style={{paddingBottom:"max(18px,env(safe-area-inset-bottom))"}}>
          <motion.button whileTap={{scale:0.97}} onClick={()=>{
            if (!canStart) return;
            setup({playerNames:players,buyIn,dealerIndex:Math.min(dealerIdx,players.length-1),smallBlind:sb,bigBlind:bb});
          }} disabled={!canStart}
            className="w-full rounded-2xl py-4 text-base font-black shadow-xl active:shadow-none disabled:opacity-40"
            style={{
              background:"linear-gradient(135deg,#7c3aed,#4f46e5)",
              border:"1px solid rgba(167,139,250,0.35)",
              boxShadow:"0 6px 24px rgba(124,58,237,0.4)",
              color:"#fff",letterSpacing:"0.04em",
            }}>
            Deal  🎰
          </motion.button>
        </div>
      </div>
    </div>
  );
};

// ─── Shreyas toast (pot win / re-buy events) ──────────────────────────────────
const ShreyasToast = ({ message, visible }: { message: string; visible: boolean }) => (
  <AnimatePresence>
    {visible && (
      <motion.div
        initial={{y:-44,opacity:0,scale:0.88}}
        animate={{y:0,opacity:1,scale:1}}
        exit={{y:-36,opacity:0,scale:0.92}}
        transition={{type:"spring",stiffness:420,damping:24}}
        style={{
          position:"absolute",
          top:"max(54px, calc(env(safe-area-inset-top) + 42px))",
          left:"50%",transform:"translateX(-50%)",
          zIndex:90,whiteSpace:"nowrap",
          display:"flex",alignItems:"center",gap:8,
          borderRadius:999,padding:"7px 18px",
          background:"linear-gradient(135deg,rgba(28,10,58,0.98),rgba(18,6,42,0.98))",
          border:"1px solid rgba(124,58,237,0.55)",
          boxShadow:"0 4px 28px rgba(124,58,237,0.38),inset 0 1px 0 rgba(255,255,255,0.07)",
        }}>
        <span style={{fontSize:11,fontWeight:900,color:"#c4b5fd",letterSpacing:"0.06em"}}>
          {message}
        </span>
        <span style={{fontSize:8,color:"rgba(124,58,237,0.7)",fontWeight:700,letterSpacing:"0.14em"}}>
          ♠ SHREYAS
        </span>
      </motion.div>
    )}
  </AnimatePresence>
);

// ─── Persistent watermark ─────────────────────────────────────────────────────
const ShreyasWatermark = () => (
  <div style={{
    position:"absolute",bottom:72,right:6,zIndex:5,
    pointerEvents:"none",opacity:0.2,
    display:"flex",alignItems:"center",gap:3,
    borderRadius:999,padding:"2px 7px",
    background:"rgba(124,58,237,0.1)",
    border:"1px solid rgba(124,58,237,0.2)",
  }}>
    <span style={{fontSize:8,fontWeight:800,color:"#c4b5fd",letterSpacing:"0.1em"}}>♠ SHREYAS</span>
  </div>
);

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { game, runVoiceText, actionCall, actionCheck, actionFold, actionRaiseTo, actionAllIn, undo, nextRound } =
    useGameStore();

  // Splash screen
  const [showSplash, setShowSplash] = useState(true);

  // Toast (Shreyas branding events)
  const [toastMsg, setToastMsg]       = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prevWinners = useRef<string[]>([]);

  const showToast = (msg: string) => {
    clearTimeout(toastTimer.current);
    setToastMsg(msg); setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2800);
  };

  // Detect pot wins → toast
  useEffect(() => {
    if (!game) return;
    const curr = game.winners;
    if (curr.length > 0 && curr.join(",") !== prevWinners.current.join(",")) {
      const names = curr.map(id => game.players.find(p => p.id === id)?.name ?? "").filter(Boolean);
      showToast(`🏆 ${names.join(" & ")} wins!`);
    }
    prevWinners.current = curr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.winners]);

  // Voice state — a single boolean "active" avoids flicker
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState("");
  const [liveText, setLiveText] = useState("");
  const [transcriptHistory, setTranscriptHistory] = useState<string[]>([]);
  const [debugLog, setDebugLog] = useState<VoiceDebugEvent[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [economyOpen, setEconomyOpen] = useState(false);
  const [textCmd, setTextCmd] = useState("");

  const listenerRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Create the listener as soon as we know speech is supported (once per game session)
  useEffect(() => {
    if (!game || !isVoiceSupported()) return;

    const listener = createVoiceListener(
      // Final transcript
      (t) => {
        if (!mountedRef.current) return;
        setTranscriptHistory((h) => [t, ...h].slice(0, 8));
        setLiveText("");
        runVoiceText(t);
      },
      // Interim (live) text
      (t) => { if (mountedRef.current) setLiveText(t); },
      // Surface error to UI (only unrecoverable / notable ones)
      (msg) => { if (mountedRef.current) setMicError(msg); },
      // Debug event stream
      (ev) => {
        if (!mountedRef.current) return;
        setDebugLog((prev) => [ev, ...prev].slice(0, 40));
      },
    );
    if (!listener) return;

    listenerRef.current = listener;
    if (!game.voiceMuted) {
      listener.start();
      setMicActive(true);
    }

    return () => {
      listener.stop();
      listenerRef.current = null;
      setMicActive(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.listeningSupported]);

  // Mute / unmute without recreating the listener
  useEffect(() => {
    if (!listenerRef.current || !game) return;
    if (game.voiceMuted) {
      listenerRef.current.stop();
      setMicActive(false);
    } else {
      listenerRef.current.start();
      setMicActive(true);
    }
  }, [game?.voiceMuted]);

  if (showSplash) {
    return <SplashScreen onDone={() => setShowSplash(false)} />;
  }

  if (!game) {
    return <SetupScreen />;
  }

  // Derived state
  const statuses = game.players.map((p) => p.status);
  const sbIdx = nextActive(statuses, game.dealerIndex);
  const bbIdx = nextActive(statuses, sbIdx);
  const roleFor = (i: number) => i === game.dealerIndex ? "D" : i === sbIdx ? "SB" : i === bbIdx ? "BB" : "";

  const currentPlayer = game.phase === "betting" ? game.players[game.turnIndex] : undefined;
  const owed = currentPlayer
    ? Math.max(0, game.betting.currentBet - (game.contributions[currentPlayer.id] ?? 0))
    : 0;
  const canCall = !!currentPlayer && owed > 0;
  const canCheck = !!currentPlayer && owed === 0;
  const inBetting = game.phase === "betting";

  // During flop reveal: pendingBoardCards counts down 3→2→1 while street is still "preflop"
  const flopRevealIndex = game.street === "preflop" && game.phase === "awaiting-board"
    ? 3 - game.pendingBoardCards + 1  // 1, 2, or 3
    : 0;
  const waitLabel =
    game.phase !== "awaiting-board" ? ""
    : game.street === "preflop"
      ? `Say flop card ${flopRevealIndex} of 3`
      : game.street === "flop" ? "Say the turn card"
      : "Say the river card";

  // Showdown helpers
  const nextRevealId = game.phase === "showdown"
    ? game.showdownOrder.find((id) => !game.showdownRevealedIds.includes(id))
    : undefined;

  // How many face-down backs to show while the flop is being revealed one by one
  const flopPendingSlots =
    game.phase === "awaiting-board" && game.street === "preflop"
      ? game.pendingBoardCards
      : 0;

  // Chip fly animation reference point
  const chipIdx = game.chipAnimation ? game.players.findIndex((p) => p.id === game.chipAnimation?.playerId) : -1;
  const chipPt = chipIdx >= 0 ? seatXY(chipIdx, game.players.length, 130) : { x: 0, y: 0 };

  return (
    <div className="mobile-shell">
      <div className="mobile-stage relative overflow-hidden text-zinc-100">
        {/* Background — subtle dark green ambiance, no neon */}
        <div className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse at 50% 32%, rgba(10,55,20,0.18), transparent 58%)" }} />

        {/* ── Shreyas branding overlays ── */}
        <ShreyasToast message={toastMsg} visible={toastVisible} />
        <ShreyasWatermark />

        <div className="relative z-10 flex h-full flex-col overflow-hidden">

          {/* ── Status bar — safe area for iOS PWA notch ── */}
          <div className="flex shrink-0 items-center justify-between px-4 pb-1"
            style={{ paddingTop: "max(14px, env(safe-area-inset-top))" }}>
            <span className="rounded-full border border-zinc-700/70 bg-zinc-900/70 px-3 py-1 text-xs text-zinc-300">
              Hand <strong className="text-violet-300">{game.handNumber}</strong>
            </span>
            <span className="rounded-full border border-zinc-700/70 bg-zinc-900/70 px-3 py-1 text-xs font-bold uppercase tracking-wide text-zinc-200">
              {game.street}
            </span>
            {/* Mic pill — single stable state, no flicker */}
            <button
              onClick={() => runVoiceText(game.voiceMuted ? "unmute" : "mute")}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition
                ${micActive && !game.voiceMuted
                  ? "border-emerald-500/50 bg-emerald-900/30 text-emerald-300"
                  : "border-zinc-700 bg-zinc-900/70 text-zinc-500"}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${micActive && !game.voiceMuted ? "animate-pulse bg-emerald-400" : "bg-zinc-600"}`} />
              {game.voiceMuted ? "Muted" : micActive ? "Listening" : "Mic off"}
            </button>
          </div>

          {/* ── Table section — flex-1, centered ── */}
          <div className="flex flex-1 items-center justify-center py-2">
            {/* Table — 330px keeps side players within safe bounds on any phone */}
            <div className="relative h-[330px] w-[330px]">
              {/* Rail — warm wood gradient */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  width: 248, height: 248,
                  background: "radial-gradient(ellipse at 42% 33%, #5a3218, #2a1508)",
                  boxShadow: "0 6px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07)",
                }} />
              {/* Felt — realistic dark baize */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  width: 224, height: 224,
                  background: "radial-gradient(ellipse at 44% 40%, #1c5c36, #0a2c1c 74%)",
                  boxShadow: "inset 0 8px 32px rgba(0,0,0,0.55), inset 0 -4px 12px rgba(0,0,0,0.3)",
                }} />

              {/* Center content */}
              <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5">
                <CommunityCards cards={game.communityCards} pendingSlots={flopPendingSlots} />
                {game.phase === "showdown" ? (
                  <ShowdownCenter
                    players={game.players}
                    showdownOrder={game.showdownOrder}
                    showdownRevealedIds={game.showdownRevealedIds}
                    nextRevealId={nextRevealId}
                    showdownHandResults={game.showdownHandResults}
                    winners={game.winners}
                    pot={game.pot}
                  />
                ) : (
                  <PotDisplay pot={game.pot} pots={game.pots} />
                )}
              </div>

              {/* Players */}
              {game.players.map((p, idx) => (
                <PlayerSeat
                  key={p.id}
                  name={p.name} chips={p.chips} status={p.status}
                  isTurn={inBetting && idx === game.turnIndex}
                  role={roleFor(idx)}
                  seatIdx={idx} total={game.players.length}
                  owed={inBetting && idx === game.turnIndex ? owed : 0}
                  hand={p.hand}
                  isRevealTurn={p.id === nextRevealId}
                  hasRevealed={game.showdownRevealedIds.includes(p.id)}
                  isWinner={game.winners.includes(p.id)}
                  handName={game.showdownHandResults[p.id]}
                />
              ))}

              {/* Chip fly animation */}
              <AnimatePresence>
                {game.chipAnimation && (
                  <motion.div
                    key={game.chipAnimation.id}
                    initial={game.chipAnimation.type === "to-pot" ? { x: chipPt.x, y: chipPt.y, scale: 1.1, opacity: 1 } : { x: 0, y: 0, scale: 1.2, opacity: 1 }}
                    animate={game.chipAnimation.type === "to-pot" ? { x: 0, y: 0, scale: 0.7, opacity: 0 } : { x: chipPt.x, y: chipPt.y, scale: 0.7, opacity: 0 }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                    className="absolute left-1/2 top-1/2 z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-100/80 bg-amber-300 shadow-lg shadow-amber-300/50"
                  />
                )}
              </AnimatePresence>

              {/* Awaiting board overlay — inside table only */}
              <AnimatePresence>
                {game.phase === "awaiting-board" && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 z-30 flex items-center justify-center rounded-full"
                  >
                    <div className="rounded-2xl border border-violet-300/25 bg-zinc-950/90 px-5 py-3 text-center shadow-2xl backdrop-blur">
                      <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-violet-400/60 border-t-transparent" />
                      <p className="text-sm font-bold text-violet-100">{waitLabel}</p>
                      <p className="mt-0.5 text-[10px] text-zinc-400">
                        {game.street === "preflop"
                          ? "One card at a time — e.g. Jack of Spades"
                          : "e.g. Ace of Hearts"}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </div>

          {/* ── Log ── */}
          <div className="mx-4 shrink-0 overflow-hidden rounded-xl border border-zinc-800/50 bg-zinc-950/50 px-3 py-2">
            {game.log.slice(0, 2).map((entry, i) => (
              <p key={`${entry}-${i}`} className={`truncate text-[11px] leading-5 ${i === 0 ? "text-zinc-200" : "text-zinc-600"}`}>
                {entry}
              </p>
            ))}
            {(game.lastError || micError) && (
              <p className="truncate text-[10px] leading-4 text-rose-400">{game.lastError || micError}</p>
            )}
          </div>

          {/* ── Text command fallback bar ── */}
          <form
            className="mx-4 mt-2 shrink-0 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const cmd = textCmd.trim();
              if (!cmd) return;
              setTranscriptHistory((h) => [cmd, ...h].slice(0, 8));
              runVoiceText(cmd);
              setTextCmd("");
            }}
          >
            <input
              className="min-w-0 flex-1 rounded-xl border border-zinc-700/60 bg-zinc-900/80 px-3 py-2 text-zinc-100 placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
              style={{ fontSize: 16 }}
              placeholder='Type command: call · check · fold · raise 20 · Ace of Spades…'
              value={textCmd}
              onChange={(e) => setTextCmd(e.target.value)}
            />
            <button
              type="submit"
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow shadow-violet-600/30 hover:bg-violet-500"
            >
              Send
            </button>
          </form>

          {/* ── Action dock — safe area for iOS home indicator ── */}
          <div className="mx-3 mt-2 shrink-0"
            style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
            <div className="rounded-2xl border border-zinc-700/40 bg-zinc-950/90 px-3 py-2.5 backdrop-blur">
              {/* Row 1: game actions */}
              <div className="flex justify-around mb-2">
                <ActionBtn onClick={actionCall} label="Call" icon="🟢" disabled={!canCall} />
                <ActionBtn onClick={actionCheck} label="Check" icon="🟡" disabled={!canCheck} />
                <ActionBtn onClick={actionFold} label="Fold" icon="🔴" disabled={!inBetting} />
                <ActionBtn onClick={() => setRaiseOpen(true)} label="Raise" icon="⬆️" disabled={!inBetting} />
                <ActionBtn onClick={actionAllIn} label="All In" icon="🔥" disabled={!inBetting} />
              </div>
              {/* Row 2: controls */}
              <div className="flex justify-around">
                <ActionBtn onClick={undo} label="Undo" icon="↩️" />
                <ActionBtn onClick={() => setEconomyOpen(true)} label="Economy" icon="💰" />
                <ActionBtn onClick={() => setDebugOpen((v) => !v)} label="Voice debug" icon="🧪" />
                <ActionBtn onClick={nextRound} label="Next round" icon="⏭️" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Economy modal ── */}
        <EconomyModal open={economyOpen} onClose={() => setEconomyOpen(false)} players={game.players} buyInAmount={game.buyInAmount}
          onAfterRebuy={(name) => showToast(`💰 ${name} re-buys!`)} />

        {/* ── Raise modal ── */}
        <RaiseModal
          open={raiseOpen} onClose={() => setRaiseOpen(false)} onConfirm={actionRaiseTo}
          minRaise={game.betting.minRaiseTo} maxChips={currentPlayer?.chips ?? 0}
          currentBet={game.betting.currentBet}
        />

        {/* ── Voice debug overlay ── */}
        <AnimatePresence>
          {debugOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="absolute inset-x-3 bottom-20 z-40 rounded-2xl border border-violet-300/20 bg-black/95 p-4 text-xs backdrop-blur overflow-hidden"
            >
              <div className="mb-2.5 flex items-center justify-between">
                <span className="font-bold text-violet-200">Voice Debug</span>
                <button onClick={() => setDebugLog([])} className="rounded px-2 py-0.5 text-[10px] text-zinc-600 hover:text-zinc-300">clear</button>
                <span className={`flex items-center gap-1.5 text-[11px] ${micActive && !game.voiceMuted ? "text-emerald-300" : "text-zinc-500"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${micActive && !game.voiceMuted ? "animate-pulse bg-emerald-400" : "bg-zinc-700"}`} />
                  {micActive && !game.voiceMuted ? "Mic live" : "Mic off"}
                </span>
              </div>

              {/* Live transcript row */}
              <div className="mb-2 space-y-1 text-zinc-300">
                <div><span className="text-zinc-600">Live  → </span><span className="text-yellow-200">{liveText || "—"}</span></div>
                <div><span className="text-zinc-600">Final → </span><span className="text-emerald-200">{transcriptHistory[0] || "—"}</span></div>
                {transcriptHistory[0] && (
                  <div><span className="text-zinc-600">Parse → </span>
                    <span className="text-violet-200">{JSON.stringify(parseVoiceCommand(transcriptHistory[0]))}</span>
                  </div>
                )}
                <div className="pt-1 border-t border-zinc-800">
                  <span className="text-zinc-600">Expects → </span>
                  <span className="text-sky-200">
                    {game.phase === "awaiting-board" ? waitLabel : canCall ? `call ${owed} / raise / fold` : "check / raise / fold"}
                  </span>
                </div>
              </div>

              {/* Raw event log */}
              <div className="max-h-36 overflow-y-auto space-y-0.5 rounded-lg bg-zinc-950/80 p-2">
                {debugLog.length === 0 && (
                  <p className="text-zinc-700 italic">No events yet. Speak or use mic to generate events here.</p>
                )}
                {debugLog.slice(0, 20).map((ev, i) => {
                  const col =
                    ev.kind === "result" ? "text-emerald-300" :
                    ev.kind === "interim" ? "text-yellow-300" :
                    ev.kind === "error" ? "text-rose-400" :
                    ev.kind === "start" ? "text-sky-400" :
                    "text-zinc-500";
                  const label = ev.kind.padEnd(7);
                  const t = new Date(ev.ts).toISOString().slice(17, 23);
                  return (
                    <div key={i} className={`font-mono text-[10px] ${col}`}>
                      <span className="text-zinc-700">{t} </span>
                      <span className="text-zinc-500">[{label}] </span>
                      {ev.detail}
                    </div>
                  );
                })}
              </div>

              {/* Browser compat notice */}
              {debugLog.some(e => e.kind === "error" && e.detail === "network") && (
                <p className="mt-2 rounded bg-rose-950/50 border border-rose-800/50 px-2 py-1.5 text-[10px] text-rose-300 leading-tight">
                  ⚠ Network error: Brave/Firefox may block Google's speech servers.<br/>
                  Fix: Open in <strong>Chrome</strong>, or in Brave go to<br/>
                  <em>brave://settings/content/microphone</em> and allow this site,<br/>
                  then disable Brave Shields (lion icon) for localhost.
                </p>
              )}
              {!isVoiceSupported() && (
                <p className="mt-2 text-[10px] text-rose-400">Web Speech API not supported in this browser.</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
