import {
	alternation,
	noncapture,
	capture,
	characterClass,
	part,
	digit,
	word,
	whitespace,
	any,
	wordBoundary,
	nonWordBoundary,
	startAnchor,
	endAnchor,
	concatenation,
	repeatFrom,
	typed, is, quantifiedMod,
	MutableCharacterClass
} from "./types";

import { props, enumProps } from "./unicode-data";

/*
Characters
[xyz],[a-c]		Character class
[^xyz],[^a-c]	Negated character class
.			Wildcard: Matches any single character except line terminators: \n, \r, \u2028 or \u2029
\d			Digit character class escape: Matches any digit (Arabic numeral). Equivalent to [0-9]
\D			Non-digit character class escape: Matches any character that is not a digit (Arabic numeral)
\w			Word character class escape: Matches any alphanumeric character from the basic Latin alphabet, including the underscore. Equivalent to [A-Za-z0-9_]
\W			Non-word character class escape: Matches any character that is not a word character from the basic Latin alphabet. Equivalent to [^A-Za-z0-9_]
\s			White space character class escape: Matches a single white space character, including space, tab, form feed, line feed, and other Unicode spaces. Equivalent to [\f\n\r\t\v\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]
\S			Non-white space character class escape
\t			Matches a horizontal tab.
\r			Matches a carriage return.
\n			Matches a linefeed.
\v			Matches a vertical tab.
\f			Matches a form-feed.
[\b]		Matches a backspace.
\0			Matches a NUL character.
\cX			Matches a control character using caret notation, where "X" is a letter from A–Z
\xhh		Matches the character with the code hh (two hexadecimal digits).
\uhhhh		Matches a UTF-16 code-unit with the value hhhh (four hexadecimal digits).
\u{hhhh} or \u{hhhhh}	(Only when the u flag is set.) Matches the character with the Unicode value U+hhhh or U+hhhhh (hexadecimal digits).
\p{UnicodeProperty}, \P{UnicodeProperty}	Unicode character class escape: Matches a character based on its Unicode character properties
\			Indicates that the following character should be treated specially, or "escaped"

x|y			Alternation: Matches either "x" or "y"

Boundary-type assertions
^			Input boundary beginning assertion
$			Input boundary end assertion
\b			Word boundary assertion
\B			Non-word-boundary assertion

Other Assertions
x(?=y)		Lookahead assertion
x(?!y)		Negative lookahead assertion
(?<=y)x		Lookbehind assertion
(?<!y)x		Negative lookbehind assertion

Groups and backreferences
(x)			Capturing group
(?<Name>x)	Named capturing group
(?:x)		Non-capturing group
(?flags:x), (?:flags-flags:x)	Modifier (flags can be i, m, s)
\<int>		Backreference
\k<Name>	Named backreference

Quantifiers
x*			Matches the preceding item "x" 0 or more times
x+			Matches the preceding item "x" 1 or more times. Equivalent to {1,}
x?			Matches the preceding item "x" 0 or 1 times. For example, /e?le?/ matches the "el" in "angel" and the "le" in "angle."
x{<int>}	Matches exactly "n" occurrences of the preceding item "x"
x{<int>,}	Matches at least "n" occurrences of the preceding item "x"
x{n,m}		Matches at least "n" and at most "m" occurrences of the preceding item "x"

Non greedy quantifiers
x*?
x+?
x??
x{n}?
x{n,}?
x{n,m}?

*/

//-----------------------------------------------------------------------------
// Regex parsing
//-----------------------------------------------------------------------------

function getUnicodeSet(property: string, neg: boolean) {
	let set;
	if (property.includes('=')) {
		const [prop, value] = property.split('=');
		if (prop.endsWith('!')) {
			neg = !neg;
			set = enumProps[prop.slice(0, -1)]?.[value];
		} else {
			set = enumProps[prop]?.[value];
		}
	} else {
		set = props[property];
	}
	return !set ? undefined : neg ? characterClass.fromEntries(set).complement() : characterClass.fromEntries(set);
}

interface PendingGroup {
	type: 'group';
	group: capture | noncapture;
	tos: part[];
}

export function parse(re: string, unicode = true, extended = false): part {
	const stack:	(alternation | PendingGroup)[] = [];
	let curr:		part[] = [];
	let i	= 0;

	function check(c: string) {
		if (re.slice(i).startsWith(c)) {
			i += c.length;
			return true;
		}
		return false;
	}

	function skipTo(c: string) {
		const start = i;
		while (i < re.length && re[i] !== c)
			i++;
		if (re[i] !== c)
			throw new Error(`Missing '${c}'`);
		return re.substring(start, i++);
	}

	function int(): number {
		const start = i;
		while (re[i] >= '0' && re[i] <= '9')
			i++;
		return parseInt(re.substring(start, i));
	}

	function backslashed(): number | part {
		const c = re[i++];
		switch (c) {
			default:	return c.charCodeAt(0);
			case 'd':	return digit;			//digit
			case 'D':	return digit.complement();		//non-digit
			case 'w':	return word;			//word
			case 'W':	return word.complement();		//non-word
			case 's':	return whitespace;		//whitespace
			case 'S':	return whitespace.complement();//non-whitespace
			case 'b':	return 8;  				//backspace
			case 't':	return 9;  				//tab
			case 'n':	return 10;  			//newline
			case 'v':	return 11;  			//vertical tab
			case 'f':	return 12;  			//form feed
			case 'r':	return 13;  			//carriage return
			case 'c':	return re.charCodeAt(i++) & 31; //control character
			case '0': {
				const start = i - 1;
				while (re[i] >= '0' && re[i] <= '7' && i - start < 4)
					i++;
				return parseInt(re.substring(start, i), 8);
			}
			case 'x':
				if (i + 2 > re.length)
					throw new Error('bad \\x escape');
				i += 2;
				return parseInt(re.substring(i - 2, i), 16);

			case 'u':
				if (unicode && check('{'))
					return skipTo('}').split(' ').map(x => parseInt(x, 16)).reduce((cc, x) => (cc.set(x), cc), new MutableCharacterClass());
				if (i + 4 > re.length)
					throw new Error('bad \\u escape');
				i += 4;
				return parseInt(re.substring(i - 4, i), 16);

			case 'p':
			case 'P': {
			    if (!unicode || !check('{'))
    				throw new Error('\\p and \\P can only be used with unicode enabled, and must be followed by {property}');

				const property	= skipTo('}');
				const set		= getUnicodeSet(property, c === 'P');
				if (!set)
					throw new Error(`Unknown Unicode value ${property}`);
				return set;
			}
			case 'q':
				if (extended && check('{'))
					return alternation(skipTo('}').split('|'));
				return c.charCodeAt(0);
		}			
	}

	function character() {
		if (extended && check('['))
			return charClass();

		const code = unicode ? re.codePointAt(i++)! : re.charCodeAt(i++);
		if (code > 0xffff) {
			++i;
			return code;
		}
		return code === 92 ? backslashed() : code;
	}

	function charClass() {
		const neg = check('^');

		const cs = new characterClass(false);
		if (re[i] === ']' || re[i] === '-')
			cs.set(re.charCodeAt(i++));

		while (i < re.length && re[i] !== ']') {
			const from = character();
			if (extended) {
				if (check('||')) {
					const to = character();
					if (typeof to === 'number')
						cs.set(to);
					else if (is(to, 'class'))
						cs.selfUnion(to);
					
				} else if (check('--')) {
					const to = character();
					if (typeof to === 'number')
						cs.clear(to);
					else if (is(to, 'class'))
						cs.selfIntersect(to.complement());

				} else if (check('&&')) {
					let to = character();
					if (typeof to === 'number') {
						const t = new characterClass(false);
						t.set(to);
						to = t;
					}
					if (is(to, 'class'))
						cs.selfIntersect(to);

				} else if (check('~~')) {
					let to = character();
					if (typeof to === 'number') {
						const t = new characterClass(false);
						t.set(to);
						to = t;
					}
					if (is(to, 'class'))
						cs.selfXor(to);

				}
			}
			if (typeof from === 'number') {
				if (re[i] === '-' && i + 1 < re.length && re[i + 1] !== ']') {
					++i;
					const to = character();
					if (typeof to !== 'number' || from > to)
						throw new Error('bad character class');

					cs.setRange(from, to + 1);
				} else {
					cs.set(from);
				}
			} else if (is(from, 'class')) {
				cs.selfUnion(from);
			}
		}
		i++; // skip ']'
		return neg ? cs.selfComplement() : cs;
	}

	function addQuantified(min: number, max: number) {
		const mod = check('?') ? 'lazy' : extended && check('+') ? 'possessive' : 'greedy';
		const top = curr.pop();
		if (!top)
			throw new Error('nothing to quantify');

		if (typeof top === 'string' && top.length > 1) {
			curr.push(top.slice(0, -1));
			curr.push(repeatFrom(top.slice(-1), min, max, mod));
		} else {
			curr.push(repeatFrom(top, min, max, mod));
		}
	}

	function addText(c: string) {
		if (typeof curr.at(-1) === 'string') {
			curr[curr.length - 1] += c;
		} else {
			curr.push(c);
		}
	}

	function closeAlt() {
		let top = stack.pop();
		if (top?.type === 'alt') {
			top.parts.push(concatenation(curr));
			curr = [top];
			top = stack.pop();
		}
		return top;
	}

	const specialChars = /[\\^$*+?{()|[.]/;

	while (i < re.length) {
		const remaining	= re.substring(i);
		const next		= remaining.search(specialChars);

		if (next === -1) {
			addText(remaining);
			break;
		}

		if (next > 0)
			addText(remaining.substring(0, next));

		i += next;
		switch (re[i++]) {
			case '\\':
				if (check('b')) {
					curr.push(wordBoundary);
				} else if (check('B')) {
					curr.push(nonWordBoundary);
				} else if (re[i] >= '1' && re[i] <= '9') {
					curr.push({type: 'reference', value: int()});
				} else if (check('k<')) {
					curr.push({type: 'reference', value: skipTo('>')});
				} else {
					const b = backslashed();
					if (typeof b === 'number')
						addText(String.fromCodePoint(b));
					else
						curr.push(b);
				}
				break;

			case '.':
				curr.push(any);
				break;

		//Boundary-type assertions
			case '^':
				curr.push(startAnchor);
				break;
			case '$':
				curr.push(endAnchor);
				break;

		//Quantifiers
			case '*':
				addQuantified(0, -1);
				break;
			case '+':
				addQuantified(1, -1);
				break;
			case '?':
				addQuantified(0, 1);
				break;
			case '{': {
				const	min = int();
				const	max = check(',') ? (re[i] !== '}' ? int() : -1) : min;
				++i; // skip '}'
				addQuantified(min, max);
				break;
			}

		//Alternation
			case '|': {
				const top = stack.at(-1);
				if (top?.type === 'alt') {
					top.parts.push(concatenation(curr));
				} else {
					stack.push({type: 'alt', parts: [concatenation(curr)]});
				}
				curr = [];
				break;
			}

		//Groups
			case '(': {
				let group: capture | noncapture;
				const dummy = '';//text(''); // placeholder
				if (check('?')) {
					switch (re[i++]) {
						case ':':
							group = noncapture(dummy);
							break;
						case '=':
							group = noncapture(dummy, 'ahead');
							break;
						case '!':
							group = noncapture(dummy, 'neg_ahead');
							break;
						case '<':
							if (check('=')) {
								group = noncapture(dummy, 'behind');
							} else if (check('!')) {
								group = noncapture(dummy, 'neg_behind');
							} else {
								group = capture(dummy, skipTo('>'));
							}
							break;
						case '>':
							if (extended) {
								group = noncapture(dummy, 'atomic');
								break;
							}
							//fall through
						default: {
							let		set = true;
							const	flags: {i?: boolean; m?: boolean; s?: boolean} = {};
							--i; // go back to first flag character
							while (i < re.length) {
								const f = re[i++];
								if (f === ':')
									break;
								if (f === '-')
									set = false;
								else if (f === 'i' || f === 'm' || f === 's')
									flags[f] = set;
							}
							group = noncapture(dummy, flags);
							break;
						}
					}
				} else {
					group = capture(dummy, '');
				}

				stack.push({type: 'group', group: group, tos: curr});
				curr = [];
				break;
			}

			case ')': {
				const top = closeAlt();
				if (top?.type !== 'group')
					throw new Error('unmatched )');

				top.group.part = concatenation(curr);
				curr = [...top.tos, top.group];
				break;
			}

		//Character classes
			case '[':
				curr.push(charClass());
				break;
		}
	}

	const top = closeAlt();
	if (top)
		throw new Error('unmatched (');

	return concatenation(curr);
}

//-----------------------------------------------------------------------------
// Regex to string
//-----------------------------------------------------------------------------

function printQuantified(min: number, max: number, mod: quantifiedMod): string {
	return (min === 0 && max === -1 ? '*'
		: min === 1 && max === -1 ? '+'
		: min === 0 && max === 1 ? '?'
		: max === -1 ? `{${min},}`
		: min === max ? `{${min}}`
		: `{${min},${max}}`
	) + (mod === 'lazy' ? '?' : mod === 'possessive' ? '+' : '');
}

function list(parts: part[], join: string): string {
	return parts.map((p, i) => {
		if (is(p, 'quantified') && is(p.part, 'text') && i > 0 && is(parts[i - 1], 'text'))
			return `(?:${p.part})` + printQuantified(p.min, p.max, p.mod);

		const s = toRegExpString(p);
		return is(p, 'alt') ? `(?:${s})` : s;
	}).join(join);
}

export function toRegExpString(part: part): string {
	if (typeof part === 'string')
		return part.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');

	if (Array.isArray(part))
		return list(part, '');

	switch (part.type) {
		case 'alt':
			return list(part.parts, '|');

		case 'quantified':
			return toRegExpString(part.part) + printQuantified(part.min, part.max, part.mod);

		case 'noncapture': {
			let header = '';
			const opts = part.options;
			if (opts) {
				if (typeof opts === 'string') {
					header = {
						ahead:		'=',
						behind:		'<=',
						neg_ahead:	'!',
						neg_behind:	'<!',
						atomic:		'>'
					}[opts];
				} else if ((opts.i ?? opts.m ?? opts.s) !== undefined) {
					const posflags = (opts.i ? 'i' : '') + (opts.m ? 'm' : '') + (opts.s ? 's' : '');
					const negflags = (opts.i === false ? 'i' : '') + (opts.m === false ? 'm' : '') + (opts.s === false ? 's' : '');
					header = `${posflags}${negflags ? '-' : ''}${negflags}:`;
				}
			}
			return `(?${header}${toRegExpString(part.part)})`;
		}

		case 'capture':
			return `(${part.name ? `?<${part.name}>` : ''}${toRegExpString(part.part)})`;

		case 'class': {
			if (part.contains(any))
				return '.';

			const neg = part.isNegated();
			const temp = neg ? part.complement() : part.mutable();

			const has_w = temp.contains(word);
			if (has_w) {
				if (word.contains(temp))
					return '\\w';
				temp.selfIntersect(word.complement());
			}

			const has_d = !has_w && temp.contains(digit);
			if (has_d) {
				if (digit.contains(temp))
					return '\\d';
				temp.selfIntersect(digit.complement());
			}

			const has_s = temp.contains(whitespace);
			if (has_s) {
				if (!has_w && !has_d && whitespace.contains(temp))
					return '\\s';
				temp.selfIntersect(whitespace.complement());
			}
			return `[${neg ? '^' : ''}${has_w ? '\\w' : has_d ? '\\d' : ''}${has_s ? '\\s' : ''}${temp.toString()}]`;
			//return `[${part.toString()}]`;
		}

		case 'unicode':
			return `\\p{${part.property}}`;

		case 'notunicode':
			return `\\P{${part.property}}`;

		case 'wordbound':
			return '\\b';
		case 'nowordbound':
			return '\\B';
		case 'inputboundstart':
			return '^';
		case 'inputboundend':
			return '$';

		case 'reference':
			return typeof part.value === 'number' ? `\\${part.value}` : `\\k<${part.value}>`;
	}
}

export function toRegExp(part: part, flags?: string) {
	return new RegExp(toRegExpString(part), flags);
}

//-----------------------------------------------------------------------------
// Regex AST manipulation
//-----------------------------------------------------------------------------

function visit(part: part, visitor: (p: part) => part|undefined, previsit?: (p: part) => part|undefined): part {
	if (previsit)
		part = previsit(part) ?? part;
	/*
	if (typeof part === 'string')
		return visitor(part) ?? part;

	if (Array.isArray(part)) {
		part = part.map(p => visit(p, visitor, previsit));

	} else */
	
	const t = typed(part);
	switch (t.type) {
		case 'concat':
			part = concatenation((part as part[]).map(p => visit(p, visitor, previsit)));
			break;

		case 'alt':
			part = alternation(t.parts.map(p => visit(p, visitor, previsit)));
			break;

		case 'quantified':
			part = repeatFrom(visit(t.part, visitor, previsit), t.min, t.max, t.mod);
			break;

		case 'noncapture':
			part = noncapture(visit(t.part, visitor, previsit), t.options);
			break;

		case 'capture':
			part = capture(visit(t.part, visitor, previsit), t.name);
			break;

	}
	return visitor(part) ?? part;
}

function commonPrefix(strings:  string[]) {
	if (strings.length < 2)
		return '';
	
	let prefix = strings[0];
	for (let i = 1; prefix && i < strings.length; i++) {
		let j = 0;
		while (j < prefix.length && j < strings[i].length && prefix[j] === strings[i][j])
			j++;
		prefix = prefix.slice(0, j);
	}
	return prefix;
}

export function optimize(part: part): part {
	return visit(part, p => {
		if (Array.isArray(p)) {
			const result: part[] = [];
			let current = "";

			for (const i of p) {
				if (typeof i === 'string') {
					current += i;
				} else {
					if (current) {
						result.push(current);
						current = "";
					}
					if (is(i, 'concat'))
						result.push(...i);
					else
						result.push(i);
				}
			}
			if (current)
				result.push(current);
			return concatenation(result);

		} else if (is(p, 'alt')) {
			const unique	= [...new Set(p.parts.map(toRegExpString))];
			const strings	= unique.filter((p): p is string => typeof p === 'string');
			const prefix	= commonPrefix(strings);
			if (prefix) {
				return concatenation([prefix, alternation([
					...strings.map(s => s.slice(prefix.length)),
					...unique.filter(p => typeof p !== 'string')
				])]);
			}
			const result = [];
			let cs: MutableCharacterClass | undefined;
			for (const part of unique) {
				if (typeof part === 'string' && part.length === 1) {
					if (!cs)
						cs = new MutableCharacterClass(false);
					cs.setChar(part);
				} else if (is(part, 'class')) {
					if (!cs)
						cs = part.mutable();
					else
						cs.selfUnion(part);
				} else {
					if (cs) {
						result.push(cs);
						cs = undefined;
					}
					result.push(part);
				}
			}
			if (cs)
				result.push(cs);
			return alternation(result);
/*
			// not safe to do this, as it changes the order of alternatives
			const single = partition(unique, p => typeof p === 'string' && p.length === 1);
			if (single.true) {
				const c = chars(single.true.map(s => s as string).join(''));
				return single.false ? alternation([c, ...single.false]) : c;
			}
			return alternation(unique);
*/
		} else if (is(p, 'class')) {
			const i = p.next(-1);
			if (i >= 0 && p.next(i) === -1)
				return String.fromCodePoint(i);
		}
		return p;
	});
}
