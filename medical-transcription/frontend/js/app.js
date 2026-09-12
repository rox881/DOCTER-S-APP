/**
 * Main Application Bootstrap.
 * Initializes controllers and connects to local CPU WebSocket service.
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('[APP] Initializing Offline Medical Transcription Application...');

  // Initialize UI components
  window.uiController.init();
  window.transcriptController.init();

  // Connect to local WebSocket
  window.wsClient.connect();

  console.log('[APP] Initialization complete. Running on local machine.');
});
