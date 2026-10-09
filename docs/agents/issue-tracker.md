# Issue tracker: Local Markdown

Issues and PRDs for this repo live as markdown files in `.scratch/`. The directory is gitignored — issues are local-only and never committed.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/PRD.md` — a `MAP.md` or `SPEC.md` may stand in for it — and it carries its own `Status:` line (see "When every issue under a PRD is done" below)
- Implementation issues are `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- A feature that has settled a spec keeps the build order beside them as `.scratch/<feature-slug>/slices/<NN>-<slug>.md`, numbered the same way. The two are phases of one job: the `issues/` are the record of how the spec was settled, and the slices are the work it turned into. Finish the issues before starting the slices
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings). That line decides what an unattended run picks up: only `ready-for-agent` and `in-progress` are work to do, and every other label records a decision a run must not overrule
- The `Status:` line is also what marks a file as an issue at all. A document sitting in the folder without one — a record a script wrote, a `README.md` — is not work, and is left out of both the run and the "every issue done" check below
- An issue may carry `Depends on:` and `Touches:` as body lines in the same shape — the issues it must wait for, and the path prefixes it edits — for whatever runs the work to schedule against
- A run that ends without landing an issue writes the findings that stopped it under an `## Open findings` heading, directly above `## Comments`. That section is the run's: the next run hands it to the agent picking the issue up, replaces it with its own verdict, and drops it once nothing blocking is left. It sits beside the `Status:` line rather than in it so that putting an issue back in play by hand leaves it standing — clearing it out as stale costs the next run a session rediscovering the same defect. A run claims only a section whose heading line reads exactly `## Open findings`, so notes of your own stay yours under a heading of their own: `## Open findings, mine` is left alone
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## When work is complete

Closing an issue out is the job of whatever did the work, and the issue file is the only place that record survives. An unattended run is expected to write its own outcome back before it exits. A workflow skill (e.g. subagent-driven-development) tracks progress in its own ephemeral state, and that state does **not** sync back to the issue file on its own — so close the issue out explicitly. Either way the steps are the same:

1. **Tick the acceptance criteria** — flip each `- [ ]` to `- [x]` as it is satisfied.
2. **Set the terminal `Status:`** — `in-progress` once implementation starts, `done` once it is implemented, reviewed, and verified (see `triage-labels.md`). Work that could not finish gets `needs-info` when it stopped to ask a question, `ready-for-human` when review never passed; both take the issue out of the next run until someone puts it back. An issue left blocked by the *schedule* — a dependency that failed, a cycle — keeps whatever status it had, because that says nothing about the issue.
3. **Append a closure entry** under `## Comments` with: the date, the commit SHA and its branch, whether it is merged, a one-line summary of what changed, the test result, and the review outcome.

`done` records completion, not merge — note the merge state in the closure comment if the branch is still open.

## When every issue under a PRD is done

The spec carries its own `Status:` line, and it flips to `Status: done` once every issue under `.scratch/<feature-slug>/issues/` reads exactly `Status: done`. Decide that by re-reading the folder rather than from any one run's notion of what it finished — an issue nobody touched has to be able to hold the spec open just as firmly as one that failed.

A feature with any `wontfix` issue, or one otherwise permanently deferred, never closes this way — the check is deliberately conservative. Neither does a spec whose `Status:` already reads as finished get rewritten, so a hand-written closure keeps its wording. Close that spec by hand once you decide the feature is finished as-is.
