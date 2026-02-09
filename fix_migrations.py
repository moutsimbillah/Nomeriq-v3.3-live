import re

# Read the original file
with open('supabase/consolidated_migrations.sql', 'r', encoding='utf-8') as f:
    content = f.read()

# Only replace standalone ALTER PUBLICATION statements (not already in DO blocks)
# Look for ALTER PUBLICATION that's NOT preceded by BEGIN within the last 100 chars
lines = content.split('\n')
result_lines = []

for i, line in enumerate(lines):
    if 'ALTER PUBLICATION supabase_realtime ADD TABLE' in line and 'DO $$' not in '\n'.join(lines[max(0, i-5):i]):
        # This is a standalone ALTER PUBLICATION, wrap it
        match = re.search(r'ALTER PUBLICATION supabase_realtime ADD TABLE ([^;]+);', line)
        if match:
            table_name = match.group(1)
            result_lines.append(f'''DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE {table_name};
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;''')
        else:
            result_lines.append(line)
    else:
        result_lines.append(line)

# Write the fixed file
with open('supabase/consolidated_migrations_fixed.sql', 'w', encoding='utf-8') as f:
    f.write('\n'.join(result_lines))

print("Fixed SQL file created successfully!")
