# Marketing site

Two files, both public-facing, neither part of the app kits. They use the same tokens and
type as the product, and they are the only place the display size and the serif voice
appear at web scale.

| File | What it is |
| --- | --- |
| `index.html` | The landing page at offload.app. Wordmark, one claim, one sentence, one email field, footer. Responsive down to 375. |
| `invite-email.html` | The one transactional email shell: the invite, and every other message offload sends. |

## Landing page

Invite only, so the page has exactly two actions: join the waitlist, or sign in if you
already have an invite. There is no feature grid, no screenshots and no pricing, because
there is nothing to buy yet.

- One field, email only. A longer form buys nothing while invites go out by hand.
- Submitting swaps the field and button for one line in their place ("You are on the list,
  we will email you when your account is ready to use"). Same page, no redirect, no
  separate thank-you route.
- `Sign in` sits quietly top right and is the only other link.
- Below 820px the hero drops to 34px, the form stacks, and the controls go full width at
  52px so they clear the 44px minimum.

## Email

The template is a 600px table with inline styles, no images and no CSS block. The comment
at the top of the file lists every rule it keeps and carries the plain-text alternative
that ships with each send. Fill four slots and it becomes any other message: headline,
paragraph, button label and URL, footer line.

Chosen over a framed card with the mark as a PNG, and over a type-only note with a text
link, because it is the only one of the three that needs no image asset and still looks
designed. See `explorations/not-invited-email-refusals.html` for all three.
