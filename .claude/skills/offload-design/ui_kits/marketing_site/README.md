# Marketing site

Two files, both public-facing, neither part of the app kits. They use the same tokens and
type as the product, and they are the only place the display size and the serif voice
appear at web scale.

| File | What it is |
| --- | --- |
| `index.html` | The landing page at offload.club: the hero, the story in one still panel over the prism, the waitlist again. Responsive down to 375. Runs `landing.js` and `landing.css`. |
| `landing.js` | The scroll engine, the site's prism shader with two added uniforms, the copy, the drawings, and the one direction taken (C, Through the prism). |
| `landing.css` | Every landing rule. Local `--wash-*` stand-ins: the real ones live in the web app's globals. |
| `invite-email.html` | The one transactional email shell: the invite, and every other message offload sends. |

## Landing page

Decided 4 October 2026 off `explorations/landing-scroll.html`. The readme's **The landing page**
is the lasting statement; `handoff/APPLY-2026-10-04-landing.md` is the build.

Invite only, so the page still has exactly two actions: join the waitlist, or sign in. What
changed is that it now says what offload is and that it connects to Google Calendar, in live
text on the page, because Google's reviewer checks both signed out.

- **The hero is as built**: *offload [verb] for you*, the sentence, the field. A scroll mark
  under it, the logo's dot dropping into its vessel, scrolls to the story.
- **Scrolling drives into the mark.** It grows about the vessel's base until the prism fills
  the window, and the page sits inside the film. At the waitlist it pulls back out and is the
  mark again, above the form.
- **One frosted panel, held still.** It fades in as the hero leaves; the four steps swap inside
  it, each drawing assembling piece by piece; it fades out before the waitlist. Nothing in it
  scrolls past.
- **The header goes solid once scrolled**: paper at 72% with a 14px blur and a hairline, the
  logo and Sign in centred in the band.
- **A 3px progress bar** along the bottom of the window, from the moment the hero leaves.
- Submitting the field swaps it for one line in place. Same page, no redirect.

## Email

The template is a 600px table with inline styles, no images and no CSS block. The comment
at the top of the file lists every rule it keeps and carries the plain-text alternative
that ships with each send. Fill four slots and it becomes any other message: headline,
paragraph, button label and URL, footer line.

Chosen over a framed card with the mark as a PNG, and over a type-only note with a text
link, because it is the only one of the three that needs no image asset and still looks
designed. See `explorations/not-invited-email-refusals.html` for all three.
