// TypeScript 6 rejects a side-effect import with no declaration behind it, and
// `import "./globals.css"` in the root layout is exactly that: the file exists
// for the bundler and has no type surface.
//
// next-env.d.ts does not cover it. That file only references next's own types,
// next/image-types, and the generated route types; CSS declarations came from
// the bundler's ambient types under TS 5 and are not enough for TS 6. It also
// says not to edit it, so the declaration lives here instead.
declare module "*.css";
