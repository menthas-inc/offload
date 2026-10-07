# Report template

The sweep's report is `docs/sweeps/<date>.md`. Start it in Phase 3 with the
worklist, finish it in Phase 5. Same register as
`docs/tech/security-review-2026-09-22.md`: findings verified at a file and line,
a checklist where a tick means read.

```markdown
# Sweep, <date>

> Reviewed <reviewed sha> on main, covering <n> merges since <since> (<base sha>).
> <One sentence: the headline, what was fixed, what waits on the owner.>

## 1. Numbers

| lane | checked | critical | high | medium | low | fixed | owner | held | dropped |
|---|---|---|---|---|---|---|---|---|---|

Where findings came from: the merges or specs that introduced the confirmed ones,
counted. This table across sweeps is how the harness is measured; keep its columns.

## 2. Checklist

One heading per lane, `- [x]` read and sound, `- [ ]` with the finding id.

## 3. Functional pass

Journey by platform, from functional.md.

## 4. Findings

`S<n>` ids, by severity. Each: the file and line, evidence, the failure scenario,
the fix, the commit that fixed it or why it waits.

## 5. Owner calls

Each question as asked, the options, the answer, and what became of it.

## 6. Held

Real, bigger than a sweep. The next sweep starts from this list.

## 7. Lessons

Each defect class that recurred or that a check could have caught, and what was
built or proposed: the script, rule or hook, and the CLAUDE.md line if one is proposed.
```
