import { describe, expect, it } from 'vitest'

import { jsonArrayObjects } from './json-array'

async function collect(chunks: (string | Uint8Array)[]) {
  const items: unknown[] = []
  async function* source() {
    yield* chunks
  }
  for await (const item of jsonArrayObjects(source())) items.push(item)
  return items
}

/** Splits `text` into chunks of `size` characters (or bytes, when `bytes` is set). */
function split(text: string, size: number, bytes = false): (string | Uint8Array)[] {
  const data = bytes ? new TextEncoder().encode(text) : text
  const chunks = []
  for (let i = 0; i < data.length; i += size) chunks.push(data.slice(i, i + size))
  return chunks
}

const RECORDS = [
  { id: 'https://ror.org/05dxps055', names: [{ value: 'California Institute of Technology' }] },
  { id: 'x', names: [{ value: 'Brackets } ] { [ and "quotes" and \\ backslash' }] },
  {
    id: 'y',
    names: [{ value: 'İstanbul Üniversitesi — 東京大学 🧠' }],
    nested: { a: [1, [2, {}]] },
  },
  { id: 'z', empty: {}, list: [] },
]

describe('jsonArrayObjects', () => {
  const pretty = JSON.stringify(RECORDS, null, 4)
  const compact = JSON.stringify(RECORDS)

  it('reads every object of a pretty-printed or compact array', async () => {
    expect(await collect([pretty])).toEqual(RECORDS)
    expect(await collect([compact])).toEqual(RECORDS)
  })

  it.each([1, 2, 3, 7, 64])('gives the same result for %i-character chunks', async (size) => {
    expect(await collect(split(pretty, size))).toEqual(RECORDS)
  })

  it.each([1, 2, 5])(
    'decodes UTF-8 characters that are split between %i-byte chunks',
    async (size) => {
      expect(await collect(split(compact, size, true))).toEqual(RECORDS)
    },
  )

  it('reads an empty array', async () => {
    expect(await collect(['[ ]\n'])).toEqual([])
  })

  it('rejects a file that is not an array of objects', async () => {
    await expect(collect(['{"a": 1}'])).rejects.toThrow()
    await expect(collect(['[1, 2]'])).rejects.toThrow()
    await expect(collect(['["a"]'])).rejects.toThrow()
  })

  it('rejects a truncated file', async () => {
    await expect(collect([compact.slice(0, -1)])).rejects.toThrow(/ends early/)
    await expect(collect([compact.slice(0, 40)])).rejects.toThrow(/ends early/)
  })

  it('rejects content after the array', async () => {
    await expect(collect(['[{}] x'])).rejects.toThrow()
  })

  it('rejects invalid UTF-8', async () => {
    await expect(collect([new Uint8Array([0x5b, 0x7b, 0x22, 0xff, 0x22])])).rejects.toThrow()
  })
})
