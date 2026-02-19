import { test, expect } from '@playwright/test';
import { existsSync } from 'fs';
import { MqttHelper } from '../helpers/mqtt-helper';
import { PORTS, LOCALHOST, MQTT_AUTH_CONFIG } from '../helpers/ports';
import { runBusses, addSlave, addEntity, setUrls, saveSpecification, dismissAnnouncements } from '../helpers/app-helpers';
import { getTempDir } from '../helpers/temp-dir';
import { resetServer } from '../helpers/reset-helper';

test.describe('MQTT Discovery Tests', () => {
  test.beforeEach(async () => {
    await resetServer(PORTS.modbus2mqttAddon);
  });

  test('mqtt hassio addon discovery', async ({ page }) => {
    test.setTimeout(120_000);

    const prefix = 'ingress';
    await dismissAnnouncements(page);
    await page.goto(`http://${LOCALHOST}:${PORTS.nginxAddon}/${prefix}`);

    // Connect MQTT test client and subscribe to all topics
    const mqttHelper = new MqttHelper();
    await mqttHelper.connect(MQTT_AUTH_CONFIG);
    await mqttHelper.subscribe('#');
    mqttHelper.resetTopicAndPayloads();

    try {
      // Configure bus, slave, specification
      await runBusses(page, prefix);
      await addSlave(page, prefix);

      // Set specification name
      const nameInput = page.locator('#specForm [formcontrolname="name"]');
      await nameInput.fill('the spec');
      await nameInput.press('Enter');

      await setUrls(page);
      await addEntity(page, 1, 1);
      await addEntity(page, 2, 3);
      await saveSpecification(page);

      // Wait for MQTT discovery messages to arrive (CI can be slow)
      await expect
        .poll(() => mqttHelper.getTopicAndPayloads().find((tp) => tp.payload === 'online'), {
          timeout: 15_000,
          message: 'Waiting for "online" MQTT message',
        })
        .toBeTruthy();

      await expect
        .poll(() => mqttHelper.getTopicAndPayloads().find((tp) => tp.topic.endsWith('/state/')), {
          timeout: 15_000,
          message: 'Waiting for /state/ topic',
        })
        .toBeTruthy();

      await expect
        .poll(() => mqttHelper.getTopicAndPayloads().filter((tp) => tp.topic.startsWith('homeassistant/')), {
          timeout: 15_000,
          message: 'Waiting for 2 homeassistant discovery topics',
        })
        .toHaveLength(2);

      // Validate specification file was created on disk
      const tmpdir = getTempDir(String(PORTS.modbus2mqttAddon));
      const specFile = `${tmpdir}/modbus2mqtt/specifications/files/thespec/files.yaml`;
      // Wait up to 60s for file to appear
      await expect
        .poll(() => existsSync(specFile), { timeout: 60_000, message: `Waiting for ${specFile}` })
        .toBe(true);
    } finally {
      await mqttHelper.close();
    }
  });
});
