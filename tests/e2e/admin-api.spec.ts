import { type APIRequestContext, type APIResponse, expect, test } from '@playwright/test'

import { E2E_EDITOR_EMAIL } from '../../src/scripts/e2e-editor-account'
import { FIXED_JOBS } from '../../src/scripts/fake-jobs-fixed'
import { FAKE_QUEUE_NOTE } from '../../src/scripts/fake-queue-data'

// What the admin gets back from the REST API when a save is refused. It shows each rule's message
// at its field only when the error lists the fields (`errors[0].data.errors`); otherwise editors
// see a toast that names the fields without saying what is wrong. The production build lost that
// list while Payload was bundled into the server more than once (see next.config.ts).
//
// Signs in as the test editor from `pnpm e2e:editor` (src/scripts/e2e-editor.ts), with the password
// in E2E_EDITOR_PASSWORD. CI always has it; a local run without it skips the test.
const password = process.env.E2E_EDITOR_PASSWORD

type FieldError = { path: string; message: string }

async function signIn(request: APIRequestContext) {
  const response = await request.post('/api/users/login/', {
    data: { email: E2E_EDITOR_EMAIL, password },
  })
  expect(response.status(), 'sign-in as the test editor (pnpm e2e:editor)').toBe(200)
  const { token } = (await response.json()) as { token: string }
  return { Authorization: `JWT ${token}` }
}

async function fieldErrors(response: APIResponse): Promise<FieldError[] | undefined> {
  expect(response.status()).toBe(400)
  const body = (await response.json()) as { errors?: { data?: { errors?: FieldError[] } }[] }
  return body.errors?.[0]?.data?.errors?.map(({ path, message }) => ({ path, message }))
}

test.describe('admin API', () => {
  test.skip(({ isMobile }) => isMobile, 'the API does not depend on the device')
  test.skip(
    !password && !process.env.CI,
    'needs the test editor: E2E_EDITOR_PASSWORD=… pnpm e2e:editor',
  )

  // One sign-in per test, and the tests one after another: Payload keeps the sessions in the user
  // record, so parallel sign-ins as the same user can drop each other's session.
  test.describe.configure({ mode: 'serial' })

  test('a refused save gets each message at its field', async ({ request }) => {
    const headers = await signIn(request)

    await test.step('a job published without its facts: every missing fact', async () => {
      // Refused, so nothing is created.
      const response = await request.post('/api/jobs/', { headers, data: { status: 'published' } })
      expect(await fieldErrors(response)).toEqual(
        expect.arrayContaining([
          { path: 'positionType', message: 'Choose the position type.' },
          { path: 'subfields', message: 'Choose at least one subfield.' },
          {
            path: 'deadlineDate',
            message: 'Enter the deadline, or choose Rolling or Until filled.',
          },
          { path: 'summary', message: 'Write one or two sentences in your own words.' },
          {
            path: 'originalUrl',
            message: "Add the address of the posting on the employer's own website.",
          },
          {
            path: 'verifiedAt',
            message: "Enter the day you checked the facts on the employer's page.",
          },
          { path: 'checks.employerOrigin', message: 'Check this before publishing.' },
        ]),
      )
    })

    await test.step('a change refused by a collection hook: a saved ROR ID', async () => {
      const found = await request.get(
        `/api/institutions/?where[rorId][equals]=${FIXED_JOBS.open.institutionRorId}&depth=0`,
        { headers },
      )
      expect(found.status()).toBe(200)
      const [institution] = ((await found.json()) as { docs: { id: number }[] }).docs
      expect(institution).toBeDefined()
      // The empty name is refused as well, so the institution stays as it is even if the ROR ID
      // check ever let the change through.
      const response = await request.patch(`/api/institutions/${institution!.id}/`, {
        headers,
        data: { rorId: '05dxps055', name: '' },
      })
      expect(await fieldErrors(response)).toEqual([
        { path: 'rorId', message: 'A saved ROR ID cannot be changed or removed.' },
      ])
    })

    await test.step('reports: only the form creates them, and closing one needs an action', async () => {
      // Refused, so nothing is created.
      const created = await request.post('/api/reports/', {
        headers,
        data: { kind: 'other', details: `${FAKE_QUEUE_NOTE} Sent through the API.` },
      })
      expect(created.status()).toBe(403)

      // A fake report from `pnpm fake:jobs` that is still open.
      const found = await request.get(
        `/api/reports/?where[status][equals]=in-progress&where[details][contains]=${encodeURIComponent(FAKE_QUEUE_NOTE)}&depth=0&limit=1`,
        { headers },
      )
      expect(found.status()).toBe(200)
      const [report] = ((await found.json()) as { docs: { id: number }[] }).docs
      expect(report).toBeDefined()
      // Refused, so the report stays in progress.
      const closing = await request.patch(`/api/reports/${report!.id}/`, {
        headers,
        data: { status: 'closed' },
      })
      expect(await fieldErrors(closing)).toEqual([
        { path: 'action', message: 'Choose what was done before closing the report.' },
      ])
      const reopening = await request.patch(`/api/reports/${report!.id}/`, {
        headers,
        data: { status: 'new' },
      })
      expect(await fieldErrors(reopening)).toEqual([
        {
          path: 'status',
          message: 'A report does not go back to New. Set it to In progress to reopen it.',
        },
      ])
    })
  })

  // The email address, the details and the notes are never list columns, and the lists never load
  // them (src/lib/private-fields.ts), not even when a link asks for them as columns: Payload saves
  // those columns as the editor's preference, which every later list load then reads.
  test('the review lists never load personal data, even when a link asks for it', async ({
    request,
  }) => {
    const headers = await signIn(request)
    const lists = [
      {
        collection: 'reports',
        title: 'Reports and requests',
        columns: ['email', 'details', 'actionNote', 'kind'],
      },
      { collection: 'submissions', title: 'Suggestions', columns: ['email', 'note', 'url'] },
    ]
    for (const { collection, title, columns } of lists) {
      await test.step(collection, async () => {
        // Only records that hold an email address, so the list has some to leave out.
        const withEmail = 'where[email][exists]=true'
        const stored = await request.get(`/api/${collection}/?${withEmail}&limit=1&depth=0`, {
          headers,
        })
        expect(((await stored.json()) as { totalDocs: number }).totalDocs).toBeGreaterThan(0)

        const list = `/admin/collections/${collection}/?${withEmail}`
        const crafted = `${list}&columns=${encodeURIComponent(JSON.stringify(columns))}`
        // The crafted link, then the list with the columns it saved.
        for (const path of [crafted, list]) {
          const response = await request.get(path, { headers })
          expect(response.status(), path).toBe(200)
          const html = (await response.text()).replaceAll(E2E_EDITOR_EMAIL, '')
          // The list itself, not the sign-in page.
          expect(html, path).toContain(`<title>${title} `)
          // Named, so a failure lists what was sent rather than the whole page.
          expect(html.match(/[\w.+-]+@example\.(?:org|com)/g) ?? [], path).toEqual([])
          expect(html.includes(FAKE_QUEUE_NOTE), `${path}: details or notes`).toBe(false)
        }
        // Forget the columns saved above.
        const preference = `/api/payload-preferences/collection-${collection}/`
        const forgotten = await request.delete(preference, { headers })
        expect(forgotten.status()).toBe(200)
      })
    }
  })
})
