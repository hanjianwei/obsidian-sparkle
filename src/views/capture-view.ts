import { ItemView, WorkspaceLeaf } from 'obsidian';
import type SparklePlugin from '../main';
import { t } from '../i18n';
import { CaptureViewport } from './capture-viewport';
import { SparklePanel } from './sparkle-panel';

export const VIEW_TYPE_CAPTURE = 'sparkle-capture';

/** A regular workspace tab: a persistent composer above scrollable history. */
export class CaptureView extends ItemView {
	private panel: SparklePanel | null = null;
	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: SparklePlugin,
	) {
		super(leaf);
	}
	getViewType(): string {
		return VIEW_TYPE_CAPTURE;
	}
	getDisplayText(): string {
		return t('continuousCapture');
	}
	getIcon(): string {
		return 'messages-square';
	}
	onOpen(): Promise<void> {
		this.panel = this.addChild(
			new SparklePanel(this.app, this.contentEl, this.plugin, { stream: true }),
		);
		this.panel.load();
		this.panel.addChild(new CaptureViewport(this.contentEl, 'view'));
		return Promise.resolve();
	}
	onClose(): Promise<void> {
		if (this.panel) this.removeChild(this.panel);
		this.panel = null;
		this.contentEl.removeClass('sparkle-stream');
		return Promise.resolve();
	}
	syncDraft(): void {
		this.panel?.syncDraft();
	}
	onSettingsChanged(): void {
		this.panel?.onSettingsChanged();
	}
	focusCapture(): void {
		this.panel?.syncDraft();
		this.panel?.focusEditor();
	}
}
