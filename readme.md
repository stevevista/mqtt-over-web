
## API
-------------------------------------------------------
### Client(options)

* `options` including:
  * `aliyun`: is this a aliyun iot client, default `false`
  * `brokerUrl`
  * `productKey`
  * `deviceName`
  * `deviceSecret`
  * `username`
  * `password`
  * `url`: [web side], websocket URL

#### Event `'connect'`
Emitted on successful (re)connection
#### Event `'reconnect'`
Emitted when a reconnect starts.
#### Event `'close'`
Emitted after a disconnection.
#### Event `'offline'`
Emitted when the client goes offline.
#### Event `'error'`
Emitted when the client cannot connect (i.e. connack rc != 0) or when a
parsing error occurs.
#### Event `'message'`

#### Web Side only events
- socket-open
- socket-error
- socket-close

`function (topic, message) {}`

Emitted when the client receives a publish packet
* `topic` topic of the received packet
* `message` payload of the received packet

-------------------------------------------------------
### Topic formatter
* `%s`
* `%d`
* `%j`
* `%product`: replace with productKey
* `%device`: replace with deviceName
* `%client`: replace with clientId
* `%user`: replace with username

```
client.publish('/sys/devices/%device/test', 'message')
```

-------------------------------------------------------
### Client#publish(topic, message, [options])

Publish a message to a topic, return a `Prmoise`

* `topic` is the topic to publish to, `String`
* `message` is the message to publish, `String`
* `options` is the options to publish with, including:
  * `qos` QoS level, `Number`, default `0`
  * `retain` retain flag, `Boolean`, default `false`
  * `dup` mark as duplicate flag, `Boolean`, default `false`
  * `properties`: MQTT 5.0 properties `object`
    * `payloadFormatIndicator`: Payload is UTF-8 Encoded Character Data or not `boolean`,
    * `messageExpiryInterval`: the lifetime of the Application Message in seconds `number`,
    * `topicAlias`: value that is used to identify the Topic instead of using the Topic Name `number`,
    * `responseTopic`: String which is used as the Topic Name for a response message `string`,
    * `correlationData`: used by the sender of the Request Message to identify which request the Response Message is for when it is received `binary`,
    * `userProperties`: The User Property is allowed to appear multiple times to represent multiple name, value pairs `object`,
    * `subscriptionIdentifier`: representing the identifier of the subscription `number`,
    * `contentType`: String describing the content of the Application Message `string`

-------------------------------------------------------
### Client#subscribe(topic, [options])

Subscribe to a topic, return `Promise`

* `topic` is a `String`.
  MQTT `topic` wildcard characters are supported (`+` - for single level and `#` - for multi level)
* `options` is the options to subscribe with, including:
  * `qos` qos subscription level, default 0
  * `nl` No Local MQTT 5.0 flag (If the value is true, Application Messages MUST NOT be forwarded to a connection with a ClientID equal to the ClientID of the publishing connection)
  * `rap` Retain as Published MQTT 5.0 flag (If true, Application Messages forwarded using this subscription keep the RETAIN flag they were published with. If false, Application Messages forwarded using this subscription have the RETAIN flag set to 0.)
  * `rh` Retain Handling MQTT 5.0 (This option specifies whether retained messages are sent when the subscription is established.)
  * `properties`: `object`
    * `subscriptionIdentifier`:  representing the identifier of the subscription `number`,
    * `userProperties`: The User Property is allowed to appear multiple times to represent multiple name, value pairs `object`

-------------------------------------------------------
### Client#unsubscribe(topic)

Unsubscribe from a topic, return `Promise`

-------------------------------------------------------
### Client#end([force])

Close the client, return `Promise`

* `force`: passing it to true will close the client right away, without
  waiting for the in-flight messages to be acked. This parameter is
  optional.

-------------------------------------------------------
### Client#subscribeAndListen(topic, callback)

Subscribe to a topic and listen, return a unscribable object

* `topic` is a `String`.
  MQTT `topic` wildcard characters are supported (`+` - for single level and `#` - for multi level)
* `callback(message)`

-------------------------------------------------------
### Client.sendMessage(clientArg, topic, message, optinos)

Publish message and then end connection
* `clientArg` options for create client connection

-------------------------------------------------------
## Aliyun Iot API
-------------------------------------------------------
### server(serviceName, [{productKey, deviceName}], callback)
-------------------------------------------------------
### Client#rpc(pubTopic, replyTopic, message, timeout = 10000)

public message and wait for response object on replyTopic, return as `Promise`

* `pubTopic`: publish topic
* `replyTopic`: reply topic which client subscribe for result
* `message`: `Object`
-------------------------------------------------------
### postProps([{productKey, deviceName}], params)
-------------------------------------------------------
### postEvent(eventName, [{productKey, deviceName}], params)
-------------------------------------------------------
### addTopo({productKey, deviceName, deviceSecret})
-------------------------------------------------------
### deleteTopo({productKey, deviceName})
-------------------------------------------------------
### getTopo()
-------------------------------------------------------
### login({productKey, deviceName, deviceSecret})
-------------------------------------------------------
### logout({productKey, deviceName})

-------------------------------------------------------
### brokeMqttOverSocket(client, socket, [incomingProcess], [outcomingProcess])
* `client`: Server side `Client`
* `socket`: WebSocket instance
* `incomingProcess`: function(topic, payload), convert received payload
* `outcomingProcess`: function(topic, payload), convert payload before publish

## Example
### On Web
```
import {Client} from 'mqtt-over-web'

const client = new Client('http://localhost/ws')
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
const {Client, brokeMqttOverSocket} = require('mqtt-over-web')

const router = new Router()

router.all('/ws', async ctx => {
  let client = new Client({
      brokerUrl: 'x.x.x.x',
      username: '',
      password: ''
    })
  }

  brokeMqttOverSocket(client, ctx.websocket)
})

```
