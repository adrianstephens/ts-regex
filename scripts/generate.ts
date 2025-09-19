import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import * as bits from '../node_modules/@isopodlabs/utilities/dist/bits';

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
	'Variation_Selector', 'White_Space', 'XID_Continue', 'XID_Start'
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
	const r = new bits.SparseBits();
	for (const i of data)
		r.set(i);
	return r;
}

async function getTable(url: string) {
	const data	= await downloadString(url);
	const re	= /^(\w+)(?:..(\w+))?\s+;\s+(\w+)/;
	const table: Record<string, bits.SparseBits> = {};

	data.split('\n').forEach(line => {
		if (!line || line.startsWith('#'))
			return;

		const m = re.exec(line);
		if (m) {
			const entry = (table[m[3]] ??= new bits.SparseBits());
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
	bits: bits.SparseBits;
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
	extra: bits.SparseBits;
}

function findOptimalSubsets(sets: Record<string, bits.SparseBits>) {
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
			//const derived = expressions[name] ??= { bases: new Set<string>(), extra: new bits.SparseBits() };
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
		const extra = bits.SparseBits.fromEntries(set.entries());
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

function makeNameTree(names: string[]) {

	function childPrefixes(set: bits.SparseBits, from: number) {
		const children: prefixTree = {};
		for (const i of set.where(true)) {
			const name = names[i];
			let s = name.indexOf(' ', from);
			if (s < 0)
				s = name.indexOf('-', from);
			if (s > 0) {
				const prefix = name.slice(0, s);
				(children[prefix] ??= new bits.SparseBits()).set(i);
			}
		}

		Object.entries(children).filter(([_, bits]) => Array.from(bits.where(true)).length < 2).map(([key]) => key).forEach(key => delete children[key]);
		return children;
	}

	function childPrefixes2(sets: prefixTree) {
		for (const [key, value] of Object.entries(sets)) {
			const children = childPrefixes(value, key.length + 1);
			if (Object.keys(children).length) {
				value.children = children;
				childPrefixes2(children);
			}
		}
	}

	const prefixSets: prefixTree = {'': makeBitset(names.map((_, i) => i))};
	childPrefixes2(prefixSets);
	return prefixSets;
}

//-----------------------------------------------------------------------------
// Output
//-----------------------------------------------------------------------------

function bitsetToString(set: bits.SparseBits) {
	return '{' + set.entries().map(([i, v]) => `${i}:0x${(v + 0x200000000).toString(16).slice(-8)}`).join(',') + '}';
}
function rangesToString(ranges: number[][]) {
	return 'fromRanges(' + ranges.map(([start, end]) =>`[${start},${end}]`).join(',') + ')';
}

function derivedToString(name: string, set: DerivedSet) {
	const ranges = [...set.extra.ranges()];//.map(([start, end]) => ({ start, end }));
	const use_fromRanges = (ranges.length < set.extra.keys().length);

	const bitsetString = use_fromRanges
		? rangesToString(ranges)
		: bitsetToString(set.extra);

	if (use_fromRanges || (set.bases?.size))
		return `get ${name}() { return derived(this,"${name}",${bitsetString},${set.bases ? Array.from(set.bases).map(i => `"${i}"`).join(',') : ''}); }`;

	return name + ': ' + bitsetString;
}

function bitsetToString2(set: bits.SparseBits) {
	const ranges = [...set.ranges()];//.map(([start, end]) => ({ start, end }));
	return ranges.length < set.keys().length
		? rangesToString(ranges)
		: bitsetToString(set);
}

function indent(depth: number) {
	return '\t'.repeat(depth);
}

/*
type BitsetTree = BitsetMap<BitsetTree | undefined>;

function treeToString(node: BitsetTree, depth = 0): string {
	return `[\n${
		node.entries.map(entry => `${'\t'.repeat(depth + 1)}{bits: ${bitsetToString2(entry.bits)}${entry.value ? ', value: ' + treeToString(entry.value, depth + 1) : ''}}`).join(',\n')
	}\n${indent(depth)}]`;
}
*/


type prefixNode = bits.SparseBits & {children?: prefixTree};
type prefixTree = Record<string, prefixNode>;

function prefixesToString2(names: string[], node: prefixNode, len = 0, depth = 0): string {
	const children = node.children;
	const used = bits.SparseBits.fromEntries(node.entries());

	if (children) {
		for (const c of Object.values(children))
			used.selfIntersect(c.complement());
	}

	let result = '';
	
	if (used.next(-1) >= 0) {
		result +="chars: {\n"
		+ Array.from(used.where(true), i => `${indent(depth + 1)}0x${i.toString(16)}: "${names[i].slice(len)}"`).join(',\n')
	 	+ `\n${indent(depth)}}`;
	}

	if (children) {
		result += (result ? ", " : "") + "children: [\n" + Object.keys(children).map(
			i => `${indent(depth + 1)}{prefix: "${i.slice(len)}", ${prefixesToString2(names, children[i], i.length + 1, depth + 1)}}`
		).join(',\n') + `\n${indent(depth)}]`;
	}
	return result;
}


function aliasesToString(aliases: Record<string, string>, objName: string) {
	return `aliases(${objName}, {\n${
		Object.entries(aliases).map(([alias, name]) => `\t${alias}:\t"${name}"`).join(',\n')
	}\n});\n\n`;
}

function totalSize(sets: bits.SparseBits[]) {
	return sets.reduce((a, b) => a + b.keys().length, 0);
}

//-----------------------------------------------------------------------------
// Main
//-----------------------------------------------------------------------------

async function run(exportNames: boolean, exportSequences: boolean) {
	const unicodeData = await downloadString('https://unicode.org/Public/14.0.0/ucd/UnicodeData.txt');

	const unicode: UnicodeChar[] = [];
	unicodeData.split('\n').forEach(line => {
		if (!line)
			return;

		const char: UnicodeChar = {};
		const values = line.toString().split(';');

		for (let i = 0; i < unicodeFields.length; i++)
			char[unicodeFields[i]] = values[i];

		const index = parseInt(char.Code_Value!, 16);
		unicode[index] = char;
	});

	function valuesBy(key: keyof UnicodeChar): Record<string, bits.SparseBits> {
		return unicode.reduce((acc, item, index) => {
			const value = item[key];
			if (value) {
				(acc[value] ??= new bits.SparseBits()).set(index);
			}
			return acc;
		}, {} as Record<string, bits.SparseBits>);
	}

	// Merge all property sources
	const props = {
		...await getTable('https://unicode.org/Public/14.0.0/ucd/PropList.txt'),
		...await getTable('https://unicode.org/Public/14.0.0/ucd/DerivedCoreProperties.txt'),
		...await getTable('https://unicode.org/Public/14.0.0/ucd/DerivedNormalizationProps.txt'),
		...await getTable('https://unicode.org/Public/14.0.0/ucd/emoji/emoji-data.txt')
	};

	const enumProps = {
		General_Category:	valuesBy('General_Category'),
		Script:				await getTable('https://unicode.org/Public/14.0.0/ucd/Scripts.txt'),
		Script_Extensions:	await getTable('https://unicode.org/Public/14.0.0/ucd/ScriptExtensions.txt')
	};
	
	const binaryProps = {...Object.fromEntries(Object.entries(props).filter(i => supported.has(i[0]))),
		ASCII:			new bits.SparseBits().setRange(0, 128),
		Any:			new bits.SparseBits().setRange(0, 0x110000),
		Assigned:		makeBitset(unicode.map((_, i) => i).filter(i => unicode[i])),//lazyUnion('Any'),
		Bidi_Mirrored:	makeBitset(unicode.map((char, i) => char?.Bidi_Mirrored === 'Y' ? i : -1).filter(i => i >= 0)),
	};
	
	// Composite Categories, e.g. C = Cf + Cn + Co + Cs
	const gc = enumProps.General_Category;
	for (const [k, v] of Object.entries(gc)) {
		if (k.length === 2)
			(gc[k[0]] ??= new bits.SparseBits()).selfUnion(v);
	}
	
	const allSets = {
		...binaryProps,
		...Object.assign({}, ...Object.values(enumProps)),
	};

	console.log(`Total bitsets size: ${totalSize(Object.values(allSets))} entries`);
	const optSets = findOptimalSubsets(allSets);
	console.log(`Total bitsets size: ${totalSize(Object.values(optSets).map(set => set.extra))} entries`);

	const sortedProps = Object.fromEntries(Object.entries(optSets).sort((a, b) => a[0] < b[0] ? -1 : a[0] === b[0] ? 0 : 1));

	let result =
`// This file is generated by scripts/generate.ts
import {bitset, fromRanges, derived, ref, aliases} from './unicode';

`
// output property bitsets
	+	'export const props: Record<string, bitset> = {\n'
	+	Object.entries(sortedProps).map(([k, v]) => `\t${derivedToString(k, v)}`).join(',\n')
	+	'\n};\n\n'
	+	aliasesToString(propAliases, 'props')

// output enum properties
	+	'export const enumProps: Record<string, Record<string, bitset>> = {\n'
	+	Object.entries(enumProps).map(([key, value]) => `\t${key}: ref(props, ${
			Object.keys(value).map(k => `"${k}"`).join(', ')
		})`).join(',\n')
	+	'\n};\n\n'
	+	aliasesToString(enumAliases, 'enumProps');

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
		result += `import {makeTrees} from './unicode';\n\n`
			+ 'const trees = makeTrees(\n'
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
			+ 'export const sequences: Record<string, any> = {\n'
			+ Object.entries(optSeq).map(([key, value]) => `\t${key}: trees[${value}]`).join(',\n')
			+ '\n};\n\n';
	}

	if (exportNames) {
		const names			= unicode.map(i => i.Name ?? '');//.filter(Boolean);
		const prefixSets	= makeNameTree(names);
		result += 'export const prefixes: any = {\n' + prefixesToString2(names, prefixSets[''], 0, 1) + '\n};\n';
	//	+	'export const names: Record<number, string> = {\n'
	//	+	unicode.map((char, i) => char?.Name ? `\t0x${i.toString(16)}: "${char.Name.replace(/"/g, '\\"')}"` : '').filter(i => i).join(',\n')
	//	+	'\n};\n\n'
	}
	return result;
}


run(false, false).then(data => {
	fs.writeFileSync('src/unicode-data.ts', data);
	console.log('Done.');
}).catch(err => {
	console.error(err);
	process.exit(1);
});
