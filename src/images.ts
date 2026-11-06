import { App, normalizePath, TFile, TFolder } from 'obsidian';
import { t } from './i18n';
import { normalizeImageFolder, SparkleSettings } from './state';

export const IMAGE_ACCEPT =
	'.avif,.bmp,.gif,.jpeg,.jpg,.png,.svg,.webp,image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp,image/avif';
const EXTENSIONS = new Set([
	'avif',
	'bmp',
	'gif',
	'jpeg',
	'jpg',
	'png',
	'svg',
	'webp',
]);
const MIME_EXTENSIONS: Record<string, string> = {
	'image/avif': 'avif',
	'image/bmp': 'bmp',
	'image/gif': 'gif',
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/svg+xml': 'svg',
	'image/webp': 'webp',
};
export type ImageSource = Pick<File, 'name' | 'type' | 'size' | 'arrayBuffer'>;

export function imageName(
	source: Pick<ImageSource, 'name' | 'type' | 'size'>,
): string {
	if (!source.size) throw new Error(t('imageEmpty', { name: source.name }));
	const original = source.name.split(/[/\\]/u).pop() ?? '';
	const suffix = /\.([^.]+)$/u.exec(original)?.[1]?.toLowerCase() ?? '';
	const extension = EXTENSIONS.has(suffix)
		? suffix
		: MIME_EXTENSIONS[source.type];
	if (!extension) throw new Error(t('imageUnsupported', { name: source.name }));
	const stem =
		[...original.replace(/\.[^.]+$/u, '')]
			.map((character) =>
				character.charCodeAt(0) < 32 || '\\/:*?"<>|#^[]%'.includes(character)
					? '-'
					: character,
			)
			.join('')
			.replace(/^[.\s]+|[.\s]+$/gu, '') || 'image';
	return `${stem}.${extension}`;
}

export function imageFolder(
	targetPath: string,
	mode: 'file' | 'daily',
	settings: Pick<SparkleSettings, 'noteImageFolder' | 'dailyImageFolder'>,
	now: Date,
): string {
	const template = normalizeImageFolder(
		mode === 'daily' ? settings.dailyImageFolder : settings.noteImageFolder,
	);
	const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
	const relative = template.replaceAll('{date}', date);
	const parent = targetPath.includes('/')
		? targetPath.slice(0, targetPath.lastIndexOf('/'))
		: '';
	const path = [
		...(relative.startsWith('/') ? [] : [parent]),
		...relative.split('/').filter((part) => part && part !== '.'),
	]
		.filter(Boolean)
		.join('/');
	return path ? normalizePath(path) : '';
}

async function ensureFolder(app: App, folder: string): Promise<void> {
	let path = '';
	for (const segment of folder.split('/').filter(Boolean)) {
		path = path ? `${path}/${segment}` : segment;
		const existing = app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFolder) continue;
		if (existing) throw new Error(t('imageFolderBlocked', { path }));
		try {
			await app.vault.createFolder(path);
		} catch (error) {
			if (!(app.vault.getAbstractFileByPath(path) instanceof TFolder))
				throw error;
		}
	}
}

function availablePath(app: App, folder: string, name: string): string {
	const dot = name.lastIndexOf('.');
	let path = [folder, name].filter(Boolean).join('/');
	let suffix = 1;
	while (app.vault.getAbstractFileByPath(path)) {
		path = [folder, `${name.slice(0, dot)}-${suffix++}${name.slice(dot)}`]
			.filter(Boolean)
			.join('/');
	}
	return path;
}

export async function importImage(
	app: App,
	source: ImageSource,
	folder: string,
): Promise<TFile> {
	const name = imageName(source);
	const data = await source.arrayBuffer();
	await ensureFolder(app, folder);
	const path = availablePath(app, folder, name);
	return app.vault.createBinary(path, data);
}

export function getImage(app: App, path: string): TFile {
	const file = app.vault.getAbstractFileByPath(path);
	if (
		!(file instanceof TFile) ||
		!EXTENSIONS.has(path.split('.').pop()?.toLowerCase() ?? '')
	)
		throw new Error(t('imageMissing', { path }));
	return file;
}

export async function placeImage(
	app: App,
	path: string,
	folder: string,
): Promise<TFile> {
	const file = getImage(app, path);
	const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
	if (parent === folder) return file;
	await ensureFolder(app, folder);
	const name = path.split('/').pop() ?? '';
	await app.fileManager.renameFile(file, availablePath(app, folder, name));
	return file;
}

export function withImageEmbeds(
	content: string,
	embeds: readonly string[],
): string {
	if (!embeds.length) return content;
	const body = content.trim() ? content : '';
	const separator =
		!body || body.endsWith('\n\n') ? '' : body.endsWith('\n') ? '\n' : '\n\n';
	return `${body}${separator}${embeds.join('\n')}`;
}
