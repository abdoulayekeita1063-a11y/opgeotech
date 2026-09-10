export function feasibleCases<T extends { feasible: boolean }>(items: T[]) {
  return items.filter(item => item.feasible);
}
