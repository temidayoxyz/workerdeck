import { AlertCircle, ArrowRight } from '../components/icon';
import { Link } from 'react-router-dom';

export function NotFoundPage(): React.JSX.Element {
  return (
    <section className="placeholder-surface panel route-not-found">
      <span className="route-not-found__icon">
        <AlertCircle size={23} />
      </span>
      <span className="eyebrow">Route not found</span>
      <h1>This dashboard page does not exist.</h1>
      <p>The address may be outdated. Your projects and Cloudflare resources are unchanged.</p>
      <Link className="button button--primary" to="/">
        Return to overview <ArrowRight size={15} />
      </Link>
    </section>
  );
}
