import { options, part, any, eol } from './types';
import { parse } from './parse';
import { bits } from '@isopodlabs/utilities';

type SparseBits = bits.SparseBits;
const { SparseBits } = bits;

const anyButEOL = any.intersect(eol.complement()); // any except EOL

//-----------------------------------------------------------------------------
// Thompson NFA
//-----------------------------------------------------------------------------

interface NFAState {
	transitions: {mask: SparseBits, state: NFAState}[];
	epsilons:	NFAState[];
	accepting?: boolean;
	lazy?:		boolean;
}

function buildNFA(part: part, options: options = {i:false, m:false, s:false}): {start: NFAState, accept: NFAState} {

	function newState(): NFAState {
		return {transitions: [], epsilons: []};
	}

	function build(p: part, start: NFAState, _accept?: NFAState): NFAState {
		const accept = _accept ?? newState();

		if (typeof p === 'string') {
			// Literal string: chain of states for each character
			for (const char of p) {
				const next = (char === p[p.length - 1]) ? accept : newState();
				start.transitions.push({mask: SparseBits.fromIndices(char.charCodeAt(0)), state: next});
				start = next;
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
					start.epsilons.push(altStart);
				}
				return accept;
			}

			case 'quantified': {
				// Handle min repetitions
				for (let i = 0; i < p.min; i++)
					start = build(p.part, start);

				if (p.max === -1) {
					// Infinite: can loop back
					build(p.part, start, start);
					if (p.mod === 'lazy')
						start.lazy = true;
				} else {
					// Finite: add optional copies
					for (let i = p.min; i < p.max; i++) {
						start.epsilons.push(accept);
						start = build(p.part, start);
						if (p.mod === 'lazy')
							start.lazy = true;
					}
				}
				start.epsilons.push(accept);
				return accept;
			}

			case 'class': {
				// Character class: single transition with multiple chars
				const set = !options.s && p.contains(any) ? anyButEOL : p;
				start.transitions.push({mask: set, state: accept});
				return accept;
			}

			case 'wordbound':
			case 'nowordbound':
			case 'inputboundstart':
			case 'inputboundend': {
				// Anchors: epsilon transition with special handling
				// Mark transition with anchor type for special processing
				//start.transitions.set(`__${p.type}__`, [accept]);
				return accept;
			}

			case 'noncapture':
			case 'capture':
				// Groups: just pass through (captures handled at higher level)
				return build(p.part, start, accept);

			default:
				throw new Error(`Unsupported: ${p.type}`);
		}
	}

	const start = newState();
	const accept = build(part, start);
	accept.accepting = true;
	return {start, accept};
}


interface DFAState {
	transitions:	{mask: SparseBits, state: DFAState}[];
	accepting:		boolean;
}

// Subset Construction - convert NFA to DFA
function NFAtoDFA(nfaStart: NFAState): DFAState {
//	const nfaStates: NFAState[] = [];
	const nfaStates = new Map<NFAState, number>();
	const dfaStates	= new Map<string, DFAState>();

	// Make Ids for NFA states
	let nfaId = 0;
	function collectStates(state: NFAState) {
		if (!nfaStates.has(state)) {
			nfaStates.set(state, ++nfaId);
			for (const i of state.transitions)
				collectStates(i.state);
			state.epsilons.forEach(collectStates);
		}
	}

	// Epsilon closure - find all states reachable via ε-transitions
	function epsilonClosure(states: Set<NFAState>): Set<NFAState> {
		const closure = new Set(states);
		const stack = [...states];

		while (stack.length > 0) {
			const state = stack.pop()!;
			for (const next of state.epsilons) {
				if (!closure.has(next)) {
					closure.add(next);
					stack.push(next);
				}
			}
		}
		return closure;
	}

	function createDFAState(states: Set<NFAState>): DFAState {
		states = epsilonClosure(states);
		const key = [...states].map(state => nfaStates.get(state)).sort().join(',');

		if (dfaStates.has(key))
			return dfaStates.get(key)!;

		const dfa: DFAState = {transitions: [], accepting: [...states].some(state => state.accepting)};
		dfaStates.set(key, dfa);

		// Partition masks

		const transitions: {mask: SparseBits, states: Set<NFAState>}[] = [];

		for (const state of states) {
			for (const t of state.transitions) {
				const remaining = t.mask.copy();

				// Check against existing partitions for overlaps
				for (const existing of transitions) {
					const overlap = existing.mask.intersect(t.mask);

					if (!overlap.empty()) {
						if (overlap.contains(existing.mask)) {
							existing.states.add(t.state);

						} else {
							//split existing
							existing.mask.selfXor(overlap);
							transitions.push({mask: overlap, states: new Set([...existing.states, t.state])});
						}
						remaining.selfXor(overlap);
					}
				}
				// Add new transition if any remains
				if (!remaining.empty())
					transitions.push({mask: remaining, states: new Set([t.state])});
			}
		}

		// Create DFA transitions from partitioned masks

		for (const next of transitions)
			dfa.transitions.push({mask: next.mask, state: createDFAState(next.states)});
		return dfa;
	}

	collectStates(nfaStart);

	// Start with epsilon closure of initial state
	return createDFAState(new Set([nfaStart]));
}

export function runDFAEager(dfa: DFAState, str: string) {
	let state: DFAState = dfa;

	// Check if we start in accepting state
	if (state.accepting)
		return 0;

	for (let i = 0; i < str.length; i++) {
		const code = str.codePointAt(i)!;
		let stop = true;
		for (const t of state.transitions) {
			if (t.mask.test(code)) {
				state	= t.state;
				stop	= false;
				break;
			}
		}
		if (stop)
			break;

		if (code >= 0xffff)
			++i; // skip next for surrogate pairs
			
		// Stop immediately on first accepting state
		if (state.accepting)
			return i + 1;
	}

	return -1;
}

export function runDFA(dfa: DFAState, str: string) {
	let state: DFAState = dfa;
	let lastAcceptPos	= state.accepting ? 0 : -1;

	for (let i = 0; i < str.length; i++) {
		const code = str.codePointAt(i)!;
		let stop = true;
		for (const t of state.transitions) {
			if (t.mask.test(code)) {
				state	= t.state;
				stop	= false;
				break;
			}
		}
		if (stop)
			break;

		if (code >= 0xffff)
			++i; // skip next for surrogate pairs

		 // Update last accepting position after successful transition
        if (state.accepting)
            lastAcceptPos = i + 1;
	}
	return lastAcceptPos;
}

export class DFA {
	constructor(public start: DFAState) {}

	run(str: string) {
		return runDFA(this.start, str);
	}

	static fromParts(parts: part, options: options = {}) {
		return new this(NFAtoDFA(buildNFA(parts, options).start));
	}

	static fromString(str: string, options: options & {u?: boolean, x?: boolean} = {}) {
		const parts = parse(str, options.u, options.x);
		return new this(NFAtoDFA(buildNFA(parts, options).start));
	}
}