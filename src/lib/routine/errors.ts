import { APIError, ValidationError } from 'payload'

import { errorSummary } from '@/lib/errors'

/** Why a save was refused, in the collection's own words (never what was sent). */
export function refusalOf(error: unknown): string {
  if (error instanceof ValidationError) {
    const errors = (error.data as { errors?: Array<{ path?: string; message?: string }> }).errors
    if (errors?.length) {
      return errors.map((e) => `${e.path ?? 'record'}: ${e.message ?? ''}`).join(' ')
    }
  }
  if (error instanceof APIError) return error.message
  return `The save failed (${errorSummary(error)}).`
}
