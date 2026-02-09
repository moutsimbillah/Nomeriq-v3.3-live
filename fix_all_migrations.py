import os
import re

# Directory containing migration files
migrations_dir = 'supabase/migrations'

# Get all SQL files
sql_files = sorted([f for f in os.listdir(migrations_dir) if f.endswith('.sql')])

print(f"Found {len(sql_files)} migration files")

# Process each file
for filename in sql_files:
    filepath = os.path.join(migrations_dir, filename)
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    # Check if this file has standalone ALTER PUBLICATION statements (not in DO blocks)
    lines = content.split('\n')
    modified = False
    
    for i, line in enumerate(lines):
        # Check if line has ALTER PUBLICATION and is NOT already in a DO block
        if 'ALTER PUBLICATION supabase_realtime ADD TABLE' in line:
            # Look back 10 lines to see if we're in a DO block
            context = '\n'.join(lines[max(0, i-10):i])
            if 'DO $$' not in context or 'END $$' in context:
                # This is a standalone statement, needs wrapping
                match = re.search(r'ALTER PUBLICATION supabase_realtime ADD TABLE ([^;]+);', line)
                if match:
                    table_name = match.group(1)
                    # Replace this line with wrapped version
                    lines[i] = f'''DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE {table_name};
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;'''
                    modified = True
                    print(f"  Fixed: {filename} - wrapped ALTER PUBLICATION for {table_name}")
    
    if modified:
        # Write back the modified content
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))

print("\nAll migration files have been fixed!")
