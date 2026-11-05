import { t } from './i18n';
import { App, moment, normalizePath, TFile } from 'obsidian';
import {
	appHasDailyNotesPluginLoaded,
	createDailyNote,
	getDailyNoteSettings,
} from 'obsidian-daily-notes-interface';

export function getTodayTarget(
	app: App,
	now: Date,
): { path: string; file: TFile | null } {
	if (!appHasDailyNotesPluginLoaded()) {
		throw new Error(t('dailyDisabled'));
	}
	const settings = getDailyNoteSettings();
	if (!settings) throw new Error(t('dailySettingsError'));
	const name = moment(now).format(settings.format || 'YYYY-MM-DD');
	const filename = name.endsWith('.md') ? name : `${name}.md`;
	const path = normalizePath(
		[settings.folder, filename].filter(Boolean).join('/'),
	);
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing && !(existing instanceof TFile)) {
		throw new Error(t('dailyPathConflict', { path }));
	}
	return { path, file: existing instanceof TFile ? existing : null };
}

export async function ensureTodayNote(app: App, now: Date): Promise<TFile> {
	const target = getTodayTarget(app, now);
	if (target.file) return target.file;
	const { template } = getDailyNoteSettings();
	if (template) {
		const file = app.metadataCache.getFirstLinkpathDest(template, '');
		if (!(file instanceof TFile)) {
			throw new Error(t('dailyTemplateMissing', { template }));
		}
		await app.vault.cachedRead(file);
	}
	try {
		const created = await createDailyNote(moment(now));
		if (created?.path === target.path) return created;
	} catch (error) {
		// A simultaneous core-plugin creation may have already created this note.
		const existing = app.vault.getAbstractFileByPath(target.path);
		if (existing instanceof TFile) return existing;
		throw error;
	}
	const existing = app.vault.getAbstractFileByPath(target.path);
	if (existing instanceof TFile) return existing;
	throw new Error(t('dailyCreateError'));
}
