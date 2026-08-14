import type { WebAnalytics } from '@workerdeck/contracts';
import type { WebAnalyticsRows } from '@workerdeck/provider';

export function aggregateWebAnalytics(
  range: { from: string; to: string },
  hostnames: string[],
  rows: WebAnalyticsRows,
): WebAnalytics {
  const pageViews = rows.pageViews.reduce((total, row) => total + row.pageViews, 0);
  const visits = rows.pageViews.reduce((total, row) => total + row.visits, 0);
  const pathTotals = new Map<string, { pageViews: number; visits: number }>();
  for (const row of rows.pageViews) {
    const path = row.path.trim() || '/';
    const totals = pathTotals.get(path) ?? { pageViews: 0, visits: 0 };
    totals.pageViews += row.pageViews;
    totals.visits += row.visits;
    pathTotals.set(path, totals);
  }
  const topPaths = [...pathTotals.entries()]
    .map(([path, totals]) => ({ path, ...totals }))
    .sort((left, right) => right.pageViews - left.pageViews)
    .slice(0, 5);
  const pageViewsByHost = new Map<string, number>();
  for (const row of rows.pageViews) {
    pageViewsByHost.set(row.hostname, (pageViewsByHost.get(row.hostname) ?? 0) + row.pageViews);
  }
  const combine = (
    metric: 'lcpP75' | 'inpP75' | 'clsP75' | 'fcpP75' | 'ttfbP75',
  ): number | null => {
    const samples: Array<{ value: number; weight: number }> = [];
    for (const row of rows.vitals) {
      const value = row[metric];
      if (value === null) continue;
      samples.push({ value, weight: pageViewsByHost.get(row.hostname) ?? 0 });
    }
    if (samples.length === 0) return null;
    const totalWeight = samples.reduce((total, sample) => total + sample.weight, 0);
    if (totalWeight === 0) {
      return samples.reduce((total, sample) => total + sample.value, 0) / samples.length;
    }
    return samples.reduce((total, sample) => total + sample.value * sample.weight, 0) / totalWeight;
  };
  return {
    from: range.from,
    to: range.to,
    sampled: true,
    hostnames,
    visits,
    pageViews,
    vitals: {
      lcpP75: combine('lcpP75'),
      inpP75: combine('inpP75'),
      clsP75: combine('clsP75'),
      fcpP75: combine('fcpP75'),
      ttfbP75: combine('ttfbP75'),
    },
    topPaths,
  };
}
