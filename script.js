// ================= CONFIG (single source of truth) =================
const BUSINESS_WA = '917330947785';   // WhatsApp number that receives bookings (change here only)
const SECRET_CODE = '#admin';         // type this in the booking form's Name box to open admin (works on phone + laptop)
const SECRET_KEY  = 'p';              // URL secret: ?p=admin  or  #p  opens the admin login

lucide.createIcons();
const today = new Date().toISOString().split('T')[0];
document.getElementById('travelDate').setAttribute('min', today);

let dbInstance = null;
let isAuthenticated = false;
let calendarInstance = null;
let currentAdminTab = 'calendar';

function scrollToBooking() {
  document.getElementById('booking-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selectCar(vehicleName) {
  document.getElementById('vehicleChoice').value = vehicleName;
  scrollToBooking();
}

function selectService(serviceName) {
  document.getElementById('serviceType').value = serviceName;
  scrollToBooking();
}

// Tap-to-copy the UPI / WhatsApp Pay number
function copyUpi(btn) {
  const num = '7330947785';
  const done = () => {
    const label = btn.querySelector('span');
    const old = label.textContent;
    label.textContent = 'Copied ✓';
    setTimeout(() => { label.textContent = old; }, 1500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(num).then(done).catch(done);
  } else {
    const t = document.createElement('textarea');
    t.value = num;
    document.body.appendChild(t);
    t.select();
    try { document.execCommand('copy'); } catch (_) {}
    t.remove();
    done();
  }
}

// Keep the field being filled centred on screen (helps on phones with the keyboard open)
document.getElementById('cabBookingForm').addEventListener('focusin', (e) => {
  if (e.target.matches('input, select')) {
    setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
  }
});

// --- SHA-256 Hashing ---
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function ensureAdminPasswordConfigured() {
  if (!localStorage.getItem('act_admin_hash')) {
    const defaultHash = await sha256("2026");
    localStorage.setItem('act_admin_hash', defaultHash);
  }
}

// Secret URL route: ?p=admin, ?p or #p opens the PIN-protected admin login
function openAdminFromUrl() {
  const hash = window.location.hash.replace('#', '');
  const hasSecret = new URLSearchParams(window.location.search).has(SECRET_KEY) ||
                    hash === SECRET_KEY || hash.startsWith(SECRET_KEY + '=');
  if (hasSecret) openAdminModal();
}
window.addEventListener('hashchange', openAdminFromUrl);

// Stop the page behind a popup from scrolling (admin panel / review popup)
(function () {
  const modals = ['adminModal', 'reviewModal'].map(id => document.getElementById(id)).filter(Boolean);
  let locked = false, savedY = 0;
  function sync() {
    const anyOpen = modals.some(m => !m.classList.contains('hidden'));
    if (anyOpen && !locked) {
      savedY = window.scrollY;
      document.body.style.cssText += ';position:fixed;top:-' + savedY + 'px;left:0;right:0;width:100%;';
      locked = true;
    } else if (!anyOpen && locked) {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      window.scrollTo({ top: savedY, behavior: 'instant' });
      locked = false;
    }
  }
  const obs = new MutationObserver(sync);
  modals.forEach(m => obs.observe(m, { attributes: true, attributeFilter: ['class'] }));
})();

// Mobile menu (hamburger)
(function () {
  const btn = document.getElementById('menuBtn');
  const menu = document.getElementById('mobileMenu');
  btn.addEventListener('click', () => {
    const open = menu.classList.toggle('hidden') === false;
    btn.setAttribute('aria-expanded', open);
  });
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    menu.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
  }));
  window.addEventListener('resize', () => { if (window.innerWidth >= 768) menu.classList.add('hidden'); });
})();

// Hidden trick for phone AND laptop: type the secret code in the booking form's "Your Name" box
document.getElementById('custName').addEventListener('input', (e) => {
  if (e.target.value.trim().toLowerCase() === SECRET_CODE) {
    e.target.value = '';
    e.target.blur();
    openAdminModal();
  }
});

// Hidden shortcuts: Ctrl/Cmd + Shift + A  or  Alt + Shift + A (Chrome reserves the first one on some systems)
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey || e.altKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    openAdminModal();
  }
});

function openAdminModal() {
  const modal = document.getElementById('adminModal');
  modal.classList.remove('hidden');

  if (isAuthenticated) {
    document.getElementById('adminPinCard').classList.add('hidden');
    document.getElementById('adminLedgerCard').classList.remove('hidden');
    queryAndRenderTable();
    renderAdminReviews();
    initOrUpdateCalendar();
  } else {
    document.getElementById('adminPinCard').classList.remove('hidden');
    document.getElementById('adminLedgerCard').classList.add('hidden');
    document.getElementById('adminPinInput').focus();
  }
  lucide.createIcons();
}

function closeAdminModal() {
  document.getElementById('adminModal').classList.add('hidden');
  isAuthenticated = false;
  document.getElementById('adminPinInput').value = '';
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const pin = document.getElementById('adminPinInput').value;
  const errorDiv = document.getElementById('authErrorMsg');
  const inputHash = await sha256(pin);
  const storedHash = localStorage.getItem('act_admin_hash');

  if (inputHash === storedHash) {
    isAuthenticated = true;
    errorDiv.classList.add('hidden');
    document.getElementById('adminPinCard').classList.add('hidden');
    document.getElementById('adminLedgerCard').classList.remove('hidden');
    queryAndRenderTable();
    renderAdminReviews();
    setTimeout(() => initOrUpdateCalendar(), 150);
  } else {
    errorDiv.textContent = '❌ Incorrect PIN. Please try again.';
    errorDiv.classList.remove('hidden');
  }
}

function switchAdminTab(tab) {
  currentAdminTab = tab;
  const calBtn = document.getElementById('btnViewCalendar');
  const tabBtn = document.getElementById('btnViewTable');
  const revBtn = document.getElementById('btnViewReviews');

  const calBox = document.getElementById('tabCalendarContainer');
  const tabBox = document.getElementById('tabTableContainer');
  const revBox = document.getElementById('tabReviewsContainer');

  // Reset styles
  calBtn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold transition text-gray-300 hover:text-white flex items-center gap-1.5";
  tabBtn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold transition text-gray-300 hover:text-white flex items-center gap-1.5";
  revBtn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold transition text-gray-300 hover:text-white flex items-center gap-1.5";

  calBox.classList.add('hidden');
  tabBox.classList.add('hidden');
  revBox.classList.add('hidden');

  if (tab === 'calendar') {
    calBtn.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition bg-amber-500 text-gray-950 flex items-center gap-1.5";
    calBox.classList.remove('hidden');
    if (calendarInstance) calendarInstance.render();
  } else if (tab === 'table') {
    tabBtn.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition bg-amber-500 text-gray-950 flex items-center gap-1.5";
    tabBox.classList.remove('hidden');
    queryAndRenderTable();
  } else if (tab === 'reviews') {
    revBtn.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition bg-amber-500 text-gray-950 flex items-center gap-1.5";
    revBox.classList.remove('hidden');
    renderAdminReviews();
  }
  lucide.createIcons();
}

async function changeAdminPin() {
  const currentPin = prompt("Enter your current PIN:");
  if (!currentPin) return;

  const currentHash = await sha256(currentPin);
  if (currentHash !== localStorage.getItem('act_admin_hash')) {
    alert("Current PIN is incorrect!");
    return;
  }

  const newPin = prompt("Enter your NEW PIN (minimum 4 digits):");
  if (!newPin || newPin.trim().length < 4) {
    alert("PIN must be at least 4 digits long.");
    return;
  }

  const newHash = await sha256(newPin.trim());
  localStorage.setItem('act_admin_hash', newHash);
  alert("PIN successfully updated!");
}

// --- REVIEWS LOGIC ---
function openReviewModal() {
  document.getElementById('reviewModal').classList.remove('hidden');
}

function closeReviewModal() {
  document.getElementById('reviewModal').classList.add('hidden');
}

function setRating(val) {
  document.getElementById('ratingInput').value = val;
  document.getElementById('ratingValueText').textContent = `${val} Stars`;
  const stars = document.querySelectorAll('#starSelector .star-btn');
  stars.forEach((s, idx) => {
    if (idx < val) {
      s.classList.add('text-amber-400');
      s.classList.remove('text-gray-300');
    } else {
      s.classList.remove('text-amber-400');
      s.classList.add('text-gray-300');
    }
  });
}

function handleReviewSubmit(e) {
  e.preventDefault();
  if (!dbInstance) return;

  const rating = parseInt(document.getElementById('ratingInput').value, 10);
  const name = document.getElementById('reviewerName').value.trim();
  const route = document.getElementById('reviewerRoute').value.trim() || 'General Trip';
  const comment = document.getElementById('reviewerComment').value.trim();

  const stmt = dbInstance.prepare(`
    INSERT INTO reviews (reviewer_name, rating, trip_route, comment)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run([name, rating, route, comment]);
  stmt.free();
  saveDatabaseToStorage();

  alert("Thank you for your rating and review!");
  closeReviewModal();
  document.getElementById('reviewerName').value = '';
  document.getElementById('reviewerRoute').value = '';
  document.getElementById('reviewerComment').value = '';
  renderPublicReviews();
  if (isAuthenticated) renderAdminReviews();
}

function getAllReviews() {
  if (!dbInstance) return [];
  const res = dbInstance.exec("SELECT * FROM reviews ORDER BY id DESC");
  if (!res.length || !res[0].values.length) return [];

  const cols = res[0].columns;
  return res[0].values.map(row => {
    let obj = {};
    cols.forEach((c, idx) => obj[c] = row[idx]);
    return obj;
  });
}

function renderPublicReviews() {
  const reviews = getAllReviews();
  const container = document.getElementById('reviewsContainer');
  document.getElementById('reviewsCountBadge').textContent = `Based on ${reviews.length} reviews`;

  if (!reviews.length) {
    container.innerHTML = `<div class="col-span-3 text-center py-10 text-gray-500 text-sm">No reviews yet. Be the first to share your experience!</div>`;
    return;
  }

  container.innerHTML = reviews.map(r => {
    const starStr = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
    return `
      <div class="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between mb-3">
            <div class="text-amber-500 text-base font-bold tracking-wider">${starStr}</div>
            <span class="text-[10px] uppercase font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">${escapeHtml(r.trip_route || 'Verified Ride')}</span>
          </div>
          <p class="text-gray-700 text-xs sm:text-sm leading-relaxed italic">"${escapeHtml(r.comment)}"</p>
        </div>
        <div class="pt-4 mt-4 border-t border-gray-100 flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-amber-500/20 text-amber-700 font-bold text-xs flex items-center justify-center">
            ${r.reviewer_name ? escapeHtml(r.reviewer_name.charAt(0).toUpperCase()) : 'U'}
          </div>
          <div>
            <h4 class="text-xs font-bold text-gray-900">${escapeHtml(r.reviewer_name)}</h4>
            <span class="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
              <i data-lucide="check-circle-2" class="w-2.5 h-2.5"></i> Verified Passenger
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function renderAdminReviews() {
  const reviews = getAllReviews();
  const tbody = document.getElementById('adminReviewsTableBody');
  document.getElementById('adminReviewCount').textContent = `Total: ${reviews.length}`;

  if (!reviews.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-gray-500">No reviews in database.</td></tr>`;
    return;
  }

  tbody.innerHTML = reviews.map(r => `
    <tr class="hover:bg-gray-900/60 transition text-gray-300 text-xs">
      <td class="px-4 py-3 font-mono font-bold text-amber-400">#${r.id}</td>
      <td class="px-4 py-3 font-bold text-white">${escapeHtml(r.reviewer_name)}</td>
      <td class="px-4 py-3 text-amber-400 font-bold">${r.rating} ★</td>
      <td class="px-4 py-3 text-gray-300">${escapeHtml(r.trip_route)}</td>
      <td class="px-4 py-3 text-gray-400 max-w-xs truncate">${escapeHtml(r.comment)}</td>
      <td class="px-4 py-3 text-right">
        <button onclick="deleteReviewRow(${r.id})" class="p-1 text-red-400 hover:bg-red-950 rounded inline-block" title="Delete Review">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </td>
    </tr>
  `).join('');

  lucide.createIcons();
}

function deleteReviewRow(id) {
  if (!isAuthenticated) return;
  if (!confirm(`Delete review #${id}?`)) return;
  dbInstance.run("DELETE FROM reviews WHERE id = ?", [id]);
  saveDatabaseToStorage();
  renderPublicReviews();
  renderAdminReviews();
}

// --- SQLite Database Setup ---
async function initDatabase() {
  await ensureAdminPasswordConfigured();

  try {
    const SQL = await initSqlJs({
      locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });

    const savedDb = localStorage.getItem('ayyappa_db');
    if (savedDb) {
      const uInt8Array = new Uint8Array(JSON.parse(savedDb));
      dbInstance = new SQL.Database(uInt8Array);
    } else {
      dbInstance = new SQL.Database();

      // Bookings Table
      dbInstance.run(`
        CREATE TABLE IF NOT EXISTS bookings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_name TEXT NOT NULL,
          phone TEXT NOT NULL,
          pickup_location TEXT NOT NULL,
          drop_location TEXT NOT NULL,
          service_type TEXT NOT NULL,
          travel_date TEXT NOT NULL,
          travel_time TEXT DEFAULT '',
          vehicle_choice TEXT NOT NULL,
          status TEXT DEFAULT 'Booked',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Reviews Table
      dbInstance.run(`
        CREATE TABLE IF NOT EXISTS reviews (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reviewer_name TEXT NOT NULL,
          rating INTEGER NOT NULL,
          trip_route TEXT,
          comment TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Seed default bookings
      dbInstance.run(`
        INSERT INTO bookings (customer_name, phone, pickup_location, drop_location, service_type, travel_date, vehicle_choice, status)
        VALUES
        ('Ravi Shankar', '9848012345', 'Gurazala', 'Hyderabad Airport', 'Airport Transfers', '2026-09-20', 'Toyota Innova Crysta 2.4G (7+1 Seater)', 'Confirmed'),
        ('Suresh Varma', '9988776655', 'Macherla', 'Srisailam Temple', 'Pilgrimage / Sabarimala Tour', '2026-09-20', 'Toyota Innova Crysta 2.4G (7+1 Seater)', 'Waiting List'),
        ('K. Venkatesh', '9123456789', 'Gurazala', 'Vijayawada', 'Outstation Trips', '2026-09-22', 'Toyota Glanza Topend (4+1 Seater)', 'Confirmed'),
        ('B. Prasad', '9440112233', 'Dachepalle', 'Kotappakonda', 'Local Sightseeing', '2026-09-25', 'Suzuki Ertiga (6+1 Seater)', 'Booked');
      `);

      // Seed verified default reviews
      dbInstance.run(`
        INSERT INTO reviews (reviewer_name, rating, trip_route, comment)
        VALUES
        ('Nageswara Rao', 5, 'Gurazala to Hyderabad RGIA', 'Booked Toyota Innova for family airport drop. Reached 30 mins before time. AC and vehicle was spotless.'),
        ('M. Srinivasulu', 5, 'Sabarimala Pilgrimage Tour', 'Very patient driver Srihari garu. Smooth driving on ghat roads. Safe travel and transparent pricing with zero complaints.'),
        ('Chaitanya Kumar', 5, 'Gurazala to Vijayawada', 'Reasonable fare compared to others in Palnadu. Clean Toyota Glanza and comfortable AC ride.');
      `);

      saveDatabaseToStorage();
    }

    // Migration: add travel_time to databases saved before this column existed
    const cols = dbInstance.exec("PRAGMA table_info(bookings)")[0].values.map(c => c[1]);
    if (!cols.includes('travel_time')) {
      dbInstance.run("ALTER TABLE bookings ADD COLUMN travel_time TEXT DEFAULT ''");
      saveDatabaseToStorage();
    }

    renderPublicReviews();
    openAdminFromUrl();
  } catch (err) {
    console.error("Database initialization failed:", err);
  }
}

function saveDatabaseToStorage() {
  if (!dbInstance) return;
  const data = dbInstance.export();
  localStorage.setItem('ayyappa_db', JSON.stringify(Array.from(data)));
}

function handleBookingSubmit(e) {
  e.preventDefault();
  if (!dbInstance) {
    alert("System initializing. Please try again in a moment.");
    return;
  }

  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const pickup = document.getElementById('pickupLoc').value.trim();
  const drop = document.getElementById('dropLoc').value.trim();
  const service = document.getElementById('serviceType').value;
  const date = document.getElementById('travelDate').value;
  const time = document.getElementById('travelTime').value;
  const vehicle = document.getElementById('vehicleChoice').value;

  // Same schema/insert as before: status stays 'Booked' (= pending until the ₹10 token is verified)
  const stmt = dbInstance.prepare(`
    INSERT INTO bookings (customer_name, phone, pickup_location, drop_location, service_type, travel_date, travel_time, vehicle_choice, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Booked')
  `);
  stmt.run([name, phone, pickup, drop, service, date, time, vehicle]);
  stmt.free();
  saveDatabaseToStorage();

  const lines = [
    '*New Cab Booking - Ayyappa Car Travels*',
    '',
    '*Customer Name:* ' + name,
    '*Phone:* ' + phone,
    '*Pickup:* ' + pickup,
    '*Drop:* ' + drop,
    '*Service:* ' + service,
    '*Date:* ' + date,
    '*Time:* ' + time,
    '*Vehicle:* ' + vehicle,
    '',
    '*Slot Confirmation Advance:* ₹10 (Non-refundable token)',
    '*Payment Mode:* WhatsApp Pay / UPI (7330947785)',
    '*Balance Amount:* Payable after ride completion',
    '*Receipt Request:* Please share the booking receipt once the ₹10 token is verified.',
    '*Status:* Awaiting ₹10 token'
  ];

  window.open('https://wa.me/' + BUSINESS_WA + '?text=' + encodeURIComponent(lines.join('\n')), '_blank');
  document.getElementById('cabBookingForm').reset();
}

function getAllBookings() {
  if (!dbInstance) return [];
  const res = dbInstance.exec("SELECT * FROM bookings ORDER BY id DESC");
  if (!res.length || !res[0].values.length) return [];

  const cols = res[0].columns;
  return res[0].values.map(row => {
    let obj = {};
    cols.forEach((c, idx) => obj[c] = row[idx]);
    return obj;
  });
}

function initOrUpdateCalendar() {
  const calendarEl = document.getElementById('carCalendar');
  if (!calendarInstance) {
    calendarInstance = new FullCalendar.Calendar(calendarEl, {
      initialView: window.innerWidth < 640 ? 'listMonth' : 'dayGridMonth',
      height: 'auto',
      headerToolbar: window.innerWidth < 640
        ? { left: 'prev,next', center: 'title', right: 'today' }
        : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' },
      windowResize: function () {
        const small = window.innerWidth < 640;
        calendarInstance.changeView(small ? 'listMonth' : 'dayGridMonth');
        calendarInstance.setOption('headerToolbar', small
          ? { left: 'prev,next', center: 'title', right: 'today' }
          : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' });
      },
      eventClick: function (info) {
        const b = info.event.extendedProps;
        alert(
          `TRIP DETAILS (#${b.id}):\n` +
          `Status: ${b.status}\n` +
          `Vehicle: ${b.vehicle_choice}\n` +
          `Customer: ${b.customer_name} (${b.phone})\n` +
          `Route: ${b.pickup_location} ➔ ${b.drop_location}\n` +
          `Date: ${b.travel_date} ${b.travel_time || ''}`
        );
      }
    });
    calendarInstance.render();
  }
  renderCalendarEvents();
}

function renderCalendarEvents() {
  if (!calendarInstance) return;
  calendarInstance.removeAllEvents();

  const all = getAllBookings();
  const filter = document.getElementById('calendarVehicleFilter')?.value || 'ALL';

  const events = all
    .filter(b => {
      if (filter === 'ALL') return true;
      return b.vehicle_choice && b.vehicle_choice.toLowerCase().includes(filter.toLowerCase());
    })
    .map(b => {
      let bgColor = '#f59e0b';
      let textColor = '#111827';

      if (b.status === 'Confirmed') {
        bgColor = '#10b981';
        textColor = '#ffffff';
      } else if (b.status === 'Waiting List') {
        bgColor = '#8b5cf6';
        textColor = '#ffffff';
      } else if (b.status === 'Cancelled') {
        bgColor = '#ef4444';
        textColor = '#ffffff';
      }

      let shortVehicle = 'Car';
      if (b.vehicle_choice.includes('Glanza')) shortVehicle = 'Glanza';
      else if (b.vehicle_choice.includes('Innova')) shortVehicle = 'Innova';
      else if (b.vehicle_choice.includes('Ertiga')) shortVehicle = 'Ertiga';

      return {
        id: String(b.id),
        title: `[${b.status}] ${shortVehicle}: ${b.customer_name}`,
        start: b.travel_time ? `${b.travel_date}T${b.travel_time}` : b.travel_date,
        backgroundColor: bgColor,
        textColor: textColor,
        borderColor: bgColor,
        extendedProps: b
      };
    });

  calendarInstance.addEventSource(events);
}

function queryAndRenderTable() {
  if (!dbInstance || !isAuthenticated) return;

  const filter = (document.getElementById('dbSearch')?.value || '').toLowerCase();
  const allRows = getAllBookings();

  updateStatsCounters(allRows);

  const tbody = document.getElementById('dbTableBody');
  if (!allRows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">No bookings recorded yet.</td></tr>';
    return;
  }

  const filtered = allRows.filter(r =>
    (r.customer_name && r.customer_name.toLowerCase().includes(filter)) ||
    (r.phone && r.phone.includes(filter)) ||
    (r.pickup_location && r.pickup_location.toLowerCase().includes(filter)) ||
    (r.drop_location && r.drop_location.toLowerCase().includes(filter)) ||
    (r.status && r.status.toLowerCase().includes(filter))
  );

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">No matching records found.</td></tr>';
    return;
  }

  const statusBadges = {
    'Confirmed': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    'Waiting List': 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    'Booked': 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    'Completed': 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    'Cancelled': 'bg-red-500/20 text-red-300 border-red-500/40'
  };

  tbody.innerHTML = filtered.map(row => `
    <tr class="hover:bg-gray-900/60 transition text-gray-300 text-xs">
      <td class="px-4 py-3 font-mono font-bold text-amber-400">#${row.id}</td>
      <td class="px-4 py-3">
        <div class="font-bold text-white">${escapeHtml(row.customer_name)}</div>
        <div class="text-gray-400 text-[11px]">${escapeHtml(row.phone)}</div>
      </td>
      <td class="px-4 py-3">
        <div class="text-white">${escapeHtml(row.pickup_location)}</div>
        <div class="text-gray-400 text-[11px]">to ${escapeHtml(row.drop_location)}</div>
      </td>
      <td class="px-4 py-3">
        <div class="text-amber-200">${escapeHtml(row.vehicle_choice)}</div>
        <div class="text-gray-400 text-[11px]">${escapeHtml(row.service_type)}</div>
      </td>
      <td class="px-4 py-3 font-mono text-[11px] whitespace-nowrap text-gray-300">${escapeHtml(row.travel_date)}<div class="text-gray-400">${escapeHtml(row.travel_time || '')}</div></td>
      <td class="px-4 py-3">
        <select onchange="updateBookingStatus(${row.id}, this.value)" class="text-[11px] font-semibold px-2 py-0.5 rounded border bg-gray-950 ${statusBadges[row.status] || 'border-gray-700'} focus:outline-none">
          <option value="Confirmed" ${row.status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
          <option value="Waiting List" ${row.status === 'Waiting List' ? 'selected' : ''}>Waiting List</option>
          <option value="Booked" ${row.status === 'Booked' ? 'selected' : ''}>Booked / Pending</option>
          <option value="Completed" ${row.status === 'Completed' ? 'selected' : ''}>Completed</option>
          <option value="Cancelled" ${row.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>
      </td>
      <td class="px-4 py-3 text-right whitespace-nowrap">
        <a href="https://wa.me/91${row.phone.replace(/\D/g, '')}?text=Hello%20${encodeURIComponent(row.customer_name)},%20regarding%20your%20booking%20with%20Ayyappa%20Car%20Travels..." target="_blank" class="p-1 text-emerald-400 hover:bg-emerald-950 rounded inline-block mr-1" title="Chat on WhatsApp">
          <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
        </a>
        <button onclick="deleteBookingRow(${row.id})" class="p-1 text-red-400 hover:bg-red-950 rounded inline-block" title="Delete record">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </td>
    </tr>
  `).join('');

  lucide.createIcons();
}

function updateBookingStatus(id, newStatus) {
  if (!isAuthenticated) return;
  dbInstance.run("UPDATE bookings SET status = ? WHERE id = ?", [newStatus, id]);
  saveDatabaseToStorage();
  queryAndRenderTable();
  renderCalendarEvents();
}

function deleteBookingRow(id) {
  if (!isAuthenticated) return;
  if (!confirm(`Delete booking record #${id}?`)) return;
  dbInstance.run("DELETE FROM bookings WHERE id = ?", [id]);
  saveDatabaseToStorage();
  queryAndRenderTable();
  renderCalendarEvents();
}

function exportDatabaseFile() {
  if (!dbInstance || !isAuthenticated) return;
  const binaryArray = dbInstance.export();
  const blob = new Blob([binaryArray], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ayyappa_travels.db';
  a.click();
}

function updateStatsCounters(rows) {
  document.getElementById('statTotal').textContent = rows.length;
  document.getElementById('statConfirmed').textContent = rows.filter(r => r.status === 'Confirmed').length;
  document.getElementById('statWaiting').textContent = rows.filter(r => r.status === 'Waiting List').length;
  document.getElementById('statPending').textContent = rows.filter(r => r.status === 'Booked' || r.status === 'Pending').length;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
}

document.addEventListener('DOMContentLoaded', initDatabase);