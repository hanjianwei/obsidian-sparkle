import { Component } from 'obsidian';

const PROPERTIES = [
	'--sparkle-viewport-top',
	'--sparkle-viewport-left',
	'--sparkle-viewport-width',
	'--sparkle-viewport-height',
	'--sparkle-layout-height',
	'--sparkle-container-top',
];

/** Keep the modal's positioning container inside the visible, keyboard-free area. */
export class CaptureViewport extends Component {
	private frame: number | null = null;
	private layoutHeight = 0;
	private layoutWidth = 0;
	constructor(
		private readonly container: HTMLElement,
		private readonly layout: 'modal' | 'view' = 'modal',
	) {
		super();
	}

	onload(): void {
		this.container.addClass(
			this.layout === 'view'
				? 'sparkle-stream-container'
				: 'sparkle-quick-container',
		);
		const win = this.container.ownerDocument.defaultView;
		if (!win) return;
		const update = (): void => {
			const doc = this.container.ownerDocument.documentElement;
			const width = Math.max(win.innerWidth, doc.clientWidth);
			const height = Math.max(win.innerHeight, doc.clientHeight);
			// Preserve the layout height when a keyboard resizes the WebView too.
			// A width change starts a new baseline for orientation/window changes.
			this.layoutHeight =
				width === this.layoutWidth
					? Math.max(this.layoutHeight, height)
					: height;
			this.layoutWidth = width;
			const viewport = win.visualViewport;
			if (this.layout === 'view')
				this.container.setCssProps({
					'--sparkle-container-top': `${this.container.getBoundingClientRect().top}px`,
				});
			this.container.setCssProps({
				'--sparkle-viewport-top': `${viewport?.offsetTop ?? 0}px`,
				'--sparkle-viewport-left': `${viewport?.offsetLeft ?? 0}px`,
				'--sparkle-viewport-width': `${viewport?.width ?? win.innerWidth}px`,
				'--sparkle-viewport-height': `${viewport?.height ?? win.innerHeight}px`,
				'--sparkle-layout-height': `${this.layoutHeight}px`,
			});
		};
		const schedule = (): void => {
			if (this.frame !== null) return;
			this.frame = win.requestAnimationFrame(() => {
				this.frame = null;
				update();
			});
		};
		update();
		this.registerDomEvent(win, 'resize', schedule);
		this.registerDomEvent(win, 'orientationchange', schedule);
		this.registerDomEvent(this.container.ownerDocument, 'focusin', schedule);
		if (this.layout === 'view' && this.container.parentElement) {
			const observer = new ResizeObserver(schedule);
			observer.observe(this.container.parentElement);
			this.register(() => observer.disconnect());
		}
		const viewport = win.visualViewport;
		if (viewport) {
			viewport.addEventListener('resize', schedule);
			viewport.addEventListener('scroll', schedule);
			this.register(() => {
				viewport.removeEventListener('resize', schedule);
				viewport.removeEventListener('scroll', schedule);
			});
		}
		this.register(() => {
			if (this.frame !== null) win.cancelAnimationFrame(this.frame);
			this.frame = null;
		});
	}

	onunload(): void {
		this.container.removeClass(
			this.layout === 'view'
				? 'sparkle-stream-container'
				: 'sparkle-quick-container',
		);
		for (const property of PROPERTIES)
			this.container.style.removeProperty(property);
	}
}
