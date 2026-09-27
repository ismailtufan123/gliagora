// The deadline gauge on job rows (PLAN §3.2, §7.5): five segments, fuller as the deadline nears
// (`deadlineGauge` in src/lib/jobs/deadline.ts). Decorative: the text next to it states the days left.
export function DeadlineGauge({ filled, soon }: { filled: number; soon: boolean }) {
  return (
    <span className="deadline-gauge" data-soon={soon ? '' : undefined} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((segment) => (
        <span key={segment} data-filled={segment <= filled ? '' : undefined} />
      ))}
    </span>
  )
}
