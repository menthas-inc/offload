---
name: push-to-public-repo
description: Publish the private repository's main to the public copy at menthas-inc/offload. Rebuilds the filtered history, reviews everything new since the last publish for personal or sensitive content and for docs a visitor would trip over, writes a changelog, and opens a catch-up pull request on the public repo that is merged by fast-forward push. Use when the owner asks to publish, push to public, or catch the public repo up.
---

# Push to the public repo

Work always happens in the private repository, `menthas-inc/offload_app`. Now and then its `main` is published to `menthas-inc/offload`, a read-only copy for showing the work. The copy is not a fork and is never edited by hand: it is rebuilt from scratch every time by `git filter-repo`, which is deterministic, so the same private history always produces the same public commits and a publish only adds new ones on top. That is what keeps every commit counted on the owner's contribution graph under the right date.

Three places hold the machinery:

- **This folder.** `build.sh` rebuilds, `callback.py` decides what each file becomes (dropped, kept as a "kept private" page, renamed, or passed through the replace rules), and `review.py` is the mechanical review. All three are public and must stay free of anything personal.
- **`~/dev/offload_public_sync/`, outside every repo, never committed.** `mailmap.txt` maps every address the owner ever committed as to the GitHub noreply address. `replace.txt` holds the replace rules: real people's names in fixtures, an old secret's shape, home paths. `refuse.txt` holds patterns that stop the build if any survive.
- **`~/dev/offload_public/`**, the rebuilt copy, with the public repo as remote `public`.

Never use the merge button on a public pull request. It adds a merge commit that no rebuild reproduces, so the next publish diverges. A catch-up is merged by pushing its branch to `main`; GitHub then marks the pull request merged by itself.

## 1. Build

Publishing takes what is merged to the private `main` on GitHub, not the local checkout. If the owner wants something in that is still on a branch, it gets merged first.

```bash
.claude/skills/push-to-public-repo/build.sh
```

It ends with one of three statuses:

- **up to date.** Nothing to publish. Say so and stop.
- **fast-forward, N new commits.** The normal case. The range to review is `public/main..main` in `~/dev/offload_public`.
- **diverged.** A rule changed (in `callback.py` or the config), so the history was rewritten from the first commit it touched. Review the whole tree, not a range (pass `""` as the base below). Publishing then needs a force push, which rewrites history that strangers can already see. Ask the owner first, every time.

A `refused` line means a pattern from `refuse.txt` survived. Find the commit in the rebuilt copy without printing more than you need, add a replace rule (or a drop or stub in `callback.py`), and build again.

## 2. Review what is new

Run the mechanical pass first. It prints no secret value.

```bash
python3 -I .claude/skills/push-to-public-repo/review.py ~/dev/offload_public "$(git -C ~/dev/offload_public rev-parse public/main)" main
```

It reports three sections: secret shapes and personal data in added lines, binaries added in the range, and docs trouble across the whole tree. These hits are known and accepted, so do not raise them again:

- the throwaway CI values in `.github/workflows/ci.yml`
- test fixtures' fake tokens and addresses
- the placeholder Railway connection string in `apps/core-api/src/api-role.ts`
- the Firebase Android key in `apps/mobile/google-services.json`, restricted to the two push APIs on a project with no billing

Then read the change itself; a pattern scan only finds shapes. For a range of more than a handful of commits, hand it to one reviewer agent with the diff command and this list, and verify each finding in the rebuilt copy before acting on it. Look for:

- **People.** Real names, emails, phone numbers, addresses, health, money or family details. Fixtures use the cast in `apps/agent/evals/cast`; anyone else is suspect. Real dumped content, from production or from the owner's own account, quoted in a doc, a test comment or a commit message.
- **Operations.** A credential of any kind, a production hostname beyond `offload.club`, `api.offload.club`, `to.offload.club` and `staging.offload.club`, a cloud project or bucket name that was not public already, a staff address, or a currently open weakness written up with the steps to use it.
- **Other people's material.** A copied page, document, image or font that is not ours to publish, or one whose licence is not in `LICENSES/`.
- **Every binary from section 2.** Look at each image; status bars, notifications and browser tabs leak as easily as text.
- **Anything harness-written that was never meant to leave**, such as a pasted session context, a memory file or a scratch log.

## 3. Keep the docs clean for a visitor

Section 3 of `review.py` lists dead relative links, links into the private repository and absolute home paths. Fix what a visitor would hit, and check that `README.md`, and its "About the public copy" part in particular, still describes the repository. A new top-level doc or folder that only makes sense privately goes into `callback.py` as a drop or a stub.

## 4. Fix at the source

Nothing is fixed in the public copy, because the next rebuild would undo it.

- **Content** that should change: fix it in the private repo through its normal pull request flow, merge, and build again.
- **A doc that should stay private**: add its path to `STUB` (when links point at it) or `DROP` in `callback.py`, through a private pull request.
- **A name, address or old secret in history**: add a rule to `replace.txt` and a pattern to `refuse.txt` in the config folder. Never put the value in a repository; write a regex for its shape where you can.

The last two rewrite history, so the next build reports **diverged**.

## 5. Write the changelog

Read the range in the rebuilt copy, whose messages are already filtered:

```bash
git -C ~/dev/offload_public log --reverse --format='%h %s%n%b' public/main..main
```

Merge commits name the private branch in their subject. Their body's first line is the pull request's title, which is the line to use. Write it for a visitor:

- **Group** under Product, Model and evals, Infrastructure and security, and Docs and harness. Leave out empty groups.
- **One line per change**, in the project's voice: short, sentence case, no em or en dashes.
- **No private pull request numbers or links**, which a visitor cannot open, and nothing the review held back.
- **End with a count**: commits, and the date range they span.

## 6. Open the catch-up pull request

```bash
cd ~/dev/offload_public
branch="catch-up/$(date +%F)"
git push public "main:refs/heads/$branch"
gh pr create --repo menthas-inc/offload --base main --head "$branch" \
  --title "Catch up to $(date +%F)" --body-file <changelog file>
```

The body is the changelog, then a "Reviewed" section: what review found and what was done about it, and what was skipped. End it with one line: *Merged by fast-forward push, not the merge button.* On a diverged build, say at the top that this publish rewrites history and why.

Give the owner the pull request's link and stop. Merging is theirs to call.

## 7. Merge, on the owner's word

```bash
cd ~/dev/offload_public
git fetch -q public
# the branch lives only on the remote; the local main is the same commit
[ "$(git rev-parse main)" = "$(git rev-parse "public/$branch")" ] || echo "STOP: rebuilt main is not the PR's head"
git push public main:main                 # fast-forward
# diverged, and only with the owner's yes for this publish:
# git push --force-with-lease=main:"$(git rev-parse public/main)" public main:main
gh pr view --repo menthas-inc/offload "$branch" --json state --jq .state   # MERGED
git push public --delete "$branch"
```

If `main` moved since the build, because someone clicked the merge button or pushed by hand, the fast-forward refuses. Build again rather than forcing.
