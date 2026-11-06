import { App, Component, getAllTags } from 'obsidian';

export function collectVaultTags(app: App): string[] {
	const tags = new Map<string, string>();
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		if (!cache) continue;
		for (const tag of getAllTags(cache) ?? []) {
			const key = tag.toLowerCase();
			if (!tags.has(key)) tags.set(key, tag);
		}
	}
	return [...tags.values()].sort((a, b) => a.localeCompare(b));
}

export class VaultTagIndex extends Component {
	private dirty = true;
	private tags: string[] = [];
	constructor(private readonly app: App) {
		super();
	}
	onload(): void {
		const invalidate = (): void => {
			this.dirty = true;
		};
		this.registerEvent(this.app.metadataCache.on('changed', invalidate));
		this.registerEvent(this.app.metadataCache.on('resolved', invalidate));
		this.registerEvent(this.app.vault.on('delete', invalidate));
	}
	getTags(): readonly string[] {
		if (this.dirty) {
			this.tags = collectVaultTags(this.app);
			this.dirty = false;
		}
		return this.tags;
	}
}
