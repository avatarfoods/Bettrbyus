<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Confirm / error windows

Never use `window.confirm`, `window.alert`, or a one-off modal for OK/Cancel. The plant gets one window everywhere.

Use `useConfirm()` from `@/components/ui/confirm-dialog`. `ConfirmProvider` already wraps the app in `AppFrame`.

```tsx
const confirm = useConfirm();

const ok = await confirm({
  title: "Remove the 500 counted on lot 08302026?",
  description: "It stops counting towards on hand.",
  confirmLabel: "OK",
  cancelLabel: "Cancel",
  tone: "danger",
});
if (!ok) return;
```

- `tone: "danger"` for irreversible actions (remove a count, delete a row).
- An error that only needs OK: pass `cancelLabel: false`.

