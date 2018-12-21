/* eslint no-undef:0 */
const isBrowser = (typeof window !== 'undefined' && typeof window.document !== 'undefined') || (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope)

if (isBrowser) {
  const MqttWebClient = require('./web-client')
  module.exports = MqttWebClient
} else {
  const brokeMqttOverSocket = require('./web-broke')
  const {MqttClient, AliClient} = require('./local-client')
  
  module.exports = {
    MqttClient,
    AliClient,
    brokeMqttOverSocket
  }  
}

/*
const {AliClient} = require('./local-client')
const device = new AliClient({
  "productKey": "a11vWRALINU",
  "deviceName": "AvQKEXmnxyrOc20vmZZB",
  "deviceSecret": "GTpahEdeOE4r1W3unpz3tF2Q3LA6Cx0r"
})

//device.on('connect', () => {
//  console.log('Connect successfully!');
  console.log('Post properties every 5 seconds...');
  setInterval(() => {
    const params = {
      Status: 1,
      Data: 'Hello, world!'
    };
    console.log(`Post properties: ${JSON.stringify(params)}`)
    device.postProps(params)
  }, 5000);
  
  device.serve('property/set', (data) => {
    console.log('Received a message: ', JSON.stringify(data))
  });
//});

device.on('error', err => {
  console.error(err);
})
*/
