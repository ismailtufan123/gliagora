import { Icon } from '@/components/Icon'
import type { ReactNode } from 'react'

import { SEARCH_MAX_LENGTH } from '@/lib/search/parse'
import { paths } from '@/lib/site'

// The search form of the search page and of the header's search dialog (PLAN §3.2, §7.5): a
// plain GET form to /en/search/, so it works without JavaScript and from every locale (the search
// page is English, like the windows).
export function SearchForm({
  inputId,
  labelId,
  label,
  submit,
  defaultValue,
  children,
}: {
  inputId: string
  labelId?: string
  label: string
  submit: string
  defaultValue?: string
  /** Hints below the field. */
  children?: ReactNode
}) {
  return (
    <form action={paths.search()} method="get" role="search" className="search-form">
      <label id={labelId} htmlFor={inputId} className="font-bold">
        {label}
      </label>
      <div className="search-row">
        <input
          id={inputId}
          className="input"
          type="search"
          name="q"
          defaultValue={defaultValue}
          maxLength={SEARCH_MAX_LENGTH}
          autoComplete="off"
          enterKeyHint="search"
        />
        <button type="submit" className="button button-primary">
          <Icon name="search" size={18} />
          {submit}
        </button>
      </div>
      {children}
    </form>
  )
}
