import { Icon } from '@/components/Icon'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import {
  DEADLINE_FROM,
  DEADLINE_RANGE,
  DEADLINE_TO,
  JOB_FILTERS,
  type JobFilters,
  QUERY_MAX_LENGTH,
} from '@/lib/filters/jobs'
import { DEADLINE_DAYS } from '@/lib/filters/values'
import type { FilterOption, JobFilterOptions } from '@/lib/jobs/query'

import { FILTER_FORM_ID, RANGE_ERROR_ID } from './ids'

type Translate = Awaited<ReturnType<typeof getTranslations<'jobs.filters'>>>

// The filters of the jobs list (PLAN §3.2, §7.5, §9.3, §9.4): one plain GET form, so everything
// works without JavaScript (the proxy then redirects to the canonical address). From 1280px the
// filters are a bar of popovers; below, the same controls sit in a sheet behind a "Filters (3)"
// button, with the popovers as accordions. There is only one set of controls, laid out by CSS, so
// nothing is announced twice. All of them are <details data-disclosure> elements: the header's
// DisclosureEnhancer adds Esc, outside clicks and, for the sheet, the dialog with an inert page;
// JobsListEnhancer applies each change at once. Only filters that name something are kept: a
// value that names nothing has no control here, so the next use of the form drops it. For a
// member with preferred subfields (D35) the form also says `prefs=off`, which the filter model
// keeps only when no filter is left: unticking every box then shows all positions, not the
// member's default again.

/** The input that asks for all positions rather than a member's preferred subfields (D35). */
const SHOW_ALL = { name: 'prefs', value: 'off' } as const

/** Checkboxes for the options of one parameter; narrower options indented under theirs. */
function Options({
  name,
  options,
  chosen,
  id,
}: {
  name: string
  options: FilterOption[]
  chosen: readonly string[]
  id?: string
}) {
  return (
    <ul role="list" className="filter-options" id={id}>
      {options.map((option) => (
        <li key={option.value}>
          <label className="filter-option">
            <input
              type="checkbox"
              name={name}
              value={option.value}
              defaultChecked={chosen.includes(option.value)}
            />
            {option.label}
          </label>
          {option.children.length > 0 && (
            <Options name={name} options={option.children} chosen={chosen} />
          )}
        </li>
      ))}
    </ul>
  )
}

/** A text box that narrows a long list as one types; it needs JavaScript, so it shows only then. */
function ListSearch({ controls, t }: { controls: string; t: Translate }) {
  return (
    <input
      type="search"
      className="input js-only"
      data-list-search
      aria-controls={controls}
      aria-label={t('searchInList')}
      placeholder={t('searchInList')}
    />
  )
}

/** One filter: a popover in the bar, an accordion in the sheet, with its own Apply button. */
function Filter({
  label,
  count,
  open,
  t,
  children,
}: {
  label: string
  count: number
  /** Open when the page loads: it shows an error. */
  open?: boolean
  t: Translate
  children: ReactNode
}) {
  return (
    <details className="filter disclosure" data-disclosure open={open}>
      <summary className="filter-button">
        {count > 0 ? t('button', { label, count }) : label}
        <Icon name="chevronDown" size={16} className="chevron" />
      </summary>
      <div className="filter-panel">
        {children}
        <button type="submit" className="button button-secondary filter-apply">
          {t('apply')}
        </button>
      </div>
    </details>
  )
}

/** A fieldset whose legend repeats the popover's label: for screen readers only. */
function Field({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="filter-field">
      <legend className="sr-only">{legend}</legend>
      {children}
    </fieldset>
  )
}

export async function JobFilterForm({
  filters,
  options,
  active,
  matches,
  rangeInput,
  clearHref,
  showAll = false,
}: {
  /** The filters without values that name nothing. */
  filters: JobFilters
  options: JobFilterOptions
  /** Filter values with a chip, which the sheet's button counts. */
  active: number
  /** Positions that match now, for the sheet's "Show 38 positions". */
  matches: number
  /**
   * Days sent for "Between these dates" that make no range (without JavaScript): shown again,
   * with the error by the date fields and the filters open on it.
   */
  rangeInput?: { from: string; to: string } | null
  /** "Clear all": the list without filters (with `prefs=off` for a member with preferences). */
  clearHref: string
  /** A member with preferred subfields: the form asks for all positions when nothing is ticked. */
  showAll?: boolean
}) {
  const t = await getTranslations({ locale: 'en', namespace: 'jobs.filters' })
  const tList = await getTranslations({ locale: 'en', namespace: 'jobs.list' })
  const [from = '', to = ''] = rangeInput
    ? [rangeInput.from, rangeInput.to]
    : filters.deadline?.includes('..')
      ? filters.deadline.split('..')
      : []
  const range = !!rangeInput || !!from
  // Only while the error shows: a description is read even when its element is hidden.
  const invalid = rangeInput ? { 'aria-invalid': true, 'aria-describedby': RANGE_ERROR_ID } : {}
  const deadlineOptions = [
    { value: '', label: t('deadlineAny') },
    ...DEADLINE_DAYS.map((days) => ({ value: `${days}d`, label: t('within', { days }) })),
    { value: 'this-month', label: t('thisMonth') },
  ]
  const count = (...lists: readonly (readonly unknown[])[]) =>
    lists.reduce((sum, list) => sum + list.length, 0)

  return (
    <form
      id={FILTER_FORM_ID}
      className="job-filters"
      method="get"
      action={JOB_FILTERS.path}
      aria-label={t('label')}
    >
      <div className="filter-search">
        <label htmlFor="job-q" className="sr-only">
          {t('search')}
        </label>
        <input
          id="job-q"
          type="search"
          name="q"
          className="input"
          defaultValue={filters.q}
          maxLength={QUERY_MAX_LENGTH}
          placeholder={t('search')}
        />
        <button type="submit" className="button button-secondary px-3">
          <Icon name="search" size={18} />
          <span className="sr-only">{t('searchButton')}</span>
        </button>
      </div>

      <details className="filter-sheet disclosure" data-disclosure data-modal open={!!rangeInput}>
        <summary className="button button-secondary">
          <Icon name="filters" size={18} />
          {t('open', { count: active })}
        </summary>
        <div className="sheet-panel" role="group" aria-labelledby="job-filters-title">
          <div className="sheet-head">
            <h2 id="job-filters-title" className="text-card">
              {t('title')}
            </h2>
            <button
              type="button"
              className="disclosure-button size-11 js-only"
              data-disclosure-close
              aria-label={t('close')}
            >
              <Icon name="close" size={20} />
            </button>
          </div>

          <div className="filter-bar">
            <Filter label={t('type')} count={count(filters.type)} t={t}>
              <Field legend={t('type')}>
                <Options name="type" options={options.type} chosen={filters.type} />
              </Field>
            </Filter>

            <Filter label={t('subfield')} count={count(filters.subfield)} t={t}>
              <Field legend={t('subfield')}>
                <ListSearch controls="filter-subfield" t={t} />
                <Options
                  name="subfield"
                  options={options.subfield}
                  chosen={filters.subfield}
                  id="filter-subfield"
                />
              </Field>
            </Filter>

            <Filter label={t('method')} count={count(filters.method)} t={t}>
              <Field legend={t('method')}>
                <ListSearch controls="filter-method" t={t} />
                <div id="filter-method" className="grid gap-3">
                  {options.method.map(({ group, options: methods }) => (
                    <fieldset key={group ?? 'other'} className="filter-group">
                      <legend>{group ? t(`methodGroups.${group}`) : t('otherMethods')}</legend>
                      <Options name="method" options={methods} chosen={filters.method} />
                    </fieldset>
                  ))}
                </div>
              </Field>
            </Filter>

            <Filter label={t('model')} count={count(filters.model)} t={t}>
              <Field legend={t('model')}>
                <Options name="model" options={options.model} chosen={filters.model} />
              </Field>
            </Filter>

            <Filter label={t('country')} count={count(filters.region, filters.country)} t={t}>
              {options.region.length > 0 && (
                <fieldset className="filter-group">
                  <legend>{t('region')}</legend>
                  <Options
                    name="region"
                    options={options.region.map((region) => ({
                      value: region,
                      label: t(`regions.${region}`),
                      children: [],
                    }))}
                    chosen={filters.region}
                  />
                </fieldset>
              )}
              <fieldset className="filter-group">
                <legend>{t('country')}</legend>
                <ListSearch controls="filter-country" t={t} />
                <Options
                  name="country"
                  options={options.country}
                  chosen={filters.country}
                  id="filter-country"
                />
              </fieldset>
            </Filter>

            <Filter
              label={t('deadline')}
              count={filters.deadline ? 1 : 0}
              open={!!rangeInput}
              t={t}
            >
              <Field legend={t('deadline')}>
                <ul role="list" className="filter-options">
                  {deadlineOptions.map((option) => (
                    <li key={option.value}>
                      <label className="filter-option">
                        <input
                          type="radio"
                          name="deadline"
                          value={option.value}
                          defaultChecked={
                            (range ? DEADLINE_RANGE : (filters.deadline ?? '')) === option.value
                          }
                        />
                        {option.label}
                      </label>
                    </li>
                  ))}
                  <li className="grid gap-2">
                    <label className="filter-option">
                      <input
                        type="radio"
                        name="deadline"
                        value={DEADLINE_RANGE}
                        defaultChecked={range}
                        aria-describedby="deadline-range-hint"
                      />
                      {t('between')}
                    </label>
                    <div className="flex flex-wrap gap-3 ps-7">
                      <label className="grid gap-1 text-caption">
                        {t('from')}
                        <input
                          type="date"
                          name={DEADLINE_FROM}
                          className="input"
                          defaultValue={from}
                          {...invalid}
                        />
                      </label>
                      <label className="grid gap-1 text-caption">
                        {t('to')}
                        <input
                          type="date"
                          name={DEADLINE_TO}
                          className="input"
                          defaultValue={to}
                          {...invalid}
                        />
                      </label>
                    </div>
                    <p id="deadline-range-hint" className="ps-7 text-caption text-text-muted">
                      {t('rangeHint')}
                    </p>
                    {/* Also shown and hidden by JobsListEnhancer, when Apply meets such days. */}
                    <p
                      id={RANGE_ERROR_ID}
                      className="ps-7 text-caption font-bold text-danger"
                      hidden={!rangeInput}
                    >
                      {t('rangeError')}
                    </p>
                  </li>
                </ul>
              </Field>
            </Filter>

            <Filter label={t('more')} count={count(filters.stage)} t={t}>
              <fieldset className="filter-group">
                <legend>{t('stage')}</legend>
                <Options name="stage" options={options.stage} chosen={filters.stage} />
              </fieldset>
            </Filter>
          </div>

          <div className="sheet-foot">
            {/* While the sheet is a dialog, the rest of the page is inert, the count above the
                results too: this one announces the new count. */}
            <p role="status" className="sr-only">
              {tList('matches', { count: matches })}
            </p>
            <a href={clearHref} className="button button-secondary" data-soft>
              {t('clearAll')}
            </a>
            <button type="submit" className="button button-primary" data-close-sheet>
              {t('show', { count: matches })}
            </button>
          </div>
        </div>
      </details>

      {/* Filters without controls of their own, kept when the form is sent. */}
      {filters.institution.map((id) => (
        <input key={id} type="hidden" name="institution" value={id} />
      ))}
      {filters.view !== 'list' && <input type="hidden" name="view" value={filters.view} />}
      {showAll && <input type="hidden" name={SHOW_ALL.name} value={SHOW_ALL.value} />}
    </form>
  )
}
