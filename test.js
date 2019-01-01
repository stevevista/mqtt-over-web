
const {Client} = require('./index')

const device = new Client({
  aliyun: true,
  "productKey": "a11vWRALINU",
  "deviceName": "AvQKEXmnxyrOc20vmZZB",
  "deviceSecret": "GTpahEdeOE4r1W3unpz3tF2Q3LA6Cx0r"
})


device.on('connect', () => {
  console.log('Connect successfully!');
  console.log('Post properties every 5 seconds...');
  setInterval(() => {
    const params = {
      Status: 1,
      Data: 'Hello, world!'
    };
    console.log(`Post properties: ${JSON.stringify(params)}`)
    device.postProps(params)
    .then(rsp => {
      console.log(rsp)
    })
  }, 5000);
  
  device.serve('property/set', (data) => {
    console.log('Received a message: ', JSON.stringify(data))
  });

  device.unsubscribe('#')
});


//device.serve('/#', (data) => {
//  console.log('Received a message: ', JSON.stringify(data))
//});

device.on('error', err => {
  console.error(err);
})

device.subscribeAndListen('#', (err, topic, message, matched, index) => {
  console.log(topic, matched, index)
})
