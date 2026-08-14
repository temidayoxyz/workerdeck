import { describe, expect, it } from 'vitest';
import { isVerifiedDestination, selectEmailRoutingZone } from './email-routing';

const zones = [
  { zoneId: 'zone-alpha', zoneName: 'alpha.example.com', hostnames: ['alpha.example.com'] },
  {
    zoneId: 'zone-beta',
    zoneName: 'beta.example.com',
    hostnames: ['beta.example.com', 'www.beta.example.com'],
  },
];

describe('email routing helpers', () => {
  it('selects the first zone by default and honors an explicit zone id', () => {
    expect(selectEmailRoutingZone(zones, null)).toEqual(zones[0]);
    expect(selectEmailRoutingZone(zones, 'zone-beta')).toEqual(zones[1]);
    expect(selectEmailRoutingZone(zones, 'zone-missing')).toBeNull();
    expect(selectEmailRoutingZone([], 'zone-alpha')).toBeNull();
  });

  it('only treats verified destination addresses as usable', () => {
    const addresses = [
      {
        id: 'verified',
        email: 'temidayoxyz@gmail.com',
        verified: true,
        createdAt: null,
      },
      {
        id: 'pending',
        email: 'team@example.com',
        verified: false,
        createdAt: null,
      },
    ];
    expect(isVerifiedDestination(addresses, 'TEMIDAYOXYZ@GMAIL.COM')).toBe(true);
    expect(isVerifiedDestination(addresses, 'team@example.com')).toBe(false);
    expect(isVerifiedDestination(addresses, 'nobody@example.com')).toBe(false);
  });
});
