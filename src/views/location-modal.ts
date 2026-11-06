import { App, Component, Modal, Platform } from 'obsidian';
import { t } from '../i18n';
import {
	locationCoordinates,
	parseLocation,
	requestLocation,
	SparkleLocation,
} from '../location';
import { CaptureViewport } from './capture-viewport';

export class LocationModal extends Modal {
	private readonly lifecycle = new Component();
	private coordinates!: HTMLInputElement;
	private nameInput!: HTMLInputElement;
	private locateButton!: HTMLButtonElement;
	private feedback!: HTMLElement;
	private lookup: AbortController | null = null;
	private provider: Geolocation | undefined;
	private closed = true;

	constructor(
		app: App,
		private readonly initial: SparkleLocation | null,
		private readonly onApply: (location: SparkleLocation) => boolean,
		private readonly onClosed: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.closed = false;
		this.lifecycle.load();
		this.setTitle(t(this.initial ? 'editLocation' : 'addLocation'));
		this.modalEl.addClass('sparkle-quick-modal', 'sparkle-location-modal');
		this.lifecycle.addChild(new CaptureViewport(this.containerEl));
		this.provider = Platform.isMobile
			? this.contentEl.ownerDocument.defaultView?.navigator.geolocation
			: undefined;
		this.contentEl.createEl('p', {
			text: t(this.provider ? 'locationDescription' : 'locationUnsupported'),
			cls: 'sparkle-location-description',
		});
		this.locateButton = this.button(
			this.contentEl,
			t('getCurrentLocation'),
			() => void this.locate(),
		);
		this.locateButton.disabled = !this.provider;
		this.coordinates = this.field(
			t('locationCoordinates'),
			'31.2304, 121.4737',
		);
		this.coordinates.value = this.initial
			? locationCoordinates(this.initial)
			: '';
		this.nameInput = this.field(
			t('locationName'),
			t('locationNamePlaceholder'),
		);
		this.nameInput.maxLength = 120;
		this.nameInput.value = this.initial?.name ?? '';
		this.lifecycle.registerDomEvent(this.coordinates, 'input', () => {
			this.stopLookup();
			this.setFeedback('');
		});
		this.feedback = this.contentEl.createDiv({
			cls: 'sparkle-location-feedback',
			attr: { role: 'status', 'aria-live': 'polite' },
		});
		const actions = this.modalEl.createDiv({ cls: 'sparkle-location-actions' });
		this.button(actions, t('cancelLocation'), () => this.close());
		this.button(actions, t('attachLocation'), () => this.apply()).addClass(
			'mod-cta',
		);
		this.lifecycle.registerDomEvent(this.contentEl, 'keydown', (event) => {
			if (
				event.key === 'Enter' &&
				!event.isComposing &&
				(event.target === this.coordinates || event.target === this.nameInput)
			) {
				event.preventDefault();
				this.apply();
			}
		});
	}

	private field(label: string, placeholder: string): HTMLInputElement {
		const field = this.contentEl.createEl('label', {
			cls: 'sparkle-location-field',
		});
		field.createSpan({ text: label });
		return field.createEl('input', {
			type: 'text',
			attr: {
				placeholder,
				'aria-label': label,
				autocomplete: 'off',
				spellcheck: 'false',
			},
		});
	}

	private button(
		parent: HTMLElement,
		text: string,
		callback: () => void,
	): HTMLButtonElement {
		const button = parent.createEl('button', {
			text,
			attr: { type: 'button' },
		});
		this.lifecycle.registerDomEvent(button, 'click', callback);
		return button;
	}

	private setFeedback(text: string, error = false): void {
		this.feedback.setText(text);
		this.feedback.toggleClass('is-error', error);
	}

	private async locate(): Promise<void> {
		this.stopLookup();
		const lookup = new AbortController();
		this.lookup = lookup;
		this.locateButton.disabled = true;
		this.locateButton.setText(t('locating'));
		this.setFeedback(t('locating'));
		try {
			const location = await requestLocation(
				this.provider,
				lookup.signal,
				this.contentEl.ownerDocument.defaultView ?? window,
			);
			if (this.closed || this.lookup !== lookup) return;
			this.coordinates.value = locationCoordinates(location);
			this.setFeedback(t('locationFound'));
		} catch (error) {
			if (this.closed || this.lookup !== lookup || lookup.signal.aborted)
				return;
			this.setFeedback(
				error instanceof Error ? error.message : t('locationUnavailable'),
				true,
			);
		} finally {
			if (this.lookup === lookup) this.stopLookup();
		}
	}

	private stopLookup(): void {
		this.lookup?.abort();
		this.lookup = null;
		if (this.locateButton) {
			this.locateButton.disabled = !this.provider;
			this.locateButton.setText(t('getCurrentLocation'));
		}
	}

	private apply(): void {
		try {
			const location = parseLocation(
				this.coordinates.value,
				this.nameInput.value,
			);
			if (this.onApply(location)) this.close();
		} catch (error) {
			this.setFeedback(
				error instanceof Error ? error.message : t('locationInvalid'),
				true,
			);
			this.coordinates.focus();
		}
	}

	onClose(): void {
		if (this.closed) return;
		this.closed = true;
		this.stopLookup();
		this.lifecycle.unload();
		this.contentEl.empty();
		this.onClosed();
	}
}
