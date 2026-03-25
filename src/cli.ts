import cac from 'cac'
import { register as registerOauth } from './commands/oauth.js'
import { register as registerAccount } from './commands/account.js'
import { register as registerUpload } from './commands/upload.js'
import { register as registerPublish } from './commands/publish.js'
import { register as registerPollStatus } from './commands/poll-status.js'
import { register as registerQueryVideo } from './commands/query-video.js'
import { register as registerQueryProducts } from './commands/query-products.js'

const cli = cac('beervid')

registerOauth(cli)
registerAccount(cli)
registerUpload(cli)
registerPublish(cli)
registerPollStatus(cli)
registerQueryVideo(cli)
registerQueryProducts(cli)

cli.help()
cli.version('1.0.0')

if (process.argv.slice(2).length === 0) {
  cli.outputHelp()
  process.exit(0)
}

cli.parse()
