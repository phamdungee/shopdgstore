import os

filepath = r'd:\dgstore-main\dgstore-main\assets\css\common.css'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")

# Lines 3675 to 5030 (0-indexed: 3674 to 5029) need un-indenting by 4 spaces
# Line 5030 (0-indexed: 5029) is the extra closing brace "  }" that needs to be removed

new_lines = []
for i, line in enumerate(lines):
    line_num = i + 1  # 1-indexed
    
    if 3675 <= line_num <= 5029:
        # Remove leading 4 spaces (or 2 levels of 2-space indent)
        if line.startswith('    '):
            line = line[4:]
        elif line.startswith('  '):
            line = line[2:]
        new_lines.append(line)
    elif line_num == 5030:
        # Skip this line - it's the extra closing brace from the broken nesting
        stripped = line.strip()
        if stripped == '}':
            print(f"Removing extra closing brace at line {line_num}: '{line.rstrip()}'")
            continue
        else:
            new_lines.append(line)
    else:
        new_lines.append(line)

print(f"New total lines: {len(new_lines)}")

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Done! File has been fixed.")
