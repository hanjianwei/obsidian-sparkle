import { t } from './i18n';

export interface SparkleLocation {
	latitude: number;
	longitude: number;
	name: string;
}

export function normalizeLocation(value: unknown): SparkleLocation {
	if (!value || typeof value !== 'object')
		throw new Error(t('locationInvalid'));
	const data = value as Record<string, unknown>;
	const { latitude, longitude, name } = data;
	if (
		typeof latitude !== 'number' ||
		typeof longitude !== 'number' ||
		!Number.isFinite(latitude) ||
		!Number.isFinite(longitude) ||
		Math.abs(latitude) > 90 ||
		Math.abs(longitude) > 180 ||
		typeof name !== 'string'
	)
		throw new Error(t('locationInvalid'));
	return {
		latitude: Number(latitude.toFixed(6)),
		longitude: Number(longitude.toFixed(6)),
		name: [...name]
			.map((character) => (character.charCodeAt(0) < 32 ? ' ' : character))
			.join('')
			.replace(/\s+/gu, ' ')
			.trim()
			.slice(0, 120),
	};
}

export function parseLocation(
	coordinates: string,
	name: string,
): SparkleLocation {
	const match =
		/^\s*(?:geo:)?([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*[,，]\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*$/iu.exec(
			coordinates,
		);
	if (!match) throw new Error(t('locationInvalid'));
	return normalizeLocation({
		latitude: Number(match[1]),
		longitude: Number(match[2]),
		name,
	});
}

export function locationCoordinates(location: SparkleLocation): string {
	return `${location.latitude}, ${location.longitude}`;
}

export function locationLink(location: SparkleLocation): string {
	const normalized = normalizeLocation(location);
	const label = (normalized.name || t('currentLocation'))
		.replace(/&/gu, '&amp;')
		.replace(/[\\[\]`*_<>!|~]/gu, '\\$&');
	return `[📍 ${label}](geo:${normalized.latitude},${normalized.longitude})`;
}

/** Bound the whole request, including a pending permission prompt, and ignore late callbacks. */
export function requestLocation(
	provider: Pick<Geolocation, 'getCurrentPosition'> | undefined,
	signal: AbortSignal,
	win: Window = window,
): Promise<SparkleLocation> {
	if (signal.aborted)
		return Promise.reject(new DOMException('Aborted', 'AbortError'));
	if (!provider) return Promise.reject(new Error(t('locationUnsupported')));
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (
			location: SparkleLocation | null,
			error?: unknown,
		): void => {
			if (settled) return;
			settled = true;
			win.clearTimeout(timer);
			signal.removeEventListener('abort', abort);
			if (location) resolve(location);
			else
				reject(
					error instanceof Error ? error : new Error(t('locationUnavailable')),
				);
		};
		const abort = (): void =>
			finish(null, new DOMException('Aborted', 'AbortError'));
		const timer = win.setTimeout(
			() => finish(null, new Error(t('locationTimeout'))),
			12_000,
		);
		signal.addEventListener('abort', abort, { once: true });
		try {
			provider.getCurrentPosition(
				(position) => {
					try {
						finish(
							normalizeLocation({
								latitude: position.coords.latitude,
								longitude: position.coords.longitude,
								name: '',
							}),
						);
					} catch (error) {
						finish(null, error);
					}
				},
				(error) =>
					finish(
						null,
						new Error(
							t(
								error.code === 1
									? 'locationDenied'
									: error.code === 3
										? 'locationTimeout'
										: 'locationUnavailable',
							),
						),
					),
				{ enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
			);
		} catch {
			finish(null, new Error(t('locationUnavailable')));
		}
	});
}
