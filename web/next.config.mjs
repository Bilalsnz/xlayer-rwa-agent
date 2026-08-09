/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // wagmi's connectors barrel drags in Coinbase Base Account deps we don't use
    // (@x402/evm etc.). We only use the injected/OKX connector, so tell webpack
    // to treat these optional modules as empty instead of failing the build.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/evm": false,
      "@x402/express": false,
    };
    if (Array.isArray(config.externals)) {
      config.externals.push("pino-pretty", "lokijs", "encoding");
    }
    return config;
  },
};
export default nextConfig;
