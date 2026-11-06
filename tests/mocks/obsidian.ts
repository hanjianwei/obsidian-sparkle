// Tests supply the moment runtime that the Obsidian host normally provides.
export { default as moment } from 'moment';

export function getLanguage(): string {
	return 'zh';
}
export class TFile {
	path = '';
}
export class TFolder {
	path = '';
}

export function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
}
