import { t } from '../i18n';
import {
	Component,
	App,
	MarkdownRenderer,
	Notice,
	setIcon,
	TFile,
} from 'obsidian';
import type SparklePlugin from '../main';
import { SparkleSettingsModal } from '../settings';
import { ensureTodayNote, getTodayTarget } from '../daily-notes';
import { appendEntry, formatEntry, parseTags, readEntries } from '../notes';
import { TagPicker } from './pickers';
import { hasDraft } from '../state';
import { VaultTagIndex } from '../tag-index';
import { TagSuggest } from './tag-suggest';
import { appendInlineTags } from '../tags';
import { locationCoordinates } from '../location';
import { LocationModal } from './location-modal';
import {
	IMAGE_ACCEPT,
	imageFolder,
	imageName,
	importImage,
	placeImage,
	withImageEmbeds,
} from '../images';

export interface SparklePanelOptions {
	quick?: boolean;
	stream?: boolean;
	actionContainer?: HTMLElement;
	onSaved?: () => void;
	onContinuous?: () => void;
}

export class SparklePanel extends Component {
	private target: TFile | null = null;
	private fixedTarget: TFile | null = null;
	private dailyPath = '';
	private dailyReady = false;
	private modeButtons = new Map<'file' | 'daily', HTMLButtonElement>();
	private targetName!: HTMLElement;
	private settingsSummary!: HTMLElement;
	private recordsTitle!: HTMLElement;
	private draftBadge!: HTMLElement;
	private targetHint!: HTMLElement;
	private targetLabel!: HTMLElement;
	private status!: HTMLElement;
	private editor!: HTMLTextAreaElement;
	private tagsInput: HTMLInputElement | null = null;
	private composer!: HTMLElement;
	private addButton!: HTMLButtonElement;
	private saveButton!: HTMLButtonElement;
	private imageButton!: HTMLButtonElement;
	private imageInput!: HTMLInputElement;
	private attachments!: HTMLElement;
	private locationButton!: HTMLButtonElement;
	private locationPreview!: HTMLElement;
	private locationLabel!: HTMLButtonElement;
	private locationModal: LocationModal | null = null;
	private records!: HTMLElement;
	private controls: HTMLButtonElement[] = [];
	private saving = false;
	private refreshVersion = 0;
	private rendered: Component | null = null;
	private closed = false;
	private tagIndex!: VaultTagIndex;
	private tagSuggestions: TagSuggest[] = [];
	private streamFeed: HTMLElement | null = null;
	private tagFocusFrame: number | null = null;
	private statusTimer: number | null = null;
	private get compact(): boolean {
		return Boolean(this.options.quick || this.options.stream);
	}

	constructor(
		private readonly app: App,
		private readonly contentEl: HTMLElement,
		private readonly plugin: SparklePlugin,
		private readonly options: SparklePanelOptions = {},
	) {
		super();
	}

	onload(): void {
		this.closed = false;
		this.inlineDraftTags();
		this.tagIndex = this.addChild(new VaultTagIndex(this.app));
		const stored = this.app.vault.getAbstractFileByPath(
			this.plugin.draft.targetPath,
		);
		this.target =
			stored instanceof TFile && stored.extension === 'md' ? stored : null;
		this.fixedTarget = this.target;
		if (this.plugin.draft.mode === 'file' && !hasDraft(this.plugin.draft))
			this.bindCurrentNote();
		this.buildPanel();
		this.persist();
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (
					this.plugin.draft.mode !== 'file' ||
					hasDraft(this.plugin.draft) ||
					this.plugin.capturePending
				)
					return;
				this.bindCurrentNote(file ?? this.plugin.getCaptureFile());
				this.updateTarget();
				this.persist();
				void this.refreshRecords();
			}),
		);
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file === this.target) void this.refreshRecords();
			}),
		);
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				const paths = this.plugin.draft.images.map((path) =>
					path === oldPath
						? file.path
						: path.startsWith(`${oldPath}/`)
							? `${file.path}${path.slice(oldPath.length)}`
							: path,
				);
				if (
					paths.some((path, index) => path !== this.plugin.draft.images[index])
				) {
					this.plugin.draft.images = paths;
					this.persist();
				}
				if (!this.saving) this.renderImages();
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
				if (!this.saving) this.renderImages();
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
		void this.refreshRecords(true);
	}

	onunload(): void {
		this.closed = true;
		this.locationModal?.close();
		this.clearStatusTimer();
		if (this.tagFocusFrame !== null)
			this.editor.ownerDocument.defaultView?.cancelAnimationFrame(
				this.tagFocusFrame,
			);
		this.tagFocusFrame = null;
		for (const suggestion of this.tagSuggestions) this.removeChild(suggestion);
		this.tagSuggestions = [];
		this.removeChild(this.tagIndex);
		this.refreshVersion++;
		if (this.rendered) this.removeChild(this.rendered);
		this.rendered = null;
		this.contentEl.empty();
	}

	private buildPanel(): void {
		const root = this.contentEl;
		const compact = this.compact;
		root.empty();
		root.addClass('sparkle-panel');
		root.toggleClass('sparkle-quick', Boolean(this.options.quick));
		root.toggleClass('sparkle-stream', Boolean(this.options.stream));
		this.controls = [];
		this.modeButtons.clear();

		const header = root.createDiv({ cls: 'sparkle-header' });
		header.hidden = Boolean(this.options.quick);
		const brand = header.createDiv({ cls: 'sparkle-brand' });
		setIcon(brand.createSpan({ cls: 'sparkle-brand-icon' }), 'sparkles');
		const title = brand.createDiv();
		title.createEl('h2', {
			text: t(this.options.stream ? 'continuousCapture' : 'panelTitle'),
			cls: 'sparkle-title',
		});
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
				if (this.plugin.capturePending) return;
				this.plugin.draft.mode = mode;
				if (mode === 'file') this.bindCurrentNote();
				this.setStatus('');
				this.updateTarget();
				this.persist();
				void this.refreshRecords(true);
				if (this.options.quick || this.options.stream) this.focusEditor();
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
		if (!this.options.quick)
			this.iconButton(
				destination,
				'arrow-up-right',
				t('openTarget'),
				() => void this.openTarget(),
			);

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
			if (this.options.stream && this.saving) {
				this.editor.value = this.plugin.draft.content;
				return;
			}
			this.plugin.draft.content = this.editor.value;
			this.clearSavedStatus();
			this.updateSaveButton();
			this.persist();
		});
		this.registerDomEvent(this.editor, 'paste', (event) => {
			const files = Array.from(event.clipboardData?.files ?? []);
			if (!files.length) return;
			event.preventDefault();
			event.stopPropagation();
			void this.addImages(files);
		});
		this.registerDomEvent(this.editor, 'dragover', (event) => {
			if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
		});
		this.registerDomEvent(this.editor, 'drop', (event) => {
			const files = Array.from(event.dataTransfer?.files ?? []);
			if (!files.length) return;
			event.preventDefault();
			event.stopPropagation();
			void this.addImages(files);
		});
		this.attachments = this.composer.createDiv({ cls: 'sparkle-attachments' });
		this.registerDomEvent(this.attachments, 'click', (event) => {
			const button = (event.target as Element).closest<HTMLButtonElement>(
				'[data-image-index]',
			);
			if (!button || this.plugin.capturePending) return;
			const index = Number(button.dataset.imageIndex);
			if (
				!Number.isInteger(index) ||
				index < 0 ||
				index >= this.plugin.draft.images.length
			)
				return;
			this.plugin.draft.images.splice(index, 1);
			this.renderImages();
			this.updateSaveButton();
			this.persist();
		});
		this.locationPreview = this.composer.createDiv({
			cls: 'sparkle-location-preview',
		});
		this.locationLabel = this.button(this.locationPreview, '', () =>
			this.chooseLocation(),
		);
		this.locationLabel.addClass('sparkle-location-label');
		this.iconButton(this.locationPreview, 'x', t('removeLocation'), () => {
			if (this.plugin.capturePending) return;
			this.plugin.draft.location = null;
			this.locationChanged();
		});
		this.tagSuggestions = [
			this.addChild(
				new TagSuggest(this.editor, 'content', () => this.tagIndex.getTags()),
			),
		];
		if (this.options.stream) {
			this.registerDomEvent(this.editor, 'beforeinput', (event) => {
				if (this.saving) event.preventDefault();
			});
		}
		if (!compact) {
			const tagsRow = this.composer.createDiv({ cls: 'sparkle-tags-row' });
			const tagsLabel = tagsRow.createEl('label', {
				cls: 'sparkle-field sparkle-tags-field',
			});
			tagsLabel.createSpan({ text: t('optionalTags'), cls: 'sparkle-sr-only' });
			setIcon(tagsLabel.createSpan({ cls: 'sparkle-tag-icon' }), 'hash');
			const input = tagsLabel.createEl('input', {
				type: 'text',
				attr: { placeholder: t('tagsPlaceholder') },
			});
			this.tagsInput = input;
			input.value = this.plugin.draft.tags;
			this.registerDomEvent(input, 'input', () => {
				this.plugin.draft.tags = input.value;
				this.persist();
			});
			this.tagSuggestions.push(
				this.addChild(
					new TagSuggest(input, 'tags', () => this.tagIndex.getTags()),
				),
			);
			this.iconButton(tagsRow, 'tags', t('chooseTags'), () => this.chooseTag());
		}
		const footer = (this.options.actionContainer ?? this.composer).createDiv({
			cls: 'sparkle-composer-footer',
		});
		this.imageInput = root.createEl('input', {
			type: 'file',
			attr: { accept: IMAGE_ACCEPT, multiple: '', tabindex: '-1' },
		});
		this.imageInput.hidden = true;
		this.registerDomEvent(this.imageInput, 'change', () => {
			const files = Array.from(this.imageInput.files ?? []);
			if (files.length) void this.addImages(files);
		});
		this.imageButton = this.iconButton(
			footer,
			'image-plus',
			t('addImages'),
			() => {
				this.imageInput.value = '';
				this.imageInput.click();
			},
		);
		this.locationButton = this.iconButton(
			footer,
			'map-pin',
			t('addLocation'),
			() => this.chooseLocation(),
		);
		if (compact)
			this.iconButton(footer, 'tags', t('chooseTags'), () => this.chooseTag());
		else
			footer.createSpan({
				text: t('shortcut'),
				cls: 'sparkle-shortcut',
			});
		if (this.options.onContinuous)
			this.iconButton(
				footer,
				'messages-square',
				t('continuousCapture'),
				this.options.onContinuous,
			);
		const actions = footer.createDiv({ cls: 'sparkle-actions' });
		if (!compact)
			this.button(actions, t('collapse'), () => {
				this.plugin.draft.expanded = false;
				this.updateComposer();
				this.persist();
			});
		this.saveButton = this.button(
			actions,
			t(compact ? 'sendIdea' : 'saveIdea'),
			() => void this.save(),
		);
		this.saveButton.addClass('mod-cta');
		if (compact) this.saveButton.setAttribute('title', t('shortcut'));
		if (this.options.stream)
			this.registerDomEvent(this.saveButton, 'pointerdown', (event) => {
				// Keep the editable field focused so tapping Capture does not dismiss the keyboard.
				if (event.button === 0) {
					event.preventDefault();
					this.focusEditor();
				}
			});
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
		this.streamFeed = this.options.stream
			? root.createDiv({
					cls: 'sparkle-stream-feed',
					attr: {
						role: 'region',
						'aria-label': t('panelTitle'),
						tabindex: '0',
					},
				})
			: null;
		const history = this.streamFeed ?? root;
		const recordsHeader = history.createDiv({ cls: 'sparkle-records-header' });
		recordsHeader.hidden = Boolean(this.options.quick);
		this.recordsTitle = recordsHeader.createEl('h3', {
			cls: 'sparkle-records-title',
		});
		recordsHeader.createSpan({
			text: t('recordsCaption'),
			cls: 'sparkle-records-caption',
		});
		this.records = history.createDiv({ cls: 'sparkle-records' });
		this.records.hidden = Boolean(this.options.quick);
		if (this.streamFeed) {
			root.append(this.composer, this.streamFeed);
		}
		if (compact) footer.insertBefore(this.status, actions);
		this.updateSettingsSummary();
		this.updateTarget();
		this.updateComposer();
		this.renderImages();
		this.renderLocation();
	}

	private chooseLocation(): void {
		if (this.closed || this.plugin.capturePending || this.locationModal) return;
		this.closeTagSuggestions();
		this.locationModal = new LocationModal(
			this.app,
			this.plugin.draft.location,
			(location) => {
				if (this.closed || this.plugin.capturePending) return false;
				this.plugin.draft.location = location;
				this.locationChanged();
				return true;
			},
			() => {
				this.locationModal = null;
				if (!this.closed) this.focusEditor();
			},
		);
		this.locationModal.open();
	}

	private locationChanged(): void {
		this.clearSavedStatus();
		this.renderLocation();
		this.updateSaveButton();
		this.persist();
		this.plugin.syncPanels();
	}

	private renderLocation(): void {
		const location = this.plugin.draft.location;
		this.locationPreview.hidden = !location;
		this.composer.toggleClass('has-location', Boolean(location));
		this.locationButton.toggleClass('is-active', Boolean(location));
		this.locationButton.setAttribute('aria-pressed', String(Boolean(location)));
		this.locationButton.setAttribute(
			'aria-label',
			t(location ? 'editLocation' : 'addLocation'),
		);
		this.locationButton.setAttribute(
			'title',
			location
				? `${location.name || t('currentLocation')} · ${locationCoordinates(location)}`
				: t('addLocation'),
		);
		if (location) {
			this.locationLabel.setText(
				`📍 ${location.name || locationCoordinates(location)}`,
			);
			this.locationLabel.setAttribute(
				'title',
				`${t('editLocation')} · ${locationCoordinates(location)}`,
			);
		}
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
		if (this.plugin.capturePending) return;
		this.closeTagSuggestions();
		new TagPicker(
			this.app,
			(tag) => {
				if (this.saving || this.closed || this.plugin.capturePending) return;
				try {
					if (this.compact) {
						this.plugin.draft.content = appendInlineTags(
							this.editor.value,
							parseTags(tag).join(' '),
						);
						this.editor.value = this.plugin.draft.content;
						this.clearSavedStatus();
						this.updateSaveButton();
						this.focusEditor();
						// The picker may restore focus as it closes; return to the editor after that.
						const win = this.editor.ownerDocument.defaultView;
						if (win) {
							if (this.tagFocusFrame !== null)
								win.cancelAnimationFrame(this.tagFocusFrame);
							this.tagFocusFrame = win.requestAnimationFrame(() => {
								this.tagFocusFrame = null;
								if (!this.closed) this.focusEditor();
							});
						}
					} else if (this.tagsInput) {
						this.plugin.draft.tags = parseTags(
							`${this.tagsInput.value} ${tag}`,
						).join(' ');
						this.tagsInput.value = this.plugin.draft.tags;
					}
					this.persist();
				} catch (error) {
					new Notice(error instanceof Error ? error.message : t('addTagError'));
				}
			},
			this.tagIndex.getTags(),
		).open();
	}

	focusEditor(): void {
		if (this.closed) return;
		this.plugin.draft.expanded = true;
		this.updateComposer();
		this.editor.focus();
		const end = this.editor.value.length;
		this.editor.setSelectionRange(end, end);
	}

	syncDraft(): void {
		if (this.closed || this.saving) return;
		const tagsMoved = this.inlineDraftTags();
		const file = this.app.vault.getAbstractFileByPath(
			this.plugin.draft.targetPath,
		);
		this.fixedTarget =
			file instanceof TFile && file.extension === 'md' ? file : null;
		if (this.plugin.draft.mode === 'file' && !hasDraft(this.plugin.draft))
			this.bindCurrentNote();
		this.editor.value = this.plugin.draft.content;
		if (this.tagsInput) this.tagsInput.value = this.plugin.draft.tags;
		this.renderImages();
		if (hasDraft(this.plugin.draft)) this.clearSavedStatus();
		this.renderLocation();
		this.updateTarget();
		this.updateComposer();
		if (tagsMoved) this.persist();
		void this.refreshRecords();
	}

	private inlineDraftTags(): boolean {
		if (!this.compact || !this.plugin.draft.tags) return false;
		this.plugin.draft.content = appendInlineTags(
			this.plugin.draft.content,
			this.plugin.draft.tags,
		);
		this.plugin.draft.tags = '';
		return true;
	}

	private clearStatusTimer(): void {
		if (this.statusTimer !== null)
			this.contentEl.ownerDocument.defaultView?.clearTimeout(this.statusTimer);
		this.statusTimer = null;
	}

	private clearSavedStatus(): void {
		if (this.statusTimer !== null) this.setStatus('');
	}

	private setStatus(message: string, transient = false): void {
		this.clearStatusTimer();
		this.status.setText(message);
		this.status.setAttribute('title', message);
		if (transient) {
			this.statusTimer =
				this.contentEl.ownerDocument.defaultView?.setTimeout(() => {
					this.statusTimer = null;
					if (!this.closed) this.setStatus('');
				}, 2_000) ?? null;
		}
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

	private bindCurrentNote(
		file: TFile | null = this.plugin.getCaptureFile() ??
			(this.options.stream ? this.fixedTarget : null),
	): void {
		// Opening a capture tab produces a null file-open event. Keep its bound note.
		if (this.options.stream && !file) file = this.fixedTarget;
		this.fixedTarget =
			file?.extension === 'md' &&
			this.app.vault.getAbstractFileByPath(file.path) === file
				? file
				: null;
		this.plugin.draft.targetPath = this.fixedTarget?.path ?? '';
	}

	private updateTarget(): void {
		const daily = this.plugin.draft.mode === 'daily';
		for (const [mode, button] of this.modeButtons) {
			const selected = mode === this.plugin.draft.mode;
			button.setAttribute('aria-pressed', String(selected));
			button.toggleClass('is-active', selected);
		}
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
				this.setTargetLabel(
					target.file ? target.path : t('createOnSave', { path: target.path }),
					target.path,
				);
			} catch (error) {
				this.target = null;
				this.targetName.setText(t('dailyUnavailable'));
				this.dailyReady = false;
				this.setTargetLabel(
					error instanceof Error ? error.message : t('readDailySettingsError'),
				);
			}
			this.updateSaveButton();
			return;
		}
		this.target = this.fixedTarget;
		this.targetName.setText(this.target?.basename ?? t('noCurrentNote'));
		this.setTargetLabel(
			this.target?.path ??
				(this.plugin.draft.targetPath
					? t('unavailablePath', { path: this.plugin.draft.targetPath })
					: t('currentNoteMissing')),
			this.target?.path,
		);
		this.updateSaveButton();
	}

	private setTargetLabel(label: string, path?: string): void {
		this.targetLabel.setText(
			this.options.quick && path
				? (path.split('/').pop()?.replace(/\.md$/u, '') ?? path)
				: label,
		);
		this.targetLabel.setAttribute('title', path ?? label);
		this.targetLabel.toggleClass('is-error', !path);
	}

	private updateComposer(): void {
		if (this.options.quick || this.options.stream)
			this.plugin.draft.expanded = true;
		if (!this.plugin.draft.expanded) this.closeTagSuggestions();
		this.composer.hidden = !this.plugin.draft.expanded;
		this.addButton.hidden =
			this.plugin.draft.expanded ||
			Boolean(this.options.quick || this.options.stream);
		if (!this.plugin.draft.expanded) {
			const label = this.addButton.querySelector('span:last-child');
			if (label)
				label.textContent = hasDraft(this.plugin.draft)
					? t('continueDraft')
					: t('addIdea');
		}
	}

	private updateSaveButton(): void {
		const busy = this.saving || this.plugin.capturePending;
		this.controls.forEach((control) => {
			control.disabled = busy;
		});
		this.draftBadge.hidden = !hasDraft(this.plugin.draft);
		this.imageButton.disabled =
			this.saving ||
			this.plugin.capturePending ||
			(this.plugin.draft.mode === 'daily' ? !this.dailyReady : !this.target);
		this.saveButton.disabled =
			this.saving ||
			this.plugin.capturePending ||
			(this.plugin.draft.mode === 'daily' ? !this.dailyReady : !this.target) ||
			(!this.plugin.draft.content.trim() &&
				!this.plugin.draft.images.length &&
				!this.plugin.draft.location);
	}

	private renderImages(): void {
		this.attachments.empty();
		this.attachments.hidden = !this.plugin.draft.images.length;
		this.composer.toggleClass(
			'has-images',
			Boolean(this.plugin.draft.images.length),
		);
		for (const [index, path] of this.plugin.draft.images.entries()) {
			const tile = this.attachments.createDiv({ cls: 'sparkle-attachment' });
			const name = path.split('/').pop() ?? path;
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile)
				tile.createEl('img', {
					attr: {
						src: this.app.vault.getResourcePath(file),
						alt: name,
						title: path,
						loading: 'lazy',
						decoding: 'async',
					},
				});
			else
				tile.createSpan({
					text: name,
					attr: { title: t('imageMissing', { path }) },
				});
			const remove = tile.createEl('button', {
				cls: 'sparkle-attachment-remove',
				attr: {
					type: 'button',
					'aria-label': t('removeImage', { name }),
					title: t('removeImage', { name }),
					'data-image-index': String(index),
				},
			});
			setIcon(remove, 'x');
			remove.disabled = this.saving || this.plugin.capturePending;
		}
	}

	private setBusy(busy: boolean): void {
		this.saving = busy;
		if (busy) this.locationModal?.close();
		this.controls.forEach((control) => {
			control.disabled = busy;
		});
		this.attachments.querySelectorAll('button').forEach((button) => {
			button.disabled = busy;
		});
		this.editor.disabled = busy && !this.options.stream;
		if (this.tagsInput) this.tagsInput.disabled = busy;
		this.composer.setAttribute('aria-busy', String(busy));
		this.updateSaveButton();
	}

	private async addImages(files: File[]): Promise<void> {
		if (this.closed) return;
		if (this.plugin.capturePending) {
			new Notice(t('captureBusy'));
			return;
		}
		let folder: string;
		try {
			files.forEach((file) => imageName(file));
			const now = new Date();
			const target =
				this.plugin.draft.mode === 'daily'
					? getTodayTarget(this.app, now).path
					: this.target?.path;
			if (
				!target ||
				(this.plugin.draft.mode === 'file' &&
					this.app.vault.getAbstractFileByPath(target) !== this.target)
			)
				throw new Error(t('chooseAvailableNote'));
			folder = imageFolder(
				target,
				this.plugin.draft.mode,
				this.plugin.settings,
				now,
			);
		} catch (error) {
			new Notice(
				error instanceof Error ? error.message : t('imageImportError'),
			);
			return;
		}
		this.plugin.capturePending = true;
		this.setBusy(true);
		this.closeTagSuggestions();
		this.setStatus(t('addingImages'));
		this.plugin.syncPanels();
		try {
			for (const source of files) {
				const file = await importImage(this.app, source, folder);
				this.plugin.draft.images.push(file.path);
				this.plugin.draft.expanded = true;
				await this.plugin.persistDraft();
			}
			if (!this.closed)
				this.setStatus(t('imagesAdded', { count: files.length }), true);
		} catch (error) {
			if (!this.closed) this.setStatus('');
			new Notice(
				error instanceof Error ? error.message : t('imageImportError'),
			);
		} finally {
			this.plugin.capturePending = false;
			this.saving = false;
			if (!this.closed) {
				this.setBusy(false);
				this.renderImages();
				this.focusEditor();
			}
			this.plugin.syncPanels();
		}
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
			if (!this.closed) this.setStatus(t('draftSaveError'));
		});
	}

	private async save(): Promise<void> {
		if (this.plugin.capturePending) return;
		this.clearSavedStatus();
		if (this.inlineDraftTags()) this.editor.value = this.plugin.draft.content;
		const snapshot = {
			...this.plugin.draft,
			images: [...this.plugin.draft.images],
			location: this.plugin.draft.location,
		};
		const settings = { ...this.plugin.settings };
		const now = new Date();
		let file = this.target;
		let entry: string;
		try {
			if (
				!snapshot.content.trim() &&
				!snapshot.images.length &&
				!snapshot.location
			)
				throw new Error(t('contentRequired'));
			parseTags(snapshot.tags);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : t('captureError'));
			return;
		}
		this.plugin.capturePending = true;
		this.closeTagSuggestions();
		this.setBusy(true);
		this.saveButton.setText(t('saving'));
		let written = false;
		let completed = false;
		try {
			if (snapshot.mode === 'daily')
				file = await ensureTodayNote(this.app, now);
			if (!file || this.app.vault.getAbstractFileByPath(file.path) !== file) {
				throw new Error(t('chooseAvailableNote'));
			}
			const folder = imageFolder(file.path, snapshot.mode, settings, now);
			const embeds: string[] = [];
			for (const [index, path] of snapshot.images.entries()) {
				const image = await placeImage(this.app, path, folder);
				if (image.path !== path)
					this.plugin.draft.images = this.plugin.draft.images.map((current) =>
						current === path ? image.path : current,
					);
				snapshot.images[index] = image.path;
				embeds.push(
					`!${this.app.fileManager.generateMarkdownLink(image, file.path)}`,
				);
			}
			if (snapshot.images.length) await this.plugin.persistDraft();
			entry = formatEntry(
				withImageEmbeds(snapshot.content, embeds),
				snapshot.tags,
				now,
				snapshot.mode,
				snapshot.location,
			);
			await this.app.vault.process(file, (source) =>
				appendEntry(source, entry, settings),
			);
			written = true;
			if (
				this.plugin.draft.content === snapshot.content &&
				this.plugin.draft.tags === snapshot.tags &&
				this.plugin.draft.location === snapshot.location &&
				this.plugin.draft.images.length === snapshot.images.length &&
				this.plugin.draft.images.every(
					(path, index) => path === snapshot.images[index],
				) &&
				this.plugin.draft.mode === snapshot.mode &&
				(snapshot.mode === 'daily' ||
					this.plugin.draft.targetPath === file.path)
			) {
				this.plugin.draft.content = '';
				this.plugin.draft.tags = '';
				this.plugin.draft.images = [];
				this.plugin.draft.location = null;
				this.plugin.draft.expanded = true;
			}
			await this.plugin.persistDraft();
			completed = true;
			if (!this.closed)
				this.setStatus(
					this.options.stream
						? t('ideaSaved')
						: t('savedTo', { path: file.path }),
					Boolean(this.options.stream),
				);
			if (this.options.quick) new Notice(t('savedTo', { path: file.path }));
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
			if (!this.closed) this.setBusy(false);
			this.plugin.syncPanels();
			if (completed && !this.closed && this.options.onSaved) {
				this.options.onSaved();
			} else if (!this.closed) {
				this.editor.value = this.plugin.draft.content;
				if (this.tagsInput) this.tagsInput.value = this.plugin.draft.tags;
				this.saveButton.setText(t(this.compact ? 'sendIdea' : 'saveIdea'));
				this.updateTarget();
				this.updateComposer();
				this.renderImages();
				this.renderLocation();
				if (completed) this.focusEditor();
				await this.refreshRecords(completed);
			}
		}
	}

	private async refreshRecords(jumpToLatest = false): Promise<void> {
		if (this.options.quick) return;
		const feed = this.streamFeed;
		const scrollTop = feed?.scrollTop ?? 0;
		const oldHeight = feed?.scrollHeight ?? 0;
		const newestFirst = this.plugin.settings.insertionPosition === 'start';
		const follow =
			jumpToLatest ||
			(newestFirst
				? scrollTop < 48
				: oldHeight - (feed?.clientHeight ?? 0) - scrollTop < 48);
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
					: t('noCurrentNote'),
				this.plugin.draft.mode === 'daily'
					? this.dailyReady
						? t('todayEmptyDescription')
						: t('dailySetupDescription')
					: t('currentNoteMissing'),
			);
			return;
		}
		let renderer: Component | null = null;
		try {
			const source = await this.app.vault.cachedRead(file);
			if (this.closed || version !== this.refreshVersion) return;
			const markdown = readEntries(source, this.plugin.settings.heading);
			if (!markdown) {
				this.showEmpty(
					t('noRecords'),
					t(
						this.options.stream
							? 'streamEmptyDescription'
							: 'noRecordsDescription',
					),
				);
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
			if (feed)
				feed.scrollTop = follow
					? newestFirst
						? 0
						: feed.scrollHeight
					: newestFirst
						? scrollTop + feed.scrollHeight - oldHeight
						: scrollTop;
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
			const timestamp =
				/^(?:\d{4}-\d{2}-\d{2} )?\d{2}:\d{2}:\d{2}(?=\s|$)/u.exec(text)?.[0];
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

	private closeTagSuggestions(): void {
		for (const suggestion of this.tagSuggestions) suggestion.close();
	}
}
