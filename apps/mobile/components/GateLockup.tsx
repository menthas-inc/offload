// The centred mark and wordmark that every pre-account screen opens with.
//
// One component because it was six identical copies, on sign in, no invite and
// the waitlist across both platforms, and a size change meant six edits that
// had to agree. The only thing that ever differed between them was which token
// the wordmark took its colour from, which is one Platform check rather than a
// reason to fork the file.
//
// Sizes live here, together, so they can be tuned in one place and stay in
// proportion to each other while they are being looked at.

import { Platform, Text, View } from "react-native";
import { Logo } from "./Logo";

/** The kits draw 92 and 30. These are those, 40% up, while we look at it.
 *  Tracking is -0.03em in the kits, so it scales with the size rather than
 *  staying at the -0.9 that only suited 30. */
const MARK = 129;
const WORDMARK = 42;
const TRACKING = -0.03 * WORDMARK;

/** How much of the screen the lockup sits in.
 *
 *  A share of the height rather than the leftover space. It used to be flex-1,
 *  which meant it took whatever the content below did not, so the lockup sat
 *  lower on the waitlist than on sign in purely because the waitlist has a
 *  field. Moving between the two, the mark visibly dropped.
 *
 *  A share and not a fixed pixel band, so a small phone gives it proportionally
 *  less rather than eating the space the buttons need, and the screens below
 *  take the rest. */
const BAND = "55%";

/** What the band may never shrink past: the mark, the gap under it, and one
 *  line of the wordmark.
 *
 *  Without this the band shrinks to whatever is left when the keyboard is up
 *  while the mark and wordmark keep their real size, and justify-center then
 *  centres content taller than its container, which overflows in both
 *  directions. On the waitlist the wordmark landed on top of the title. This
 *  is the floor at which the lockup stops giving ground and the screen scrolls
 *  or clips instead.
 *
 *  Derived rather than typed so it stays true when MARK and WORDMARK change:
 *  the gap is space-7 at 20 and the wordmark's line box is a little over its
 *  point size. */
const FLOOR = MARK + 20 + Math.round(WORDMARK * 1.3);

export function GateLockup() {
  return (
    // flexShrink so the band is a target, not a floor. When the keyboard is up
    // there is less screen to share, and the lockup is the decoration: it gives
    // way first so the copy and the controls keep their room.
    <View
      className="items-center justify-center"
      style={{ height: BAND, flexShrink: 1, minHeight: FLOOR }}
    >
      <View className="items-center gap-space-7">
        <Logo variant="mark" size={MARK} />
        <Text
          className={`font-core ${Platform.OS === "android" ? "text-a-on" : "text-text-primary"}`}
          style={{
            fontSize: WORDMARK,
            fontWeight: "600",
            letterSpacing: TRACKING,
          }}
        >
          offload
        </Text>
      </View>
    </View>
  );
}
