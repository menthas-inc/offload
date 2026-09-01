/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // The tokens package is source-transpiled rather than prebuilt for the
  // browser, so Next has to compile it.
  transpilePackages: ["@offload/tokens"],
  poweredByHeader: false,
};
