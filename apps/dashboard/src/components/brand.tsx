import { useId } from 'react';

export function BrandMark({ className = 'brand-mark' }: { className?: string }): React.JSX.Element {
  const maskId = useId();

  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="white" />
          <path d="M24.75 15.5h6.4l8.5 8.5-8.5 8.5h-6.4l8.5-8.5z" fill="black" />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        <path className="brand-layer-bottom" d="M4 33 24 23l20 10-20 10z" />
        <path className="brand-layer-middle" d="M4 24 24 14l20 10-20 10z" />
        <path className="brand-layer-top" d="M4 15 24 5l20 10-20 10z" />
      </g>
    </svg>
  );
}

export function Brand(): React.JSX.Element {
  return (
    <span className="brand">
      <BrandMark />
      <span className="brand-word">
        Worker<span>Deck</span>
      </span>
    </span>
  );
}
