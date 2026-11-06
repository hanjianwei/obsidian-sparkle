import { setLocale, t } from './i18n';
import { getLanguage, Notice, Plugin, TFile } from 'obsidian';
import { SparkleView, VIEW_TYPE_SPARKLE } from './views/sparkle-view';
import { SparkleSettingTab } from './settings';
import {
	hasDraft,
	loadPluginData,
	normalizeHeading,
	normalizeImageFolder,
	SparkleSettings,
} from './state';
import { QuickCaptureModal } from './views/quick-capture';
import { CaptureView, VIEW_TYPE_CAPTURE } from './views/capture-view';

export default class SparklePlugin extends Plugin {
	capturePending = false;
	draft = loadPluginData(null).draft;
	settings = loadPluginData(null).settings;
	private saveRequested = false;
	private savePromise: Promise<void> | null = null;
	private quickCapture: QuickCaptureModal | null = null;
	private captureOpening: Promise<void> | null = null;

	async onload(): Promise<void> {
		setLocale(getLanguage());
		const data = loadPluginData(await this.loadData());
		this.draft = data.draft;
		this.settings = data.settings;
		this.addSettingTab(new SparkleSettingTab(this.app, this));

		this.registerView(VIEW_TYPE_SPARKLE, (leaf) => new SparkleView(leaf, this));
		this.registerView(VIEW_TYPE_CAPTURE, (leaf) => new CaptureView(leaf, this));
		this.addRibbonIcon('sparkles', t('quickCapture'), () =>
			this.openQuickCapture(),
		);
		this.addCommand({
			id: 'quick-capture',
			name: t('quickCapture'),
			icon: 'sparkles',
			callback: () => this.openQuickCapture(),
		});
		this.register(() => this.quickCapture?.close());
		this.addCommand({
			id: 'continuous-capture',
			name: t('continuousCapture'),
			icon: 'messages-square',
			callback: () => this.openContinuousCapture(),
		});

		this.addCommand({
			id: 'open-panel',
			name: t('openPanel'),
			callback: () => this.openPanel(),
		});
	}

	openContinuousCapture(): Promise<void> {
		this.captureOpening ??= this.revealCapturePage().finally(() => {
			this.captureOpening = null;
		});
		return this.captureOpening;
	}

	private async revealCapturePage(): Promise<void> {
		try {
			if (this.capturePending) {
				new Notice(t('captureBusy'));
				return;
			}
			let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CAPTURE)[0];
			// Capture the Markdown destination before the capture tab becomes active.
			if (!leaf || this.app.workspace.getActiveFile())
				this.prepareCurrentNote();
			this.draft.expanded = true;
			if (!leaf) {
				leaf = this.app.workspace.getLeaf('tab');
				await leaf.setViewState({ type: VIEW_TYPE_CAPTURE, active: true });
			}
			await this.app.workspace.revealLeaf(leaf);
			if (leaf.view instanceof CaptureView) leaf.view.focusCapture();
		} catch (error) {
			console.error('Sparkle: Failed to open continuous capture', error);
			new Notice(t('openCaptureError'));
		}
	}

	async openPanel(): Promise<void> {
		try {
			this.prepareCurrentNote();
			let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_SPARKLE)[0];
			if (!leaf) {
				const rightLeaf = this.app.workspace.getRightLeaf(false);
				if (!rightLeaf) throw new Error(t('rightPanelError'));
				leaf = rightLeaf;
				await leaf.setViewState({ type: VIEW_TYPE_SPARKLE, active: true });
			}
			await this.app.workspace.revealLeaf(leaf);
			if (leaf.view instanceof SparkleView) leaf.view.focusCapture();
		} catch (error) {
			console.error('Sparkle: Failed to open panel', error);
			new Notice(t('openPanelError'));
		}
	}

	openQuickCapture(): void {
		if (this.capturePending) {
			new Notice(t('captureBusy'));
			return;
		}
		if (this.quickCapture) {
			this.quickCapture.focusCapture();
			return;
		}
		this.prepareCurrentNote();
		this.draft.expanded = true;
		this.quickCapture = new QuickCaptureModal(this.app, this, () => {
			this.quickCapture = null;
		});
		this.quickCapture.open();
	}

	private prepareCurrentNote(): void {
		if (
			this.capturePending ||
			(this.draft.mode === 'file' && hasDraft(this.draft))
		)
			return;
		const file = this.getCaptureFile();
		this.draft.targetPath = file?.extension === 'md' ? file.path : '';
		if (!this.draft.targetPath) this.draft.mode = 'daily';
	}

	getCaptureFile(): TFile | null {
		const active = this.app.workspace.getActiveFile();
		if (active) return active.extension === 'md' ? active : null;
		// A capture tab has no file of its own; keep the note it was opened from.
		if (this.app.workspace.getActiveViewOfType(CaptureView)) {
			const file = this.app.vault.getAbstractFileByPath(this.draft.targetPath);
			if (file instanceof TFile && file.extension === 'md') return file;
		}
		return null;
	}

	syncPanels(): void {
		for (const view of this.captureViews()) view.syncDraft();
	}

	private captureViews(): Array<SparkleView | CaptureView> {
		const leaves = new Set([
			...this.app.workspace.getLeavesOfType(VIEW_TYPE_SPARKLE),
			...this.app.workspace.getLeavesOfType(VIEW_TYPE_CAPTURE),
		]);
		return [...leaves]
			.map((leaf) => leaf.view)
			.filter(
				(view): view is SparkleView | CaptureView =>
					view instanceof SparkleView || view instanceof CaptureView,
			);
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
		next.noteImageFolder = normalizeImageFolder(next.noteImageFolder);
		next.dailyImageFolder = normalizeImageFolder(next.dailyImageFolder);
		this.settings = next;
		try {
			await this.persistDraft();
		} catch (error) {
			if (this.settings === next) this.settings = previous;
			throw error;
		}
		for (const view of this.captureViews()) view.onSettingsChanged();
		this.quickCapture?.onSettingsChanged();
	}

	private async writeDraft(): Promise<void> {
		do {
			this.saveRequested = false;
			await this.saveData({
				...this.draft,
				images: [...this.draft.images],
				location: this.draft.location ? { ...this.draft.location } : null,
				settings: { ...this.settings },
			});
		} while (this.saveRequested);
	}
}
