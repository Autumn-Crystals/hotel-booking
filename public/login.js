// login.js – Handles login and register form submissions
// Uses fetch API to talk to the backend, then redirects based on role

// ── Toast Notification System ──
// Shows a temporary message at the bottom-right of the screen
// type: 'success' | 'error' | 'info' | 'warning'
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');

  const iconNameMap = { success: 'checkCircle', error: 'xCircle', info: 'info', warning: 'alertTriangle' };
  const iconSvg = typeof getIcon === 'function' ? getIcon(iconNameMap[type] || 'info') : '•';

  // Create the toast element
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span style="display:flex;align-items:center;">${iconSvg}</span> <span>${message}</span>`;
  container.appendChild(toast);

  // Remove the toast after 3.5 seconds with a fade-out animation
  setTimeout(() => {
    toast.classList.add('hide');                         // CSS transition plays
    setTimeout(() => toast.remove(), 300);              // Remove from DOM after animation
  }, 3500);
}

// ── Tab Switcher ──
// Shows the correct tab panel and updates the active tab button
function switchTab(tabName) {
  // Hide all tab content panels
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  // Deactivate all tab buttons
  document.querySelectorAll('.tab-btn').forEach(el => {
    el.classList.remove('active');
    el.setAttribute('aria-selected', 'false');
  });

  // Show the selected panel and mark its button as active
  document.getElementById(`content-${tabName}`).classList.add('active');
  const btn = document.getElementById(`tab-${tabName}`);
  btn.classList.add('active');
  btn.setAttribute('aria-selected', 'true');
}

// ── Handle Login Form Submit ──
async function handleLogin(event) {
  event.preventDefault(); // Prevent default form submission (page reload)

  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn      = document.getElementById('login-btn');

  // Disable button to prevent double-clicks
  btn.disabled = true;
  btn.innerHTML = `${getIcon('spinner')} <span>Signing in…</span>`;

  try {
    // Send login credentials to the backend
    const res  = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      // Show error from server (e.g., "Invalid email or password")
      showToast(data.error, 'error');
      return;
    }

    showToast(`Welcome back, ${data.name}! Redirecting…`, 'success');

    // Redirect to the correct page based on the user's role
    setTimeout(() => {
      window.location.href = data.role === 'admin' ? '/admin.html' : '/guest.html';
    }, 800);

  } catch (err) {
    showToast('Network error. Is the server running?', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${getIcon('key')} <span>Sign In</span>`;
  }
}

// ── Handle Register Form Submit ──
async function handleRegister(event) {
  event.preventDefault();

  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const btn      = document.getElementById('register-btn');

  btn.disabled = true;
  btn.innerHTML = `${getIcon('spinner')} <span>Creating account…</span>`;

  try {
    const res  = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error, 'error');
      return;
    }

    showToast('Account created! Redirecting to your dashboard…', 'success');
    // Registration auto-logs in, so go to guest page
    setTimeout(() => { window.location.href = '/guest.html'; }, 900);

  } catch (err) {
    showToast('Network error. Is the server running?', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${getIcon('userPlus')} <span>Create Account</span>`;
  }
}

// ── Redirect if already logged in ──
// If user visits login page while already logged in, redirect them
(async function checkAlreadyLoggedIn() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      window.location.href = data.role === 'admin' ? '/admin.html' : '/guest.html';
    }
  } catch {
    // Not logged in – stay on login page (do nothing)
  }
})();
