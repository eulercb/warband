# Automatic CI completion reports

`CI completion` runs on GitHub's **CI completed event**, rather than a timer or an
active chat waiting for tests. It updates one bot comment on the current PR with
the exact tested head, run link and final result. Normal GitHub subscription
notifications apply. It does not approve, merge or deploy anything.

- **Passed:** every CI job succeeded for this head; proceed to human review and
  live testing without needing an assistant just to read the green checks.
- **One isolated timeout:** when GitHub explicitly annotates a job execution-time
  overrun and all other jobs passed, retry that job once and report the pending
  retry. The next completion event updates the same comment.
- **Needs attention:** report assertion failures, mixed failures, manual
  cancellations, skipped checks, denied retries and repeated timeouts with links.
  These do not receive automatic retries that could hide a real failure.

Older attempts and force-pushed heads are ignored. Only same-repository PRs into
the default branch are supported. If a PR is closed, no comment/retry is made.

## Setup and activation

Merge the automation PR first: GitHub discovers `workflow_run` workflows on the
default branch. It cannot operate while its workflow exists only in an unmerged
PR. Future completed CI runs trigger it automatically. To check the integration
after merge against an existing completed PR run, manually dispatch `CI completion`
with that run ID; the same head/repository/result guards apply.

The workflow uses only GitHub's repository token, with actions write permission
for the isolated retry and pull-request write permission for the comment. It
needs no external service, model key or new secret. Repository/organization policy
must allow those permissions. The first post-merge run must verify the actual
event delivery and token permissions; local contract tests cannot prove them.

The privileged completion workflow checks out **only the trusted default branch**,
with persisted credentials disabled and immutable action revisions. It never
executes PR code or reads PR artifacts/logs as instructions. All PR/job metadata
used for reports comes from GitHub APIs; no untrusted text becomes shell code.

## Test budgets and limits

Browser jobs now allow setup time in addition to their test time: 25 minutes total
for passive/caster-defense/defense jobs and 30 for martial. The browser-test steps
remain bounded to the previous 12/15-minute limits. Assertions, cases and coverage
requirements are unchanged. Slow Chromium installation no longer consumes almost
all of a short job budget.

This is **automatic CI reporting and a limited timeout retry**, not assistant
reactivation. It cannot repair an arbitrary code failure or restart a Codex chat.
That requires a platform scheduling/event integration capable of starting an
assistant task, which is not exposed in the current workspace. There is no hidden
chat polling or promise of an automatic assistant wake-up.

Local checks: `node scripts/ci-completion.test.mjs`, targeted ESLint, formatting,
and workflow YAML parsing. The quality job runs the completion-helper tests too.
