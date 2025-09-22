import { any, word, eol, part } from './types';
import { parse } from './parse';

const anyButEOL = any.intersect(eol.complement()); // any except EOL

//-----------------------------------------------------------------------------
// Thompson NFA
//-----------------------------------------------------------------------------

interface options {i?: boolean; m?: boolean; s?: boolean};

interface NFAState {
	id: number;
	epsilonTransitions: NFAState[];			// ε-transitions
	onEnter?: (str: string, pos: number, captures: Record<number|string, [number, number]>) => [next: NFAState, newPos: number] | void;
	isAccepting: boolean;
	lazy?: boolean;
	//accept?: NFAState; // for post checks
	//part?: part; // for debugging
}

export function buildNFA(part: part, options: options = {i:false, m:false, s:false}): {start: NFAState, accept: NFAState} {
	let captureId = 0;
	let stateId = 0;

	function newState(): NFAState {
		return {id: stateId++, epsilonTransitions: [], isAccepting: false};
	}

	function build(p: part, start: NFAState, _accept?: NFAState): NFAState {
		const accept = _accept ?? newState();
		//start.accept = accept;
		//start.part = p;
		
		if (typeof p === 'string') {
			if (options.i) {
				const s = p.toLowerCase();
				start.onEnter = (str, pos, _captures) => {
					if (str.substring(pos, pos + p.length).toLowerCase() === s)
						return [accept, pos + p.length];
				};
			} else {
				start.onEnter = (str, pos, _captures) => {
					if (str.substring(pos, pos + p.length) === p)
						return [accept, pos + p.length];
				};
			}
			return accept;
		}

		if (Array.isArray(p)) {
			for (let i = 0; i < p.length; i++)
				start = build(p[i], start, i === p.length - 1 ? accept : undefined);
			return start;
		}

		switch (p.type) {
			case 'alt': {
				// Alternation: start --ε--> frag1, frag2, ... --> sharedAccept
				for (const alt of p.parts) {
					const altStart = newState();
					build(alt, altStart, accept);
					start.epsilonTransitions.push(altStart);
				}
				return accept;
			}

			case 'quantified': {
				// Handle min repetitions
				for (let i = 0; i < p.min; i++)
					start = build(p.part, start);

				if (p.mod === 'possessive') {
					const fragStart = newState();
					const fragAccept = build(p.part, fragStart);
					fragAccept.isAccepting = true;

					if (p.max === -1) {
						start.onEnter = (str, pos, captures) => {
							let end;
							while ((end = runNFA(fragStart, str, pos, captures)) >= 0 && end !== pos)
								pos = end;
							return [accept, pos];
						};
					} else {
						start.onEnter = (str, pos, captures) => {
							for (let i = p.min, end; i < p.max; i++) {
								if ((end = runNFA(fragStart, str, pos, captures)) < 0 || end === pos)
									break;
								pos = end;
							}
							return [accept, pos];
						};
					}
				} else {
					if (p.max === -1) {
						// Infinite: can loop back
						build(p.part, start, start);
						if (p.mod ==='lazy')
							start.lazy = true;
					} else {
						// Finite: add optional copies
						for (let i = p.min; i < p.max; i++) {
							start.epsilonTransitions.push(accept); // can skip
							start = build(p.part, start);
							if (p.mod ==='lazy')
								start.lazy = true;
						}
					}
					start.epsilonTransitions.push(accept);
				}

				return accept;
			}

			case 'class': {
				const set = !options.s && p.contains(any) ? anyButEOL : p;
				start.onEnter = (str, pos, _captures) => {
					if (pos < str.length) {
						const codePoint = str.codePointAt(pos)!;
						if (set.test(codePoint)) {
							const charLength = codePoint > 0xFFFF ? 2 : 1;
							return [accept, pos + charLength];
						}
					}
				};
				return accept;
			}

			case 'wordbound':
				start.onEnter = (str, pos, _captures) =>
					word.testChar(str[pos - 1]) !== word.testChar(str[pos]) ? [accept, pos] : undefined;
				return accept;

			case 'nowordbound':
				start.onEnter = (str, pos, _captures) =>
					word.testChar(str[pos - 1]) === word.testChar(str[pos]) ? [accept, pos] : undefined;
				return accept;

			case 'inputboundstart':
				if (options.m) {
					start.onEnter = (str, pos, _captures) =>
						pos === 0 || eol.testChar(str[pos - 1]) ? [accept, pos] : undefined;
				} else {
					start.onEnter = (str, pos, _captures) =>
						pos === 0 ? [accept, pos] : undefined;
				}
				return accept;

			case 'inputboundend': {
				if (options.m) {
					start.onEnter = (str, pos, _captures) =>
						pos === str.length || eol.testChar(str[pos]) ? [accept, pos] : undefined;
				} else {
					start.onEnter = (str, pos, _captures) =>
						pos === str.length ? [accept, pos] : undefined;
				}
				return accept;
			}

			case 'noncapture':
				if (typeof p.options === 'string') {
					if (p.options === 'atomic') {
						// Atomic group: behaves like regular group during matching
						return build(p.part, start, accept);

					} else {
						const fragStart = newState();
						const fragAccept = build(p.part, fragStart);
						// Lookaround fragments need accepting states for backtrackSimple
						fragAccept.isAccepting = true;
						
						if (p.options === 'ahead' || p.options === 'neg_ahead') {
							// Lookahead: check if pattern matches starting at current position
							const isPositive = p.options === 'ahead';
							start.onEnter = (str, pos, _captures) => {
								if ((runNFASimple(fragStart, str, pos) === str.length) === isPositive)
									return [accept, pos];
							};
						} else {
							// Lookbehind: check if pattern matches ending at current position
							const isPositive = p.options === 'behind';
							start.onEnter = (str, pos, _captures) => {
								for (let start = 0; start <= pos; start++) {
									if ((runNFASimple(fragStart, str, start) === pos) === isPositive)
										return [accept, pos];
								}
								if (!isPositive)
									return [accept, pos];
							};
						}
					}
					return accept;

				} else {
					const saveOptions = {...options};
					Object.assign(options, p.options);
					const result = build(p.part, start, accept);
					Object.assign(options, saveOptions);
					return result;
				}

			case 'capture': {
				const id = p.name ?? ++captureId;
				start.onEnter = (str, pos, captures) => {
					captures[id] = [pos, -1];
				};
				accept.onEnter = (str, pos, captures) => {
					if (captures[id])
						captures[id][1] = pos;
				};

				const fragStart = newState();
				const fragAccept = build(p.part, fragStart);
				start.epsilonTransitions.push(fragStart);
				fragAccept.epsilonTransitions.push(accept);
				return accept;
			}

			case 'reference': {
				start.onEnter = (str, pos, captures) => {
					const captured = captures[p.value];
					if (captured && captured[1] !== -1) {
						const len = captured[1] - captured[0];
						if (str.substring(pos, pos + len) === str.substring(captured[0], captured[1]))
							return [accept, pos + len];
					}
				};

				return accept;
			}
			default:
				throw new Error(`Unsupported: ${p.type}`);
		}
	}

	const start = newState();
	const accept = build(part, start);
	accept.isAccepting = true;

	return {start, accept};
}

// Simplified runner for lookaround patterns
export function runNFASimple(nfa: NFAState, str: string, pos: number): number {
	function recurse(state: NFAState, pos: number): number {

		// Linear execution for states without epsilon transitions
		while (state.epsilonTransitions.length === 0) {
			const redirect = state.onEnter?.(str, pos, {});
			if (!redirect)
				return state.isAccepting ? pos : -1;

			state	= redirect[0];
			pos		= redirect[1];
		}

		if (state.lazy) {
			// Lazy: try epsilon transitions first (exit early)
			for (const next of state.epsilonTransitions) {
				const end = recurse(next, pos);
				if (end >= 0)
					return end;
			}
		}

		// Try onEnter callback first
		const redirect = state.onEnter?.(str, pos, {});
		if (redirect) {
			const end = recurse(redirect[0], redirect[1]);
			if (end >= 0)
				return end;
		}

		// Check if accepting
		if (state.isAccepting)
			return pos;

		if (!state.lazy) {
			// Try epsilon transitions last
			for (const next of state.epsilonTransitions) {
				const end = recurse(next, pos);
				if (end >= 0)
					return end;
			}
		}
		return -1;
	}
	return recurse(nfa, pos);
}


export function runNFA(nfa: NFAState, str: string, pos = 0, captures: Record<number|string, [number, number]> = {}): number {
	function recurse(state: NFAState, pos: number, captures: Record<number|string, [number, number]>): number {
		// Save capture state for backtracking
		const saved: Record<number|string, [number, number]> = {};
		for (const key in captures)
			saved[key] = [...captures[key]];
		
		function restoreCaptures() {
			// Clear any new captures and restore original ones
			for (const key in captures) {
				if (!(key in saved))
					delete captures[key];
			}
			for (const key in saved)
				captures[key] = saved[key];
		}

		// Linear execution for states without epsilon transitions
		while (state.epsilonTransitions.length === 0) {
			const redirect = state.onEnter?.(str, pos, captures);
			if (!redirect) {
				if (!state.isAccepting)
					restoreCaptures();
				return state.isAccepting ? pos : -1;
			}

			state	= redirect[0];
			pos		= redirect[1];
		}

		if (state.lazy) {
			// Lazy: try epsilon transitions first (exit early)
			for (const next of state.epsilonTransitions) {
				const end = recurse(next, pos, captures);
				if (end >= 0)
					return end;
			}
		}

		// Try onEnter callback
		const redirect = state.onEnter?.(str, pos, captures);
		if (redirect) {
			const end = recurse(redirect[0], redirect[1], captures);
			if (end >= 0)
				return end;
		}

		// Check if accepting
		if (state.isAccepting)
			return pos;

		if (!state.lazy) {
			// Try epsilon transitions last
			for (const next of state.epsilonTransitions) {
				const end = recurse(next, pos, captures);
				if (end >= 0)
					return end;
			}
		}

		// All paths failed, restore captures
		restoreCaptures();
		return -1;
	}

	return recurse(nfa, pos, captures);

}

export class NFA {
	constructor(public start: NFAState) {}
	run(str: string) {
		const captures: Record<number|string, [number, number]> = {};
		if (runNFA(this.start, str, 0, captures) >= 0)
			return captures;
	}

	static fromParts(parts: part, options: options = {}) {
		return new this(buildNFA(parts, options).start);
	}

	static fromString(str: string, options: options & {u?: boolean, x?: boolean} = {}) {
		const parts = parse(str, options.u, options.x); // validate
		return new this(buildNFA(parts, options).start);
	}

}
/*
export function regexToNFA(part: part, options: options = {}): NFAState {
	const seen = new Set<NFAState>();
	function checks(state: NFAState) {
		if (seen.has(state))
			return false;

		seen.add(state);

		if (state.accept) {
			checks(state.accept);
		} else {
			console.log("State without accept", state, state.part ? toRegExpString(state.part) : '');
		}

		if (state.epsilonTransitions.length === 1 && !state.onEnter) {
			console.log(state, state.part ? toRegExpString(state.part) : '');
			//if (!state.isAccepting) {
			//	console.log("Non-accepting state without transitions", state, state.part ? toRegExpString(state.part) : '');
			//}
		}

		for (const next of state.epsilonTransitions) {
			if (checks(next))
				return true;
		}
		return false;
	}
	const nfa = buildNFA(part, options);
	//checks(nfa.start);
	return nfa.start;
}
*/