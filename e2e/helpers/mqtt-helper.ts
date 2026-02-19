import mqtt, { MqttClient } from 'mqtt';

interface TopicAndPayload {
  topic: string;
  payload: string;
  messageId: number;
}

interface MqttConnectionData {
  mqttserverurl: string;
  username?: string;
  password?: string;
}

export class MqttHelper {
  private client: MqttClient | undefined;
  private tAndP: TopicAndPayload[] = [];
  private connectionData: MqttConnectionData | undefined;

  async connect(connectionData: MqttConnectionData): Promise<void> {
    this.connectionData = { ...connectionData };

    if (this.client?.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(connectionData.mqttserverurl, {
        username: connectionData.username,
        password: connectionData.password,
        clean: false,
        reconnectPeriod: 5000,
        clientId: 'm2mPlaywright',
      });

      this.client.on('error', (e) => {
        console.error('MQTT Helper error:', e.message);
        reject(e);
      });

      this.client.on('message', (topic, payload, packet) => {
        if (!this.tAndP.find((tp) => tp.messageId === packet.messageId)) {
          this.tAndP.push({
            topic,
            payload: payload.toString(),
            messageId: packet.messageId,
          });
        }
      });

      this.client.on('connect', () => {
        resolve();
      });
    });
  }

  async subscribe(topic: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    return new Promise((resolve, reject) => {
      this.client!.subscribe(topic, { qos: 1 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async publish(topic: string, payload: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    return new Promise((resolve, reject) => {
      this.client!.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  getTopicAndPayloads(): TopicAndPayload[] {
    return [...this.tAndP];
  }

  resetTopicAndPayloads(): void {
    this.tAndP = [];
  }

  async close(): Promise<void> {
    if (this.client) {
      return new Promise((resolve) => {
        this.client!.end(false, () => {
          this.client = undefined;
          resolve();
        });
      });
    }
  }
}
