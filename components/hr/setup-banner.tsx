import Link from "next/link";
import { AlertCircle } from "lucide-react";

/**
 * What HR needs before it can do anything, said once, at the top.
 *
 * Three states, in the order they happen: the tables are not there yet, the
 * rules migration is not there yet, or nobody has been imported. None is an
 * error the person caused, so none is red.
 */
export function HrSetupBanner({
  missingTable,
  missingRules,
  noDepartments,
}: {
  missingTable: boolean;
  missingRules?: boolean;
  noDepartments: boolean;
}) {
  if (missingTable) {
    return (
      <div className="flex items-start gap-2.5 rounded-sm bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <span>
          The HR tables do not exist yet, so nothing here can be saved. Run the{" "}
          <code>20260903_hr</code> and <code>20260903_hr_rules</code> migrations in the Supabase
          SQL editor first.
        </span>
      </div>
    );
  }
  if (missingRules) {
    return (
      <div className="flex items-start gap-2.5 rounded-sm bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <span>
          Groups, approval chains, breaks and floaters need the{" "}
          <code>20260903_hr_rules</code> migration. Run it in the Supabase SQL editor.
        </span>
      </div>
    );
  }
  if (noDepartments) {
    return (
      <div className="flex items-start gap-2.5 rounded-sm bg-brand-muted px-3 py-2 text-sm text-primary">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <span>
          No people or departments yet.{" "}
          <Link href="/hr/people?import=1" className="font-semibold underline">
            Import the Paychex export
          </Link>{" "}
          and both come in together.
        </span>
      </div>
    );
  }
  return null;
}
