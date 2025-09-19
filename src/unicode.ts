export type bitset = Record<number, number>;

function combine(dest: bitset, srce: bitset): void {
	for (const key in srce)
		dest[key] = (dest[key] ?? 0) | srce[key];
}

function fix<T>(obj: any, name: string, value: T): T {
	Object.defineProperty(obj, name, {value, writable: false, configurable: false});
	return value;
}

export function fromRanges(...ranges: [number, number][]): bitset {
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

export function makeTrees(...data: [bitset, number?][][]): [bitset, any][][] {
	const trees: [bitset, any][][] = data.map(entries => 
		entries.map(([bits]) => [bits, undefined])
	);
	
	// Link references in second pass
	data.forEach((entries, i) => 
		entries.forEach(([, ref], j) => {
			if (ref !== undefined) trees[i][j][1] = trees[ref];
		})
	);
	
	return trees;
}

// equivalent to \p{Lu}
// \p{Lu}, \p{lu}, \p{uppercase letter}, \p{Uppercase Letter}, \p{Uppercase_Letter}, and \p{uppercaseletter}