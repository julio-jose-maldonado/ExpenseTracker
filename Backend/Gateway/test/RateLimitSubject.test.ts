import { rateLimitSubjectFromIp } from '../src/Shared/RateLimit/RateLimitSubjectFromIp';

describe('rateLimitSubjectFromIp', () => {
  it('una IPv4 cuenta por dirección', () => {
    expect(rateLimitSubjectFromIp('203.0.113.7')).toBe('203.0.113.7');
  });

  it('una IPv4 escrita como IPv6 cuenta igual que la IPv4', () => {
    expect(rateLimitSubjectFromIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('una IPv4 escrita como IPv6 en hexadecimal también cuenta como la IPv4', () => {
    expect(rateLimitSubjectFromIp('::ffff:cb00:7107')).toBe('203.0.113.7');
    expect(rateLimitSubjectFromIp('0:0:0:0:0:FFFF:203.0.113.7')).toBe('203.0.113.7');
  });

  it('una IPv6 con zona cuenta por su bloque, sin la zona', () => {
    expect(rateLimitSubjectFromIp('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });

  // A un cliente con IPv6 se le asigna un bloque /64 entero: si se contara por dirección,
  // podría cambiar de dirección en cada request y no llegar nunca al límite.
  it('una IPv6 cuenta por su bloque /64', () => {
    expect(rateLimitSubjectFromIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(rateLimitSubjectFromIp('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64');
    expect(rateLimitSubjectFromIp('2001:0db8:0001:0002::1')).toBe('2001:db8:1:2::/64');
  });

  it('expande la forma abreviada antes de tomar el bloque', () => {
    expect(rateLimitSubjectFromIp('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(rateLimitSubjectFromIp('::1')).toBe('0:0:0:0::/64');
  });

  it('sin IP, o con un valor que no es una IP, todos comparten un mismo contador', () => {
    expect(rateLimitSubjectFromIp(undefined)).toBe('unknown');
    expect(rateLimitSubjectFromIp('not-an-ip')).toBe('unknown');
  });
});
