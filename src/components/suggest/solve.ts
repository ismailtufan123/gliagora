import type { SpamChallenge } from '@/lib/forms/altcha'

// The browser's half of the spam check (src/lib/forms/altcha.ts), instead of the ALTCHA widget:
// find the number n for which SHA-256(salt + n) is the challenge, trying 0, 1, 2 … up to
// `maxnumber`. The hashes of each batch run in parallel in the browser's own crypto code. The page
// stays responsive because the solver gives the browser a turn after each batch: in Chromium the
// hashes' promises settle without one, so the whole search would otherwise be one long task that
// blocks typing, clicks and painting. Returns the answer in ALTCHA's format (base64 of JSON), or
// null if there is none or the browser cannot hash (crypto.subtle exists only on https pages and
// on localhost).

const BATCH = 500

type Scheduler = { yield?: () => Promise<void> }

/**
 * Lets the browser handle input and paint before the next batch: `scheduler.yield()` where it
 * exists (Chromium, Firefox), otherwise a timer, which browsers delay to at least 4 ms after a few
 * in a row.
 */
function giveWay(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: Scheduler }).scheduler
  if (typeof scheduler?.yield === 'function') return scheduler.yield()
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export async function solveChallenge(spam: SpamChallenge): Promise<string | null> {
  const { algorithm, challenge, maxnumber, salt, signature } = spam
  try {
    const encoder = new TextEncoder()
    const target = Uint8Array.from(challenge.match(/../g) ?? [], (byte) => parseInt(byte, 16))
    for (let start = 0; start <= maxnumber; start += BATCH) {
      const tries: Promise<ArrayBuffer>[] = []
      for (let n = start; n < start + BATCH && n <= maxnumber; n++) {
        tries.push(crypto.subtle.digest(algorithm, encoder.encode(salt + n)))
      }
      const hashes = await Promise.all(tries)
      for (let i = 0; i < hashes.length; i++) {
        const bytes = new Uint8Array(hashes[i]!)
        if (bytes[0] === target[0] && bytes.every((byte, j) => byte === target[j])) {
          const number = start + i
          return btoa(JSON.stringify({ algorithm, challenge, number, salt, signature }))
        }
      }
      await giveWay()
    }
  } catch {
    // No crypto.subtle: the server then asks for the spam check again, with the email alternative.
  }
  return null
}
