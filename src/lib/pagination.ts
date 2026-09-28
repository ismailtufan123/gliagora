// Page numbers for list pagination (PLAN §7.5): real links, no infinite scroll. Long lists show
// the first and last page, the pages around the current one, and a gap where pages are left out.

export type PageItem = number | 'gap'

/**
 * The page links to show for page `current` of `pages`: always the first and the last, `around`
 * pages on each side of the current one, and 'gap' for a run of left-out pages (a single left-out
 * page is shown instead, since the gap would take as much room).
 */
export function pageWindow(current: number, pages: number, around = 1): PageItem[] {
  if (pages <= 1) return []
  const shown = new Set([1, pages])
  for (let page = current - around; page <= current + around; page++) {
    if (page >= 1 && page <= pages) shown.add(page)
  }
  const sorted = [...shown].sort((a, b) => a - b)
  const items: PageItem[] = []
  for (const [index, page] of sorted.entries()) {
    const previous = sorted[index - 1]
    if (previous !== undefined && page - previous === 2) items.push(page - 1)
    else if (previous !== undefined && page - previous > 2) items.push('gap')
    items.push(page)
  }
  return items
}
