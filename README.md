# @isopodlabs/regex
[![npm version](https://img.shields.io/npm/v/@isopodlabs/regex.svg)](https://www.npmjs.com/package/@isopodlabs/regex)
[![GitHub stars](https://img.shields.io/github/stars/adrianstephens/ts-regex.svg?style=social)](https://github.com/adrianstephens/ts-regex)
[![License](https://img.shields.io/npm/l/@isopodlabs/regex.svg)](LICENSE.txt)

A comprehensive JavaScript/TypeScript regular expression parser that converts regex patterns into structured Abstract Syntax Trees (AST), and can also programmatically build regex patterns from AST nodes.

## ☕ Support My Work  
If you use this package, consider [buying me a cup of tea](https://coff.ee/adrianstephens) to support future updates!  

## Features

- **Complete JavaScript regex syntax support** - All standard regex features
- **Unicode support** - Proper handling of surrogate pairs and Unicode properties
- **Character classes** - Efficient bitset-based character class implementation
- **Groups and captures** - Named and numbered capture groups, non-capturing groups
- **Quantifiers** - Greedy and non-greedy quantifiers with full range support
- **Assertions** - Lookahead, lookbehind, word boundaries, anchors
- **Escape sequences** - All standard JavaScript escape sequences
- **Flag modifiers** - Inline flag modification with `(?flags:pattern)` syntax

## Usage

### Parsing Regex Patterns

```typescript
import { parse } from './regexp';

// Parse a regex pattern
const ast = parse('hello\\s+(world|universe)', true); // unicode=true

// Parse without Unicode support
const ast2 = parse('[a-z]+', false);
```

### Building Regex Programmatically

```typescript
import { 
  oneOrMore, optional, capture, anchored, 
  digit, lower, alpha, range, chars, union,
  repeat, reference, toRegExpString 
} from './regexp';

// Build: ^([a-z]+)(\d*)\1$
const pattern = anchored([
  capture(oneOrMore(lower)),
  capture(zeroOrMore(digit)),
  reference(1)
]);

// Convert AST to RegExp
const regex = new RegExp(toRegExpString(pattern));

// Mix direct helpers with character classes
const emailPattern = [
  oneOrMore(union(alpha, digit, chars('._-'))),
  '@',
  oneOrMore(union(alpha, digit, chars('.-'))),
  '.',
  repeat(alpha, 2, 4) // 2-4 letters
];
```

## Supported Syntax

### Character Classes
- `.` - Wildcard: matches any character except newlines
- `[abc]` - Character set
- `[^abc]` - Negated character set  
- `[a-z]` - Character ranges
- `\\d`, `\\w`, `\\s` - Predefined classes and their negations
- `\\p{Property}`, `\\P{Property}` - Unicode properties (Unicode mode only)

### Quantifiers
- `*`, `+`, `?` - Basic quantifiers
- `{n}`, `{n,}`, `{n,m}` - Numeric quantifiers
- `*?`, `+?`, `??` - Non-greedy variants

### Groups
- `(pattern)` - Capturing group
- `(?:pattern)` - Non-capturing group
- `(?<name>pattern)` - Named capturing group
- `(?=pattern)` - Positive lookahead
- `(?!pattern)` - Negative lookahead
- `(?<=pattern)` - Positive lookbehind
- `(?<!pattern)` - Negative lookbehind

### Flag Modifiers
- `(?i:pattern)` - Case insensitive
- `(?m:pattern)` - Multiline mode
- `(?s:pattern)` - Dotall mode
- `(?i-m:pattern)` - Enable case insensitive, disable multiline
- `(?-ims)` - Disable all flags (affects rest of pattern)

### Anchors and Boundaries
- `^` - Start of input
- `$` - End of input
- `\\b` - Word boundary
- `\\B` - Non-word boundary

### Backreferences
- `\\1`, `\\2`, etc. - Numbered backreferences
- `\\k<name>` - Named backreferences

### Escape Sequences
- `\\t`, `\\r`, `\\n`, `\\v`, `\\f` - Whitespace characters
- `\\0` - NUL character
- `\\cX` - Control characters
- `\\xHH` - Hexadecimal escape
- `\\uHHHH` - Unicode escape (16-bit)
- `\\u{HHHHH}` - Unicode code point (Unicode mode only)

## AST Structure

The parser returns a structured AST with these node types:

### Basic Types
```typescript
type part = string		//literal
	| part[]			//contenanation
	| alternation 		//alternation 
	| noncapture 		//noncapture 
	| capture 			//capture 
	| characterClass 	//characterClass 
	| unicode 			//unicode 
	| quantified 		//quantified 
	| boundary 			//boundary 
	| reference			//reference

```

### Node Types
- `alternation` - `|` operator
- `capture` - Capturing groups `(...)` and `(?<name>...)`
- `noncapture` - Non-capturing groups `(?:...)` and assertions
- `characterClass` - Character classes `[...]`
- `unicode` - Unicode property escapes `\\p{...}`
- `quantified` - Quantified expressions
- `boundary` - Anchors and word boundaries
- `reference` - Backreferences

### Helper Functions

These functions are designed for **programmatic regex construction**:

```typescript
// Quantifier helpers
zeroOrMore(part, greedy?)     // part*
oneOrMore(part, greedy?)      // part+
optional(part, greedy?)       // part?
repeat(part, min, max, greedy?)  // part{min,max}

// Group helpers
capture(part, name?)          // (part) or (?<name>part)
noncapture(part, flags?)      // (?:part) or (?flags:part)

// Boundary helpers
wordBoundary, nonWordBoundary // \b, \B
startAnchor, endAnchor        // ^, $

// Utility
anchored(part)               // ^part$
reference(number | name)     // \1 or \k<name>
toRegExpString(part)         // Convert AST to regex string

// Character class helpers
range(from, to)              // [from-to]
chars(string)                // [string] (literal chars)
union(...classes)            // Combine character classes

// Common character classes
any, digit, word, whitespace // ., \d, \w, \s
lower, upper, alpha, alnum   // [a-z], [A-Z], [a-zA-Z], [a-zA-Z0-9]
hex, octal                   // [0-9a-fA-F], [0-7]
```

## Character Class Implementation

Uses an efficient bitset-based `CharacterSet` class:

- **Memory efficient** - 32 characters per integer
- **Fast operations** - Bitwise operations for set math
- **Negation support** - Elegant handling via `undef` property
- **Unicode aware** - Works with code points and code units

## Unicode Support

When `unicode=true`:
- `\\u{HHHHH}` syntax supported for code points > 0xFFFF
- Proper surrogate pair handling
- Unicode property escapes `\\p{...}` enabled
- Character classes work with full Unicode range

When `unicode=false`:
- Works with UTF-16 code units only
- `\\u{...}` syntax throws error
- Unicode properties not supported
- Compatible with legacy JavaScript regex behavior

## Error Handling

Throws descriptive errors for:
- Unmatched parentheses
- Invalid escape sequences
- Malformed quantifiers
- Missing closing brackets
- Unicode syntax in non-Unicode mode

## Examples

### Parsing Examples

```typescript
// Simple pattern
parse('hello') 
// → "hello"

// Character class
parse('[a-z]+')
// → {type: 'quantified', part: {type: 'class', ...}, min: 1, max: -1}

// Capture group with alternation
parse('(foo|bar)')
// → {type: 'capture', part: {type: 'alt', parts: ["foo", "bar"]}}

// Unicode property
parse('\\p{Letter}', true)
// → {type: 'unicode', property: 'Letter'}
```

### Building Examples

```typescript
// Build a phone number pattern: ^\d{3}-\d{3}-\d{4}$
const digits = (n: number) => repeat(digit, n, n);
const phonePattern = anchored([digits(3), '-', digits(3), '-', digits(4)]);

// Build a URL pattern with named groups
const urlPattern = [
  capture(oneOrMore(lower), 'protocol'),
  '://',
  capture(oneOrMore(union(alnum, chars('.-'))), 'domain'),
  optional([
    '/',
    capture(zeroOrMore(any), 'path')
  ])
];

// Validate with backreference: (\w+)\s+\1
const duplicateWord = [
  capture(oneOrMore(word)),
  oneOrMore(whitespace),
  reference(1)
];

// Mix literal strings with character classes
const complexPattern = [
  'prefix-',                    // literal string
  repeat(hex, 8, 8),           // 8 hex digits
  '-',                         // literal dash
  optional(oneOrMore(word)),    // optional word characters
  endAnchor                    // end anchor
];

// Convert to actual RegExp
const regex = new RegExp(toRegExpString(phonePattern));
```
