import * as regex from '../src/index';

export interface equal<T> {
	equal(b: T): boolean;
}

export function expect<T extends equal<T>>(v: T) {
	return {
		toEqual(v2: T) {
			if (!v.equal(v2))
				console.log('fail');
		}
	};
}

export function test(name: string, fn: () => void) {
	console.log('testing: ' + name);
	fn();
	console.log('finished: ' + name);
}

// Email validation with backreferences and lookarounds
const emailPattern = `^(?=.{1,64}@.{1,255}$)([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+)\\.([a-zA-Z]{2,})(?<!\\.)$`;
const emailPatternX = `^(?=.{1,4}@.{1,4}$)([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+)\\.([a-zA-Z]{2,})(?<!\\.)$`;

// Test cases:
const validEmails = ['user@example.com', 'test.email@domain.org', 'user123@sub.domain.co.uk'];

const invalidEmails = [
	'user@.com',	 // starts with dot
	'user@domain.',	 // ends with dot
	'user@domain.c', // TLD too short
	'@domain.com',	 // missing username
	'user@',		 // missing domain
];

// Complex pattern with captures, quantifiers, alternation, and boundaries
const complexPattern = `^(?i:hello|hi)\\s+(\\w+)(?=\\s+world)\\s+world\\b(?<!bad world)$`;

// Test cases:
const testStrings = [
	'Hello john world',	   // should match (case insensitive)
	'hi mary world',	   // should match
	'hello bob bad world', // should NOT match (negative lookbehind)
	'hey alice world',	   // should NOT match (wrong greeting)
];

// Backreference pattern
const duplicatePattern = `^(\\w+)\\s+\\1$`;

// Test cases:
const duplicateTests = [
	'hello hello', // should match
	'test test',   // should match
	'hello world', // should NOT match
];

// Multiline pattern with anchors
const multilinePattern = `^line\\d+$`;

// Test with multiline flag:
const multilineText = `line1
line2
line3`;

/*
const ab = ['a', 'aa', 'aaa', 'b', 'ab', 'aab', 'aaaab'];

const greedyRegex = regex.NFA.fromString('a+a', {u: true, x: true});
for (const str of ab) {
	const caps = greedyRegex.run(str);
	if (caps)
		console.log(`Matched: ${str} -> ${str.slice(0, caps[0][1])}`);
}
const lazyRegex = regex.NFA.fromString('a+?a', {u: true, x: true});
for (const str of ab) {
	const caps = lazyRegex.run(str);
	if (caps)
		console.log(`Matched: ${str} -> ${str.slice(0, caps[0][1])}`);
}
*/

const aaTest = regex.NFA.fromString('aa', {i: true});
const emailTest = regex.NFA.fromString('.{1,4}@.{1,4}', {i: true});
const emailRegex = regex.NFA.fromString(emailPattern, {i: true});
for (const email of validEmails) {
	const m = emailRegex.run(email);
	if (!m) {
		console.log(`Failed to match valid email: ${email}`);
	}
}
for (const email of invalidEmails) {
	if (emailRegex.run(email)) {
		console.log(`Incorrectly matched invalid email: ${email}`);
	}
}