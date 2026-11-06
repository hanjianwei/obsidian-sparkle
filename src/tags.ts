export interface TagQuery {
	start: number;
	end: number;
	query: string;
}

export type TagInputMode = 'content' | 'tags';
const SEPARATOR = /[\s,，]/u;

/** Append picker selections or a draft's separate tags without changing its text. */
export function appendInlineTags(content: string, tags: string): string {
	const labels = tags
		.split(/[\s,，]+/u)
		.filter(Boolean)
		.map((tag) => `#${tag.replace(/^#/, '')}`)
		.join(' ');
	if (!labels) return content;
	const separator = content && !/\s$/u.test(content) ? ' ' : '';
	return `${content}${separator}${labels} `;
}

export function getTagQuery(
	value: string,
	caret: number,
	mode: TagInputMode,
): TagQuery | null {
	if (caret < 0 || caret > value.length) return null;
	if (mode === 'content') {
		const match = /(?:^|[\s(（[【])#([\p{L}\p{M}\p{N}_/-]*)$/u.exec(
			value.slice(0, caret),
		);
		if (!match) return null;
		const query = match[1] ?? '';
		const remaining =
			/^[\p{L}\p{M}\p{N}_/-]*/u.exec(value.slice(caret))?.[0] ?? '';
		const end = caret + remaining.length;
		return { start: caret - query.length - 1, end, query };
	}
	let start = caret;
	let end = caret;
	while (start > 0 && !SEPARATOR.test(value[start - 1] ?? '')) start--;
	while (end < value.length && !SEPARATOR.test(value[end] ?? '')) end++;
	const token = value.slice(start, end);
	if (!/^#?[\p{L}\p{M}\p{N}_/-]*$/u.test(token)) return null;
	return { start, end, query: value.slice(start, caret).replace(/^#/, '') };
}

export function suggestTags(
	tags: readonly string[],
	value: string,
	context: TagQuery,
	mode: TagInputMode,
): string[] {
	const query = context.query.toLowerCase();
	const selected = new Set(
		mode === 'tags'
			? `${value.slice(0, context.start)} ${value.slice(context.end)}`
					.split(/[\s,，]+/u)
					.filter(Boolean)
					.map((tag) => tag.replace(/^#/, '').toLowerCase())
			: [],
	);
	const matches = new Map<string, string>();
	for (const tag of tags) {
		const name = tag.replace(/^#/, '');
		const key = name.toLowerCase();
		if (!selected.has(key) && key.includes(query) && !matches.has(key))
			matches.set(key, `#${name}`);
	}
	return [...matches.values()]
		.sort((a, b) => {
			const prefixA = a.slice(1).toLowerCase().startsWith(query);
			const prefixB = b.slice(1).toLowerCase().startsWith(query);
			return Number(prefixB) - Number(prefixA) || a.localeCompare(b);
		})
		.slice(0, 10);
}

export function completeTag(
	value: string,
	context: TagQuery,
	tag: string,
): { value: string; caret: number } {
	const suffix = value.slice(context.end);
	const replacement = `#${tag.replace(/^#/, '')}${suffix ? '' : ' '}`;
	return {
		value: value.slice(0, context.start) + replacement + suffix,
		caret:
			context.start + replacement.length + (suffix.startsWith(' ') ? 1 : 0),
	};
}
