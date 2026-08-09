/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { webpack }) => {
    // wagmi's connectors barrel drags in Coinbase's Base Account SDK, which
    // imports a family of optional @x402/* modules we never use (we only use
    // the injected/OKX connector). Ignore the whole @x402/* namespace so the
    // build doesn't try to resolve them.
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// })
    );
    if (Array.isArray(config.externals)) {
      config.externals.push("pino-pretty", "lokijs", "encoding");
    }
    return config;
  },
};
export default nextConfig;
