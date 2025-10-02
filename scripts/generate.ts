import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import * as bits from '../node_modules/@isopodlabs/utilities/dist/bits';
import { stdout } from 'process';

/*
Non-binary Unicode property aliases and their canonical property names
-------------------------------------------------------------------------------
General_Category	gc
Script				sc
Script_Extensions	scx

Binary Unicode property aliases and their canonical property names
-------------------------------------------------------------------------------
ASCII
ASCII_Hex_Digit					AHex
Alphabetic						Alpha
Any
Assigned
Bidi_Control					Bidi_C
Bidi_Mirrored					Bidi_M
Case_Ignorable					CI
Cased
Changes_When_Casefolded			CWCF
Changes_When_Casemapped			CWCM
Changes_When_Lowercased			CWL
Changes_When_NFKC_Casefolded	CWKCF
Changes_When_Titlecased			CWT
Changes_When_Uppercased			CWU
Dash
Default_Ignorable_Code_Point	DI
Deprecated						Dep
Diacritic						Dia
Emoji
Emoji_Component					EComp
Emoji_Modifier					EMod
Emoji_Modifier_Base				EBase
Emoji_Presentation				EPres
Extended_Pictographic			ExtPict
Extender						Ext
Grapheme_Base					Gr_Base
Grapheme_Extend					Gr_Ext
Hex_Digit						Hex
IDS_Binary_Operator				IDSB
IDS_Trinary_Operator			IDST
ID_Continue						IDC
ID_Start						IDS
Ideographic						Ideo
Join_Control					Join_C
Logical_Order_Exception			LOE
Lowercase						Lower
Math
Noncharacter_Code_Point			NChar
Pattern_Syntax					Pat_Syn
Pattern_White_Space				Pat_WS
Quotation_Mark					QMark
Radical
Regional_Indicator				RI
Sentence_Terminal				STerm
Soft_Dotted						SD
Terminal_Punctuation			Term
Unified_Ideograph				UIdeo
Uppercase						Upper
Variation_Selector				VS
White_Space						space
XID_Continue					XIDC
XID_Start						XIDS

Binary Unicode properties of strings
-------------------------------------------------------------------------------
Basic_Emoji
Emoji_Keycap_Sequence
RGI_Emoji_Modifier_Sequence
RGI_Emoji_Flag_Sequence
RGI_Emoji_Tag_Sequence
RGI_Emoji_ZWJ_Sequence
RGI_Emoji
*/

const supported = new Set([
	'ASCII', 'ASCII_Hex_Digit', 'Alphabetic', 'Any', 'Assigned',
	'Bidi_Control', 'Bidi_Mirrored', 'Case_Ignorable', 'Cased',
	'Changes_When_Casefolded', 'Changes_When_Casemapped', 'Changes_When_Lowercased',
	'Changes_When_NFKC_Casefolded', 'Changes_When_Titlecased', 'Changes_When_Uppercased',
	'Dash', 'Default_Ignorable_Code_Point', 'Deprecated', 'Diacritic',
	'Emoji', 'Emoji_Component', 'Emoji_Modifier', 'Emoji_Modifier_Base',
	'Emoji_Presentation', 'Extended_Pictographic', 'Extender',
	'Grapheme_Base', 'Grapheme_Extend', 'Hex_Digit',
	'IDS_Binary_Operator', 'IDS_Trinary_Operator', 'ID_Continue', 'ID_Start',
	'Ideographic', 'Join_Control', 'Logical_Order_Exception', 'Lowercase',
	'Math', 'Noncharacter_Code_Point', 'Pattern_Syntax', 'Pattern_White_Space',
	'Quotation_Mark', 'Radical', 'Regional_Indicator', 'Sentence_Terminal',
	'Soft_Dotted', 'Terminal_Punctuation', 'Unified_Ideograph', 'Uppercase',
	'Variation_Selector', 'White_Space', 'XID_Continue', 'XID_Start',
]);

const propAliases = {
	AHex:	'ASCII_Hex_Digit',
	Alpha:	'Alphabetic',
	Bidi_C:	'Bidi_Control',
	Bidi_M:	'Bidi_Mirrored',
	CI:		'Case_Ignorable',
	CWCF:	'Changes_When_Casefolded',
	CWCM:	'Changes_When_Casemapped',
	CWL:	'Changes_When_Lowercased',
	CWKCF:	'Changes_When_NFKC_Casefolded',
	CWT:	'Changes_When_Titlecased',
	CWU:	'Changes_When_Uppercased',
	DI:		'Default_Ignorable_Code_Point',
	Dep:	'Deprecated',
	Dia:	'Diacritic',
	EComp:	'Emoji_Component',
	EMod:	'Emoji_Modifier',
	EBase:	'Emoji_Modifier_Base',
	EPres:	'Emoji_Presentation',
	ExtPict:'Extended_Pictographic',
	Ext:	'Extender',
	Gr_Base:'Grapheme_Base',
	Gr_Ext:	'Grapheme_Extend',
	Hex:	'Hex_Digit',
	IDSB:	'IDS_Binary_Operator',
	IDST:	'IDS_Trinary_Operator',
	IDC:	'ID_Continue',
	IDS:	'ID_Start',
	Ideo:	'Ideographic',
	Join_C:	'Join_Control',
	LOE:	'Logical_Order_Exception',
	Lower:	'Lowercase',
	NChar:	'Noncharacter_Code_Point',
	Pat_Syn:'Pattern_Syntax',
	Pat_WS:	'Pattern_White_Space',
	QMark:	'Quotation_Mark',
	RI:		'Regional_Indicator',
	STerm:	'Sentence_Terminal',
	SD:		'Soft_Dotted',
	Term:	'Terminal_Punctuation',
	UIdeo:	'Unified_Ideograph',
	Upper:	'Uppercase',
	VS:		'Variation_Selector',
	space:	'White_Space',
	XIDC:	'XID_Continue',
	XIDS:	'XID_Start',
	Letter:	'L',
	Mark: 'M',           // All marks (Mn + Mc + Me)
	Number: 'N',         // All numbers (Nd + Nl + No) 
	Punctuation: 'P',    // All punctuation (Pc + Pd + Pe + Pf + Pi + Po + Ps)
	Symbol: 'S',         // All symbols (Sc + Sk + Sm + So)
	Separator: 'Z',      // All separators (Zl + Zp + Zs)
	Other: 'C',          // All other/control (Cc + Cf + Cn + Co + Cs)
};

const enumAliases = {
	gc:		'General_Category',
	sc:		'Script',
	scx:	'Script_Extensions'
};

const unicodeFields = [
	'Code_Value',
	'Name', 
	'General_Category',
	'Canonical_Combining_Class',
	'Bidi_Class',
	'Decomposition_Type_Mapping',
	'Numeric_Type_Decimal',
	'Numeric_Type_Digit', 
	'Numeric_Type_Numeric',
	'Bidi_Mirrored',
	'Unicode_1_Name',
	'ISO_Comment',
	'Simple_Uppercase_Mapping',
	'Simple_Lowercase_Mapping',
	'Simple_Titlecase_Mapping'
] as const;

type UnicodeChar = {
	[K in (typeof unicodeFields)[number]]?: string;
};

//-----------------------------------------------------------------------------
// download
//-----------------------------------------------------------------------------

function downloadString(url: string): Promise<string> {
	const file = path.join(__dirname, path.basename(url));
	if (fs.existsSync(file))
		return fs.promises.readFile(file, 'utf-8');

	const p = new Promise<string>((resolve, reject) => {
		https.get(url, response => {
			let data = '';
			response.on('data', chunk => data += chunk);
			response.on('end', () => resolve(data));
		})
		.on('error', reject);
	});
	p.then(data => fs.writeFileSync(file, data));
	return p;
}

function makeBitset(data: number[]) {
	const r = new bits.SparseBits2();
	for (const i of data)
		r.set(i);
	return r;
}

async function rawTable(url: string) {
	const data	= await downloadString(url);
	return data.split('\n').map(line => line.split('#')[0]).filter(Boolean).map(line => line.split(';').map(s => s.trim()));
}

async function getTable(url: string) {
	const data = await rawTable(url);
	const table: Record<string, bits.SparseBits2> = {};
	const re	= /^(\w+)(?:..(\w+))?/;

	data.forEach(([code, value]) => {
		const entry = (table[value] ??= new bits.SparseBits2());
		const m = re.exec(code);
		if (m) {
			const start = parseInt(m[1], 16);
			if (m[2]) {
				const end = parseInt(m[2], 16);
				for (let i = start; i <= end; i++)
					entry.set(i);
			} else {
				entry.set(start);
			}
		}
	});

	/*
	const data	= await downloadString(url);
	const re	= /^(\w+)(?:..(\w+))?\s*;\s*(\w+)/;
	const table: Record<string, bits.SparseBits2> = {};

	data.split('\n').forEach(line => {
		if (!line || line.startsWith('#'))
			return;

		const m = re.exec(line);
		if (m) {
			const entry = (table[m[3]] ??= new bits.SparseBits2());
			const start = parseInt(m[1], 16);
			if (m[2]) {
				const end = parseInt(m[2], 16);
				for (let i = start; i <= end; i++)
					entry.set(i);
			} else {
				entry.set(start);
			}
		}
	});
	*/
	return table;
}

async function getTableMulti(url: string) {
	const data = await rawTable(url);
	const table: Record<string, bits.SparseBits2> = {};
	const re	= /^(\w+)(?:..(\w+))?/;

	data.forEach(([code, value]) => {
		const entries = value.split(' ').map(v => (table[v] ??= new bits.SparseBits2()));
		const m = re.exec(code);
		if (m) {
			const start = parseInt(m[1], 16);
			if (m[2]) {
				const end = parseInt(m[2], 16);
				for (let i = start; i <= end; i++)
					entries.forEach(entry => entry.set(i));
			} else {
				entries.forEach(entry => entry.set(start));
			}
		}
	});

	return table;
}
//-----------------------------------------------------------------------------
// Emoji Sequences
//-----------------------------------------------------------------------------

class TreeNode extends Map<number, TreeNode> {
	private _hash?: string;

	add(sequence: number[]) {
		let node = this as TreeNode;
		for (const c of sequence) {
			let child = node.get(c);
			if (!child) {
				child = new TreeNode();
				node.set(c, child);
			}
			node = child;
		}
		this._hash = undefined; // invalidate hash
	}

	get hash(): string {
		if (!this._hash) {
			const entries = [...this.entries()].sort(([a], [b]) => a - b);
			this._hash = entries.map(([k, v]) => `${k}:${v?.hash || ''}`).join(',');
		}
		return this._hash;
	}

	get totalNodes(): number {
		let count = 1;
		for (const child of this.values()) {
			if (child)
				count += child.totalNodes;
		}
		return count;
	}

	static deduplicate(root: TreeNode): Map<string, TreeNode> {
		const unique = new Map<string, TreeNode>();
		const visit = (node: TreeNode) => {
			for (const child of node.values()) {
				if (child)
					visit(child);
			}
			const existing = unique.get(node.hash);
			if (existing) {
				// Replace references to this node with existing
				for (const [k, v] of node.entries()) {
					if (v === node)
						node.set(k, existing);
				}
			} else {
				unique.set(node.hash, node);
			}
		};
		visit(root);
		return unique;
	}
}

interface BitsetNode<T> {
	bits: bits.SparseBits2;
	value: T;
}

class BitsetMap<T> {
	constructor(public entries: BitsetNode<T>[]) {
	}

	get(key: number): T | undefined {
		for (const entry of this.entries) {
			if (entry.bits.test(key))
				return entry.value;
		}
	}
}

async function getEmojiTable(url: string) {
	const data = await downloadString(url);

	const re = /^(\w+)(?:\.\.(\w+))?((?:\s+\w+)*)\s*;\s*(\w+)/;
	const table: Record<string, TreeNode> = {};

	data.split('\n').forEach(line => {
		if (!line || line.startsWith('#'))
			return;

		const m = re.exec(line);
		if (m) {
			const entry = (table[m[4]] ??= new TreeNode());
			const start = parseInt(m[1], 16);
			if (m[3]) {
				entry.add([start, ...m[3].trim().split(' ').map(s => parseInt(s, 16))]);
			} else if (m[2]) {
				const end = parseInt(m[2], 16);
				for (let i = start; i <= end; i++)
					entry.add([i]);
			} else {
				entry.add([start]);
			}
		}
	});

	return table;
}

//-----------------------------------------------------------------------------
// Derived
//-----------------------------------------------------------------------------

interface DerivedSet {
	bases: Set<string>;
	extra: bits.SparseBits2;
}

function findOptimalSubsets(sets: Record<string, bits.SparseBits2>) {
	const names = Object.keys(sets);
	
	// Pre-compute all subset relationships O(n²) once
	const remaining = new Map<string, Set<string>>();
	for (const i of names) {
		const containedBy = new Set<string>();
		for (const j of names) {
			if (i !== j && sets[j].contains(sets[i]))
				containedBy.add(j);
		}
		remaining.set(i, containedBy);
	}

	const basesPerSet: Record<string, Set<string>> = {};

	while (remaining.size > 0) {
		let bestSet = '';
		let maxCoverage = 0;

		// Find small sets that appear in many larger sets
		remaining.forEach((containedBy, name) => {
			const coverage = containedBy.size;
			if (coverage > maxCoverage) {
				maxCoverage = coverage;
				bestSet = name;
			}
		});

		if (maxCoverage === 0)			// No more subsets, pick largest remaining set
			break;


		for (const containedBy of remaining.get(bestSet)!) {
			(basesPerSet[containedBy] ??= new Set()).add(bestSet);
		}
/*
		const baseSet = sets[bestSet];
		for (const name of remaining.keys()) {
			//const derived = expressions[name] ??= { bases: new Set<string>(), extra: new bits.SparseBits2() };
			if (name !== bestSet && sets[name].contains(baseSet))
				(basesPerSet[name] ??= new Set()).add(bestSet);
		}
*/
		remaining.delete(bestSet);

		// Update subset cache when removing sets
		for (const [_, containedBy] of remaining) {
			containedBy.delete(bestSet);
		}
	}

	return Object.fromEntries(names.map(name => {
		const set	= sets[name];
		const extra = bits.SparseBits2.fromEntries(set.entries());
		const bases = basesPerSet[name];
		if (bases) {
			for (const i of bases) {
				if (basesPerSet[i])
					basesPerSet[i].forEach(base => bases.delete(base));
				extra.selfIntersect(sets[i].complement());
			}
		}
		extra.clean();
		return [name, { bases, extra }];
	}));
}

//-----------------------------------------------------------------------------
// Names
//-----------------------------------------------------------------------------

type trieNode = bits.SparseBits2 & {children?: bitTrie};
type bitTrie = Record<string, trieNode>;

function trimTrie(trie: bitTrie) {
	for (const [key, value] of Object.entries(trie)) {
		if (value.children) {
			trimTrie(value.children);
			if (Object.keys(value.children).length === 1 && value.equals(Object.values(value.children)[0])) {
				const key2 = Object.keys(value.children)[0];
				trie[key2] = Object.values(value.children)[0];
				delete trie[key];
			}
		}
	}
}

function makeBitTrie(bits: bits.SparseBits2, split: (key: string, set: bits.SparseBits2) => bitTrie) {
	function recurse(sets: bitTrie) {
		for (const [key, value] of Object.entries(sets)) {
			const children = split(key, value);
			if (Object.keys(children).length) {
				value.children = children;
				recurse(children);
			}
		}
	}

	const trie: bitTrie = {'': bits};
	recurse(trie);
	return trie;
}

function addTrieNode(tree: bitTrie, name: string, set: bits.SparseBits2): trieNode | undefined {
	let node: trieNode | undefined = tree[''];
	for (;;) {
		node.selfUnion(set);
		if (node.children) {
			const key: string|undefined = Object.keys(node.children).find(k => name.startsWith(k));
			if (key) {
				node = node.children[key];
				//offset += key.length + (key.endsWith('-') ? 0 : 1);
				continue;
			}

		}
		node.children ??= {};
		node.children[name] = set;
		return node;
	}
}


function trieToString(names: string[], node: trieNode, len = 0, depth = 0): string {
	const children = node.children;
	const used = bits.SparseBits2.fromEntries(node.entries());

	let result = `set: ${bitsetToString2(node)}`;

	if (children) {
		result += ", children: {\n" + Object.keys(children).map(i =>
			`${indent(depth + 1)}"${len === 0 || i[len-1] === ' ' ? i.slice(len) : i.slice(len - 1)}": {${trieToString(names, children[i], i.endsWith('-') ? i.length : i.length + 1, depth + 1)}}`
		).join(',\n') + `\n${indent(depth)}}`;

		for (const c of Object.values(children))
			used.selfIntersect(c.complement());
	}

	if (used.next(-1) >= 0) {
		const chars =	 Array.from(used.where(true), i => (names[i] ?? '').slice(len));
		if (chars.some(Boolean) || chars.length === 1)
			result += ", chars: [" + chars.map(i => `"${i}"`).join(',') + ']';
	}

	return result;
}

//-----------------------------------------------------------------------------
// Output
//-----------------------------------------------------------------------------

function symbol(name: string) {
	if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name))
		return name;
	return JSON.stringify(name);
}

function bitsetToString(set: bits.SparseBits2) {
	return '{' + set.entries().map(([i, v]) => `${i}:0x${(v + 0x200000000).toString(16).slice(-8)}`).join(',') + '}';
}
function rangesToString(ranges: number[][]) {
	return 'ranges(' + ranges.map(([start, end]) =>`[${start},${end}]`).join(',') + ')';
}

function derivedToString(name: string, set: DerivedSet) {
	const ranges = [...set.extra.ranges()];//.map(([start, end]) => ({ start, end }));
	const use_ranges = (ranges.length < set.extra.keys().length);

	const bitsetString = use_ranges
		? rangesToString(ranges)
		: bitsetToString(set.extra);

	if (use_ranges || (set.bases?.size))
		return `get ${symbol(name)}() { return derived(this,"${name}",${bitsetString},${set.bases ? Array.from(set.bases).map(i => `"${i}"`).join(',') : ''}); }`;

	return symbol(name) + ': ' + bitsetString;
}

function bitsetToString2(set: bits.SparseBits2) {
	const ranges = [...set.ranges()];//.map(([start, end]) => ({ start, end }));
	return ranges.length < set.keys().length
		? rangesToString(ranges)
		: bitsetToString(set);
}

function indent(depth: number) {
	return '\t'.repeat(depth);
}

function aliasesToString(aliases: Record<string, string>, objName: string) {
	return `aliases(${objName}, {\n${
		Object.entries(aliases).map(([alias, name]) => `\t${alias}:\t"${name}"`).join(',\n')
	}\n});\n\n`;
}

function totalSize(sets: bits.SparseBits2[]) {
	return sets.reduce((a, b) => a + b.keys().length, 0);
}

//-----------------------------------------------------------------------------
// Main
//-----------------------------------------------------------------------------
//	ArabicShaping.txt
//	BidiBrackets.txt
//	BidiCharacterTest.txt
//	BidiMirroring.txt
//	BidiTest.txt
//x	Blocks.txt
//	CJKRadicals.txt
//	CaseFolding.txt
//	CompositionExclusions.txt
//	DerivedAge.txt
//x	DerivedCoreProperties.txt
//x	DerivedNormalizationProps.txt
//x	EastAsianWidth.txt
//	EmojiSources.txt
//	EquivalentUnifiedIdeograph.txt
//	HangulSyllableType.txt
//	Index.txt
//	IndicPositionalCategory.txt
//	IndicSyllabicCategory.txt
//	Jamo.txt
//	LineBreak.txt
//	NameAliases.txt
//	NamedSequences.txt
//	NamedSequencesProv.txt
//	NamesList.html
//	NamesList.txt
//	NormalizationCorrections.txt
//	NormalizationTest.txt
//	NushuSources.txt
//x	PropList.txt
//	PropertyAliases.txt
//	PropertyValueAliases.txt
//x	ScriptExtensions.txt
//x	Scripts.txt
//	SpecialCasing.txt
//	StandardizedVariants.txt
//	TangutSources.txt
//	USourceData.txt
//x	UnicodeData.txt
//	VerticalOrientation.txt
async function run(exportNames: boolean, exportSequences: boolean) {
	const unicodeData = await rawTable('https://unicode.org/Public/14.0.0/ucd/UnicodeData.txt');

	const unicode: UnicodeChar[] = [];
	unicodeData.forEach(row => {
		const char: UnicodeChar = {};
		for (let i = 0; i < unicodeFields.length; i++)
			char[unicodeFields[i]] = row[i];
		const index = parseInt(char.Code_Value!, 16);
		unicode[index] = char;
	});

	function valuesBy(key: keyof UnicodeChar): Record<string, bits.SparseBits2> {
		return unicode.reduce((acc, item, index) => {
			const value = item[key];
			if (value) {
				(acc[value] ??= new bits.SparseBits2()).set(index);
			}
			return acc;
		}, {} as Record<string, bits.SparseBits2>);
	}

	function binaryBy(key: keyof UnicodeChar): bits.SparseBits2 {
		return makeBitset(unicode.map((char, i) => char[key] === 'Y' ? i : -1).filter(i => i >= 0));
	}

	// Merge all property sources
	const props = {
		...await getTable('https://unicode.org/Public/14.0.0/ucd/PropList.txt'),
		...await getTable('https://unicode.org/Public/14.0.0/ucd/DerivedCoreProperties.txt'),
		...await getTable('https://unicode.org/Public/14.0.0/ucd/DerivedNormalizationProps.txt'),
		...await getTable('https://unicode.org/Public/14.0.0/ucd/emoji/emoji-data.txt'),
	};

	const sharedProps = {
		General_Category:	valuesBy('General_Category'),
		Script:				await getTable('https://unicode.org/Public/14.0.0/ucd/Scripts.txt'),
	};

	const enumProps = {
		Canonical_Combining_Class: 	valuesBy('Canonical_Combining_Class'),
		Bidi_Class: 				valuesBy('Bidi_Class'),
		Numeric_Type: 		unicode.reduce((acc, item, index) => {
			const value = !item.Numeric_Type_Numeric ? undefined : !item.Numeric_Type_Digit ? 'Numeric' : !item.Numeric_Type_Decimal ? 'Digit' : 'Decimal';
			if (value)
				(acc[value] ??= new bits.SparseBits2()).set(index);
			return acc;
		}, {} as Record<string, bits.SparseBits2>),

		Numeric_Value: 		unicode.reduce((acc, item, index) => {
			const value = item.Numeric_Type_Decimal || item.Numeric_Type_Digit || item.Numeric_Type_Numeric;
			if (value)
				(acc[value] ??= new bits.SparseBits2()).set(index);
			return acc;
		}, {} as Record<string, bits.SparseBits2>),


		Script_Extensions:	await getTableMulti('https://unicode.org/Public/14.0.0/ucd/ScriptExtensions.txt'),
		Block:				await getTable('https://unicode.org/Public/14.0.0/ucd/Blocks.txt'),
		Line_Break:			await getTable('https://unicode.org/Public/14.0.0/ucd/LineBreak.txt'),
		East_Asian_Width:	await getTable('https://unicode.org/Public/14.0.0/ucd/EastAsianWidth.txt'),
		Age:				await getTable('https://unicode.org/Public/14.0.0/ucd/DerivedAge.txt'),
	};	
	
	const binaryProps = {...Object.fromEntries(Object.entries(props).filter(i => supported.has(i[0]))),
		ASCII:			new bits.SparseBits2().setRange(0, 128),
		Any:			new bits.SparseBits2().setRange(0, 0x110000),
		Assigned:		makeBitset(unicode.map((_, i) => i).filter(i => unicode[i])),//lazyUnion('Any'),
		Bidi_Mirrored:	binaryBy('Bidi_Mirrored'),
	};
	
	// Composite Categories, e.g. C = Cf + Cn + Co + Cs
	const gc = sharedProps.General_Category;
	for (const [k, v] of Object.entries(gc)) {
		if (k.length === 2)
			(gc[k[0]] ??= new bits.SparseBits2()).selfUnion(v);
	}

	const allSets = {
		...binaryProps,
		//...Object.assign({}, ...Object.values(enumProps)),
	};

	for (const i of Object.values(sharedProps)) {
		for (const k of Object.keys(i)) {
			if (k in allSets)
				console.log('Duplicate property name: ' + k);
			(allSets as any)[k] = i[k];
		}
	}
/*
	const allSets = {
		...binaryProps,
		...Object.assign({}, ...Object.values(enumProps)),
	};
*/
	console.log(`Total bitsets size: ${totalSize(Object.values(allSets))} entries`);
	const optSets = findOptimalSubsets(allSets);
	console.log(`Total bitsets size: ${totalSize(Object.values(optSets).map(set => set.extra))} entries`);

	const sortedProps = Object.fromEntries(Object.entries(optSets).sort((a, b) => a[0] < b[0] ? -1 : a[0] === b[0] ? 0 : 1));

	const imports = ['bitset', 'ranges', 'derived', 'ref', 'aliases'];

	if (exportNames)
		imports.push('prefixtree', 'getNames');

	if (exportSequences)
		imports.push('sequencenode', 'makeTrees');

	let result =
`// This file is generated by scripts/generate.ts
import {${imports.join(', ')}} from './unicode-data-helpers';

`
// output property bitsets
	+	'export const props: Record<string, bitset> = {\n'
	+	Object.entries(sortedProps).map(([k, v]) => `\t${derivedToString(k, v)}`).join(',\n')
	+	'\n};\n\n'
	+	aliasesToString(propAliases, 'props')

// output enum properties
	+	'export const enumProps: Record<string, Record<string, bitset>> = {\n'
	+	Object.entries(sharedProps).map(([key, value]) => `\t${key}: ref(props, ${
			Object.keys(value).map(k => `"${k}"`).join(', ')
		})`).join(',\n')
	+	Object.entries(enumProps).map(([key, value]) => `,\n\t${key}: {\n${
			Object.entries(value).map(([key, set]) => `\t\t${symbol(key)}: ${
				bitsetToString2(set)
			}`).join(',\n')
		}\n\t}`).join('')
	+	`,\n\tget Name() { return getNames(prefixes); }`
	+	'\n};\n\n'
	+	aliasesToString(enumAliases, 'enumProps');

// output name trie

	if (exportNames) {
		const names			= unicode.map(i => i.Name ?? '');
		const groups: Record<string, number[]> = {};
		for (const i in names) {
			if (names[i].startsWith('<')) {
				const [name, part] = names[i].slice(1, -1).split(',').map(i => i.trim());
				if (part === 'First' || part === 'Last') {
					const group = groups[name] ??= [];
					group[part === 'First' ? 0 : 1] = +i;
				}
			}
			if (names[i] === '' || names[i].startsWith('<'))
				delete names[i];
		}

		const prefixSets = makeBitTrie(makeBitset(names.map((_, i) => i)), (key, set) => {
			const from = key.length + (key.endsWith('-') ? 0 : 1);
			const children: bitTrie = {};
			for (const i of set.where(true)) {
				const name = names[i];
				if (name) {
					let s = name.indexOf(' ', from);
					if (s < 0)
						s = name.indexOf('-', from) + 1;
					if (s > 0) {
						const prefix = name.slice(0, s);
						(children[prefix] ??= new bits.SparseBits2()).set(i);
					} else {
						(children[name] ??= new bits.SparseBits2()).set(i);
					}
				}
			}

			Object.entries(children).filter(([_, bits]) => Array.from(bits.where(true)).length < 2).map(([key]) => key).forEach(key => delete children[key]);
			return children;
		});
		trimTrie(prefixSets);

		const root = prefixSets[''];

		for (const group of Object.values(groups)) {
			root.selfUnion(new bits.SparseBits2().setRange(group[0], group[1] + 1));
		}
		addTrieNode(prefixSets, "CJK UNIFIED IDEOGRAPH-", Object.entries(groups).reduce((acc, [key, v]) => {
			if (key.startsWith('CJK Ideograph'))
				acc.setRange(v[0], v[1] + 1);
			return acc;
		}, new bits.SparseBits2()));
		addTrieNode(prefixSets, "HANGUL SYLLABLE-", new bits.SparseBits2().setRange(groups['Hangul Syllable'][0], groups['Hangul Syllable'][1] + 1));
		addTrieNode(prefixSets, "TANGUT IDEOGRAPH-", new bits.SparseBits2().setRange(groups['Tangut Ideograph'][0], groups['Tangut Ideograph'][1] + 1));

		result += `\nexport const prefixes: prefixtree = {${trieToString(names, root, 0, 0)}\n};\n`;

	}

// output emoji sequences
	if (exportSequences) {
		// Get emoji sequences
		const sequences = {
			...await getEmojiTable('https://unicode.org/Public/emoji/14.0/emoji-sequences.txt'),
			...await getEmojiTable('https://unicode.org/Public/emoji/14.0/emoji-zwj-sequences.txt')
		};

		const allBitTrees: BitsetMap<number>[] = [];

		const optSeq = Object.fromEntries(Object.entries(sequences).map(([key, v]) => {
			const totalNodes = v.totalNodes;
			const uniqueSubtrees = new Map([...TreeNode.deduplicate(v)].filter(([_, tree]) => tree.size > 0));
			console.log(`Reduced from ${totalNodes} to ${uniqueSubtrees.size} unique subtrees`);

			const bitTrees 	= new Map<string, BitsetMap<number>>();
			const indices	= Object.fromEntries(Array.from(uniqueSubtrees, ([hash, _node], i) => [hash, i + allBitTrees.length]));

			// Create BitsetMap for each unique subtree
			uniqueSubtrees.forEach((tree, hash) => {
				if (tree.size) {
					const partition: Record<string, number[]> = {};
					for (const [k, v] of tree.entries())
						(partition[v?.hash ?? '-'] ??= []).push(k);

					bitTrees.set(hash, new BitsetMap(Object.entries(partition).map(([k, v]) => ({
						bits: makeBitset(v),
						value: indices[k]//bitTrees.get(k)
					}))));
				}
			});
			allBitTrees.push(...bitTrees.values());
			return [key, indices[v.hash]];
		}));

		// output sequence trees
		result += 'const trees = makeTrees(\n'
			+ allBitTrees.map((tree, i) => {
				if (tree.entries.length === 1) {
					const entry = tree.entries[0];
					return `/*${i}*/\t[[${bitsetToString(entry.bits)}${entry.value !== undefined ? `, ${entry.value}` : ''}]]`;
				} else {
					return `/*${i}*/\t[\n${
						tree.entries.map(entry => `\t\t[${bitsetToString(entry.bits)}${entry.value !== undefined ? `, ${entry.value}` : ''}]`).join(',\n')
					}\n\t]`;
				}
			}).join(',\n')
			+ '\n);\n\n'

		// output sequences
			+ 'export const sequences: Record<string, sequencenode[]> = {\n'
			+ Object.entries(optSeq).map(([key, value]) => `\t${key}: trees[${value}]`).join(',\n')
			+ '\n};\n\n';
	}
	return result;
}

async function main(argv: string[]) {
	if (argv.length < 3) {
		stdout.write('Usage: ts-node generate.ts (-names) (-sequences) <output path>\n');
		process.exit(1);
	}

	let names = false;
	let sequences = false;

	for (let i = 2; i < argv.length - 1; i++) {
		if (argv[i] === '-names') {
			names = true;
		} else if (argv[i] === '-sequences') {
			sequences = true;
		} else {
			throw new Error(`Unknown option: ${argv[i]}`);
		}
	}

	const output = argv[argv.length - 1];
	console.log(`Generating Unicode properties to ${output}`);

	const data = await run(names, sequences);
	fs.writeFileSync(output, data);
	console.log('Done.');
}

main(process.argv).catch(err => {
	console.error(err);
	process.exit(1);
});