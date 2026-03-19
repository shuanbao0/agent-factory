/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (isServer) {
      // core-bridge.ts 用动态 require() 加载 core/ 模块，
      // webpack 无法静态分析，需要标记为 external 避免打包
      const path = require('path')
      const corePath = path.resolve(__dirname, '..', 'core')
      config.externals = config.externals || []
      config.externals.push(({ request }, callback) => {
        // 匹配 core/ 目录下的所有模块
        if (request === corePath || request?.startsWith?.(corePath + '/')) {
          return callback(null, `commonjs ${request}`)
        }
        callback()
      })
    }
    return config
  },
}

module.exports = nextConfig
