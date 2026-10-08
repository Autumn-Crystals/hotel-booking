// admin.js – All JavaScript for the Admin Dashboard
// Handles: auth check, stats, room CRUD, all bookings, cancel

// ─────────────────────────────────────────────
//  TOAST NOTIFICATION SYSTEM
// ─────────────────────────────────────────────

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const iconNameMap = { success: 'checkCircle', error: 'xCircle', info: 'info', warning: 'alertTriangle' };
  const iconSvg = typeof getIcon === 'function' ? getIcon(iconNameMap[type] || 'info') : '•';

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span style="display:flex;align-items:center;">${iconSvg}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ─────────────────────────────────────────────
//  AUTH CHECK ON PAGE LOAD
// ─────────────────────────────────────────────

// On load: verify the user is an admin; redirect if not
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = '/login.html';
      return;
    }
    const user = await res.json();

    // Block non-admin users from this page
    if (user.role !== 'admin') {
      window.location.href = '/guest.html';
      return;
    }

    document.getElementById('nav-username').textContent = user.name;

    // Load dashboard data
    loadStats();

  } catch (err) {
    window.location.href = '/login.html';
  }
});

// ─────────────────────────────────────────────
//  SIDEBAR NAVIGATION
// ─────────────────────────────────────────────

// showPanel: switches between Dashboard / Rooms / Bookings panels
function showPanel(panelName) {
  // Hide all panels
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  // Deactivate all sidebar links
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

  // Show selected panel
  document.getElementById(`panel-${panelName}`).classList.add('active');
  document.getElementById(`nav-${panelName}`).classList.add('active');

  // Load data for the panel if needed
  if (panelName === 'dashboard')  loadStats();
  if (panelName === 'rooms')      loadRooms();
  if (panelName === 'bookings')   loadAllBookings();
}

// ─────────────────────────────────────────────
//  LOGOUT
// ─────────────────────────────────────────────

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

// ─────────────────────────────────────────────
//  DASHBOARD STATS
// ─────────────────────────────────────────────

// loadStats: fetches summary numbers and fills the 4 stat cards
async function loadStats() {
  try {
    const res  = await fetch('/api/stats');
    const data = await res.json();
    if (!res.ok) { showToast(data.error, 'error'); return; }

    document.getElementById('stat-total-rooms').textContent    = data.totalRooms;
    document.getElementById('stat-active-bookings').textContent= data.activeBookings;
    document.getElementById('stat-occupancy').textContent      = `${data.occupancy}%`;
    // Format revenue as ₹ with Indian number formatting
    document.getElementById('stat-revenue').textContent = `₹${Number(data.totalRevenue).toLocaleString('en-IN')}`;

  } catch (err) {
    showToast('Failed to load stats.', 'error');
  }
}

// ─────────────────────────────────────────────
//  ROOMS MANAGEMENT
// ─────────────────────────────────────────────

// loadRooms: fetches all rooms (with today's status) and renders the list
async function loadRooms() {
  const container = document.getElementById('rooms-list-container');
  container.innerHTML = '<p style="color:var(--text-muted);padding:1rem;">Loading rooms…</p>';

  try {
    const res  = await fetch('/api/rooms');
    const data = await res.json();
    if (!res.ok) { showToast(data.error, 'error'); return; }

    if (data.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${getIcon('doubleBed')}</div>
          <p>No rooms added yet. Use the form above to add your first room.</p>
        </div>`;
      return;
    }

    // Render rooms as a table
    container.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Room No.</th>
              <th>Type</th>
              <th>Price/Night</th>
              <th>Description</th>
              <th>Status Today</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(room => `
              <tr>
                <td><strong>${room.room_no}</strong></td>
                <td>${room.type}</td>
                <td>₹${Number(room.price).toLocaleString('en-IN')}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${room.description}">${room.description}</td>
                <td>
                  <span class="status-badge ${room.status_today === 'Available' ? 'status-available' : 'status-booked'}">
                    ${room.status_today === 'Available' ? getIcon('checkCircle') : getIcon('clock')}
                    <span>${room.status_today}</span>
                  </span>
                </td>
                <td style="white-space:nowrap;">
                  <button class="btn btn-outline btn-sm" id="edit-room-${room.id}" onclick='startEditRoom(${JSON.stringify(room)})'>
                    ${getIcon('edit')} <span>Edit</span>
                  </button>
                  <button class="btn btn-danger btn-sm" id="del-room-${room.id}" onclick="deleteRoom(${room.id})">
                    ${getIcon('trash')} <span>Delete</span>
                  </button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

  } catch (err) {
    showToast('Failed to load rooms.', 'error');
  }
}

// saveRoom: handles both Add and Edit (checks if edit-room-id is set)
async function saveRoom() {
  const editId   = document.getElementById('edit-room-id').value;
  const room_no  = document.getElementById('room-no-input').value.trim();
  const type     = document.getElementById('room-type-input').value;
  const price    = document.getElementById('room-price-input').value;
  const description = document.getElementById('room-desc-input').value.trim();

  // Client-side validation (server also validates)
  if (!room_no || !price) {
    showToast('Room number and price are required.', 'warning');
    return;
  }

  const btn = document.getElementById('save-room-btn');
  btn.disabled = true;
  btn.innerHTML = `${getIcon('spinner')} <span>Saving…</span>`;

  try {
    // Determine if we're adding or editing
    const url    = editId ? `/api/rooms/${editId}` : '/api/rooms';
    const method = editId ? 'PUT' : 'POST';

    const res  = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_no, type, price: Number(price), description })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error, 'error');
      return;
    }

    showToast(data.message, 'success');
    cancelEdit();   // Reset the form
    loadRooms();    // Refresh the list

  } catch (err) {
    showToast('Network error. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${getIcon('check')} <span>Save Room</span>`;
  }
}

// startEditRoom: populates the form with the room's existing values for editing
function startEditRoom(room) {
  document.getElementById('edit-room-id').value      = room.id;
  document.getElementById('room-no-input').value     = room.room_no;
  document.getElementById('room-type-input').value   = room.type;
  document.getElementById('room-price-input').value  = room.price;
  document.getElementById('room-desc-input').value   = room.description;
  document.getElementById('room-form-title').innerHTML = `${getIcon('edit')} <span>Edit Room ${room.room_no}</span>`;
  document.getElementById('cancel-edit-btn').style.display = 'inline-flex';

  // Scroll to the form so the user can see it
  document.getElementById('room-no-input').scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('room-no-input').focus();
}

// cancelEdit: resets the room form back to "Add" mode
function cancelEdit() {
  document.getElementById('edit-room-id').value     = '';
  document.getElementById('room-no-input').value    = '';
  document.getElementById('room-price-input').value = '';
  document.getElementById('room-desc-input').value  = '';
  document.getElementById('room-type-input').value  = 'Single';
  document.getElementById('room-form-title').innerHTML = `${getIcon('plus')} <span>Add New Room</span>`;
  document.getElementById('cancel-edit-btn').style.display = 'none';
}

// deleteRoom: sends a DELETE request; server blocks if room has future bookings
async function deleteRoom(roomId) {
  const btn = document.getElementById(`del-room-${roomId}`);

  // Two-click confirmation pattern (same as guest cancel)
  if (btn.dataset.confirming) {
    btn.disabled = true;
    btn.innerHTML = `${getIcon('spinner')} <span>Deleting…</span>`;

    try {
      const res  = await fetch(`/api/rooms/${roomId}`, { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error, 'error');
        return;
      }

      showToast(data.message, 'success');
      loadRooms();    // Refresh list

    } catch (err) {
      showToast('Network error. Please try again.', 'error');
    }
  } else {
    btn.dataset.confirming = 'true';
    btn.innerHTML = `${getIcon('alertTriangle')} <span>Confirm?</span>`;
    btn.style.background = 'linear-gradient(135deg, #F59E0B, #D97706)';

    setTimeout(() => {
      if (btn) {
        delete btn.dataset.confirming;
        btn.innerHTML = `${getIcon('trash')} <span>Delete</span>`;
        btn.style.background = '';
      }
    }, 3000);
  }
}

// ─────────────────────────────────────────────
//  ALL BOOKINGS (ADMIN VIEW)
// ─────────────────────────────────────────────

// loadAllBookings: fetches every booking with guest and room details
async function loadAllBookings() {
  const container = document.getElementById('all-bookings-container');
  container.innerHTML = '<p style="color:var(--text-muted);padding:1rem;">Loading bookings…</p>';

  try {
    const res  = await fetch('/api/bookings');
    const data = await res.json();
    if (!res.ok) { showToast(data.error, 'error'); return; }

    if (data.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${getIcon('clipboard')}</div>
          <p>No bookings have been made yet.</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Guest</th>
              <th>Email</th>
              <th>Room</th>
              <th>Type</th>
              <th>Check-In</th>
              <th>Check-Out</th>
              <th>Total</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(b => `
              <tr>
                <td>#${b.id}</td>
                <td><strong>${b.guest_name}</strong></td>
                <td style="font-size:0.82rem;color:var(--text-muted);">${b.guest_email}</td>
                <td>Room ${b.room_no}</td>
                <td>${b.type}</td>
                <td>${formatDate(b.check_in)}</td>
                <td>${formatDate(b.check_out)}</td>
                <td><strong>₹${Number(b.total_price).toLocaleString('en-IN')}</strong></td>
                <td>
                  <button class="btn btn-danger btn-sm" id="admin-cancel-${b.id}" onclick="adminCancelBooking(${b.id})">
                    ${getIcon('xCircle')} <span>Cancel</span>
                  </button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

  } catch (err) {
    showToast('Failed to load bookings.', 'error');
  }
}

// adminCancelBooking: admin cancels any booking (not just their own)
async function adminCancelBooking(bookingId) {
  const btn = document.getElementById(`admin-cancel-${bookingId}`);

  if (btn.dataset.confirming) {
    btn.disabled = true;
    btn.innerHTML = `${getIcon('spinner')} <span>Cancelling…</span>`;

    try {
      const res  = await fetch(`/api/bookings/${bookingId}`, { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error, 'error');
        return;
      }

      showToast('Booking cancelled.', 'success');
      loadAllBookings();  // Refresh
      loadStats();        // Update occupancy numbers

    } catch (err) {
      showToast('Network error. Please try again.', 'error');
    }
  } else {
    btn.dataset.confirming = 'true';
    btn.innerHTML = `${getIcon('alertTriangle')} <span>Confirm?</span>`;
    btn.style.background = 'linear-gradient(135deg, #F59E0B, #D97706)';

    setTimeout(() => {
      if (btn) {
        delete btn.dataset.confirming;
        btn.innerHTML = `${getIcon('xCircle')} <span>Cancel</span>`;
        btn.style.background = '';
      }
    }, 3000);
  }
}

// ─────────────────────────────────────────────
//  UTILITY
// ─────────────────────────────────────────────

// formatDate: converts 'YYYY-MM-DD' to a readable format
function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}
