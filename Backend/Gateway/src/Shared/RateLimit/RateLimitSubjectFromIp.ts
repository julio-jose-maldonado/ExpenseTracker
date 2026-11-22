import { isIP } from 'node:net';

// A quién se le cuenta el request. Una IPv4 cuenta por dirección. Una IPv6 cuenta por su bloque /64:
// a un cliente se le asigna el bloque entero, y contando por dirección podría cambiarla en cada request.
export function rateLimitSubjectFromIp(ip: string | undefined): string {
  if (!ip) return 'unknown';
  if (isIP(ip) === 4) return ip;
  if (isIP(ip) !== 6) return 'unknown';
  const groups = ipv6Groups(ip);
  // Una IPv4 escrita como IPv6 (`::ffff:1.2.3.4`) es el mismo cliente que la IPv4.
  if (isIpv4Mapped(groups)) return ipv4FromGroups(groups[6] ?? 0, groups[7] ?? 0);
  return `${groups.slice(0, 4).map((group) => group.toString(16)).join(':')}::/64`;
}

// Los 8 grupos de 16 bits de una IPv6 ya validada, expandiendo `::` y la forma con IPv4 al final.
function ipv6Groups(ip: string): number[] {
  // Sin la zona (`fe80::1%eth0`), que no es parte de la dirección.
  const address = ip.split('%')[0] ?? '';
  const [head = '', tail] = address.split('::');
  const headGroups = parseGroups(head);
  const tailGroups = tail === undefined ? [] : parseGroups(tail);
  const zeros = tail === undefined ? [] : Array.from({ length: 8 - headGroups.length - tailGroups.length }, () => 0);
  return [...headGroups, ...zeros, ...tailGroups];
}

function parseGroups(part: string): number[] {
  if (part === '') return [];
  return part.split(':').flatMap((group) => {
    if (!group.includes('.')) return [Number.parseInt(group, 16)];
    // IPv4 al final (`1.2.3.4`): ocupa dos grupos.
    const [a = 0, b = 0, c = 0, d = 0] = group.split('.').map(Number);
    return [a * 256 + b, c * 256 + d];
  });
}

function isIpv4Mapped(groups: number[]): boolean {
  return groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
}

function ipv4FromGroups(high: number, low: number): string {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}
