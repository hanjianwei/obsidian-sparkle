import { describe, expect, it, vi } from 'vitest';
import { App, TFile, TFolder } from 'obsidian';
import {
	getImage,
	imageFolder,
	imageName,
	importImage,
	placeImage,
	withImageEmbeds,
} from '../src/images';
import { createDefaultSettings } from '../src/state';
import { appendEntry, formatEntry } from '../src/notes';

const now = new Date(2026, 10, 6, 9, 5, 7);

function file(path: string): TFile {
	return Object.assign(new TFile(), { path });
}
function folder(path: string): TFolder {
	return Object.assign(new TFolder(), { path });
}
function photo(name = 'photo.png', type = 'image/png'): File {
	return new File([new Uint8Array([1, 2, 3])], name, { type });
}
function vault() {
	const files = new Map<string, TFile | TFolder>();
	const binary = new Map<string, ArrayBuffer>();
	const createFolder = vi.fn((path: string) => {
		const created = folder(path);
		files.set(path, created);
		return Promise.resolve(created);
	});
	const createBinary = vi.fn((path: string, data: ArrayBuffer) => {
		if (files.has(path)) return Promise.reject(new Error('exists'));
		const created = file(path);
		files.set(path, created);
		binary.set(path, data);
		return Promise.resolve(created);
	});
	const renameFile = vi.fn((value: TFile, path: string) => {
		if (files.has(path)) return Promise.reject(new Error('exists'));
		const data = binary.get(value.path);
		files.delete(value.path);
		binary.delete(value.path);
		value.path = path;
		files.set(path, value);
		if (data) binary.set(path, data);
		return Promise.resolve();
	});
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => files.get(path) ?? null,
			createFolder,
			createBinary,
		},
		fileManager: { renameFile },
	} as unknown as App;
	return { app, files, binary, createFolder, createBinary, renameFile };
}

describe('图片目录解析', () => {
	it.each([
		['书/魔戒.md', 'file', '书/assets'],
		['魔戒.md', 'file', 'assets'],
		['日记/2026-11-06.md', 'daily', '日记/assets/2026-11-06'],
		['日记/2026/11/06.md', 'daily', '日记/2026/11/assets/2026-11-06'],
	] as const)('%s 的 %s 目录', (path, mode, expected) => {
		expect(imageFolder(path, mode, createDefaultSettings(), now)).toBe(
			expected,
		);
	});
	it('支持 vault 根目录和两个模式的独立配置', () => {
		const settings = {
			noteImageFolder: '/附件/{date}',
			dailyImageFolder: 'images',
		};
		expect(imageFolder('书/魔戒.md', 'file', settings, now)).toBe(
			'附件/2026-11-06',
		);
		expect(imageFolder('日记/今天.md', 'daily', settings, now)).toBe(
			'日记/images',
		);
	});
	it('允许直接存到笔记所在目录或 vault 根目录', () => {
		const settings = { noteImageFolder: '.', dailyImageFolder: '/' };
		expect(imageFolder('书/魔戒.md', 'file', settings, now)).toBe('书');
		expect(imageFolder('日记/今天.md', 'daily', settings, now)).toBe('');
	});
	it('跨午夜后使用保存当天的日期', () => {
		expect(
			imageFolder(
				'日记/2026-11-07.md',
				'daily',
				createDefaultSettings(),
				new Date(2026, 10, 7),
			),
		).toBe('日记/assets/2026-11-07');
	});
});

describe('图片文件名', () => {
	it('保留中文名称和扩展名，清理链接与路径特殊字符', () => {
		expect(imageName(photo('旅行#照片[1].PNG'))).toBe('旅行-照片-1-.png');
	});
	it('从 MIME 类型识别没有扩展名的剪贴板图片', () => {
		expect(imageName(photo('image'))).toBe('image.png');
	});
	it('拒绝空文件及非图片文件', () => {
		expect(() => imageName(new File([], 'empty.png'))).toThrow('为空');
		expect(() => imageName(photo('notes.pdf', 'application/pdf'))).toThrow(
			'不支持',
		);
	});
});

describe('图片导入与归档', () => {
	it('创建所有目录并写入原始二进制数据', async () => {
		const { app, createFolder, binary } = vault();
		const result = await importImage(app, photo(), '日记/assets/2026-11-06');
		expect(result.path).toBe('日记/assets/2026-11-06/photo.png');
		expect(createFolder.mock.calls.map(([path]) => path)).toEqual([
			'日记',
			'日记/assets',
			'日记/assets/2026-11-06',
		]);
		expect(
			new Uint8Array(binary.get(result.path) ?? new ArrayBuffer(0)),
		).toEqual(new Uint8Array([1, 2, 3]));
	});
	it('同名图片自动加序号，原文件不被覆盖', async () => {
		const { app, binary } = vault();
		const first = await importImage(app, photo(), 'assets');
		const original = binary.get(first.path);
		const second = await importImage(app, photo(), 'assets');
		expect(second.path).toBe('assets/photo-1.png');
		expect(binary.get(first.path)).toBe(original);
	});
	it('目录被文件占用时拒绝写入', async () => {
		const { app, files, createBinary } = vault();
		files.set('assets', file('assets'));
		await expect(
			importImage(app, photo(), 'assets/2026-11-06'),
		).rejects.toThrow('被文件占用');
		expect(createBinary).not.toHaveBeenCalled();
	});
	it('与其他操作同时创建目录时复用已创建的文件夹', async () => {
		const { app, files, createFolder } = vault();
		createFolder.mockImplementationOnce((path) => {
			files.set(path, folder(path));
			return Promise.reject(new Error('exists'));
		});
		expect((await importImage(app, photo(), 'assets')).path).toBe(
			'assets/photo.png',
		);
	});
	it('二进制写入失败时报告错误', async () => {
		const { app, createBinary } = vault();
		createBinary.mockRejectedValueOnce(new Error('磁盘不可写'));
		await expect(importImage(app, photo(), 'assets')).rejects.toThrow(
			'磁盘不可写',
		);
	});
	it('保存时可将图片移到最终目标目录，并避免同名覆盖', async () => {
		const { app } = vault();
		const existing = await importImage(app, photo(), '日记/assets/2026-11-06');
		const draft = await importImage(app, photo(), '书/assets');
		const placed = await placeImage(app, draft.path, '日记/assets/2026-11-06');
		expect(placed.path).toBe('日记/assets/2026-11-06/photo-1.png');
		expect(getImage(app, existing.path)).toBe(existing);
	});
	it('相同目录复用图片，避免重试时重复上传', async () => {
		const { app, renameFile } = vault();
		const imported = await importImage(app, photo(), 'assets');
		expect(await placeImage(app, imported.path, 'assets')).toBe(imported);
		expect(renameFile).not.toHaveBeenCalled();
	});
	it('图片丢失或路径为非图片文件时拒绝归档', async () => {
		const { app, files } = vault();
		files.set('book.md', file('book.md'));
		await expect(
			placeImage(app, 'assets/missing.png', 'assets'),
		).rejects.toThrow('图片不可用');
		expect(() => getImage(app, 'book.md')).toThrow('图片不可用');
	});
});

describe('图片记录格式', () => {
	it('只发图片时也能写入 Markdown 列表项', () => {
		const entry = formatEntry(
			withImageEmbeds('', ['![[assets/a.png]]', '![[assets/b.png]]']),
			'',
			now,
			'daily',
		);
		expect(appendEntry('', entry)).toBe(
			'## 灵感\n\n- 09:05:07\n    ![[assets/a.png]]\n    ![[assets/b.png]]\n',
		);
	});
	it('保留正文段落，并在独立段落插入图片', () => {
		expect(withImageEmbeds('第一行\n第二行', ['![](assets/a.png)'])).toBe(
			'第一行\n第二行\n\n![](assets/a.png)',
		);
		expect(withImageEmbeds('原文\n\n', [])).toBe('原文\n\n');
	});
});
