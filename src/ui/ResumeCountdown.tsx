/**
 * Warband — full-screen "resuming in N…" countdown shown to every player after
 * a resume is requested, so nobody is caught off-guard when control returns. The
 * host drives the actual number over the wire; this just renders it big.
 */
export default function ResumeCountdown({ count }: { count: number }) {
  return (
    <div className="wb-resume-overlay" role="status" aria-live="assertive">
      <div className="wb-resume-label">Resuming in</div>
      <div className="wb-resume-count" key={count}>
        {Math.max(1, count)}
      </div>
      <div className="wb-resume-sub">Get ready…</div>
    </div>
  );
}
