# offload admin

The staff panel. A handful of people use it: two owners and support. It is built from the
same tokens, type and hairlines as the app, with one deliberate difference.

**The nav is moss, not ink.** `--moss-700` with paper text, and an `admin` tag beside the
wordmark, so nobody doing support with both windows open mistakes one for the other. It is
the only colour change: everything to the right of the nav is the app's own palette.

Open `index.html`. Nothing is wired to a backend; actions change local state and raise the
app's own toast.

## Pages

| Page | What it does |
| --- | --- |
| Waitlist | Who is waiting, who has been invited and not signed in, who came from a shared thread. Invite one, invite a selection, or invite the weekly batch. |
| People | Every account, searchable, filterable by state. Disable and enable inline; delete asks for the email typed back. |
| Staff | Who can open this panel. Add someone by email, switch a role in place, remove with a confirmation. |
| Costs | Spend for the month against budget, on-pace figure, daily bars, spend by the job offload is doing, and the heaviest accounts. |
| Limits | The platform daily cap, the per-person daily and monthly caps, the weekly invite batch, the warning threshold, what happens when a cap is reached, and what has been hit lately. |

## Staff and roles

Two roles, and the only difference between them is money: **Support** gets Waitlist and
People, **Owner** also gets Costs, Limits and Staff. Support does not see those pages at all
rather than seeing them and being refused.

Four guards, each stated on the page: staff sign in with Apple or Google on an offload.app
address so adding someone creates no password; there is always at least one owner, and the
last one cannot be demoted or removed; you cannot remove or demote yourself; and removing
someone ends their access here without touching their own offload account.

## Shape

Sidebar plus one pane, no pane stack: admin work is one table at a time, and the app's
stack exists for following a thought, which is not what this is. Tables use hairlines only,
no zebra striping, numbers right-aligned and tabular.

Two irreversible actions live here and both ask first. Disable is reversible and says so.
Delete names what goes with it and needs the account's email typed, because someone doing
ten in a row will otherwise delete the eleventh by muscle memory.

Costs are grouped by the job being paid for (sorting, answers, memories, blurbs,
notification wording) rather than by model, because the question is always which feature is
expensive. The daily bars turn blue on days over £100, which is the same "this needs you"
blue the app uses.

## Files

| File | What is in it |
| --- | --- |
| `index.html` | Loads the bundle, the mock data, then the kit |
| `AdminData.js` | Mock waitlist, accounts, costs and limits. Same people as the app's `data.js` where they overlap |
| `A.jsx` | The admin vocabulary: `ASideNav`, `APaneHead`, `ATable`, `ARow`, `AStat`, `ABar`, `AStatus`, `AField`, `ASearch`, `AConfirm` |
| `AdminApp.jsx` | The four pages and the shell |

## Not designed

No audit log, no impersonation, no refunds or billing, no per-account cap override, no admin
roles beyond the two named in the data, and no email composer: support writes to people from
their own inbox.
