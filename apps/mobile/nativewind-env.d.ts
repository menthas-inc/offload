/// <reference types="nativewind/types" />

// TypeScript 6 rejects a side-effect import with no declaration behind it, and
// `import "../global.css"` in the root layout is exactly that: the file exists
// for Metro and the NativeWind transform, and has no type surface at all.
declare module "*.css";
