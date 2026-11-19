import { Modal, Setting, type App } from 'obsidian'

/** Yes/no confirmation (window.confirm isn't reliable on mobile). */
export class ConfirmModal extends Modal {
  constructor(app: App, private message: string, private cta: string, private onConfirm: () => void | Promise<void>) {
    super(app)
  }

  onOpen() {
    this.contentEl.createEl('p', { text: this.message })
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()))
      .addButton((b) =>
        b.setButtonText(this.cta).setWarning().onClick(async () => {
          this.close()
          await this.onConfirm()
        }),
      )
  }

  onClose() {
    this.contentEl.empty()
  }
}

/** Single text input prompt. */
export class PromptModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private initial: string,
    private cta: string,
    private onSubmit: (value: string) => void | Promise<void>,
  ) {
    super(app)
  }

  onOpen() {
    this.titleEl.setText(this.title)
    let value = this.initial
    new Setting(this.contentEl).addText((t) => {
      t.setValue(value).onChange((v) => { value = v })
      t.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void submit() } })
      window.setTimeout(() => { t.inputEl.focus(); t.inputEl.select() }, 0)
    })
    const submit = async () => {
      if (!value.trim()) return
      this.close()
      await this.onSubmit(value.trim())
    }
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()))
      .addButton((b) => b.setButtonText(this.cta).setCta().onClick(() => void submit()))
  }

  onClose() {
    this.contentEl.empty()
  }
}
