export async function delay(timeMs: number) {
  return new Promise(resolve => setTimeout(resolve, timeMs))
}
