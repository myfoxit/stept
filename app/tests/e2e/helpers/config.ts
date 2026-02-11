import * as fs from 'fs';

export interface TestUrls {
  apiUrl: string;
  appUrl: string;
}

export function getTestUrls(): TestUrls {
  const configPath = process.env.TEST_PORT_CONFIG || '/tmp/playwright-test-ports.json';

  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return {
        apiUrl: `http://localhost:${config.apiPort}`,
        appUrl: `http://localhost:${config.appPort}`
      };
    }
  } catch (error) {
    console.warn('Could not read port config file, using environment/defaults');
  }

  return {
    apiUrl: process.env.API_URL || 'http://localhost:8000',
    appUrl: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173'
  };
}
