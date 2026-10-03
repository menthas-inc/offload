# offload admin

The staff panel, redrawn on 3 October 2026 to match what 034 built (`docs/specs/034-admin/`).
Same tokens, type and hairlines as the app, with three deliberate differences.

- **The nav is moss, not ink**, with an `admin` tag beside the wordmark, so nobody doing
  support with both windows open mistakes one for the other.
- **Pinned light**, whatever the system says. It is read beside spreadsheets and vendor
  dashboards, and one theme halves what has to be checked.
- **No Undo.** The toast is four seconds, bottom right, and never carries one. Anything that
  cannot be quietly reversed asks first in the confirm dialog, which holds the keyboard.

Open `index.html`. Nothing is wired to a backend.

## Roles and pages

Two blocks in the nav, a gap and no labels. **Support**: Waitlist, People and a person's page.
**Owner** also: Health (where an owner opens, with a count only when something is wrong),
Costs, Limits, Staff and Audit, and is the only role sent Delete, overrides and a deleted
account's audit entries. A page a role cannot open is not in the nav and answers as not found.

| Page | What it does |
| --- | --- |
| Health | Services with uptime, the queue, stuck and dead jobs with Retry and Dismiss, scheduled jobs each with its own page. |
| Waitlist | Waiting, invited this week, signed up, weekly batch (25). Invite one, the batch, a selection (the floating pill, the only place it appears), or an address not on the list. Remove, behind the dialog. |
| People | Rows open a person's page. Joined column; Sort by joined, last active or spend, saying when it is only the top 200. Disable inline; Delete for owners. |
| A person | Today against each cap (the last 24 hours, rolling), Override a limit (owner), cost and activity plots, what they have, what happened (jobs), limits hit. Nothing the person wrote. |
| Deleted account | *Deleted account*, one line with the date, and for an owner its audit entries. No name, no address. |
| Costs | Stats, cost per day and usage per day, by feature (*Notes*, not *Memories*), by model, by vendor (metered beside billed or typed). Export CSV, no icon. |
| Limits | Grouped: per person in any 24 hours, the platform, the month (budget and subscriptions), the waitlist, switches. Save shows each change old to new; the other button is Cancel. |
| Staff | Any address that has signed in once, a role, no name field, nothing emailed to them; every owner is told. |
| Audit | Every staff write, newest first. |

## Shape

- **Money is in dollars**, to the cent.
- **A cap means stop.** The next turn is refused and what was dumped is safe. No warning
  threshold, no choice of behaviour; alerts go to every owner.
- **Tables** use hairlines only, no zebra, numbers right and tabular. A row has a least
  width, its fixed columns plus 140px per open one; below it the table scrolls sideways.
- **Plots** are one series in `--text-primary` on `--surface-page`, `--plot-height` tall,
  with `--surface-attention` only for the state that needs somebody. Small multiples, two
  across. A range of 24 hours, 7, 30 or 90 days, kept in the address.
- **Clay is at rest** on a destructive row action: an outline pill in `--text-danger` on a
  `--border-danger` ring. The confirm button of a destructive dialog is `--surface-danger`,
  the one solid clay.
- **Delete** is held for 24 hours: the row stays, its pill reads *deleting*, the line under the
  name says when, and *Cancel deletion* leaves the account disabled.

## Files

| File | What is in it |
| --- | --- |
| `index.html` | Loads the bundle, the mock data, then the kit |
| `AdminData.js` | Mock data, in dollars |
| `A.jsx` | The vocabulary: `ASideNav`, `APaneHead`, `ATable`, `ARow` (with `href`), `AStat`, `APlot`, `ARange`, `ABar`, `AStatus`, `AField` (with an affix), `ASwitchRow`, `ADiff`, `AConfirm`, `ADanger` |
| `APeople.jsx` | Waitlist, People, a person, a deleted account, Staff |
| `AOps.jsx` | Health, Costs, Limits, Audit |
| `AdminApp.jsx` | The shell and the toast |

## Not designed

No impersonation, no refunds or billing, no email composer, no dark theme.
