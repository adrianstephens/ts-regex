import { part } from './types';

//-----------------------------------------------------------------------------
// Thompson NFA and Subset Construction to DFA
//-----------------------------------------------------------------------------

interface NFAState {
	id: number;
	transitions: Map<string, NFAState[]>;	// char -> states
	epsilonTransitions: NFAState[];			// ε-transitions
	isAccepting: boolean;
}

interface DFAState {
//	id: number;
	nfaStates: Set<number>;					// which NFA states this represents
	transitions: Map<string, DFAState>;		// char -> single DFA state
	isAccepting: boolean;
}

// Step 1: Build Thompson NFA from regex AST
function buildNFA(part: part): {start: NFAState, accept: NFAState} {
	let stateId = 0;

	function newState(): NFAState {
		return {id: stateId++, transitions: new Map(), epsilonTransitions: [], isAccepting: false};
	}

	function build(p: part): {start: NFAState, accept: NFAState} {
		if (typeof p === 'string') {
			/*
			// Character literal: start --'c'--> accept
			const start		= newState();
			const accept	= newState();
			start.transitions.set(p, [accept]);
			return {start, accept};
			*/
			// String literal: chain character transitions
			let accept = newState();
			const start = accept;
			
			for (const char of p) {
				const next = newState();
				accept.transitions.set(char, [next]);
				accept = next;
			}
			return { start, accept };
		}

		if (Array.isArray(p)) {
			const current = build(p[0]);
			for (let i = 1; i < p.length; i++) {
				const next = build(p[i]);
				current.accept.epsilonTransitions.push(next.start);
				current.accept = next.accept;
			}
			return current;
		}

		switch (p.type) {
			case 'alt': {
				// Alternation: start --ε--> frag1.start, frag2.start, ... --ε--> accept
				const start		= newState();
				const accept	= newState();
				for (const alt of p.parts) {
					const frag = build(alt);
					start.epsilonTransitions.push(frag.start);
					frag.accept.epsilonTransitions.push(accept);
				}
				return {start, accept};
			}

			case 'quantified': {
				const frag		= build(p.part);
				const start		= newState();
				const accept	= newState();

				// Handle min repetitions
				let current = start;
				for (let i = 0; i < p.min; i++) {
					const copy = build(p.part);
					current.epsilonTransitions.push(copy.start);
					current = copy.accept;
				}

				// Handle optional repetitions or infinite
				if (p.max === -1) {
					// Infinite: can loop back
					current.epsilonTransitions.push(frag.start);
					frag.accept.epsilonTransitions.push(frag.start, accept);
				} else {
					// Finite: add optional copies
					for (let i = p.min; i < p.max; i++) {
						current.epsilonTransitions.push(accept); // can skip
						const copy = build(p.part);
						current.epsilonTransitions.push(copy.start);
						current = copy.accept;
					}
				}
				current.epsilonTransitions.push(accept);
				return {start, accept};
			}

			case 'class': {
				// Character class: single transition with multiple chars
				const start		= newState();
				const accept	= newState();

				//if (p.contains(any))
				//	return '.';

				// Add transition for each character in the class
				for (let i = p.next(-1); i !== -1; i = p.next(i)) {
					const char = String.fromCodePoint(i);
					start.transitions.set(char, [accept]);
				}

				return {start, accept};
			}

			case 'wordbound':
			case 'nowordbound':
			case 'inputboundstart':
			case 'inputboundend': {
				// Anchors: epsilon transition with special handling
				const start		= newState();
				const accept	= newState();

				// Mark transition with anchor type for special processing
				start.transitions.set(`__${p.type}__`, [accept]);

				return {start, accept};
			}

			case 'noncapture':
			case 'capture':
				// Groups: just pass through (captures handled at higher level)
				return build(p.part);

			default:
				throw new Error(`Unsupported: ${p.type}`);
		}
	}

	const result = build(part);
	result.accept.isAccepting = true;
	return result;
}


// Step 3: Subset Construction - convert NFA to DFA
function NFAtoDFA(nfaStart: NFAState): DFAState {
	const nfa: NFAState[] = [];
	const alphabet	= new Set<string>();

	function collectStates(state: NFAState) {
		if (!nfa[state.id]) {
			nfa[state.id] = state;

			for (const char of state.transitions.keys())
				alphabet.add(char);
			for (const targets of state.transitions.values())
				targets.forEach(collectStates);
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
		return {/*id: dfaStateId++, */nfaStates: states, transitions: new Map(), isAccepting};
	}

	// Start with epsilon closure of initial state
	const start			= new Set([nfaStart.id]);
	const startClosure	= epsilonClosure(start);
	const startDFA		= createDFAState(startClosure);
	dfaStates.set(stateSetKey(startClosure), startDFA);

	const worklist = [startDFA];

	while (worklist.length > 0) {
		const currentDFA = worklist.pop()!;

		// For each character in alphabet
		for (const char of alphabet) {
			// Collect all NFA states reachable by this character
			const next = new Set<number>();
			for (const id of currentDFA.nfaStates) {
				const targets	= nfa[id]?.transitions.get(char) || [];
				targets.forEach(target => next.add(target.id));
			}

			if (next.size > 0) {
				// Take epsilon closure of the result
				const nextClosure = epsilonClosure(next);

				// Check if this set of NFA states already has a corresponding DFA state
				const key = stateSetKey(nextClosure);
				let nextDFA = dfaStates.get(key);
				if (!nextDFA) {
					nextDFA = createDFAState(nextClosure);
					dfaStates.set(key, nextDFA);
					worklist.push(nextDFA);
				}
				currentDFA.transitions.set(char, nextDFA);
			}
		}
	}

	return startDFA;
}

export function regexToDFA(part: part): DFAState {
	const nfa = buildNFA(part);
	return NFAtoDFA(nfa.start);
}

export function runDFA(dfa: DFAState, str: string) {
	let currentState: DFAState|undefined = dfa;

	for (const char of str) {
		currentState = currentState.transitions.get(char);
		if (!currentState)
			return false;
	}
	return currentState.isAccepting;
}
