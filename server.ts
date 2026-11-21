import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

const ERP_ORIGIN = 'https://gietuerp.in';
const PORT = Number(process.env.PORT) || 3000;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BATCH_GRID_USERNAME = 'gietul';
const BATCH_GRID_PASSWORD = 'GIET@2026';

interface ErpSession {
  id: string;
  cookies: Map<string, string>;
  verificationToken: string;
  authenticated: boolean;
  username: string | null;
  updatedAt: number;
}

interface BatchAuthSession {
  token: string;
  username: string;
  updatedAt: number;
}

const sessions = new Map<string, ErpSession>();
const batchSessions = new Map<string, BatchAuthSession>();
const failedBatchAttempts = new Map<string, { count: number; resetAt: number }>();

function safeEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// Periodically purge expired in-memory sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
  for (const [token, batchSession] of batchSessions.entries()) {
    if (now - batchSession.updatedAt > SESSION_TTL_MS) {
      batchSessions.delete(token);
    }
  }
  for (const [ip, record] of failedBatchAttempts.entries()) {
    if (now > record.resetAt) {
      failedBatchAttempts.delete(ip);
    }
  }
}, 15 * 60 * 1000).unref();

function getSetCookies(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof withGetSetCookie.getSetCookie === 'function') {
    return withGetSetCookie.getSetCookie();
  }
  const combined = headers.get('set-cookie');
  return combined ? [combined] : [];
}

function mergeCookies(jar: Map<string, string>, headers: Headers): void {
  const setCookies = getSetCookies(headers);
  for (const raw of setCookies) {
    const firstPart = raw.split(';')[0]?.trim();
    if (!firstPart) continue;
    const eqIndex = firstPart.indexOf('=');
    if (eqIndex <= 0) continue;
    const name = firstPart.slice(0, eqIndex).trim();
    const value = firstPart.slice(eqIndex + 1).trim();
    if (!value) {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
}

function serializeCookies(jar: Map<string, string>): string {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function extractVerificationToken(html: string): string {
  const match = html.match(
    /name="__RequestVerificationToken"[^>]*value="([^"]+)"/i
  );
  if (match?.[1]) return match[1];
  const altMatch = html.match(
    /value="([^"]+)"[^>]*name="__RequestVerificationToken"/i
  );
  return altMatch?.[1] ?? '';
}

function extractLoginError(html: string): string {
  // Look for ASP.NET MVC validation messages or server alert strings
  const validationMatches = Array.from(
    html.matchAll(
      /<span[^>]*class="[^"]*text-danger[^"]*"[^>]*>([\s\S]*?)<\/span>/gi
    )
  )
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);

  if (validationMatches.length > 0) {
    return validationMatches.join(' ');
  }

  const alertMatch = html.match(/alert\(['"]([^'"]+)['"]\)/i);
  if (alertMatch?.[1]) {
    return alertMatch[1].trim();
  }

  const swalMatch = html.match(/swal\([^)]*['"]([^'"]+)['"]/i);
  if (swalMatch?.[1]) {
    return swalMatch[1].trim();
  }

  return 'Invalid username, password, or captcha code. Please try again.';
}

async function fetchLoginBootstrap(session: ErpSession): Promise<string> {
  session.cookies.clear();
  session.authenticated = false;
  session.username = null;
  session.updatedAt = Date.now();

  // Step 1: Load login page to get antiforgery cookie + hidden token
  const loginPageRes = await fetch(`${ERP_ORIGIN}/`, {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  });

  mergeCookies(session.cookies, loginPageRes.headers);
  const html = await loginPageRes.text();
  session.verificationToken = extractVerificationToken(html);

  // Step 2: Fetch captcha PNG using same cookie jar so captcha tempdata binds to session
  const captchaRes = await fetch(`${ERP_ORIGIN}/get-captcha-image`, {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      Cookie: serializeCookies(session.cookies),
      Referer: `${ERP_ORIGIN}/`,
      Accept: 'image/png,image/*,*/*;q=0.8',
    },
  });

  if (!captchaRes.ok) {
    throw new Error(`ERP captcha request failed (${captchaRes.status})`);
  }

  mergeCookies(session.cookies, captchaRes.headers);
  const contentType = captchaRes.headers.get('content-type') || 'image/png';
  const buf = Buffer.from(await captchaRes.arrayBuffer());
  session.updatedAt = Date.now();
  return `data:${contentType};base64,${buf.toString('base64')}`;
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  // Initialize or refresh a GIETU ERP login challenge (antiforgery token + captcha image)
  app.post('/api/erp/init', async (req, res) => {
    try {
      const requestedSid =
        typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
      let session = requestedSid ? sessions.get(requestedSid) : undefined;
      if (!session) {
        const id = crypto.randomBytes(24).toString('hex');
        session = {
          id,
          cookies: new Map<string, string>(),
          verificationToken: '',
          authenticated: false,
          username: null,
          updatedAt: Date.now(),
        };
        sessions.set(id, session);
      }

      const captchaDataUrl = await fetchLoginBootstrap(session);
      res.json({
        ok: true,
        sessionId: session.id,
        captchaDataUrl,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to reach GIETU ERP.';
      res.status(502).json({
        ok: false,
        error: `Could not connect to GIETU ERP (${message}).`,
      });
    }
  });

  // Submit GIETU ERP credentials + captcha to obtain authenticated UserLoginCookie in memory
  app.post('/api/erp/login', async (req, res) => {
    const sessionId =
      typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    const username =
      typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password =
      typeof req.body?.password === 'string' ? req.body.password : '';
    const captcha =
      typeof req.body?.captcha === 'string' ? req.body.captcha.trim() : '';

    const session = sessions.get(sessionId);
    if (!session) {
      res.status(400).json({
        ok: false,
        error: 'Login session expired. Please refresh the captcha and try again.',
      });
      return;
    }

    if (!username || !password || !captcha) {
      res.status(400).json({
        ok: false,
        error: 'Username, password, and captcha code are all required.',
      });
      return;
    }

    try {
      const formBody = new URLSearchParams();
      formBody.set('vchUserName', username);
      formBody.set('vchPassword', password);
      formBody.set('CaptchaCode', captcha);
      if (session.verificationToken) {
        formBody.set('__RequestVerificationToken', session.verificationToken);
      }

      const loginRes = await fetch(`${ERP_ORIGIN}/`, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: ERP_ORIGIN,
          Referer: `${ERP_ORIGIN}/`,
          Cookie: serializeCookies(session.cookies),
        },
        body: formBody.toString(),
        redirect: 'manual',
      });

      mergeCookies(session.cookies, loginRes.headers);
      const location = loginRes.headers.get('location') || '';
      const hasLoginCookie = Boolean(session.cookies.get('UserLoginCookie'));

      if (
        hasLoginCookie ||
        (loginRes.status >= 300 &&
          loginRes.status < 400 &&
          location &&
          !location.toLowerCase().includes('/systemlogin/login'))
      ) {
        // Follow redirect once if ERP sets additional session cookies on landing page
        if (location) {
          const nextUrl = location.startsWith('http')
            ? location
            : `${ERP_ORIGIN}${location.startsWith('/') ? '' : '/'}${location}`;
          try {
            const followRes = await fetch(nextUrl, {
              method: 'GET',
              headers: {
                'User-Agent': USER_AGENT,
                Cookie: serializeCookies(session.cookies),
              },
              redirect: 'manual',
            });
            mergeCookies(session.cookies, followRes.headers);
          } catch {
            // Non-fatal; UserLoginCookie is already stored
          }
        }

        session.authenticated = true;
        session.username = username.toUpperCase();
        session.updatedAt = Date.now();

        res.json({
          ok: true,
          sessionId: session.id,
          username: session.username,
        });
        return;
      }

      // Login rejected — extract error message and provide a fresh captcha immediately
      const html = await loginRes.text();
      const errorMessage = extractLoginError(html);

      let nextCaptchaDataUrl: string | null = null;
      try {
        nextCaptchaDataUrl = await fetchLoginBootstrap(session);
      } catch {
        nextCaptchaDataUrl = null;
      }

      res.status(401).json({
        ok: false,
        error: errorMessage,
        captchaDataUrl: nextCaptchaDataUrl,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Network error';
      res.status(502).json({
        ok: false,
        error: `GIETU ERP login request failed (${message}).`,
      });
    }
  });

  // Check whether a session ID is currently authenticated
  app.get('/api/erp/status', (req, res) => {
    const sid =
      typeof req.query.sid === 'string'
        ? req.query.sid.trim()
        : (req.header('x-erp-session') ?? '').trim();

    const session = sid ? sessions.get(sid) : undefined;
    if (!session || !session.authenticated) {
      res.json({ authenticated: false, username: null });
      return;
    }

    session.updatedAt = Date.now();
    res.json({
      authenticated: true,
      username: session.username,
    });
  });

  // Disconnect & wipe in-memory ERP session cookies
  app.post('/api/erp/logout', (req, res) => {
    const sid =
      typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    if (sid) {
      sessions.delete(sid);
    }
    res.json({ ok: true });
  });

  // Authenticated proxy for GIETU student portrait image
  app.get('/api/erp/photo', async (req, res) => {
    const rawRoll =
      typeof req.query.rollno === 'string' ? req.query.rollno.trim() : '';
    const sid = typeof req.query.sid === 'string' ? req.query.sid.trim() : '';

    const cleanRoll = rawRoll.replace(/\s+/g, '').toUpperCase();
    if (!cleanRoll || !/^[A-Z0-9_-]{2,24}$/.test(cleanRoll)) {
      res.status(400).json({ error: 'INVALID_ROLL' });
      return;
    }

    const session = sid ? sessions.get(sid) : undefined;
    if (!session || !session.authenticated) {
      res.status(401).json({ error: 'ERP_LOGIN_REQUIRED' });
      return;
    }

    try {
      const upstreamUrl = `${ERP_ORIGIN}/Student/GetStudentImage?rollno=${encodeURIComponent(cleanRoll)}`;
      const upstreamRes = await fetch(upstreamUrl, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Cookie: serializeCookies(session.cookies),
          Referer: `${ERP_ORIGIN}/`,
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
        redirect: 'manual',
      });

      if (upstreamRes.status >= 300 && upstreamRes.status < 400) {
        const location = upstreamRes.headers.get('location') || '';
        if (location.toLowerCase().includes('login')) {
          session.authenticated = false;
          res.status(401).json({ error: 'ERP_SESSION_EXPIRED' });
          return;
        }
      }

      const contentType = upstreamRes.headers.get('content-type') || '';
      if (!upstreamRes.ok || !contentType.toLowerCase().startsWith('image/')) {
        res.status(404).json({ error: 'PHOTO_NOT_FOUND' });
        return;
      }

      const imageBuffer = Buffer.from(await upstreamRes.arrayBuffer());
      if (imageBuffer.length === 0) {
        res.status(404).json({ error: 'PHOTO_NOT_FOUND' });
        return;
      }

      session.updatedAt = Date.now();
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(imageBuffer);
    } catch {
      res.status(502).json({ error: 'ERP_UPSTREAM_ERROR' });
    }
  });

  // Batch Square Grid unique username/password authentication
  app.post('/api/batch-auth/login', (req, res) => {
    const clientIp = req.ip || 'unknown';
    const now = Date.now();
    const attempt = failedBatchAttempts.get(clientIp);
    if (attempt && now < attempt.resetAt && attempt.count >= 10) {
      res.status(429).json({
        ok: false,
        error: 'Too many failed attempts. Please wait a few minutes and try again.',
      });
      return;
    }

    const username =
      typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password =
      typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !password) {
      res.status(400).json({
        ok: false,
        error: 'Both username and password are required.',
      });
      return;
    }

    const validUser = safeEqual(
      username.toLowerCase(),
      BATCH_GRID_USERNAME.toLowerCase()
    );
    const validPass = safeEqual(password, BATCH_GRID_PASSWORD);

    if (!validUser || !validPass) {
      const nextCount =
        attempt && now < attempt.resetAt ? attempt.count + 1 : 1;
      failedBatchAttempts.set(clientIp, {
        count: nextCount,
        resetAt: attempt && now < attempt.resetAt ? attempt.resetAt : now + 5 * 60 * 1000,
      });
      res.status(401).json({
        ok: false,
        error: 'Invalid Batch Grid username or password.',
      });
      return;
    }

    failedBatchAttempts.delete(clientIp);
    const token = crypto.randomBytes(24).toString('hex');
    batchSessions.set(token, {
      token,
      username: BATCH_GRID_USERNAME,
      updatedAt: now,
    });

    res.json({
      ok: true,
      token,
      username: BATCH_GRID_USERNAME,
    });
  });

  app.get('/api/batch-auth/status', (req, res) => {
    const token =
      typeof req.query.token === 'string'
        ? req.query.token.trim()
        : (req.header('x-batch-token') ?? '').trim();

    const batchSession = token ? batchSessions.get(token) : undefined;
    if (!batchSession) {
      res.json({ unlocked: false, username: null });
      return;
    }

    batchSession.updatedAt = Date.now();
    res.json({ unlocked: true, username: batchSession.username });
  });

  app.post('/api/batch-auth/logout', (req, res) => {
    const token =
      typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (token) {
      batchSessions.delete(token);
    }
    res.json({ ok: true });
  });

  // Mount Vite middleware in development, or serve built dist/ in production
  const distDir = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distDir);

  if (isProd) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
