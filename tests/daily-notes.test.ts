import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App, moment, TFile } from 'obsidian';
import { ensureTodayNote, getTodayTarget } from '../src/daily-notes';

const daily = vi.hoisted(() => ({
	enabled: vi.fn(),
	settings: vi.fn(),
	create: vi.fn(),
}));

vi.mock('obsidian-daily-notes-interface', () => ({
	appHasDailyNotesPluginLoaded: daily.enabled,
	getDailyNoteSettings: daily.settings,
	createDailyNote: daily.create,
}));

const now = new Date(2026, 10, 6, 23, 59);

function note(path: string): TFile {
	return Object.assign(new TFile(), { path });
}

function vaultApp(files: Map<string, unknown> = new Map()): App {
	return {
		vault: {
			getAbstractFileByPath: (path: string) => files.get(path) ?? null,
			cachedRead: vi.fn().mockResolvedValue('模板'),
		},
		metadataCache: {
			getFirstLinkpathDest: (path: string) => files.get(path) ?? null,
		},
	} as unknown as App;
}

beforeEach(() => {
	vi.resetAllMocks();
	daily.enabled.mockReturnValue(true);
	daily.settings.mockReturnValue({
		folder: '',
		format: 'YYYY-MM-DD',
		template: '',
	});
});

describe('今日日记目标', () => {
	it('默认日记路径按本地日期生成，预览不会创建文件', () => {
		expect(getTodayTarget(vaultApp(), now)).toEqual({
			path: '2026-11-06.md',
			file: null,
		});
		expect(daily.create).not.toHaveBeenCalled();
	});
	it('沿用日记目录和带子目录的日期格式', () => {
		daily.settings.mockReturnValue({
			folder: '日记',
			format: 'YYYY/MM/YYYY-MM-DD',
		});
		expect(getTodayTarget(vaultApp(), now).path).toBe(
			'日记/2026/11/2026-11-06.md',
		);
	});
	it('日期格式已包含扩展名时不重复添加', () => {
		daily.settings.mockReturnValue({ format: 'YYYY-MM-DD[.md]' });
		expect(getTodayTarget(vaultApp(), now).path).toBe('2026-11-06.md');
	});
	it('跨午夜后解析新的日记文件', () => {
		const app = vaultApp();
		expect(getTodayTarget(app, now).path).toBe('2026-11-06.md');
		expect(getTodayTarget(app, new Date(2026, 10, 7, 0, 0)).path).toBe(
			'2026-11-07.md',
		);
	});
	it('日记插件未启用时给出可操作提示，不创建任何文件', async () => {
		daily.enabled.mockReturnValue(false);
		await expect(ensureTodayNote(vaultApp(), now)).rejects.toThrow('请先启用');
		expect(daily.create).not.toHaveBeenCalled();
	});
	it('拒绝被文件夹占用的路径', () => {
		expect(() =>
			getTodayTarget(vaultApp(new Map([['2026-11-06.md', {}]])), now),
		).toThrow('文件夹占用');
	});
});

describe('查找和创建日记', () => {
	it('复用配置路径下的已有文件，不重复创建或套用模板', async () => {
		const existing = note('2026-11-06.md');
		const app = vaultApp(new Map([[existing.path, existing]]));
		expect(await ensureTodayNote(app, now)).toBe(existing);
		expect(daily.create).not.toHaveBeenCalled();
	});
	it('不存在时通过日记接口创建，保留相同的日期', async () => {
		const created = note('2026-11-06.md');
		daily.create.mockResolvedValue(created);
		expect(await ensureTodayNote(vaultApp(), now)).toBe(created);
		const date: unknown = daily.create.mock.calls[0]?.[0];
		expect(moment.isMoment(date) && date.valueOf()).toBe(now.valueOf());
	});
	it('创建前检查模板存在且可读取', async () => {
		const template = note('模板/日记.md');
		const app = vaultApp(new Map([[template.path, template]]));
		const readTemplate = vi.spyOn(app.vault, 'cachedRead');
		daily.settings.mockReturnValue({ template: template.path });
		daily.create.mockResolvedValue(note('2026-11-06.md'));
		await ensureTodayNote(app, now);
		expect(readTemplate).toHaveBeenCalledWith(template);
	});
	it('模板丢失时保留失败状态，避免创建空日记', async () => {
		daily.settings.mockReturnValue({ template: '丢失的模板.md' });
		await expect(ensureTodayNote(vaultApp(), now)).rejects.toThrow(
			'找不到日记模板',
		);
		expect(daily.create).not.toHaveBeenCalled();
	});
	it('创建失败时向上报告，交由面板保留草稿', async () => {
		daily.create.mockRejectedValue(new Error('只读目录'));
		await expect(ensureTodayNote(vaultApp(), now)).rejects.toThrow('只读目录');
	});
	it('接口未返回文件时不把失败误报成成功', async () => {
		daily.create.mockResolvedValue(undefined);
		await expect(ensureTodayNote(vaultApp(), now)).rejects.toThrow('无法创建');
	});
	it('与日记插件同时创建时复用同一路径的文件', async () => {
		const files = new Map<string, unknown>();
		const existing = note('2026-11-06.md');
		daily.create.mockImplementation(() => {
			files.set(existing.path, existing);
			return Promise.reject(new Error('文件已存在'));
		});
		expect(await ensureTodayNote(vaultApp(files), now)).toBe(existing);
	});
});
