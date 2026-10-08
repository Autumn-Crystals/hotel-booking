// guest.js – All JavaScript for the Guest Dashboard
// Handles: auth check, room search, booking modal, my bookings, cancel

// ─────────────────────────────────────────────
//  TOAST NOTIFICATION SYSTEM
// ─────────────────────────────────────────────

// showToast: displays a temporary message at the bottom-right
// type: 'success' | 'error' | 'info' | 'warning'
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

// When the page loads, verify the user is logged in and is a guest
// If not, redirect to login page immediately
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      // Not logged in – redirect to login
      window.location.href = '/login.html';
      return;
    }
    const user = await res.json();

    // Block admin from using guest page
    if (user.role === 'admin') {
      window.location.href = '/admin.html';
      return;
    }

    // Populate navbar with user's name
    document.getElementById('nav-username').textContent = user.name;

    // Set minimum check-in date to today (can't book in the past)
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('search-checkin').min  = today;
    document.getElementById('search-checkout').min = today;
    document.getElementById('search-checkin').value  = today;

    // Set default checkout to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('search-checkout').value = tomorrow.toISOString().split('T')[0];

    // Load the user's existing bookings
    loadMyBookings();

  } catch (err) {
    window.location.href = '/login.html';
  }
});

// Update checkout minimum whenever checkin changes
document.getElementById('search-checkin').addEventListener('change', function() {
  const checkoutInput = document.getElementById('search-checkout');
  checkoutInput.min = this.value;
  // If checkout is before or same as new checkin, push it forward
  if (checkoutInput.value <= this.value) {
    const d = new Date(this.value);
    d.setDate(d.getDate() + 1);
    checkoutInput.value = d.toISOString().split('T')[0];
  }
});

// ─────────────────────────────────────────────
//  LOGOUT
// ─────────────────────────────────────────────

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

// ─────────────────────────────────────────────
//  ROOM SEARCH
// ─────────────────────────────────────────────

// searchRooms: fetches available rooms from the backend and renders them as cards
async function searchRooms() {
  const type    = document.getElementById('search-type').value;
  const checkIn = document.getElementById('search-checkin').value;
  const checkOut= document.getElementById('search-checkout').value;
  const btn     = document.getElementById('search-btn');
  const results = document.getElementById('search-results');

  // Show loading state
  btn.disabled = true;
  btn.innerHTML = `${getIcon('spinner')} <span>Searching…</span>`;
  results.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:1rem;">Searching available rooms…</p>';

  try {
    // Build the query string from the search parameters
    const params = new URLSearchParams({ type, checkIn, checkOut });
    const res    = await fetch(`/api/rooms/available?${params}`);
    const data   = await res.json();

    if (!res.ok) {
      showToast(data.error, 'error');
      results.innerHTML = '';
      return;
    }

    // Render the results
    renderRoomCards(data, checkIn, checkOut);

  } catch (err) {
    showToast('Network error. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${getIcon('search')} <span>Search Rooms</span>`;
  }
}

// renderRoomCards: builds the room card HTML and inserts it into the DOM
function renderRoomCards(rooms, checkIn, checkOut) {
  const results = document.getElementById('search-results');

  // Show an empty state message if no rooms match
  if (rooms.length === 0) {
    results.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${getIcon('search')}</div>
        <p>No rooms available for these dates. Try different dates or room type.</p>
      </div>`;
    return;
  }

  // Map room type to SVG icon and CSS class
  const typeMap = {
    'Single': { icon: getIcon('bed'), cls: 'single' },
    'Double': { icon: getIcon('doubleBed'), cls: 'double' },
    'Suite':  { icon: getIcon('crown'), cls: 'suite' }
  };

  // Build a grid of room cards
  results.innerHTML = `
    <p style="color:var(--text-muted);margin-bottom:1rem;font-size:0.9rem;">
      ${rooms.length} room${rooms.length > 1 ? 's' : ''} available
    </p>
    <div class="grid-2">
      ${rooms.map(room => {
        const t = typeMap[room.type] || { icon: getIcon('bed'), cls: 'single' };
        return `
          <div class="room-card">
            <div class="room-card-header ${t.cls}">${t.icon}</div>
            <div class="room-card-body">
              <div class="room-no">Room ${room.room_no}</div>
              <div class="room-name">${room.type} Room</div>
              <div class="room-price">₹${room.price.toLocaleString('en-IN')} <span>/ night</span></div>
              <div class="room-desc">${room.description}</div>
              <button
                class="btn btn-primary btn-full"
                id="book-btn-${room.id}"
                onclick="openBookingModal(${room.id}, '${room.room_no}', '${room.type}', ${room.price}, '${checkIn}', '${checkOut}')"
              >
                ${getIcon('calendarCheck')}
                <span>Book Now</span>
              </button>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

// ─────────────────────────────────────────────
//  BOOKING MODAL
// ─────────────────────────────────────────────

// Store the booking data while the modal is open
let pendingBooking = null;

// openBookingModal: fills the modal with booking details and shows it
function openBookingModal(roomId, roomNo, type, price, checkIn, checkOut) {
  // Calculate the number of nights
  const msPerDay = 1000 * 60 * 60 * 24;
  const nights   = Math.round((new Date(checkOut) - new Date(checkIn)) / msPerDay);
  const total    = nights * price;

  // Store booking data so confirmBooking() can use it
  pendingBooking = { roomId, checkIn, checkOut };

  // Populate modal fields
  document.getElementById('modal-room-name').textContent      = `Room ${roomNo} (${type})`;
  document.getElementById('modal-checkin').textContent        = formatDate(checkIn);
  document.getElementById('modal-checkout').textContent       = formatDate(checkOut);
  document.getElementById('modal-nights').textContent         = `${nights} night${nights > 1 ? 's' : ''}`;
  document.getElementById('modal-price-per-night').textContent= `₹${price.toLocaleString('en-IN')}`;
  document.getElementById('modal-total').textContent          = `Total: ₹${total.toLocaleString('en-IN')}`;

  // Show the modal
  document.getElementById('booking-modal').classList.add('active');
}

// closeModal: hides the booking confirmation modal
function closeModal() {
  document.getElementById('booking-modal').classList.remove('active');
  pendingBooking = null;
}

// Close modal when clicking the dark overlay (outside the box)
document.getElementById('booking-modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// confirmBooking: sends the booking request to the server
async function confirmBooking() {
  if (!pendingBooking) return;

  const btn = document.getElementById('confirm-booking-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Confirming…';

  try {
    const res  = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId:   pendingBooking.roomId,
        checkIn:  pendingBooking.checkIn,
        checkOut: pendingBooking.checkOut
      })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error, 'error');
      return;
    }

    showToast(`Booking confirmed! Total: ₹${data.totalPrice.toLocaleString('en-IN')}`, 'success');
    closeModal();

    // Refresh bookings list and re-run search to update room availability
    loadMyBookings();
    searchRooms();

  } catch (err) {
    showToast('Network error. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${getIcon('checkCircle')} <span>Confirm Booking</span>`;
  }
}

// ─────────────────────────────────────────────
//  MY BOOKINGS
// ─────────────────────────────────────────────

// loadMyBookings: fetches the logged-in user's bookings and renders them as a table
async function loadMyBookings() {
  const container = document.getElementById('mybookings-container');

  try {
    const res  = await fetch('/api/bookings/mine');
    const data = await res.json();

    if (!res.ok) {
      container.innerHTML = `<p style="color:var(--danger);">${data.error}</p>`;
      return;
    }

    if (data.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${getIcon('calendar')}</div>
          <p>You haven't made any bookings yet. Search for a room above to get started!</p>
        </div>`;
      return;
    }

    // Render bookings as a responsive table
    container.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Room</th>
              <th>Type</th>
              <th>Check-In</th>
              <th>Check-Out</th>
              <th>Nights</th>
              <th>Total</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(b => {
              const nights = calcNights(b.check_in, b.check_out);
              return `
                <tr>
                  <td><strong>Room ${b.room_no}</strong></td>
                  <td>${b.type}</td>
                  <td>${formatDate(b.check_in)}</td>
                  <td>${formatDate(b.check_out)}</td>
                  <td>${nights}</td>
                  <td><strong>₹${b.total_price.toLocaleString('en-IN')}</strong></td>
                  <td>
                    <button class="btn btn-danger btn-sm" id="cancel-btn-${b.id}" onclick="cancelBooking(${b.id})">
                      ${getIcon('xCircle')}
                      <span>Cancel</span>
                    </button>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

  } catch (err) {
    container.innerHTML = `<p style="color:var(--danger);">Failed to load bookings.</p>`;
  }
}

// cancelBooking: sends a DELETE request to cancel a booking
async function cancelBooking(bookingId) {
  // Confirm before cancelling (using a custom check, not window.confirm)
  const btn = document.getElementById(`cancel-btn-${bookingId}`);
  if (btn.dataset.confirming) {
    // Second click – actually cancel
    btn.disabled = true;
    btn.innerHTML = `${getIcon('spinner')} <span>Cancelling…</span>`;

    try {
      const res  = await fetch(`/api/bookings/${bookingId}`, { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error, 'error');
        return;
      }

      showToast('Booking cancelled successfully.', 'success');
      loadMyBookings(); // Refresh the list

    } catch (err) {
      showToast('Network error. Please try again.', 'error');
    }
  } else {
    // First click – show confirmation state on the button
    btn.dataset.confirming = 'true';
    btn.innerHTML = `${getIcon('alertTriangle')} <span>Confirm cancel?</span>`;
    btn.style.background = 'linear-gradient(135deg, #F59E0B, #D97706)';

    // Reset after 3 seconds if user doesn't confirm
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
//  UTILITY FUNCTIONS
// ─────────────────────────────────────────────

// formatDate: converts 'YYYY-MM-DD' to a readable format like '15 Oct 2024'
function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

// calcNights: returns the number of nights between two 'YYYY-MM-DD' strings
function calcNights(checkIn, checkOut) {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((new Date(checkOut) - new Date(checkIn)) / msPerDay);
}
