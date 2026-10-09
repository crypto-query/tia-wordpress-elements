# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker (the `Status:` line in each `.scratch/` issue file).

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## Lifecycle states beyond triage

The five roles above cover *triage* — getting an issue ready to work. Once work starts, the `Status:` line moves through two further states (these aren't triage roles; they track implementation):

| Status        | Meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| `in-progress` | An agent or human has started implementing the issue          |
| `done`        | Implemented, reviewed, and verified (see issue-tracker.md closure step) |

`done` means the work is complete and verified, not necessarily merged — the closure comment records the commit SHA and merge state.

Edit the right-hand column to match whatever vocabulary you actually use.
