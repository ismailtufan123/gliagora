'use client'

import {
  SelectField,
  useConfig,
  useDocumentInfo,
  useField,
  useForm,
  useFormFields,
} from '@payloadcms/ui'
import type { SelectFieldClientProps } from 'payload'
import { formatAdminURL } from 'payload/shared'
import { useEffect, useMemo, useRef, useState } from 'react'

import { fillOnAppear, followInstitution } from '@/lib/jobs/deadline-zone'
import { isTimeZone } from '@/lib/jobs/time-zones'
import { idOf } from '@/lib/relationship'

// The job form's "Time zone of the deadline" (D40): Payload's own select, which takes the time zone
// of the institution when the editor chooses one, as long as the field is empty or still holds the
// zone of the institution chosen before; a zone the editor chose stays. The zone is read through
// the REST API with the editor's session (only that field). Admin text is plain English, like the
// labels in the collection configs.

type Id = number | string

const FROM_INSTITUTION =
  "Taken from the institution's location. Change it if the posting names another time zone."

// The institution each open form's field last settled on (took, or left, its zone), by the form's
// getDataByPath, which stays the same for as long as the form is open. The field is taken out of
// the form while the deadline is not a fixed date, so a ref would forget it: shown again, it would
// count as appearing for the first time and fill a zone the editor had emptied on purpose.
const settled = new WeakMap<object, { institution: Id | undefined }>()

export function DeadlineTimeZoneField(props: SelectFieldClientProps) {
  const { field, path } = props
  const {
    config: {
      routes: { api },
    },
  } = useConfig()
  const { id: documentId, initialData } = useDocumentInfo()
  const institution = useFormFields(([fields]) => idOf(fields.institution?.value))
  const {
    path: fieldPath,
    value,
    setValue,
  } = useField<string | null>({ potentiallyStalePath: path })
  // The value at the moment the institution's zone arrives, not at the render that asked for it.
  const { getDataByPath } = useForm()
  const seen = settled.get(getDataByPath)
  // The institution whose zone the field follows: the one chosen when it first appeared in this
  // form, then each one the editor chose once its zone was known.
  const followed = useRef<Id | undefined>(seen ? seen.institution : institution)
  // Whether the field has not settled on any institution in this form yet.
  const firstAppearance = useRef(seen === undefined)
  // Each institution's zone is read once, also when two reads of it overlap.
  const zones = useRef(new Map<Id, Promise<string | null>>())
  const [known, setKnown] = useState<{ id: Id; zone: string | null } | null>(null)

  useEffect(() => {
    // An emptied institution changes nothing; the next one chosen is compared with the last.
    if (institution === undefined) return
    let cancelled = false
    const read = async (id: Id): Promise<string | null> => {
      const url = formatAdminURL({
        apiRoute: api,
        path: `/institutions/${encodeURIComponent(String(id))}?depth=0&select[timeZone]=true`,
      })
      const response = await fetch(url, { credentials: 'include' })
      if (!response.ok) throw new Error(`The institution could not be read (${response.status})`)
      const { timeZone } = (await response.json()) as { timeZone?: unknown }
      return isTimeZone(timeZone) ? timeZone : null
    }
    const zoneOf = (id: Id | undefined): Promise<string | null> => {
      if (id === undefined) return Promise.resolve(null)
      let zone = zones.current.get(id)
      if (!zone) {
        zone = read(id)
        // A failed read is tried again the next time.
        zone.catch(() => zones.current.delete(id))
        zones.current.set(id, zone)
      }
      return zone
    }
    const before = followed.current
    const saved = { id: documentId, deadlineKind: initialData?.deadlineKind as string | undefined }
    Promise.all([zoneOf(before), zoneOf(institution)])
      .then(([previous, next]) => {
        if (cancelled) return
        setKnown({ id: institution, zone: next })
        const first = firstAppearance.current
        followed.current = institution
        firstAppearance.current = false
        settled.set(getDataByPath, { institution })
        // The same institution as when the field first appeared in this form (the form opened, or
        // a fixed deadline was chosen): fill only an empty field that was not saved empty on
        // purpose. The same institution as when the field was last shown: leave it as it is.
        const now = getDataByPath<string | null>(fieldPath)
        const zone =
          before !== institution
            ? followInstitution(now, previous, next)
            : first && fillOnAppear(now, saved)
              ? next
              : undefined
        if (zone !== undefined && zone !== (now || null)) setValue(zone)
      })
      .catch(() => {
        // Without the institution's zone the field stays as it is; the editor can still choose.
      })
    return () => {
      cancelled = true
    }
    // Runs when the institution changes; the value and the document are read when it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institution, api])

  const fromInstitution =
    known !== null && known.id === institution && known.zone !== null && value === known.zone
  const shown = useMemo(
    () =>
      fromInstitution
        ? ({ ...field, admin: { ...field.admin, description: FROM_INSTITUTION } } as typeof field)
        : field,
    [field, fromInstitution],
  )
  return <SelectField {...props} field={shown} />
}
