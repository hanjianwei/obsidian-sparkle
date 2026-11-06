import { describe, expect, it } from 'vitest';
import { appendEntry, formatEntry, parseTags, readEntries } from '../src/notes';

const now = new Date(2026, 10, 6, 9, 5, 7);
const entry = formatEntry('第一行\n\n第二行', '#阅读 人物', now);

describe('灵感格式', () => {
	it('使用本地日期、标签和缩进正文，并保留段落', () => {
		expect(entry).toBe(
			'- 2026-11-06 09:05:07 #阅读 #人物\n    第一行\n    \n    第二行',
		);
	});
	it('日记模式只记录时分秒，并保留标签和多段正文', () => {
		expect(formatEntry('第一行\n\n第二行', '#阅读 人物', now, 'daily')).toBe(
			'- 09:05:07 #阅读 #人物\n    第一行\n    \n    第二行',
		);
	});
	it.each([
		[new Date(2026, 10, 6, 0, 0, 0), '00:00:00'],
		[new Date(2026, 10, 6, 23, 59, 59), '23:59:59'],
	])('日记使用本地时间并保留两位秒数 %s', (date, time) => {
		expect(formatEntry('日常感想', '', date, 'daily')).toBe(
			`- ${time}\n    日常感想`,
		);
	});
	it('标签可选，正文中原有的缩进和 Markdown 保留', () => {
		expect(formatEntry('  保留缩进\n- 列表\n## 标题', '', now)).toBe(
			'- 2026-11-06 09:05:07\n      保留缩进\n    - 列表\n    ## 标题',
		);
	});
	it.each(['', ' ', '\n\t'])('拒绝空白正文 %j', (content) => {
		expect(() => formatEntry(content, '', now)).toThrow('请先写下');
	});
	it('规范化从 Windows 粘贴的换行符', () => {
		expect(formatEntry('甲\r\n乙', '', now)).toContain('    甲\n    乙');
	});
	it('整分钟保存时仍输出两位秒数', () => {
		expect(
			formatEntry('整分钟的想法', '', new Date(2026, 10, 6, 9, 5)),
		).toContain('2026-11-06 09:05:00');
	});
	it('位置链接属于每条记录，不改写笔记级属性，正文和图片仍保留', () => {
		const location = { latitude: 31.2304, longitude: 121.4737, name: '咖啡馆' };
		const result = formatEntry(
			'想到一个点子\n\n![[assets/photo.png]]',
			'#灵感',
			now,
			'daily',
			location,
		);
		expect(result).toBe(
			'- 09:05:07 #灵感 [📍 咖啡馆](geo:31.2304,121.4737)\n    想到一个点子\n    \n    ![[assets/photo.png]]',
		);
		const source = '---\nlocation: 0,0\n---\n';
		expect(appendEntry(source, result)).toBe(
			`${source}\n## 灵感\n\n${result}\n`,
		);
	});
	it('允许单独记录位置，下一条没有位置时不附加', () => {
		expect(
			formatEntry('', '', now, 'file', {
				latitude: -31,
				longitude: -121,
				name: '',
			}),
		).toBe('- 2026-11-06 09:05:07 [📍 当前位置](geo:-31,-121)');
		expect(formatEntry('下一条', '', now, 'daily')).toBe(
			'- 09:05:07\n    下一条',
		);
	});
});

describe('标签', () => {
	it('支持中文、层级、逗号与大小写去重', () => {
		expect(parseTags('阅读 #AI ai，阅读/人物, #阅读')).toEqual([
			'#阅读',
			'#AI',
			'#阅读/人物',
		]);
	});
	it('允许不添加标签', () => expect(parseTags('  ')).toEqual([]));
	it.each([
		'123',
		'123/456',
		'双.点',
		'标签/',
		'/标签',
		'##标签',
		'标签//子类',
	])('拒绝无效标签 %s', (tag) => {
		expect(() => parseTags(tag)).toThrow('标签');
	});
});

describe('写入目标小节', () => {
	it('不把 HTML 注释中的标题当成写入位置', () => {
		const source = '<!--\n## 灵感\n```\n-->\n\n正文\n';
		expect(appendEntry(source, entry)).toBe(`${source}\n## 灵感\n\n${entry}\n`);
	});
	it('空文件创建灵感小节', () => {
		expect(appendEntry('', entry)).toBe(`## 灵感\n\n${entry}\n`);
	});
	it('没有小节时追加，并完整保留文件原内容', () => {
		const source = '---\ntitle: 魔戒\n---\n\n# 魔戒\n\n原文';
		expect(appendEntry(source, entry)).toBe(
			`${source}\n\n## 灵感\n\n${entry}\n`,
		);
	});
	it('在同级标题之前写入，后续小节保持原样', () => {
		const source = '# 书\n\n## 灵感\n\n旧灵感\n\n## 摘录\n\n保留内容\n';
		expect(appendEntry(source, entry)).toBe(
			`# 书\n\n## 灵感\n\n旧灵感\n\n${entry}\n\n## 摘录\n\n保留内容\n`,
		);
	});
	it('识别一级标题作为小节边界', () => {
		expect(appendEntry('## 灵感\n\n# 附录\n内容', entry)).toBe(
			`## 灵感\n\n${entry}\n\n# 附录\n内容`,
		);
	});
	it('保留更深层标题，并识别 Setext 形式的同级标题', () => {
		const source = '## 灵感\n\n### 想法\n正文\n\n附录\n---\n保留';
		expect(appendEntry(source, entry)).toBe(
			`## 灵感\n\n### 想法\n正文\n\n${entry}\n\n附录\n---\n保留`,
		);
	});
	it('识别 Setext 形式的灵感标题', () => {
		expect(appendEntry('灵感\n---\n\n旧记录\n', entry)).toBe(
			`灵感\n---\n\n旧记录\n\n${entry}\n`,
		);
	});
	it('忽略 YAML、围栏代码块以及缩进代码中的同名标题', () => {
		const source =
			'---\nexample: |\n  ## 灵感\n---\n\n```md\n## 灵感\n```\n\n    ## 灵感\n';
		expect(appendEntry(source, entry)).toBe(`${source}\n## 灵感\n\n${entry}\n`);
	});
	it('代码块内的同级标题不会截断已有灵感小节', () => {
		const source = '## 灵感\n\n~~~md\n## 摘录\n~~~\n\n## 附录\n保留';
		expect(readEntries(appendEntry(source, entry))).toBe(
			`~~~md\n## 摘录\n~~~\n\n${entry}`,
		);
	});
	it('正文中的标题、代码块不会被当成笔记标题', () => {
		const markdown = '## 标题\n\n```md\n## 例子\n```';
		const first = formatEntry(markdown, '', now);
		const written = appendEntry(appendEntry('', first), entry);
		expect(readEntries(written)).toBe(`${first}\n\n${entry}`);
	});
	it('保持 CRLF 换行，不改写原文', () => {
		const source = '## 灵感\r\n\r\n旧记录\r\n\r\n## 附录\r\n保留';
		expect(appendEntry(source, entry)).toBe(
			`## 灵感\r\n\r\n旧记录\r\n\r\n${entry.replace(/\n/g, '\r\n')}\r\n\r\n## 附录\r\n保留`,
		);
	});
	it('连续写入不重复创建标题，不丢失之前的记录', () => {
		const result = appendEntry(appendEntry('# 书\n', entry), entry);
		expect(result.match(/^## 灵感$/gm)).toHaveLength(1);
		expect(readEntries(result)).toBe(`${entry}\n\n${entry}`);
	});
	it('文件以小节标题结尾且没有换行时仍可写入', () => {
		expect(appendEntry('## 灵感', entry)).toBe(`## 灵感\n\n${entry}\n`);
	});
	it.each(['---\ntitle: 书', '```md\n## 灵感', '~~~\n正文'])(
		'遇到未闭合结构时拒绝改写 %j',
		(source) => {
			expect(() => appendEntry(source, entry)).toThrow('未闭合');
		},
	);
	it('没有灵感小节时返回空记录', () => {
		expect(readEntries('# 书\n\n原文')).toBe('');
	});
});

describe('自定义标题与插入位置', () => {
	const start = { heading: '感想', insertionPosition: 'start' } as const;
	const end = { heading: '感想', insertionPosition: 'end' } as const;
	it('使用自定义标题，保留旧的灵感小节', () => {
		const source = '## 灵感\n\n旧内容\n';
		expect(appendEntry(source, entry, end)).toBe(
			`${source}\n## 感想\n\n${entry}\n`,
		);
		expect(readEntries(appendEntry(source, entry, end), '感想')).toBe(entry);
		expect(readEntries(appendEntry(source, entry, end))).toBe('旧内容');
	});
	it.each([start, end])('标题不存在时在笔记末尾创建小节 %j', (settings) => {
		expect(appendEntry('# 魔戒\n\n原文', entry, settings)).toBe(
			`# 魔戒\n\n原文\n\n## 感想\n\n${entry}\n`,
		);
	});
	it('在小节开头插入，旧记录和后续小节逐字保留', () => {
		const source = '# 魔戒\n\n## 感想\n\n旧记录\n\n## 摘录\n原文\n';
		expect(appendEntry(source, entry, start)).toBe(
			`# 魔戒\n\n## 感想\n\n${entry}\n\n旧记录\n\n## 摘录\n原文\n`,
		);
	});
	it('在小节末尾插入，后续小节不受影响', () => {
		expect(appendEntry('## 感想\n\n旧记录\n\n## 其他\n保留', entry, end)).toBe(
			`## 感想\n\n旧记录\n\n${entry}\n\n## 其他\n保留`,
		);
	});
	it('连续开头插入，新记录自然在前，不重复创建标题', () => {
		const first = formatEntry('第一条', '', now);
		const second = formatEntry('第二条', '', now);
		const result = appendEntry(appendEntry('', first, start), second, start);
		expect(readEntries(result, '感想')).toBe(`${second}\n\n${first}`);
		expect(result.match(/^## 感想$/gm)).toHaveLength(1);
	});
	it.each(['## 感想', '## 感想\n', '## 感想\n\n'])(
		'开头插入兼容空小节 %j',
		(source) => {
			expect(readEntries(appendEntry(source, entry, start), '感想')).toBe(
				entry,
			);
		},
	);
	it('空小节紧接后续标题时，不与后续内容混合', () => {
		expect(appendEntry('## 感想\n## 其他\n原文', entry, start)).toBe(
			`## 感想\n\n${entry}\n\n## 其他\n原文`,
		);
	});
	it('自定义 Setext 标题下开头插入', () => {
		expect(
			appendEntry('感想\n---\n\n旧记录\n\n其他\n===\n原文', entry, start),
		).toBe(`感想\n---\n\n${entry}\n\n旧记录\n\n其他\n===\n原文`);
	});
	it('开头插入仍保留 CRLF', () => {
		const result = appendEntry('## 感想\r\n\r\n旧记录\r\n', entry, start);
		expect(result).toBe(
			`## 感想\r\n\r\n${entry.replace(/\n/g, '\r\n')}\r\n\r\n旧记录\r\n`,
		);
	});
	it('同名小节存在多处时只使用第一个二级标题', () => {
		const source = '## 感想\n\n第一处\n\n## 感想\n\n第二处\n';
		expect(appendEntry(source, entry, start)).toBe(
			`## 感想\n\n${entry}\n\n第一处\n\n## 感想\n\n第二处\n`,
		);
	});
	it('更改设置只影响后续插入，不重新排序已有内容', () => {
		const first = formatEntry('第一条', '', now);
		const second = formatEntry('第二条', '', now);
		const third = formatEntry('第三条', '', now);
		const result = appendEntry(
			appendEntry(appendEntry('', first, end), second, end),
			third,
			start,
		);
		expect(readEntries(result, '感想')).toBe(
			`${third}\n\n${first}\n\n${second}`,
		);
	});
});
