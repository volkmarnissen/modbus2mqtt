import { test } from '@playwright/test';
import { PORTS, LOCALHOST } from '../helpers/ports';
import { runRegister, runConfig, runBusses, addSlave, dismissAnnouncements } from '../helpers/app-helpers';

test.describe('End to End Tests', () => {
  test('register->mqtt->busses->slaves->specification with authentication', async ({ page }) => {
    await runRegister(page, { authentication: true });
    await runConfig(page, { authentication: true });
    await runBusses(page);
    await addSlave(page);
  });

  test('register->mqtt with no authentication', async ({ page }) => {
    await runRegister(page, { authentication: false, port: PORTS.modbus2mqttNoAuth });
    await runConfig(page, { authentication: false });
  });

  test('mqtt hassio addon', async ({ page }) => {
    await dismissAnnouncements(page);
    await page.goto(`http://${LOCALHOST}:${PORTS.nginxAddon}/ingress`);
    await runBusses(page, 'ingress');
  });
});
