/**
 * A person. A generated prism with their initials over it, for a product where nobody
 * uploads a photo.
 *
 * **Seeded from `uid`, the account's immutable id** — never the name or the email, both of
 * which change, and never anything a person can pick, because the moment it is choosable it
 * stops being a reliable way to find them.
 *
 * **Two constants that must not be relaxed.** Every stop lands in OKLCH `L 0.42`–`0.52` at
 * `C 0.13`, which is what keeps white initials above 4.5:1 on every hue the generator can
 * produce; at `L 0.56` the lightest hue measured 4.16:1. And hue comes off a 12-step wheel
 * rather than a continuous hash, so two people are never almost the same colour.
 *
 * **The facet is part of the identity, not decoration.** Twelve accounts land on eight
 * distinct hues, so hue alone collides on a list of twelve; the hard edge at one of eight
 * seeded angles is the only structure that survives 36px. 12 × 8 buckets.
 *
 * **Sizes: 28, 32, 36, 52, 56**, which is every size the product draws — a pending card,
 * `PersonRow`, the share sheet, a person's page, a request. **Below 28 do not draw it**:
 * the facet edge is marginal at 24 and the initials alone are more honest.
 */
export interface AvatarProps {
  /** The account's immutable id. The only thing the mark is derived from. */
  uid: string;
  /** Two letters. Derived from `name` when omitted. */
  initials?: string;
  /** The person's name, used as the accessible label. */
  name?: string;
  /** 28 | 32 | 36 | 52 | 56. The monogram scales with it. Default 36. */
  size?: number;
  style?: React.CSSProperties;
}
export declare function Avatar(props: AvatarProps): JSX.Element;
