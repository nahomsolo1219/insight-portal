/**
 * Mustache-style {{variable}} substitution. No logic, no loops — just
 * simple string replacement. Variables not present in the map are left
 * as-is (so the admin can spot missing data in test sends).
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return variables[key] ?? match;
  });
}
