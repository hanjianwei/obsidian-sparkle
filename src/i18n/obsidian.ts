import { getLanguage, requireApiVersion } from 'obsidian';

export function getAppLanguage(): string {
	if (requireApiVersion('1.8.7')) {
		return getLanguage();
	}
	// Obsidian versions before getLanguage() store the app language here.
	try {
		return window.localStorage.getItem('language') || 'en';
	} catch {
		return 'en';
	}
}
