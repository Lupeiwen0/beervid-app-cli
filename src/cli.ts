import cac from 'cac'
import pkg from '../package.json' with { type: 'json' }
import { register as registerOauth } from './commands/oauth.js'
import { register as registerAccount } from './commands/account.js'
import { register as registerUpload } from './commands/upload.js'
import { register as registerPublish } from './commands/publish.js'
import { register as registerPollStatus } from './commands/poll-status.js'
import { register as registerQueryVideo } from './commands/query-video.js'
import { register as registerQueryProducts } from './commands/query-products.js'
import { register as registerPublishTtFlow } from './commands/publish-tt-flow.js'
import { register as registerPublishTtsFlow } from './commands/publish-tts-flow.js'
import { register as registerConfig } from './commands/config.js'

declare const __PKG_VERSION__: string

const cli = cac('beervid')
const cliVersion = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : pkg.version

registerConfig(cli)
registerOauth(cli)
registerAccount(cli)
registerUpload(cli)
registerPublish(cli)
registerPollStatus(cli)
registerQueryVideo(cli)
registerQueryProducts(cli)
registerPublishTtFlow(cli)
registerPublishTtsFlow(cli)

cli.help()
cli.version(cliVersion)

if (process.argv.slice(2).length === 0) {
  cli.outputHelp()
  process.exit(0)
}

cli.parse()
