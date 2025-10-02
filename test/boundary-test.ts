import { NFA } from '../src/automata';

// Test boundary handling in DFA construction
console.log('Testing boundary flag handling...');

// Test word boundaries
const wordBoundary = NFA.fromString('\\btest\\b');
console.log('\\btest\\b matches "test":', wordBoundary.run('test')?.[0] === 'test');
console.log('\\btest\\b matches " test ":', wordBoundary.run(' test ')?.[0] === 'test');
console.log('\\btest\\b rejects "testing":', !wordBoundary.run('testing'));

// Test line boundaries
const lineBoundary = NFA.fromString('^test$', {m: true});
console.log('^test$ (multiline) matches "test":', lineBoundary.run('test')?.[0] === 'test');
console.log('^test$ (multiline) matches "\\ntest\\n":', lineBoundary.run('\ntest\n')?.[0] === 'test');

// Test mixed boundaries - this should trigger DFA construction with proper flag handling
const mixed = NFA.fromString('\\b[a-z]+\\b');
console.log('\\b[a-z]+\\b matches "hello world":', mixed.run('hello world')?.[0] === 'hello');