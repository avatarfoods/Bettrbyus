import Link from "next/link";
import { AlertCircle } from "lucide-react";

/**
 * What HR needs before it can do anything, said once, at the top.
 *
 * In the order they happen: the tables are not there yet, the rules
 * migration is not there yet, the day types are not there yet, or nobody has
 * been imported. None is an error the person caused, so none is red. Renders
 * nothing at all when there is nothing to say - no empty box, no stray gap.
 */
export function HrSetupBanner({
  missingTable,
  missingRules,
  missingAbsences,
  noDepartments,
  padded,
}: {
  missingTable: boolean;
  missingRules?: boolean;
  missingAbsences?: boolean;
  noDepartments: boolean;
  /** Give it the page's side padding when it sits above a settings table. */
  padded?: boolean;
}) {
  let body: React.ReactNode = null;
  let tone = "bg-warning-muted text-warning-foreground";
  if (missingTable) {
    body = (
      <>
        The HR tables do not exist yet, so nothing here can be saved. Run the <code>20260903_hr</code> and{" "}
        <code>20260903_hr_rules</code> migrations in the Supabase SQL editor first.
      </>
    );
  } else if (missingRules) {
    body = (
      <>
        Groups, approval chains, breaks and floaters need the <code>20260903_hr_rules</code> migration. Run it in the
        Supabase SQL editor.
      </>
    );
  } else if (missingAbsences) {
    body = (
      <>
        Off because - PTO, holidays, furlough, sick - needs the <code>20260903_hr_absences</code> migration. Run it in
        the Supabase SQL editor.
      </>
    );
  } else if (noDepartments) {
    tone = "bg-brand-muted text-primary";
    body = (
      <>
        No people or departments yet.{" "}
        <Link href="/hr/people?import=1" className="font-semibold underline">
          Import the Paychex export
        </Link>{" "}
        and both come in together.
      </>
    );
  }
  if (!body) return null;

  const banner = (
    <div className={`flex items-start gap-2.5 rounded-sm px-3 py-2 text-sm ${tone}`}>
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{body}</span>
    </div>
  );
  return padded ? <div className="px-3 pt-3 sm:px-4">{banner}</div> : banner;
}
