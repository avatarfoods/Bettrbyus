/**
 * POs arrive on Thursdays and cover the following week's production
 * (Monday through Friday or Saturday) - so the demand window for a cycle
 * defaults to the Monday right after its required/arrival date, through
 * that same week's Saturday. Always editable per cycle from there.
 */
export function defaultDemandRange(requiredDateIso: string): {
  fromDate: string;
  toDate: string;
} {
  const required = new Date(`${requiredDateIso}T00:00:00Z`);
  const daysToMonday = ((1 - required.getUTCDay() + 7) % 7) || 7;
  const monday = new Date(required);
  monday.setUTCDate(monday.getUTCDate() + daysToMonday);
  const saturday = new Date(monday);
  saturday.setUTCDate(saturday.getUTCDate() + 5);
  return {
    fromDate: monday.toISOString().slice(0, 10),
    toDate: saturday.toISOString().slice(0, 10),
  };
}
