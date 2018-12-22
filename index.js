/* eslint no-undef:0 */
const isBrowser = (typeof window !== 'undefined' && typeof window.document !== 'undefined') || (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope)

if (isBrowser) {
  const Client = require('./lib/web-client')
  module.exports = {
    Client
  }
} else {
  const brokeMqttOverSocket = require('./lib/web-broke')
  const Client = require('./lib/local-client')
  
  module.exports = {
    Client,
    brokeMqttOverSocket
  }  
}
