import { setLocale, t } from './i18n';
import { getAppLanguage } from './i18n/obsidian';
import { Notice, Plugin, TFile } from 'obsidian';
import { SparkleView, VIEW_TYPE_SPARKLE } from './views/sparkle-view';
import { SparkleSettingTab } from './settings';
import { loadPluginData, normalizeHeading, SparkleSettings } from './state';

export default class SparklePlugin extends Plugin {
	capturePending = false;
	draft = loadPluginData(null).draft;
	settings = loadPluginData(null).settings;
	private saveRequested = false;
	private savePromise: Promise<void> | null = null;

	async onload(): Promise<void> {
		setLocale(getAppLanguage());
		const data = loadPluginData(await this.loadData(), t('defaultHeading'));
		this.draft = data.draft;
		this.settings = data.settings;
		this.addSettingTab(new SparkleSettingTab(this.app, this));

		this.registerView(VIEW_TYPE_SPARKLE, (leaf) => new SparkleView(leaf, this));
		this.addRibbonIcon('sparkles', t('openPanel'), () => this.openPanel());

		this.addCommand({
			id: 'open-panel',
			name: t('openPanel'),
			callback: () => this.openPanel(),
		});
	}

	async openPanel(): Promise<void> {
		try {
			if (!this.draft.targetPath) {
				const file = this.app.workspace.getActiveFile();
				if (file instanceof TFile && file.extension === 'md') {
					this.draft.targetPath = file.path;
				}
			}
			let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_SPARKLE)[0];
			if (!leaf) {
				const rightLeaf = this.app.workspace.getRightLeaf(false);
				if (!rightLeaf) throw new Error(t('rightPanelError'));
				leaf = rightLeaf;
				await leaf.setViewState({ type: VIEW_TYPE_SPARKLE, active: true });
			}
			await this.app.workspace.revealLeaf(leaf);
		} catch (error) {
			console.error('Sparkle: Failed to open panel', error);
			new Notice(t('openPanelError'));
		}
	}

	// Coalesce typing updates and serialize writes so older drafts cannot win.
	persistDraft(): Promise<void> {
		this.saveRequested = true;
		this.savePromise ??= this.writeDraft().finally(() => {
			this.savePromise = null;
		});
		return this.savePromise;
	}

	async updateSettings(changes: Partial<SparkleSettings>): Promise<void> {
		const previous = this.settings;
		const next = { ...previous, ...changes };
		next.heading = normalizeHeading(next.heading);
		this.settings = next;
		try {
			await this.persistDraft();
		} catch (error) {
			if (this.settings === next) this.settings = previous;
			throw error;
		}
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_SPARKLE)) {
			if (leaf.view instanceof SparkleView) leaf.view.onSettingsChanged();
		}
	}

	private async writeDraft(): Promise<void> {
		do {
			this.saveRequested = false;
			await this.saveData({ ...this.draft, settings: { ...this.settings } });
		} while (this.saveRequested);
	}
}
