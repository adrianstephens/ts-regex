import { any, word, eol, part } from './types';
import * as parse from './parse';
import { bits } from '@isopodlabs/utilities';

type SparseBits = bits.SparseBits;
const { SparseBits } = bits;

const anyButEOL = any.intersect(eol.complement()); // any except EOL

//-----------------------------------------------------------------------------
//	EmptyOp
//-----------------------------------------------------------------------------
/*
// Bit flags for empty-width specials
enum Empty {
	None 			= 0,
	WordBoundary 	= 1 << 0,		// \b - word boundary
	NonWordBoundary	= 1 << 1,		// \B - not \b
	BeginText 		= 1 << 2,		// \A - beginning of text
	EndText 		= 1 << 3,		// \z - end of text
	BeginLine 		= 1 << 4,		// ^  - beginning of line
	EndLine 		= 1 << 5,		// $  - end of line
	BeginWord 		= 1 << 6,		// \< - beginning of word
	EndWord 		= 1 << 7,		// \> - end of word
	Bits 			= 8,

	// search only
	Anchor			= 1 << 8,
	Longest			= 1 << 9,
//	NoEndLines		= 1 << 10,		// do not match $ to \n

	Never		= WordBoundary | NonWordBoundary,
	Begins		= BeginText | BeginLine | BeginWord,
	Ends		= Begins << 1,
};

//reverse begin/end flags
function	reverse(op: Empty): Empty			{ return op & ~(Empty.Begins|Empty.Ends) | ((op & Empty.Begins) << 1) | ((op & Empty.Ends) >> 1); }
function	check(a: Empty, b: Empty): boolean	{ return !(a & ~b); }

// Returns the set of EmptyOp. flags that are in effect at position p
function EmptyFlags(enable: Empty, p: string, pos: number): Empty {
	let		flags		= Empty.None;
	let		was_word	= false;
	let		is_word		= false;

	// ^ \A \<
	if (enable & Empty.BeginText) {
		flags |= Empty.BeginText | Empty.BeginLine;
	} else {
		if ((enable & Empty.BeginWord) && p[pos]) {
			const c = p[pos - 1];
			if ((enable & Empty.BeginLine) && c == '\n')
				flags |= Empty.BeginLine;
			was_word = word.testChar(c);
		}
	}

	// $ \z \>
	if (enable & Empty.EndText) {
		flags |= Empty.EndText | Empty.EndLine;
	} else {
		if ((enable & Empty.EndWord)) {
			const c = p[pos];
			if ((enable & Empty.EndLine) && (c == '\r' || c == '\n'))
				flags |= Empty.EndLine;
			is_word	= word.testChar(c);
		}
	}

	// \b \B
	return flags | (is_word == was_word ? Empty.NonWordBoundary : (Empty.WordBoundary | (is_word ? Empty.BeginWord : Empty.EndWord)));
}
*/
//-----------------------------------------------------------------------------
// Thompson NFA
//-----------------------------------------------------------------------------

interface options {i?: boolean; m?: boolean; s?: boolean};

interface NFATransition {
	mask: SparseBits;
	state: NFAState;
}

interface NFAState {
	onEnter?:	(str: string, pos: number, captures: Record<number|string, [number, number]>) => [next: NFAState, newPos: number] | void;
	transition?: NFATransition;		// for subset construction
	epsilons:	NFAState[];			// ε-transitions
	accepting?:	boolean;
	lazy?:		boolean;
	accept?:	NFAState;			// for traversal
	//part?: part; // for debugging
}

export function buildNFA(part: part, options: options = {i:false, m:false, s:false}): {start: NFAState, accept: NFAState} {
	let captureId = 0;
	//let stateId = 0;

	function newState(): NFAState {
		return {/*id: stateId++, */epsilons: []};
	}

	function build(p: part, start: NFAState, _accept?: NFAState): NFAState {
		const accept = _accept ?? newState();
		start.accept = accept;
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

			for (const char of p) {
				const next = (char === p[p.length - 1]) ? accept : newState();
				start.transition = {mask: SparseBits.fromIndices(char.charCodeAt(0)), state: next};
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

				if (p.mod === 'possessive') {
					const fragStart = newState();
					const fragAccept = build(p.part, fragStart);
					fragAccept.accepting = true;

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
							start.epsilons.push(accept); // can skip
							start = build(p.part, start);
							if (p.mod ==='lazy')
								start.lazy = true;
						}
					}
					start.epsilons.push(accept);
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

				start.transition = {mask: set, state: accept};
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
						fragAccept.accepting = true;
						
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
				const fragStart = newState();
				const fragAccept = build(p.part, fragStart);
				const id = p.name || ++captureId;

			    if (canDFA(fragStart)) {
					// Convert to DFA and wrap in an NFA state
					fragAccept.accepting = true;
					const dfa = NFAtoDFA(fragStart);
					start.onEnter = (str, pos, captures) => {
						captures[id] = [pos, -1];
						const end = runDFA2(dfa, str, pos);
						if (end >= 0)
							return [accept, end];
					};
				} else {
					start.onEnter = (str, pos, captures) => {
						captures[id] = [pos, -1];
						return [fragStart, pos];
					};
				}

				accept.onEnter = (str, pos, captures) => {
					if (captures[id])
						captures[id][1] = pos;
				};


				fragAccept.epsilons.push(accept);
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
	accept.accepting = true;

	if (canDFA(start)) {
		// Convert to DFA and wrap in an NFA state
		const dfa = NFAtoDFA(start);
		start.onEnter = (str, pos, _captures) => {
			const end = runDFA2(dfa, str, pos);
			if (end >= 0)
				return [accept, end];
		};
	}

	return {start, accept};
}

// Simplified runner for lookaround patterns
export function runNFASimple(nfa: NFAState, str: string, pos: number): number {
	function recurse(state: NFAState, pos: number): number {

		// Linear execution for states without epsilon transitions
		while (state.epsilons.length === 0) {
			const redirect = state.onEnter?.(str, pos, {});
			if (!redirect)
				return state.accepting ? pos : -1;

			state	= redirect[0];
			pos		= redirect[1];
		}

		if (state.lazy) {
			// Lazy: try epsilon transitions first (exit early)
			for (const next of state.epsilons) {
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
		if (state.accepting)
			return pos;

		if (!state.lazy) {
			// Try epsilon transitions last
			for (const next of state.epsilons) {
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
		while (state.epsilons.length === 0) {
			const redirect = state.onEnter?.(str, pos, captures);
			if (!redirect) {
				if (!state.accepting)
					restoreCaptures();
				return state.accepting ? pos : -1;
			}

			state	= redirect[0];
			pos		= redirect[1];
		}

		if (state.lazy) {
			// Lazy: try epsilon transitions first (exit early)
			for (const next of state.epsilons) {
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
		if (state.accepting)
			return pos;

		if (!state.lazy) {
			// Try epsilon transitions last
			for (const next of state.epsilons) {
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
		const end = runNFA(this.start, str, 0, captures);
		if (end >= 0) {
			captures[0] = [0, end];
			return captures;
		}
	}

	static fromParts(parts: part, options: options = {}) {
		return new this(buildNFA(parts, options).start);
	}

	static fromString(str: string, options: options & {u?: boolean, x?: boolean} = {}) {
		const parts = parse.parse(str, options.u, options.x); // validate
		return new this(buildNFA(parts, options).start);
	}

}

//-----------------------------------------------------------------------------
//	Deterministic Finite Automaton (DFA)
//-----------------------------------------------------------------------------

function canDFA(nfa: NFAState): boolean {
//	return false;
	const visited = new Set<NFAState>();
	function visit(state: NFAState) {
		if (visited.has(state))
			return true;

		visited.add(state);

		if (state.lazy)
			return false;

		if (state.onEnter && !state.transition) {
			//if (state.epsilons.length > 0)
				return false;
		}

		if (state.accept && !visit(state.accept))
			return false;

		for (const next of state.epsilons) {
			if (!visit(next))
				return false;
		}

		return true;
	}
	return visit(nfa);
}

interface DFAState {
	transitions:	{mask: SparseBits, state: DFAState}[];
	accepting:		boolean;
}

// Subset Construction - convert NFA to DFA
function NFAtoDFA(nfaStart: NFAState): DFAState {
	const nfaStates = new Map<NFAState, number>();
	const dfaStates	= new Map<string, DFAState>();

	// Make Ids for NFA states
	let nfaId = 0;
	function collectStates(state: NFAState) {
		if (!nfaStates.has(state)) {
			nfaStates.set(state, ++nfaId);
			if (state.transition)
				collectStates(state.transition.state);
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
			if (state.transition) {
				const remaining = state.transition.mask.copy();

				// Check against existing partitions for overlaps
				for (const existing of transitions) {
					const overlap = existing.mask.intersect(state.transition.mask);

					if (!overlap.empty()) {
						if (overlap.contains(existing.mask)) {
							existing.states.add(state.transition.state);

						} else {
							//split existing
							existing.mask.selfXor(overlap);
							transitions.push({mask: overlap, states: new Set([...existing.states, state.transition.state])});
						}
						remaining.selfXor(overlap);
					}
				}
				// Add new transition if any remains
				if (!remaining.empty())
					transitions.push({mask: remaining, states: new Set([state.transition.state])});
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

export function runDFA2(dfa: DFAState, str: string, pos = 0): number {
	let state: DFAState = dfa;
	let lastAcceptPos	= state.accepting ? 0 : -1;

	while (pos < str.length) {
		const code = str.codePointAt(pos)!;
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

		pos += code >= 0xffff ? 2 : 1;

		 // Update last accepting position after successful transition
		if (state.accepting)
			lastAcceptPos = pos;
	}
	return lastAcceptPos;
}
