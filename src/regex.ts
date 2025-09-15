import { bits } from "@isopodlabs/utilities";

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

const posixClasses: Record<string, string> = {
    alnum: 	'\\p{L}\\p{Nl}\\p{Nd}',
    alpha: 	'\\p{L}\\p{Nl}',
    ascii: 	'\\x00-\\x7f',
    blank: 	'\\p{Zs}\\t',
    cntrl: 	'\\p{Cc}',
    digit: 	'\\p{Nd}',
    graph: 	'^\\p{Z}\\p{C}',
    lower: 	'\\p{Ll}',
    print: 	'\\p{C}',
    punct: 	'\\p{P}',
    space: 	'\\p{Z}\\t\\r\\n\\v\\f',
    upper: 	'\\p{Lu}',
    word: 	'\\p{L}\\p{Nl}\\p{Nd}\\p{Pc}',
    xdigit: 'A-Fa-f0-9',
};

export class characterClass extends bits.SparseBits {
	type = 'class' as const;

	//setChar(char: string) {
	//	this.set(char.charCodeAt(0));
	//}
	test(char: string): boolean {
		return this.has(char.charCodeAt(0));
	}

	mutable(): MutablecharacterClass {
		return new MutablecharacterClass(true).selfIntersect(this);
	}

	isNegated(): boolean {
		return !!this.undef;
	}

	toString(): string {
		let s = this.undef ? '^' : '';
		for (const i in this.bits) {
			const b = this.bits[i] ^ this.undef;
			const c0 = +i * 32;

			for (let j = 0; j < 32; j++) {
				if (b & (1 << j)) {
					const c1 = c0 + j;
					while (j < 32 && (b & (1 << j)))
						j++;
					const c2 = c0 + j - 1;
					s += String.fromCharCode(c1).replace(/[-\\\]]/g, '\\$&');
					if (c1 !== c2)
						s += '-' + String.fromCharCode(c2).replace(/[-\\\]]/g, '\\$&');
				}
			}
		}
		return s;
	}
};

class MutablecharacterClass extends characterClass {
	setChar(char: string) {
		this.set(char.charCodeAt(0));
	}

	setString(c: string) {
		for (let i = 0; i < c.length; i++)
			this.set(c.charCodeAt(i));
		return this;
	}
	clearString(c: string) {
		for (let i = 0; i < c.length; i++)
			this.clear(c.charCodeAt(i));
		return this;
	}

}


// characterClass helpers
export function range(from: string, to: string) {
    return new MutablecharacterClass(false).setRange(from.charCodeAt(0), to.charCodeAt(0) + 1);
}

export function chars(chars: string) {
	return new MutablecharacterClass(false).setString(chars);
}

export function union(...classes: characterClass[]) {
    const result = new MutablecharacterClass(false);
    for (const cls of classes)
        result.selfUnion(cls);
    return result;
}

// Common character class constants and ranges
export const any		: characterClass = new characterClass(true);//.clearString('\n\r\u2028\u2029');
export const digit		: characterClass = range('0', '9');  //digit
export const lower		: characterClass = range('a', 'z');
export const upper		: characterClass = range('A', 'Z');
export const alpha		: characterClass = lower.union(upper);
export const alnum		: characterClass = alpha.union(digit);
export const word		: characterClass = alnum.union(chars('_'));  //word
export const whitespace	: characterClass = chars(' \t\r\n\f\v');  //whitespace
export const hex		: characterClass = digit.union(chars('abcdefABCDEF'));
export const octal		: characterClass = range('0', '7');

export function text(c: string): string {
	return c;
}
export function concatenation(parts: part[]): part[] | part {
	return parts.length === 1 ? parts[0] : parts;
}

interface alternation {
	type: 'alt';
	parts: part[];
}
export function alternation(parts: part[]): alternation | part {
	return	parts.length === 1 ? parts[0]
		: 	parts.length === 2 && !parts[1] ? optional(parts[0])
		:	{type: 'alt', parts};
}

type noncaptureOptions = 'ahead' | 'behind' | 'neg_ahead' | 'neg_behind' | 'atomic' | {i?: boolean; m?: boolean; s?: boolean};
interface noncapture {
	type: 'noncapture';
	part: part;
	options?: noncaptureOptions
};
export function noncapture(part: part, options?: noncaptureOptions): noncapture {
	return {type: 'noncapture', part, options};
}
export function lookAhead(part: part)		{ return noncapture(part, 'ahead'); }
export function negLookAhead(part: part)	{ return noncapture(part, 'neg_ahead'); }
export function lookBehind(part: part)		{ return noncapture(part, 'behind'); }
export function negLookBehind(part: part)	{ return noncapture(part, 'neg_behind'); }

interface capture {
	type: 'capture';
	name?: string;
	part: part;
}
export function capture(part: part, name?: string): capture {
	return {type: 'capture', part, name};
}

type quantifiedMod = 'greedy' | 'lazy' | 'possessive';
interface quantified {
	type: 'quantified';
	part: part;
	min: number;
	max: number; // -1 = inf
	mod: quantifiedMod;
}
export function repeatFrom(part: part, min: number, max = -1, mod: quantifiedMod = 'greedy'): quantified {
	return {type: 'quantified', part, min, max, mod};
}
export function repeat(part: part, n: number, mod: quantifiedMod = 'greedy'): quantified {
	return {type: 'quantified', part, min: n, max: n, mod};
}
export function zeroOrMore(part: part, mod: quantifiedMod = 'greedy')	{ return repeatFrom(part, 0, -1, mod); }
export function oneOrMore(part: part, mod: quantifiedMod = 'greedy')	{ return repeatFrom(part, 1, -1, mod); }
export function optional(part: part, mod: quantifiedMod = 'greedy')		{ return repeatFrom(part, 0, 1, mod); }

interface boundary {
	type: 'wordbound' | 'nowordbound' | 'inputboundstart' | 'inputboundend';
}
export function boundary(type: boundary['type']): boundary {
	return {type};
}
export const wordBoundary 		= boundary('wordbound');
export const nonWordBoundary 	= boundary('nowordbound');
export const startAnchor		= boundary('inputboundstart');
export const endAnchor 			= boundary('inputboundend');

interface reference {
	type: 'reference';
	value: number|string;
}
export function reference(value: number|string): reference {
	return {type: 'reference', value};
}

export function anchored(part: part): part {
	return [startAnchor, part, endAnchor];
}

interface unicode {
	type: 'unicode' | 'notunicode';
	property: string;
}

type _part = alternation | noncapture | capture | characterClass | unicode | quantified | boundary | reference;
type part = string | part[] | _part;

/*
function is0<T extends part0['type']>(part: part, type: T): part is Extract<part0, { type: T }> {
	return typeof part !== 'string' && !Array.isArray(part) && part.type === type;
}
*/
function type(part: part) {
	return typeof part === 'string'	? 'text'
			: Array.isArray(part)	? 'concat'
			: part.type;
}

function is<T extends _part['type']|'text'|'concat'>(part: part, istype: T): part is (T extends 'text' ? string : T extends 'concat' ? part[] : Extract<_part, { type: T }>) {
	return type(part) === istype;
	//return typeof part === 'string'	? type === 'text'
	//		: Array.isArray(part)	? type === 'concat'
	//		: part.type === type;
}

function typed(part: part): 
    | { type: 'text', part: string }
    | { type: 'concat', part: part[] }
    | _part
{
    return typeof part === 'string'	? { type: 'text', part }
    	: Array.isArray(part)		? { type: 'concat', part }
    	: part;
}

//-----------------------------------------------------------------------------
// Regex parsing
//-----------------------------------------------------------------------------

interface PendingGroup {
	type: 'group';
	group: capture | noncapture;
	tos: part[];
}

export function parse(re: string, unicode = true, extended = false): part {
	const stack:	(alternation | PendingGroup)[] = [];
	let curr:		part[] = [];

	let i = 0;

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

	function backslashed(): number | characterClass | unicode {
		const c = re[i++];
		switch (c) {
			default:	return c.charCodeAt(0);
			case 'd':	return digit;			//digit
			case 'D':	return digit.not();		//non-digit
			case 'w':	return word;			//word
			case 'W':	return word.not();		//non-word
			case 's':	return whitespace;		//whitespace
			case 'S':	return whitespace.not();//non-whitespace
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
				if (unicode && re[i] === '{') {
					i++; // skip '{'
					return parseInt(skipTo('}'), 16);
				}
				if (i + 4 > re.length)
					throw new Error('bad \\u escape');
				i += 4;
				return parseInt(re.substring(i - 4, i), 16);

			case 'p':
			case 'P':
			    if (!unicode || re[i] !== '{')
    				throw new Error('\\p and \\P can only be used with unicode enabled, and must be followed by {property}');
				i++; // skip '{'
				return {type: c === 'P' ? 'notunicode' : 'unicode', property: skipTo('}')};
		}
	}

	function character() {
		const code = unicode ? re.codePointAt(i++)! : re.charCodeAt(i++);
		if (code > 0xffff) {
			++i;
			return code;
		}
		return code === 92 ? backslashed() : code;
	}

	function addQuantified(min: number, max: number) {
		let mod: quantifiedMod = 'greedy';
		if (re[i] === '?') {
			mod = 'lazy';
			i++;
		} else if (extended && re[i] === '+') {
			mod = 'possessive';
			i++;
		}
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
				if (re[i] === 'b') {
					i++;
					curr.push(wordBoundary);
				} else if (re[i] === 'B') {
					i++;
					curr.push(nonWordBoundary);
				} else if (re[i] >= '1' && re[i] <= '9') {
					const n = int();
					curr.push({type: 'reference', value: n});
				} else if (re[i] === 'k' && re[i + 1] === '<') {
					i += 2;
					const name = skipTo('>');
					curr.push({type: 'reference', value: name});
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
				let		max = min;
				if (re[i] === ',') {
					++i; // skip ','
					max = re[i] !== '}' ? int() : -1;
				}
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
				if (re[i] === '?') {
					i++;
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
							if (re[i] === '=') {
								i++;
								group = noncapture(dummy, 'behind');
							} else if (re[i] === '!') {
								i++;
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
			case '[': {
				const neg = re[i] === '^';
				if (neg)
					i++;

				const cs = new characterClass(false);
				if (re[i] === ']' || re[i] === '-')
					cs.set(re.charCodeAt(i++));

				while (i < re.length && re[i] !== ']') {
					const from = character();
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
				curr.push(neg ? cs.selfNot() : cs);
				break;
			}
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
			const temp = neg ? part.not() : part.mutable();

			const has_w = temp.contains(word);
			if (has_w) {
				if (word.contains(temp))
					return '\\w';
				temp.selfIntersect(word.not());
			}

			const has_d = !has_w && temp.contains(digit);
			if (has_d) {
				if (digit.contains(temp))
					return '\\d';
				temp.selfIntersect(digit.not());
			}

			const has_s = temp.contains(whitespace);
			if (has_s) {
				if (!has_w && !has_d && whitespace.contains(temp))
					return '\\s';
				temp.selfIntersect(whitespace.not());
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
			let cs: MutablecharacterClass | undefined;
			for (const part of unique) {
				if (typeof part === 'string' && part.length === 1) {
					if (!cs)
						cs = new MutablecharacterClass(false);
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
				return String.fromCharCode(i);
		}
		return p;
	});
}

//-----------------------------------------------------------------------------
// Thompson NFA and Subset Construction to DFA
//-----------------------------------------------------------------------------

interface NFAState {
	id: number;
	transitions: Map<string, NFAState[]>;	// char -> states
	epsilonTransitions: NFAState[];			// ε-transitions
	isAccepting: boolean;
}

interface DFAState {
//	id: number;
	nfaStates: Set<number>;					// which NFA states this represents
	transitions: Map<string, DFAState>;		// char -> single DFA state
	isAccepting: boolean;
}

// Step 1: Build Thompson NFA from regex AST
function buildNFA(part: part): {start: NFAState, accept: NFAState} {
	let stateId = 0;

	function newState(): NFAState {
		return {id: stateId++, transitions: new Map(), epsilonTransitions: [], isAccepting: false};
	}

	function build(p: part): {start: NFAState, accept: NFAState} {
		if (typeof p === 'string') {
			/*
			// Character literal: start --'c'--> accept
			const start		= newState();
			const accept	= newState();
			start.transitions.set(p, [accept]);
			return {start, accept};
			*/
			// String literal: chain character transitions
			let accept = newState();
			const start = accept;
			
			for (const char of p) {
				const next = newState();
				accept.transitions.set(char, [next]);
				accept = next;
			}
			return { start, accept };
		}

		if (Array.isArray(p)) {
			const current = build(p[0]);
			for (let i = 1; i < p.length; i++) {
				const next = build(p[i]);
				current.accept.epsilonTransitions.push(next.start);
				current.accept = next.accept;
			}
			return current;
		}

		switch (p.type) {
			case 'alt': {
				// Alternation: start --ε--> frag1.start, frag2.start, ... --ε--> accept
				const start		= newState();
				const accept	= newState();
				for (const alt of p.parts) {
					const frag = build(alt);
					start.epsilonTransitions.push(frag.start);
					frag.accept.epsilonTransitions.push(accept);
				}
				return {start, accept};
			}

			case 'quantified': {
				const frag		= build(p.part);
				const start		= newState();
				const accept	= newState();

				// Handle min repetitions
				let current = start;
				for (let i = 0; i < p.min; i++) {
					const copy = build(p.part);
					current.epsilonTransitions.push(copy.start);
					current = copy.accept;
				}

				// Handle optional repetitions or infinite
				if (p.max === -1) {
					// Infinite: can loop back
					current.epsilonTransitions.push(frag.start);
					frag.accept.epsilonTransitions.push(frag.start, accept);
				} else {
					// Finite: add optional copies
					for (let i = p.min; i < p.max; i++) {
						current.epsilonTransitions.push(accept); // can skip
						const copy = build(p.part);
						current.epsilonTransitions.push(copy.start);
						current = copy.accept;
					}
				}
				current.epsilonTransitions.push(accept);
				return {start, accept};
			}

			case 'class': {
				// Character class: single transition with multiple chars
				const start		= newState();
				const accept	= newState();

				//if (p.contains(any))
				//	return '.';

				// Add transition for each character in the class
				for (let i = p.next(-1); i !== -1; i = p.next(i)) {
					const char = String.fromCodePoint(i);
					start.transitions.set(char, [accept]);
				}

				return {start, accept};
			}

			case 'wordbound':
			case 'nowordbound':
			case 'inputboundstart':
			case 'inputboundend': {
				// Anchors: epsilon transition with special handling
				const start		= newState();
				const accept	= newState();

				// Mark transition with anchor type for special processing
				start.transitions.set(`__${p.type}__`, [accept]);

				return {start, accept};
			}

			case 'noncapture':
			case 'capture':
				// Groups: just pass through (captures handled at higher level)
				return build(p.part);

			default:
				throw new Error(`Unsupported: ${p.type}`);
		}
	}

	const result = build(part);
	result.accept.isAccepting = true;
	return result;
}


// Step 3: Subset Construction - convert NFA to DFA
function NFAtoDFA(nfaStart: NFAState): DFAState {
	const nfa: NFAState[] = [];
	const alphabet	= new Set<string>();

	function collectStates(state: NFAState) {
		if (!nfa[state.id]) {
			nfa[state.id] = state;

			for (const char of state.transitions.keys())
				alphabet.add(char);
			for (const targets of state.transitions.values())
				targets.forEach(collectStates);
			state.epsilonTransitions.forEach(collectStates);
		}
	}

	collectStates(nfaStart);

	const dfaStates	= new Map<string, DFAState>();

	function stateSetKey(states: Set<number>): string {
		return [...states].sort().join(',');
	}

	// Epsilon closure - find all states reachable via ε-transitions
	function epsilonClosure(states: Set<number>): Set<number> {
		const closure = new Set(states);
		const stack = [...states];

		while (stack.length > 0) {
			const id = stack.pop()!;
			for (const next of nfa[id].epsilonTransitions) {
				if (!closure.has(next.id)) {
					closure.add(next.id);
					stack.push(next.id);
				}
			}
		}
		return closure;
	}

	function createDFAState(states: Set<number>): DFAState {
		const isAccepting = [...states].some(id => nfa[id]?.isAccepting);
		return {/*id: dfaStateId++, */nfaStates: states, transitions: new Map(), isAccepting};
	}

	// Start with epsilon closure of initial state
	const start			= new Set([nfaStart.id]);
	const startClosure	= epsilonClosure(start);
	const startDFA		= createDFAState(startClosure);
	dfaStates.set(stateSetKey(startClosure), startDFA);

	const worklist = [startDFA];

	while (worklist.length > 0) {
		const currentDFA = worklist.pop()!;

		// For each character in alphabet
		for (const char of alphabet) {
			// Collect all NFA states reachable by this character
			const next = new Set<number>();
			for (const id of currentDFA.nfaStates) {
				const targets	= nfa[id]?.transitions.get(char) || [];
				targets.forEach(target => next.add(target.id));
			}

			if (next.size > 0) {
				// Take epsilon closure of the result
				const nextClosure = epsilonClosure(next);

				// Check if this set of NFA states already has a corresponding DFA state
				const key = stateSetKey(nextClosure);
				let nextDFA = dfaStates.get(key);
				if (!nextDFA) {
					nextDFA = createDFAState(nextClosure);
					dfaStates.set(key, nextDFA);
					worklist.push(nextDFA);
				}
				currentDFA.transitions.set(char, nextDFA);
			}
		}
	}

	return startDFA;
}

export function regexToDFA(part: part): DFAState {
	const nfa = buildNFA(part);
	return NFAtoDFA(nfa.start);
}

export function runDFA(dfa: DFAState, str: string) {
	let currentState: DFAState|undefined = dfa;

	for (const char of str) {
		currentState = currentState.transitions.get(char);
		if (!currentState)
			return false;
	}
	return currentState.isAccepting;
}
