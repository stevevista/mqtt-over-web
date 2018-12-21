## MqttWebClient
### methods
- constructor(http url)
- publish(topic, message)
- subscribe(topic)
- unsubscribe(topic)
- subscribeAndListen(topic, callback(err, topic, message))


### events
- socket-open
- socket-error
- socket-close
- message
- connect
- reconnect
- offline
- close
- error

## Example
### On Web
```
import MqttClient from 'mqtt-over-web'

const client = new MqttClient('http://localhost/ws')
this.client.on('connect', () => {
  console.log('connected')
})

client.subscribeAndListen('/presence', function(err, topic, message) {
  if (err) {
    throw err
  }

  console.log(topic, message)
})

client.publish('./presence', 'my message')
 .then(() => {
   console.log('published')
 })

```
### On Server
```
const Router = require('koa-router')
const {MqttClient, brokeMqttOverSocket} = require('mqtt-over-web')

const router = new Router()

router.all('/ws', async ctx => {
  let client = new MqttClient({
      brokerUrl: 'x.x.x.x',
      username: '',
      password: ''
    })
  }

  brokeMqttOverSocket(client, ctx.websocket)
})

```
