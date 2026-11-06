import { t } from './i18n';
import {
	App,
	DropdownComponent,
	Modal,
	Notice,
	PluginSettingTab,
	Setting,
	SettingDefinitionItem,
	TextComponent,
} from 'obsidian';
import type SparklePlugin from './main';
import { createDefaultSettings, SparkleSettings } from './state';

function settingDefinitions(plugin: SparklePlugin, feedback?: HTMLElement) {
	const resetControls: Array<() => void> = [];
	const report = (message: string, error = false): void => {
		if (feedback) {
			feedback.setText(message);
			feedback.toggleClass('is-error', error);
		} else new Notice(message);
	};
	const bind = (
		setting: Setting,
		control: TextComponent | DropdownComponent,
		key: keyof SparkleSettings,
	): void => {
		let revision = 0;
		setting.settingEl.addClass('sparkle-setting');
		const errorEl = setting.descEl.createDiv({
			cls: 'sparkle-setting-error',
			attr: { role: 'status', 'aria-live': 'polite' },
		});
		const inputEl = 'inputEl' in control ? control.inputEl : control.selectEl;
		const clearError = (): void => {
			errorEl.empty();
			inputEl.removeAttribute('aria-invalid');
		};
		control.setValue(plugin.settings[key]).onChange(async (value) => {
			const current = ++revision;
			clearError();
			feedback?.empty();
			const changes: Partial<SparkleSettings> =
				key === 'insertionPosition'
					? { insertionPosition: value === 'start' ? 'start' : 'end' }
					: { [key]: value };
			try {
				await plugin.updateSettings(changes);
			} catch (error) {
				if (current !== revision) return;
				errorEl.setText(
					error instanceof Error ? error.message : t('settingsSaveError'),
				);
				inputEl.setAttribute('aria-invalid', 'true');
			}
		});
		resetControls.push(() => {
			revision++;
			control.setValue(plugin.settings[key]);
			clearError();
		});
	};
	return [
		{
			name: t('headingSetting'),
			desc: t('headingDescription'),
			render: (setting: Setting): void => {
				setting.addText((text) => {
					text.setPlaceholder(t('defaultHeading'));
					bind(setting, text, 'heading');
				});
			},
		},
		{
			name: t('positionSetting'),
			desc: t('positionDescription'),
			render: (setting: Setting): void => {
				setting.addDropdown((dropdown) => {
					dropdown
						.addOption('start', t('positionStart'))
						.addOption('end', t('positionEnd'));
					bind(setting, dropdown, 'insertionPosition');
				});
			},
		},
		...(['dailyImageFolder', 'noteImageFolder'] as const).map((key) => ({
			name: t(
				key === 'dailyImageFolder'
					? 'dailyImageFolderSetting'
					: 'noteImageFolderSetting',
			),
			desc: t('imageFolderDescription', { placeholder: '{date}' }),
			render: (setting: Setting): void => {
				setting.addText((text) => bind(setting, text, key));
			},
		})),
		{
			name: t('resetSettings'),
			desc: t('resetSettingsDescription'),
			render: (setting: Setting): void => {
				setting.addButton((button) =>
					button.setButtonText(t('resetSettings')).onClick(async () => {
						button.setDisabled(true);
						try {
							await plugin.updateSettings(createDefaultSettings());
							for (const reset of resetControls) reset();
							report(t('settingsReset'));
						} catch (error) {
							report(
								error instanceof Error ? error.message : t('settingsSaveError'),
								true,
							);
						} finally {
							button.setDisabled(false);
						}
					}),
				);
			},
		},
	];
}

function renderSettings(container: HTMLElement, plugin: SparklePlugin): void {
	container.empty();
	container.addClass('sparkle-settings');
	container.createEl('p', {
		text: t('settingsIntro'),
		cls: 'sparkle-settings-intro',
	});
	const feedback = container.createDiv({
		cls: 'sparkle-settings-feedback',
		attr: { role: 'status', 'aria-live': 'polite' },
	});
	for (const definition of settingDefinitions(plugin, feedback)) {
		definition.render(
			new Setting(container).setName(definition.name).setDesc(definition.desc),
		);
	}
	container.append(feedback);
	container.createEl('p', {
		text: t('settingsNote'),
		cls: 'sparkle-settings-note',
	});
}

export class SparkleSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly sparkle: SparklePlugin,
	) {
		super(app, sparkle);
	}
	getSettingDefinitions(): SettingDefinitionItem[] {
		return settingDefinitions(this.sparkle);
	}
}

export class SparkleSettingsModal extends Modal {
	constructor(
		app: App,
		private readonly plugin: SparklePlugin,
	) {
		super(app);
	}
	onOpen(): void {
		this.setTitle(t('recordSettings'));
		renderSettings(this.contentEl, this.plugin);
	}
	onClose(): void {
		this.contentEl.empty();
	}
}
