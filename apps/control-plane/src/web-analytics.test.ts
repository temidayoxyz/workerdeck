import { describe, expect, it } from 'vitest';
import { aggregateWebAnalytics } from './web-analytics';

const range = {
  from: '2026-08-12T08:00:00.000Z',
  to: '2026-08-13T08:00:00.000Z',
};

describe('aggregateWebAnalytics', () => {
  it('returns a zeroed shape when Cloudflare has no RUM rows', () => {
    expect(
      aggregateWebAnalytics(range, ['app.example.com'], { pageViews: [], vitals: [] }),
    ).toEqual({
      from: range.from,
      to: range.to,
      sampled: true,
      hostnames: ['app.example.com'],
      visits: 0,
      pageViews: 0,
      vitals: {
        lcpP75: null,
        inpP75: null,
        clsP75: null,
        fcpP75: null,
        ttfbP75: null,
      },
      topPaths: [],
    });
  });

  it('merges top paths across hosts and caps the list at five entries', () => {
    const result = aggregateWebAnalytics(range, ['a.example.com', 'b.example.com'], {
      pageViews: [
        { hostname: 'a.example.com', path: '/', pageViews: 100, visits: 80 },
        { hostname: 'b.example.com', path: '/', pageViews: 90, visits: 70 },
        { hostname: 'a.example.com', path: '/docs', pageViews: 60, visits: 40 },
        { hostname: 'a.example.com', path: '/pricing', pageViews: 50, visits: 30 },
        { hostname: 'a.example.com', path: '/blog', pageViews: 40, visits: 25 },
        { hostname: 'a.example.com', path: '/about', pageViews: 30, visits: 20 },
        { hostname: 'a.example.com', path: '/changelog', pageViews: 20, visits: 15 },
      ],
      vitals: [],
    });
    expect(result.pageViews).toBe(390);
    expect(result.visits).toBe(280);
    expect(result.topPaths).toEqual([
      { path: '/', pageViews: 190, visits: 150 },
      { path: '/docs', pageViews: 60, visits: 40 },
      { path: '/pricing', pageViews: 50, visits: 30 },
      { path: '/blog', pageViews: 40, visits: 25 },
      { path: '/about', pageViews: 30, visits: 20 },
    ]);
  });

  it('weights Core Web Vitals p75 values by each hostname page views', () => {
    const result = aggregateWebAnalytics(range, ['a.example.com', 'b.example.com'], {
      pageViews: [
        { hostname: 'a.example.com', path: '/', pageViews: 300, visits: 200 },
        { hostname: 'b.example.com', path: '/', pageViews: 100, visits: 90 },
      ],
      vitals: [
        {
          hostname: 'a.example.com',
          lcpP75: 2000,
          inpP75: 200,
          clsP75: 0.1,
          fcpP75: 1500,
          ttfbP75: 500,
        },
        {
          hostname: 'b.example.com',
          lcpP75: 4000,
          inpP75: 400,
          clsP75: 0.2,
          fcpP75: 2500,
          ttfbP75: 1000,
        },
      ],
    });
    // Host a carries 300 of 400 page views.
    expect(result.vitals.lcpP75).toBeCloseTo(2500);
    expect(result.vitals.inpP75).toBeCloseTo(250);
    expect(result.vitals.clsP75).toBeCloseTo(0.125);
    expect(result.vitals.fcpP75).toBeCloseTo(1750);
    expect(result.vitals.ttfbP75).toBeCloseTo(625);
  });

  it('falls back to an unweighted mean when only vitals rows exist', () => {
    const result = aggregateWebAnalytics(range, ['a.example.com'], {
      pageViews: [],
      vitals: [
        {
          hostname: 'a.example.com',
          lcpP75: 2000,
          inpP75: null,
          clsP75: null,
          fcpP75: null,
          ttfbP75: null,
        },
        {
          hostname: 'a.example.com',
          lcpP75: 3000,
          inpP75: null,
          clsP75: null,
          fcpP75: null,
          ttfbP75: null,
        },
      ],
    });
    expect(result.vitals.lcpP75).toBe(2500);
    expect(result.vitals.inpP75).toBeNull();
    expect(result.visits).toBe(0);
  });
});
