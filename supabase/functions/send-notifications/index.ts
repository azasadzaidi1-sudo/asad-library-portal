// The Common Shelf: sends push notifications.
//
// A Supabase Edge Function. To deploy it: Supabase -> Edge Functions ->
// Deploy a new function -> Via Editor, name it send-notifications, paste
// this whole file, Deploy. Then in its settings, turn OFF "Verify JWT"
// (the database calls it with its own secret instead, see below).
//
// It needs four secrets (Edge Functions -> Secrets), made on the site's
// push-keys.html page:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  the app's push keys
//   VAPID_SUBJECT                        mailto:your email address
//   NOTIFY_SECRET                        shared with the database (Vault)
//
// Every minute the database (supabase/17_push_notifications.sql) sends it
// the notifications waiting to go out, each with the device it's for. This
// function only encrypts and sends them; it never reads the database. It
// answers with the devices that no longer exist, so the database can
// forget them.
//
// Web Push is done by hand with the browser-standard Web Crypto API
// (RFC 8291 encryption, RFC 8292 VAPID), so there's nothing to install.
// Tested in send-notifications.test.js.

export type Subscription = { endpoint: string; p256dh: string; auth: string }
export type VapidKeys = { publicKey: string; privateKey: string; subject: string }

const encoder = new TextEncoder()

// ---------- base64url ----------

export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
  const binary = atob(base64)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

// ---------- VAPID (who's sending) ----------

// The private key as a Web Crypto signing key. The public key is the
// uncompressed point (0x04 || x || y), the private key the 32-byte d.
async function vapidSigningKey(keys: VapidKeys): Promise<CryptoKey> {
  const pub = fromBase64Url(keys.publicKey)
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64Url(pub.slice(1, 33)),
    y: toBase64Url(pub.slice(33, 65)),
    d: keys.privateKey,
    ext: true,
  }
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

// The Authorization header: a short-lived signed token for the push
// service the device uses (Google, Apple or Mozilla).
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, now = Date.now()): Promise<string> {
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = toBase64Url(encoder.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 60 * 60,
    sub: keys.subject,
  })))
  const unsigned = `${header}.${claims}`
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidSigningKey(keys), encoder.encode(unsigned)),
  )
  return `vapid t=${unsigned}.${toBase64Url(signature)}, k=${keys.publicKey}`
}

// ---------- Encryption (only the device can read it) ----------

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

// RFC 8291 (aes128gcm): returns the request body. The sender key pair and
// salt can be passed in for tests; normally they're new for every message.
export async function encryptPayload(
  subscription: Subscription,
  payload: string,
  options: { senderKeys?: CryptoKeyPair; salt?: Uint8Array } = {},
): Promise<Uint8Array> {
  const uaPublic = fromBase64Url(subscription.p256dh)
  const authSecret = fromBase64Url(subscription.auth)
  const senderKeys = options.senderKeys ??
    (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair)
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', senderKeys.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, senderKeys.privateKey, 256),
  )

  const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12)

  // One record: the text, then the 0x02 delimiter that marks the last record.
  const plaintext = concat(encoder.encode(payload), new Uint8Array([2]))
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext))

  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, 4096)
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext)
}

// ---------- Sending ----------

export type Notice = Subscription & { title: string; body: string; url: string; tag: string }

// The contact in the VAPID token. Apple's push service refuses the token
// unless it's exactly "mailto:" + an email address (or an https address),
// so stray spaces or a missing "mailto:" in the secret are tidied here.
export function normalizeSubject(subject: string): string {
  const value = subject.trim()
  if (/^mailto:/i.test(value)) return 'mailto:' + value.slice(7).trim()
  if (/^https:\/\//i.test(value)) return value
  return value.includes('@') ? 'mailto:' + value : value
}

// Sends one notification. Returns the push service's status (201 means
// accepted; 404 and 410 mean the device is gone) and, if it refused, its
// reason (Apple says why, e.g. {"reason":"BadJwtToken"}).
export async function sendOne(
  notice: Notice,
  keys: VapidKeys,
  fetcher: typeof fetch = fetch,
): Promise<{ status: number; reason: string }> {
  const payload = JSON.stringify({ title: notice.title, body: notice.body, url: notice.url, tag: notice.tag })
  const body = await encryptPayload(notice, payload)
  const response = await fetcher(notice.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(notice.endpoint, keys),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(24 * 60 * 60),
      Urgency: 'normal',
    },
    body,
  })
  const ok = response.status >= 200 && response.status < 300
  const reason = ok ? '' : String(await response.text?.() ?? '').slice(0, 200)
  return { status: response.status, reason }
}

// Sends a batch; returns what happened: the devices that are gone, and for
// each refusal the push service (not the device's address), status and
// reason, so it can be read in the database (net._http_response).
export async function sendAll(notices: Notice[], keys: VapidKeys, fetcher: typeof fetch = fetch) {
  const result = { sent: 0, failed: 0, gone: [] as string[], errors: [] as { service: string; status: number; reason: string }[] }
  const vapid = { ...keys, subject: normalizeSubject(keys.subject) }
  for (const notice of notices) {
    const service = new URL(notice.endpoint).host
    try {
      const { status, reason } = await sendOne(notice, vapid, fetcher)
      if (status >= 200 && status < 300) result.sent++
      else if (status === 404 || status === 410) result.gone.push(notice.endpoint)
      else {
        result.failed++
        result.errors.push({ service, status, reason })
      }
    } catch (error) {
      result.failed++
      result.errors.push({ service, status: 0, reason: String(error).slice(0, 200) })
    }
  }
  if (result.errors.length) console.log('Push refused:', JSON.stringify(result.errors))
  return result
}

// ---------- The function itself ----------

// Deno is the runtime on Supabase; in the tests (Node) it isn't there, so
// the server only starts on Supabase.
type DenoRuntime = {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}
const runtime = (globalThis as { Deno?: DenoRuntime }).Deno

if (runtime) {
  runtime.serve(async (request) => {
    const secret = runtime.env.get('NOTIFY_SECRET')
    if (!secret || request.headers.get('x-notify-secret') !== secret) {
      return new Response('Not allowed', { status: 401 })
    }
    const keys = {
      publicKey: (runtime.env.get('VAPID_PUBLIC_KEY') ?? '').trim(),
      privateKey: (runtime.env.get('VAPID_PRIVATE_KEY') ?? '').trim(),
      subject: (runtime.env.get('VAPID_SUBJECT') ?? '').trim(),
    }
    if (!keys.publicKey || !keys.privateKey || !keys.subject) {
      return new Response('The VAPID secrets are missing', { status: 500 })
    }
    const { notifications = [] } = await request.json()
    const result = await sendAll(notifications, keys)
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
  })
}
