import * as data from "./unicode-data";
import * as helpers from "./unicode-data-helpers";

export function getName(code: number) {
	return helpers.getName(code, data.prefixes);
}

export function getInfo(code: number) {
	return new Proxy({}, {
		get(_, prop: string) {
			if (prop === 'Name') {
				return helpers.getName(code, data.prefixes);

			} else if (data.enumProps[prop]) {
				for (const [name, bits] of Object.entries(data.enumProps[prop])) {
					if (bits.test(code))
						return name;
				}
			} else if (data.props[prop]) {
				return data.props[prop].test(code);
			}
			return undefined;
		},
    	has(_, prop: string): boolean {
			if (prop === 'Name') {
				return true;
			}
			if (data.enumProps[prop]) {
				for (const [_, bits] of Object.entries(data.enumProps[prop])) {
					if (bits.test(code))
						return true;
				}
			} else {
				return !!data.props[prop];
			}
			return false;
		},
    	ownKeys() {
			const props = Object.keys(data.props);
			const shared = props.findIndex((p, i) => i && (p < props[i - 1]));

			return [
				'Name',
				...(shared > 0 ? props.slice(0, shared) : props),
				...Object.entries(data.enumProps).filter(([k, v]) => k !== 'Name' && Object.entries(v).some(([_, bits]) => bits.test(code))).map(([k]) => k)
			];
		},
		getOwnPropertyDescriptor() {
			return { configurable: true, enumerable: true };
		}
	}) as Record<string, any>;
}

export function withProp(prop: string, value?:string) {
	if (value === undefined) {
		return data.props[prop];
	}
	return data.enumProps[prop][value];
}

