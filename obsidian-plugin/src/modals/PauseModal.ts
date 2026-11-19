import { Modal, type App } from 'obsidian'

/** "Do you really need to interrupt this block?": same wording as the web app's pause popup. */
export class PauseModal extends Modal {
  constructor(app: App, private onPause: (note: string) => void) {
    super(app)
  }

  onOpen() {
    const { contentEl } = this
    contentEl.addClass('pp-pause-modal')
    contentEl.createEl('h2', { text: 'Do you really need to interrupt this block?' })
    contentEl.createEl('p', { cls: 'pp-muted', text: "The clock stops while paused. What's pulling you away?" })
    const input = contentEl.createEl('textarea', { cls: 'pp-input pp-full', attr: { rows: '3', placeholder: 'Optional note…' } })
    window.setTimeout(() => input.focus(), 0)

    const actions = contentEl.createDiv({ cls: 'pp-stack' })
    actions.createEl('button', { cls: 'mod-cta', text: 'Keep focusing' }).addEventListener('click', () => this.close())
    actions.createEl('button', { text: '⏸ Pause anyway' }).addEventListener('click', () => {
      this.onPause(input.value)
      this.close()
    })
  }

  onClose() {
    this.contentEl.empty()
  }
}
