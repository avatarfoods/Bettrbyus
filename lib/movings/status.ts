export const MOVING_IN_STATUS = "available";
export const MOVING_OUT_STATUS = "removed";

export function formatMovingStatus(status: string | null | undefined): string {
  if (!status) return "—";
  return status.replace(/_/g, " ");
}
