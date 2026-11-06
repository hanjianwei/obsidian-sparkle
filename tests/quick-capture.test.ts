import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App, Command, PluginManifest, WorkspaceLeaf } from 'obsidian';
import { TFile } from 'obsidian';
import SparklePlugin from '../src/main';
import { SparkleView } from '../src/views/sparkle-view';
import { CaptureView } from '../src/views/capture-view';

interface CaptureWindow {
	open: () => void;
	close: () => void;
	focusCapture: () => void;
	onSettingsChanged: () => void;
}
const ui = vi.hoisted(() => ({
	commands: new Map<string, Command>(),
	windows: [] as CaptureWindow[],
	cleanup: [] as Array<() => void>,
	ribbon: null as (() => void) | null,
	notices: [] as string[],
}));

vi.mock('obsidian', async (importOriginal) => ({
	...(await importOriginal<typeof import('obsidian')>()),
	Plugin: class {
		constructor(public app: App) {}
		loadData = vi.fn().mockResolvedValue(null);
		saveData = vi.fn().mockResolvedValue(undefined);
		addSettingTab(): void {}
		registerView(): void {}
		register(callback: () => void): void {
			ui.cleanup.push(callback);
		}
		addCommand(command: Command): Command {
			ui.commands.set(command.id, command);
			return command;
		}
		addRibbonIcon(_icon: string, _name: string, callback: () => void): void {
			ui.ribbon = callback;
		}
	},
	Notice: class {
		constructor(message: string) {
			ui.notices.push(message);
		}
	},
}));
vi.mock('../src/settings', () => ({ SparkleSettingTab: class {} }));
vi.mock('../src/views/sparkle-view', () => ({
	VIEW_TYPE_SPARKLE: 'sparkle-panel',
	SparkleView: class {
		focusCapture = vi.fn();
		syncDraft = vi.fn();
		onSettingsChanged = vi.fn();
	},
}));
vi.mock('../src/views/capture-view', () => ({
	VIEW_TYPE_CAPTURE: 'sparkle-capture',
	CaptureView: class {
		focusCapture = vi.fn();
		syncDraft = vi.fn();
		onSettingsChanged = vi.fn();
	},
}));
vi.mock('../src/views/quick-capture', () => ({
	QuickCaptureModal: class {
		open = vi.fn();
		focusCapture = vi.fn();
		onSettingsChanged = vi.fn();
		close: () => void;
		constructor(_app: unknown, _plugin: unknown, closed: () => void) {
			this.close = vi.fn(closed);
			ui.windows.push(this);
		}
	},
}));

const manifest: PluginManifest = {
	id: 'sparkle',
	name: 'Sparkle',
	version: '0.1.0',
	minAppVersion: '1.13.0',
	author: 'hanjianwei',
	description: 'Capture ideas.',
};

async function setup() {
	const file = Object.assign(new TFile(), {
		path: '阅读/魔戒.md',
		extension: 'md',
	});
	const workspace = {
		getActiveFile: vi.fn().mockReturnValue(file),
		getActiveViewOfType: vi.fn().mockReturnValue(null),
		getLeavesOfType: vi.fn().mockReturnValue([]),
		getRightLeaf: vi.fn(),
		getLeaf: vi.fn(),
		revealLeaf: vi.fn().mockResolvedValue(undefined),
	};
	const app = {
		workspace,
		vault: {
			getAbstractFileByPath: vi.fn((path: string) =>
				path === file.path ? file : null,
			),
		},
	} as unknown as App;
	const plugin = new SparklePlugin(app, manifest);
	await plugin.onload();
	return { plugin, workspace, file };
}

beforeEach(() => {
	ui.commands.clear();
	ui.windows.length = 0;
	ui.cleanup.length = 0;
	ui.ribbon = null;
	ui.notices.length = 0;
});

describe('快速记录入口', () => {
	it('新增独立命令并让星光按钮直达输入，不需要打开侧栏', async () => {
		const { workspace } = await setup();
		expect(ui.commands.has('quick-capture')).toBe(true);
		expect(ui.commands.has('open-panel')).toBe(true);
		expect(ui.commands.has('continuous-capture')).toBe(true);
		ui.ribbon?.();
		expect(ui.windows).toHaveLength(1);
		expect(ui.windows[0]?.open).toHaveBeenCalledOnce();
		expect(workspace.getRightLeaf).not.toHaveBeenCalled();
	});
	it('每次新记录使用当前笔记，不再沿用上次选择的文件', async () => {
		const { plugin, file, workspace } = await setup();
		plugin.openQuickCapture();
		expect(plugin.draft.targetPath).toBe(file.path);
		ui.windows[0]?.close();
		const next = Object.assign(new TFile(), {
			path: '其他项目.md',
			extension: 'md',
		});
		workspace.getActiveFile.mockReturnValue(next);
		plugin.openQuickCapture();
		expect(plugin.draft.targetPath).toBe('其他项目.md');
	});
	it('未完成的草稿保留原目标，不因重新打开而静默改写', async () => {
		const { plugin, workspace } = await setup();
		plugin.draft.targetPath = '原笔记.md';
		plugin.draft.content = '原笔记的草稿';
		workspace.getActiveFile.mockReturnValue(
			Object.assign(new TFile(), { path: '新笔记.md', extension: 'md' }),
		);
		plugin.openQuickCapture();
		expect(plugin.draft.targetPath).toBe('原笔记.md');
		expect(plugin.draft.content).toBe('原笔记的草稿');
	});
	it.each([null, { path: '附件.pdf', extension: 'pdf' }])(
		'没有当前 Markdown 笔记时不回退到上次的文件 %j',
		async (active) => {
			const { plugin, workspace } = await setup();
			plugin.draft.targetPath = '上次的笔记.md';
			workspace.getActiveFile.mockReturnValue(active);
			plugin.openQuickCapture();
			expect(plugin.draft.targetPath).toBe('');
		},
	);
	it('打开日记模式时保持日记模式，不受当前笔记影响', async () => {
		const { plugin } = await setup();
		plugin.draft.mode = 'daily';
		plugin.openQuickCapture();
		expect(plugin.draft.mode).toBe('daily');
	});
	it('反复触发只聚焦同一个窗口，保留已有草稿', async () => {
		const { plugin } = await setup();
		plugin.draft.content = '没写完的想法';
		plugin.openQuickCapture();
		plugin.openQuickCapture();
		expect(ui.windows).toHaveLength(1);
		expect(ui.windows[0]?.focusCapture).toHaveBeenCalledOnce();
		expect(plugin.draft.content).toBe('没写完的想法');
	});
	it('关闭后可重新打开，草稿依然保留', async () => {
		const { plugin } = await setup();
		plugin.openQuickCapture();
		plugin.draft.content = '暂存的灵感';
		ui.windows[0]?.close();
		plugin.openQuickCapture();
		expect(ui.windows).toHaveLength(2);
		expect(plugin.draft.content).toBe('暂存的灵感');
	});
	it('正在写入时不另开窗口，避免重复提交', async () => {
		const { plugin } = await setup();
		plugin.capturePending = true;
		plugin.openQuickCapture();
		expect(ui.windows).toHaveLength(0);
		expect(ui.notices[0]).toContain('正在处理');
	});
	it('卸载插件时关闭快速记录窗口', async () => {
		const { plugin } = await setup();
		plugin.openQuickCapture();
		for (const cleanup of ui.cleanup) cleanup();
		expect(ui.windows[0]?.close).toHaveBeenCalledOnce();
	});
	it('原面板入口直接聚焦输入区，不要求再点击添加', async () => {
		const { plugin, workspace } = await setup();
		const view = new SparkleView({} as WorkspaceLeaf, plugin);
		const focus = vi.spyOn(view, 'focusCapture');
		const leaf = { view };
		workspace.getLeavesOfType.mockReturnValue([leaf]);
		await plugin.openPanel();
		expect(workspace.revealLeaf).toHaveBeenCalledWith(leaf);
		expect(focus).toHaveBeenCalledOnce();
	});
	it('窗口关闭时刷新面板草稿，避免两个入口显示不同内容', async () => {
		const { plugin, workspace } = await setup();
		const view = new SparkleView({} as WorkspaceLeaf, plugin);
		const sync = vi.spyOn(view, 'syncDraft');
		workspace.getLeavesOfType.mockReturnValue([{ view }]);
		plugin.syncPanels();
		expect(sync).toHaveBeenCalledOnce();
	});
});

describe('连续记录页面', () => {
	it('页面加载期间重复触发也只创建一个标签页', async () => {
		const { plugin, workspace } = await setup();
		const view = new CaptureView({} as WorkspaceLeaf, plugin);
		let finish: () => void = () => {};
		const loaded = new Promise<void>((resolve) => {
			finish = resolve;
		});
		workspace.getLeaf.mockReturnValue({
			view,
			setViewState: vi.fn(() => loaded),
		});
		const first = plugin.openContinuousCapture();
		const second = plugin.openContinuousCapture();
		expect(first).toBe(second);
		expect(workspace.getLeaf).toHaveBeenCalledOnce();
		finish();
		await Promise.all([first, second]);
	});
	it('在普通标签页打开，并在切换前绑定当前笔记', async () => {
		const { plugin, workspace, file } = await setup();
		const view = new CaptureView({} as WorkspaceLeaf, plugin);
		const focus = vi.spyOn(view, 'focusCapture');
		const leaf = {
			view,
			setViewState: vi.fn().mockImplementation(() => {
				workspace.getActiveFile.mockReturnValue(null);
				workspace.getActiveViewOfType.mockReturnValue(view);
				return Promise.resolve();
			}),
		};
		workspace.getLeaf.mockReturnValue(leaf);
		await plugin.openContinuousCapture();
		expect(workspace.getLeaf).toHaveBeenCalledWith('tab');
		expect(workspace.getRightLeaf).not.toHaveBeenCalled();
		expect(leaf.setViewState).toHaveBeenCalledWith({
			type: 'sparkle-capture',
			active: true,
		});
		expect(plugin.getCaptureFile()).toBe(file);
		expect(focus).toHaveBeenCalledOnce();
	});
	it('重复打开回到已有页面，并保留当前笔记目标和草稿', async () => {
		const { plugin, workspace, file } = await setup();
		const view = new CaptureView({} as WorkspaceLeaf, plugin);
		const leaf = { view };
		plugin.draft.targetPath = file.path;
		plugin.draft.content = '还没有发出的感想';
		workspace.getActiveFile.mockReturnValue(null);
		workspace.getLeavesOfType.mockImplementation((type: string) =>
			type === 'sparkle-capture' ? [leaf] : [],
		);
		await plugin.openContinuousCapture();
		expect(workspace.getLeaf).not.toHaveBeenCalled();
		expect(workspace.revealLeaf).toHaveBeenCalledWith(leaf);
		expect(plugin.draft.content).toBe('还没有发出的感想');
		expect(plugin.draft.targetPath).toBe(file.path);
	});
	it('正在保存时不创建新的记录页面', async () => {
		const { plugin, workspace } = await setup();
		plugin.capturePending = true;
		await plugin.openContinuousCapture();
		expect(workspace.getLeaf).not.toHaveBeenCalled();
		expect(ui.notices[0]).toContain('正在处理');
	});
	it('共享草稿更新同时刷新侧栏和连续记录页面', async () => {
		const { plugin, workspace } = await setup();
		const panel = new SparkleView({} as WorkspaceLeaf, plugin);
		const capture = new CaptureView({} as WorkspaceLeaf, plugin);
		const syncPanel = vi.spyOn(panel, 'syncDraft');
		const syncCapture = vi.spyOn(capture, 'syncDraft');
		workspace.getLeavesOfType.mockImplementation((type: string) =>
			type === 'sparkle-capture' ? [{ view: capture }] : [{ view: panel }],
		);
		plugin.syncPanels();
		expect(syncPanel).toHaveBeenCalledOnce();
		expect(syncCapture).toHaveBeenCalledOnce();
	});
});
