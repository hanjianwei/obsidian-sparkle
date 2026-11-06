import { t } from '../i18n';
import { App, FuzzySuggestModal } from 'obsidian';
import { collectVaultTags } from '../tag-index';

export class TagPicker extends FuzzySuggestModal<string> {
	private readonly tags: string[];

	constructor(
		app: App,
		private readonly choose: (tag: string) => void,
		tags: readonly string[] = collectVaultTags(app),
	) {
		super(app);
		this.setPlaceholder(t('tagPickerPlaceholder'));
		this.tags = [...tags];
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
