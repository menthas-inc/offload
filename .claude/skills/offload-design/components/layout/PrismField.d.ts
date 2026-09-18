/** The prism field: colour on the phones, and the only decoration in the system.
 *
 *  A baked texture held **frozen**. When offload files something the field warps
 *  for `--prism-run`, eases its clock to a stop over the last `--prism-settle`,
 *  and freezes again wherever it landed, so no two arrivals leave it the same.
 *  Nothing runs at rest: no timer, no loop, no shader context awake.
 *
 *  It is the change mark in a second place. A row takes a moss ground settling
 *  over `--duration-mark`; the field takes two seconds of flow. Both say offload
 *  just did something, and they fire together.
 *
 *  **Where it is allowed.** Two surfaces: inside the bottom plate, and behind
 *  the sign-in lockup. Nowhere else. It must never sit under a scrolling list:
 *  `--text-tertiary` is exactly 4.5:1 on paper with nothing spare, and every
 *  row's trailing time, the agenda's time column and a digest's line times all
 *  use it.
 *
 *  **The field and its veil are one decision.** Clipped inside a plate the field
 *  needs `veil="graded"`, which is light where nothing sits and full by the
 *  label band. A flat veil leaves the field invisible; a thin one takes the tab
 *  labels under the floor. Do not move one without re-measuring the other.
 *
 *  **The field's own alpha is rescaled on mount to a symmetric hump inside the
 *  visible window** -- zero at the top edge, full across the middle, zero by
 *  `--prism-veil-reach`, where the veil closes for good. Shaping it over the
 *  whole box is not enough: what the eye sees is the field multiplied by what
 *  the veil passes, and the veil's lower stop is pinned above the tab labels,
 *  so a box-wide hump opens abruptly at the top and smears at the bottom. Both
 *  layers on the same window is what makes the composite symmetric. The textures are baked with a
 *  one-directional ramp, and against a veil that closes at both edges that
 *  makes the two ends behave nothing alike: colour appears abruptly at the
 *  dense end and dissolves at the thin one. The rescale divides out whatever
 *  the bake did, measured per row, so both edges fade over the same distance.
 *
 *  **Both themes.** The fill is `--prism-veil-rgb`, the ground it sits on, so
 *  on dark it is the dark ground rather than white: a white grade over a dark
 *  tab strip lifts it to grey precisely where the field should be vanishing.
 *  Dark also carries its own `--prism-alpha` and `--prism-density`, because
 *  the texture's washes are light tints and read hotter over a dark ground.
 *
 *  **The parallax has no prop.** The field slides horizontally against whatever
 *  is scrolling, clamped inside the texture's own overhang, and it is the only
 *  thing about the field that moves without offload having done something. The
 *  component listens for scroll in the capture phase and writes
 *  `--prism-shift` on its own inner layer, so no screen has to know the field
 *  exists. Vertical travel is deliberately absent: the dense edge is pinned to
 *  the plate's top, and moving it down bares the plate there.
 *
 *  **On React Native** this is a `react-native-skia` runtime shader sampling the
 *  same baked texture with offset UVs. The shader is trivial per frame; the cost
 *  is the bundle and the render loop, which is why the loop only exists for two
 *  seconds at a time. */
export interface PrismFieldProps {
  /** `band` is the bottom plate's field and is flipped so its dense edge meets
   *  the plate's rounded top, where the veil is lightest. `bloom` is the gate's
   *  and is radial, so it is not flipped. */
  variant?: "band" | "bloom";
  /** Where the baked textures live. Resolves like `Icon`'s: this prop, then
   *  `window.OFFLOAD_PRISM_BASE`, then a root-relative `assets/prism`. Host
   *  pages set the global once, since they sit at different depths. */
  basePath?: string;
  /** Multiplies `--prism-alpha`. 1 means the design's own `--prism-density`. */
  density?: number;
  /** `graded` for a field inside a plate, `none` for the gate where no text
   *  crosses it. There is no flat option on purpose. */
  /** `graded` closes at both edges and thins only in between: full fill at the
   *  top so the field arrives out of whatever is above it instead of starting
   *  on a line, thin across the middle where only the opaque composer pill
   *  sits, full again by the tab labels. `none` for the gate's bloom.
   *
   *  There is deliberately no upward grade. A second field above the plate was
   *  tried for a raised conversation's composer and it does not work: each
   *  field maps the whole texture into its own box, so two stacked boxes of
   *  half the height squash the pattern and break it at the seam. One field
   *  over one continuous surface, always. */
  veil?: "graded" | "none";
  /** Change this to make the field warp. Any changing value works; a count of
   *  things offload has filed is the natural one. */
  pulse?: number | string;
  /** Warps once as it mounts, which is what the gate wants: the screen's own
   *  appearance is the only arrival it has. */
  arriveOnMount?: boolean;
  style?: React.CSSProperties;
}
export declare function PrismField(props: PrismFieldProps): JSX.Element;
