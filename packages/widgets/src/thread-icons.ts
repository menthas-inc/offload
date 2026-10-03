// 037. Thread icons: the rules every surface shares.
//
// Each thread has one of seventy glyphs on a wash of one of the ten label
// hues. The list, the pick from a name, the hue, where the wash sits and the
// colours live here, so the server that picks and the three clients that draw
// cannot disagree. The order is the design's and it is the pick's order: the
// first glyph with a word in the name wins.

export interface ThreadIconWords {
  icon: string;
  words: readonly string[];
}

export const THREAD_ICONS: readonly ThreadIconWords[] = [
  { icon: "luggage", words: ["trip", "travel", "holiday", "vacation", "packing"] },
  { icon: "plane", words: ["flight", "flights", "airport"] },
  { icon: "car", words: ["car", "service", "mot", "garage"] },
  { icon: "bike", words: ["bike", "cycling", "ride"] },
  { icon: "tent", words: ["camping", "festival"] },
  { icon: "map", words: ["route", "itinerary", "city"] },
  { icon: "globe", words: ["abroad", "visa", "world"] },
  { icon: "house", words: ["flat", "home", "house", "apartment", "rent"] },
  { icon: "sofa", words: ["furniture", "living", "move", "moving"] },
  { icon: "key", words: ["keys", "landlord", "lease"] },
  { icon: "wrench", words: ["repair", "fix", "plumber"] },
  { icon: "hammer", words: ["build", "diy", "shelf", "bookshelf"] },
  { icon: "paintbrush", words: ["paint", "decorate"] },
  { icon: "sprout", words: ["garden", "balcony", "plants"] },
  { icon: "flower-2", words: ["flowers", "wedding"] },
  { icon: "tree-pine", words: ["christmas", "hike", "forest"] },
  { icon: "stethoscope", words: ["dentist", "doctor", "health", "insurance", "clinic"] },
  { icon: "pill", words: ["meds", "pharmacy", "prescription"] },
  { icon: "heart-pulse", words: ["fitness", "heart"] },
  { icon: "dumbbell", words: ["gym", "workout"] },
  { icon: "footprints", words: ["run", "running", "marathon", "walk"] },
  { icon: "apple", words: ["diet", "groceries"] },
  { icon: "utensils", words: ["dinner", "recipes", "restaurant", "food"] },
  { icon: "coffee", words: ["coffee", "cafe"] },
  { icon: "wine", words: ["wine", "drinks", "bar"] },
  { icon: "cake", words: ["birthday", "cake", "party"] },
  { icon: "gift", words: ["gift", "gifts", "present", "presents"] },
  { icon: "party-popper", words: ["celebration", "party"] },
  { icon: "baby", words: ["baby", "kids", "nursery"] },
  { icon: "dog", words: ["dog", "puppy", "vet"] },
  { icon: "cat", words: ["cat"] },
  { icon: "graduation-cap", words: ["school", "course", "study", "university"] },
  { icon: "book-open", words: ["books", "reading", "read"] },
  { icon: "briefcase", words: ["work", "job", "office"] },
  { icon: "laptop", words: ["computer", "tech"] },
  { icon: "receipt", words: ["taxes", "tax", "receipts", "expenses"] },
  { icon: "piggy-bank", words: ["savings", "budget"] },
  { icon: "wallet", words: ["money", "spending"] },
  { icon: "landmark", words: ["bank", "mortgage", "council"] },
  { icon: "shopping-cart", words: ["shopping", "buy"] },
  { icon: "shirt", words: ["clothes", "wardrobe"] },
  { icon: "music", words: ["music", "concert", "band"] },
  { icon: "camera", words: ["photos", "photography"] },
  { icon: "gamepad-2", words: ["games", "gaming"] },
  { icon: "film", words: ["movies", "films", "watch"] },
  { icon: "palette", words: ["art", "design"] },
  { icon: "newspaper", words: ["later", "articles", "news"] },
  { icon: "mountain", words: ["ski", "climbing", "mountains"] },
  { icon: "waves", words: ["beach", "surf", "swim"] },
  { icon: "sparkles", words: ["ideas"] },
  { icon: "train-front", words: ["train", "rail"] },
  { icon: "ship", words: ["ferry", "cruise", "boat"] },
  { icon: "hotel", words: ["hotel", "stay"] },
  { icon: "bed", words: ["bedroom", "sleep"] },
  { icon: "lamp", words: ["lighting", "lamps"] },
  { icon: "fish", words: ["fishing", "aquarium"] },
  { icon: "bird", words: ["birds", "birding"] },
  { icon: "leaf", words: ["compost", "nature"] },
  { icon: "sun", words: ["summer"] },
  { icon: "snowflake", words: ["winter"] },
  { icon: "umbrella", words: ["rain"] },
  { icon: "heart", words: ["dating", "love"] },
  { icon: "users", words: ["family", "friends", "club"] },
  { icon: "mic", words: ["podcast", "talk"] },
  { icon: "pen-tool", words: ["writing", "blog", "novel"] },
  { icon: "code", words: ["code", "dev", "app"] },
  { icon: "rocket", words: ["launch", "startup", "project"] },
  { icon: "trophy", words: ["league", "competition"] },
  { icon: "ticket", words: ["tickets", "show", "event"] },
  { icon: "calendar-heart", words: ["anniversary"] },
];

export const THREAD_ICON_NAMES: readonly string[] = THREAD_ICONS.map((one) => one.icon);

/** What a thread has when nothing in its name says otherwise. */
export const DEFAULT_THREAD_ICON = "lasso";

const KNOWN = new Set([...THREAD_ICON_NAMES, DEFAULT_THREAD_ICON]);

/** One of the seventy, or lasso. Anything else is not drawn and not stored. */
export const isThreadIcon = (name: string): boolean => KNOWN.has(name);

/** The ten hues by name, in `--label-N` order, for a screen reader. */
export const HUE_NAMES: readonly string[] = ["Blue", "Pink", "Green", "Purple", "Orange", "Teal", "Magenta", "Olive", "Indigo", "Emerald"];

/** The glyph a name picks, or null when none of its words is in the list. A
 *  plural s is tolerated both ways, so gift finds gifts and recipes finds
 *  recipe. Whole words only: carpet is not a car. */
export function pickThreadIcon(name: string): string | null {
  const tokens = new Set(name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  if (tokens.size === 0) return null;
  for (const { icon, words } of THREAD_ICONS) {
    for (const word of words) {
      if (tokens.has(word) || tokens.has(`${word}s`)) return icon;
      if (word.endsWith("s") && tokens.has(word.slice(0, -1))) return icon;
    }
  }
  return null;
}

/** The hue least used among the hues given, ties to the lowest number. */
export function leastUsedHue(used: readonly number[]): number {
  const counts = new Array<number>(11).fill(0);
  for (const hue of used) if (Number.isInteger(hue) && hue >= 1 && hue <= 10) counts[hue]!++;
  let best = 1;
  for (let hue = 2; hue <= 10; hue++) if (counts[hue]! < counts[best]!) best = hue;
  return best;
}

/** A thread's seed: the last eight hex digits of its id. A uuid v7 leads with
 *  its timestamp, so the tail is the part that differs between two threads
 *  made together. An id that is not hex seeds 0. */
export function threadSeed(id: string): number {
  const hex = id.replace(/-/g, "").slice(-8);
  return /^[0-9a-f]{8}$/i.test(hex) ? parseInt(hex, 16) : 0;
}

/** Where the texture sits behind a thread's icon: its position in percent and
 *  its turn in degrees. The same thread always washes the same. */
export function threadWash(seed: number): { x: number; y: number; angle: number } {
  return { x: seed % 100, y: (seed >>> 7) % 100, angle: (seed >>> 3) % 360 };
}

/** How much of the hue goes into each part, per theme: the ground is the hue
 *  mixed into the page, the glyph the hue taken toward black in light and
 *  white in dark. The web writes these into `color-mix`; the phones mix by
 *  hand with `threadIconColors`. */
export const THREAD_ICON_MIX = {
  light: { ground: 0.2, glyph: 0.88 },
  dark: { ground: 0.34, glyph: 0.62 },
  ring: 0.18,
} as const;

type Triple = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbOf(hex: string): Triple {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function oklchOf(hex: string): Triple {
  const [r, g, b] = rgbOf(hex).map((c) => toLinear(c / 255)) as Triple;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180) / Math.PI];
}

function hexOf([L, C, h]: Triple): string {
  const A = C * Math.cos((h * Math.PI) / 180);
  const B = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const linear: Triple = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const byte = (c: number) => Math.round(Math.min(1, Math.max(0, toGamma(c))) * 255);
  return `#${linear.map((c) => byte(c).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** `color-mix(in oklch, a share, b)` by hand, as hex. A colour with no chroma
 *  has no hue of its own and takes the other's, as CSS does, which is what
 *  keeps a blue mixed into white a pale blue. */
export function mixOklch(a: string, b: string, share: number): string {
  if (share >= 1) return a.toUpperCase();
  if (share <= 0) return b.toUpperCase();
  return mixed(oklchOf(a), oklchOf(b), share);
}

const BLACK: Triple = [0, 0, 0];
const WHITE: Triple = [1, 0, 0];

function mixed([l1, c1, h1]: Triple, [l2, c2, h2]: Triple, share: number): string {
  const GREY = 1e-4;
  let from = c1 < GREY ? h2 : h1;
  let to = c2 < GREY ? h1 : h2;
  if (to - from > 180) from += 360;
  else if (to - from < -180) to += 360;
  return hexOf([l1 * share + l2 * (1 - share), c1 * share + c2 * (1 - share), from * share + to * (1 - share)]);
}

export interface ThreadIconColors {
  ground: string;
  glyph: string;
  ring: string;
}

/** The three colours of a thread's icon from its hue, for a surface that has
 *  no `color-mix`. `page` is what the hue is mixed into: the raised surface in
 *  light, the page in dark, as hex from the tokens. */
export function threadIconColors(hue: string, theme: "light" | "dark", page: string): ThreadIconColors {
  const mix = THREAD_ICON_MIX[theme];
  const [r, g, b] = rgbOf(hue);
  return {
    ground: mixOklch(hue, page, mix.ground),
    glyph: mixed(oklchOf(hue), theme === "light" ? BLACK : WHITE, mix.glyph),
    ring: `rgba(${r}, ${g}, ${b}, ${THREAD_ICON_MIX.ring})`,
  };
}

/** A thread's name and look, as Edit thread reads and writes them. */
export interface ThreadLook {
  name: string;
  icon: string;
  hue: number;
  iconSetBy: "offload" | "person";
}

/** What Edit thread holds while it is open. `icon` is null until the person
 *  touches the grid. */
export interface ThreadDraft {
  name: string;
  icon: string | null;
  hue?: number;
}

/** The icon Edit thread shows: the one picked in the grid, or, while the pick
 *  is still offload's, the one the server would pick for the name as typed. */
export function previewThreadIcon(original: ThreadLook, draft: ThreadDraft): string {
  if (draft.icon) return draft.icon;
  const name = draft.name.trim();
  if (original.iconSetBy !== "offload" || !name || name === original.name) return original.icon;
  return pickThreadIcon(name) ?? original.icon;
}

/** What Save sends: only what changed, or null when nothing did or the name
 *  is empty. A new hue makes the pick the person's, after which the server
 *  picks no icon for a rename, so the previewed icon goes with it. */
export function threadChange(
  original: ThreadLook,
  draft: ThreadDraft & { hue: number },
): { name?: string; icon?: string; hue?: number } | null {
  const name = draft.name.trim();
  if (!name) return null;
  const change: { name?: string; icon?: string; hue?: number } = {};
  if (name !== original.name) change.name = name;
  if (draft.icon && draft.icon !== original.icon) change.icon = draft.icon;
  if (draft.hue !== original.hue) {
    change.hue = draft.hue;
    const shown = previewThreadIcon(original, draft);
    if (shown !== original.icon) change.icon = shown;
  }
  return Object.keys(change).length > 0 ? change : null;
}

/** The thread as a client draws it at the press of Save, before the server
 *  answers: what the sheet showed, and the pick the person's once an icon or
 *  a hue was sent. */
export function threadLookAfter(
  before: ThreadLook,
  change: { name?: string; icon?: string; hue?: number },
  shown: { name: string; icon: string; hue: number },
): ThreadLook {
  return { ...shown, iconSetBy: change.icon !== undefined || change.hue !== undefined ? "person" : before.iconSetBy };
}

/** A glyph's name for a screen reader: `tree-pine` is Tree pine. */
export function threadIconLabel(icon: string): string {
  const words = icon.replace(/-\d+$/, "").replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
