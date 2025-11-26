import { bits } from "@isopodlabs/utilities";
export type BitSet = bits.SparseBits;

export interface SequenceTree {
	set:		BitSet,
	children?:	SequenceTree[]
};

export interface PrefixTree {
	set:		BitSet;
	children?:	Record<string, PrefixTree>;
	chars?:		string[];
	remaining?:	BitSet;	// runtime cached complement of children sets
	indices?:	Record<number, string[]>; // runtime bit chunk -> child names
}

function fix<T>(obj: any, name: string, value: T): T {
	Object.defineProperty(obj, name, {value, writable: false, configurable: false});
	return value;
}

export function ref<T>(props: Record<string, T>, ...names: string[]): Record<string, T> {
	return Object.defineProperties({}, Object.fromEntries(names.map(name => [name, {
		get() { return fix(this, name, props[name]); },
		enumerable: true,
		configurable: true
	}])));
}

export function aliases(obj: any, aliases: Record<string, string>) {
	Object.defineProperties(obj, Object.fromEntries(Object.entries(aliases).map(([alias, name]) => [alias, {
		get() { return fix(obj, alias, obj[name]); },
		enumerable: true,
		configurable: true
	}])));
}

export function sparse(v: Record<number, number>): BitSet {
	return new bits.SparseBits(v);
}

export function ranges(...ranges: [number, number][]): BitSet {
	const r = new bits.SparseBits();
	for (const [start, end] of ranges)
		r.setRange(start, end);
	return r;
}

export const derived = (props: Record<string, BitSet>, name: string, dest: BitSet, ...others: string[]) => {
	for (const set of others)
		dest.selfUnion(props[set]);
	return fix(props, name, dest);
};

export function makeTrees(...data: [BitSet, number?][][]): SequenceTree[][] {
	const trees: SequenceTree[][] = data.map(entries => 
		entries.map(([bits]) => ({ set: bits }))
	);
	
	// Link references in second pass
	data.forEach((entries, i) => 
		entries.forEach(([, ref], j) => {
			if (ref !== undefined)
				trees[i][j].children = trees[ref];
		})
	);
	
	return trees;
}

// names

export function getNames(tree: PrefixTree) {
	return new Proxy(tree, {
		get(tree, prop: string) {
			const code = getCode(prop, tree);
			if (code !== undefined)
				return bits.SparseBits.fromIndices(code);
			return new bits.SparseBits();
		},
		ownKeys(tree) {
			const keys: string[] = [];
			const gather = (node: PrefixTree, prefix: string) => {
				if (node.chars) {
					for (const i of node.chars)
						keys.push(prefix + i);
				}
				for (const [p, child] of Object.entries(node.children ?? {}))
					gather(child, prefix + p + (p.endsWith('-') ? '' : ' '));
			};
			gather(tree, '');
			return keys;
		},
  		getOwnPropertyDescriptor() {
 			return { configurable: true, enumerable: true };
  		}
	}) as any as Record<string, BitSet>;
}

function remainingSet(node: PrefixTree): bits.SparseBits {
	return node.remaining ??= Object.values(node.children ?? [])
		.reduce((acc, p) => acc.selfDifference(p.set), node.set.copy()).clean();
}

function getIndices(node: PrefixTree) {
	if (node.indices)
		return node.indices;

	const indices: Record<number, string[]> = {};
	for (const [prefix, p] of Object.entries(node.children ?? [])) {
		for (const [chunk] of p.set.entries())
			(indices[chunk] ??= []).push(prefix);
	}
	node.indices = indices;
	return indices;
}

export function getName(code: number, node: PrefixTree): string | undefined {
	let name = '';
	const chunk = code >> 5;//, bit = 1 << (code & 0x1f);

	while (node.children) {
		const prefix = getIndices(node)[chunk]?.find(p => node.children![p].set.test(code));
		if (!prefix)
			break;

		node = node.children[prefix];
		name += prefix + (prefix.endsWith('-') ? '' : ' ');

		/*
		// Linear search - too slow
		for (const [prefix, p] of Object.entries(node.children)) {
			if (p.set.test(code)) {
				name += prefix + (prefix.endsWith('-') ? '' : ' ');
				next = p;
				break;
			}
		}
		*/
	}
	if (!node.chars)
		return name + code.toString(16).toUpperCase().padStart(4, '0');

	const i	= remainingSet(node).slice(0, code).countSet();
	return (name + (node.chars[i] ?? '')).trim();
}

export function getCode(name: string, node: PrefixTree): number | undefined {
	let offset = 0;

	for (let s = 0; node.children && s < name.length; ) {
		const i = s + 1;
		
		s = name.indexOf(' ', i);
		if (s < 0)
			s = name.indexOf('-', i);
		if (s < 0)
			s = name.length;

		const prefix	= name.slice(offset, s + (name[s] === '-' ? 1 : 0));
		const next		= node.children![prefix];
		if (next) {
			offset	= s + 1;
			node	= next;
		}
	}

	const last = name.slice(offset);
	if (node.chars) {
		const i = node.chars.findIndex(c => c === last);
		if (i >= 0)
			return remainingSet(node).nthSet(i);
	} else {
		if (/^[0-9A-Fa-f]+$/.test(last))
			return parseInt(last, 16);
	}
}
