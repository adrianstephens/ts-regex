import { options, part, any, eol } from './types';
import { parse } from './parse';
import { bits } from '@isopodlabs/utilities';

type SparseBits = bits.SparseBits;
const { SparseBits } = bits;

const anyButEOL = any.intersect(eol.complement()); // any except EOL

//-----------------------------------------------------------------------------
// Thompson NFA and Subset Construction to DFA
//-----------------------------------------------------------------------------


interface NFAState {
	id: number;
	transitions: {mask: SparseBits, state: NFAState}[];
	epsilonTransitions: NFAState[];			// ε-transitions
	isAccepting: boolean;
}

interface DFAState {
	nfaStates: Set<number>;					// which NFA states this represents
	transitions: {mask: SparseBits, state: DFAState}[];
	isAccepting: boolean;
}

// Step 1: Build Thompson NFA from regex AST
function buildNFA(part: part, options: options = {i:false, m:false, s:false}): {start: NFAState, accept: NFAState} {
	let stateId = 0;

	function newState(): NFAState {
		return {id: stateId++, transitions: [], epsilonTransitions: [], isAccepting: false};
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
					start.epsilonTransitions.push(altStart);
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
					//if (p.mod ==='lazy')
					//	start.lazy = true;
				} else {
					// Finite: add optional copies
					for (let i = p.min; i < p.max; i++) {
						start.epsilonTransitions.push(accept); // can skip
						start = build(p.part, start);
						//if (p.mod ==='lazy')
						//	start.lazy = true;
					}
				}
				start.epsilonTransitions.push(accept);
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
	accept.isAccepting = true;
	return {start, accept};
}


// Step 3: Subset Construction - convert NFA to DFA
function NFAtoDFA(nfaStart: NFAState): DFAState {
	const nfa: NFAState[] = [];
	//const alphabet	= new Set<string>();

	function collectStates(state: NFAState) {
		if (!nfa[state.id]) {
			nfa[state.id] = state;

			//for (const char of state.transitions.keys())
			//	alphabet.add(char);
			for (const i of state.transitions)
				collectStates(i.state);
			state.epsilonTransitions.forEach(collectStates);
		}
	}

	collectStates(nfaStart);

	const dfaStates	= new Map<string, DFAState>();

	function stateSetKey(states: Set<number>): string {
		return [...states].sort().join(',');
	}

	// Epsilon closure - find all states reachable via ε-transitions
	function epsilonClosure(states: Set<number>): Set<number> {
		const closure = new Set(states);
		const stack = [...states];

		while (stack.length > 0) {
			const id = stack.pop()!;
			for (const next of nfa[id].epsilonTransitions) {
				if (!closure.has(next.id)) {
					closure.add(next.id);
					stack.push(next.id);
				}
			}
		}
		return closure;
	}

	function createDFAState(states: Set<number>): DFAState {
		const isAccepting = [...states].some(id => nfa[id]?.isAccepting);
		return {/*id: dfaStateId++, */nfaStates: states, transitions: [], isAccepting};
	}

	// Start with epsilon closure of initial state
	const start			= new Set([nfaStart.id]);
	const startClosure	= epsilonClosure(start);
	const startDFA		= createDFAState(startClosure);
	dfaStates.set(stateSetKey(startClosure), startDFA);

	const worklist = [startDFA];

	while (worklist.length > 0) {
		const currentDFA = worklist.pop()!;

		const transitions: {mask: SparseBits, ids: Set<number>}[] = [];

		for (const id of currentDFA.nfaStates) {
			for (const t of nfa[id].transitions) {
				const remaining = SparseBits.fromEntries(t.mask.clean().entries());

				for (const existing of transitions) {
					const overlap = existing.mask.intersect(t.mask);

					if (!overlap.empty()) {
						if (overlap.contains(existing.mask)) {
							existing.ids.add(t.state.id);

						} else {
							//split existing
							existing.mask.selfXor(overlap);
							transitions.push({mask: overlap, ids: new Set([...existing.ids, t.state.id])});
						}
						remaining.selfXor(overlap);
					}
				}
				// Add new transition if any remains
				if (!remaining.empty())
					transitions.push({mask: remaining, ids: new Set([t.state.id])});
			}
		}

		// Create DFA transitions from partitioned masks
		for (const next of transitions) {
			const nextClosure = epsilonClosure(next.ids);
			const key = stateSetKey(nextClosure);
			let nextDFA = dfaStates.get(key);
			if (!nextDFA) {
				nextDFA = createDFAState(nextClosure);
				dfaStates.set(key, nextDFA);
				worklist.push(nextDFA);
			}
			currentDFA.transitions.push({mask: next.mask, state: nextDFA});
		}
	}

	return startDFA;
}
/*
eager
export function runDFA(dfa: DFAState, str: string) {
    let currentState: DFAState = dfa;
    
    // Check if we start in accepting state
    if (currentState.isAccepting)
        return 0;

    for (let i = 0; i < str.length; i++) {
        const code = str.codePointAt(i)!;
        let found = false;
        for (const t of currentState.transitions) {
            if (t.mask.test(code)) {
                currentState = t.state;
                found = true;
                break;
            }
        }
        if (!found)
            return -1;
            
        // Stop immediately on first accepting state
        if (currentState.isAccepting)
            return i + 1;
    }
    
    return -1;
}
*/

export function runDFA(dfa: DFAState, str: string) {
	let currentState: DFAState = dfa;
	let lastAcceptPos = currentState.isAccepting ? 0 : -1;

	for (let i = 0; i < str.length; i++) {
		const code = str.codePointAt(i)!;
		let stop = true;
		for (const t of currentState.transitions) {
			if (t.mask.test(code)) {
				currentState = t.state;
				stop = false;
				break;
			}
		}
		if (stop)
			break;

		 // Update last accepting position after successful transition
		 if (code >= 0xffff)
			++i; // skip next for surrogate pairs
        if (currentState.isAccepting)
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
		const parts = parse(str, options.u, options.x); // validate
		return new this(NFAtoDFA(buildNFA(parts, options).start));
	}

}