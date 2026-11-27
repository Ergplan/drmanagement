/** Empty state for a screen that a later stage brings to life. */
export function Placeholder({ title, arrives }: { title: string; arrives: string }) {
  return (
    <section className="glass pad-l stack" aria-live="polite">
      <div className="ttl">{title}</div>
      <p className="note" style={{ margin: 0 }}>
        This screen is wired into the app and goes live in {arrives} of the build. Its approved design is in
        design/canvas.
      </p>
    </section>
  );
}
