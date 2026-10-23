import { createMiddleware } from 'hono/factory';
import { errorResponse } from './errors';

export const rateLimit = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const client = rateLimitClient(c.req.header('CF-Connecting-IP'));
  const { success } = await c.env.API_RATE_LIMITER.limit({ key: `somequote:api:${client}` });
  if (!success) {
    c.header('Retry-After', '60');
    return errorResponse(
      c,
      429,
      'rate_limited',
      'Too many requests. Please try again in a minute.',
    );
  }
  return next();
});

/**
 * The rate limit bucket for a client address. One IPv6 host usually controls a whole /64 and can
 * rotate through it freely, so IPv6 addresses share a bucket per /64 prefix.
 */
export function rateLimitClient(ip: string | undefined): string {
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  if (ip.includes('.')) return ip.slice(ip.lastIndexOf(':') + 1);
  const [head = '', tail] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups =
    tail === undefined
      ? left
      : [
          ...left,
          ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'),
          ...right,
        ];
  const prefix = groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, ''));
  return `${prefix.join(':')}::/64`;
}
