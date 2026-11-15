// Shared by the Playwright runner and lab:capture's preflight. Keep browser selection and
// launch options here so the probe uses the same executable as the capture.
export const browserUse = { browserName: 'chromium', headless: true, launchOptions: {} }
