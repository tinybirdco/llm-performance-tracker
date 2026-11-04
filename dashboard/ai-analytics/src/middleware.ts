import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import * as jose from 'jose'
import { getApiUrlFromHost, extractHostFromToken } from './lib/tinybird-utils'

// Multi-tenant mode: users only get data through a per-org JWT, never the shared read token
const isMultiTenant = !!process.env.TINYBIRD_JWT_SECRET

// Basic per-IP rate limit for the AI routes. In-memory, so it only applies per server
// instance (per isolate on Edge). Use a shared store if you need a global limit.
const RATE_LIMITED_ROUTES = ['/api/search', '/api/extract-cost-parameters', '/api/generate-embedding']
const RATE_LIMIT_PER_MINUTE = 30
const rateLimitHits = new Map<string, { count: number; reset: number }>()

function isRateLimited(ip: string) {
  const now = Date.now()
  const entry = rateLimitHits.get(ip)
  if (!entry || now > entry.reset) {
    if (rateLimitHits.size > 10000) rateLimitHits.clear()
    rateLimitHits.set(ip, { count: 1, reset: now + 60_000 })
    return false
  }
  entry.count++
  return entry.count > RATE_LIMIT_PER_MINUTE
}

function responseWithoutJwt() {
  const response = NextResponse.next()
  if (!isMultiTenant) {
    response.headers.set('x-tinybird-token', process.env.NEXT_PUBLIC_TINYBIRD_API_KEY || '')
  }
  return response
}

export default clerkMiddleware(async (auth, request) => {
  if (RATE_LIMITED_ROUTES.includes(request.nextUrl.pathname)) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }
  }

  const authentication = await auth()
  const { userId, sessionId, orgPermissions } = authentication

  // Get the token from the URL if present
  const url = new URL(request.url);
  const tokenParam = url.searchParams.get('token');

  // If token param is present, use it directly
  if (tokenParam) {
    console.log('Using token from URL parameter');
    const response = NextResponse.next();
    response.headers.set('x-tinybird-token', tokenParam);
    
    // Extract host from token and convert to API URL
    const host = extractHostFromToken(tokenParam);
    if (host) {
      const apiUrl = getApiUrlFromHost(host);
      response.headers.set('x-org-name', apiUrl);
    }
    
    return response;
  }

  // If user is not authenticated, continue without a JWT
  if (!userId || !sessionId) {
    console.log('No user or session found')
    return responseWithoutJwt()
  }

  try {
    const orgName = orgPermissions?.[0]?.split(':').pop() || ''

    // An empty organization makes the pipes skip the filter and return every org,
    // so users without an org are treated like logged-out visitors
    if (!orgName) {
      return responseWithoutJwt()
    }

    // Create Tinybird JWT
    const secret = new TextEncoder().encode(process.env.TINYBIRD_JWT_SECRET)
    const token = await new jose.SignJWT({
      workspace_id: process.env.TINYBIRD_WORKSPACE_ID,
      name: `frontend_jwt_user_${userId}`,
      exp: Math.floor(Date.now() / 1000) + (60 * 15), // 15 minute expiration
      iat: Math.floor(Date.now() / 1000),
      scopes: [
        {
          type: "PIPES:READ",
          resource: "generic_counter",
          fixed_params: { organization: orgName }
        },
        {
          type: "PIPES:READ",
          resource: "llm_messages",
          fixed_params: { organization: orgName }
        },
        {
          type: "PIPES:READ",
          resource: "llm_usage",
          fixed_params: { organization: orgName }
        },
        {
          type: "PIPES:READ",
          resource: "llm_dimensions",
          fixed_params: { organization: orgName }
        }
      ], 
      limits: {
        rps: 10
      }
    })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(secret)

    // Clone the response and add token
    const response = NextResponse.next()
    response.headers.set('x-tinybird-token', token)
    response.headers.set('x-org-name', orgName)
    return response
  } catch (error) {
    console.error('Middleware error:', error)
    return responseWithoutJwt()
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
} 