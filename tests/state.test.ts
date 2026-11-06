import { describe, expect, it } from 'vitest';
import {
	createDefaultSettings,
	loadPluginData,
	normalizeHeading,
	normalizeImageFolder,
	hasDraft,
} from '../src/state';

describe('设置与草稿加载', () => {
	it('没有数据时使用当前语言的默认标题和追加顺序', () => {
		expect(loadPluginData(null).settings).toEqual({
			heading: '灵感',
			insertionPosition: 'end',
			noteImageFolder: 'assets',
			dailyImageFolder: 'assets/{date}',
		});
	});
	it('恢复日记草稿与当前设置', () => {
		const saved = {
			mode: 'daily',
			targetPath: '书/魔戒.md',
			content: '没写完的想法',
			tags: '#阅读',
			settings: { heading: '每日感想', insertionPosition: 'start' },
		};
		const restored = loadPluginData(saved);
		expect(restored.draft).toEqual({
			mode: 'daily',
			targetPath: saved.targetPath,
			content: saved.content,
			tags: saved.tags,
			images: [],
			expanded: true,
		});
		expect(restored.settings).toEqual({
			...createDefaultSettings(),
			...saved.settings,
		});
	});
	it('设置和草稿可以一起保存、恢复', () => {
		const restored = loadPluginData({
			content: '正在输入',
			settings: { heading: '感想', insertionPosition: 'start' },
		});
		const reloaded = loadPluginData(
			JSON.parse(
				JSON.stringify({ ...restored.draft, settings: restored.settings }),
			),
		);
		expect(reloaded).toEqual(restored);
	});
	it('无效设置回退默认值，不影响草稿恢复', () => {
		const restored = loadPluginData({
			content: '草稿',
			settings: { heading: '\n坏标题', insertionPosition: 'invalid' },
		});
		expect(restored.settings).toEqual(createDefaultSettings());
		expect(restored.draft.content).toBe('草稿');
	});
	it('不同插件实例不会共享可变的默认设置', () => {
		const first = loadPluginData(null);
		first.settings.heading = '感想';
		expect(loadPluginData(null).settings.heading).toBe('灵感');
	});
	it('图片草稿和图片目录可以持久化，只有图片时也视为草稿', () => {
		const data = loadPluginData({
			images: ['书/assets/photo.png'],
			settings: { noteImageFolder: '/附件', dailyImageFolder: 'images/{date}' },
		});
		expect(data.draft.images).toEqual(['书/assets/photo.png']);
		expect(hasDraft(data.draft)).toBe(true);
		expect(data.draft.expanded).toBe(true);
		expect(data.settings.noteImageFolder).toBe('/附件');
		expect(data.settings.dailyImageFolder).toBe('images/{date}');
	});
	it('无效目录使用默认值，保留图片草稿', () => {
		const data = loadPluginData({
			images: ['assets/a.png'],
			settings: {
				noteImageFolder: '../bad',
				dailyImageFolder: 'assets/{unknown}',
			},
		});
		expect(data.settings).toEqual(createDefaultSettings());
		expect(data.draft.images).toEqual(['assets/a.png']);
	});
});

describe('图片目录设置', () => {
	it.each([
		[' assets\\photos/ ', 'assets/photos'],
		['assets//{date}', 'assets/{date}'],
		['/', '/'],
		['.', '.'],
	])('规范化 %j', (value, normalized) => {
		expect(normalizeImageFolder(value)).toBe(normalized);
	});
	it.each([
		'',
		' ',
		'../assets',
		'assets/../photos',
		'C:\\photos',
		'https://example.com',
		'assets/{year}',
		'assets\nphotos',
	])('拒绝无效目录 %j', (value) => {
		expect(() => normalizeImageFolder(value)).toThrow();
	});
});

describe('小节标题', () => {
	it.each([
		['  感想  ', '感想'],
		['## 阅读感想', '阅读感想'],
		['## 感想 ##', '感想'],
		['感想 #阅读', '感想 #阅读'],
	])('规范化 %j', (input, expected) => {
		expect(normalizeHeading(input)).toBe(expected);
	});
	it.each([
		'',
		' ',
		'##',
		'## ',
		'感想\n其他标题',
		'感想\r其他标题',
		'感想\t标题',
	])('拒绝无效标题 %j', (input) => {
		expect(() => normalizeHeading(input)).toThrow();
	});
});
