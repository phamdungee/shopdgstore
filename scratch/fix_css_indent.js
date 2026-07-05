const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, '..', 'assets', 'css', 'common.css');
const content = fs.readFileSync(filepath, 'utf8');
const lines = content.split('\n');

console.log('Total lines:', lines.length);

const newLines = [];
for (let i = 0; i < lines.length; i++) {
  const lineNum = i + 1; // 1-indexed
  let line = lines[i];

  if (lineNum >= 3675 && lineNum <= 5029) {
    // Remove leading 4 spaces of extra indentation
    if (line.startsWith('    ')) {
      line = line.substring(4);
    } else if (line.startsWith('  ') && line.trim().length > 0) {
      line = line.substring(2);
    }
    newLines.push(line);
  } else if (lineNum === 5030) {
    // This is the extra closing brace from the broken nesting - remove it
    const trimmed = line.trim();
    if (trimmed === '}') {
      console.log(`Removing extra closing brace at line ${lineNum}: '${line}'`);
      // Skip this line
      continue;
    } else {
      newLines.push(line);
    }
  } else {
    newLines.push(line);
  }
}

console.log('New total lines:', newLines.length);
fs.writeFileSync(filepath, newLines.join('\n'), 'utf8');
console.log('Done! File has been fixed.');
