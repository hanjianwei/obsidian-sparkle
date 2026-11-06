import { describe, expect, it } from 'vitest';
import { continueList, formatList } from '../src/formatting';

describe('列表和任务格式', () => {
	it('空白输入插入标记，并将光标放在内容开始处', () => {
		expect(formatList('', 0, 0, 'list')).toEqual({
			text: '- ',
			start: 2,
			end: 2,
		});
		expect(formatList('', 0, 0, 'task')).toEqual({
			text: '- [ ] ',
			start: 6,
			end: 6,
		});
		expect(formatList('- [ ]', 5, 5, 'task')).toEqual({
			text: '',
			start: 0,
			end: 0,
		});
	});
	it('只格式化光标所在行，并保持光标相对正文的位置', () => {
		const text = '前一行\n一个想法\n后一行';
		expect(formatList(text, 6, 6, 'list')).toEqual({
			text: '前一行\n- 一个想法\n后一行',
			start: 8,
			end: 8,
		});
	});
	it('切换列表与任务时替换标记，保留正文与缩进', () => {
		expect(formatList('  - 想法', 6, 6, 'task').text).toBe('  - [ ] 想法');
		expect(formatList('\t- [x] 已完成', 10, 10, 'list').text).toBe(
			'\t- 已完成',
		);
		expect(formatList('1. 想法', 5, 5, 'task').text).toBe('- [ ] 想法');
		expect(formatList('1. 想法', 5, 5, 'list').text).toBe('- 想法');
	});
	it('再次点击相同格式移除标记，保留正文与光标', () => {
		expect(formatList('- 想法', 4, 4, 'list')).toEqual({
			text: '想法',
			start: 2,
			end: 2,
		});
		expect(formatList('- [ ] 想法', 8, 8, 'task')).toEqual({
			text: '想法',
			start: 2,
			end: 2,
		});
	});
	it('选中多行时统一格式，不重复添加已有标记', () => {
		const text = '- 甲\n乙\n- [x] 丙';
		const result = formatList(text, 0, text.length, 'task');
		expect(result.text).toBe('- [ ] 甲\n- [ ] 乙\n- [ ] 丙');
		expect(result.text.slice(result.start, result.end)).toBe(
			'甲\n- [ ] 乙\n- [ ] 丙',
		);
		expect(formatList(result.text, result.start, result.end, 'task').text).toBe(
			'甲\n乙\n丙',
		);
	});
	it('选区结束于下一行开头时不修改下一行', () => {
		expect(formatList('甲\n乙\n丙', 0, 4, 'list')).toEqual({
			text: '- 甲\n- 乙\n丙',
			start: 2,
			end: 8,
		});
	});
	it('多行中的空行保持不变，空行上的光标仍可插入标记', () => {
		expect(formatList('甲\n\n乙', 0, 4, 'task').text).toBe(
			'- [ ] 甲\n\n- [ ] 乙',
		);
		expect(formatList('\n想法', 0, 0, 'list')).toEqual({
			text: '- \n想法',
			start: 2,
			end: 2,
		});
	});
});

describe('列表和任务换行', () => {
	it.each([
		['- 想法', '- 想法\n- '],
		['* 想法', '* 想法\n* '],
		['+ 想法', '+ 想法\n+ '],
		['- [ ] 任务', '- [ ] 任务\n- [ ] '],
		['- [x] 已完成', '- [x] 已完成\n- [ ] '],
		['- [/] 进行中', '- [/] 进行中\n- [ ] '],
		['  - 嵌套', '  - 嵌套\n  - '],
		['\t- [ ] 嵌套任务', '\t- [ ] 嵌套任务\n\t- [ ] '],
	])('继续 %j，光标放在新标记后', (text, expected) => {
		expect(continueList(text, text.length, text.length)).toEqual({
			text: expected,
			start: expected.length,
			end: expected.length,
		});
	});
	it('有序列表递增编号，保留分隔符', () => {
		expect(continueList('9. 想法', 5, 5)?.text).toBe('9. 想法\n10. ');
		expect(continueList('2) 想法', 5, 5)?.text).toBe('2) 想法\n3) ');
	});
	it.each(['- ', '- [ ] ', '- [ ]', '- [x]  '])(
		'空项目 %j 再按 Enter 退出列表',
		(item) => {
			const text = '- 第一项\n' + item;
			expect(continueList(text, text.length, text.length)).toEqual({
				text: '- 第一项\n',
				start: 6,
				end: 6,
			});
		},
	);
	it('空的嵌套项目先减少一级缩进，再退出列表', () => {
		const nested = continueList('  - ', 4, 4);
		expect(nested).toEqual({ text: '- ', start: 2, end: 2 });
		expect(continueList(nested!.text, nested!.start, nested!.end)?.text).toBe(
			'',
		);
		expect(continueList('\t- [ ] ', 7, 7)?.text).toBe('- [ ] ');
	});
	it('光标处拆分正文，只替换选区并保留前后内容', () => {
		expect(continueList('- 前后\n后续段落', 3, 3)).toEqual({
			text: '- 前\n- 后\n后续段落',
			start: 6,
			end: 6,
		});
		expect(continueList('- 甲乙丙', 3, 4)).toEqual({
			text: '- 甲\n- 丙',
			start: 6,
			end: 6,
		});
	});
	it('退出空项目不删除下一行', () => {
		expect(continueList('- 第一项\n- \n后续段落', 8, 8)?.text).toBe(
			'- 第一项\n\n后续段落',
		);
	});
	it('普通正文及列表标记内部保留原生换行', () => {
		expect(continueList('普通想法', 4, 4)).toBeNull();
		expect(continueList('- [ ] 任务', 3, 3)).toBeNull();
		expect(continueList('', 0, 0)).toBeNull();
	});
	it.each(['```markdown\n- 代码', '~~~~\n- 代码\n~~~\n- 仍在代码块内'])(
		'不在围栏代码块 %j 内继续列表',
		(text) => expect(continueList(text, text.length, text.length)).toBeNull(),
	);
	it('围栏关闭后正常继续列表', () => {
		const text = '```markdown\n- 代码\n```\n- 正文';
		expect(continueList(text, text.length, text.length)?.text).toBe(
			text + '\n- ',
		);
	});
});
