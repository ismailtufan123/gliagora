import { describe, expect, it } from 'vitest'

import { pageWindow } from './pagination'

describe('pageWindow', () => {
  it('shows nothing for a single page', () => {
    expect(pageWindow(1, 0)).toEqual([])
    expect(pageWindow(1, 1)).toEqual([])
  })

  it('shows every page of a short list', () => {
    expect(pageWindow(1, 2)).toEqual([1, 2])
    expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('keeps the first and last pages and the neighbours of the current one', () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, 'gap', 10])
    expect(pageWindow(6, 10)).toEqual([1, 'gap', 5, 6, 7, 'gap', 10])
    expect(pageWindow(10, 10)).toEqual([1, 'gap', 9, 10])
  })

  it('shows a single left-out page instead of a gap', () => {
    expect(pageWindow(4, 10)).toEqual([1, 2, 3, 4, 5, 'gap', 10])
    expect(pageWindow(7, 10)).toEqual([1, 'gap', 6, 7, 8, 9, 10])
  })
})
