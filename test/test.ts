import * as regex from '../src/index';

export interface equal<T> {
	equal(b: T): boolean;
}

export function expect<T extends equal<T>>(v: T) {
	return {
		toEqual(v2: T) {
			if (!v.equal(v2))
				console.log("fail");
		}
	};
}

export function test(name: string, fn: ()=>void) {
	console.log("testing: " + name);
	fn();
	console.log("finished: " + name);
}

const p = regex.parse('\\p{AHex}+');
console.log(regex.toRegExpString(p));

const x = regex.parse('[a-z]+[^\\D]+');
//const x = regex.parse('.*[^\\D]+');

const dfa = regex.regexToDFA(x);
regex.runDFA(dfa, 'hello123world');

console.log(x);

const s = regex.toRegExpString(x);
console.log(s);

const x2 = regex.parse('this');//|that
console.log(regex.toRegExpString(x2));

const x3 = regex.parse('this(that|other)*end');
console.log(regex.toRegExpString(x3));

//const x4 = regexp.parse("[😀-😂]", false);
const x5 = regex.parse("[😀-😂]", true);
console.log(regex.toRegExpString(x5));

const t = regex.anchored(regex.capture([
	'test', x, x2,
	regex.parse('[A]'),
	x2, x3,
	regex.repeatFrom(regex.chars('abcd'), 1),
	'test2',
	regex.parse('cat|catch'),
	regex.parse('catch|cat'),
	regex.parse('a|b|c|hello|world|x|y|z'),
	regex.reference(1),
	regex.reference('name')
], 'name'));
console.log(regex.toRegExpString(t));

const t2 = regex.optimize(t);
console.log(regex.toRegExpString(t2));
