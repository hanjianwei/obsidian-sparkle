import { en, TranslationKey } from './en';
import { zh } from './zh';

export type Locale = 'en' | 'zh';
type Placeholders<S extends string> =
	S extends `${string}{${infer Key}}${infer Rest}`
		? Key | Placeholders<Rest>
		: never;
type Arguments<Key extends TranslationKey> = [
	Placeholders<(typeof en)[Key]>,
] extends [never]
	? []
	: [parameters: Record<Placeholders<(typeof en)[Key]>, string | number>];

let locale: Locale = 'en';

export function resolveLocale(language: string): Locale {
	return /^zh(?:[-_]|$)/i.test(language.trim()) ? 'zh' : 'en';
}

export function setLocale(language: string): void {
	locale = resolveLocale(language);
}

export function getLocale(): Locale {
	return locale;
}

export function t<Key extends TranslationKey>(
	key: Key,
	...args: Arguments<Key>
): string {
	const message = locale === 'zh' ? zh[key] || en[key] : en[key];
	const parameters = args[0] as Record<string, string | number> | undefined;
	return message.replace(/\{(\w+)\}/g, (placeholder: string, name: string) =>
		parameters?.[name] === undefined ? placeholder : String(parameters[name]),
	);
}
