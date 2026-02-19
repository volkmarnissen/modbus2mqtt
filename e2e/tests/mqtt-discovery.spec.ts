import { test, expect } from '@playwright/test';
import { existsSync } from 'fs';
import { MqttHelper } from '../helpers/mqtt-helper';
import { PORTS, LOCALHOST, MQTT_AUTH_CONFIG } from '../helpers/ports';
import { runBusses, addSlave, addEntity, setUrls, saveSpecification, dismissAnnouncements } from '../helpers/app-helpers';
import { getTempDir } from '../helpers/temp-dir';

test.describe('MQTT Discovery Tests', () => {
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

      // Wait for Home Assistant discovery messages
      await page.waitForTimeout(1000);

      const messages = mqttHelper.getTopicAndPayloads();

      // Validate "online" status message
      const onlineIdx = messages.findIndex((tp) => tp.payload === 'online');
      expect(onlineIdx, 'Expected "online" message').not.toBe(-1);

      // Validate /state/ topic
      const stateIdx = messages.findIndex((tp) => tp.topic.endsWith('/state/'));
      expect(stateIdx, 'Expected /state/ topic').not.toBe(-1);

      // Validate exactly 2 homeassistant/ discovery topics
      const haTopics = messages.filter((tp) => tp.topic.startsWith('homeassistant/'));
      expect(haTopics.length, 'Expected 2 homeassistant discovery topics').toBe(2);

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
