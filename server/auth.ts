/**
 * auth.ts – Authentication helpers (password hashing, JWT tokens)
 * Uses Node.js built-in crypto module — no external dependencies needed.
 */

import crypto from 'crypto'

/* ═══════════════════════ Config ═══════════════════════ */

const JWT_SECRET = process.env.JWT_SECRET || 'trip-planner-secret-key-2026'
const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/* ═══════════════════════ Password Hashing ═══════════════════════ */

/**
 * Hash a password with PBKDF2 + random salt.
 * Returns "salt:hash" string for storage.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex')
  return `${salt}:${hash}`
}

/**
 * Verify a password against a stored "salt:hash" string.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const verify = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex')
  return hash === verify
}

/* ═══════════════════════ JWT Tokens ═══════════════════════ */

interface TokenPayload {
  userId: number
  email: string
  iat: number
  exp: number
}

/**
 * Create a signed JWT token.
 */
export function createToken(userId: number, email: string): string {
  const now = Date.now()
  const payload: TokenPayload = {
    userId,
    email,
    iat: now,
    exp: now + TOKEN_EXPIRY_MS,
  }

  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64url(JSON.stringify(payload))
  const signature = sign(`${header}.${body}`)

  return `${header}.${body}.${signature}`
}

/**
 * Verify and decode a JWT token. Returns payload or null if invalid/expired.
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [header, body, sig] = parts
    if (sign(`${header}.${body}`) !== sig) return null

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload
    if (payload.exp < Date.now()) return null

    return payload
  } catch {
    return null
  }
}

/**
 * Express middleware to extract user from Authorization header.
 * Sets req.user if valid token found. Does NOT reject — allows anonymous access.
 */
export function optionalAuth(req: any, _res: any, next: any) {
  const authHeader = req.headers.authorization as string | undefined
  if (authHeader?.startsWith('Bearer ')) {
    const payload = verifyToken(authHeader.slice(7))
    if (payload) {
      req.user = { id: payload.userId, email: payload.email }
    }
  }
  next()
}

/**
 * Express middleware that REQUIRES authentication.
 * Returns 401 if no valid token.
 */
export function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization as string | undefined
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'AUTH_REQUIRED', message: '请先登录' })
  }
  const payload = verifyToken(authHeader.slice(7))
  if (!payload) {
    return res.status(401).json({ error: 'TOKEN_INVALID', message: '登录已过期，请重新登录' })
  }
  req.user = { id: payload.userId, email: payload.email }
  next()
}

/* ═══════════════════════ Verification Codes ═══════════════════════ */

/**
 * Generate a 6-digit verification code.
 */
export function generateVerificationCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

/* ═══════════════════════ Helpers ═══════════════════════ */

function base64url(str: string): string {
  return Buffer.from(str).toString('base64url')
}

function sign(data: string): string {
  return crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url')
}
