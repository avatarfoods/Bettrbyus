"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The one OK / Cancel window.
 *
 * Browser `confirm()` and `alert()` are banned. Every "are you sure" and
 * every error that needs an acknowledgement goes through this, so the plant
 * never gets a native dialog on one page and a custom one on the next.
 */

export type ConfirmRequest = {
  title: string;
  description?: string;
  /** Default "OK". */
  confirmLabel?: string;
  /**
   * Default "Cancel". Pass `false` for an error that only needs OK.
   */
  cancelLabel?: string | false;
  /** `danger` is for irreversible actions (remove a count, delete a row). */
  tone?: "default" | "danger";
};

type ConfirmFn = (request: ConfirmRequest) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

type Pending = ConfirmRequest & {
  resolve: (ok: boolean) => void;
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback<ConfirmFn>((request) => {
    return new Promise((resolve) => {
      setPending((current) => {
        current?.resolve(false);
        return { ...request, resolve };
      });
    });
  }, []);

  function settle(ok: boolean) {
    setPending((current) => {
      if (!current) return null;
      current.resolve(ok);
      return null;
    });
  }

  const showCancel = pending != null && pending.cancelLabel !== false;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={pending != null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="z-[80] max-w-md rounded-sm p-4 sm:max-w-md"
          overlayClassName="z-[80]"
        >
          <DialogTitle className="text-base font-semibold leading-snug">
            {pending?.title}
          </DialogTitle>
          {pending?.description ? (
            <DialogDescription>{pending.description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">
              Confirm this action.
            </DialogDescription>
          )}
          <div className="mt-2 flex justify-end gap-2">
            {showCancel && (
              <Button
                type="button"
                variant="outline"
                className="rounded-sm"
                onClick={() => settle(false)}
              >
                {pending?.cancelLabel || "Cancel"}
              </Button>
            )}
            <Button
              type="button"
              variant={pending?.tone === "danger" ? "destructive" : "default"}
              className={cn(
                "rounded-sm",
                pending?.tone === "danger" &&
                  "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              )}
              onClick={() => settle(true)}
            >
              {pending?.confirmLabel ?? "OK"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm() must be used inside ConfirmProvider.");
  }
  return confirm;
}
