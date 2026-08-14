import type { EmailRoutingAddress } from '@workerdeck/contracts';

export interface EmailRoutingZone {
  zoneId: string;
  zoneName: string;
  hostnames: string[];
}

export function selectEmailRoutingZone(
  zones: EmailRoutingZone[],
  requestedZoneId: string | null,
): EmailRoutingZone | null {
  if (zones.length === 0) return null;
  if (!requestedZoneId) return zones[0] ?? null;
  return zones.find((zone) => zone.zoneId === requestedZoneId) ?? null;
}

export function isVerifiedDestination(addresses: EmailRoutingAddress[], email: string): boolean {
  return addresses.some(
    (address) => address.email.toLowerCase() === email.toLowerCase() && address.verified,
  );
}
