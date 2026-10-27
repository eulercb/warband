// Runs from the default branch only. Never loads PR code, logs or artifacts.
export const MARKER = '<!-- warband-ci-completion -->';

export async function completeCI({ github, context, core }) {
  const repo = context.repo;
  const trigger = context.payload.workflow_run;
  const runId = trigger?.id ?? context.payload.inputs?.run_id;
  if (!/^\d+$/.test(String(runId))) return 'ignored';
  const { data: run } = await github.rest.actions.getWorkflowRun({ ...repo, run_id: runId });
  const sameRepo = `${repo.owner}/${repo.repo}`;
  if (
    run.status !== 'completed' ||
    run.event !== 'pull_request' ||
    run.path !== '.github/workflows/ci.yml' ||
    run.head_repository?.full_name !== sameRepo ||
    (trigger && trigger.run_attempt !== run.run_attempt)
  )
    return 'ignored';

  const prs = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, {
    ...repo,
    commit_sha: run.head_sha,
    per_page: 100,
  });
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
    ...repo,
    run_id: run.id,
    filter: 'latest',
    per_page: 100,
  });
  const failed = jobs.filter((j) => j.conclusion !== 'success');
  const passed = jobs.length > 0 && failed.length === 0 && run.conclusion === 'success';
  let retryJob;
  // Retry only ONE isolated, confirmed job timeout, once per run. Never retry
  // assertion failures, manual cancellations, mixed failures or repeat timeouts.
  if (!passed && run.run_attempt === 1 && failed.length === 1) {
    const job = failed[0];
    if (
      ['cancelled', 'timed_out'].includes(job.conclusion) &&
      !job.steps.some((s) => s.conclusion === 'failure')
    ) {
      const checkId = job.check_run_url?.match(/\/check-runs\/(\d+)$/)?.[1];
      if (checkId) {
        const annotations = await github.paginate(github.rest.checks.listAnnotations, {
          ...repo,
          check_run_id: Number(checkId),
          per_page: 100,
        });
        if (annotations.some((a) => /exceeded the maximum execution time/i.test(a.message)))
          retryJob = job;
      }
    }
  }

  let result = 'ignored';
  for (const candidate of prs) {
    // Re-read the PR: an older run must not describe or retry a newer head.
    const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: candidate.number });
    if (
      pr.state !== 'open' ||
      pr.head.sha !== run.head_sha ||
      pr.head.ref !== run.head_branch ||
      pr.base.ref !== context.payload.repository.default_branch ||
      (run.pull_requests.length > 0 && !run.pull_requests.some((p) => p.number === pr.number)) ||
      pr.head.repo?.full_name !== sameRepo
    )
      continue;

    let retrying = false;
    if (retryJob) {
      try {
        await github.rest.actions.reRunJobForWorkflowRun({ ...repo, job_id: retryJob.id });
        retrying = true;
        retryJob = undefined;
      } catch (error) {
        core.warning(
          `Automatic timeout retry was unavailable (HTTP ${error.status ?? 'unknown'}).`,
        );
      }
    }
    result = passed ? 'passed' : retrying ? 'retrying' : 'attention';
    // Names are display-only; never interpolate PR/job data into executable code.
    const safeName = (s) => s.replace(/[\r\n|`<>[\]@]/g, ' ');
    const title = passed
      ? `CI passed: ${jobs.length}/${jobs.length} checks`
      : retrying
        ? 'CI: retrying one confirmed timeout'
        : 'CI needs attention';
    const body = [
      MARKER,
      `### ${title}`,
      '',
      `Head: \`${run.head_sha}\` · [CI run, attempt ${run.run_attempt}](${run.html_url})`,
      '',
      ...(passed
        ? ['All checks passed for this head. The PR can proceed to human review and live testing.']
        : retrying
          ? [
              'One job exceeded its execution time. Only that job is being retried; the remaining results are preserved. This comment will update when it finishes.',
            ]
          : [
              'Review the non-passing checks below. No further automatic retry will be attempted for this result.',
            ]),
      '',
      ...failed.map((j) => `- [${safeName(j.name)}](${j.html_url}): ${j.conclusion ?? j.status}`),
      '',
      'This automation reports CI and never approves, merges or deploys the PR.',
    ].join('\n');
    const comments = await github.paginate(github.rest.issues.listComments, {
      ...repo,
      issue_number: pr.number,
      per_page: 100,
    });
    const prior = comments.find(
      (c) => c.user.login === 'github-actions[bot]' && c.body.startsWith(MARKER),
    );
    if (prior) await github.rest.issues.updateComment({ ...repo, comment_id: prior.id, body });
    else await github.rest.issues.createComment({ ...repo, issue_number: pr.number, body });
  }
  return result;
}
