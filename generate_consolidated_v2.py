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
        # Check if the file starts with DO $$ (ignoring comments/whitespace)
        stripped_content = re.sub(r'--.*', '', content) # remove comments
        stripped_content = re.sub(r'\s+', ' ', stripped_content).strip()
        
        # If the file seems to be a big DO block, don't touch it
        # Or if the ALTER statements are inside DO blocks
        
        # Better approach: split by lines and track if we are in a DO block? 
        # But DO block can span multiple lines.
        
        # Let's count $$ occurrences before the ALTER line
        matches = list(re.finditer(r'ALTER PUBLICATION supabase_realtime ADD TABLE ([^;]+);', content))
        
        last_idx = 0
        new_content_parts = []
        
        for match in matches:
            start = match.start()
            end = match.end()
            table_name = match.group(1)
            
            # Check context before this match
            pre_context = content[:start]
            
            # Count $$ in pre_context
            dollar_count = pre_context.count('$$')
            
            # If dollar_count is odd, we are inside a DO block (simplistic check but usually works for migrations)
            in_do_block = (dollar_count % 2 == 1)
            
            # Add content up to this match
            new_content_parts.append(content[last_idx:start])
            
            if in_do_block:
                # Already in DO block, keep as is
                new_content_parts.append(match.group(0))
            else:
                # Not in DO block, wrap it
                logging_check = f"Wrapping {table_name} in {filename}"
                # Check if it is already wrapped in BEGIN...EXCEPTION (but not DO)
                # This is rare in migrations unless manually written.
                # Assuming if not in DO $$, it needs wrapping.
                
                wrapped = f'''DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE {table_name};
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;'''
                new_content_parts.append(wrapped)
                
            last_idx = end
            
        new_content_parts.append(content[last_idx:])
        content = ''.join(new_content_parts)
        
    consolidated_content.append(f"-- ============================================\n-- Start of {filename}\n-- ============================================\n")
    consolidated_content.append(content)
    consolidated_content.append(f"\n-- ============================================\n-- End of {filename}\n-- ============================================\n\n")

# Write the final consolidated file
output_file = 'supabase/consolidated_migrations_fixed.sql'
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(''.join(consolidated_content))

print(f"Successfully created {output_file}")
