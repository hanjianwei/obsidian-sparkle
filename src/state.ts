import { t } from './i18n';
export interface SparkleSettings {
	heading: string;
	insertionPosition: 'start' | 'end';
	noteImageFolder: string;
	dailyImageFolder: string;
}

export interface SparkleDraft {
	mode: 'file' | 'daily';
	targetPath: string;
	content: string;
	tags: string;
	images: string[];
	expanded: boolean;
}

export function hasDraft(
	draft: Pick<SparkleDraft, 'content' | 'tags' | 'images'>,
): boolean {
	return Boolean(
		draft.content.trim() || draft.tags.trim() || draft.images.length,
	);
}

export function createDefaultSettings(): SparkleSettings {
	return {
		heading: t('defaultHeading'),
		insertionPosition: 'end',
		noteImageFolder: 'assets',
		dailyImageFolder: 'assets/{date}',
	};
}

export function normalizeImageFolder(value: string): string {
	const folder = value
		.trim()
		.replace(/\\/gu, '/')
		.replace(/\/{2,}/gu, '/');
	const literal = folder.replaceAll('{date}', '');
	if (
		!folder ||
		[...literal].some((character) => character.charCodeAt(0) < 32) ||
		/[:*?"<>|{}]/u.test(literal) ||
		folder.split('/').includes('..')
	) {
		throw new Error(t('imageFolderInvalid', { placeholder: '{date}' }));
	}
	return folder === '/' ? folder : folder.replace(/\/$/u, '');
}

export function normalizeHeading(value: string): string {
	if ([...value].some((character) => character.charCodeAt(0) < 32)) {
		throw new Error(t('headingSingleLine'));
	}
	const heading = value
		.trim()
		.replace(/^#{1,6}\s+/, '')
		.replace(/\s+#+$/, '')
		.trim();
	if (!heading || /^#+$/.test(heading)) throw new Error(t('headingRequired'));
	return heading;
}

export function loadPluginData(value: unknown): {
	draft: SparkleDraft;
	settings: SparkleSettings;
} {
	const draft: SparkleDraft = {
		mode: 'file',
		targetPath: '',
		content: '',
		tags: '',
		images: [],
		expanded: false,
	};
	const settings = createDefaultSettings();
	if (!value || typeof value !== 'object') return { draft, settings };
	const data = value as Record<string, unknown>;
	for (const key of ['targetPath', 'content', 'tags'] as const) {
		if (typeof data[key] === 'string') draft[key] = data[key];
	}
	if (data.mode === 'daily') draft.mode = 'daily';
	if (Array.isArray(data.images))
		draft.images = data.images.filter(
			(path): path is string => typeof path === 'string' && Boolean(path),
		);
	draft.expanded = hasDraft(draft);
	if (data.settings && typeof data.settings === 'object') {
		const saved = data.settings as Record<string, unknown>;
		if (typeof saved.heading === 'string') {
			try {
				settings.heading = normalizeHeading(saved.heading);
			} catch {
				/* Keep the default for invalid stored values. */
			}
		}
		if (saved.insertionPosition === 'start')
			settings.insertionPosition = 'start';
		for (const key of ['noteImageFolder', 'dailyImageFolder'] as const) {
			if (typeof saved[key] === 'string') {
				try {
					settings[key] = normalizeImageFolder(saved[key]);
				} catch {
					/* Keep the default for invalid stored paths. */
				}
			}
		}
	}
	return { draft, settings };
}
