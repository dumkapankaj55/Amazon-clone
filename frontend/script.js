document.addEventListener('DOMContentLoaded', function () {
  // --- Client state and pagination ---
  const DEBUG = false; // set true to enable debug console messages
  let PAGE_LIMIT = 50;
  let products = []; // loaded products
  let offset = 0;
  let totalAvailable = null;
  let loading = false;
  let currentQuery = '';
  let currentCategory = '';
  let currentDeal = false;

  // --- Helpers: DOM refs ---
  const productGrid = document.getElementById('productGrid');
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('navCategorySelect');
  const cartCountEl = document.getElementById('cartCount');
  const cartOverlay = document.getElementById('cartOverlay');
  const cartItemsEl = document.getElementById('cartItems');
  const cartTotalEl = document.getElementById('cartTotal');
  const closeCart = document.getElementById('closeCart');
  const clearCart = document.getElementById('clearCart');
  const checkoutBtn = document.getElementById('checkoutBtn');

  // --- Cart state (localStorage) ---
  const CART_KEY = 'amezone_cart';
  let cart = JSON.parse(localStorage.getItem(CART_KEY) || '{}');

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartCount();
    // sync to backend (best effort)
    fetch('/cart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: cartToArray() }) }).catch(() => {});
  }

  function cartToArray() {
    return Object.keys(cart).map(id => ({ id, ...cart[id] }));
  }

  function updateCartCount() {
    const count = cartToArray().reduce((s, it) => s + (it.qty || 0), 0);
    if (cartCountEl) cartCountEl.textContent = String(count);
  }

  function addToCart(product) {
    if (!product) return;
    if (!cart[product.id]) cart[product.id] = { title: product.title, price: product.price, qty: 0, img: product.img };
    cart[product.id].qty += 1;
    saveCart();
    showToast(`${product.title} added to cart`);
  }

  // Toast queue helper (queues messages to avoid overlap)
  const toastQueue = [];
  let toastActive = false;
  function showToast(text, timeout = 1600) {
    toastQueue.push({ text, timeout });
    if (!toastActive) processToastQueue();
  }
  function processToastQueue() {
    const t = document.getElementById('toast');
    if (!t) { toastQueue.length = 0; return; }
    const next = toastQueue.shift();
    if (!next) { toastActive = false; t.classList.add('hidden'); return; }
    toastActive = true;
    t.textContent = next.text;
    t.classList.remove('hidden');
    setTimeout(() => {
      t.classList.add('hidden');
      setTimeout(() => processToastQueue(), 220);
    }, next.timeout);
  }

  // Update results counter
  function updateResultsCount() {
    const el = document.getElementById('resultsText');
    if (!el) return;
    const total = typeof totalAvailable === 'number' ? totalAvailable : '';
    el.textContent = total ? `${total} results` : '';
  }

  function removeFromCart(id) {
    delete cart[id];
    saveCart();
    renderCartItems();
  }

  function changeQty(id, qty) {
    if (!cart[id]) return;
    cart[id].qty = Math.max(0, qty);
    if (cart[id].qty === 0) delete cart[id];
    saveCart();
    renderCartItems();
  }

  // --- Render products ---
  function renderProductsAppend(list) {
    // append list to grid
    const frag = document.createDocumentFragment();
    list.forEach(p => {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.setAttribute('role', 'listitem');
      card.setAttribute('tabindex', '0');
      card.dataset.id = p.id;
      card.innerHTML = `
        <img src="${p.img}" alt="${p.title}" loading="lazy" />
        <div class="product-title">${p.title}</div>
        <div class="product-category">${p.category}</div>
        <div class="product-price">₹${p.price}</div>
        <div class="product-actions">
          <button class="btn add-cart" data-id="${p.id}" aria-label="Add ${p.title} to cart">Add to cart</button>
          <button class="btn details-btn" data-id="${p.id}" aria-label="View details for ${p.title}">Details</button>
        </div>
      `;
      frag.appendChild(card);
    });
    productGrid.appendChild(frag);

    // Wire add-to-cart buttons and details for newly added nodes
    productGrid.querySelectorAll('.add-cart').forEach(btn => {
      if (btn.dataset.bound) return; btn.dataset.bound = '1';
      btn.addEventListener('click', (ev) => {
        const id = btn.getAttribute('data-id');
        const prod = products.find(x => x.id === id);
        addToCart(prod);
        // animate button
        btn.classList.add('flash'); setTimeout(() => btn.classList.remove('flash'), 420);
        btn.textContent = 'Added ✓';
        setTimeout(() => btn.textContent = 'Add to cart', 900);
      });
    });
    productGrid.querySelectorAll('.details-btn').forEach(btn => {
      if (btn.dataset.bound) return; btn.dataset.bound = '1';
      btn.addEventListener('click', () => openDetails(btn.getAttribute('data-id')));
    });
  }

  async function fetchProductsPage(reset = false) {
    if (loading) return;
    loading = true;
    if (reset) {
      offset = 0; products = []; productGrid.innerHTML = ''; totalAvailable = null;
    }
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_LIMIT));
    params.set('offset', String(offset));
    if (currentQuery) params.set('q', currentQuery);
    if (currentCategory) params.set('category', currentCategory);
    if (currentDeal) params.set('deal', 'true');
    try {
      const res = await fetch(`/products?${params.toString()}`);
      const json = await res.json();
      const list = json.results || [];
      products = products.concat(list);
      renderProductsAppend(list);
      offset += list.length;
      totalAvailable = json.total;
      updateResultsCount();
      // hide load more if all loaded
      const loadMoreBtn = document.getElementById('loadMoreBtn');
        if (loadMoreBtn) {
          if (offset >= (totalAvailable || 0)) loadMoreBtn.style.display = 'none'; else loadMoreBtn.style.display = '';
        }
        updateResultsCount();
      return list;
    } catch (err) { if (DEBUG) console.error('fetch products failed', err); return []; }
    finally { loading = false; }
  }

  // --- Render category options ---
  async function populateCategories() {
    try {
      // fetch full list once to extract categories
      const res = await fetch('/products?limit=500&offset=0');
      const json = await res.json();
      const cats = Array.from(new Set((json.results || []).map(p => p.category))).sort();
      cats.forEach(c => { const opt = document.createElement('option'); opt.value = c; opt.textContent = c; categoryFilter.appendChild(opt); });
    } catch (err) { if (DEBUG) console.error(err); }
  }

  // --- Search / Filter ---
  // header search and category filter
  searchInput?.addEventListener('input', () => { currentQuery = searchInput.value.trim(); fetchProductsPage(true); });
  categoryFilter?.addEventListener('change', () => { currentCategory = categoryFilter.value; fetchProductsPage(true); });

  // Results-per-page selector
  const perPageSelect = document.getElementById('perPageSelect');
  perPageSelect?.addEventListener('change', () => {
    const v = parseInt(perPageSelect.value || '50', 10);
    PAGE_LIMIT = v;
    fetchProductsPage(true);
  });

  // Infinite scroll: load more when near bottom
  window.addEventListener('scroll', () => {
    if (loading) return;
    if (typeof totalAvailable === 'number' && offset >= totalAvailable) return;
    if ((window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 240)) {
      fetchProductsPage(false).catch(()=>{});
    }
  });

  // Load more
  document.getElementById('loadMoreBtn')?.addEventListener('click', () => fetchProductsPage(false));

  // Today's Deal button wiring
  document.querySelectorAll('.pannelop p').forEach(p => {
    p.addEventListener('click', () => {
      const txt = (p.textContent || '').toLowerCase();
      // if Today's Deal was clicked, enable deal filter and clear others
      if (txt.includes('today')) {
        currentDeal = true; currentQuery = ''; currentCategory = ''; if (searchInput) searchInput.value = ''; if (categoryFilter) categoryFilter.value = '';
      } else {
        // reset deal filter for other panel items
        currentDeal = false;
      }
      // mark active visibly
      document.querySelectorAll('.pannelop p').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      // fetch and render the product list (do not auto-open a detail)
      fetchProductsPage(true).then(() => {
        // scroll to product grid for user visibility
        const grid = document.getElementById('productGrid');
        if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }).catch(() => {});
    });
  });

  // Wire Gift Cards and Author buttons
  document.getElementById('giftCardsBtn')?.addEventListener('click', () => document.getElementById('giftModal')?.classList.remove('hidden'));
  document.getElementById('closeGift')?.addEventListener('click', () => document.getElementById('giftModal')?.classList.add('hidden'));
  document.getElementById('authorBtn')?.addEventListener('click', () => document.getElementById('authorModal')?.classList.remove('hidden'));
  document.getElementById('closeAuthor')?.addEventListener('click', () => document.getElementById('authorModal')?.classList.add('hidden'));

  // 'Shop deals in Electronics' click: filter to Electronics + deals
  const panelDealsEl = document.querySelector('.panneldeals');
  panelDealsEl?.addEventListener('click', () => {
    currentCategory = 'Electronics';
    currentDeal = true;
    currentQuery = '';
    if (searchInput) searchInput.value = '';
    if (categoryFilter) categoryFilter.value = 'Electronics';
    // clear active on small panel items and mark nothing (visual)
    document.querySelectorAll('.pannelop p').forEach(x => x.classList.remove('active'));
    // fetch and render electronics deals
    fetchProductsPage(true).then(() => {
      const grid = document.getElementById('productGrid');
      if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).catch(() => {});
  });

  // Contact modal wiring (re-added elements)
  const openContactBtnEl = document.getElementById('openContactBtn');
  const contactModalEl = document.getElementById('contactModal');
  const closeContactEl = document.getElementById('closeContact');
  const contactFormModalEl = document.getElementById('contactFormModal');
  const contactMsgModalEl = document.getElementById('contactMsgModal');
  const contactCancelEl = document.getElementById('contactCancel');

  openContactBtnEl?.addEventListener('click', () => contactModalEl?.classList.remove('hidden'));
  closeContactEl?.addEventListener('click', () => contactModalEl?.classList.add('hidden'));
  contactCancelEl?.addEventListener('click', () => contactModalEl?.classList.add('hidden'));
  contactFormModalEl?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(contactFormModalEl));
    fetch('/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(r => r.json()).then(() => { if (contactMsgModalEl) contactMsgModalEl.textContent = 'Thanks — message received'; contactFormModalEl.reset(); setTimeout(()=>contactModalEl?.classList.add('hidden'),900); })
      .catch(() => { if (contactMsgModalEl) contactMsgModalEl.textContent = 'Failed to send — try later'; });
  });

  // Wire Customer Service and Sell in top panel
  const customerServiceBtn = document.getElementById('customerService');
  const sellBtn = document.getElementById('sell');
  customerServiceBtn?.addEventListener('click', () => {
    // open contact modal for customer service
    document.getElementById('contactModal')?.classList.remove('hidden');
  });
  sellBtn?.addEventListener('click', () => {
    document.getElementById('sellModal')?.classList.remove('hidden');
  });
  document.getElementById('closeSell')?.addEventListener('click', () => document.getElementById('sellModal')?.classList.add('hidden'));

  // handle sell form submit (persist to users.json as demo)
  const sellForm = document.getElementById('sellForm');
  const sellMsg = document.getElementById('sellMsg');
  sellForm?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(sellForm));
    // reuse /signin endpoint for demo persistence of sellers
    fetch('/signin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(r => r.json()).then(() => { sellMsg.textContent = 'Thanks — your sell request has been received'; sellForm.reset(); setTimeout(()=>document.getElementById('sellModal')?.classList.add('hidden'),900); })
      .catch(() => { sellMsg.textContent = 'Failed to submit'; });
  });

  // gift form submit
  const giftForm = document.getElementById('giftForm');
  const giftMsg = document.getElementById('giftMsg');
  giftForm?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(giftForm));
    fetch('/gift', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(r => r.json()).then(() => { giftMsg.textContent = 'Gift saved'; giftForm.reset(); document.getElementById('giftModal')?.classList.add('hidden'); })
      .catch(() => { giftMsg.textContent = 'Failed to send gift'; });
  });

  // author search submit -> filter books by supplied string
  const authorForm = document.getElementById('authorForm');
  authorForm?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(authorForm));
    const q = (data.author || '').trim();
    // For demo, search across product titles and force category Books
    currentQuery = q; currentCategory = 'Books'; fetchProductsPage(true);
    document.getElementById('authorModal')?.classList.add('hidden');
  });

  // --- Cart UI ---
  function renderCartItems() {
    const items = cartToArray();
    cartItemsEl.innerHTML = items.length ? items.map(it => `
      <div class="cart-item" data-id="${it.id}">
        <img src="${it.img}" alt="${it.title}" />
        <div style="flex:1">
          <div>${it.title}</div>
          <div class="product-price">₹${it.price}</div>
        </div>
        <div>
          <input type="number" class="cart-qty" min="0" value="${it.qty}" style="width:60px" />
          <div><button class="btn remove" data-id="${it.id}">Remove</button></div>
        </div>
      </div>
    `).join('') : '<div>Your cart is empty</div>';

    // wire qty and remove
    cartItemsEl.querySelectorAll('.cart-qty').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const id = e.target.closest('.cart-item').getAttribute('data-id');
        changeQty(id, parseInt(e.target.value || '0', 10));
      });
    });
    cartItemsEl.querySelectorAll('.remove').forEach(btn => {
      btn.addEventListener('click', (e) => removeFromCart(btn.getAttribute('data-id')));
    });

    const total = items.reduce((s, it) => s + (it.price * (it.qty || 0)), 0);
    cartTotalEl.textContent = `₹${total}`;
  }

  // --- Cart overlay controls ---
  document.querySelectorAll('.navcart').forEach(el => el.addEventListener('click', () => {
    renderCartItems(); cartOverlay.classList.remove('hidden');
  }));
  closeCart?.addEventListener('click', () => cartOverlay.classList.add('hidden'));
  clearCart?.addEventListener('click', () => { cart = {}; saveCart(); renderCartItems(); });
  checkoutBtn?.addEventListener('click', () => { alert('Checkout is a demo — integrate payment gateway'); });

  // --- Bottom nav wiring ---
  const bnHome = document.getElementById('bnHome');
  const bnCategories = document.getElementById('bnCategories');
  const bnDeals = document.getElementById('bnDeals');
  const bnGift = document.getElementById('bnGift');
  const bnCart = document.getElementById('bnCart');
  const bnCartCount = document.getElementById('bnCartCount');

  function refreshBottomCart() { const c = cartToArray().reduce((s,it)=>s+(it.qty||0),0); if (bnCartCount) bnCartCount.textContent = String(c); }
  refreshBottomCart();

  // update bottom cart whenever cart changes
  const originalSaveCart = saveCart;
  saveCart = function() { originalSaveCart(); refreshBottomCart(); };

  bnHome?.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); currentDeal = false; currentQuery=''; currentCategory=''; if (searchInput) searchInput.value = ''; fetchProductsPage(true); });
  bnCategories?.addEventListener('click', () => { if (categoryFilter) categoryFilter.focus(); categoryFilter?.dispatchEvent(new Event('click')); });
  bnDeals?.addEventListener('click', () => { currentDeal = true; currentQuery=''; currentCategory=''; if (searchInput) searchInput.value = ''; fetchProductsPage(true); });
  bnGift?.addEventListener('click', () => document.getElementById('giftModal')?.classList.remove('hidden'));
  bnCart?.addEventListener('click', () => { renderCartItems(); cartOverlay.classList.remove('hidden'); });

  // --- Details modal ---
  const detailsModal = document.getElementById('detailsModal');
  const detailsTitle = document.getElementById('detailsTitle');
  const detailsBody = document.getElementById('detailsBody');
  const closeDetails = document.getElementById('closeDetails');
  const detailsAdd = document.getElementById('detailsAdd');
  let currentDetailsId = null;

  function openDetails(id) {
    let p = products.find(x => x.id === id);
    // if not loaded, fetch single product
    if (!p) {
      fetch(`/products/${id}`).then(r => r.json()).then(j => { p = j.product; showDetails(p); }).catch(()=>{}); return;
    }
    showDetails(p);
  }
  function showDetails(p) {
    if (!p) return;
    currentDetailsId = p.id;
    detailsTitle.textContent = p.title;
    // build a structured details layout
    detailsBody.innerHTML = `
      <div class="details-inner">
        <div class="details-image"><img src="${p.img}" alt="${p.title}" /></div>
        <div class="details-info">
          <div class="product-category">${p.category}</div>
          <div class="product-price">₹${p.price}</div>
          <div class="product-desc">Detailed description for <strong>${p.title}</strong>. This is a demo product. It includes basic specs and highlights. Use this area to show features, dimensions, or other details.</div>
          <div class="details-actions">
            <label for="qtyInput">Qty</label>
            <input id="qtyInput" class="qty" type="number" min="1" value="1" />
            <button id="detailsAdd" class="btn primary">Add to cart</button>
          </div>
        </div>
      </div>
    `;
    // ensure detailsAdd refers to the newly created button
    const newDetailsAdd = document.getElementById('detailsAdd');
    newDetailsAdd?.addEventListener('click', () => { const q = parseInt(document.getElementById('qtyInput')?.value || '1', 10); for (let i=0;i<q;i++){ const prod = products.find(x => x.id === currentDetailsId); if (prod) addToCart(prod); } detailsModal.classList.add('hidden'); });
    detailsModal.classList.remove('hidden');
  }
  closeDetails?.addEventListener('click', () => detailsModal.classList.add('hidden'));
  detailsAdd?.addEventListener('click', () => { if (currentDetailsId) { const p = products.find(x => x.id === currentDetailsId); addToCart(p); detailsModal.classList.add('hidden'); } });

  // --- Contact (modal and in-page) ---
  // contact elements may have been removed from DOM; attempt to reference if present
  const contactForm = document.getElementById('contactForm');
  const contactMsg = document.getElementById('contactMsg');
  const openContactBtn = document.getElementById('openContactBtn');
  const contactModal = document.getElementById('contactModal');
  const closeContact = document.getElementById('closeContact');
  const contactFormModal = document.getElementById('contactFormModal');
  const contactMsgModal = document.getElementById('contactMsgModal');
  const contactCancel = document.getElementById('contactCancel');

  // (debug modal removed) -- no-op placeholders removed

  // Location & Sign-in wiring
  const navAddress = document.getElementById('navAddress');
  const navSignin = document.getElementById('navSignin');
  const navReturn = document.querySelector('.navreturn');
  const returnsModal = document.getElementById('returnsModal');
  const closeReturns = document.getElementById('closeReturns');
  const returnsForm = document.getElementById('returnsForm');
  const returnsMsg = document.getElementById('returnsMsg');
  const locationModal = document.getElementById('locationModal');
  const closeLocation = document.getElementById('closeLocation');
  const locationForm = document.getElementById('locationForm');
  const countrySelect = document.getElementById('countrySelect');
  const signinModal = document.getElementById('signinModal');
  const closeSignin = document.getElementById('closeSignin');
  const signinForm = document.getElementById('signinForm');

  navAddress?.addEventListener('click', () => locationModal.classList.remove('hidden'));
  closeLocation?.addEventListener('click', () => locationModal.classList.add('hidden'));
  navSignin?.addEventListener('click', () => signinModal.classList.remove('hidden'));
  closeSignin?.addEventListener('click', () => signinModal.classList.add('hidden'));
  // Returns & Orders wiring (opens a small modal - demo)
  navReturn?.addEventListener('click', () => { returnsModal?.classList.remove('hidden'); });
  closeReturns?.addEventListener('click', () => { returnsModal?.classList.add('hidden'); returnsMsg.textContent = ''; });
  returnsForm?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(returnsForm));
    // Demo behavior: echo back the lookup
    const id = data.orderId || ''; const email = data.email || '';
    returnsMsg.textContent = `Lookup requested${id?(' for Order ID '+id):''}${email?(' and email '+email):''}. This is a demo.`;
    setTimeout(()=>returnsModal?.classList.add('hidden'), 1200);
  });

  // location submit -> store and send to backend
  locationForm?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(locationForm));
    localStorage.setItem('amezone_location', JSON.stringify(data));
    fetch('/location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).catch(()=>{});
    // update UI text
    const add2 = document.querySelector('.add2'); if (add2) add2.textContent = data.country || 'Location';
    locationModal.classList.add('hidden');
  });

  // signin submit -> send to backend and store locally
  signinForm?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(signinForm));
    fetch('/signin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(() => { localStorage.setItem('amezone_user', JSON.stringify(data)); signinModal.classList.add('hidden'); })
      .catch(()=>{ alert('Sign-in failed'); });
  });

  // wire floating button
  openContactBtn?.addEventListener('click', () => contactModal.classList.remove('hidden'));
  closeContact?.addEventListener('click', () => contactModal.classList.add('hidden'));
  contactCancel?.addEventListener('click', () => contactModal.classList.add('hidden'));

  // Delegate minimal button handling: if a button has `data-id`, open details for that product.
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.btn, .bn-btn');
    if (!btn) return;
    // ignore clicks that occur inside modal dialogs
    if (btn.closest('.cart-modal')) return;
    const pid = btn.getAttribute('data-id') || btn.dataset.id;
    if (pid) {
      ev.preventDefault();
      try { openDetails(pid); } catch (e) { if (DEBUG) console.error(e); }
    }
  });

  // submit handlers (both forms re-use /contact)
  function handleContactSubmit(form, msgEl) {
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      fetch('/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => r.json()).then(() => { if (msgEl) msgEl.textContent = 'Thanks — message received'; form.reset(); })
        .catch(() => { if (msgEl) msgEl.textContent = 'Failed to send — try later'; });
    });
  }
  if (contactForm) handleContactSubmit(contactForm, contactMsg);
  if (contactFormModal) handleContactSubmit(contactFormModal, contactMsgModal);

  // --- Init ---
  populateCategories().then(() => fetchProductsPage(true));
  updateCartCount();
});
