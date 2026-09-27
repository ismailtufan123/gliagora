// Geography (PLAN §4.6): countries by ISO 3166-1 alpha-2 code, grouped into the regions of the
// UN M49 standard. The Americas are split into Northern America and Latin America and the
// Caribbean, as in the plan's region filter.

export const REGIONS = [
  { value: 'africa', label: 'Africa' },
  { value: 'northern-america', label: 'Northern America' },
  { value: 'latin-america-caribbean', label: 'Latin America and the Caribbean' },
  { value: 'asia', label: 'Asia' },
  { value: 'europe', label: 'Europe' },
  { value: 'oceania', label: 'Oceania' },
] as const

export type Region = (typeof REGIONS)[number]['value']

/** M49 sub-regions; for Sub-Saharan Africa and Latin America the finer intermediate regions. */
export const SUBREGIONS = [
  { value: 'northern-africa', label: 'Northern Africa', region: 'africa' },
  { value: 'eastern-africa', label: 'Eastern Africa', region: 'africa' },
  { value: 'middle-africa', label: 'Middle Africa', region: 'africa' },
  { value: 'southern-africa', label: 'Southern Africa', region: 'africa' },
  { value: 'western-africa', label: 'Western Africa', region: 'africa' },
  { value: 'caribbean', label: 'Caribbean', region: 'latin-america-caribbean' },
  { value: 'central-america', label: 'Central America', region: 'latin-america-caribbean' },
  { value: 'south-america', label: 'South America', region: 'latin-america-caribbean' },
  { value: 'central-asia', label: 'Central Asia', region: 'asia' },
  { value: 'eastern-asia', label: 'Eastern Asia', region: 'asia' },
  { value: 'south-eastern-asia', label: 'South-eastern Asia', region: 'asia' },
  { value: 'southern-asia', label: 'Southern Asia', region: 'asia' },
  { value: 'western-asia', label: 'Western Asia', region: 'asia' },
  { value: 'eastern-europe', label: 'Eastern Europe', region: 'europe' },
  { value: 'northern-europe', label: 'Northern Europe', region: 'europe' },
  { value: 'southern-europe', label: 'Southern Europe', region: 'europe' },
  { value: 'western-europe', label: 'Western Europe', region: 'europe' },
  { value: 'australia-new-zealand', label: 'Australia and New Zealand', region: 'oceania' },
  { value: 'melanesia', label: 'Melanesia', region: 'oceania' },
  { value: 'micronesia', label: 'Micronesia', region: 'oceania' },
  { value: 'polynesia', label: 'Polynesia', region: 'oceania' },
] as const satisfies readonly { value: string; label: string; region: Region }[]

export type Subregion = (typeof SUBREGIONS)[number]['value']

/** ISO 3166-1 alpha-2, plus XK (Kosovo), which ROR, the World Bank and the EU also use. */
export const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/
