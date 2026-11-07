import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'fallback_secret_32_characters_long';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret_32_characters';
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES_IN || '15m';

export interface JwtUserPayload {
  sub: string;
  email: string;
  role: 'super_admin' | 'org_admin' | 'guardian' | 'device_user';
}

export function signAccessToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES } as jwt.SignOptions);
}

export function signRefreshToken(userId: string): string {
  const expiresInDays = parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS || '30', 10);
  return jwt.sign({ sub: userId }, REFRESH_SECRET, { expiresIn: `${expiresInDays}d` } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JwtUserPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtUserPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, REFRESH_SECRET) as { sub: string };
}
