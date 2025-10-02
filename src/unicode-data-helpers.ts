import { bits } from "@isopodlabs/utilities";

export type bitset = Record<number, number>;

export interface sequencenode {
	set: bitset,
	children?: sequencenode[]
};

export interface prefixtree {
	set: bitset;
	children?: Record<string, prefixtree>;
	chars?: string[];
	remaining?: bits.SparseBits;	// runtime cached complement of children sets
	indices?: Record<number, string[]>; // runtime bit chunk -> child names
}
	

function combine(dest: bitset, srce: bitset): void {
	for (const key in srce)
		dest[key] = (dest[key] ?? 0) | srce[key];
}

function fix<T>(obj: any, name: string, value: T): T {
	Object.defineProperty(obj, name, {value, writable: false, configurable: false});
	return value;
}

export function ranges(...ranges: [number, number][]): bitset {
	const r: bitset = {};
	for (const [start, end] of ranges) {
		let 	i	= start >> 5;
		const	e	= end >> 5;
		if (i === e) {
			r[i] = (r[i] ?? 0) | ((1 << (end & 0x1f)) - (1 << (start & 0x1f)));
		} else {
			r[i] = (r[i] ?? 0) | -(1 << (start & 0x1f));
			while (++i < e)
				r[i] = 0xffffffff;
			r[i] = (r[i] ?? 0) | ((1 << (end & 0x1f)) - 1);
		}
	}
	return r;
}

export const derived = (props: any, name: string, dest: bitset, ...others: string[]) => {
	for (const set of others)
		combine(dest, props[set]);
	return fix(props, name, dest);
};

export function ref(props: any, ...names: string[]): Record<string, bitset> {
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

export function addProperty(obj: any, get: () => any, name: string) {
	Object.defineProperty(obj, name, {
		get,
		enumerable: true,
		configurable: true
	});
}

export function makeTrees(...data: [bitset, number?][][]): sequencenode[][] {
	const trees: sequencenode[][] = data.map(entries => 
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

function remainingSet(node: prefixtree): bits.SparseBits {
	const set = node.remaining ??= Object.values(node.children ?? [])
		.reduce((acc, p) => acc.selfDifference(bits.SparseBits.fromEntries(p.set)), bits.SparseBits.fromEntries(node.set));
	return set;
/*
	const set = bits.SparseBits.fromEntries(node.set);
	if (node.children) {
		for (const p of Object.values(node.children))
			set.selfDifference(bits.SparseBits.fromEntries(p.set));
	}
*/
}

function getIndices(node: prefixtree) {
	if (node.indices)
		return node.indices;

	const indices: Record<number, string[]> = {};
	for (const [prefix, p] of Object.entries(node.children ?? [])) {
		for (const chunk in p.set)
			(indices[chunk] ??= []).push(prefix);
	}
	node.indices = indices;
	return indices;
}

export function getName(code: number, node: prefixtree): string | undefined {
	let name = '';
	const chunk = code >> 5, bit = 1 << (code & 0x1f);

	while (node.children) {
		const prefix = getIndices(node)[chunk]?.find(p => node.children![p].set[chunk] & bit);
		if (!prefix)
			break;

		node = node.children[prefix];
		name += prefix + (prefix.endsWith('-') ? '' : ' ');

		/*
		// Linear search - too slow
		for (const [prefix, p] of Object.entries(node.children)) {
			if (p.set[chunk] & bit) {
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

export function getCode(name: string, node: prefixtree): number | undefined {
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

	name = name.slice(offset);
	if (node.chars) {
		for (let i = 0; i < node.chars.length; i++) {
			if (node.chars[i] === name)
				return remainingSet(node).nthSet(i);
		}
	} else {
		if (/^[0-9A-Fa-f]+$/.test(name))
			return parseInt(name, 16);
		return undefined;
	}
}

export function getNames(tree: prefixtree) {
	return new Proxy(tree, {
		get(_target, prop: string) {
			const code = getCode(prop, tree);
			if (code !== undefined)
				return {[code >> 5]: 1 << (code & 0x1f)};
			return {} as bitset;
		}
	}) as any as Record<string, bitset>;
}
