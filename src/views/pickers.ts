import { t } from '../i18n';
import { App, FuzzySuggestModal, getAllTags, TFile } from 'obsidian';

export class FilePicker extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private readonly choose: (file: TFile) => void,
	) {
		super(app);
		this.setPlaceholder(t('filePickerPlaceholder'));
		this.emptyStateText = t('filePickerEmpty');
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.choose(file);
	}
}

export class TagPicker extends FuzzySuggestModal<string> {
	private readonly tags: string[];

	constructor(
		app: App,
		private readonly choose: (tag: string) => void,
	) {
		super(app);
		this.setPlaceholder(t('tagPickerPlaceholder'));
		const tags = new Set<string>();
		for (const file of app.vault.getMarkdownFiles()) {
			const cache = app.metadataCache.getFileCache(file);
			if (cache) for (const tag of getAllTags(cache) ?? []) tags.add(tag);
		}
		this.tags = [...tags].sort((a, b) => a.localeCompare(b));
		this.emptyStateText = t('tagPickerEmpty');
	}

	getItems(): string[] {
		return this.tags;
	}

	getItemText(tag: string): string {
		return tag;
	}

	onChooseItem(tag: string): void {
		this.choose(tag);
	}
}
