import { Notice, PluginSettingTab, Setting, type App } from 'obsidian'
import { today } from '../logic/dates'
import { goalFor } from '../logic/stats'
import { ConfirmModal, PromptModal } from '../modals/ConfirmModal'
import { newId } from '../store/PluginData'
import { DEFAULT_SETTINGS, type Settings } from '../types'
import type ProgressivePomodoroPlugin from '../main'

/** Replaces the web app's Manage page: rules, categories and daily goals. */
export class SettingsTab extends PluginSettingTab {
  private folderHandle: number | null = null

  constructor(app: App, private plugin: ProgressivePomodoroPlugin) {
    super(app, plugin)
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()
    containerEl.addClass('pp-settings')
    this.rules(containerEl)
    this.categories(containerEl)
    this.goals(containerEl)
  }

  private get data() { return this.plugin.data }
  private save = () => this.plugin.saveConfig()

  // ---- Rules ------------------------------------------------------------
  private rules(el: HTMLElement) {
    new Setting(el).setName('Progressive Pomodoro').setHeading()
    const s = this.data.settings
    const num = (key: keyof Settings, name: string, desc: string, min = 0) =>
      new Setting(el).setName(name).setDesc(desc).addText((t) => {
        t.inputEl.type = 'number'
        t.inputEl.min = String(min)
        t.setPlaceholder(String(DEFAULT_SETTINGS[key])).setValue(String(s[key])).onChange(async (v) => {
          const n = Number(v)
          if (!Number.isFinite(n) || n < min) return
          ;(s as unknown as Record<string, number>)[key] = Math.round(n)
          await this.save()
        })
      })

    num('defaultStart', 'Default start (min)', 'Block length on a fresh start screen.', 1)
    num('minBlock', 'Min block (min)', 'Suggestions and the custom stepper never go below this.', 1)
    num('maxBlock', 'Max block (min)', 'Suggestions and the custom stepper never go above this.', 1)
    num('focusedStep', '"Highly focused" increase', 'Minutes added to the next block after a highly focused rating.')
    num('flowStep', '"Flow" increase', 'Minutes added to the next block after a flow rating.')
    num('breakMinutes', 'Break length (min)', 'Suggested break after a non-flow block.', 1)

    new Setting(el)
      .setName('Preset lengths')
      .setDesc('Comma-separated minutes for the start-screen buttons (3 per row).')
      .addText((t) =>
        t.setValue(s.presets.join(', ')).onChange(async (v) => {
          const list = v.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0).map(Math.round)
          if (!list.length) return
          s.presets = list
          await this.save()
        }),
      )

    new Setting(el)
      .setName('Log folder')
      .setDesc('Sessions are written to <folder>/YYYY-MM-DD.md. Existing logs are not moved when you change this.')
      .addText((t) =>
        t.setPlaceholder(DEFAULT_SETTINGS.logFolder).setValue(s.logFolder).onChange((v) => {
          s.logFolder = v.trim() || DEFAULT_SETTINGS.logFolder
          if (this.folderHandle !== null) window.clearTimeout(this.folderHandle)
          this.folderHandle = window.setTimeout(async () => {
            await this.save()
            await this.plugin.store.setFolder(s.logFolder)
          }, 600)
        }),
      )

    new Setting(el)
      .setName('Sound')
      .setDesc('Play a chime when a block reaches its planned time and when a break ends.')
      .addToggle((t) => t.setValue(s.sound).onChange(async (v) => { s.sound = v; await this.save() }))
  }

  // ---- Categories -------------------------------------------------------
  private categories(el: HTMLElement) {
    new Setting(el).setName('Categories').setHeading()
      .setDesc('Tasks are notes: pick any note on the timer screen. Categories group blocks for stats.')

    for (const c of this.data.categories) {
      const row = new Setting(el).setName(c.name + (c.archived ? ' (archived)' : ''))
      row.addColorPicker((cp) => cp.setValue(c.color).onChange(async (v) => { c.color = v; await this.save() }))
      row.addExtraButton((b) =>
        b.setIcon('pencil').setTooltip('Rename').onClick(() =>
          new PromptModal(this.app, `Rename "${c.name}"`, c.name, 'Rename', async (name) => {
            if (name === c.name) return
            if (this.data.categories.some((x) => x.name === name)) { new Notice(`A category named "${name}" already exists.`); return }
            const old = c.name
            c.name = name
            for (const g of this.data.goals) if (g.category === old) g.category = name
            if (this.data.idle.category === old) this.data.idle.category = name
            await this.save()
            const n = await this.plugin.store.renameCategory(old, name)
            new Notice(`Renamed "${old}" to "${name}"${n ? ` and updated ${n} logged block${n === 1 ? '' : 's'}` : ''}.`)
            this.display()
          }).open(),
        ),
      )
      row.addExtraButton((b) =>
        b.setIcon(c.archived ? 'archive-restore' : 'archive').setTooltip(c.archived ? 'Unarchive' : 'Archive (hide from timer)')
          .onClick(async () => { c.archived = !c.archived; await this.save(); this.display() }),
      )
      row.addExtraButton((b) =>
        b.setIcon('trash').setTooltip('Delete').onClick(() =>
          new ConfirmModal(this.app, `Delete "${c.name}"? Logged blocks keep the category name; its goals are removed.`, 'Delete', async () => {
            this.data.categories = this.data.categories.filter((x) => x !== c)
            this.data.goals = this.data.goals.filter((g) => g.category !== c.name)
            if (this.data.idle.category === c.name) this.data.idle.category = null
            await this.save()
            this.display()
          }).open(),
        ),
      )
    }

    let name = ''
    let color = '#6366f1'
    new Setting(el)
      .setName('Add category')
      .addColorPicker((cp) => cp.setValue(color).onChange((v) => { color = v }))
      .addText((t) => t.setPlaceholder('e.g. Coding').onChange((v) => { name = v }))
      .addButton((b) =>
        b.setButtonText('Add').setCta().onClick(async () => {
          const n = name.trim()
          if (!n) return
          if (this.data.categories.some((c) => c.name === n)) { new Notice(`"${n}" already exists.`); return }
          this.data.categories.push({ name: n, color, archived: false })
          await this.save()
          this.display()
        }),
      )
  }

  // ---- Goals ------------------------------------------------------------
  private goals(el: HTMLElement) {
    new Setting(el).setName('Daily focus goals').setHeading()
      .setDesc('Changing a goal only affects today onward; past days keep the goal they had.')

    const t = today()
    const scopes: (string | null)[] = [null, ...this.data.categories.map((c) => c.name)]
    const label = (c: string | null) => c ?? 'Overall'

    for (const scope of scopes) {
      const target = goalFor(this.data.goals, t, scope)
      if (!target) continue
      const since = this.data.goals
        .filter((g) => g.category === scope && g.effectiveFrom <= t)
        .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0]?.effectiveFrom
      new Setting(el).setName(`${label(scope)}: ${target} min / day`).setDesc(`Since ${since}`)
    }

    let scope: string | null = null
    let minutes = 60
    new Setting(el)
      .setName('Set goal from today')
      .addDropdown((d) => {
        d.addOption('', 'Overall')
        for (const c of this.data.categories) d.addOption(c.name, c.name)
        d.onChange((v) => { scope = v || null })
      })
      .addText((tx) => {
        tx.inputEl.type = 'number'
        tx.inputEl.min = '0'
        tx.setValue(String(minutes)).onChange((v) => { minutes = Math.max(0, Math.round(Number(v) || 0)) })
      })
      .addButton((b) =>
        b.setButtonText('Set').setCta().onClick(async () => {
          // Replace a goal already set today for this scope rather than stacking duplicates.
          this.data.goals = this.data.goals.filter((g) => !(g.category === scope && g.effectiveFrom === t))
          this.data.goals.push({ id: newId(), category: scope, targetMinutes: minutes, effectiveFrom: t })
          await this.save()
          this.display()
        }),
      )

    if (this.data.goals.length) {
      const details = el.createEl('details', { cls: 'pp-goal-history' })
      details.createEl('summary', { text: 'Goal history' })
      const sorted = [...this.data.goals].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))
      for (const g of sorted) {
        new Setting(details)
          .setName(`${g.effectiveFrom} · ${label(g.category)} · ${g.targetMinutes} min`)
          .addExtraButton((b) =>
            b.setIcon('trash').setTooltip('Delete').onClick(async () => {
              this.data.goals = this.data.goals.filter((x) => x.id !== g.id)
              await this.save()
              this.display()
            }),
          )
      }
    }
  }
}
