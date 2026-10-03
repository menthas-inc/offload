// Every company offload pays (034, section 4.1), one row each.
//
// The list comes from `docs/tech/stack.md` and the privacy page's table, plus
// the three that hold no data and so appear on neither: the Workspace and the
// two developer programmes.
//
// **Nothing here is billed today.** A company becomes billed when a puller for
// it exists, and a puller exists only once its interface has been called for
// real (`pull.ts`, and the appendix of the impl-spec). Until then each is one
// of two things: metered, where the ledger prices its calls, or a subscription
// an owner types on Limits.

/** What the ledger knows about a company, by the parts Costs splits a vendor
 *  into: the model, transcription, searches, pages read. */
export type LedgerPart = "model" | "transcription" | "search" | "read";

export interface Vendor {
  /** The key in `vendor_costs` and in the `costs.fixed` map. */
  slug: string;
  name: string;
  /** The parts of the ledger this company's bill should match. Empty where
   *  offload writes no ledger row for it. */
  ledger: readonly LedgerPart[];
}

export const VENDORS: readonly Vendor[] = [
  // Searches and page reads are Anthropic's server tools, so they are on
  // Anthropic's bill and belong in the figure that bill is compared with.
  { slug: "anthropic", name: "Anthropic", ledger: ["model", "search", "read"] },
  { slug: "assemblyai", name: "AssemblyAI", ledger: ["transcription"] },
  // Embeddings and maps are metered by their companies and write no ledger
  // row here, so they read as not recorded until an amount is typed.
  { slug: "voyage", name: "Voyage AI", ledger: [] },
  { slug: "google-maps", name: "Google Maps Platform", ledger: [] },
  { slug: "google-workspace", name: "Google Workspace", ledger: [] },
  { slug: "resend", name: "Resend", ledger: [] },
  { slug: "expo", name: "Expo", ledger: [] },
  { slug: "railway", name: "Railway", ledger: [] },
  { slug: "cloudflare", name: "Cloudflare", ledger: [] },
  { slug: "apple-developer", name: "Apple Developer", ledger: [] },
  { slug: "google-play", name: "Google Play", ledger: [] },
];

export function vendor(slug: string): Vendor | undefined {
  return VENDORS.find((one) => one.slug === slug);
}
