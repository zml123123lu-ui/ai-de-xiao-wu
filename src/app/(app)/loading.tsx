export default function AppLoading() {
  return <div className="page narrow-page skeleton-page" aria-busy="true" aria-live="polite">
    <span className="sr-only">正在打开这一页…</span>
    <div className="skeleton-line skeleton-title" />
    <div className="skeleton-line skeleton-lead" />
    <div className="skeleton-card">
      <div className="skeleton-line skeleton-meta" />
      <div className="skeleton-line" />
      <div className="skeleton-line" />
      <div className="skeleton-line skeleton-short" />
    </div>
    <div className="skeleton-card">
      <div className="skeleton-line skeleton-meta" />
      <div className="skeleton-line skeleton-short" />
    </div>
  </div>;
}
