import { t } from '../i18n';
import {
	Component,
	ItemView,
	MarkdownRenderer,
	Notice,
	setIcon,
	TFile,
	WorkspaceLeaf,
} from 'obsidian';
import type SparklePlugin from '../main';
import { SparkleSettingsModal } from '../settings';
import { ensureTodayNote, getTodayTarget } from '../daily-notes';
import { appendEntry, formatEntry, parseTags, readEntries } from '../notes';
import { FilePicker, TagPicker } from './pickers';

export const VIEW_TYPE_SPARKLE = 'sparkle-panel';

export class SparkleView extends ItemView {
	private target: TFile | null = null;
	private fixedTarget: TFile | null = null;
	private dailyPath = '';
	private dailyReady = false;
	private modeButtons = new Map<'file' | 'daily', HTMLButtonElement>();
	private targetName!: HTMLElement;
	private settingsSummary!: HTMLElement;
	private recordsTitle!: HTMLElement;
	private draftBadge!: HTMLElement;
	private fileActions!: HTMLElement;
	private targetHint!: HTMLElement;
	private lastActiveFile: TFile | null = null;
	private targetLabel!: HTMLElement;
	private status!: HTMLElement;
	private editor!: HTMLTextAreaElement;
	private tagsInput!: HTMLInputElement;
	private composer!: HTMLElement;
	private addButton!: HTMLButtonElement;
	private saveButton!: HTMLButtonElement;
	private records!: HTMLElement;
	private controls: HTMLButtonElement[] = [];
	private saving = false;
	private refreshVersion = 0;
	private rendered: Component | null = null;
	private closed = false;

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
		this.closed = false;
		const active = this.app.workspace.getActiveFile();
		this.lastActiveFile = active?.extension === 'md' ? active : null;
		const stored = this.app.vault.getAbstractFileByPath(
			this.plugin.draft.targetPath,
		);
		this.target =
			stored instanceof TFile && stored.extension === 'md' ? stored : null;
		if (!this.plugin.draft.targetPath && this.lastActiveFile) {
			this.target = this.lastActiveFile;
			this.plugin.draft.targetPath = this.target.path;
		}
		this.fixedTarget = this.target;
		this.buildPanel();
		this.persist();
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file?.extension === 'md') this.lastActiveFile = file;
			}),
		);
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file === this.target) void this.refreshRecords();
			}),
		);
		this.registerEvent(
			this.app.vault.on('rename', () => {
				if (
					this.fixedTarget &&
					this.plugin.draft.targetPath !== this.fixedTarget.path
				) {
					this.plugin.draft.targetPath = this.fixedTarget.path;
					this.persist();
				}
				this.updateTarget();
				void this.refreshRecords();
			}),
		);
		this.registerEvent(
			this.app.vault.on('delete', () => {
				if (
					this.fixedTarget &&
					this.app.vault.getAbstractFileByPath(this.fixedTarget.path) !==
						this.fixedTarget
				)
					this.fixedTarget = null;
				this.updateTarget();
				void this.refreshRecords();
			}),
		);
		this.registerEvent(
			this.app.vault.on('create', () => this.checkDailyTarget()),
		);
		this.registerInterval(
			window.setInterval(() => this.checkDailyTarget(), 30_000),
		);
		return this.refreshRecords();
	}

	onClose(): Promise<void> {
		this.closed = true;
		this.refreshVersion++;
		if (this.rendered) this.removeChild(this.rendered);
		this.rendered = null;
		this.contentEl.empty();
		return Promise.resolve();
	}

	private buildPanel(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('sparkle-panel');
		this.controls = [];
		this.modeButtons.clear();

		const header = root.createDiv({ cls: 'sparkle-header' });
		const brand = header.createDiv({ cls: 'sparkle-brand' });
		setIcon(brand.createSpan({ cls: 'sparkle-brand-icon' }), 'sparkles');
		const title = brand.createDiv();
		title.createEl('h2', { text: t('panelTitle'), cls: 'sparkle-title' });
		title.createEl('p', {
			text: t('subtitle'),
			cls: 'sparkle-subtitle',
		});
		this.iconButton(header, 'settings-2', t('recordSettings'), () => {
			new SparkleSettingsModal(this.app, this.plugin).open();
		});

		const targetBox = root.createDiv({ cls: 'sparkle-target' });
		const modes = targetBox.createDiv({
			cls: 'sparkle-modes',
			attr: { role: 'group', 'aria-label': t('destinationMode') },
		});
		for (const [mode, label, icon] of [
			['file', t('fileMode'), 'file-text'],
			['daily', t('dailyMode'), 'calendar-days'],
		] as const) {
			const button = this.button(modes, '', () => {
				this.plugin.draft.mode = mode;
				this.status.setText('');
				this.updateTarget();
				this.persist();
				void this.refreshRecords();
			});
			button.addClass('sparkle-mode');
			setIcon(button.createSpan({ cls: 'sparkle-button-icon' }), icon);
			button.createSpan({ text: label });
			this.modeButtons.set(mode, button);
		}
		const destination = targetBox.createDiv({ cls: 'sparkle-destination' });
		const fileInfo = destination.createDiv({ cls: 'sparkle-file-info' });
		fileInfo.createSpan({ text: t('recordTo'), cls: 'sparkle-label' });
		this.targetName = fileInfo.createDiv({ cls: 'sparkle-target-name' });
		this.targetLabel = fileInfo.createDiv({ cls: 'sparkle-target-path' });
		this.iconButton(
			destination,
			'arrow-up-right',
			t('openTarget'),
			() => void this.openTarget(),
		);
		this.fileActions = targetBox.createDiv({
			cls: 'sparkle-actions sparkle-file-actions',
		});
		this.button(this.fileActions, t('chooseNote'), () => {
			new FilePicker(this.app, (file) => this.selectTarget(file)).open();
		});
		this.button(this.fileActions, t('useCurrentNote'), () => {
			const active = this.app.workspace.getActiveFile();
			const file = active?.extension === 'md' ? active : this.lastActiveFile;
			if (file) this.selectTarget(file);
			else new Notice(t('openMarkdownFirst'));
		});
		this.targetHint = targetBox.createEl('p', { cls: 'sparkle-hint' });
		this.settingsSummary = targetBox.createDiv({
			cls: 'sparkle-settings-summary',
		});

		this.addButton = this.button(root, '', () => {
			this.plugin.draft.expanded = true;
			this.updateComposer();
			this.editor.focus();
		});
		this.addButton.addClass('sparkle-add');
		setIcon(this.addButton.createSpan({ cls: 'sparkle-button-icon' }), 'plus');
		this.addButton.createSpan({ text: t('addIdea') });

		this.composer = root.createDiv({ cls: 'sparkle-composer' });
		const composerHeader = this.composer.createDiv({
			cls: 'sparkle-composer-header',
		});
		composerHeader.createEl('h3', {
			text: t('composerTitle'),
			cls: 'sparkle-composer-title',
		});
		this.draftBadge = composerHeader.createSpan({
			text: t('draft'),
			cls: 'sparkle-draft-badge',
		});
		const contentLabel = this.composer.createEl('label', {
			cls: 'sparkle-field',
		});
		contentLabel.createSpan({ text: t('ideaContent'), cls: 'sparkle-sr-only' });
		this.editor = contentLabel.createEl('textarea', {
			cls: 'sparkle-editor',
			attr: {
				placeholder: t('contentPlaceholder'),
				rows: '6',
			},
		});
		this.editor.value = this.plugin.draft.content;
		this.registerDomEvent(this.editor, 'input', () => {
			this.plugin.draft.content = this.editor.value;
			this.updateSaveButton();
			this.persist();
		});
		const tagsRow = this.composer.createDiv({ cls: 'sparkle-tags-row' });
		const tagsLabel = tagsRow.createEl('label', {
			cls: 'sparkle-field sparkle-tags-field',
		});
		tagsLabel.createSpan({ text: t('optionalTags'), cls: 'sparkle-sr-only' });
		setIcon(tagsLabel.createSpan({ cls: 'sparkle-tag-icon' }), 'hash');
		this.tagsInput = tagsLabel.createEl('input', {
			type: 'text',
			attr: { placeholder: t('tagsPlaceholder') },
		});
		this.tagsInput.value = this.plugin.draft.tags;
		this.registerDomEvent(this.tagsInput, 'input', () => {
			this.plugin.draft.tags = this.tagsInput.value;
			this.persist();
		});
		this.iconButton(tagsRow, 'tags', t('chooseTags'), () => this.chooseTag());
		const footer = this.composer.createDiv({ cls: 'sparkle-composer-footer' });
		footer.createSpan({
			text: t('shortcut'),
			cls: 'sparkle-shortcut',
		});
		const actions = footer.createDiv({ cls: 'sparkle-actions' });
		this.button(actions, t('collapse'), () => {
			this.plugin.draft.expanded = false;
			this.updateComposer();
			this.persist();
		});
		this.saveButton = this.button(
			actions,
			t('saveIdea'),
			() => void this.save(),
		);
		this.saveButton.addClass('mod-cta');
		this.registerDomEvent(this.composer, 'keydown', (event) => {
			if (
				event.key === 'Enter' &&
				(event.metaKey || event.ctrlKey) &&
				!event.isComposing
			) {
				event.preventDefault();
				void this.save();
			}
		});
		this.status = root.createDiv({
			cls: 'sparkle-status',
			attr: { role: 'status', 'aria-live': 'polite' },
		});
		const recordsHeader = root.createDiv({ cls: 'sparkle-records-header' });
		this.recordsTitle = recordsHeader.createEl('h3', {
			cls: 'sparkle-records-title',
		});
		recordsHeader.createSpan({
			text: t('recordsCaption'),
			cls: 'sparkle-records-caption',
		});
		this.records = root.createDiv({ cls: 'sparkle-records' });
		this.updateSettingsSummary();
		this.updateTarget();
		this.updateComposer();
	}

	private iconButton(
		parent: HTMLElement,
		icon: string,
		label: string,
		callback: () => void,
	): HTMLButtonElement {
		const button = this.button(parent, '', callback);
		button.addClass('sparkle-icon-button');
		button.setAttribute('aria-label', label);
		button.setAttribute('title', label);
		setIcon(button, icon);
		return button;
	}

	private chooseTag(): void {
		new TagPicker(this.app, (tag) => {
			if (this.saving || this.closed) return;
			try {
				this.plugin.draft.tags = parseTags(
					`${this.tagsInput.value} ${tag}`,
				).join(' ');
				this.tagsInput.value = this.plugin.draft.tags;
				this.persist();
			} catch (error) {
				new Notice(error instanceof Error ? error.message : t('addTagError'));
			}
		}).open();
	}

	onSettingsChanged(): void {
		if (this.closed) return;
		this.updateSettingsSummary();
		void this.refreshRecords();
	}

	private updateSettingsSummary(): void {
		const { heading, insertionPosition } = this.plugin.settings;
		this.settingsSummary.setText(
			t('settingsSummary', {
				heading,
				order: insertionPosition === 'start' ? t('orderStart') : t('orderEnd'),
			}),
		);
		this.recordsTitle.setText(heading);
	}

	private button(
		parent: HTMLElement,
		text: string,
		callback: () => void,
	): HTMLButtonElement {
		const button = parent.createEl('button', {
			text,
			attr: { type: 'button' },
		});
		this.registerDomEvent(button, 'click', callback);
		this.controls.push(button);
		return button;
	}

	private selectTarget(file: TFile): void {
		if (this.saving || this.closed) return;
		if (
			file.extension !== 'md' ||
			this.app.vault.getAbstractFileByPath(file.path) !== file
		) {
			new Notice(t('noteUnavailable'));
			return;
		}
		this.target = file;
		this.fixedTarget = file;
		this.plugin.draft.targetPath = file.path;
		this.status.setText('');
		this.updateTarget();
		this.persist();
		void this.refreshRecords();
	}

	private updateTarget(): void {
		const daily = this.plugin.draft.mode === 'daily';
		for (const [mode, button] of this.modeButtons) {
			const selected = mode === this.plugin.draft.mode;
			button.setAttribute('aria-pressed', String(selected));
			button.toggleClass('is-active', selected);
		}
		this.fileActions.hidden = daily;
		this.targetHint.setText(daily ? t('dailyHint') : t('fixedTargetHint'));
		if (daily) {
			try {
				const target = getTodayTarget(this.app, new Date());
				this.targetName.setText(
					target.path.split('/').pop()?.replace(/\.md$/, '') ?? t('dailyMode'),
				);
				this.dailyPath = target.path;
				this.target = target.file;
				this.dailyReady = true;
				this.targetLabel.setText(
					target.file ? target.path : t('createOnSave', { path: target.path }),
				);
			} catch (error) {
				this.target = null;
				this.targetName.setText(t('dailyUnavailable'));
				this.dailyReady = false;
				this.targetLabel.setText(
					error instanceof Error ? error.message : t('readDailySettingsError'),
				);
			}
			this.updateSaveButton();
			return;
		}
		this.target = this.fixedTarget;
		this.targetName.setText(this.target?.basename ?? t('chooseANote'));
		this.targetLabel.setText(
			this.target?.path ??
				(this.plugin.draft.targetPath
					? t('unavailablePath', { path: this.plugin.draft.targetPath })
					: t('notePlaceholder')),
		);
		this.updateSaveButton();
	}

	private updateComposer(): void {
		this.composer.hidden = !this.plugin.draft.expanded;
		this.addButton.hidden = this.plugin.draft.expanded;
		if (!this.plugin.draft.expanded) {
			const label = this.addButton.querySelector('span:last-child');
			if (label)
				label.textContent =
					this.plugin.draft.content || this.plugin.draft.tags
						? t('continueDraft')
						: t('addIdea');
		}
	}

	private updateSaveButton(): void {
		this.draftBadge.hidden = !this.plugin.draft.content.trim();
		this.saveButton.disabled =
			this.saving ||
			(this.plugin.draft.mode === 'daily' ? !this.dailyReady : !this.target) ||
			!this.plugin.draft.content.trim();
	}

	private checkDailyTarget(): void {
		if (this.closed || this.saving || this.plugin.draft.mode !== 'daily')
			return;
		const previous = this.target;
		const previousPath = this.dailyPath;
		this.updateTarget();
		if (previous !== this.target || previousPath !== this.dailyPath)
			void this.refreshRecords();
	}

	private async openTarget(): Promise<void> {
		try {
			const file =
				this.plugin.draft.mode === 'daily'
					? await ensureTodayNote(this.app, new Date())
					: this.target;
			if (!file) {
				new Notice(t('chooseNoteFirst'));
				return;
			}
			await this.app.workspace.getLeaf(false).openFile(file);
			if (!this.closed) {
				this.updateTarget();
				await this.refreshRecords();
			}
		} catch (error) {
			new Notice(error instanceof Error ? error.message : t('openTargetError'));
		}
	}

	private persist(): void {
		void this.plugin.persistDraft().catch((error: unknown) => {
			console.error('Sparkle: Failed to persist draft', error);
			if (!this.closed) this.status.setText(t('draftSaveError'));
		});
	}

	private async save(): Promise<void> {
		if (this.plugin.capturePending) return;
		const snapshot = { ...this.plugin.draft };
		const settings = { ...this.plugin.settings };
		const now = new Date();
		let file = this.target;
		let entry: string;
		try {
			entry = formatEntry(snapshot.content, snapshot.tags, now);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : t('captureError'));
			return;
		}
		this.plugin.capturePending = true;
		this.saving = true;
		this.controls.forEach((control) => {
			control.disabled = true;
		});
		this.editor.disabled = true;
		this.tagsInput.disabled = true;
		this.saveButton.setText(t('saving'));
		let written = false;
		try {
			if (snapshot.mode === 'daily')
				file = await ensureTodayNote(this.app, now);
			if (!file || this.app.vault.getAbstractFileByPath(file.path) !== file) {
				throw new Error(t('chooseAvailableNote'));
			}
			await this.app.vault.process(file, (source) =>
				appendEntry(source, entry, settings),
			);
			written = true;
			if (
				this.plugin.draft.content === snapshot.content &&
				this.plugin.draft.tags === snapshot.tags &&
				this.plugin.draft.mode === snapshot.mode &&
				(snapshot.mode === 'daily' ||
					this.plugin.draft.targetPath === file.path)
			) {
				this.plugin.draft.content = '';
				this.plugin.draft.tags = '';
				this.plugin.draft.expanded = false;
			}
			await this.plugin.persistDraft();
			if (!this.closed) this.status.setText(t('savedTo', { path: file.path }));
		} catch (error) {
			console.error('Sparkle: Capture failed', error);
			new Notice(
				written
					? t('draftCleanupError')
					: error instanceof Error
						? error.message
						: t('writeError'),
			);
		} finally {
			this.plugin.capturePending = false;
			this.saving = false;
			if (!this.closed) {
				this.controls.forEach((control) => {
					control.disabled = false;
				});
				this.editor.disabled = false;
				this.tagsInput.disabled = false;
				this.editor.value = this.plugin.draft.content;
				this.tagsInput.value = this.plugin.draft.tags;
				this.saveButton.setText(t('saveIdea'));
				this.updateTarget();
				this.updateComposer();
				await this.refreshRecords();
			}
		}
	}

	private async refreshRecords(): Promise<void> {
		const version = ++this.refreshVersion;
		const file = this.target;
		if (this.rendered) this.removeChild(this.rendered);
		this.rendered = null;
		this.records.empty();
		if (!file) {
			this.showEmpty(
				this.plugin.draft.mode === 'daily'
					? this.dailyReady
						? t('todayEmptyTitle')
						: t('dailySetupTitle')
					: t('chooseDestinationTitle'),
				this.plugin.draft.mode === 'daily'
					? this.dailyReady
						? t('todayEmptyDescription')
						: t('dailySetupDescription')
					: t('chooseDestinationDescription'),
			);
			return;
		}
		let renderer: Component | null = null;
		try {
			const source = await this.app.vault.cachedRead(file);
			if (this.closed || version !== this.refreshVersion) return;
			const markdown = readEntries(source, this.plugin.settings.heading);
			if (!markdown) {
				this.showEmpty(t('noRecords'), t('noRecordsDescription'));
				return;
			}
			const preview = this.records.createDiv({
				cls: 'markdown-rendered sparkle-preview',
			});
			renderer = new Component();
			this.addChild(renderer);
			await MarkdownRenderer.render(
				this.app,
				markdown,
				preview,
				file.path,
				renderer,
			);
			if (this.closed || version !== this.refreshVersion) {
				this.removeChild(renderer);
				return;
			}
			this.decoratePreview(preview);
			this.rendered = renderer;
		} catch (error) {
			if (renderer) this.removeChild(renderer);
			if (!this.closed && version === this.refreshVersion) {
				this.records.setText(
					error instanceof Error ? error.message : t('readIdeasError'),
				);
			}
		}
	}

	private decoratePreview(preview: HTMLElement): void {
		for (const item of Array.from(
			preview.querySelectorAll<HTMLElement>(':scope > ul > li'),
		)) {
			const paragraph =
				item.firstElementChild?.tagName === 'P'
					? (item.firstElementChild as HTMLElement)
					: item;
			const first = paragraph.firstChild;
			const text = first?.textContent ?? '';
			const timestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.exec(text)?.[0];
			if (first?.nodeType !== Node.TEXT_NODE || !timestamp) continue;
			const time = paragraph.createEl('time', {
				text: timestamp,
				cls: 'sparkle-entry-time',
				attr: { datetime: timestamp.replace(' ', 'T') },
			});
			first.textContent = text.slice(timestamp.length).trimStart();
			paragraph.insertBefore(time, first);
		}
	}

	private showEmpty(title: string, description: string): void {
		const empty = this.records.createDiv({ cls: 'sparkle-empty' });
		setIcon(empty.createSpan({ cls: 'sparkle-empty-icon' }), 'sparkles');
		empty.createEl('h4', { text: title, cls: 'sparkle-empty-title' });
		empty.createEl('p', { text: description });
	}
}
