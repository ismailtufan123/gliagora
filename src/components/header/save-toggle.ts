// Save without a page load (M4b, D49; the M4b design §3), loaded the first time a Save form is
// used or focused, so it adds nothing to what every page loads (PLAN §17.3); DisclosureEnhancer
// takes the form's submit over. The button changes at once (aria-pressed and the hidden `saved`
// value), the route answers `{ saved }`, and the page's live region says what happened (its text
// comes from the button's data attributes; the position's title in it keeps the language and
// direction the button's own title has). Focus stays where it is and nothing on the page moves.
// Signed out meanwhile (401): the browser goes to the sign-in page the route names, which saves
// afterwards. Anything else (a refused Save, a failure, no connection): the button goes back, and
// the form is sent as it would be without JavaScript, so the page that answers says what happened.

const STATUS = 'save-status'

/**
 * Writes `text` into the live region. A title in another language than the page's (the button's
 * own title then has `lang`, SaveControl) is put in an element of that language and direction
 * (WCAG 3.1.2), so a screen reader reads it as such.
 */
function announce(status: HTMLElement, text: string, title: HTMLElement | null) {
  const words = title?.textContent ?? ''
  const at = title && words ? text.lastIndexOf(words) : -1
  if (!title || at < 0) {
    status.textContent = text
    return
  }
  const span = document.createElement('span')
  span.lang = title.lang
  if (title.dir) span.dir = title.dir
  span.textContent = words
  status.replaceChildren(text.slice(0, at), span, text.slice(at + words.length))
}

export async function toggle(form: HTMLFormElement) {
  const button = form.querySelector<HTMLButtonElement>('button[aria-pressed]')
  const wanted = form.querySelector<HTMLInputElement>('input[name="saved"]')
  if (!button || !wanted) return form.submit()
  // A second press while the first is on its way: the first decides.
  if (button.getAttribute('aria-busy') === 'true') return
  const body = new FormData(form)
  const saving = wanted.value === '1'
  const show = (saved: boolean) => {
    button.setAttribute('aria-pressed', String(saved))
    wanted.value = saved ? '0' : '1'
  }
  button.setAttribute('aria-busy', 'true')
  show(saving)

  let response: Response | null = null
  try {
    response = await fetch(form.action, {
      method: 'POST',
      body,
      headers: { Accept: 'application/json' },
    })
  } catch {
    // No connection: the form, sent as it is, shows the browser's own error page.
  }
  const answer = response
    ? ((await response.json().catch(() => null)) as { saved?: unknown; signIn?: unknown } | null)
    : null
  button.removeAttribute('aria-busy')

  if (response?.status === 401 && typeof answer?.signIn === 'string') {
    location.assign(answer.signIn)
    return
  }
  if (response?.ok && typeof answer?.saved === 'boolean') {
    show(answer.saved)
    const status = document.getElementById(STATUS)
    const text = button.dataset[answer.saved ? 'savedText' : 'removedText']
    if (status && text) {
      // Cleared first, so that the same words again are announced again.
      status.textContent = ''
      requestAnimationFrame(() => {
        announce(status, text, button.querySelector<HTMLElement>('[lang]'))
      })
    }
    return
  }
  show(!saving)
  form.submit()
}
