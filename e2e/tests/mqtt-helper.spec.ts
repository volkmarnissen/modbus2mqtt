import { test, expect } from '@playwright/test';
import { MqttHelper } from '../helpers/mqtt-helper';
import { MQTT_AUTH_CONFIG } from '../helpers/ports';

test('mqtt helper can connect, subscribe, publish and receive', async () => {
  const mqttHelper = new MqttHelper();
  await mqttHelper.connect(MQTT_AUTH_CONFIG);
  await mqttHelper.subscribe('test/e2e/#');
  mqttHelper.resetTopicAndPayloads();

  await mqttHelper.publish('test/e2e/hello', 'world');
  // Wait for message to arrive
  await new Promise((r) => setTimeout(r, 500));

  const messages = mqttHelper.getTopicAndPayloads();
  expect(messages.length).toBeGreaterThanOrEqual(1);
  expect(messages.some((m) => m.topic === 'test/e2e/hello' && m.payload === 'world')).toBe(true);

  await mqttHelper.close();
});
