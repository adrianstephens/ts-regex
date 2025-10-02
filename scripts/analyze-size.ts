import * as fs from 'fs';

// Quick analysis of unicode-data.ts file
function analyzeUnicodeData() {
    const content = fs.readFileSync('../src/unicode-data.ts', 'utf-8');
    
    // Count different types of content
    const bitsetMatches = content.match(/\{[\d:,x]+\}/g) || [];
    const fromRangesMatches = content.match(/fromRanges\([^\)]+\)/g) || [];
    const charsMatches = content.match(/chars: \[[^\]]+\]/g) || [];
    
    // Calculate sizes
    const bitsetSize = bitsetMatches.reduce((sum, match) => sum + match.length, 0);
    const fromRangesSize = fromRangesMatches.reduce((sum, match) => sum + match.length, 0);
    const charsSize = charsMatches.reduce((sum, match) => sum + match.length, 0);
    const totalSize = content.length;
    
    console.log('Unicode Data Size Analysis:');
    console.log(`Total file size: ${totalSize} characters`);
    console.log(`Bitsets: ${bitsetSize} chars (${(bitsetSize/totalSize*100).toFixed(1)}%)`);
    console.log(`fromRanges: ${fromRangesSize} chars (${(fromRangesSize/totalSize*100).toFixed(1)}%)`);
    console.log(`chars arrays: ${charsSize} chars (${(charsSize/totalSize*100).toFixed(1)}%)`);
    
    console.log(`\nCounts:`);
    console.log(`Bitset objects: ${bitsetMatches.length}`);
    console.log(`Range objects: ${fromRangesMatches.length}`);
    console.log(`Chars arrays: ${charsMatches.length}`);
    
    // Estimate structure overhead
    const dataSize = bitsetSize + fromRangesSize + charsSize;
    const structureOverhead = totalSize - dataSize;
    console.log(`\nEstimated structure overhead: ${structureOverhead} chars (${(structureOverhead/totalSize*100).toFixed(1)}%)`);
}

analyzeUnicodeData();