// Shared nav: login/logout, Modules dropdown (logged-in only), hide Plans when paid
function initNavModules() {
  const modulesWrap = document.getElementById('modulesDropdownWrap');
  const loginLink = document.getElementById('loginLink');
  const logoutBtn = document.getElementById('logoutButton');
  const plansLink = document.getElementById('plansLink');
  const dashboardLink = document.getElementById('dashboardLink');
  (async function run() {
  try {
    const [authRes, courseRes, paymentRes] = await Promise.all([
      fetch('/api/auth/check', { credentials: 'include' }),
      fetch('/api/course', { credentials: 'include' }),
      fetch('/api/payment/status', { credentials: 'include' })
    ]);
    const auth = (await authRes.json()).authenticated;
    const payment = (await paymentRes.json()).hasPayment;
    const course = (await courseRes.json());
    const modules = (course.modules || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // Login/logout visibility
    if (loginLink) loginLink.style.display = auth ? 'none' : 'block';
    if (logoutBtn) {
      logoutBtn.style.display = auth ? 'block' : 'none';
      logoutBtn.onclick = () => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(() => location.href = '/login.html');
    }
    if (plansLink) plansLink.style.display = (auth || !payment) ? 'block' : 'none';
    // Dashboard: only for paid users; ensure click navigates
    if (dashboardLink) {
      dashboardLink.style.display = (auth && payment) ? 'block' : 'none';
      dashboardLink.href = '/dashboard';
      dashboardLink.onclick = function(e) {
        e.preventDefault();
        window.location.href = '/dashboard';
      };
    }

    if (!modulesWrap) return;
    if (!auth) {
      modulesWrap.style.display = 'none';
      return;
    }
    modulesWrap.style.display = 'block';
    const btn = document.getElementById('modulesDropdownBtn');
    const menu = document.getElementById('modulesDropdownMenu');
    if (!btn || !menu) return;
    if (btn.tagName === 'BUTTON') {
      const a = document.createElement('a');
      a.href = '/modules';
      a.className = btn.className;
      a.id = 'modulesDropdownBtn';
      a.textContent = 'Tools ▾';
      a.style.textDecoration = 'none';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/modules';
      });
      btn.parentNode.replaceChild(a, btn);
    }
    menu.innerHTML = '';
    modules.forEach((mod, i) => {
      const id = mod.id || ('module-' + i);
      const a = document.createElement('a');
      a.href = '/module/' + encodeURIComponent(id);
      a.textContent = mod.title;
      menu.appendChild(a);
    });
    let hideTimer;
    modulesWrap.addEventListener('mouseenter', () => {
      clearTimeout(hideTimer);
      menu.classList.add('show');
    });
    modulesWrap.addEventListener('mouseleave', () => {
      hideTimer = setTimeout(() => menu.classList.remove('show'), 100);
    });
  } catch (e) { console.error('nav-modules:', e); }
  })();
}
document.addEventListener('DOMContentLoaded', initNavModules);
