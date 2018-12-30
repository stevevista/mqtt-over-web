const mqtt = require('mqtt')
const {PubSub, withFilter} = require('graphql-subscriptions')
const { makeExecutableSchema } = require('graphql-tools')
const EventEmitter = require('events')

function createGuid() {
  var id = 1
  return function () {
    return String(id++)
  }
}

const guid = createGuid()

const clients = {}

const pubsub = new PubSub();

class Client extends EventEmitter {
  constructor(options) {
    super()
    this.clientId = options.clientId

    this.onReady = this.createOnReady(options)

    clients[this.clientId] = this
  }

  createOnReady(options) {
    let inited = false
    let callbacks = []

    this._mqttClient = mqtt.connect(options.brokerUrl, options)

    this._mqttClient.on('connect', () => {
      this.notifyStatus('connect')
      if (!inited) {
        // resolve callbacks
        inited = true
        callbacks.forEach(cb => cb())
        callbacks = []
      }
    })

    this._mqttClient.on('error', (err) => {
      this.notify({
        name: 'error',
        message: err.message
      })
    })

    const events = ['close', 'reconnect', 'offline']
    events.forEach(evtName => {
      this._mqttClient.on(evtName, () => {
        this.notifyStatus(evtName)
      })
    })

    this._mqttClient.on('message', (topic, message) => {
      pubsub.publish('mqtt-message', { clientId: this.clientId, mqttMessage: { topic, message: message.toString()} });
    })

    return function (cb) {
      if (cb) {
        if (inited) {
          cb()
        } else {
          callbacks.push(cb)
        }
      }
    }
  }

  publish(topic, payload, options) {
    const actionId = guid()
    this.onReady(() => {
      this._mqttClient.publish(topic, payload, options, (err) => {
        if (err) this.notifyFailure(actionId, 'publish', err)
        else this.notifySuccess(actionId, 'publish')
      })
    })
    return actionId
  }

  subscribe(topic, qos) {
    const actionId = guid()
    this.onReady(() => {
      const options = typeof qos === 'number' ? {qos} : undefined
      this._mqttClient.subscribe(topic, options, (err) => {
        if (err) this.notifyFailure(actionId, 'subscribe', err)
        else this.notifySuccess(actionId, 'subscribe')
      })
    })
    return actionId
  }

  unsubscribe(topic) {
    const actionId = guid()
    this.onReady(() => {
      this._mqttClient.unsubscribe(topic, (err) => {
        if (err) this.notifyFailure(actionId, 'unsubscribe', err)
        else this.notifySuccess(actionId, 'unsubscribe')
      })
    })
    return actionId
  }

  end() {
    this._mqttClient.end()
    delete clients[this.clientId]
  }

  notify(mqttNotify) {
    pubsub.publish('mqtt-notify', { clientId: this.clientId, mqttNotify })
  }

  notifyStatus(status) {
    this.notify({
      name: 'status-change',
      status
    })
  }

  notifyFailure(actionId, actionName, err) {
    this.notify({
      name: 'failure',
      message: err.message,
      actionId,
      actionName
    })
  }

  notifySuccess(actionId, actionName) {
    this.notify({
      name: 'success',
      actionId,
      actionName
    })
  }
}

Client.get = function (clientId) {
  let client = clients[clientId]
  if (client) {
    return client
  }
}

Client.connect = function (options) {
  let client = clients[options.clientId]
  if (client) {
    client.end()
  }

  return new Client(options)
}

const typeDefs = `
type Query {
  name: String!
}

input ConnectOption {
  clientId: String!
  brokerUrl: String!
  username: String
  password: String
  keepalive: Int
  reconnectPeriod: Int
  connectTimeout: Int
}

input PubOption {
  qos: Int
  retain: Boolean
}

type Mutation {
  mqttConnect(option: ConnectOption!): Int!
  mqttSubscribe(clientId: String!, topic: [String!]!, qos: Int): Int!
  mqttPublish(clientId: String!, topic: String!, message: String!, option: PubOption): Int!
  mqttUnSubscribe(clientId: String!, topic: [String!]!): Int!
  mqttEnd(clientId: String!): Int!
}

type TopicMessage {
  topic: String!
  message: String!
}

type MQTTNotify {
  name: String!
  message: String
  actionId: Int
  actionName: String
  status: String
}

type Subscription {
  mqttMessage(clientId: String!): TopicMessage!
  mqttNotify(clientId: String!) : MQTTNotify!
}
`;

const resolvers = {
  Query: {
    name: () => 'test'
  },
  Mutation: {
    mqttConnect(_, { option }) {
      Client.connect(option)
      return 0
    },
    mqttSubscribe(_, { clientId, topic, qos }) {
      const c = Client.get(clientId)
      return c ? c.subscribe(topic, qos) : -1
    },
    mqttPublish(_, { clientId, topic, message, option }) {
      const c = Client.get(clientId)
      return c ? c.publish(topic, message, option) : -1
    },
    mqttUnSubscribe(_, { clientId, topic }) {
      const c = Client.get(clientId)
      return c ? c.unsubscribe(topic) : -1
    },
    mqttEnd(_, { clientId }) {
      const c = Client.get(clientId)
      if (c) {
        c.end()
      }
      return 0
    }
  },
  Subscription: {
    mqttMessage: {
      subscribe: withFilter(() => pubsub.asyncIterator('mqtt-message'), (payload, variables) => {
        return payload.clientId === variables.clientId;
      })
    },
    mqttNotify: {
      subscribe: withFilter(() => pubsub.asyncIterator('mqtt-notify'), (payload, variables) => {
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
