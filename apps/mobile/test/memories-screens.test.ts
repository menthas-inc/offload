// 040 the Memories tab on the phones: what the screens draw, read from their
// source, since these tests render nothing. The decisions are in
// `lib/memories.ts` and tested there; this holds the screens to drawing them,
// and to the shared module's words rather than a second copy.
//
// AC-10 the tab and the redirect; AC-11 the states; AC-12 the rows; AC-13
// search; AC-14 the editor; AC-15 the swipe; AC-16 the sheet.

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MEMORY_COPY, MEMORY_KINDS } from "@offload/widgets";

const path = (file: string): URL => new URL(`../${file}`, import.meta.url);
// Empty when missing, so each test fails on its own claim rather than the
// file failing to load.
const read = (file: string): string => (existsSync(path(file)) ? readFileSync(path(file), "utf8") : "");

const SCREEN = "components/screens/Memories.tsx";
const ROW = "components/memories/MemoryListRow.tsx";
const EDITOR = "components/memories/MemoryEditor.tsx";
const MAP = "components/memories/MemoriesMap.tsx";
const FILES = [SCREEN, ROW, EDITOR, MAP, "lib/memories.ts", "app/(tabs)/memories.tsx", "app/notes.tsx"];

describe("the tab (AC-10)", () => {
  it("is the memories route, and notes is gone from the tabs", () => {
    expect(existsSync(path("app/(tabs)/notes.tsx"))).toBe(false);
    expect(read("app/(tabs)/memories.tsx")).toMatch(/export \{ default \} from "\.\.\/\.\.\/components\/screens\/Memories";/);
    expect(read("app/(tabs)/_layout.tsx")).toMatch(/<Tabs\.Screen name="memories" \/>/);
    expect(read("app/(tabs)/_layout.tsx")).not.toMatch(/name="notes"/);
    expect(existsSync(path("components/screens/Notes.tsx"))).toBe(false);
  });

  it("sends anybody holding /notes to /memories", () => {
    const source = read("app/notes.tsx");
    expect(source).toMatch(/import \{ Redirect \} from "expo-router";/);
    expect(source).toMatch(/<Redirect href="\/memories" \/>/);
  });

  it("reads Memories with cloudy on the plate, and the plate belongs on it", () => {
    const shell = read("components/shell/Shell.tsx");
    expect(shell).toMatch(/const TABS = \["\/today", "\/threads", "\/search", "\/memories"\];/);
    expect(shell).toMatch(/key: "memories",\s*label: "Memories",\s*icon: "cloudy",\s*active: pathname === "\/memories",\s*onPress: \(\) => go\("\/memories"\)/);
    expect(shell).not.toMatch(/"\/notes"/);
    expect(read("components/shell/RecordArrival.tsx")).toMatch(/const HOME = \["\/today", "\/threads", "\/search", "\/memories"\];/);
  });
});

describe("the screen (AC-11 to AC-13)", () => {
  const source = read(SCREEN);

  it("draws what lib/memories decides", () => {
    expect(source).toMatch(/memoriesScreen\(/);
    expect(source).toMatch(/listView\(/);
  });

  it("titles the bar Memories where the other tabs draw the wordmark", () => {
    expect(source).toMatch(/\{MEMORY_COPY\.title\}/);
    expect(source).not.toMatch(/<Logo\b/);
  });

  it("is one spinner while loading, with no skeleton", () => {
    expect(source).toMatch(/screen\.state === "loading"/);
    expect(source).toMatch(/<Spinner \/>/);
  });

  it("offers Try again beside a failed read", () => {
    expect(source).toMatch(/\{screen\.line\}/);
    expect(source).toMatch(/\{screen\.retry\}/);
  });

  it("is QuietEmpty with the plus, and no switch or search, when nothing is kept", () => {
    expect(source).toMatch(/<QuietEmpty line=\{screen\.line\} \/>/);
    const bar = source.slice(source.indexOf("function Bar("));
    expect(bar).toMatch(/\{full \? \(/);
  });

  it("switches List and Map with the icon variant, and opens on List", () => {
    expect(source).toMatch(/\{ value: "list", label: "List", icon: "list" \}/);
    expect(source).toMatch(/\{ value: "map", label: "Map", icon: "map" \}/);
    expect(source).toMatch(/useState<"list" \| "map">\("list"\)/);
    expect(source).toMatch(/<MemoriesMap\b/);
  });

  it("sorts By kind or Newest with the text variant", () => {
    expect(source).toMatch(/\{ value: "kind", label: "By kind" \}/);
    expect(source).toMatch(/\{ value: "new", label: "Newest" \}/);
  });

  it("gives search and plus 44 point targets where they draw 40", () => {
    expect(source).toMatch(/const DRAWN = 40;/);
    expect(source).toMatch(/hitSlop=\{\(TAP - DRAWN\) \/ 2\}/);
    expect(source).toMatch(/accessibilityLabel=\{MEMORY_COPY\.search\}/);
    expect(source).toMatch(/accessibilityLabel="New memory"/);
  });

  it("lets the search field grow with the text", () => {
    // 049. The field is SearchField, shared with the Search tab.
    expect(source).toMatch(/<SearchField value=\{query\}/);
    const shared = read("components/SearchField.tsx");
    const start = shared.indexOf("<View");
    const field = shared.slice(start, shared.indexOf("<TextInput", start));
    expect(field).toMatch(/minHeight: 48/);
    expect(field).toMatch(/minHeight: 40/);
    expect(field).not.toMatch(/\bheight: \d/);
  });

  it("names the view switch from the shared words", () => {
    expect(source).toMatch(/label=\{MEMORY_COPY\.view\}/);
  });

  it("tells the map which memory is open", () => {
    expect(source).toMatch(/openId=\{editor\?\.editing\?\.id \?\? null\}/);
  });

  it("closes the editor and reloads, with no toast, when the memory has gone", () => {
    expect(source).toMatch(/onGone=\{\(\) => void load\(\)\}/);
  });

  it("clears the query when search closes", () => {
    expect(source).toMatch(/if \(searching\) setQuery\(""\);/);
    expect(source).toMatch(/placeholder=\{MEMORY_COPY\.search\}/);
  });

  it("virtualises the list, so rows mount as they scroll into view", () => {
    expect(source).toMatch(/<MemorySectionList\b/);
    expect(source).toMatch(/Animated\.createAnimatedComponent\(\s*SectionList\b/);
    expect(source).not.toMatch(/<Animated\.ScrollView/);
    expect(source).toMatch(/initialNumToRender=\{/);
    expect(source).toMatch(/windowSize=\{/);
    // A forgotten memory's slot is an item too, keyed by its line (2026-10-18).
    expect(source).toMatch(/keyExtractor=\{\(one\) => \("slot" in one \? one\.entry\.id : one\.row\.id\)\}/);
    expect(source).toMatch(/renderSectionHeader=\{/);
  });

  it("draws a kind's heading with its dot, name and count", () => {
    expect(source).toMatch(/section\.kind \? <Dot/);
    // The memories it holds, not its items: a slot is not a memory.
    expect(source).toMatch(/\{section\.count\}/);
  });

  it("puts the toast over the sheet", () => {
    expect(source.lastIndexOf("<ToastHost")).toBeGreaterThan(source.lastIndexOf("<MemoryEditor"));
  });
});

describe("a row (AC-12, AC-15)", () => {
  const source = read(ROW);

  it("is the sentence in full, then the meta line, the spark in the noticed ink when learned", () => {
    expect(source).not.toMatch(/numberOfLines/);
    expect(source).toMatch(/memoryMeta\(/);
    expect(source).toMatch(/name="sparkles"/);
    expect(source).toMatch(/text-text-noticed/);
  });

  it("swipes to a clay Forget at the shipped 88", () => {
    expect(source).toMatch(/useRowSwipe\(/);
    expect(source).toMatch(/bg-surface-danger/);
    expect(source).toMatch(/>\s*Forget\s*</);
    expect(read("components/shell/swipe.ts")).toMatch(/export const REVEAL = 88;/);
  });

  it("is not the thread note's MemoryRow", () => {
    expect(source).not.toMatch(/\bMemoryRow\b/);
  });
});

describe("the editor (AC-14, AC-16)", () => {
  const source = read(EDITOR);

  it("is a DragSheet the keyboard lifts, focused once the sheet has arrived", () => {
    expect(source).toMatch(/<DragSheet\b/);
    expect(source).toMatch(/keyboard="lift"/);
    expect(source).toMatch(/onOpen=\{\(\) => field\.current\?\.focus\(\)\}/);
    expect(source).not.toMatch(/autoFocus/);
  });

  it("titles itself Memory or New memory, and saves with Save or Add", () => {
    expect(source).toMatch(/editing \? "Memory" : "New memory"/);
    expect(source).toMatch(/editing \? "Save" : "Add"/);
  });

  it("counts to the shared cap, saves on return and takes no newline", () => {
    expect(source).toMatch(/maxLength=\{MEMORY_TEXT_CHARS\}/);
    expect(source).toMatch(/\/\$\{MEMORY_TEXT_CHARS\}/);
    expect(source).toMatch(/submitBehavior="submit"/);
    expect(source).toMatch(/onSubmitEditing=\{\(\) => void save\(\)\}/);
    expect(source).toMatch(/placeholder=\{MEMORY_COPY\.placeholder\}/);
  });

  it("draws the five kinds as a grid, the kind preselected", () => {
    expect(source).toMatch(/MEMORY_KINDS\.map\(/);
    expect(source).toMatch(/const COLUMNS = 3;/);
    expect(source).toMatch(/useState<MemoryKindId>\(editing\?\.kind \?\? preset \?\? "about"\)/);
  });

  it("says where it came from, and the rule line on a new one", () => {
    expect(source).toMatch(/memoryOrigin\(/);
    expect(source).toMatch(/MEMORY_COPY\.newRule/);
    expect(source).toMatch(/name="compass"/);
  });

  it("holds the sheet while a save is in flight", () => {
    expect(source).toMatch(/locked=\{busy\}/);
  });

  it("saves on Android's Enter as on iOS's return", () => {
    expect(source).toMatch(/typedLine\(draft, text\)/);
  });

  it("closes without a word when the memory has gone", () => {
    expect(source).toMatch(/done\.outcome === "gone"/);
    expect(source).toMatch(/onGone\(\)/);
  });

  it("warns before the words of an answer change", () => {
    expect(source).toMatch(/severs\(editing, draft\) \? /);
    expect(source).toMatch(/MEMORY_COPY\.sever/);
  });

  it("keeps a refusal's reason under the field", () => {
    expect(source).toMatch(/\{refusal \? /);
    expect(source).toMatch(/text-text-danger/);
  });

  it("puts Forget last, in clay with trash-2, and not on a new one", () => {
    expect(source).toMatch(/\{editing \? \(/);
    expect(source).toMatch(/name="trash-2"/);
    expect(source.indexOf('name="trash-2"')).toBeGreaterThan(source.indexOf("{origin.lead}"));
    expect(source.indexOf("{origin.lead}")).toBeGreaterThan(0);
  });
});

describe("the map (AC-26 to AC-30)", () => {
  const source = read(MAP);

  it("draws what lib/memories-map decides", () => {
    for (const fn of [
      "mapMarks(",
      "mapLabels(",
      "mapNothing(",
      "openCamera(",
      "zoomAbout(",
      "flightAt(",
      "settle(",
      "needsRecull(",
      "crossesSentences(",
      "layerTransform(",
      "labelAnchor(",
    ]) {
      expect(source, fn).toContain(fn);
    }
    expect(source).toMatch(/memoryWorld\(/);
  });

  it("paints the oil ground and a cloud per kind, multiplied in light and screened in dark", () => {
    expect(source).toMatch(/<Canvas\b/);
    expect(source).toMatch(/require\("\.\.\/\.\.\/assets\/prism\/oil-ground\.png"\)/);
    expect(source).toMatch(/dark \? "screen" : "multiply"/);
    expect(source).toMatch(/<RadialGradient\b/);
    expect(source).toMatch(/r=\{k\.radius \* CLOUD_REACH\}/);
  });

  it("keeps the camera on the UI thread: shared values, worklet gestures, no state per frame", () => {
    expect(source).toMatch(/const cx = useSharedValue\(/);
    expect(source).toMatch(/const cy = useSharedValue\(/);
    expect(source).toMatch(/const z = useSharedValue\(/);
    expect(source).not.toMatch(/\.runOnJS\(true\)/);
    expect(source).not.toMatch(/setCamera\(/);
    expect(source).not.toMatch(/requestAnimationFrame/);
  });

  it("flies with withTiming on the camera's duration", () => {
    expect(source).toMatch(/withTiming\(1, \{ duration: ms, easing: Easing\.linear \}/);
  });

  it("moves one world layer, and the canvas reads the same values", () => {
    expect(source).toMatch(/const layer = useAnimatedStyle\(/);
    expect(source).toMatch(/transformOrigin: "left top"/);
    expect(source).toMatch(/<Group transform=\{cloudTransform\}/);
    expect(source).toMatch(/const cloudTransform = useDerivedValue(<\w+>)?\(/);
  });

  it("re-renders only on discrete changes: the threshold, settling, and the window moving", () => {
    expect(source).toMatch(/useAnimatedReaction\(/);
    expect(source).toMatch(/crossesSentences\(/);
    expect(source).toMatch(/needsRecull\(/);
    expect(source).toMatch(/runOnJS\(settleAt\)/);
    expect(source).toMatch(/runOnJS\(recullAt\)/);
  });

  it("memoises each mark, so a recompute mounts only what enters", () => {
    expect(source).toMatch(/const MapMark = memo\(function MapMark/);
  });

  it("makes every dot, pill and label a button with a name", () => {
    const buttons = source.match(/accessibilityRole="button"/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(6);
    expect(source).toMatch(/accessibilityLabel=\{mark\.label\}/);
    expect(source).toMatch(/accessibilityLabel=\{l\.label\}/);
    expect(source).toMatch(/opacity: mark\.dim \? DIMMED : 1/);
  });

  it("clamps a pill's sentence to the box's lines, the whole of it in the label", () => {
    expect(source).toMatch(/numberOfLines=\{card\.lines\}/);
  });

  it("pans and pinches with the gesture handler, clear of the edges", () => {
    expect(source).toMatch(/Gesture\.Pan\(\)/);
    expect(source).toMatch(/Gesture\.Pinch\(\)/);
    expect(source).toMatch(/\.hitSlop\(\{ left: -EDGE, right: -EDGE \}\)/);
  });

  it("flies on the camera's duration and jumps under reduced motion", () => {
    expect(source).toMatch(/useReducedMotion\(\)/);
    expect(source).toMatch(/cameraMs\(reduced\)/);
  });

  it("sits its controls above the plate", () => {
    expect(source).toMatch(/usePlateInset\(\)/);
    expect(source).toMatch(/accessibilityLabel="Zoom in"/);
    expect(source).toMatch(/accessibilityLabel="Zoom out"/);
    expect(source).toMatch(/showsEverything\(/);
  });

  it("is a named group, and says which sentence is open", () => {
    expect(source).toMatch(/role="group"/);
    expect(source).toMatch(/accessibilityState=\{\{ selected: open \}\}/);
  });

  it("widens a pill's target as far as the rows allow", () => {
    expect(source).toMatch(/hitSlop=\{\{ top: target\.slop, bottom: target\.slop \}\}/);
  });

  it("takes its canvas's shape once, from its first size, and last night's kind places", () => {
    expect(source).toMatch(/if \(aspect === null\) setAspect\(width \/ height\)/);
    expect(source).toMatch(/memoryWorld\(memories, aspect \?\? TALL, places\)/);
  });

  it("tells the screen which kind it is zoomed into, for the plus", () => {
    expect(source).toMatch(/const focused = settled \? focusKind\(world, settled\.camera\) : null;/);
    expect(source).toMatch(/onFocusKind\(focused\);/);
    const screen = read(SCREEN);
    expect(screen).toMatch(/onFocusKind=\{setMapKind\}/);
    expect(screen).toMatch(/plusKind\(view, mapKind\)/);
    expect(read(EDITOR)).toMatch(/preset/);
  });
});

describe("every file", () => {
  it("never retypes a sentence the shared module owns", () => {
    const sentences = [
      MEMORY_COPY.empty,
      MEMORY_COPY.full,
      MEMORY_COPY.loadFailed,
      MEMORY_COPY.saveFailed,
      MEMORY_COPY.placeholder,
      MEMORY_COPY.newRule,
      MEMORY_COPY.sever,
      MEMORY_COPY.forgotten,
      MEMORY_COPY.search,
      ...MEMORY_KINDS.map((k) => `"${k.name}"`),
    ];
    for (const file of FILES) {
      const source = read(file);
      for (const sentence of sentences) expect(source, `${file}: ${sentence}`).not.toContain(sentence);
    }
  });

  it("has no hex, no em or en dash, and no emoji", () => {
    for (const file of FILES) {
      const source = read(file);
      expect(source, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source, file).not.toMatch(/[\u2013\u2014]/);
      expect(source, file).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
