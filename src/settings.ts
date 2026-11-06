import { t } from './i18n';
import {
	App,
	Modal,
	Notice,
	PluginSettingTab,
	Setting,
	SettingDefinitionItem,
} from 'obsidian';
import type SparklePlugin from './main';
import {
	normalizeHeading,
	normalizeImageFolder,
	SparkleSettings,
} from './state';

function settingDefinitions(plugin: SparklePlugin, feedback?: HTMLElement) {
	const report = (message: string, error = false): void => {
		if (feedback) {
			feedback.setText(message);
			feedback.toggleClass('is-error', error);
		} else new Notice(message);
	};
	const apply = async (changes: Partial<SparkleSettings>): Promise<boolean> => {
		try {
			await plugin.updateSettings(changes);
			report(t('settingsSaved'));
			return true;
		} catch (error) {
			report(
				error instanceof Error ? error.message : t('settingsSaveError'),
				true,
			);
			return false;
		}
	};
	return [
		{
			name: t('headingSetting'),
			desc: t('headingDescription'),
			render: (setting: Setting): void => {
				let heading = plugin.settings.heading;
				setting
					.addText((text) =>
						text
							.setValue(heading)
							.setPlaceholder(t('defaultHeading'))
							.onChange((value) => {
								heading = value;
							}),
					)
					.addButton((button) =>
						button.setButtonText(t('applyHeading')).onClick(async () => {
							let normalized: string;
							try {
								normalized = normalizeHeading(heading);
							} catch (error) {
								report(
									error instanceof Error ? error.message : t('invalidHeading'),
									true,
								);
								return;
							}
							button.setDisabled(true);
							await apply({ heading: normalized });
							button.setDisabled(false);
						}),
					);
			},
		},
		{
			name: t('positionSetting'),
			desc: t('positionDescription'),
			render: (setting: Setting): void => {
				setting.addDropdown((dropdown) =>
					dropdown
						.addOption('start', t('positionStart'))
						.addOption('end', t('positionEnd'))
						.setValue(plugin.settings.insertionPosition)
						.onChange(async (value) => {
							dropdown.setDisabled(true);
							const saved = await apply({
								insertionPosition: value === 'start' ? 'start' : 'end',
							});
							if (!saved) dropdown.setValue(plugin.settings.insertionPosition);
							dropdown.setDisabled(false);
						}),
				);
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
				let folder = plugin.settings[key];
				setting
					.addText((text) =>
						text.setValue(folder).onChange((value) => {
							folder = value;
						}),
					)
					.addButton((button) =>
						button.setButtonText(t('applyFolder')).onClick(async () => {
							let normalized: string;
							try {
								normalized = normalizeImageFolder(folder);
							} catch (error) {
								report(
									error instanceof Error
										? error.message
										: t('settingsSaveError'),
									true,
								);
								return;
							}
							button.setDisabled(true);
							await apply({ [key]: normalized });
							button.setDisabled(false);
						}),
					);
			},
		})),
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
