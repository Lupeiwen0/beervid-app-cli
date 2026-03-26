import type { CAC } from 'cac'
import { loadConfig, saveConfig, getConfigPath } from '../config.js'

export function register(cli: CAC): void {
  cli
    .command('config', '设置 BEERVID_APP_KEY 等全局配置')
    .option('--app-key <key>', '设置 APP_KEY（持久化到 ~/.beervid/config.json）')
    .option('--base-url <url>', '设置 API 基础 URL')
    .option('--show', '显示当前配置')
    .action((options: { appKey?: string; baseUrl?: string; show?: boolean }) => {
      if (options.show) {
        const config = loadConfig()
        console.log(`配置文件: ${getConfigPath()}\n`)
        if (!config.appKey && !config.baseUrl) {
          console.log('（暂无配置）')
        } else {
          if (config.appKey) {
            const masked = config.appKey.length > 8
              ? config.appKey.slice(0, 4) + '****' + config.appKey.slice(-4)
              : '****'
            console.log(`APP_KEY:  ${masked}`)
          }
          if (config.baseUrl) {
            console.log(`BASE_URL: ${config.baseUrl}`)
          }
        }
        return
      }

      if (!options.appKey && !options.baseUrl) {
        console.error('请指定要设置的配置项，例如:\n')
        console.error('  beervid config --app-key <your-key>')
        console.error('  beervid config --base-url <url>')
        console.error('  beervid config --show')
        process.exit(1)
      }

      const config = loadConfig()

      if (options.appKey) {
        config.appKey = options.appKey
      }
      if (options.baseUrl) {
        config.baseUrl = options.baseUrl
      }

      saveConfig(config)
      console.log('配置已保存到', getConfigPath())
    })
}
