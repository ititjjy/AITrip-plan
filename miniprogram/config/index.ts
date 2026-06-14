import type { UserConfig } from '@tarojs/cli'
import { UnifiedWebpackPluginV5 } from 'weapp-tailwindcss/webpack'

const config: UserConfig = {
  projectName: 'aitrip-miniprogram',
  date: '2026-6-11',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 3,
    750: 1,
    375: 2,
    828: 1.81 / 3,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  copy: {
    patterns: [
      { from: 'src/assets/', to: 'dist/assets/' },
    ],
    options: {},
  },
  compiler: {
    type: 'webpack5',
  },
  framework: 'react',
  ts: 'react',
  logger: {
    quiet: false,
    stats: true,
  },
  mini: {
    miniCssExtractPluginOption: {
      ignoreOrder: true,
    },
    postcss: {
      pxtransform: {
        enable: true,
        config: {
          selectorBlackList: ['tw-'],
        },
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]',
        },
      },
    },
    webpackChain(chain) {
      // 移除不兼容的 ProgressPlugin
      chain.plugins.delete('progressWebpackPlugin')
      chain.plugins.delete('progress')
      chain.merge({
        plugin: {
          install: {
            plugin: UnifiedWebpackPluginV5,
            args: [{
              appType: 'taro',
              rem2rpx: true,
            }],
          },
        },
      })
    },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    postcss: {
      autoprefixer: {
        enable: true,
        config: {},
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]',
        },
      },
    },
  },
}

export default config