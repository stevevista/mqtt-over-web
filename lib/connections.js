const mqtt = require('mqtt')
const {PubSub, withFilter} = require('graphql-subscriptions')
const { makeExecutableSchema } = require('graphql-tools')

const clientOptions = {}
const clients = {}

const pubsub = new PubSub();

function connect(clientId, options) {
  let client = clients[clientId]
  if (client) {
    client.end()
    delete clients[clientId]
  }

  client = mqtt.connect(options.brokerUrl, {clientId, ...options})
  clients[clientId] = client
  clientOptions[clientId] = options
  
  client.on('close', () => {
    console.log('closed')
  })

  client.on('error', (e) => {
    console.log('error')
  })

  client.on('connect', () => {
    console.log('connected')
    pubsub.publish('mqttMessage', { clientId, mqttMessage: { 
      name: 'connect'
    }});
  })

  client.on('reconnect', () => {
    console.log('reconnect')
  })

  client.on('offline', () => {
    console.log('offline')
  })

  client.on('message', () => {
    console.log('message')
  })
  
  return client
}

function getClient(clientId, options) {
  let client = clients[clientId]
  if (client) {
    if (client.connected || !options) {
      return client
    }

    client.end()
    delete clients[clientId]
  }

  options = options || clientOptions[clientId]
  return connect(clientId, options)
}

const c = getClient('abc', {
  brokerUrl: 'mqtt://deepzone.top',
  username: 'sysadmin',
  password: '8bc6e71'
})

// setTimeout(() => c.end(), 1000)

setTimeout(() => {
  connect('abc', {
    brokerUrl: 'mqtt://deepzone.top',
    username: 'sysadmin',
    password: '8bc6e7'
  })
}, 5000)

const typeDefs = `
type MqttMessage {
  name: String!
}

type Subscription {
  mqttMessage(clientId: String!) : MqttMessage!
}
`;

const resolvers = {
  Subscription: {
    mqttMessage: {
      subscribe: withFilter(() => pubsub.asyncIterator('mqttMessage'), (payload, variables) => {
        return payload.clientId === variables.clientId;
      })
    }
  }
}

const executableSchema = makeExecutableSchema({
  typeDefs,
  resolvers,
})

module.exports = executableSchema
