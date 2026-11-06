import { describe, expect, it } from 'vitest';
import {
	createDefaultSettings,
	loadPluginData,
	normalizeHeading,
} from '../src/state';

describe('设置与草稿加载', () => {
	it('没有数据时使用当前语言的默认标题和追加顺序', () => {
		expect(loadPluginData(null).settings).toEqual({
			heading: '灵感',
			insertionPosition: 'end',
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
			expanded: true,
		});
		expect(restored.settings).toEqual(saved.settings);
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
