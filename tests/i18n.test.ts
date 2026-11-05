import { afterEach, describe, expect, it, vi } from 'vitest';
import * as obsidian from 'obsidian';
import { getLocale, resolveLocale, setLocale, t } from '../src/i18n';
import { en, TranslationKey } from '../src/i18n/en';
import { zh } from '../src/i18n/zh';
import { getAppLanguage } from '../src/i18n/obsidian';
import { loadPluginData, normalizeHeading } from '../src/state';
import { appendEntry, formatEntry, parseTags } from '../src/notes';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('language selection', () => {
	it.each(['zh', 'zh-CN', 'zh-Hans', 'zh_TW', 'ZH-hk', ' zh '])(
		'uses Chinese for %s',
		(language) => {
			expect(resolveLocale(language)).toBe('zh');
		},
	);
	it.each(['en', 'en-US', 'en_GB', 'fr', '', 'zhunknown'])(
		'uses English for %j',
		(language) => {
			setLocale(language);
			expect(getLocale()).toBe('en');
			expect(t('saveIdea')).toBe('Save idea');
		},
	);
	it('reads the public Obsidian language API on supported versions', () => {
		vi.spyOn(obsidian, 'requireApiVersion').mockReturnValue(true);
		vi.spyOn(obsidian, 'getLanguage').mockReturnValue('en');
		expect(getAppLanguage()).toBe('en');
	});
	it('uses the stored app language on older Obsidian versions', () => {
		vi.spyOn(obsidian, 'requireApiVersion').mockReturnValue(false);
		const read = vi.spyOn(obsidian, 'getLanguage');
		vi.stubGlobal('window', { localStorage: { getItem: () => 'zh' } });
		expect(getAppLanguage()).toBe('zh');
		expect(read).not.toHaveBeenCalled();
	});
	it('falls back to English if language storage is unavailable', () => {
		vi.spyOn(obsidian, 'requireApiVersion').mockReturnValue(false);
		vi.stubGlobal('window', {
			get localStorage(): never {
				throw new Error('Unavailable');
			},
		});
		expect(getAppLanguage()).toBe('en');
	});
});

describe('translation catalogs', () => {
	it('covers the same keys and interpolation placeholders in both languages', () => {
		expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
		for (const key of Object.keys(en) as TranslationKey[]) {
			expect(zh[key].trim()).not.toBe('');
			expect(en[key].trim()).not.toBe('');
			expect(zh[key].match(/\{\w+\}/g)?.sort() ?? []).toEqual(
				en[key].match(/\{\w+\}/g)?.sort() ?? [],
			);
		}
	});
	it('interpolates a path as plain text without interpreting it again', () => {
		const path = '阅读/{path}/$&.md';
		expect(t('savedTo', { path })).toBe(`已保存到 ${path}`);
		setLocale('en');
		expect(t('savedTo', { path })).toBe(`Saved to ${path}`);
	});
	it('translates validation errors as well as labels', () => {
		setLocale('en');
		expect(() => normalizeHeading('')).toThrow(
			'Please enter a section heading',
		);
		expect(() => parseTags('123')).toThrow('Invalid tag “123”');
		expect(() => formatEntry('', '', new Date())).toThrow(
			'Please write an idea first',
		);
		setLocale('zh');
		expect(() => normalizeHeading('')).toThrow('请输入小节标题');
	});
});

describe('preserving note data', () => {
	it('localizes the heading only on a new installation', () => {
		setLocale('en');
		expect(loadPluginData(null, t('defaultHeading')).settings.heading).toBe(
			'Ideas',
		);
		setLocale('zh');
		expect(loadPluginData(null, t('defaultHeading')).settings.heading).toBe(
			'灵感',
		);
	});
	it('keeps the legacy heading when upgrading existing data', () => {
		setLocale('en');
		const restored = loadPluginData(
			{ content: '草稿', targetPath: '书.md' },
			t('defaultHeading'),
		);
		expect(restored.settings.heading).toBe('灵感');
		expect(restored.draft.content).toBe('草稿');
	});
	it('keeps customized headings and drafts after an interface language change', () => {
		const saved = {
			content: 'Unfinished 想法',
			tags: '#阅读',
			settings: { heading: '读书感想', insertionPosition: 'start' },
		};
		setLocale('en');
		const english = loadPluginData(saved, t('defaultHeading'));
		setLocale('zh');
		expect(loadPluginData(saved, t('defaultHeading'))).toEqual(english);
	});
	it('does not translate or reformat saved content, timestamps, or tags', () => {
		const date = new Date(2026, 10, 6, 10, 35);
		const entry = formatEntry('想法 about a book', '#阅读 #writing', date);
		const settings = { heading: '读书感想', insertionPosition: 'end' } as const;
		const source = '# 一本书\n\n## 读书感想\n\n旧记录\n';
		const chinese = appendEntry(source, entry, settings);
		setLocale('en');
		expect(formatEntry('想法 about a book', '#阅读 #writing', date)).toBe(
			entry,
		);
		expect(appendEntry(source, entry, settings)).toBe(chinese);
	});
});
