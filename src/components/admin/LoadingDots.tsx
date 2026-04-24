/**
 * Three bouncing dots inline. Paired with a verb like "Saving" or "Uploading"
 * in pending-state button text so the user sees ongoing activity at a glance.
 * Colour inherits from the surrounding button via `bg-current`.
 */
export function LoadingDots() {
  return (
    <span className="ml-1 inline-flex items-center gap-0.5">
      <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
    </span>
  );
}
