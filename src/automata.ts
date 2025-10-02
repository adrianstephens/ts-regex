import { any, word, eol, part, characterClass, chars } from './types';
import * as parse from './parse';
import { bits } from '@isopodlabs/utilities';

const anyButEOL = any.intersect(eol.complement()); // any except EOL

//-----------------------------------------------------------------------------
//	EmptyOp
//-----------------------------------------------------------------------------

// Bit flags for empty-width specials
const EmptyFlags = {
	None 			: 0,
	WordBoundary 	: 1 << 0,		// \b - word boundary
	NonWordBoundary	: 1 << 1,		// \B - not \b
	BeginText 		: 1 << 2,		// \A - beginning of text
	EndText 		: 1 << 3,		// \z - end of text
	BeginLine 		: 1 << 4,		// ^  - beginning of line
	EndLine 		: 1 << 5,		// $  - end of line
	BeginWord 		: 1 << 6,		// \< - beginning of word
	EndWord 		: 1 << 7,		// \> - end of word
	Bits 			: 8,

	// search only
//	Anchor			: 1 << 8,
//	Longest			: 1 << 9,
//	NoEndLines		: 1 << 10,		// do not match $ to \n

//	Never		: WordBoundary | NonWordBoundary,
//	Begins		: BeginText | BeginLine | BeginWord,
//	Ends		: Begins << 1,
} as const;

//const EmptyBegins	= EmptyFlags.BeginText | EmptyFlags.BeginLine | EmptyFlags.BeginWord;
//const EmptyEnds		= EmptyBegins << 1;

type EmptyFlags = number;//(typeof EmptyFlags)[keyof typeof EmptyFlags];

//reverse begin/end flags
//function emptyReverse(op: EmptyFlags): EmptyFlags			{ return op & ~(EmptyBegins|EmptyEnds) | ((op & EmptyBegins) << 1) | ((op & EmptyEnds) >> 1); }
function emptyCheck(a: EmptyFlags, b: EmptyFlags): boolean	{ return !(a & ~b); }

// Returns the set of Empty flags that are in effect at position p
function UpdateEmpty(enable: EmptyFlags, p: string, pos: number): EmptyFlags {
	let		flags		= EmptyFlags.None;
	let		was_word	= false;
	let		is_word		= false;

	// ^ \A \<
	if (enable & EmptyFlags.BeginText) {
		flags |= EmptyFlags.BeginText | EmptyFlags.BeginLine;
	} else {
		if ((enable & EmptyFlags.BeginWord) && pos > 0) {
			const c = p[pos - 1];
			if ((enable & EmptyFlags.BeginLine) && c == '\n')
				flags |= EmptyFlags.BeginLine;
			was_word = word.testChar(c);
		}
	}

	// $ \z \>
	if (enable & EmptyFlags.EndText) {
		flags |= EmptyFlags.EndText | EmptyFlags.EndLine;
	} else {
		if ((enable & EmptyFlags.EndWord)) {
			const c = p[pos];
			if ((enable & EmptyFlags.EndLine) && (c == '\r' || c == '\n'))
				flags |= EmptyFlags.EndLine;
			is_word	= word.testChar(c);
		}
	}

	// \b \B
	return flags | (is_word == was_word ? EmptyFlags.NonWordBoundary : (EmptyFlags.WordBoundary | (is_word ? EmptyFlags.BeginWord : EmptyFlags.EndWord)));
}

//-----------------------------------------------------------------------------
// Thompson NFA
//-----------------------------------------------------------------------------

interface options {i?: boolean; m?: boolean; s?: boolean};

	
interface NFATransition {
	mask: characterClass | EmptyFlags;
	state: NFAState;
}

interface NFAState {
	id:			number;
	onEnter?:	(str: string, pos: number, captures: Record<number|string, [number, number]>) => [next: NFAState, newPos: number] | void;
	transition?: NFATransition;		// for subset construction
	epsilons:	NFAState[];			// ε-transitions
	accepting?:	boolean;
	lazy?:		boolean;
	accept?:	NFAState;			// for traversal
	part?:		part; // for debugging
}

interface Fragment {
	run: (str: string, pos: number, captures?: Record<number|string, [number, number]>) => number;
}

function Fragment(start: NFAState, accept: NFAState): Fragment {
	accept.accepting = true;

	if (canDFA(start, accept)) {
		const dfa = NFAtoDFA(start);
		return {
			run: (str, pos, _captures) => runDFA(dfa, str, pos),
		};
	}

	return {
		run: (str, pos, captures) => captures ? runNFA(start, str, pos, captures) : runNFASimple(start, str, pos)
	};
}

export function buildNFA(part: part, options: options = {i:false, m:false, s:false}): {start: NFAState, accept: NFAState} {
	let captureId = 0;
	let stateId = 0;

	const deferred: (() => void)[] = [];

	function newState(): NFAState {
		return {id: stateId++, epsilons: []};
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

			for (let i = 0; i < p.length; i++) {
				const next = i === p.length - 1 ? accept : newState();
				start.transition = {mask: chars(p[i]), state: next};
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
					const frag = Fragment(fragStart, fragAccept);

					if (p.max === -1) {
						start.onEnter = (str, pos, captures) => {
							let end;
							while ((end = frag.run(str, pos, captures)) >= 0 && end !== pos)
								pos = end;
							return [accept, pos];
						};
					} else {
						start.onEnter = (str, pos, captures) => {
							for (let i = p.min, end; i < p.max; i++) {
								if ((end = frag.run(str, pos, captures)) < 0 || end === pos)
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
				start.transition = {mask: EmptyFlags.WordBoundary, state: accept};
				return accept;

			case 'nowordbound':
				start.onEnter = (str, pos, _captures) =>
					word.testChar(str[pos - 1]) === word.testChar(str[pos]) ? [accept, pos] : undefined;
				start.transition = {mask: EmptyFlags.NonWordBoundary, state: accept};
				return accept;

			case 'inputboundstart':
				if (options.m) {
					start.onEnter = (str, pos, _captures) =>
						pos === 0 || eol.testChar(str[pos - 1]) ? [accept, pos] : undefined;
					start.transition = {mask: EmptyFlags.BeginLine, state: accept};
				} else {
					start.onEnter = (str, pos, _captures) =>
						pos === 0 ? [accept, pos] : undefined;
					start.transition = {mask: EmptyFlags.BeginText, state: accept};
				}
				return accept;

			case 'inputboundend': {
				if (options.m) {
					start.onEnter = (str, pos, _captures) =>
						pos === str.length || eol.testChar(str[pos]) ? [accept, pos] : undefined;
					start.transition = {mask: EmptyFlags.EndLine, state: accept};
				} else {
					start.onEnter = (str, pos, _captures) =>
						pos === str.length ? [accept, pos] : undefined;
					start.transition = {mask: EmptyFlags.EndText, state: accept};
				}
				return accept;
			}

			case 'noncapture':
				if (typeof p.options === 'string') {
					const fragStart		= newState();
					const fragAccept	= build(p.part, fragStart);
					const frag			= Fragment(fragStart, fragAccept);

					if (p.options === 'atomic') {
						// Atomic group: match the pattern completely without backtracking
						start.onEnter = (str, pos, captures) => {
							const end = frag.run(str, pos, captures);
							if (end >= 0)
								return [accept, end];
						};
						return accept;

					} else {
						if (p.options === 'ahead' || p.options === 'neg_ahead') {
							// Lookahead: check if pattern matches starting at current position
							const isPositive = p.options === 'ahead';
							start.onEnter = (str, pos, _captures) => {
								if ((frag.run(str, pos) === str.length) === isPositive)
									return [accept, pos];
							};

						} else {
							// Lookbehind: check if pattern matches ending at current position
							const isPositive = p.options === 'behind';
							start.onEnter = (str, pos, _captures) => {
								for (let start = 0; start <= pos; start++) {
									if ((frag.run(str, start) === pos) === isPositive)
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

				deferred.push(() => {
					//don't use Fragment - we can't set accept.accepting here
					if (canDFA(fragStart, fragAccept)) {
						fragAccept.accepting = true;	//ok now we know it's self-contained
						const dfa = NFAtoDFA(fragStart);
						start.onEnter = (str, pos, captures) => {
							captures[id] = [pos, -1];
							const end = runDFA(dfa, str, pos);
							if (end >= 0) {
								captures[id][1] = end;
								return [accept, end];
							}
						};
					} else {
						start.onEnter = (str, pos, captures) => {
							captures[id] = [pos, -1];
							return [fragStart, pos];
						};
						fragAccept.onEnter = (str, pos, captures) => {
							if (captures[id])
								captures[id][1] = pos;
						};
					}
				});

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
			//default:
			//	throw new Error(`Unsupported: ${p.type}`);
		}
	}

	const start		= newState();
	const accept	= build(part, start);
//	accept.accepting = true;

	while (deferred.length > 0)
		deferred.pop()!();
/*
	const frag = Fragment(start, accept);
	if (canDFA(start, accept)) {
		// Convert to DFA and wrap in an NFA state
		const dfa = NFAtoDFA(start);
		start.onEnter = (str, pos, _captures) => {
			const end = runDFA(dfa, str, pos);
			if (end >= 0)
				return [accept, end];
		};
	}
*/
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
	constructor(public frag: Fragment) {}
	run(str: string) {
		const captures: Record<number|string, [number, number]> = {};
		const end = this.frag.run(str, 0, captures);
		if (end >= 0) {
			captures[0] = [0, end];
			return Object.fromEntries(Object.entries(captures).map(([id, v]) => [id, str.substring(v[0], v[1])]));
		}
	}

	static fromParts(parts: part, options: options = {}) {
		const {start, accept} = buildNFA(parts, options);
		const frag = Fragment(start, accept);
		return new this(frag);
	}

	static fromString(str: string, options: options & {u?: boolean, x?: boolean} = {}) {
		const parts = parse.parse(str, options.u, options.x); // validate
		return this.fromParts(parts, options);
	}

}

//-----------------------------------------------------------------------------
//	Deterministic Finite Automaton (DFA)
//-----------------------------------------------------------------------------

interface DFAState {
	transitions:	{
		mask:	bits.SparseBits2,
		flags:	EmptyFlags,
		state:	DFAState
	}[];
	accepting:		boolean;
}

type FlaggedNFA = [EmptyFlags, NFAState];

// Epsilon closure - find all states reachable via ε-transitions

function epsilonClosure(states: Set<NFAState>): FlaggedNFA[] {
	const closure = new Map<string, FlaggedNFA>();
	const stack: FlaggedNFA[] = [];

	function addState(state: NFAState, flags: EmptyFlags) {
		const key = `${flags}-${state.id}`;
		if (!closure.has(key)) {
			const flagged: FlaggedNFA = [flags, state];
			closure.set(key, flagged);
			stack.push(flagged);
		}
	}

	states.forEach(s => addState(s, EmptyFlags.None));

	while (stack.length > 0) {
		const [flags, state] = stack.pop()!;
		
		// Handle boundary transitions
		if (typeof state.transition?.mask === 'number')
			addState(state.transition.state, flags | state.transition.mask);

		// Handle epsilon transitions
		for (const next of state.epsilons)
			addState(next, flags);
	}

	return Array.from(closure.values());
}

function partitionTransitions(flaggedStates: FlaggedNFA[]) {
	const transitions: {
		mask:	bits.SparseBits2,
		flags:	EmptyFlags,
		states:	Set<NFAState>
	}[] = [];	
	
	for (const [flags, state] of flaggedStates) {
		if (state.transition && typeof state.transition.mask !== 'number') {
			const mask = state.transition.mask;
			const remaining = mask.copy();

			// Check against existing partitions for overlaps WITH SAME FLAGS
			for (const existing of transitions) {
				// Only consider partitions with matching flags
				if (existing.flags === flags) {
					const overlap = existing.mask.intersect(mask);

					if (!overlap.empty()) {
						if (overlap.contains(existing.mask)) {
							existing.states.add(state.transition.state);

						} else {
							//split existing
							existing.mask.selfXor(overlap);
							transitions.push({
								mask: overlap, 
								flags,
								states: new Set([...existing.states, state.transition.state])
							});
						}
						remaining.selfXor(overlap);
					}
				}
			}
			
			// Add new transition if any remains
			if (!remaining.empty()) {
				transitions.push({
					mask: remaining, 
					flags,
					states: new Set([state.transition.state])
				});
			}
		}
	}

	return transitions;
}

function canDFA(start: NFAState, end: NFAState): boolean {
	const visited = new Set<NFAState>([end]);
	const sectionMask = new bits.SparseBits2();

	function recurse(state: NFAState): boolean {
		if (visited.has(state))
			return true;
		visited.add(state);

		const closure = epsilonClosure(new Set([state]));
		const combined = new bits.SparseBits2();
		
		for (const [_flags, s] of closure) {
			// Lazy quantifiers create non-deterministic behavior
			if (s.lazy)
				return false;

			if (s.transition) {
				if (typeof s.transition.mask !== 'number') {
					if (!combined.intersect(s.transition.mask).empty())
						return false;

					combined.selfUnion(s.transition.mask);
				}
				// Follow transition to target state(s)
				if (!recurse(s.transition.state))
					return false;

			} else if (s.onEnter) {
				// States with onEnter but no transition are non-deterministic 
				return false;
			}
		}

		sectionMask.selfUnion(combined);
		return true;
	}

	if (!recurse(start))
		return false;

	// Check that this NFA fragment won't consume characters meant for following parts
	const endStates = epsilonClosure(new Set([end]));
	for (const [_flags, state] of endStates) {
		if (state.transition && typeof state.transition.mask !== 'number') {
			if (!sectionMask.intersect(state.transition.mask).empty())
				return false;
		}
	}

	return true;
}


// Subset Construction - convert NFA to DFA
function NFAtoDFA(nfaStart: NFAState): DFAState {
	const dfaStates = new Map<string, DFAState>();

	function createDFAState(states: Set<NFAState>): DFAState {
		const closure = epsilonClosure(states);
		
		// Create a key that includes both state IDs and their boundary flags
		const stateKey = closure
			.map(([flags, state]) => `${state.id}:${flags}`)
			.sort()
			.join(',');
			
		if (dfaStates.has(stateKey))
			return dfaStates.get(stateKey)!;

		const dfa: DFAState = {
			transitions: [],
			accepting: [...closure].some(([_flags, s]) => s.accepting)
		};
		
		dfaStates.set(stateKey, dfa);

		// Create DFA transitions from partitioned masks
		const transitions = partitionTransitions(closure);
		for (const next of transitions) {
			dfa.transitions.push({
				mask: next.mask, 
				flags: next.flags, 
				state: createDFAState(next.states)
			});
		}
		
		return dfa;
	}

	// Start with initial state
	return createDFAState(new Set([nfaStart]));
}

export function runDFA(state: DFAState, str: string, pos = 0): number {
	let lastAccept	= state.accepting ? 0 : -1;
	let	enable1		= EmptyFlags.BeginWord | EmptyFlags.BeginLine | EmptyFlags.BeginText | EmptyFlags.EndWord | EmptyFlags.EndLine;

	while (pos < str.length) {
		const flags = UpdateEmpty(enable1, str, pos);
		const code = str.codePointAt(pos)!;
		let stop = true;
		for (const t of state.transitions) {
			if (emptyCheck(t.flags, flags) && t.mask.test(code)) {
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
			lastAccept = pos;

		enable1 = (enable1 & ~EmptyFlags.BeginText) | EmptyFlags.BeginWord | EmptyFlags.BeginLine;
	}
	return lastAccept;
}
