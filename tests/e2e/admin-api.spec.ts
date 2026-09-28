import { type APIRequestContext, type APIResponse, expect, test } from '@playwright/test'

import { E2E_EDITOR_EMAIL } from '../../src/scripts/e2e-editor-account'
import { FIXED_JOBS } from '../../src/scripts/fake-jobs-fixed'

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

  // One test with one sign-in: Payload keeps the sessions in the user record, so parallel
  // sign-ins as the same user can drop each other's session.
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
  })
})
