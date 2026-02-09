import os
import re

migrations_dir = 'supabase/migrations'
sql_files = sorted([f for f in os.listdir(migrations_dir) if f.endswith('.sql')])

print(f"Checking {len(sql_files)} files for nested DO blocks...")

for filename in sql_files:
    filepath = os.path.join(migrations_dir, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove comments to avoid false positives
    content_no_comments = re.sub(r'--.*', '', content)
    
    # Count DO $$ occurrences
    do_count = content_no_comments.count('DO $$')
    
    if do_count > 1:
        # Check if they are nested
        # Simple check: if we find DO $$ ... DO $$ ... END $$
        # This is hard to regex perfectly, but let's check indentation or just flagging files with multiple DOs
        print(f"File {filename} has {do_count} 'DO $$' blocks. Please check manually.")
        
        # Check for nested pattern
        if re.search(r'DO \$\$.*DO \$\$', content_no_comments, re.DOTALL):
             print(f"  !!! POTENTIAL NESTING DETECTED in {filename}")
