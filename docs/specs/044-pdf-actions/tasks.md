# 044 PDF actions, tasks

Ordered. Every task is red before green (QUAL-1): write the test, watch it fail for the reason the task exists, then make it pass. Tracks: **Policy**, **Design**, **Agent** (the Python worker and prompts), **Core API**, **Web**, **Mobile** (iOS and Android). The feature is closed only when the three client tracks plus the server tracks pass. Grounding and the exact seams are in `impl-spec.md`.

## Setup and foundational (on `main`, before the feature code)

- **T1 Policy, on `main`.** Amend the privacy policy: section 5 gains that the candidate link set reaches the model on the filing turn; section 3 gains that offload keeps up to two useful links a PDF carried. Keep OFF-2's encrypted-list and wording accurate. Move the policy date and consent version as `session.ts` requires. *Red:* the policy test that asserts each named line's presence and that no line is left untrue. *AC-19; OFF-1, OFF-2. Blocks shipping the feature.*
- **T2 Design, on `main`.** Add a `children` slot to mobile `ListRow` (`.d.ts`, `.prompt.md`, `.jsx`; the adherence regex permits a slot the component would otherwise drop); add one accessible-name prop to `Button` only if `<label>, opens <host>` needs it. One `decisions.md` entry with **Design system impact** naming each kit file, the `Button` reuse, the reply control beside `SentPhoto`, and Remove in the row sheet. *Red:* the kit/adherence test for the new `ListRow` slot and the `Button` prop. *AC-7; OFF-7.*

## Agent (the worker and prompts)

- **T3 Harvest in the child.** In `pdfs.py` `clean()`, before `flatten_annotations`, collect `/URI` targets of link annotations on pages 1 to 10; after `make()`, match `http(s)` URLs in the clean copy's first-ten-page text; filter to `http`/`https`, drop over-2048-byte and bad-host entries, dedupe in document order, cap at 24, return in the header JSON; swallow a harvest failure to `candidates: []` with a count, never `Failed.reason`. *Red:* a child unit test over a drawn fixture carrying a real `/URI` annotation, a printed URL, a `javascript:` URI, a duplicate and an over-long URL, asserting the exact returned list. *AC-2; SEC-1.*
- **T4 Candidate block.** `Pdf.candidates` through `_prepare_pdfs`; `build_blocks` emits the per-PDF data-labelled candidate block on the dump and mail branches; nothing reaches the system prompt. *Red:* a block test asserting the data label, the per-PDF numbering, and that no candidate text is in the system prompt. *AC-2, AC-5; SEC-1, OFF-8.*
- **T5 Tool and worker resolution.** `ActionItem` and permissive `AddContent.actions` (drop a bad `link`, an empty/over-24/dashed/host-shaped label, not raise); `worker.py` resolves the index from `Pdf.candidates`, drops out-of-range and non-`http(s)`, keeps at most two, puts `{label, url}` on the `worker` envelope; `_ENVELOPE_KEYS` strips any model-set `actions` first. *Red:* tests for out-of-range drop, dashed-label drop, non-http drop, more-than-two trim, and model-set `actions` ignored. *AC-2, AC-4, AC-6, AC-11; OFF-5, SEC-1.*
- **T6 Prompt and evals.** The `plan_v2.md` PDFs paragraph; `evals/principles/pdf-actions.json` and `evals/fixtures/pdf-actions/make.py` (reportlab, real `/URI` annotations). Cases: the by-example rows (boarding pass yields check-in plus manage; ticket yields view plus wallet; invoice, bank statement, passport, manual, 48-page contract each yield **zero**, and a weak second action fails); the never-list; the four injection placements (visible, white, form field, page 11) each yielding no action; the annotation-only link with no printed URL. *Red:* the cases exist and fail against the current prompt. **Run only with the owner's yes in the session (`test-llm`).** *AC-1, AC-3, AC-4, AC-5; OFF-5, OFF-8.*

## Core API

- **T7 Persist.** `add_content` reads `actions` from the `worker` envelope, re-checks each scheme is `http`/`https`, re-checks the label bounds, keeps at most two, writes `content.attrs.actions`, drops a failing entry. *Red:* a route test for a non-http drop, an over-long label drop, a more-than-two trim, and a clean two-action write. *AC-2, AC-6, AC-11; SEC-2, OFF-1.*
- **T8 Wire.** The content-row envelope and the dump answer's `filed`/`landed` entries gain `actions` (additive); `readable()` scope unchanged. *Red:* an envelope test (field present for the dumper and an accepted member, absent/ignored for an older client shape, 404 for a non-member); the dump answer carries actions on the filed row. *AC-7, AC-14; SEC-2, OFF-3.*
- **T9 Undo.** Add the extraction to the reversible allowlist in `docs/tech/decisions.md`; Undo of the filing turn takes the actions with the row. *Red:* an Undo test asserting the actions are gone. *AC-12; OFF-6.*
- **T10 Egress and exclusion.** *Red:* tests asserting no label or URL appears in any analytics event, application log, model trace, error report, the drop count, a push payload or a connected-calendar write; and that the row's search text and its embedding input for a row with actions contain neither. *AC-16, AC-17; OFF-1, OFF-8.*

## Web

- **T11 Render, reveal, open.** The `Button` secondary-pill action (`arrow-up-right`) in `WRow`'s children under title and meta, and under the filing reply in `WTurns`; the host computed from the parsed `URL` (host only, punycode, control and bidi stripped, middle-clipped); the per-tap confirm (*From the PDF*, the host); scheme re-checked before open; opened as `<a href target="_blank" rel="noopener noreferrer">` in the same click (logged against 041's opposite PDF-tab call). *Red:* component tests for the look-alike hosts (`lufthansa.com@evil.ru`, `lufthansa.com.evil.ru`, a homograph) showing the true host, a non-http action not opening, and keyboard open through the anchor. *AC-7, AC-8, AC-9, AC-10, AC-11.*
- **T12 Remove.** Remove in the row's action path rewrites the row's actions; the row renders no action area when there are none. *Red:* a test removing one of two actions and asserting it stays gone. *AC-15; OFF-3.*

## Mobile (iOS and Android)

- **T13 Render, reveal, open.** The `Button` secondary-pill action in `ListRow`'s new children slot and under `SentPhoto`/`M3SentPhoto` in the reply, on both surfaces; the host computed with the platform URL type and `java.net.IDN` on Android; the per-tap confirm grounded in `RowActionSheet`; scheme re-checked; opened with `Linking.openURL` (the OS default browser, no custom tab, no `warmup`/`mayLaunchUrl`, no long-press preview). *Red:* component tests for host display and the non-http drop, **plus a device check with a proxy on an iPhone and a Pixel asserting no network request fires while showing, revealing or confirming** (per-track, platform-native). *AC-7, AC-8, AC-9, AC-10, AC-11.*
- **T14 Remove.** Remove in the PDF row's `RowActionSheet`/`M3` sheet rewrites the row's actions. *Red:* a test removing one action and asserting it stays gone. *AC-15; OFF-3.*

## Close

- All eval cases in T6 pass (with the owner's yes); the device checks in T13 pass on both phones.
- The policy (T1) is live on `main` before the feature merges.

## Artifacts

- `docs/specs/044-pdf-actions/feature-spec.md`
- `docs/specs/044-pdf-actions/impl-spec.md`
- `docs/specs/044-pdf-actions/tasks.md`

## Unresolved SHOULD-level flags

- **OFF-2 (accepted):** a destination URL is often a bearer token and sits in a plaintext column like the title and description; the owner accepted this knowingly and the policy states it. Carried, not a blocker.
- **DEV-3 (resolved to a skip):** the shown host is the full ASCII host, middle-clipped, not an emphasised eTLD+1; a public-suffix list is skipped because its extraction is its own spoofing surface. Upgrade trigger in the `shortcut:` comment if long subdomains confuse people.
- **Pre-code confirm (resolved):** `blobs` has no `attrs` column; worker-memory resolution means nothing is stored there and no migration or grant is needed. No open item remains.
