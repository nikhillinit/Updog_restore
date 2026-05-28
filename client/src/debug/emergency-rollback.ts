export interface EmergencyRollbackWindow extends Window {
  __FORCE_LEGACY_STATE?: boolean;
}

function getRollbackWindow(): EmergencyRollbackWindow {
  return window as EmergencyRollbackWindow;
}

function showEmergencyRollbackNotification() {
  const notification = document.createElement('div');
  notification.innerHTML = `
    <div style="position: fixed; top: 10px; right: 10px; z-index: 9999; background: #ff4444; color: white; padding: 12px 16px; border-radius: 4px; font-family: monospace; max-width: 300px;">
      [CRITICAL] Emergency Mode Active<br>
      <small>Using legacy state system. Contact support if this persists.</small>
    </div>
  `;
  document.body.appendChild(notification);

  setTimeout(() => notification.remove(), 10000);
}

export function checkEmergencyRollback() {
  try {
    const rollbackWindow = getRollbackWindow();
    const urlParams = new URLSearchParams(rollbackWindow.location.search);
    if (urlParams.get('emergency_rollback') === 'true') {
      rollbackWindow.__FORCE_LEGACY_STATE = true;
      console.warn('[CRITICAL] Emergency rollback activated via URL parameter');
      return;
    }

    if (rollbackWindow.localStorage.getItem('emergency_rollback') === 'true') {
      rollbackWindow.__FORCE_LEGACY_STATE = true;
      console.warn('[CRITICAL] Emergency rollback activated via localStorage');
      showEmergencyRollbackNotification();
    }
  } catch (error) {
    console.warn('Emergency rollback check failed:', error);
  }
}
