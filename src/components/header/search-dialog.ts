// The search dialog's behaviour beyond opening it (PLAN §7.5), loaded when it is first opened, so
// it adds nothing to the scripts of every page (§17.3). DisclosureEnhancer opens the dialog;
// live suggestions (a combobox over a JSON route with the same queries) would join here.

const openers = new WeakMap<HTMLDialogElement, Element | null>()

export function enhance(dialog: HTMLDialogElement, from: Element | null) {
  const first = !openers.has(dialog)
  openers.set(dialog, from)
  if (!first) return

  // A click on the backdrop closes the dialog. The panel fills the dialog, so a press whose target
  // is the dialog itself landed outside the panel. A click goes to the element that holds both
  // where the press started and where it ended, so text selected by dragging from the field out
  // past the panel's edge reaches the dialog too: close only when the press started outside.
  let pressedOutside = false
  dialog.addEventListener('pointerdown', (event) => {
    pressedOutside = event.target === dialog
  })
  dialog.addEventListener('click', (event) => {
    if (pressedOutside && event.target === dialog) dialog.close()
    pressedOutside = false
  })

  // Browsers return focus to the element that had it before the dialog opened. Safari does not
  // focus a link when it is clicked, so there focus would fall back to the page: return it to the
  // link that opened the dialog.
  dialog.addEventListener('close', () => {
    const opener = openers.get(dialog)
    const active = document.activeElement
    if (
      opener instanceof HTMLElement &&
      opener.isConnected &&
      (!active || active === document.body)
    )
      opener.focus()
  })
}
