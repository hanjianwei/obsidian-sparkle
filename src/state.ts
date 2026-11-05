import { t } from './i18n';
export interface SparkleSettings {
	heading: string;
	insertionPosition: 'start' | 'end';
}

export interface SparkleDraft {
	mode: 'file' | 'daily';
	targetPath: string;
	content: string;
	tags: string;
	expanded: boolean;
}

export const DEFAULT_SETTINGS: Readonly<SparkleSettings> = {
	heading: '灵感',
	insertionPosition: 'end',
};

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

export function loadPluginData(
	value: unknown,
	initialHeading = DEFAULT_SETTINGS.heading,
): {
	draft: SparkleDraft;
	settings: SparkleSettings;
} {
	const draft: SparkleDraft = {
		mode: 'file',
		targetPath: '',
		content: '',
		tags: '',
		expanded: false,
	};
	const settings = { ...DEFAULT_SETTINGS };
	// Localize only first-install defaults. Never change an existing note destination.
	if (value == null) settings.heading = normalizeHeading(initialHeading);
	if (!value || typeof value !== 'object') return { draft, settings };
	const data = value as Record<string, unknown>;
	// Earlier releases stored draft fields directly at the top level.
	for (const key of ['targetPath', 'content', 'tags'] as const) {
		if (typeof data[key] === 'string') draft[key] = data[key];
	}
	if (data.mode === 'daily') draft.mode = 'daily';
	draft.expanded = Boolean(draft.content || draft.tags);
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
	}
	return { draft, settings };
}
