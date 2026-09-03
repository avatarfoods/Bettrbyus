/**
 * Container types and the sizes the floor actually uses.
 *
 * 80 is here because beef is counted in 80 lb buckets, not only the 50/40/25
 * set the count chips started with.
 */

export const CONTAINER_LABELS = [
  "bucket",
  "cart",
  "pan",
  "bin",
  "case",
  "bag",
] as const;

export type ContainerLabel = (typeof CONTAINER_LABELS)[number];

export const COMMON_CONTAINER_SIZES = [80, 50, 40, 25, 20, 10, 5];

export function isContainerLabel(value: string): value is ContainerLabel {
  return (CONTAINER_LABELS as readonly string[]).includes(value);
}
