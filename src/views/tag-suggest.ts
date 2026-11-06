import { Component } from 'obsidian';
import { t } from '../i18n';
import {
	completeTag,
	getTagQuery,
	suggestTags,
	TagInputMode,
	TagQuery,
} from '../tags';

let nextId = 0;

export class TagSuggest extends Component {
	private popup!: HTMLElement;
	private context: TagQuery | null = null;
	private matches: string[] = [];
	private active = 0;
	private composing = false;
	private applying = false;
	private pointerInside = false;

	constructor(
		private readonly input: HTMLInputElement | HTMLTextAreaElement,
		private readonly mode: TagInputMode,
		private readonly getTags: () => readonly string[],
	) {
		super();
	}

	onload(): void {
		const doc = this.input.ownerDocument;
		this.popup = doc.body.createDiv({
			cls: 'sparkle-tag-suggestions',
			attr: {
				id: `sparkle-tags-${++nextId}`,
				role: 'listbox',
				'aria-label': t('tagSuggestions'),
			},
		});
		this.popup.hidden = true;
		this.input.setAttribute('aria-autocomplete', 'list');
		this.input.setAttribute('aria-controls', this.popup.id);
		this.input.setAttribute('aria-expanded', 'false');
		this.registerDomEvent(this.input, 'input', () => this.update());
		this.registerDomEvent(this.input, 'focus', () => this.update());
		this.registerDomEvent(this.input, 'click', () => this.update());
		this.registerDomEvent(this.input, 'keyup', (event) => {
			if (
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowRight' ||
				event.key === 'Home' ||
				event.key === 'End'
			)
				this.update();
		});
		this.registerDomEvent(
			this.input,
			'keydown',
			(event) => this.onKey(event),
			true,
		);
		this.registerDomEvent(this.input, 'compositionstart', () => {
			this.composing = true;
			this.close();
		});
		this.registerDomEvent(this.input, 'compositionend', () => {
			this.composing = false;
			this.update();
		});
		this.registerDomEvent(this.input, 'blur', (event) => {
			if (
				!this.pointerInside &&
				!this.popup.contains(event.relatedTarget as Node | null)
			)
				this.close();
		});
		this.registerDomEvent(this.popup, 'pointerdown', (event) => {
			this.pointerInside = true;
			if (event.pointerType !== 'touch') event.preventDefault();
		});
		this.registerDomEvent(this.popup, 'pointercancel', () => {
			this.pointerInside = false;
		});
		this.registerDomEvent(this.popup, 'click', (event) => {
			const option = (event.target as HTMLElement).closest<HTMLElement>(
				'[data-tag-index]',
			);
			if (option) this.choose(Number(option.dataset.tagIndex));
		});
		this.registerDomEvent(
			doc,
			'pointerdown',
			(event) => {
				if (
					event.target !== this.input &&
					!this.popup.contains(event.target as Node)
				)
					this.close();
			},
			true,
		);
		this.registerDomEvent(
			doc,
			'scroll',
			(event) => {
				if (event.target === this.popup) return;
				const scroller =
					this.input.closest('.sparkle-stream .sparkle-composer') ??
					(this.input.closest('.sparkle-quick-modal')
						? this.input.closest('.modal-content')
						: null);
				if (scroller && event.target === scroller) {
					if (!this.popup.hidden) this.position();
				} else this.close();
			},
			true,
		);
		const win = doc.defaultView;
		const reposition = (): void => {
			if (!this.popup.hidden) this.position();
		};
		if (win) this.registerDomEvent(win, 'resize', reposition);
		const viewport = win?.visualViewport;
		if (viewport) {
			viewport.addEventListener('resize', reposition);
			viewport.addEventListener('scroll', reposition);
			this.register(() => {
				viewport.removeEventListener('resize', reposition);
				viewport.removeEventListener('scroll', reposition);
			});
		}
		const boundary =
			this.input.closest('.sparkle-quick-modal')?.parentElement ??
			this.input.closest('.sparkle-stream');
		if (boundary) {
			const observer = new ResizeObserver(reposition);
			observer.observe(boundary);
			this.register(() => observer.disconnect());
		}
	}

	onunload(): void {
		this.close();
		this.popup?.remove();
		for (const attribute of [
			'aria-autocomplete',
			'aria-controls',
			'aria-expanded',
		])
			this.input.removeAttribute(attribute);
	}

	close(): void {
		if (!this.popup) return;
		this.popup.hidden = true;
		this.pointerInside = false;
		this.context = null;
		this.matches = [];
		this.input.setAttribute('aria-expanded', 'false');
		this.input.removeAttribute('aria-activedescendant');
	}

	private update(): void {
		const caret = this.input.selectionStart;
		if (
			this.applying ||
			this.composing ||
			this.input.disabled ||
			caret === null ||
			caret !== this.input.selectionEnd
		) {
			this.close();
			return;
		}
		const context = getTagQuery(this.input.value, caret, this.mode);
		const matches = context
			? suggestTags(this.getTags(), this.input.value, context, this.mode)
			: [];
		if (!context || !matches.length) {
			this.close();
			return;
		}
		this.context = context;
		this.matches = matches;
		this.active = 0;
		this.popup.empty();
		for (const [index, tag] of matches.entries()) {
			this.popup.createEl('button', {
				text: tag,
				cls: 'sparkle-tag-option',
				attr: {
					type: 'button',
					role: 'option',
					tabindex: '-1',
					id: `${this.popup.id}-${index}`,
					'data-tag-index': String(index),
				},
			});
		}
		this.popup.hidden = false;
		this.input.setAttribute('aria-expanded', 'true');
		this.highlight();
		this.position();
	}

	private position(): void {
		const rect = this.input.getBoundingClientRect();
		const win = this.input.ownerDocument.defaultView;
		const viewport = win?.visualViewport;
		const boundary = this.input
			.closest('.sparkle-quick-container, .sparkle-stream-container')
			?.getBoundingClientRect();
		const left = Math.max(viewport?.offsetLeft ?? 0, boundary?.left ?? 0);
		const top = Math.max(viewport?.offsetTop ?? 0, boundary?.top ?? 0);
		const right = Math.min(
			(viewport?.offsetLeft ?? 0) + (viewport?.width ?? win?.innerWidth ?? 320),
			boundary?.right ?? Infinity,
		);
		const bottom = Math.min(
			(viewport?.offsetTop ?? 0) +
				(viewport?.height ?? win?.innerHeight ?? 480),
			boundary?.bottom ?? Infinity,
		);
		const width = right - left;
		const height = bottom - top;
		const content = this.input
			.closest(
				'.sparkle-quick-modal .modal-content, .sparkle-stream .sparkle-composer',
			)
			?.getBoundingClientRect();
		if (
			rect.bottom <= Math.max(top, content?.top ?? top) ||
			rect.top >= Math.min(bottom, content?.bottom ?? bottom)
		) {
			this.close();
			return;
		}
		const popupWidth = Math.min(Math.max(rect.width, 200), width - 16);
		const below = top + height - rect.bottom - 8;
		const above = rect.top - top - 8;
		const upward = below < 120 && above > below;
		const maxHeight = Math.min(240, Math.max(44, upward ? above : below));
		this.popup.setCssProps({
			'--sparkle-suggest-width': `${popupWidth}px`,
			'--sparkle-suggest-left': `${Math.max(left + 8, Math.min(rect.left, left + width - popupWidth - 8))}px`,
			'--sparkle-suggest-height': `${maxHeight}px`,
		});
		const popupHeight = Math.min(this.popup.scrollHeight, maxHeight);
		this.popup.setCssProps({
			'--sparkle-suggest-top': `${upward ? Math.max(top + 8, rect.top - popupHeight - 4) : rect.bottom + 4}px`,
		});
	}

	private highlight(): void {
		this.popup
			.querySelectorAll<HTMLElement>('[data-tag-index]')
			.forEach((option, index) => {
				const selected = index === this.active;
				option.toggleClass('is-selected', selected);
				option.setAttribute('aria-selected', String(selected));
				if (selected)
					this.input.setAttribute('aria-activedescendant', option.id);
			});
	}

	private onKey(event: KeyboardEvent): void {
		if (this.input.selectionStart !== this.input.selectionEnd) {
			this.close();
			return;
		}
		if (event.key === 'Tab' && event.shiftKey) {
			this.close();
			return;
		}
		if (
			this.popup.hidden ||
			this.composing ||
			event.isComposing ||
			event.ctrlKey ||
			event.metaKey ||
			event.altKey
		)
			return;
		if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key))
			return;
		event.preventDefault();
		event.stopPropagation();
		if (event.key === 'Escape') {
			this.close();
			return;
		}
		if (event.key === 'Enter' || event.key === 'Tab') {
			this.choose(this.active);
			return;
		}
		this.active =
			(this.active +
				(event.key === 'ArrowDown' ? 1 : -1) +
				this.matches.length) %
			this.matches.length;
		this.highlight();
		this.popup.children[this.active]?.scrollIntoView({ block: 'nearest' });
	}

	private choose(index: number): void {
		const tag = this.matches[index];
		const context = this.context;
		if (!tag || !context || this.input.disabled) return;
		const caret = this.input.selectionStart;
		const current =
			caret === null ? null : getTagQuery(this.input.value, caret, this.mode);
		if (
			caret !== this.input.selectionEnd ||
			!current ||
			current.start !== context.start ||
			current.end !== context.end ||
			current.query !== context.query
		) {
			this.close();
			return;
		}
		const completion = completeTag(this.input.value, context, tag);
		this.applying = true;
		this.close();
		this.input.value = completion.value;
		this.input.focus();
		this.input.setSelectionRange(completion.caret, completion.caret);
		this.input.dispatchEvent(new Event('input', { bubbles: true }));
		this.applying = false;
	}
}
