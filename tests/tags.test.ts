import { describe, expect, it } from 'vitest';
import { completeTag, getTagQuery, suggestTags, TagQuery } from '../src/tags';

function context(
	value: string,
	caret = value.length,
	mode: 'content' | 'tags' = 'tags',
): TagQuery {
	const result = getTagQuery(value, caret, mode);
	if (!result) throw new Error('Expected an active tag');
	return result;
}

describe('定位正文中的标签', () => {
	it('输入 # 立即触发', () => {
		expect(getTagQuery('一个想法 #', 6, 'content')).toEqual({
			start: 5,
			end: 6,
			query: '',
		});
	});
	it('支持中文和层级标签', () => {
		expect(getTagQuery('#阅读/人物', 6, 'content')).toEqual({
			start: 0,
			end: 6,
			query: '阅读/人物',
		});
	});
	it('光标在标签中间时定位完整标签', () => {
		expect(getTagQuery('想法 #reading/people，原文', 7, 'content')).toEqual({
			start: 3,
			end: 18,
			query: 'rea',
		});
	});
	it('识别换行后和括号里的标签', () => {
		expect(getTagQuery('第一行\n（#人物', 8, 'content')?.query).toBe('人物');
	});
	it.each([
		'正文',
		'C#',
		'https://example.com/#reading',
		'word#reading',
		'\\#reading',
		'[[书#章节',
	])('不在普通文本或链接中误触发 %s', (value) => {
		expect(getTagQuery(value, value.length, 'content')).toBeNull();
	});
	it('完整扫描补充平面的 Unicode 标签字符', () => {
		const value = '#人物/𠮷田';
		expect(context(value, 3, 'content').end).toBe(value.length);
	});
});

describe('定位标签框中的标签', () => {
	it.each(['read', '#read'])('允许输入 %s', (value) => {
		expect(context(value).query).toBe('read');
	});
	it.each([' ', ',', '，', '\n'])('兼容分隔符 %j', (separator) => {
		const value = `#已有${separator}阅读`;
		expect(context(value)).toEqual({ start: 4, end: 6, query: '阅读' });
	});
	it('空标签框或分隔符后可以列出候选', () => {
		expect(context('').query).toBe('');
		expect(context('#阅读 ').query).toBe('');
	});
	it('光标位于中间时只查询光标前的部分', () => {
		expect(context('#阅读 #reading #写作', 8)).toEqual({
			start: 4,
			end: 12,
			query: 'rea',
		});
	});
	it.each(['##阅读', 'reading.test'])('不补全非法标签片段 %s', (value) => {
		expect(getTagQuery(value, value.length, 'tags')).toBeNull();
	});
	it('忽略越界光标', () => {
		expect(getTagQuery('#阅读', -1, 'tags')).toBeNull();
		expect(getTagQuery('#阅读', 10, 'tags')).toBeNull();
	});
});

describe('候选筛选', () => {
	const tags = [
		'#reading',
		'#AI',
		'#阅读/人物',
		'#writing',
		'#work/reading',
		'#Reading',
	];
	it('大小写不敏感，前缀优先于包含匹配', () => {
		expect(suggestTags(tags, 'READ', context('READ'), 'tags')).toEqual([
			'#reading',
			'#work/reading',
		]);
	});
	it('支持中文层级子串', () => {
		expect(suggestTags(tags, '人物', context('人物'), 'tags')).toEqual([
			'#阅读/人物',
		]);
	});
	it('排除标签框中其他位置已选的标签', () => {
		const value = '#reading #';
		expect(suggestTags(tags, value, context(value), 'tags')).not.toContain(
			'#reading',
		);
	});
	it('编辑当前标签时仍可选择该标签', () => {
		expect(
			suggestTags(tags, '#reading', context('#reading'), 'tags'),
		).toContain('#reading');
	});
	it('正文里允许再次提及同一个标签', () => {
		const value = '#reading 想法 #rea';
		expect(
			suggestTags(
				tags,
				value,
				context(value, value.length, 'content'),
				'content',
			),
		).toContain('#reading');
	});
	it('限制候选数量，不限制可手动输入的新标签', () => {
		expect(
			suggestTags(
				Array.from({ length: 30 }, (_, i) => `#tag${i}`),
				'#',
				context('#'),
				'tags',
			),
		).toHaveLength(10);
		expect(suggestTags(tags, '#new', context('#new'), 'tags')).toEqual([]);
	});
});

describe('选择候选', () => {
	it('无 # 输入时补全完整标签，末尾自动补一个空格', () => {
		expect(completeTag('read', context('read'), '#reading')).toEqual({
			value: '#reading ',
			caret: 9,
		});
	});
	it('替换光标所在的完整标签，保留前后内容', () => {
		const value = '#AI #readxx #写作';
		expect(completeTag(value, context(value, 7), '#reading')).toEqual({
			value: '#AI #reading #写作',
			caret: 13,
		});
	});
	it('保留正文和紧接的标点', () => {
		const value = '想法 #rea，继续正文';
		expect(
			completeTag(value, context(value, 7, 'content'), '#reading'),
		).toEqual({ value: '想法 #reading，继续正文', caret: 11 });
	});
	it('不重复插入 #，并保留后面的逗号', () => {
		const value = '#read,#写作';
		expect(completeTag(value, context(value, 4), '#reading').value).toBe(
			'#reading,#写作',
		);
	});
});
