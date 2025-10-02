/* eslint-disable no-control-regex, no-misleading-character-class */
import { bits } from "@isopodlabs/utilities";

export interface options {
	i?: boolean;	// ignoreCase
	m?: boolean;	// multiLine
	s?: boolean;	// dotAll
	u?: boolean;	// unicode
	v?: boolean;	// unicodeSets
	x?: boolean;	// extended
	g?: boolean;	// global
};

const namedControls: Record<number, string> = {
	0:	'0',
	8:	'b',
	9:	't',
	10:	'n',
	11:	'v',
	12:	'f',
	13:	'r',
};

const invisibleChars = /[\u0000-\u001F\u007F-\u009F\u00A0\u1680\u2000-\u200F\u2028-\u202F\u205F-\u2064\u2066-\u206F\u3000\uFE00-\uFE0F\uFEFF]/g;

function controlCode(i: number): string {
	return '\\' + (i > 32
		? 'u' + i.toString(16).padStart(4, '0')
		: (namedControls[i] ?? 'c' + String.fromCharCode(i + 64))
	);
}

export function escapeText(s: string): string {
	return s.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&')
			.replace(invisibleChars, c => controlCode(c.charCodeAt(0)));
}

export class characterClass extends bits.SparseBits2 {
	type = 'class' as const;

	mutable(): MutableCharacterClass {
		return new MutableCharacterClass([], true).selfIntersect(this);
	}

	isNegated(): boolean {
		return !!this.undef;
	}

	testChar(c: string): boolean {
		const code = c?.codePointAt(0);
		return code !== undefined && this.test(code);
	}

	toString(): string {
		const neg = this.isNegated();
		let s = neg ? '^' : '';
		for (const range of this.ranges(!neg)) {
			const [c1, c2] = range;
			s += escapeText(String.fromCodePoint(c1));
			if (c1 !== c2 - 1)
				s += '-' + escapeText(String.fromCodePoint(c2 - 1));
		}
		return s;
	}
};

export class MutableCharacterClass extends characterClass {
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
    return new MutableCharacterClass().setRange(from.charCodeAt(0), to.charCodeAt(0) + 1);
}

export function chars(chars: string) {
	return new MutableCharacterClass().setString(chars);
}

export function union(...classes: characterClass[]) {
    return classes.reduce((result, c) => result.selfUnion(c), new MutableCharacterClass());
}

// Common character class constants and ranges
export const any		: characterClass = new characterClass([], true);
export const eol		: characterClass = chars('\n\r\u2028\u2029');
export const digit		: characterClass = range('0', '9');
export const lower		: characterClass = range('a', 'z');
export const upper		: characterClass = range('A', 'Z');
export const alpha		: characterClass = lower.union(upper);
export const alnum		: characterClass = alpha.union(digit);
export const word		: characterClass = alnum.union(chars('_'));
export const whitespace	: characterClass = chars(' \t\r\n\f\v');
export const hex		: characterClass = digit.union(chars('abcdefABCDEF'));
export const octal		: characterClass = range('0', '7');

export function text(c: string): string {
	return c;
}
export function concatenation(...parts: part[]): part[] | part {
	parts = parts.flat();
	return parts.length === 1 ? parts[0] : parts;
}

export interface alternation {
	type: 'alt';
	parts: part[];
}
export function alternation(...parts: part[]): alternation | part {
	return	parts.length === 1 ? parts[0]
		: 	parts.length === 2 && !parts[1] ? optional(parts[0])
		:	{type: 'alt', parts};
}

type noncaptureOptions = 'ahead' | 'behind' | 'neg_ahead' | 'neg_behind' | 'atomic' | {i?: boolean; m?: boolean; s?: boolean};
export interface noncapture {
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

export interface capture {
	type: 'capture';
	name?: string;
	part: part;
}
export function capture(part: part, name?: string): capture {
	return {type: 'capture', part, name};
}

export type quantifiedMod = 'greedy' | 'lazy' | 'possessive';
export interface quantified {
	type: 'quantified';
	part: part;
	min: number;
	max: number; // -1 = inf
	mod: quantifiedMod;
}
export function repeatFrom(part: part, min: number, max = -1, mod: quantifiedMod = 'greedy'): quantified {
	return {type: 'quantified', part, min, max, mod};
}
export function repeat(part: part, n: number, mod: quantifiedMod = 'greedy')	{ return repeatFrom(part, n, n, mod); }
export function zeroOrMore(part: part, mod: quantifiedMod = 'greedy')			{ return repeatFrom(part, 0, -1, mod); }
export function oneOrMore(part: part, mod: quantifiedMod = 'greedy')			{ return repeatFrom(part, 1, -1, mod); }
export function optional(part: part, mod: quantifiedMod = 'greedy')				{ return repeatFrom(part, 0, 1, mod); }

export interface boundary {
	type: 'wordbound' | 'nowordbound' | 'inputboundstart' | 'inputboundend';
}
export function boundary(type: boundary['type']): boundary {
	return {type};
}
export const wordBoundary 		= boundary('wordbound');
export const nonWordBoundary 	= boundary('nowordbound');
export const startAnchor		= boundary('inputboundstart');
export const endAnchor 			= boundary('inputboundend');

export interface reference {
	type: 'reference';
	value: number|string;
}
export function reference(value: number|string): reference {
	return {type: 'reference', value};
}

export function anchored(...parts: part[]): part {
	return [startAnchor, ...parts, endAnchor];
}

/*
export interface unicode {
	type: 'unicode' | 'notunicode';
	property: string;
}
*/
type _part = alternation | noncapture | capture | characterClass | quantified | boundary | reference;// | unicode;
export type part = string | part[] | _part;

/*
function is0<T extends part0['type']>(part: part, type: T): part is Extract<part0, { type: T }> {
	return typeof part !== 'string' && !Array.isArray(part) && part.type === type;
}
*/
export function type(part: part) {
	return typeof part === 'string'	? 'text'
			: Array.isArray(part)	? 'concat'
			: part.type;
}

export function is<T extends _part['type']|'text'|'concat'>(part: part, istype: T): part is (T extends 'text' ? string : T extends 'concat' ? part[] : Extract<_part, { type: T }>) {
	return type(part) === istype;
	//return typeof part === 'string'	? type === 'text'
	//		: Array.isArray(part)	? type === 'concat'
	//		: part.type === type;
}

export function typed(part: part):
    | { type: 'text', part: string }
    | { type: 'concat', parts: part[] }
    | _part
{
    return typeof part === 'string'	? { type: 'text', part }
    	: Array.isArray(part)		? { type: 'concat', parts: part }
    	: part;
}
