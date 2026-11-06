import { ItemView, WorkspaceLeaf } from 'obsidian';
import type SparklePlugin from '../main';
import { t } from '../i18n';
import { SparklePanel } from './sparkle-panel';

export const VIEW_TYPE_SPARKLE = 'sparkle-panel';

export class SparkleView extends ItemView {
	private panel: SparklePanel | null = null;
	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: SparklePlugin,
	) {
		super(leaf);
	}
	getViewType(): string {
		return VIEW_TYPE_SPARKLE;
	}
	getDisplayText(): string {
		return t('panelTitle');
	}
	getIcon(): string {
		return 'sparkles';
	}
	onOpen(): Promise<void> {
		this.panel = this.addChild(
			new SparklePanel(this.app, this.contentEl, this.plugin),
		);
		this.panel.load();
		return Promise.resolve();
	}
	onClose(): Promise<void> {
		if (this.panel) this.removeChild(this.panel);
		this.panel = null;
		return Promise.resolve();
	}
	onSettingsChanged(): void {
		this.panel?.onSettingsChanged();
	}
	syncDraft(): void {
		this.panel?.syncDraft();
	}
	focusCapture(): void {
		this.panel?.syncDraft();
		this.panel?.focusEditor();
	}
}
