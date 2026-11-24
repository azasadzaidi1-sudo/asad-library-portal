import { describe, expect, it } from 'vitest'
import {
  encryptPayload,
  fromBase64Url,
  sendAll,
  toBase64Url,
  vapidAuthorization,
} from './index.ts'

const subtle = globalThis.crypto.subtle
const decoder = new TextDecoder()

// An ECDH key pair from its base64url public point and private d.
async function keyPair(publicB64, privateB64) {
  const pub = fromBase64Url(publicB64)
  const jwk = { kty: 'EC', crv: 'P-256', x: toBase64Url(pub.slice(1, 33)), y: toBase64Url(pub.slice(33, 65)) }
  return {
    publicKey: await subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
    privateKey: await subtle.importKey('jwk', { ...jwk, d: privateB64 }, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
  }
}

async function hkdf(salt, ikm, info, length) {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

// What the phone does: decrypt with its own private key (RFC 8291, section 3).
async function decryptAsPhone(body, uaPublicB64, uaPrivateB64, authB64) {
  const salt = body.slice(0, 16)
  const idLength = body[20]
  const asPublic = body.slice(21, 21 + idLength)
  const ciphertext = body.slice(21 + idLength)
  const ua = await keyPair(uaPublicB64, uaPrivateB64)
  const asKey = await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256))
  const enc = new TextEncoder()
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...fromBase64Url(uaPublicB64), ...asPublic])
  const ikm = await hkdf(fromBase64Url(authB64), ecdh, info, 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const padded = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext))
  expect(padded[padded.length - 1]).toBe(2) // the last-record delimiter
  return decoder.decode(padded.slice(0, -1))
}

// The worked example in RFC 8291, Appendix A.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_' +
    'yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

describe('encryption (RFC 8291)', () => {
  it('matches the standard\'s worked example byte for byte, and the phone can read it', async () => {
    const body = await encryptPayload(
      { endpoint: 'https://push.example/x', p256dh: RFC.uaPublic, auth: RFC.auth },
      RFC.plaintext,
      { senderKeys: await keyPair(RFC.asPublic, RFC.asPrivate), salt: fromBase64Url(RFC.salt) },
    )
    expect(toBase64Url(body)).toBe(RFC.body)
    expect(await decryptAsPhone(body, RFC.uaPublic, RFC.uaPrivate, RFC.auth)).toBe(RFC.plaintext)
    // The header: salt, record size 4096, the sender's public key.
    expect(toBase64Url(body.slice(0, 16))).toBe(RFC.salt)
    expect([...body.slice(16, 20)]).toEqual([0, 0, 16, 0])
    expect(toBase64Url(body.slice(21, 86))).toBe(RFC.asPublic)
  })

  it('works with fresh keys and salt every time', async () => {
    const phone = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    const pub = toBase64Url(new Uint8Array(await subtle.exportKey('raw', phone.publicKey)))
    const priv = (await subtle.exportKey('jwk', phone.privateKey)).d
    const auth = toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(16)))
    const message = JSON.stringify({ title: 'New message about Piranesi', body: 'Open The Common Shelf to read it.' })
    const one = await encryptPayload({ endpoint: 'https://push.example/x', p256dh: pub, auth }, message)
    const two = await encryptPayload({ endpoint: 'https://push.example/x', p256dh: pub, auth }, message)
    expect(toBase64Url(one)).not.toBe(toBase64Url(two))
    expect(await decryptAsPhone(one, pub, priv, auth)).toBe(message)
  })
})

describe('VAPID', () => {
  it('signs a token the push service can check with the public key', async () => {
    const keys = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const publicKey = toBase64Url(new Uint8Array(await subtle.exportKey('raw', keys.publicKey)))
    const privateKey = (await subtle.exportKey('jwk', keys.privateKey)).d
    const now = Date.UTC(2026, 10, 24, 20, 0)
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc',
      { publicKey, privateKey, subject: 'mailto:someone@example.com' }, now)

    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)
    expect(k).toBe(publicKey)
    const [h, c, s] = token.split('.')
    expect(JSON.parse(decoder.decode(fromBase64Url(c)))).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: now / 1000 + 12 * 60 * 60,
      sub: 'mailto:someone@example.com',
    })
    const valid = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.publicKey,
      fromBase64Url(s), new TextEncoder().encode(`${h}.${c}`))
    expect(valid).toBe(true)
  })
})

describe('sendAll', () => {
  it('counts what was sent and lists devices that are gone', async () => {
    const keys = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
    const vapid = {
      publicKey: toBase64Url(new Uint8Array(await subtle.exportKey('raw', keys.publicKey))),
      privateKey: (await subtle.exportKey('jwk', keys.privateKey)).d,
      subject: 'mailto:someone@example.com',
    }
    const notice = (endpoint) => ({
      endpoint, p256dh: RFC.uaPublic, auth: RFC.auth, title: 't', body: 'b', url: '#messages', tag: 'x',
    })
    const statuses = { 'https://push.example/ok': 201, 'https://push.example/gone': 410, 'https://push.example/busy': 429 }
    const seen = []
    const fetcher = async (url, init) => {
      seen.push(init.headers)
      return { status: statuses[url] }
    }
    const result = await sendAll(
      [notice('https://push.example/ok'), notice('https://push.example/gone'), notice('https://push.example/busy')],
      vapid,
      fetcher,
    )
    expect(result).toEqual({ sent: 1, failed: 1, gone: ['https://push.example/gone'] })
    expect(seen[0]['Content-Encoding']).toBe('aes128gcm')
    expect(seen[0].TTL).toBe('86400')
  })
})
