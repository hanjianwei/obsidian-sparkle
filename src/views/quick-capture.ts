import { App, Modal } from 'obsidian';
import type SparklePlugin from '../main';
import { t } from '../i18n';
import { SparklePanel } from './sparkle-panel';
import { CaptureViewport } from './capture-viewport';

export class QuickCaptureModal extends Modal {
	private panel: SparklePanel | null = null;
	private actions: HTMLElement | null = null;
	constructor(
		app: App,
		private readonly plugin: SparklePlugin,
		private readonly onClosed: () => void,
	) {
		super(app);
	}
	onOpen(): void {
		this.setTitle(t('quickCapture'));
		this.modalEl.addClass('sparkle-quick-modal');
		this.actions = this.modalEl.createDiv({
			cls: 'sparkle-panel sparkle-quick sparkle-quick-actions',
		});
		this.panel = new SparklePanel(this.app, this.contentEl, this.plugin, {
			quick: true,
			actionContainer: this.actions,
			onSaved: () => this.close(),
			onContinuous: () => {
				this.close();
				void this.plugin.openContinuousCapture();
			},
		});
		this.panel.load();
		this.panel.addChild(new CaptureViewport(this.containerEl));
		this.panel.focusEditor();
	}
	focusCapture(): void {
		this.panel?.focusEditor();
	}
	onSettingsChanged(): void {
		this.panel?.onSettingsChanged();
	}
	onClose(): void {
		this.panel?.unload();
		this.panel = null;
		this.actions?.remove();
		this.actions = null;
		this.onClosed();
		this.plugin.syncPanels();
	}
}
