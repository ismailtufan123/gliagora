import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

import { drizzle } from '@payloadcms/db-postgres/drizzle/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listmonkParams } from '@/scripts/listmonk-settings'

import { type Listmonk, listmonkAvailable, startListmonk } from './listmonk'

// listmonk with the server's settings (M2, D50): a real listmonk (the pinned image, or the program
// in LISTMONK_BIN) on a scratch database, set up as deploy/listmonk/settings.sql sets it up. It
// checks that the file does what the server needs, that running it again changes nothing (also
// through deploy/listmonk/prepare.sh's way, the server's), and what the app's API user can and
// cannot do. Skipped where neither Docker nor LISTMONK_BIN is available. Fake addresses only.

const canStartListmonk = await listmonkAvailable()

type Rows<T> = { rows: T[]; fields: unknown[] }

describe.skipIf(!canStartListmonk)('listmonk with the server’s settings', () => {
  let listmonk: Listmonk

  beforeAll(async () => {
    listmonk = await startListmonk()
  })

  afterAll(async () => {
    await listmonk?.stop()
  })

  /**
   * One or several statements on listmonk's database, as the superuser: the rows of the last one
   * that returns some (a SELECT or RETURNING), or none.
   */
  async function query<T>(text: string): Promise<T[]> {
    const db = drizzle(listmonk.superuserUrl)
    try {
      const result = (await db.$client.query(text)) as unknown as Rows<T> | Rows<T>[]
      const results = Array.isArray(result) ? result : [result]
      return [...results].reverse().find((one) => one.fields.length > 0)?.rows ?? []
    } finally {
      await db.$client.end()
    }
  }

  /**
   * settings.sql as deploy/listmonk/prepare.sh hands it to psql on the server, run the same way,
   * with the settings it reads from .env (`smtp`: SMTP_*).
   */
  async function prepareShRun(smtp: Record<string, string> = {}): Promise<string> {
    const input = execFileSync(
      'bash',
      ['-c', 'source deploy/listmonk/prepare.sh && settings_input'],
      {
        encoding: 'utf8',
        env: {
          NODE_ENV: 'test',
          PATH: process.env.PATH,
          LISTMONK_API_TOKEN: listmonk.token,
          LISTMONK_ROOT_URL: listmonk.url,
          ...smtp,
        },
      },
    )
    const [row] = await query<{ changed: string }>(input)
    return row?.changed ?? 'no result'
  }

  async function api(path: string, init: RequestInit = {}, headers = listmonk.headers) {
    const response = await fetch(`${listmonk.url}${path}`, {
      ...init,
      headers: { ...headers, 'Content-Type': 'application/json', ...init.headers },
    })
    const body = (await response.json().catch(() => null)) as { data?: unknown } | null
    return { status: response.status, data: body?.data as never }
  }

  const setting = async (key: string) =>
    (await query<{ value: unknown }>(`select value from settings where key = '${key}'`))[0]?.value

  it('makes the list, the API user and the settings, and a second run changes nothing', async () => {
    // The node-postgres way (pnpm listmonk:setup, the tests) and the server's (prepare.sh's psql
    // input) leave the same state: neither has anything left to change.
    expect(await listmonk.applySettings()).toEqual([])
    expect(await prepareShRun()).toBe('')

    expect(await query(`select name, type, optin, status from lists order by id`)).toEqual([
      { name: 'Glia Notes', type: 'private', optin: 'single', status: 'active' },
    ])
    // The install's samples are gone; its templates stay.
    expect(await query(`select email from subscribers`)).toEqual([])
    expect(await query(`select name from campaigns`)).toEqual([])
    expect((await query(`select id from templates`)).length).toBeGreaterThan(0)

    expect(
      await query(`select type, name, parent_id is null as top, permissions from roles
        where name like 'gliagora-app%' or parent_id is not null order by id`),
    ).toEqual([
      {
        type: 'user',
        name: 'gliagora-app',
        top: true,
        // Never subscribers:sql_query: see the next tests and settings.sql, step 3.
        permissions: ['subscribers:get', 'subscribers:manage'],
      },
      { type: 'list', name: 'gliagora-app-lists', top: true, permissions: [] },
      { type: 'list', name: null, top: false, permissions: ['list:get', 'list:manage'] },
    ])
    const [user] = await query<Record<string, unknown>>(
      `select u.username, u.type, u.password_login, u.password, u.status, l.name as list
       from users u, roles r, lists l
       where u.username = 'gliagora-app' and r.parent_id = u.list_role_id and l.id = r.list_id`,
    )
    expect(user).toEqual({
      username: 'gliagora-app',
      type: 'api',
      password_login: false,
      // Only the token's SHA-256, as listmonk 6.2 stores it.
      password: createHash('sha256').update(listmonk.token).digest('hex'),
      status: 'enabled',
      list: 'Glia Notes',
    })

    for (const [key, value] of Object.entries({
      'app.check_updates': false,
      'app.enable_public_subscription_page': false,
      'app.enable_public_archive': false,
      'app.send_optin_confirmation': false,
      'app.show_optin_page': false,
      'app.site_name': 'Glia Notes',
      'app.root_url': listmonk.url,
      'privacy.individual_tracking': false,
      'privacy.disable_tracking': true,
      'privacy.record_optin_ip': false,
      'privacy.unsubscribe_header': false,
      'privacy.allow_wipe': false,
      'privacy.allow_export': false,
      'bounce.enabled': false,
    })) {
      expect(await setting(key), key).toEqual(value)
    }
    expect(await setting('security.captcha')).toMatchObject({
      altcha: { enabled: false },
      hcaptcha: { enabled: false },
    })
    // No mail server without SMTP_HOST: listmonk cannot send.
    expect(await setting('smtp')).toEqual([
      expect.objectContaining({ enabled: false, username: '', password: '' }),
    ])
  })

  it('lets the app’s API user find, add, change and delete subscribers of Glia Notes', async () => {
    const lists = await api('/api/lists')
    expect(lists.status).toBe(200)
    const visible = (lists.data as { results: { id: number; name: string }[] }).results
    expect(visible.map((list) => list.name)).toEqual(['Glia Notes'])
    const glia = visible[0]!.id

    const subscriber = {
      email: 'reader.one@example.org',
      name: 'Subscriber',
      status: 'enabled',
      lists: [glia],
      preconfirm_subscriptions: true,
    }
    const created = await api('/api/subscribers', {
      method: 'POST',
      body: JSON.stringify(subscriber),
    })
    expect(created.status).toBe(200)
    const {
      id,
      uuid,
      lists: subscriptions,
    } = created.data as {
      id: number
      uuid: string
      lists: { id: number; subscription_status: string }[]
    }
    expect(subscriptions).toEqual([
      expect.objectContaining({ id: glia, subscription_status: 'confirmed' }),
    ])
    expect(
      (await api('/api/subscribers', { method: 'POST', body: JSON.stringify(subscriber) })).status,
    ).toBe(409)

    // Found by an anchored, escaped regular expression of the address (`search`, which needs no
    // SQL), and by its ID, whose answer carries the UUID to compare (the unsubscribe link's).
    const search = await api(
      `/api/subscribers?search=${encodeURIComponent('^reader\\.one@example\\.org$')}&per_page=2`,
    )
    expect((search.data as { results: { id: number }[] }).results.map((row) => row.id)).toEqual([
      id,
    ])
    const byId = await api(`/api/subscribers/${id}`)
    expect(byId.status).toBe(200)
    expect(byId.data).toMatchObject({ id, uuid, email: 'reader.one@example.org' })

    const changed = await api(`/api/subscribers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ email: 'reader.two@example.org' }),
    })
    expect(changed.status).toBe(200)
    expect((changed.data as { email: string }).email).toBe('reader.two@example.org')

    expect((await api(`/api/subscribers/${id}`, { method: 'DELETE' })).status).toBe(200)
    expect(await query(`select id from subscribers where id = ${id}`)).toEqual([])
  })

  it('refuses the app’s API user every SQL expression, also one that would read other tables', async () => {
    // listmonk checks a `query` only by the tables in its plan; these functions run SQL given as
    // text, which the plan does not show, so with subscribers:sql_query they would read listmonk's
    // admin sessions and settings (the SMTP password): the first through the error it causes, the
    // second as a yes-or-no answer. Without that permission, listmonk refuses them unread.
    const created = await api('/api/subscribers', {
      method: 'POST',
      body: JSON.stringify({
        email: 'reader.three@example.org',
        name: 'Subscriber',
        status: 'enabled',
        lists: [
          (await query<{ id: number }>(`select id from lists where name = 'Glia Notes'`))[0]!.id,
        ],
        preconfirm_subscriptions: true,
      }),
    })
    expect(created.status).toBe(200)
    const { id } = created.data as { id: number }
    try {
      const probes = [
        `subscribers.id = ${id}`,
        `(query_to_xml('select id from sessions', true, false, ''))::text::int = 1`,
        `exists(select 1 from ts_stat('select to_tsvector(''simple'', value::text) from settings') w where w.word = 'smtp')`,
      ]
      for (const expression of probes) {
        const text = encodeURIComponent(expression)
        expect((await api(`/api/subscribers?query=${text}`)).status, expression).toBe(403)
        expect((await api(`/api/subscribers/export?query=${text}`)).status, expression).toBe(403)
        for (const [path, method, extra] of [
          ['/api/subscribers/query/delete', 'POST', {}],
          ['/api/subscribers/query/blocklist', 'PUT', {}],
          ['/api/subscribers/query/lists', 'PUT', { action: 'remove', target_list_ids: [1] }],
        ] as const) {
          const body = JSON.stringify({ query: expression, ...extra })
          expect((await api(path, { method, body })).status, `${method} ${path}`).toBe(403)
        }
      }
      // None of them ran: the subscriber is still there, on its list, not blocklisted.
      expect(
        await query(`select s.status, sl.status as subscription from subscribers s
          join subscriber_lists sl on sl.subscriber_id = s.id where s.id = ${id}`),
      ).toEqual([{ status: 'enabled', subscription: 'confirmed' }])
    } finally {
      await query(`delete from subscribers where id = ${id}`)
    }
  })

  it('gives the app’s API user nothing else: no settings, other lists, campaigns or users', async () => {
    const [other] = await query<{ id: number }>(`
      insert into lists (uuid, name, type, optin) values (gen_random_uuid(), 'Other list', 'private', 'single');
      insert into subscribers (uuid, email, name) values (gen_random_uuid(), 'other.reader@example.org', 'Subscriber');
      insert into subscriber_lists (subscriber_id, list_id, status)
        select s.id, l.id, 'confirmed' from subscribers s, lists l
        where s.email = 'other.reader@example.org' and l.name = 'Other list';
      select s.id from subscribers s where s.email = 'other.reader@example.org'`)
    try {
      for (const [path, method] of [
        ['/api/settings', 'GET'],
        ['/api/settings', 'PUT'],
        ['/api/lists', 'POST'],
        ['/api/campaigns', 'GET'],
        ['/api/users', 'GET'],
        ['/api/logs', 'GET'],
        ['/api/import/subscribers', 'GET'],
        ['/api/tx', 'POST'],
        ['/api/admin/reload', 'POST'],
      ] as const) {
        expect(
          (await api(path, { method, body: method === 'GET' ? undefined : '{}' })).status,
          `${method} ${path}`,
        ).toBe(403)
      }
      // The other list's subscriber is out of its reach.
      const all = await api('/api/subscribers?per_page=all')
      expect((all.data as { results: { email: string }[] }).results).toEqual([])
      expect((await api(`/api/subscribers/${other!.id}`)).status).not.toBe(200)
      expect((await api(`/api/subscribers/${other!.id}`, { method: 'DELETE' })).status).not.toBe(
        200,
      )
      expect(await query(`select id from subscribers where id = ${other!.id}`)).toHaveLength(1)
      // Another token, or none, gets nothing.
      expect(
        (await api('/api/lists', {}, { Authorization: 'token gliagora-app:wrong' })).status,
      ).toBe(403)
      expect((await api('/api/lists', {}, {} as typeof listmonk.headers)).status).toBe(403)
    } finally {
      await query(`delete from subscribers where email = 'other.reader@example.org';
        delete from lists where name = 'Other list'`)
    }
  })

  it('takes the mail server and a new token from its parameters, and back', async () => {
    const smtp = {
      smtp_host: '127.0.0.1',
      smtp_port: '1025',
      smtp_user: 'mailer',
      smtp_password: "p'w",
      smtp_tls: 'none',
    }
    try {
      expect(await listmonk.applySettings(smtp)).toEqual(['setting smtp'])
      expect(await setting('smtp')).toEqual([
        expect.objectContaining({
          enabled: true,
          host: '127.0.0.1',
          port: 1025,
          username: 'mailer',
          password: "p'w",
          auth_protocol: 'plain',
          tls_type: 'none',
        }),
      ])
      const other = createHash('sha256').update('another token').digest('hex')
      expect(await listmonk.applySettings({ ...smtp, api_token_sha256: other })).toEqual([
        'API user gliagora-app',
      ])
    } finally {
      // Back to the server's state without SMTP: the password is gone from listmonk's settings.
      expect(await listmonk.applySettings()).toEqual(['API user gliagora-app', 'setting smtp'])
    }
    expect(await setting('smtp')).toEqual([
      expect.objectContaining({ enabled: false, username: '', password: '' }),
    ])
  })

  it('stores the same mail server through prepare.sh as through the node-postgres runner', async () => {
    const smtp = {
      SMTP_HOST: 'smtp.example.org',
      SMTP_PORT: '2525',
      SMTP_USER: 'mailer@example.org',
      SMTP_PASS: "p'w $x \\ y",
    }
    try {
      expect(await prepareShRun(smtp)).toBe('setting smtp')
      expect(await setting('smtp')).toEqual([
        expect.objectContaining({
          enabled: true,
          host: 'smtp.example.org',
          port: 2525,
          username: 'mailer@example.org',
          password: "p'w $x \\ y",
          auth_protocol: 'plain',
          tls_type: 'STARTTLS',
        }),
      ])
      // The same settings through listmonkParams (pnpm listmonk:setup, the tests, CI): nothing
      // left to change, so both runners store exactly the same.
      const params = listmonkParams({
        LISTMONK_API_TOKEN: listmonk.token,
        LISTMONK_ROOT_URL: listmonk.url,
        ...smtp,
      })
      expect(await listmonk.applySettings(params)).toEqual([])
    } finally {
      expect(await listmonk.applySettings()).toEqual(['setting smtp'])
    }
  })

  it('refuses unusable parameters, or a setting this listmonk lacks, before changing anything', async () => {
    const before = await query(`select key, value from settings order by key`)
    await expect(listmonk.applySettings({ api_token_sha256: 'not-a-hash' })).rejects.toThrow(
      /^api_token_sha256 must be/,
    )
    await expect(
      listmonk.applySettings({ root_url: 'http://localhost:9000/admin' }),
    ).rejects.toThrow(/^root_url must be/)
    await expect(
      listmonk.applySettings({
        smtp_host: 'smtp.example.org',
        smtp_port: '0',
        smtp_tls: 'STARTTLS',
      }),
    ).rejects.toThrow(/^smtp_port is not a port number/)
    // A listmonk upgrade that renamed a setting: the run stops, naming it, and changes nothing.
    const [removed] = await query<{ value: unknown }>(
      `delete from settings where key = 'privacy.record_optin_ip' returning value`,
    )
    try {
      await expect(
        listmonk.applySettings({ smtp_host: '127.0.0.1', smtp_port: '1025', smtp_tls: 'none' }),
      ).rejects.toThrow(/^listmonk has no setting privacy\.record_optin_ip/)
    } finally {
      await query(
        `insert into settings (key, value) values ('privacy.record_optin_ip', '${JSON.stringify(removed!.value)}')`,
      )
    }
    expect(await query(`select key, value from settings order by key`)).toEqual(before)
  })

  it('refuses a listmonk without its admin, where the app’s role would become the super admin', async () => {
    // listmonk treats role 1 as its super admin, whatever it holds; the install makes it with the
    // admin account, and only then may the app's role be made.
    await expect(startListmonk({ withoutAdmin: true })).rejects.toThrow(
      /^listmonk has no admin yet \(its role 1\)/,
    )
    const [role] = await query<{ id: number; name: string }>(
      `select id, name from roles where id = 1`,
    )
    expect(role).toEqual({ id: 1, name: 'Super Admin' })
  })
})
