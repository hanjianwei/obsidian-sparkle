import { t } from './i18n';
import {
	createDefaultSettings,
	normalizeHeading,
	SparkleSettings,
} from './state';

interface Heading {
	level: number;
	title: string;
	start: number;
	end: number;
}

// Only inspect structural headings, never examples inside YAML or code fences.
function headingsIn(source: string): Heading[] {
	const headings: Heading[] = [];
	const lines = source.split('\n');
	let offset = 0;
	let frontmatter = /^\uFEFF?---\s*$/.test(lines[0] ?? '');
	let comment = false;
	let fence: { character: string; length: number } | null = null;
	for (let index = 0; index < lines.length; index++) {
		const line = (lines[index] ?? '').replace(/\r$/, '');
		const start = offset;
		offset += (lines[index]?.length ?? 0) + 1;
		if (frontmatter) {
			if (index > 0 && /^(---|\.\.\.)\s*$/.test(line)) frontmatter = false;
			continue;
		}
		if (!fence && (comment || line.trimStart().startsWith('<!--'))) {
			comment = !line.includes('-->');
			continue;
		}
		const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (marker) {
			const run = marker[1] ?? '';
			if (!fence) {
				fence = { character: run[0] ?? '', length: run.length };
			} else if (
				run[0] === fence.character &&
				run.length >= fence.length &&
				!marker[2]?.trim()
			) {
				fence = null;
			}
			continue;
		}
		if (fence) continue;
		const match = /^ {0,3}(#{1,6})(?:[\t ]+(.*)|[\t ]*)$/.exec(line);
		if (match) {
			headings.push({
				level: match[1]?.length ?? 0,
				title: (match[2] ?? '').replace(/[\t ]+#+[\t ]*$/, '').trim(),
				start,
				end: Math.min(offset, source.length),
			});
		} else if (/^ {0,3}(=+|-+)[\t ]*$/.test(line) && index > 0) {
			const previous = lines[index - 1] ?? '';
			if (
				/^\S/.test(previous) &&
				!/^(?:#|>|[-*+]\s|\d+[.)]\s)/.test(previous)
			) {
				headings.push({
					level: line.trim().startsWith('=') ? 1 : 2,
					title: previous.trim(),
					start: start - previous.length - 1,
					end: Math.min(offset, source.length),
				});
			}
		}
	}
	if (frontmatter || fence || comment) {
		throw new Error(t('unclosedMarkdown'));
	}
	return headings;
}

function sectionIn(
	source: string,
	title: string,
): { start: number; end: number } | null {
	const headings = headingsIn(source);
	const index = headings.findIndex(
		(heading) => heading.level === 2 && heading.title === title,
	);
	const heading = headings[index];
	if (!heading) return null;
	const next = headings.slice(index + 1).find((item) => item.level <= 2);
	return { start: heading.end, end: next?.start ?? source.length };
}

export function parseTags(value: string): string[] {
	const tags = value
		.split(/[\s,，]+/u)
		.filter(Boolean)
		.map((tag) => tag.replace(/^#/, ''));
	const result = new Map<string, string>();
	for (const tag of tags) {
		if (
			!/^([\p{L}\p{M}\p{N}_-]+)(\/[\p{L}\p{M}\p{N}_-]+)*$/u.test(tag) ||
			!/[\p{L}\p{M}_-]/u.test(tag)
		) {
			throw new Error(t('invalidTag', { tag }));
		}
		if (!result.has(tag.toLowerCase()))
			result.set(tag.toLowerCase(), `#${tag}`);
	}
	return [...result.values()];
}

export function formatEntry(
	content: string,
	tags: string,
	now: Date,
	mode: 'file' | 'daily' = 'file',
): string {
	if (!content.trim()) throw new Error(t('contentRequired'));
	const pad = (value: number): string => String(value).padStart(2, '0');
	const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
	const timestamp =
		mode === 'daily'
			? time
			: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${time}`;
	const labels = parseTags(tags);
	const body = content.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');
	return [
		`- ${timestamp}${labels.length ? ` ${labels.join(' ')}` : ''}`,
		...body.split('\n').map((line) => `    ${line}`),
	].join('\n');
}

export function appendEntry(
	source: string,
	entry: string,
	settings: Readonly<SparkleSettings> = createDefaultSettings(),
): string {
	const heading = normalizeHeading(settings.heading);
	const section = sectionIn(source, heading);
	const newline = source.includes('\r\n') ? '\r\n' : '\n';
	const formatted = entry.replace(/\r\n?/g, '\n').replace(/\n/g, newline);
	if (!section) {
		const prefix = source.endsWith(newline + newline)
			? ''
			: source.endsWith(newline)
				? newline
				: source.length
					? newline + newline
					: '';
		return `${source}${prefix}## ${heading}${newline}${newline}${formatted}${newline}`;
	}
	if (settings.insertionPosition === 'start') {
		const before = source.slice(0, section.start);
		const after = source.slice(section.start);
		const gap = before.endsWith(newline) ? newline : newline + newline;
		// Reuse the section's original leading whitespace and preserve all old text.
		const separator = after.startsWith(newline + newline)
			? ''
			: after.startsWith(newline)
				? newline
				: newline + newline;
		return `${before}${gap}${formatted}${after ? separator : newline}${after}`;
	}
	const before = source.slice(0, section.end);
	const after = source.slice(section.end);
	const gap = before.endsWith(newline + newline)
		? ''
		: before.endsWith(newline)
			? newline
			: newline + newline;
	return `${before}${gap}${formatted}${newline}${after ? newline : ''}${after}`;
}

export function readEntries(
	source: string,
	heading: string = createDefaultSettings().heading,
): string {
	const section = sectionIn(source, normalizeHeading(heading));
	return section ? source.slice(section.start, section.end).trim() : '';
}
