import type {
  CollectionConfig,
  RelationshipFieldSingleValidation,
  TextFieldManyValidation,
} from 'payload'

import { fixedFieldHooks } from '@/lib/fixed-fields'
import { HUB_INTRO_MIN_WORDS } from '@/lib/indexing'
import { requiredInEnglish } from '@/lib/localized'
import {
  METHOD_GROUPS,
  MESH_ID_PATTERN,
  OPENALEX_TOPIC_PATTERN,
  VOCABULARIES,
  createsCycle,
  isValidSlug,
} from '@/lib/taxonomy'

type TermData = { vocabulary?: string | null }

// A relationship value is an ID, or a populated document when read with depth > 0. Returns
// undefined for an empty value and NaN for anything that is not a valid ID.
const idOf = (value: unknown): number | undefined => {
  const raw = typeof value === 'object' && value !== null && 'id' in value ? value.id : value
  if (raw == null || raw === '') return undefined
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : Number.NaN
}

const matchAll =
  (pattern: RegExp, message: string): TextFieldManyValidation =>
  (values) => {
    if (values == null) return true
    return (Array.isArray(values) && values.every((value) => pattern.test(value))) || message
  }

// A parent must be in the same vocabulary and must not make a term its own ancestor.
const validateParent: RelationshipFieldSingleValidation = async (value, { id, data, req }) => {
  const parentId = idOf(value)
  if (parentId === undefined) return true
  if (Number.isNaN(parentId)) return 'Choose a parent term from the list.'
  if (id != null && parentId === Number(id)) return 'A term cannot be its own parent.'
  const parent = await req.payload.findByID({
    collection: 'terms',
    id: parentId,
    depth: 0,
    req,
    disableErrors: true,
  })
  if (!parent) return 'The parent term does not exist.'
  if (parent.vocabulary !== (data as TermData | undefined)?.vocabulary) {
    return 'The parent must be in the same vocabulary.'
  }
  if (id == null) return true
  const loops = await createsCycle(Number(id), parentId, async (termId) => {
    const term = await req.payload.findByID({
      collection: 'terms',
      id: termId,
      depth: 0,
      req,
      disableErrors: true,
    })
    return idOf(term?.parent)
  })
  return loops ? 'This parent would make the term its own ancestor.' : true
}

// PLAN §4: one vocabulary set shared by every content type. Each term has a stable slug, a
// localized label and description, synonyms for search and tag suggestions, and optional
// mappings used to route paper candidates (M10).
export const Terms: CollectionConfig = {
  slug: 'terms',
  labels: { singular: 'Term', plural: 'Terms' },
  admin: {
    group: 'Taxonomy',
    useAsTitle: 'label',
    defaultColumns: ['label', 'vocabulary', 'slug', 'isActive'],
    listSearchableFields: ['label', 'slug'],
    description:
      'Tags shared by every content type (PLAN §4). A slug cannot change once saved; deactivate a term instead of deleting it. Every change is kept under Versions.',
    pagination: { defaultLimit: 50 },
  },
  defaultSort: ['vocabulary', 'sortOrder'],
  access: {
    // Content refers to terms by ID, and published slugs never change (PLAN §4.1).
    delete: () => false,
  },
  // A copy would repeat the slug, which must be unique in its vocabulary.
  disableDuplicate: true,
  // The changelog for new and edited terms (PLAN §4.1).
  versions: { maxPerDoc: 100 },
  indexes: [{ fields: ['vocabulary', 'slug'], unique: true }],
  // Slug and vocabulary are fixed once saved (PLAN §4.1).
  hooks: fixedFieldHooks('terms', ['vocabulary', 'slug']),
  fields: [
    {
      name: 'vocabulary',
      type: 'select',
      required: true,
      index: true,
      options: VOCABULARIES.map(({ value, label }) => ({ value, label })),
      // Fixed once saved, like the slug: filters and URLs combine the two.
      access: { update: () => false },
    },
    {
      name: 'label',
      type: 'text',
      localized: true,
      // Required in English; an empty Turkish label falls back to English (PLAN §12).
      validate: requiredInEnglish('Enter the English label.'),
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      access: { update: () => false },
      validate: (value: string | null | undefined) =>
        (typeof value === 'string' && isValidSlug(value)) ||
        'Use lowercase letters and digits, with single hyphens between words.',
      admin: {
        description:
          'Used in URLs and filters, e.g. systems-circuits. It cannot be changed after saving (PLAN §4.1).',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      localized: true,
      admin: { description: 'One sentence on what the term covers.' },
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'terms',
      validate: validateParent,
      filterOptions: ({ data, id }) => ({
        vocabulary: { equals: (data as TermData | undefined)?.vocabulary },
        ...(id == null ? {} : { id: { not_equals: id } }),
      }),
      admin: {
        description:
          'Optional, same vocabulary. Filters include children: rodent also finds mouse and rat.',
      },
    },
    {
      name: 'group',
      type: 'select',
      options: METHOD_GROUPS.map(({ value, label }) => ({ value, label })),
      validate: (value: string | null | undefined, { data }: { data: Partial<TermData> }) =>
        data.vocabulary !== 'method' || Boolean(value) || 'Methods need a group.',
      admin: {
        condition: (data) => data?.vocabulary === 'method',
        description: 'Arranges the method filter (PLAN §4.3).',
      },
    },
    {
      name: 'synonyms',
      type: 'text',
      hasMany: true,
      admin: {
        description:
          'Other words people use for this term, e.g. LTP for synaptic plasticity. Used by search and tag suggestions.',
      },
    },
    {
      name: 'mappings',
      type: 'group',
      admin: { description: 'Used to route paper candidates to this term (M10).' },
      fields: [
        {
          name: 'mesh',
          label: 'MeSH descriptor IDs',
          type: 'text',
          hasMany: true,
          validate: matchAll(MESH_ID_PATTERN, 'Use MeSH descriptor IDs such as D009457.'),
        },
        {
          name: 'openalexTopics',
          label: 'OpenAlex topic IDs',
          type: 'text',
          hasMany: true,
          validate: matchAll(OPENALEX_TOPIC_PATTERN, 'Use OpenAlex topic IDs such as T10581.'),
        },
      ],
    },
    {
      name: 'hubIntro',
      label: 'Hub introduction',
      type: 'textarea',
      localized: true,
      admin: {
        condition: (data) => data?.vocabulary === 'subfield',
        description: `Human-written introduction for the subfield hub page, 150–300 words (PLAN §16.3). Separate paragraphs with a blank line. Search engines list the hub only once its English introduction has at least ${HUB_INTRO_MIN_WORDS} words; until then its page stays noindex (D40).`,
        components: {
          // The number of words so far, counted as src/lib/indexing.ts counts them.
          afterInput: ['/admin/HubIntroWordCount#HubIntroWordCount'],
        },
      },
    },
    {
      name: 'isActive',
      label: 'Active',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        position: 'sidebar',
        description: 'Inactive terms stay on existing items but cannot be chosen for new ones.',
      },
    },
    {
      name: 'sortOrder',
      type: 'number',
      defaultValue: 0,
      admin: { position: 'sidebar', description: 'Lower numbers come first in lists and filters.' },
    },
  ],
}
