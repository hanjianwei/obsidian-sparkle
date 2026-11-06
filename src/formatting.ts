export type ListStyle = 'list' | 'task';

export interface FormattedText {
	text: string;
	start: number;
	end: number;
}

const LIST_MARKER = /^([-+*]|\d+[.)])[\t ]+(?:\[([^\]\r\n])\](?:[\t ]+|$))?/u;

/** Change only list markers, preserving the selected text and its indentation. */
export function formatList(
	text: string,
	start: number,
	end: number,
	style: ListStyle,
): FormattedText {
	const from = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
	const last = end > start && text[end - 1] === '\n' ? end - 1 : end;
	const newline = text.indexOf('\n', last);
	const to = newline < 0 ? text.length : newline;
	let offset = from;
	const lines = text
		.slice(from, to)
		.split('\n')
		.map((line) => {
			const indent = /^[\t ]*/u.exec(line)?.[0] ?? '';
			const marker = LIST_MARKER.exec(line.slice(indent.length));
			const entry = {
				line,
				offset: offset + indent.length,
				marker: marker?.[0] ?? '',
				style: marker
					? marker[2] !== undefined
						? 'task'
						: /^\d/u.test(marker[1] ?? '')
							? 'ordered'
							: 'list'
					: null,
			};
			offset += line.length + 1;
			return entry;
		});
	const nonempty = lines.filter(({ line }) => line.trim());
	const remove =
		nonempty.length > 0 && nonempty.every((line) => line.style === style);
	const prefix = remove ? '' : style === 'task' ? '- [ ] ' : '- ';
	const edits = lines
		.filter(({ line }) => lines.length === 1 || line.trim())
		.map((line) => ({
			offset: line.offset,
			length: line.marker.length,
			prefix,
		}));
	const position = (cursor: number): number => {
		let shift = 0;
		for (const edit of edits) {
			if (cursor < edit.offset) break;
			if (cursor <= edit.offset + edit.length)
				return edit.offset + shift + edit.prefix.length;
			shift += edit.prefix.length - edit.length;
		}
		return cursor + shift;
	};
	let result = text;
	for (const edit of [...edits].reverse())
		result =
			result.slice(0, edit.offset) +
			edit.prefix +
			result.slice(edit.offset + edit.length);
	return { text: result, start: position(start), end: position(end) };
}

/** Continue the current list item, or leave an empty item on Enter. */
export function continueList(
	text: string,
	start: number,
	end: number,
): FormattedText | null {
	const from = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
	const newline = text.indexOf('\n', start);
	const to = newline < 0 ? text.length : newline;
	const line = text.slice(from, to);
	const indent = /^[\t ]*/u.exec(line)?.[0] ?? '';
	const marker = LIST_MARKER.exec(line.slice(indent.length));
	if (
		!marker ||
		start < from + indent.length + marker[0].length ||
		insideCodeFence(text.slice(0, from))
	)
		return null;
	if (start === end && !line.slice(indent.length + marker[0].length).trim()) {
		const prefix = indent
			? indent.replace(/(?:\t| {1,4})$/u, '') + marker[0]
			: '';
		const caret = from + prefix.length;
		return {
			text: text.slice(0, from) + prefix + text.slice(to),
			start: caret,
			end: caret,
		};
	}
	let bullet = marker[1] ?? '-';
	if (/^\d/u.test(bullet)) {
		const number = Number.parseInt(bullet, 10);
		if (!Number.isSafeInteger(number + 1)) return null;
		bullet = bullet.replace(/^\d+/u, String(number + 1));
	}
	const prefix = `${indent}${bullet} ${marker[2] === undefined ? '' : '[ ] '}`;
	const caret = start + 1 + prefix.length;
	return {
		text: text.slice(0, start) + '\n' + prefix + text.slice(end),
		start: caret,
		end: caret,
	};
}

function insideCodeFence(text: string): boolean {
	let fence = '';
	for (const line of text.split('\n')) {
		const match = /^[\t ]*(`{3,}|~{3,})(.*)$/u.exec(line);
		if (!match) continue;
		const marker = match[1] ?? '';
		if (!fence) fence = marker;
		else if (
			marker[0] === fence[0] &&
			marker.length >= fence.length &&
			!match[2]?.trim()
		)
			fence = '';
	}
	return Boolean(fence);
}
