const mqtt = require('mqtt')

const BROKER = 'mqtt://emqx:1883'
const NO_PERMISSON_PUBLISH_TOPIC = '$SYS/no-permission-test/1'
const NO_PERMISSON_SUBSCRIBE_TOPIC = '$SYS/no-permission-test/1'
const SIMULATE_INTERVAL = 1000


function createClient(clientId = '', options = {}) {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(BROKER, {
      clientId,
      protocolVersion: 5,
      reconnectPeriod: 1000,
      ...options
    })
    client.on('connect', () => {
      console.log(`client ${clientId} connected`)
      resolve(client)
    }
    )
    client.on('error', (err) => {
      reject(err)
    }
    )
  })
}

main()

async function main() {

  const client2 = await createClient('mqtt-to-redis-simulate-session', {
    clean: false,
    protocolVersion: 4,
  })
  client2.subscribe('message-drop-test/expiry/+', () => {
    client2.end()
  })

  const clientList = []
  for (let i = 0; i < 10; i++) {
    const client = await createClient(`mqtt-to-redis-simulate-${i}`)
    clientList.push(client)
  }
  const startAt = Date.now()

  setInterval(() => {
    clientList.forEach((client) => {
      if (!client.connected) {
        return
      }
      const { clientId } = client.options
      // no permission to subscribe and publish
      client.subscribe(NO_PERMISSON_SUBSCRIBE_TOPIC)
      client.publish(NO_PERMISSON_PUBLISH_TOPIC, 'hello world')

      // message drop by no-subscribe
      client.publish(`message-drop-test/${clientId}`, 'hello world')

      // message drop by expiry
      client.publish(`message-drop-test/expiry/${clientId}`, 'hello world', {
        retain: true,
        properties: {
          messageExpiryInterval: 1
        }
      })

      // store last message
      client.publish(`store-last-message/${clientId}`, JSON.stringify({
        message: 'this is a stored message',
        clientId: clientId,
        duration: Math.floor((Date.now() - startAt) / 1000) + 's',
        temp: Math.random() * 50,
        hum: Math.random() * 100,
      }))

      if (Math.random() > 0.8) {
        // disconnect by frame too large(1KB)
        client.publish(`message-drop-test/${clientId}`, 'this is a large payload'.repeat(1024))
      } else if (Math.random() > 0.8) {
        // disconnect by bad topic
        client.publish('f/+', 'bad topic')
      } else if (Math.random() > 0.8) {
        // disconnect by disabled qos
        client.publish('t/1', { qos: 2 })
      }

    })
  }, SIMULATE_INTERVAL)
}