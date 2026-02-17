import os
import re

# Directory containing migration files
migrations_dir = 'supabase/migrations'

# Get all SQL files
sql_files = sorted([f for f in os.listdir(migrations_dir) if f.endswith('.sql')])

print(f"Found {len(sql_files)} migration files")

consolidated_content = []

# Process each file
for filename in sql_files:
    filepath = os.path.join(migrations_dir, filename)
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check for ALTER PUBLICATION statements
    if 'ALTER PUBLICATION supabase_realtime ADD TABLE' in content:
        lines = content.split('\n')
        new_lines = []
        for i, line in enumerate(lines):
            if 'ALTER PUBLICATION supabase_realtime ADD TABLE' in line:
                # Check if this line is already inside a DO block / exception handler
                # Simple check: look at previous 5 lines for 'BEGIN' or 'EXCEPTION'
                context = '\n'.join(lines[max(0, i-10):i+1]) # include current line
                
                # If we see BEGIN and EXCEPTION nearby, assume it's handled
                if 'BEGIN' in context and ('EXCEPTION' in context or 'EXCEPTION' in '\n'.join(lines[i:min(len(lines), i+5)])):
                    new_lines.append(line)
                else:
                    # Not handled, wrap it
                    match = re.search(r'ALTER PUBLICATION supabase_realtime ADD TABLE ([^;]+);', line)
                    if match:
                        table_name = match.group(1)
                        new_lines.append(f'''DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE {table_name};
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;''')
                    else:
                        new_lines.append(line)
            else:
                new_lines.append(line)
        content = '\n'.join(new_lines)
        
    consolidated_content.append(f"-- ============================================\n-- Start of {filename}\n-- ============================================\n")
    consolidated_content.append(content)
    consolidated_content.append(f"\n-- ============================================\n-- End of {filename}\n-- ============================================\n\n")

# Write the final consolidated file
output_file = 'supabase/dev/consolidated_migrations_fixed.sql'
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(''.join(consolidated_content))

print(f"Successfully created {output_file} with {len(consolidated_content)} sections")
