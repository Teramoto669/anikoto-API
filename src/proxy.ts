import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function isAllowedOrigin(origin: string | null, allowedOriginsEnv: string): boolean {
  if (allowedOriginsEnv === '*') return true;
  if (!origin) return false;

  const allowedList = allowedOriginsEnv.split(',').map((o) => o.trim());
  if (allowedList.includes(origin)) return true;

  // Only permit localhost for local dev if allowedOriginsEnv is '*' or explicitly permits localhost
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
    return true;
  }

  return false;
}

export function proxy(request: NextRequest) {
  const allowedOriginsEnv =
    process.env.CORS_ALLOWED_ORIGIN ||
    process.env.CORS_ALLOWED_ORIGINS ||
    process.env.ANIKOTO_API_CORS_ALLOWED_ORIGINS ||
    '*';

  const requestOrigin = request.headers.get('origin');
  const originAllowed = isAllowedOrigin(requestOrigin, allowedOriginsEnv);

  const effectiveOrigin = allowedOriginsEnv === '*' ? '*' : (originAllowed ? requestOrigin! : '');

  // Handle preflight OPTIONS request
  if (request.method === 'OPTIONS') {
    if (!originAllowed && allowedOriginsEnv !== '*') {
      return new NextResponse(null, { status: 403 });
    }

    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': effectiveOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers':
          'Content-Type, Authorization, X-Requested-With, Cache-Control, Pragma',
        'Access-Control-Max-Age': '86400',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    });
  }

  const response = NextResponse.next();

  if (effectiveOrigin) {
    response.headers.set('Access-Control-Allow-Origin', effectiveOrigin);
  }
  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Cache-Control, Pragma'
  );

  // Security Headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
