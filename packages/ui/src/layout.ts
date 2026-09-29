export function shellGridRows(hasBanner: boolean): string {
  return hasBanner ? "auto auto minmax(0, 1fr) 220px" : "auto minmax(0, 1fr) 220px";
}
