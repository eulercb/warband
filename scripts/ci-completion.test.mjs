import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeCI, MARKER } from './ci-completion.mjs';

function fixture() {
  const calls = [];
  const run = {
    id: 12,
    status: 'completed',
    conclusion: 'success',
    event: 'pull_request',
    path: '.github/workflows/ci.yml',
    head_repository: { full_name: 'owner/game' },
    head_sha: 'abc123',
    head_branch: 'fix',
    pull_requests: [{ number: 5 }],
    html_url: 'https://github.com/owner/game/actions/runs/12',
    run_attempt: 1,
  };
  const pr = {
    number: 5,
    state: 'open',
    head: { sha: 'abc123', ref: 'fix', repo: { full_name: 'owner/game' } },
    base: { ref: 'main' },
  };
  const job = {
    id: 20,
    name: 'Browser',
    conclusion: 'success',
    steps: [],
    check_run_url: 'https://api.github.com/repos/owner/game/check-runs/30',
    html_url: 'https://github.com/owner/game/actions/runs/12/job/20',
  };
  const state = { jobs: [job], annotations: [], comments: [], retryDenied: false };
  const paged = (key) => async () => state[key];
  const github = {
    paginate: (method, args) => method(args),
    rest: {
      actions: {
        getWorkflowRun: async () => ({ data: run }),
        listJobsForWorkflowRun: paged('jobs'),
        reRunJobForWorkflowRun: async (args) => {
          calls.push(['retry', args]);
          if (state.retryDenied) throw { status: 403 };
        },
      },
      repos: { listPullRequestsAssociatedWithCommit: async () => [pr] },
      checks: { listAnnotations: paged('annotations') },
      pulls: { get: async () => ({ data: pr }) },
      issues: {
        listComments: paged('comments'),
        createComment: async (args) => calls.push(['create', args]),
        updateComment: async (args) => calls.push(['update', args]),
      },
    },
  };
  const context = {
    repo: { owner: 'owner', repo: 'game' },
    payload: { workflow_run: { id: 12, run_attempt: 1 }, repository: { default_branch: 'main' } },
  };
  const core = { warning: (message) => calls.push(['warning', message]) };
  const execute = () => completeCI({ github, context, core });
  const timeout = () => {
    run.conclusion = 'cancelled';
    job.conclusion = 'cancelled';
    state.annotations = [{ message: 'The job has exceeded the maximum execution time of 12m0s' }];
  };
  return { execute, run, pr, job, state, context, calls, timeout };
}

test('reports success for this head and updates the existing bot comment without touching human comments', async () => {
  const f = fixture();
  f.state.comments = [
    { id: 8, user: { login: 'human' }, body: MARKER },
    { id: 9, user: { login: 'github-actions[bot]' }, body: `${MARKER}\nold` },
  ];
  assert.equal(await f.execute(), 'passed');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][0], 'update');
  assert.equal(f.calls[0][1].comment_id, 9);
  assert.match(f.calls[0][1].body, /CI passed: 1\/1 checks/);
  assert.match(f.calls[0][1].body, /abc123/);
});

test('retries only the isolated annotated timeout and posts a pending summary', async () => {
  const f = fixture();
  f.timeout();
  assert.equal(await f.execute(), 'retrying');
  assert.equal(f.calls[0][0], 'retry');
  assert.equal(f.calls[0][1].job_id, 20);
  assert.match(f.calls[1][1].body, /retrying one confirmed timeout/);
});

test('never retries assertion failures, manual cancellations, mixed failures or a second timeout', async () => {
  for (const mode of ['assertion', 'manual', 'mixed', 'second', 'failed-step', 'missing-check']) {
    const f = fixture();
    f.timeout();
    if (mode === 'assertion') f.job.conclusion = 'failure';
    if (mode === 'manual') f.state.annotations = [];
    if (mode === 'mixed') f.state.jobs.push({ ...f.job, id: 21, conclusion: 'failure' });
    if (mode === 'second') f.run.run_attempt = f.context.payload.workflow_run.run_attempt = 2;
    if (mode === 'failed-step') f.job.steps = [{ conclusion: 'failure' }];
    if (mode === 'missing-check') f.job.check_run_url = undefined;
    assert.equal(await f.execute(), 'attention', mode);
    assert.equal(
      f.calls.some(([kind]) => kind === 'retry'),
      false,
      mode,
    );
  }
});

test('ignores stale events, changed heads, closed PRs, other branches/workflows and forks', async () => {
  for (const mode of [
    'attempt',
    'head',
    'closed',
    'base',
    'branch',
    'workflow',
    'fork',
    'push',
    'running',
    'association',
  ]) {
    const f = fixture();
    f.timeout();
    if (mode === 'attempt') f.run.run_attempt = 2;
    if (mode === 'head') f.pr.head.sha = 'newer';
    if (mode === 'closed') f.pr.state = 'closed';
    if (mode === 'base') f.pr.base.ref = 'release';
    if (mode === 'branch') f.pr.head.ref = 'other';
    if (mode === 'workflow') f.run.path = '.github/workflows/untrusted.yml';
    if (mode === 'fork') f.run.head_repository.full_name = 'stranger/game';
    if (mode === 'push') f.run.event = 'push';
    if (mode === 'running') f.run.status = 'in_progress';
    if (mode === 'association') f.run.pull_requests = [{ number: 99 }];
    assert.equal(await f.execute(), 'ignored', mode);
    assert.equal(f.calls.length, 0, mode);
  }
});

test('reports attention when retry permission is denied, with no secret/error body disclosure', async () => {
  const f = fixture();
  f.timeout();
  f.state.retryDenied = true;
  assert.equal(await f.execute(), 'attention');
  assert.equal(f.calls[1][0], 'warning');
  assert.match(f.calls[2][1].body, /CI needs attention/);
});

test('supports manual integration checks and empty PR associations without declaring empty checks successful', async () => {
  const f = fixture();
  delete f.context.payload.workflow_run;
  f.context.payload.inputs = { run_id: '12' };
  f.run.pull_requests = [];
  assert.equal(await f.execute(), 'passed');
  f.state.jobs = [];
  assert.equal(await f.execute(), 'attention');
  f.context.payload.inputs.run_id = 'not-a-run';
  assert.equal(await f.execute(), 'ignored');
});
