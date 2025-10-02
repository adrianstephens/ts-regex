import * as regex from '../src/index';
import { getName, getCode } from "../src/unicode-data-helpers";
import { prefixes } from "../src/unicode-data";

export interface Equal<T> {
	equal(other: T): boolean;
}

// Union type: either a primitive or an object with Equal
type Testable<T> = T extends (string | number | boolean | null | undefined) 
	? T 
	: T & Equal<T>;

export function expect<T>(v: Testable<T>, description?: string) {
	return {
		toEqual(v2: Testable<T>) {
			const success = typeof v === 'object' && v ? v.equal(v2) : v === v2;
			console.log(`${success ? '✓' : '✗'}: ${description ? description + ' ' : ''}${v} === ${v2}`);
			//if (!success)
			//	console.log(`fail: expected ${v2}, got ${v}`);
		}
	};
}

export function test(name: string, fn: () => void) {
	console.log('---------------------');
	console.log('testing: ' + name);
	fn();
	console.log('finished: ' + name);
}

function testRegex(name: string, pattern: string, valid: string[], invalid: string[] = []) {
	return test(name, () => {
		const re = regex.NFA.fromString(pattern, {i: true});

		// Test valid strings
		for (const str of valid)
			expect(!!re.run(str), str).toEqual(true);

		// Test invalid strings
		for (const str of invalid)
			expect(!re.run(str), str).toEqual(true);
	});
}


testRegex('Email validation with backreferences and lookarounds', `^(?=.{1,64}@.{1,255}$)([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+)\\.([a-zA-Z]{2,})(?<!\\.)$`, [
	'user@example.com',
	'test.email@domain.org',
	'user123@sub.domain.co.uk'
], [
	'user@.com',	 // starts with dot
	'user@domain.',	 // ends with dot
	'user@domain.c', // TLD too short
	'@domain.com',	 // missing username
	'user@',		 // missing domain
]);

testRegex('Complex pattern with captures, quantifiers, alternation, and boundaries', `^(?i:hello|hi)\\s+(\\w+)(?=\\s+world)\\s+world\\b(?<!bad world)$`, [
	'Hello john world',	   // should match (case insensitive)
	'hi mary world',	   // should match
], [
	'hello bob bad world', // should NOT match (negative lookbehind)
	'hey alice world',	   // should NOT match (wrong greeting)
]);

testRegex('Backreference pattern', `^(\\w+)\\s+\\1$`, [
	'hello hello', // should match
	'test test',   // should match
], [
	'hello world', // should NOT match
]);

testRegex('Multiline pattern with anchors', `^line\\d+$`, [
`line1
line2
line3`
]);

console.log(regex.toRegExpString(regex.parse('[\\p{Basic_Emoji}]')));
console.log(regex.toRegExpString(regex.parse('[\\p{Name=LATIN CAPITAL LETTER A}]')));
console.log(regex.toRegExpString(regex.parse('[\\p{Numeric_Value=1/4}]')));

// Unicode test table - code points to test name lookup
const nameTests: [number, string][] = [
	[19968, 'CJK UNIFIED IDEOGRAPH-4E00'],

	// Basic Latin Characters
	[65,    'LATIN CAPITAL LETTER A'],
	[97,    'LATIN SMALL LETTER A'],
	[48,    'DIGIT ZERO'],
	
	// Extended Latin
	[192,   'LATIN CAPITAL LETTER A WITH GRAVE'],
	[231,   'LATIN SMALL LETTER C WITH CEDILLA'],
	[241,   'LATIN SMALL LETTER N WITH TILDE'],
	
	// Greek Script  
	[913,   'GREEK CAPITAL LETTER ALPHA'],
	[945,   'GREEK SMALL LETTER ALPHA'],
	[960,   'GREEK SMALL LETTER PI'],
	
	// Cyrillic Script
	[1040,  'CYRILLIC CAPITAL LETTER A'],
	[1072,  'CYRILLIC SMALL LETTER A'], 
	[1041,  'CYRILLIC CAPITAL LETTER BE'],
	
	// Arabic Script
	[1575,  'ARABIC LETTER ALEF'],
	[1576,  'ARABIC LETTER BEH'],
	[1601,  'ARABIC LETTER FEH'],
	
	// CJK Characters
	[19968, 'CJK UNIFIED IDEOGRAPH-4E00'],
	[26085, 'CJK UNIFIED IDEOGRAPH-65E5'], 
	[12354, 'HIRAGANA LETTER A'],
	[12450, 'KATAKANA LETTER A'],
	
	// Symbols & Special Characters
	[8364,  'EURO SIGN'],
	[9733,  'BLACK STAR'],
	[65039, 'VARIATION SELECTOR-16'],
	[128512,'GRINNING FACE'],
	
	// Mathematical Symbols
	[8734,  'INFINITY'],
	[8721,  'N-ARY SUMMATION'],
	[8747,  'INTEGRAL'],
	
	// Combining Characters
	[768,   'COMBINING GRAVE ACCENT'],
	[769,   'COMBINING ACUTE ACCENT'],
	[776,   'COMBINING DIAERESIS'],
];

// Test the name lookup
test('Unicode Code->Name Lookup Tests', () => {
	for (const [codePoint, expectedName] of nameTests)
		expect(getName(codePoint, prefixes), `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')} '${String.fromCodePoint(codePoint)}'`).toEqual(expectedName);
});

test('Unicode Name->Code Lookup Tests', () => {
	for (const [codePoint, name] of nameTests)
		expect(getCode(name, prefixes), `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')} '${String.fromCodePoint(codePoint)}'`).toEqual(codePoint);
});
