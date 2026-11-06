import { describe, expect, it, vi } from 'vitest';
import { CaptureViewport } from '../src/views/capture-viewport';

vi.mock('obsidian', () => ({
	Component: class {
		private cleanup: Array<() => void> = [];
		onload(): void {}
		onunload(): void {}
		load(): void {
			this.onload();
		}
		unload(): void {
			for (const callback of this.cleanup) callback();
			this.onunload();
		}
		register(callback: () => void): void {
			this.cleanup.push(callback);
		}
		registerDomEvent(
			target: EventTarget,
			name: string,
			callback: EventListener,
		): void {
			target.addEventListener(name, callback);
			this.register(() => target.removeEventListener(name, callback));
		}
	},
}));

function setup(hasViewport = true, layout: 'modal' | 'view' = 'modal') {
	const viewport = Object.assign(new EventTarget(), {
		width: 390,
		height: 840,
		offsetTop: 0,
		offsetLeft: 0,
	});
	const frames = new Map<number, FrameRequestCallback>();
	let nextFrame = 0;
	const win = Object.assign(new EventTarget(), {
		innerWidth: 390,
		innerHeight: 840,
		visualViewport: hasViewport ? viewport : null,
		requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
			frames.set(++nextFrame, callback);
			return nextFrame;
		}),
		cancelAnimationFrame: vi.fn((id: number) => frames.delete(id)),
	});
	const doc = Object.assign(new EventTarget(), {
		defaultView: win,
		documentElement: { clientWidth: 390, clientHeight: 840 },
	});
	const properties = new Map<string, string>([['--unrelated', 'keep']]);
	const container = {
		ownerDocument: doc,
		getBoundingClientRect: vi.fn(() => ({ top: 56 })),
		addClass: vi.fn(),
		removeClass: vi.fn(),
		setCssProps: (values: Record<string, string>) => {
			for (const [key, value] of Object.entries(values))
				properties.set(key, value);
		},
		style: { removeProperty: (name: string) => properties.delete(name) },
	};
	const capture = new CaptureViewport(
		container as unknown as HTMLElement,
		layout,
	);
	capture.load();
	const flush = (): void => {
		const pending = [...frames.values()];
		frames.clear();
		for (const callback of pending) callback(0);
	};
	return { capture, container, win, doc, viewport, properties, frames, flush };
}

describe('快速记录的可视区域', () => {
	it('连续记录页扣除工作区顶部空间，并随布局变化刷新', () => {
		const { container, win, properties, flush, capture } = setup(true, 'view');
		expect(container.addClass).toHaveBeenCalledWith('sparkle-stream-container');
		expect(properties.get('--sparkle-container-top')).toBe('56px');
		container.getBoundingClientRect.mockReturnValue({ top: 80 });
		win.dispatchEvent(new Event('resize'));
		flush();
		expect(properties.get('--sparkle-container-top')).toBe('80px');
		capture.unload();
		expect(container.removeClass).toHaveBeenCalledWith(
			'sparkle-stream-container',
		);
		expect(properties.has('--sparkle-container-top')).toBe(false);
	});
	it('跟随键盘缩小后的区域与页面平移，并合并同一帧的更新', () => {
		const { viewport, properties, win, frames, flush } = setup();
		Object.assign(viewport, {
			height: 320,
			width: 350,
			offsetTop: 70,
			offsetLeft: 20,
		});
		viewport.dispatchEvent(new Event('resize'));
		viewport.dispatchEvent(new Event('scroll'));
		win.dispatchEvent(new Event('resize'));
		expect(frames.size).toBe(1);
		flush();
		expect(properties.get('--sparkle-viewport-height')).toBe('320px');
		expect(properties.get('--sparkle-viewport-width')).toBe('350px');
		expect(properties.get('--sparkle-viewport-top')).toBe('70px');
		expect(properties.get('--sparkle-viewport-left')).toBe('20px');
	});
	it('WebView 同时缩小时保留原布局高度，避免重复减去键盘高度', () => {
		const { viewport, win, doc, properties, flush } = setup();
		viewport.height = win.innerHeight = doc.documentElement.clientHeight = 380;
		win.dispatchEvent(new Event('resize'));
		flush();
		expect(properties.get('--sparkle-layout-height')).toBe('840px');
		expect(properties.get('--sparkle-viewport-height')).toBe('380px');
	});
	it('横竖屏切换后重新计算布局基准', () => {
		const { viewport, win, doc, properties, flush } = setup();
		viewport.width = win.innerWidth = doc.documentElement.clientWidth = 840;
		win.innerHeight = doc.documentElement.clientHeight = 390;
		viewport.height = 180;
		win.dispatchEvent(new Event('orientationchange'));
		flush();
		expect(properties.get('--sparkle-layout-height')).toBe('390px');
		expect(properties.get('--sparkle-viewport-height')).toBe('180px');
	});
	it('没有 VisualViewport 时使用窗口大小，并在重新聚焦时刷新', () => {
		const { win, doc, properties, flush } = setup(false);
		win.innerHeight = 400;
		doc.dispatchEvent(new Event('focusin'));
		flush();
		expect(properties.get('--sparkle-viewport-height')).toBe('400px');
		expect(properties.get('--sparkle-viewport-top')).toBe('0px');
	});
	it('关闭时移除监听、待执行的动画帧以及插件添加的样式', () => {
		const { capture, container, win, doc, viewport, properties, frames } =
			setup();
		viewport.dispatchEvent(new Event('resize'));
		expect(frames.size).toBe(1);
		capture.unload();
		expect(win.cancelAnimationFrame).toHaveBeenCalledOnce();
		expect(container.removeClass).toHaveBeenCalledWith(
			'sparkle-quick-container',
		);
		expect(properties).toEqual(new Map([['--unrelated', 'keep']]));
		viewport.dispatchEvent(new Event('resize'));
		viewport.dispatchEvent(new Event('scroll'));
		win.dispatchEvent(new Event('resize'));
		win.dispatchEvent(new Event('orientationchange'));
		doc.dispatchEvent(new Event('focusin'));
		expect(frames.size).toBe(0);
	});
});
