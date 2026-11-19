import { FuzzySuggestModal, type App, type TFile } from 'obsidian'

/** Pick any Markdown note in the vault to use as the block's task. */
export class NotePicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private exclude: string, private onPick: (file: TFile) => void) {
    super(app)
    this.setPlaceholder('Pick a note as the task for this block…')
  }

  getItems(): TFile[] {
    const prefix = `${this.exclude}/`
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => !f.path.startsWith(prefix))
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
  }

  getItemText(file: TFile): string {
    return file.path.replace(/\.md$/, '')
  }

  onChooseItem(file: TFile): void {
    this.onPick(file)
  }
}
