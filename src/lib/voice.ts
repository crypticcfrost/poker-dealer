import type { Card, Rank, Suit } from "../types/game";

// ─── Levenshtein distance (used for fuzzy fallback matching) ──────────────────
function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : 1 + Math.min(row[j - 1], row[j], prev);
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

// ─── Transcript normaliser ────────────────────────────────────────────────────

const DIGIT_WORD: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
  "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
  "10": "ten", "11": "eleven", "12": "twelve", "13": "thirteen",
  "14": "fourteen", "15": "fifteen", "20": "twenty", "25": "twenty-five",
  "30": "thirty", "40": "forty", "50": "fifty",
};

// All known action words → canonical form, in priority order
const RAISE_ALTS = /\b(razz|raize|rayse|reise|reiz|rais|race|rice|rise|raze|rays|rase|raised|reys|raise)\b/g;
const FOLD_ALTS  = /\b(phone|phoned|fault|faught|follt|fold ed|folded|folds|fold)\b/g;
const CHECK_ALTS = /\b(chek|checked|czech|checks|chex|check)\b/g;
const CALL_ALTS  = /\b(col|called|calls|call)\b/g;

// Suit singulars → plurals + phonetic variants
const SUIT_ALTS: [RegExp, string][] = [
  [/\bclub\b/g,          "clubs"],
  [/\bheart\b/g,         "hearts"],
  [/\bdiamond\b/g,       "diamonds"],
  [/\bspade\b/g,         "spades"],
  [/\bspeeds?\b/g,       "spades"],   // "speed" → "spades"
  [/\bspaeds?\b/g,       "spades"],   // typo variant
  [/\bspays?\b/g,        "spades"],   // "spa/spay" → "spades"
  [/\bcloves?\b/g,       "clubs"],    // "clove" → "clubs"
  [/\bdymond(s)?\b/g,    "diamonds"],
  [/\bdiamon\b/g,        "diamonds"],
  [/\bdiamonds?\b/g,     "diamonds"],
  [/\bhart(s)?\b/g,      "hearts"],   // "hart" → "hearts"
];

// Rank / number phonetic alts
const RANK_ALTS: [RegExp, string][] = [
  [/\back\b/g,        "ace"],
  [/\baces\b/g,       "ace"],
  [/\bfase\b/g,       "ace"],    // "fase" → "ace"
  [/\btens\b/g,       "ten"],
  [/\btin\b/g,        "ten"],    // very common: "tin" → "ten"
  [/\bthen\b/g,       "ten"],    // "then" → "ten"
  [/\bjacks\b/g,      "jack"],
  [/\bqueens\b/g,     "queen"],
  [/\bkings\b/g,      "king"],
  [/\bfree\b/g,       "three"],  // Irish/STT: "free" → "three"
  [/\btree\b/g,       "three"],  // "tree" → "three"
  [/\bto\b/g,         "two"],
  [/\btoo\b/g,        "two"],    // "too" → "two"
  [/\bfor\b/g,        "four"],
  [/\bate\b/g,        "eight"],
  [/\bniner\b/g,      "nine"],   // NATO: "niner" → "nine"
  [/\belevan\b/g,     "eleven"], // "elevan" → "eleven"
];

/**
 * Normalise a raw STT transcript before feeding it into the command parser.
 *
 * Key fixes:
 *  1. Time-format numbers  "4:00" → "four"  (browser reads "4 of" as "4:00")
 *  2. Raise variants        rise/rice/race   → raise
 *  3. Suit singulars        club             → clubs
 *  4. Rank near-homophones  ack/ate          → ace/eight
 *  5. Fold/check/call tense folded/checked   → fold/check
 */
export function normalizeTranscript(raw: string): string {
  let t = raw.toLowerCase().trim();

  // ── 1. Time-format numbers ──────────────────────────────────────────────────
  // "4:00 clubs" is how STT hears "four of clubs" — strip the minutes
  t = t.replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h) => DIGIT_WORD[h] ?? h);

  // "5 o'clock" / "5 o clock" (another time-format variant for card ranks)
  t = t.replace(/\b(\d{1,2})\s+o'?\s*clock\b/g, (_, n) => DIGIT_WORD[n] ?? n);
  // word form: "five o'clock" → "five"
  t = t.replace(/\b(\w+)\s+o'?\s*clock\b/g, "$1");

  // ── 2. Bare digits before suits (STT may drop "of") ────────────────────────
  // "4 clubs" → "four clubs" (the regex below will accept "of"-optional)
  t = t.replace(/\b(\d{1,2})\b/g, (_, n) => DIGIT_WORD[n] ?? n);

  // ── 3. Action word normalisations ───────────────────────────────────────────
  t = t.replace(RAISE_ALTS, "raise");
  t = t.replace(FOLD_ALTS,  "fold");
  t = t.replace(CHECK_ALTS, "check");
  t = t.replace(CALL_ALTS,  "call");

  // ── 4. Suit / rank fixes ────────────────────────────────────────────────────
  for (const [re, fix] of SUIT_ALTS) t = t.replace(re, fix);
  for (const [re, fix] of RANK_ALTS) t = t.replace(re, fix);

  return t;
}

// ─── Command parser ───────────────────────────────────────────────────────────

export type VoiceCommand =
  | { type: "mute" | "unmute" | "fold" | "check" | "call" | "undo" | "next-round" | "all-in" }
  | { type: "raise"; amount: number }
  | { type: "cards"; cards: Card[] }
  | { type: "hand"; cards: Card[] }
  | { type: "unknown"; raw: string };

const rankMap: Record<string, Rank> = {
  ace: "A", king: "K", queen: "Q", jack: "J",
  ten: "10", "10": "10", nine: "9", eight: "8",
  seven: "7", six: "6", five: "5", four: "4", three: "3", two: "2",
};
const suitMap: Record<string, Suit> = {
  spades: "spades", hearts: "hearts", diamonds: "diamonds", clubs: "clubs",
};
const wordNums: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, "twenty-one": 21, "twenty-two": 22, "twenty-three": 23,
  "twenty-four": 24, "twenty-five": 25, "twenty-six": 26, "twenty-seven": 27,
  "twenty-eight": 28, "twenty-nine": 29,
  thirty: 30, "thirty-five": 35, forty: 40, "forty-five": 45,
  fifty: 50, "fifty-five": 55, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, "two hundred": 200, "three hundred": 300, "four hundred": 400,
  "five hundred": 500,
};

const parseAmount = (text: string): number => {
  // Normalise compound number spellings before anything else
  let norm = text
    .replace(/\bone.?hundred\b/g, "100")
    .replace(/\btwenty[- ]?five\b/g, "twenty-five")
    .replace(/\btwenty[- ]?one\b/g, "twenty-one")
    .replace(/\bthirty[- ]?five\b/g, "thirty-five")
    .replace(/\bforty[- ]?five\b/g, "forty-five")
    .replace(/\bfifty[- ]?five\b/g, "fifty-five");

  // Prefer the substring immediately after the action keyword (most precise)
  const afterAction = norm.match(/\b(?:raise|bet|to)\s+([\w\s-]{1,20})/);
  const haystack = afterAction ? afterAction[1].trim() + " " + norm : norm;

  // 1. Direct digit
  const digits = haystack.match(/\b(\d+)\b/);
  if (digits) return Number.parseInt(digits[1], 10);

  // 2. Word numbers — try longest match first to avoid "one" matching inside "one hundred"
  const sorted = Object.entries(wordNums).sort((a, b) => b[0].length - a[0].length);
  for (const [w, v] of sorted) {
    if (haystack.includes(w)) return v;
  }

  return NaN;
};

/**
 * Parse card mentions.
 * Accepts both "four OF clubs" and "four clubs" (STT often drops "of").
 * Also handles single-word ranks like "ten" adjacent to a suit.
 */
const parseCards = (input: string): Card[] => {
  const out: Card[] = [];
  // "of" is optional — STT drops it or replaces it with a time colon
  const re = /(ace|king|queen|jack|ten|nine|eight|seven|six|five|four|three|two)\s+(?:of\s+)?(spades|hearts|diamonds|clubs)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input.toLowerCase())) !== null) {
    out.push({ rank: rankMap[m[1]], suit: suitMap[m[2]] });
  }
  return out;
};

// ─── Fuzzy action recogniser (last-resort fallback) ──────────────────────────
// Applies Levenshtein matching to each word in the normalised text.
// Only used when all direct regex checks have already failed.

const FUZZY_ACTIONS: [string, string, number][] = [
  // [canonical, target, maxEditDist]
  ["raise", "raise", 2],
  ["fold",  "fold",  1],
  ["check", "check", 2],
  ["call",  "call",  1],
];

function fuzzyAction(text: string): string | null {
  // Skip obvious false-positives by checking word length bounds
  for (const word of text.split(/\s+/)) {
    if (word.length < 2) continue;
    for (const [canonical, target, maxDist] of FUZZY_ACTIONS) {
      if (Math.abs(word.length - target.length) <= maxDist && lev(word, target) <= maxDist) {
        return canonical;
      }
    }
  }
  return null;
}

export const parseVoiceCommand = (rawInput: string): VoiceCommand => {
  // Always normalise first — RAISE_ALTS / FOLD_ALTS / etc. are applied here
  const text = normalizeTranscript(rawInput);
  if (!text) return { type: "unknown", raw: rawInput };

  // ── Exact / regex matches (fastest, preferred) ───────────────────────────
  if (/^mute$/.test(text)) return { type: "mute" };
  if (/^unmute$/.test(text)) return { type: "unmute" };
  if (/^undo$/.test(text)) return { type: "undo" };
  if (/next.?round/.test(text)) return { type: "next-round" };

  if (/\bfold\b/.test(text)) return { type: "fold" };
  if (/\bcheck\b/.test(text)) return { type: "check" };
  if (/\bcall\b/.test(text)) return { type: "call" };
  if (/\ball.?in\b|\ballan\b|\balan\b/.test(text)) return { type: "all-in" };

  if (/\b(raise|bet)\b/.test(text)) {
    const n = parseAmount(text);
    if (Number.isFinite(n) && n > 0) return { type: "raise", amount: n };
    return { type: "unknown", raw: rawInput };
  }

  // ── Card commands ─────────────────────────────────────────────────────────
  if (text.startsWith("hand")) {
    const cards = parseCards(text.replace(/^hand\s*/, ""));
    if (cards.length === 2) return { type: "hand", cards };
  }

  const cards = parseCards(text);
  if (cards.length >= 1) return { type: "cards", cards };

  // ── Fuzzy fallback — handles slight STT mis-spellings after normalization ─
  // e.g. "raize twenty" → fuzzyAction finds "raise" → try parseAmount
  const fa = fuzzyAction(text);
  if (fa === "raise") {
    const n = parseAmount(text);
    if (Number.isFinite(n) && n > 0) return { type: "raise", amount: n };
  }
  if (fa === "fold")  return { type: "fold" };
  if (fa === "check") return { type: "check" };
  if (fa === "call")  return { type: "call" };

  return { type: "unknown", raw: rawInput };
};

// ─── iOS / Safari detection ───────────────────────────────────────────────────

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
   (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const isSafari = () =>
  typeof navigator !== "undefined" &&
  /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// ─── Speech Recognition types ─────────────────────────────────────────────────

interface WSRResult {
  readonly isFinal: boolean;
  [index: number]: { transcript: string };
}
interface WSREvent extends Event {
  readonly resultIndex: number;
  readonly results: { length: number; [index: number]: WSRResult };
}
type WSRCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((e: WSREvent) => void) | null;
  onerror: ((e: Event) => void) | null;
};

declare global {
  interface Window { SpeechRecognition?: WSRCtor; webkitSpeechRecognition?: WSRCtor; }
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface VoiceDebugEvent {
  kind: "start" | "end" | "result" | "interim" | "error";
  detail: string;
  ts: number;
}

export interface VoiceListener {
  start: () => void;
  stop: () => void;
}

export const isVoiceSupported = () =>
  typeof window !== "undefined" &&
  !!(window.SpeechRecognition || window.webkitSpeechRecognition);

// ─── Listener factory ─────────────────────────────────────────────────────────

export const createVoiceListener = (
  onTranscript: (t: string) => void,
  onInterim: (t: string) => void,
  onError: (msg: string) => void,
  onDebug?: (ev: VoiceDebugEvent) => void,
): VoiceListener | null => {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;

  const dbg = (kind: VoiceDebugEvent["kind"], detail: string) =>
    onDebug?.({ kind, detail, ts: Date.now() });

  const onIOS = isIOS();
  const onSafari = isSafari();

  const rec = new Ctor();
  rec.continuous = false;          // per-utterance: most reliable on all browsers
  // Safari / iOS: interimResults can cause duplicate final results — disable it
  rec.interimResults = !(onIOS || onSafari);
  rec.lang = "en-US";

  // Add poker-specific grammar hints to help the STT engine bias toward our vocabulary.
  // SpeechGrammarList is only supported in Chrome-family browsers; silently skip otherwise.
  try {
    type GrammarListCtor = new () => { addFromString(s: string, w: number): void };
    const GLC = (
      (window as unknown as Record<string, unknown>)["SpeechGrammarList"] ??
      (window as unknown as Record<string, unknown>)["webkitSpeechGrammarList"]
    ) as GrammarListCtor | undefined;
    if (GLC) {
      const gl = new GLC();
      gl.addFromString(
        `#JSGF V1.0;
        grammar poker;
        public <action> = call | check | fold | raise | undo | mute | unmute | next round;
        public <rank>   = ace | two | three | four | five | six | seven | eight | nine | ten | jack | queen | king;
        public <suit>   = spades | hearts | clubs | diamonds;
        public <card>   = <rank> of <suit> | <rank> <suit>;
        public <cmd>    = <action> | <card>;`,
        1,
      );
      (rec as unknown as Record<string, unknown>)["grammars"] = gl;
    }
  } catch {
    // Grammar hints not critical — continue without them
  }

  let stopped = false;
  let active = false;
  let pendingDelayMs = 150;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let networkErrorCount = 0;       // back-off escalator for network errors

  const clearTimer = () => { if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; } };

  const scheduleRestart = () => {
    if (stopped) return;
    clearTimer();
    const delay = pendingDelayMs;
    pendingDelayMs = 150;
    restartTimer = setTimeout(() => {
      if (stopped || active) return;
      try {
        rec.start();
        active = true;
        dbg("start", "auto-restart");
      } catch {
        // already running — harmless
      }
    }, delay);
  };

  rec.onstart = () => {
    active = true;
    networkErrorCount = 0;         // reset on successful start
    dbg("start", "recognition started");
  };

  rec.onresult = (e: WSREvent) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const raw = r[0]?.transcript?.trim() ?? "";
      if (!raw) continue;
      if (r.isFinal) {
        const normalised = normalizeTranscript(raw);
        dbg("result", `raw="${raw}" → norm="${normalised}"`);
        onTranscript(raw);          // pass raw; parseVoiceCommand normalises internally
      } else {
        interim += raw + " ";
      }
    }
    if (interim.trim()) {
      dbg("interim", interim.trim());
      onInterim(interim.trim());
    }
  };

  rec.onerror = (e: Event) => {
    active = false;
    const err = (e as unknown as { error: string }).error;
    dbg("error", err);

    switch (err) {
      case "no-speech":
        pendingDelayMs = onIOS ? 500 : 200;   // iOS needs a bit more breathing room
        break;

      case "aborted":
        pendingDelayMs = 0;
        break;

      case "network":
        networkErrorCount++;
        // Exponential back-off: 2s, 4s, 8s, cap at 15s
        pendingDelayMs = Math.min(2000 * Math.pow(2, networkErrorCount - 1), 15_000);
        onError(
          "Voice: network error — speech server unreachable. " +
          "On Safari/iOS ensure mic permission is granted in Settings → Safari → Microphone."
        );
        break;

      case "not-allowed":
      case "service-not-allowed":
      case "audio-capture":
        stopped = true;
        onError(
          onIOS
            ? "Mic blocked. Go to Settings → Safari → Microphone → allow this site."
            : "Mic permission denied. Allow microphone in browser site settings."
        );
        break;

      default:
        pendingDelayMs = 1000;
        onError(`Voice error: ${err}`);
    }
  };

  rec.onend = () => {
    active = false;
    dbg("end", `restart in ${pendingDelayMs}ms`);
    scheduleRestart();
  };

  return {
    start() {
      stopped = false;
      active = false;
      pendingDelayMs = 150;
      networkErrorCount = 0;
      clearTimer();
      try {
        rec.start();
        active = true;
        dbg("start", "explicit start");
      } catch {
        // already running
      }
    },
    stop() {
      stopped = true;
      clearTimer();
      active = false;
      try { rec.stop(); } catch { /* harmless */ }
      dbg("end", "manually stopped");
    },
  };
};
