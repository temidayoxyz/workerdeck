export function BrandMark({ className = 'brand-mark' }: { className?: string }): React.JSX.Element {
  return (
    <svg className={className} viewBox="0 0 36 36" aria-hidden="true">
      <path
        className="brand-mark-frame"
        d="M11.2 3.8h13.6l7.4 7.4v7.1M24.8 32.2H11.2l-7.4-7.4V11.2l7.4-7.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="brand-mark-route"
        d="m8.7 11.6 5 13 4.3-8.4 4.3 8.4 5-13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="brand-mark-edge"
        d="M27.3 22.8h5.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle className="brand-mark-node" cx="33.1" cy="22.8" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function Brand(): React.JSX.Element {
  return (
    <span className="brand">
      <BrandMark />
      <span className="brand-word">WorkerDeck</span>
    </span>
  );
}
