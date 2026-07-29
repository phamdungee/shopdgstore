const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ignoredDirectories = new Set(['.git', 'node_modules']);
const failures = [];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignoredDirectories.has(entry.name)) return [];
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });
}

const files = walk(root);
const javascriptFiles = files.filter((file) => file.endsWith('.js'));

for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: root,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    failures.push(`${path.relative(root, file)}: ${result.stderr.trim() || 'invalid JavaScript'}`);
  }
}

const dynamicReferencePattern = /\$\{|<%|{{/;
const externalReferencePattern = /^(?:[a-z]+:|\/\/|#)/i;
const assetPattern = /(?:src|href)=["']([^"']+)["']/gi;

for (const htmlFile of files.filter((file) => file.endsWith('.html'))) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  for (const match of html.matchAll(assetPattern)) {
    const reference = match[1].split(/[?#]/, 1)[0];
    if (!reference || externalReferencePattern.test(reference) || dynamicReferencePattern.test(reference)) continue;

    let decodedReference = reference;
    try {
      decodedReference = decodeURIComponent(reference);
    } catch {
      failures.push(`${path.relative(root, htmlFile)}: malformed URL ${reference}`);
      continue;
    }

    const target = decodedReference.startsWith('/')
      ? path.join(root, decodedReference.replace(/^[/\\]+/, ''))
      : path.resolve(path.dirname(htmlFile), decodedReference);

    if (!fs.existsSync(target) && !fs.existsSync(`${target}.html`)) {
      failures.push(`${path.relative(root, htmlFile)}: missing local reference ${reference}`);
    }
  }
}

if (failures.length) {
  console.error(`Validation failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Validation passed: ${javascriptFiles.length} JavaScript files and local HTML references checked.`);
