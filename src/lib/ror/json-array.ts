const isSpace = (char: string) => char === ' ' || char === '\n' || char === '\r' || char === '\t'

/**
 * Reads the objects of a top-level JSON array one at a time from a stream of chunks, so a large
 * file (the ROR dump is over 300 MB) is never held in memory as a whole. Each object is parsed
 * with `JSON.parse`; the scanner only finds where objects start and end, keeping track of strings
 * and escapes so brackets inside names do not count.
 */
export async function* jsonArrayObjects(
  chunks: AsyncIterable<Uint8Array | string>,
): AsyncGenerator<unknown> {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let state = 'before' as 'before' | 'items' | 'after'
  let depth = 0
  let inString = false
  let escaped = false
  // The part of the current object that arrived in earlier chunks.
  let carried = ''
  let start = 0

  const scan = function* (text: string): Generator<unknown> {
    start = 0
    for (let i = 0; i < text.length; i++) {
      const char = text.charAt(i)
      if (depth > 0) {
        if (inString) {
          if (escaped) escaped = false
          else if (char === '\\') escaped = true
          else if (char === '"') inString = false
        } else if (char === '"') inString = true
        else if (char === '{' || char === '[') depth++
        else if (char === '}' || char === ']') {
          depth--
          if (depth === 0) {
            yield JSON.parse(carried + text.slice(start, i + 1))
            carried = ''
          }
        }
        continue
      }
      if (isSpace(char)) continue
      if (state === 'before' && char === '[') state = 'items'
      else if (state === 'items' && char === '{') {
        depth = 1
        start = i
      } else if (state === 'items' && char === ',') continue
      else if (state === 'items' && char === ']') state = 'after'
      else throw new Error(`Unexpected ${JSON.stringify(char)} in the JSON array`)
    }
    if (depth > 0) carried += text.slice(start)
  }

  for await (const chunk of chunks) {
    yield* scan(typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true }))
  }
  yield* scan(decoder.decode())
  if (state !== 'after') throw new Error('The JSON array ends early')
}
