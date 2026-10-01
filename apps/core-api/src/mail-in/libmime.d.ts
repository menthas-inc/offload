// 026. The one function the sender check uses from libmime, which ships no types.
declare module "libmime" {
  const libmime: { decodeWords(value: string): string };
  export default libmime;
}
