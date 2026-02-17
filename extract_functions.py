import os
import re

migrations_dir = 'supabase/migrations'
sql_files = sorted([f for f in os.listdir(migrations_dir) if f.endswith('.sql')])

print(f"extracting functions from {len(sql_files)} files...")

functions_content = []

def is_commented(content, match_start):
    # Find the start of the line
    line_start = content.rfind('\n', 0, match_start) + 1
    line_prefix = content[line_start:match_start]
    return '--' in line_prefix

for filename in sql_files:
    filepath = os.path.join(migrations_dir, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract FUNCTIONS
    starts = [m.start() for m in re.finditer(r'CREATE\s+(OR\s+REPLACE\s+)?FUNCTION', content, re.IGNORECASE)]
    
    for start in starts:
        if is_commented(content, start):
            continue
            
        # Look for the first $$ after start
        dollar_match = re.search(r'\$\$', content[start:])
        if dollar_match:
            body_start_rel = dollar_match.start()
            body_start_abs = start + body_start_rel
            
            body_end_match = re.search(r'\$\$', content[body_start_abs + 2:])
            if body_end_match:
                body_end_rel = body_end_match.end() 
                body_end_abs = body_start_abs + 2 + body_end_rel
                
                semicolon_match = re.search(r';', content[body_end_abs:])
                if semicolon_match:
                    full_end = body_end_abs + semicolon_match.end()
                    func_def = content[start:full_end]
                    functions_content.append(f"-- From {filename}\n{func_def}\n")
    
    # Extract TRIGGERS
    trigger_iter = re.finditer(r'CREATE\s+TRIGGER\s+(\w+)\s+(?:.*?)\s+ON\s+([.\w]+)\s+(?:.*?);', content, re.DOTALL | re.IGNORECASE)
    
    for match in trigger_iter:
        if is_commented(content, match.start()):
            continue
            
        full_stmt = match.group(0)
        trigger_name = match.group(1)
        table_name = match.group(2)
        
        # Verify trigger_name and table_name are meant to be identifiers and not English words from comments
        # (e.g. "to" and "new")
        # Trigger names usually contain underscores or are camelCase, but simple words are possible.
        # But if it was "Create trigger to run on new...", the "to" is definitely suspicious if it comes from a comment.
        # Since we filter comments now, this false matching should be gone!
        
        drop_stmt = f"DROP TRIGGER IF EXISTS {trigger_name} ON {table_name};"
        functions_content.append(f"-- From {filename}\n{drop_stmt}\n{full_stmt}\n")

output_file = 'supabase/dev/functions_only.sql'
with open(output_file, 'w', encoding='utf-8') as f:
    f.write('\n'.join(functions_content))

print(f"Successfully created {output_file}")
